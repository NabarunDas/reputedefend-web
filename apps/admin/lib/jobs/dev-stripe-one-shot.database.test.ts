import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { applyChain, preparePlatform } from "../recovery/harness"

const db = new PGlite()
const uid = "11111111-1111-4111-8111-111111111111"
const token = "a".repeat(64)
const unrelated = [
  ["email-ahead-0001", "SEND_EMAIL"],
  ["collect-ahead-001", "COLLECT_PAYMENT"],
  ["guard-bill-ahead1", "RECONCILE_GUARD_BILLING"],
  ["guard-alert-ahead", "MAINTAIN_GUARD_ALERTS"],
] as const

type Json = Record<string, unknown>

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function rows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

function requestId(): string {
  return crypto.randomUUID()
}

async function receive(eventId: string, type: string, objectId: string, livemode = false): Promise<Json> {
  return rpc<Json>("payment_receive_stripe_event_v1", [eventId, type, objectId, livemode])
}

async function claim(eventId: string, request = requestId(), confirmed = true, preflight = false): Promise<Json> {
  return rpc<Json>("admin_dev_stripe_one_shot_claim_v1", [token, request, eventId, confirmed, preflight])
}

async function enqueueUnrelated(): Promise<void> {
  for (const [key, topic] of unrelated) {
    await db.query(
      `select admin_private.enqueue_outbox_v1($1, $2, 'operator', null, '{}'::jsonb, now() - interval '1 hour')`,
      [key, topic],
    )
  }
}

