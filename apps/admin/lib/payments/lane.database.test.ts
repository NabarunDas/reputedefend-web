import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

async function fails(sql: string): Promise<string> {
  try {
    await db.exec(sql)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error("statement succeeded")
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
}, 180000)

afterAll(async () => { await db.close() })

describe("payment lane isolation", () => {
  it("keeps an unset lane on test livemode and refuses a live object", async () => {
    expect((await rows<{ expected: boolean }>("select admin_private.payment_expected_livemode_v1() as expected"))[0].expected).toBe(false)
    expect(await fails(
      `insert into public.provider_operations(idempotency_key, kind, purpose, livemode, status)
       values (gen_random_uuid(), 'CREATE_RECURRING_PRICE', 'GUARD_PRICE', true, 'PENDING')`,
    )).toMatch(/livemode_mismatch/)
    const created = await rows<{ livemode: boolean }>(
      `insert into public.provider_operations(idempotency_key, kind, purpose, status)
       values (gen_random_uuid(), 'CREATE_RECURRING_PRICE', 'GUARD_PRICE', 'PENDING')
       returning livemode`,
    )
    expect(created[0].livemode).toBe(false)
  })

  it("denies a live webhook before any receipt or outbox row, and replays only the same mode", async () => {
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_lane_live", "payment_intent.succeeded", "pi_lane_live", true])).toMatchObject({
      status: "denied",
      reason: "livemode",
    })
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts")).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.job_outbox where topic = 'PROCESS_STRIPE_EVENT'")).toBe(0)
    expect(await rpc("payment_apply_provider_event_v1", ["evt_lane_apply", "payment_intent.succeeded", "pi_lane_apply", { livemode: true }])).toMatchObject({
      status: "denied",
      reason: "livemode",
    })
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_lane_apply'")).toBe(0)

    expect(await rpc("payment_receive_stripe_event_v1", ["evt_lane_test", "checkout.session.completed", "cs_lane_test", false])).toMatchObject({
      status: "success",
      duplicate: false,
    })
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_lane_test", "checkout.session.completed", "cs_lane_test", false])).toMatchObject({
      status: "success",
      duplicate: true,
    })
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_lane_test", "checkout.session.completed", "cs_lane_test", true])).toMatchObject({
      status: "denied",
      reason: "livemode",
    })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_lane_test'")).toBe(1)
    expect((await rows<{ livemode: boolean; processed: boolean }>(
      "select livemode, processed from admin_private.stripe_event_receipts where provider_event_id = 'evt_lane_test'",
    ))[0]).toEqual({ livemode: false, processed: false })
  })

  it("refuses to mark a database live while test rows exist, then isolates a cleared live lane", async () => {
    expect(await rpc("admin_set_payment_provider_lane_v1", ["stripe_live"])).toMatchObject({
      status: "denied",
      reason: "mixed_livemode",
    })
    await db.exec(`
      delete from admin_private.job_outbox;
      delete from admin_private.stripe_event_receipts;
      delete from public.provider_operations;
    `)
    expect(await rpc("admin_set_payment_provider_lane_v1", ["stripe_live"])).toMatchObject({
      status: "success",
      mode: "stripe_live",
      expectedLivemode: true,
    })
    expect((await rows<{ expected: boolean }>("select admin_private.payment_expected_livemode_v1() as expected"))[0].expected).toBe(true)
    const created = await rows<{ livemode: boolean }>(
      `insert into public.provider_operations(idempotency_key, kind, purpose, status)
       values (gen_random_uuid(), 'CREATE_RECURRING_PRICE', 'GUARD_PRICE', 'PENDING')
       returning livemode`,
    )
    expect(created[0].livemode).toBe(true)
    expect(await fails(
      `insert into admin_private.stripe_event_receipts(provider_event_id, event_type, livemode)
       values ('evt_wrong_lane', 'payment_intent.succeeded', false)`,
    )).toMatch(/livemode_mismatch/)
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_live_ok_01", "payment_intent.succeeded", "pi_live_ok", false])).toMatchObject({
      status: "denied",
      reason: "livemode",
    })
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_live_ok_01", "payment_intent.succeeded", "pi_live_ok", true])).toMatchObject({
      status: "success",
      duplicate: false,
    })
    expect(await rpc("admin_set_payment_provider_lane_v1", ["stripe_test"])).toMatchObject({
      status: "denied",
      reason: "mixed_livemode",
    })
  })

  it("lets only the service role set the lane", async () => {
    await db.exec("set role anon")
    await expect(db.query("select public.admin_set_payment_provider_lane_v1('stripe_test')")).rejects.toThrow(/permission denied/i)
    await db.exec("reset role")
    await db.exec("set role service_role")
    expect(await rpc("admin_set_payment_provider_lane_v1", ["neither"])).toMatchObject({ status: "invalid" })
    await db.exec("reset role")
  })
})
