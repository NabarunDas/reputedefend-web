import { readFileSync } from "node:fs"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const sql = readFileSync(new URL("../../../../supabase/migrations/20261103230000_customer_commercial_payment_verification_v1.sql", import.meta.url), "utf8")

async function value<T>(statement: string, params: unknown[] = []): Promise<T> {
  const rows = (await db.query<{ value: T }>(statement, params)).rows
  return rows[0].value
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
}, 180000)

afterAll(async () => { await db.close() })

describe("commercial payment verification read model", () => {
  it("adds read-only functions without weakening the evidence block", async () => {
    expect(sql).not.toContain("INSERT INTO public.commercial_payment_evidence")
    expect(sql).not.toContain("guard_commercial_payment_evidence_v1")
    expect(sql).not.toContain("UPDATE public.commercial_subscriptions")
    const definition = await value<string>("select pg_get_functiondef('admin_private.guard_commercial_payment_evidence_v1()'::regprocedure) as value")
    expect(definition).toContain("paid commercial evidence is disabled until a trusted invoice binding exists")
    const trigger = await value<string>("select pg_get_triggerdef(oid) as value from pg_trigger where tgname = 'commercial_payment_evidence_guard'")
    expect(trigger).toContain("guard_commercial_payment_evidence_v1")
    const volatility = await value<string[]>(`
      select array_agg(provolatile order by proname) as value
      from pg_proc
      where proname in (
        'commercial_payment_receipt_v1',
        'commercial_payment_preparation_snapshot_v1',
        'commercial_payment_preparation_for_session_v1',
        'commercial_payment_preparation_for_price_v1',
        'commercial_payment_invoice_candidates_v1'
      )`)
    expect(volatility).toEqual(["s", "s", "s", "s", "s"])
  })

  it("permits service_role to execute only the public correlation functions", async () => {
    const privileges = await db.query<{ name: string; anon_ok: boolean; service_ok: boolean }>(`
      select signature as name,
        has_function_privilege('anon', signature, 'EXECUTE') as anon_ok,
        has_function_privilege('service_role', signature, 'EXECUTE') as service_ok
      from (values
        ('public.commercial_payment_receipt_v1(text)'),
        ('public.commercial_payment_preparation_for_session_v1(text)'),
        ('public.commercial_payment_preparation_for_price_v1(text, text)'),
        ('public.commercial_payment_invoice_candidates_v1(integer)'),
        ('admin_private.commercial_payment_preparation_snapshot_v1(public.commercial_checkout_preparations)')
      ) as functions(signature)
      order by signature`)
    expect(privileges.rows).toEqual([
      { name: "admin_private.commercial_payment_preparation_snapshot_v1(public.commercial_checkout_preparations)", anon_ok: false, service_ok: false },
      { name: "public.commercial_payment_invoice_candidates_v1(integer)", anon_ok: false, service_ok: true },
      { name: "public.commercial_payment_preparation_for_price_v1(text, text)", anon_ok: false, service_ok: true },
      { name: "public.commercial_payment_preparation_for_session_v1(text)", anon_ok: false, service_ok: true },
      { name: "public.commercial_payment_receipt_v1(text)", anon_ok: false, service_ok: true },
    ])
  })

  it("reads a signed receipt and lists only whitelisted unpaid invoices", async () => {
    expect(await value("select public.commercial_payment_receipt_v1('not-an-event') as value")).toMatchObject({ status: "unmatched", reason: "not_received" })
    expect(await value("select public.commercial_payment_receipt_v1('evt_missing01') as value")).toMatchObject({ status: "unmatched", reason: "not_received" })
    expect(await value("select public.commercial_payment_preparation_for_session_v1('cs_unknown') as value")).toMatchObject({ status: "unmatched", reason: "preparation" })
    expect(await value("select public.commercial_payment_preparation_for_price_v1('price_unknown', 'cus_unknown') as value")).toMatchObject({ status: "unmatched", reason: "preparation" })
    const received = await value<{ status: string }>("select public.payment_receive_stripe_event_v1('evt_invoice01', 'invoice.paid', 'in_telloya', false) as value")
    expect(received.status).toBe("success")
    await value("select public.payment_receive_stripe_event_v1('evt_checkout1', 'checkout.session.completed', 'cs_telloya', false) as value")
    await value("select public.payment_receive_stripe_event_v1('evt_final001', 'invoice.finalized', 'in_final', false) as value")
    const receipt = await value<{ status: string; eventType: string; objectId: string; processed: boolean }>(
      "select public.commercial_payment_receipt_v1('evt_invoice01') as value",
    )
    expect(receipt).toMatchObject({ status: "success", eventType: "invoice.paid", objectId: "in_telloya", processed: false })
    const candidates = await value<{ events: Array<{ eventId: string }> }>("select public.commercial_payment_invoice_candidates_v1(20) as value")
    expect(candidates.events.map(event => event.eventId)).toEqual(["evt_invoice01"])
    const evidence = await value<number>("select count(*)::int as value from public.commercial_payment_evidence")
    const active = await value<number>("select count(*)::int as value from public.commercial_subscriptions where state = 'ACTIVE'")
    expect(evidence).toBe(0)
    expect(active).toBe(0)
  })
})