async function unrelatedSnapshot(): Promise<string> {
  const queued = await rows(
    `select event_key, topic, promoted_at, payload::text as payload
     from admin_private.job_outbox
     where event_key = any($1::text[])
     order by event_key`,
    [unrelated.map(([key]) => key)],
  )
  return JSON.stringify(queued)
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users values('${uid}','admin@profilerelaunch.com',now(),null,null);
    insert into public.admin_identity(singleton,auth_user_id,enabled) values(true,'${uid}',true)
      on conflict (singleton) do update set auth_user_id=excluded.auth_user_id, enabled=true;
  `)
}, 180000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  await db.exec(`
    alter table public.admin_audit_events disable trigger admin_audit_immutable;
    alter table admin_private.job_attempts disable trigger job_attempts_immutable;
    truncate public.admin_audit_events, public.admin_sessions, public.admin_auth_events,
      admin_private.job_attempts, admin_private.jobs, admin_private.job_outbox,
      admin_private.job_command_receipts, admin_private.stripe_event_receipts;
    delete from public.guard_subscription_invoices;
    alter table public.admin_audit_events enable trigger admin_audit_immutable;
    alter table admin_private.job_attempts enable trigger job_attempts_immutable;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values('${token}','${uid}',now());
  `)
})

describe("DEV Stripe one-shot SQL", () => {
  it("claims only the selected test-mode Stripe event and leaves earlier jobs untouched", async () => {
    await enqueueUnrelated()
    expect(await receive("evt_pi_selected", "payment_intent.succeeded", "pi_selected")).toMatchObject({
      status: "success", duplicate: false,
    })
    const before = await unrelatedSnapshot()
    const claimed = await claim("evt_pi_selected")
    expect(claimed).toMatchObject({
      status: "success",
      replay: false,
      eventId: "evt_pi_selected",
      jobType: "PROCESS_STRIPE_EVENT",
      idempotencyKey: "process-stripe-event:evt_pi_selected",
      attempts: 1,
    })
    expect(claimed.leaseToken).toMatch(/^[0-9a-f-]{36}$/)
    expect(await unrelatedSnapshot()).toBe(before)
    expect(await rows<{ job_type: string }>("select job_type from admin_private.jobs order by job_type")).toEqual([
      { job_type: "PROCESS_STRIPE_EVENT" },
    ])
    const stripe = await rows<{ promoted: boolean; processed: boolean }>(
      `select o.promoted_at is not null as promoted, r.processed
       from admin_private.job_outbox o
       join admin_private.stripe_event_receipts r on r.provider_event_id = 'evt_pi_selected'
       where o.event_key = 'process-stripe-event:evt_pi_selected'`,
    )
    expect(stripe[0]).toEqual({ promoted: true, processed: false })
    const owner = await rows<{ lease_owner: string }>("select lease_owner from admin_private.jobs")
    expect(owner[0].lease_owner).toBe("dev-stripe-one-shot")
    const audit = await rows<{ details: string }>(
      `select details::text as details from public.admin_audit_events where action = 'OPERATIONS_CHANGED'`,
    )
    expect(audit[0].details).toContain("evt_pi_selected")
    expect(audit[0].details).toContain("dev_stripe_one_shot")
    expect(audit[0].details).not.toContain(token)
  })

  it("still lets the generic promoter take every topic, and the one-shot function does not call it", async () => {
    await enqueueUnrelated()
    expect(await receive("evt_pi_generic", "payment_intent.succeeded", "pi_generic")).toMatchObject({ status: "success" })
    expect(await rpc("job_promote_outbox_v1", [20])).toMatchObject({ status: "success", promoted: 5 })
    const types = (await rows<{ job_type: string }>("select job_type from admin_private.jobs order by job_type")).map(row => row.job_type)
    expect(types).toEqual([
      "COLLECT_PAYMENT",
      "MAINTAIN_GUARD_ALERTS",
      "PROCESS_STRIPE_EVENT",
      "RECONCILE_GUARD_BILLING",
      "SEND_EMAIL",
    ])
    const source = await rows<{ src: string; args: string; config: string[] }>(`
      select p.prosrc as src, pg_get_function_identity_arguments(p.oid) as args, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_dev_stripe_one_shot_claim_v1'
    `)
    expect(source[0].args).toBe("p_token text, p_request uuid, p_event_id text, p_confirmed boolean, p_preflight_clear boolean")
    expect(source[0].config).toEqual(['search_path=""'])
    expect(source[0].src).not.toMatch(/job_promote_outbox_v1|job_claim_batch_v1|processed\s*=\s*true|payment_receipts/)
    const generic = await rows<{ src: string }>(`
      select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'job_promote_outbox_v1'
    `)
    expect(generic[0].src).toMatch(/promoted_at IS NULL/)
    expect(generic[0].src).not.toMatch(/PROCESS_STRIPE_EVENT/)
  })

  it("refuses a missing, malformed, unsupported, live or non-Stripe row without promoting it", async () => {
    await enqueueUnrelated()
    const before = await unrelatedSnapshot()
    expect(await claim("evt_not_queued")).toMatchObject({ status: "denied", reason: "missing" })
    expect(await receive("evt_live_mode", "payment_intent.succeeded", "pi_live_mode", true)).toMatchObject({
      status: "denied", reason: "livemode",
    })
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_live_mode'")).toBe(0)
    expect(await claim("evt_live_mode")).toMatchObject({ status: "denied", reason: "missing" })

    expect(await receive("evt_bad_payload", "payment_intent.succeeded", "pi_bad_payload")).toMatchObject({ status: "success" })
    await db.query(
      `update admin_private.job_outbox set payload = payload - 'eventType' where event_key = 'process-stripe-event:evt_bad_payload'`,
    )
    expect(await claim("evt_bad_payload")).toMatchObject({ status: "denied", reason: "not_stripe_test" })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_bad_payload' and promoted_at is null")).toBe(1)

    expect(await receive("evt_flipped_live", "payment_intent.succeeded", "pi_flipped")).toMatchObject({ status: "success" })
    await db.query(
      `update admin_private.job_outbox set payload = jsonb_set(payload, '{livemode}', 'true'::jsonb) where event_key = 'process-stripe-event:evt_flipped_live'`,
    )
    expect(await claim("evt_flipped_live")).toMatchObject({ status: "denied", reason: "not_stripe_test" })

    await db.query(
      `select admin_private.enqueue_outbox_v1(
        'process-stripe-event:evt_wrong_topic', 'SEND_EMAIL', 'email', null,
        jsonb_build_object('eventId','evt_wrong_topic','eventType','payment_intent.succeeded','objectId','pi_wrong','livemode', false),
        now()
      )`,
    )
    expect(await claim("evt_wrong_topic")).toMatchObject({ status: "denied", reason: "not_stripe_test" })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_wrong_topic' and topic = 'SEND_EMAIL' and promoted_at is null")).toBe(1)

    expect(await receive("evt_customer_made", "customer.created", "cus_made")).toMatchObject({ status: "success" })
    expect(await claim("evt_customer_made")).toMatchObject({ status: "denied", reason: "unsupported", eventType: "customer.created" })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_customer_made' and promoted_at is null")).toBe(1)

    expect(await receive("evt_not_ready_pi", "payment_intent.succeeded", "pi_not_ready")).toMatchObject({ status: "success" })
    await db.query(`update admin_private.job_outbox set available_at = now() + interval '1 hour' where event_key = 'process-stripe-event:evt_not_ready_pi'`)
    const held = requestId()
    expect(await claim("evt_not_ready_pi", held)).toMatchObject({ status: "denied", reason: "not_ready" })
    expect(await count("select count(*)::int as n from admin_private.job_command_receipts where request_id = $1", [held])).toBe(0)
    expect(await unrelatedSnapshot()).toBe(before)
    expect(await count("select count(*)::int as n from admin_private.jobs")).toBe(0)
  })

  it("leaves Guard events and a known Guard invoice queued, including before preflight", async () => {
    expect(await receive("evt_sub_updated", "customer.subscription.updated", "sub_updated")).toMatchObject({ status: "success" })
    expect(await receive("evt_charge_back", "charge.refunded", "ch_refunded")).toMatchObject({ status: "success" })
    expect(await receive("evt_cs_plain", "checkout.session.completed", "cs_plain01")).toMatchObject({ status: "success" })
    expect(await receive("evt_in_plain", "invoice.paid", "in_plainpaid")).toMatchObject({ status: "success" })
    expect(await receive("evt_in_guard", "invoice.finalized", "in_guardone")).toMatchObject({ status: "success" })
    await db.exec(`
      set session_replication_role = replica;
      insert into public.guard_subscription_invoices(
        subscription_id, stripe_invoice_id, amount_paid_minor, currency, kind, status, livemode
      ) values (
        '22222222-2222-4222-8222-222222222222', 'in_guardone', 0, 'GBP', 'INITIAL', 'PAID', false
      );
      set session_replication_role = origin;
    `)

    expect(await claim("evt_sub_updated")).toMatchObject({ status: "denied", reason: "guard_event" })
    expect(await claim("evt_charge_back")).toMatchObject({ status: "denied", reason: "guard_event" })
    const checkoutRequest = requestId()
    expect(await claim("evt_cs_plain", checkoutRequest, true, false)).toMatchObject({
      status: "preflight_required", eventType: "checkout.session.completed", objectId: "cs_plain01",
    })
    expect(await count("select count(*)::int as n from admin_private.job_command_receipts where request_id = $1", [checkoutRequest])).toBe(0)
    const invoiceRequest = requestId()
    expect(await claim("evt_in_plain", invoiceRequest, true, false)).toMatchObject({
      status: "preflight_required", eventType: "invoice.paid", objectId: "in_plainpaid",
    })
    expect(await claim("evt_in_plain", invoiceRequest, true, true)).toMatchObject({
      status: "success", jobType: "PROCESS_STRIPE_EVENT", attempts: 1,
    })
    expect(await claim("evt_in_guard", requestId(), true, true)).toMatchObject({
      status: "denied", reason: "guard_event", eventType: "invoice.finalized",
    })

    const promoted = await rows<{ event_key: string }>(
      `select event_key from admin_private.job_outbox where promoted_at is not null order by event_key`,
    )
    expect(promoted).toEqual([{ event_key: "process-stripe-event:evt_in_plain" }])
    expect(await count("select count(*)::int as n from admin_private.jobs where job_type <> 'PROCESS_STRIPE_EVENT'")).toBe(0)
  })

  it("keeps one lease, replays the same approval, and rejects a second event on that key", async () => {
    expect(await receive("evt_lease_hold", "payment_intent.succeeded", "pi_lease_hold")).toMatchObject({ status: "success" })
    expect(await receive("evt_lease_hold", "payment_intent.succeeded", "pi_lease_hold")).toMatchObject({
      status: "success", duplicate: true,
    })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_lease_hold'")).toBe(1)
    expect(await receive("evt_other_event", "payment_intent.succeeded", "pi_other_evt")).toMatchObject({ status: "success" })

    const firstRequest = requestId()
    const first = await claim("evt_lease_hold", firstRequest)
    expect(first.status).toBe("success")
    const second = await claim("evt_lease_hold", requestId())
    expect(second).toMatchObject({ status: "conflict", reason: "leased" })
    expect(await count("select count(*)::int as n from admin_private.job_attempts")).toBe(1)
    const still = await rows<{ attempts: number; lease_token: string }>("select attempts, lease_token::text as lease_token from admin_private.jobs")
    expect(still[0]).toEqual({ attempts: 1, lease_token: first.leaseToken })

    const replay = await claim("evt_lease_hold", firstRequest)
    expect(replay).toMatchObject({ status: "success", replay: true, currentJobStatus: "RUNNING", attempts: 1 })
    expect(await count("select count(*)::int as n from admin_private.job_attempts")).toBe(1)

    const crossed = await claim("evt_other_event", firstRequest)
    expect(crossed).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_other_event' and promoted_at is null")).toBe(1)

    expect(await rpc("job_complete_v1", [first.jobId, crypto.randomUUID()])).toMatchObject({ status: "conflict" })
    await db.query("update admin_private.jobs set lease_expires_at = now() - interval '1 second'")
    const reclaimed = await claim("evt_lease_hold", requestId())
    expect(reclaimed).toMatchObject({ status: "success", attempts: 2 })
    expect(reclaimed.leaseToken).not.toBe(first.leaseToken)
    expect(await rpc("job_complete_v1", [first.jobId, first.leaseToken])).toMatchObject({ status: "conflict" })
    expect(await rpc("job_complete_v1", [reclaimed.jobId, reclaimed.leaseToken])).toMatchObject({
      status: "success", jobStatus: "SUCCEEDED",
    })
    expect(await rpc("job_complete_v1", [reclaimed.jobId, reclaimed.leaseToken])).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_other_event' and promoted_at is null")).toBe(1)
  })

  it("retries, waits out backoff, then dead-letters without another attempt or a payment row", async () => {
    await enqueueUnrelated()
    expect(await receive("evt_retry_path", "payment_intent.succeeded", "pi_retry_path")).toMatchObject({ status: "success" })
    const first = await claim("evt_retry_path")
    expect(await rpc("job_fail_v1", [first.jobId, first.leaseToken, "Provider retrieval failed.", true])).toMatchObject({
      status: "success", jobStatus: "RETRY",
    })
    const waiting = await claim("evt_retry_path", requestId())
    expect(waiting).toMatchObject({ status: "denied", reason: "not_ready" })
    expect(await count("select count(*)::int as n from admin_private.job_attempts")).toBe(1)

    await db.query("update admin_private.jobs set scheduled_at = now() where id = $1", [first.jobId])
    const again = await claim("evt_retry_path", requestId())
    expect(again).toMatchObject({ status: "success", attempts: 2 })
    expect(await rpc("job_fail_v1", [again.jobId, again.leaseToken, "Event payload is invalid.", false])).toMatchObject({
      status: "success", jobStatus: "DEAD_LETTER",
    })
    expect(await claim("evt_retry_path", requestId())).toMatchObject({ status: "denied", reason: "dead_letter" })
    expect(await count("select count(*)::int as n from admin_private.job_attempts")).toBe(2)
    expect(await count("select count(*)::int as n from public.payment_receipts")).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_obligations")).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_ledger")).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.jobs where job_type <> 'PROCESS_STRIPE_EVENT'")).toBe(0)
  })

  it("dead-letters an exhausted expired lease and does not resurrect it", async () => {
    expect(await receive("evt_exhausted", "payment_intent.succeeded", "pi_exhausted")).toMatchObject({ status: "success" })
    const claimed = await claim("evt_exhausted")
    await db.query(
      "update admin_private.jobs set max_attempts = attempts, lease_expires_at = now() - interval '1 second' where id = $1",
      [claimed.jobId],
    )
    expect(await claim("evt_exhausted", requestId())).toMatchObject({ status: "denied", reason: "dead_letter", jobStatus: "DEAD_LETTER" })
    expect(await count("select count(*)::int as n from admin_private.job_attempts")).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.jobs where status = 'DEAD_LETTER'")).toBe(1)
    expect(await claim("evt_exhausted", requestId())).toMatchObject({ status: "denied", reason: "dead_letter" })
    expect(await count("select count(*)::int as n from admin_private.job_attempts")).toBe(1)
  })

  it("applies an unmatched event once and does not write a payment, ledger or obligation row", async () => {
    await enqueueUnrelated()
    const before = await unrelatedSnapshot()
    expect(await receive("evt_apply_once", "payment_intent.succeeded", "pi_apply_once")).toMatchObject({ status: "success" })
    const claimed = await claim("evt_apply_once")
    const firstApply = await rpc<Json>("payment_apply_provider_event_v1", [
      "evt_apply_once", "payment_intent.succeeded", "pi_apply_once", { livemode: false },
    ])
    expect(firstApply).toMatchObject({ status: "success", ignored: true, reason: "unrelated" })
    const secondApply = await rpc<Json>("payment_apply_provider_event_v1", [
      "evt_apply_once", "payment_intent.succeeded", "pi_apply_once", { livemode: false },
    ])
    expect(secondApply).toMatchObject({ status: "success", duplicate: true })
    expect(await rpc("job_complete_v1", [claimed.jobId, claimed.leaseToken])).toMatchObject({ status: "success", jobStatus: "SUCCEEDED" })
    expect(await rpc("job_complete_v1", [claimed.jobId, claimed.leaseToken])).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from public.payment_receipts")).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_obligations")).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_ledger")).toBe(0)
    expect(await unrelatedSnapshot()).toBe(before)
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_apply_once' and processed")).toBe(1)
  })

  it("requires a fresh Admin session and does not grant the claim to browser roles", async () => {
    expect(await receive("evt_reauth_pi", "payment_intent.succeeded", "pi_reauth")).toMatchObject({ status: "success" })
    await db.query("update public.admin_sessions set created_at = now() - interval '6 minutes' where token_hash = $1", [token])
    expect(await claim("evt_reauth_pi")).toMatchObject({ status: "reauth_required" })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where promoted_at is null")).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.jobs")).toBe(0)
    await db.query("update public.admin_sessions set created_at = now(), expires_at = now() - interval '1 minute' where token_hash = $1", [token])
    expect(await claim("evt_reauth_pi")).toMatchObject({ status: "unauthorized" })
    expect(await rpc("admin_dev_stripe_one_shot_claim_v1", ["c".repeat(64), requestId(), "evt_reauth_pi", true, false])).toMatchObject({
      status: "unauthorized",
    })
    await db.query(
      "update public.admin_sessions set created_at = now(), expires_at = now() + interval '12 hours', last_seen_at = now() where token_hash = $1",
      [token],
    )
    expect(await claim("evt_reauth_pi", requestId(), false)).toMatchObject({ status: "invalid" })
    expect(await count("select count(*)::int as n from admin_private.jobs")).toBe(0)

    const privileges = await rows<{ anon: boolean; authenticated: boolean; service: boolean; family: boolean }>(`
      select
        has_function_privilege('anon', 'public.admin_dev_stripe_one_shot_claim_v1(text,uuid,text,boolean,boolean)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.admin_dev_stripe_one_shot_claim_v1(text,uuid,text,boolean,boolean)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.admin_dev_stripe_one_shot_claim_v1(text,uuid,text,boolean,boolean)', 'EXECUTE') as service,
        has_function_privilege('service_role', 'admin_private.dev_stripe_event_family_v1(text)', 'EXECUTE') as family
    `)
    expect(privileges[0]).toEqual({ anon: false, authenticated: false, service: true, family: false })
    const definer = await rows<{ prosecdef: boolean }>(`
      select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'admin_dev_stripe_one_shot_claim_v1'
    `)
    expect(definer[0].prosecdef).toBe(true)
    try {
      await db.exec("set role anon")
      await expect(db.query(
        `select public.admin_dev_stripe_one_shot_claim_v1('${token}', '${requestId()}'::uuid, 'evt_reauth_pi', true, false)`,
      )).rejects.toThrow(/permission denied/i)
    } finally {
      await db.exec("reset role")
    }
  })
})
