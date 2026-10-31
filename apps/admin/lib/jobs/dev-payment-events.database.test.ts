/**
 * PAYMENTS-E2E-POSTCHECKOUT-01. Disposable PostgreSQL and a mocked Stripe SDK.
 * Signed events are assumed already verified. This file does not call Stripe,
 * charge a card, or touch the live DEV case.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { applyChain, preparePlatform } from "../recovery/harness"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../commercial/paid-service-approval.fixture"
import { narrowCaseFlowFacts, requiredCase } from "../case-flow/projection"
import { presentCaseJourney } from "../case-journey/present"
import type { OutgoingMailMessage } from "../communications/mail"
import { jobWorkerConfig } from "./config"
import type { JobRpc } from "./model"

const stripeState = vi.hoisted(() => ({
  checkout: {} as Record<string, Record<string, unknown>>,
  intent: {} as Record<string, Record<string, unknown>>,
}))

vi.mock("stripe", () => ({
  default: class Stripe {
    checkout = { sessions: { retrieve: async (id: string) => {
      const row = stripeState.checkout[id]
      if (!row) throw new Error(`missing checkout ${id}`)
      return row
    } } }
    paymentIntents = { retrieve: async (id: string) => {
      const row = stripeState.intent[id]
      if (!row) throw new Error(`missing intent ${id}`)
      return row
    } }
  },
}))

import { runDevPaymentEventWorker } from "./dev-payment-events"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const sam = "77777777-7777-4777-8777-777777777777"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const samAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const adminToken = "a".repeat(64)
const stripeCustomerId = "cus_wkralex"
const secret = "d".repeat(32)

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const key = () => randomUUID()
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

type Json = Record<string, unknown> & { status?: string; id?: string; version?: number; quoteVersionId?: string }

type Opened = {
  reference: string
  caseId: string
  orderId: string
  orderRef: string
  amountMinor: number
  obligationId: string
  attemptId: string
  providerOperationId: string
}

const workerEnv: Record<string, string> = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
  VERCEL_DEPLOYMENT_ID: "dpl_dev_payment_worker",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  CUSTOMER_ORIGIN: "https://profilerelaunch-customer-git-develop-clientcove.vercel.app",
  DEV_PAYMENT_EVENT_WORKER_ENABLED: "true",
  DEV_PAYMENT_EVENT_WORKER_SECRET: secret,
  PAYMENTS_PROVIDER_MODE: "stripe_test",
  STRIPE_SECRET_KEY: "sk_test_placeholdernotarealkey",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
  STRIPE_LIVE_ACTIVATION: "",
  COMMUNICATIONS_SEND_ENABLED: "true",
  JOB_PROVIDER_MODE: "production",
  JOB_WORKER_ENABLED: "true",
  CRON_SECRET: "c".repeat(32),
  RESEND_API_KEY: "re_dev_placeholder",
  COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
  COMMUNICATIONS_REPLY_TO_EMAIL: "cases@profilerelaunch.com",
  COMMUNICATIONS_REPLY_TO_CONFIRMED: "monitored",
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows
}

async function rpc<T>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`
  return (await db.query<{ value: T }>(sql, args)).rows[0].value
}

async function count(sql: string, params: unknown[] = []) {
  return Number((await rows<{ n: number }>(sql, params))[0]?.n ?? 0)
}

function dbRpc(calls: string[]): JobRpc {
  const positional: Record<string, string[]> = {
    dev_payment_event_candidates_v1: ["p_limit"],
    dev_payment_event_queue_v1: [],
    dev_payment_event_claim_v1: ["p_event_id", "p_settlement_clear"],
    dev_payment_event_release_v1: ["p_job", "p_lease", "p_reason"],
    job_heartbeat_v1: ["p_worker", "p_environment", "p_phase", "p_error", "p_deployment", "p_expected_interval", "p_late_after"],
    job_complete_v1: ["p_job", "p_lease"],
    job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
    payment_provider_lane_status_v1: [],
    payment_apply_provider_event_v1: ["p_event_id", "p_type", "p_object_id", "p_payload"],
    payment_confirmation_context_v1: ["p_payment_intent"],
    payment_queue_confirmation_v1: ["p_payload"],
    dev_payment_confirmation_claim_v1: ["p_customer_origin"],
    communication_load_send_v1: ["p_communication", "p_content_version"],
    communication_begin_provider_attempt_v1: ["p_communication", "p_content_version", "p_idempotency_key"],
    communication_mark_provider_accepted_v1: ["p_communication", "p_provider", "p_provider_message_id", "p_idempotency_key"],
    communication_mark_acceptance_unknown_v1: ["p_communication", "p_idempotency_key"],
    communication_mark_provider_rejected_v1: ["p_communication", "p_error", "p_retryable", "p_idempotency_key"],
  }
  return {
    async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      calls.push(name)
      const keys = positional[name]
      if (!keys) throw new Error(name)
      return rpc<T>(name, keys.map(item => args[item] ?? null))
    },
  }
}

const sentMail: OutgoingMailMessage[] = []
let mailSerial = 0
const mailProvider = {
  async send(message: OutgoingMailMessage) {
    sentMail.push(message)
    mailSerial += 1
    return { ok: true as const, providerMessageId: `re_test_payment_${mailSerial}`, replay: false }
  },
}

async function runWorker(abandonAfterHandler = false) {
  const calls: string[] = []
  const result = await runDevPaymentEventWorker({
    rpc: dbRpc(calls),
    abandonAfterHandler,
    mailProvider,
  })
  return { result, calls }
}

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  await rpc("customer_portal_begin_login_v1", [email, pending])
  await rpc("customer_portal_confirm_otp_sent_v1", [pending])
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(finished.status)
  return sessionHash
}

async function priceId() {
  return (await rows<{ id: string }>("select id from public.price_versions where service_code = 'GUIDED_RELAUNCH' and seed_key is not null"))[0].id
}

async function verify(id = alex, email = "alex@example.com") {
  await db.query(
    `insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence)
     values ($1,'email',$2,$3,$4) on conflict (customer_id, channel) do update set verified_value = excluded.verified_value`,
    [id, email, admin, "Verified from a live call with the customer."],
  )
  await db.query(
    `insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence)
     values ($1,$2,'verified',now(),$3,$4) on conflict (customer_id, business_id) do update set status = 'verified'`,
    [id, business, admin, "Companies House match discussed on a live call."],
  )
}

async function insertCase(reference: string) {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1,$2,'PROFILE_RECOVERY',$3,$4,$5,'Profile suspended', now(), now(), 'GUIDED')`,
    [id, reference, alex, business, location],
  )
  return id
}

async function acceptQuote(caseId: string) {
  await verify()
  const draft = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_draft", {
    customerId: alex, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false, priceVersionId: await priceId(),
    serviceCode: "GUIDED_RELAUNCH",
  }, null])
  await rpc("admin_quote_command_v1", [adminToken, key(), "set_draft_tax", { quoteId: draft.id, taxBehaviour: "NOT_APPLICABLE" }, draft.version])
  const offered = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "offer", { quoteId: draft.id }, (draft.version as number) + 1])
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_quote_acceptance_action", {
    quoteId: draft.id, expiresAt: actionExpiry(), secretHash,
  }, null])
  const pending = hash(token())
  const session = hash(token())
  await rpc("customer_action_exchange_v1", [issued.id, secretHash, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, alexAuth, "alex@example.com"])
  return rpc<Json>("customer_action_command_v1", [session, key(), "accept", paidQuoteCommand({
    quoteVersionId: String(offered.quoteVersionId),
    serviceCode: "GUIDED_RELAUNCH",
  })])
}

async function caseVersion(caseId: string) {
  return (await rows<{ workflow_version: number }>("select workflow_version from public.cases where id = $1", [caseId]))[0].workflow_version
}

async function caseCmd(caseId: string, operation: string, data: Record<string, unknown>) {
  return rpc("admin_case_command_v1", [adminToken, key(), caseId, await caseVersion(caseId), operation, {
    note: "Reviewed the caller’s request and confirmed the details.", ...data,
  }])
}

async function guidedToPaymentRequired(caseId: string) {
  await caseCmd(caseId, "plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null })
  await caseCmd(caseId, "transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
}

async function selector(actionId: string) {
  return (await rows<{ value: string }>("select admin_private.customer_portal_action_selector_v1($1) as value", [actionId]))[0].value
}

let alexSession = ""
let samSession = ""

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${alexAuth}', 'alex@example.com', now()),
      ('${samAuth}', 'sam@example.com', now());
    update public.admin_identity set auth_user_id = '${admin}', enabled = true where singleton;
    insert into public.admin_sessions(token_hash, auth_user_id, created_at) values ('${adminToken}', '${admin}', now());
    insert into public.customers(id, full_name, email) values
      ('${alex}', 'Alex Example', 'alex@example.com'),
      ('${sam}', 'Sam Example', 'sam@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Harbour Bakery');
    insert into public.locations(id, business_id, country, location_name) values ('${location}', '${business}', 'UK', 'High Street');
  `)
  await verify()
  await verify(sam, "sam@example.com")
  await db.exec(syntheticPurchasingEstablishmentSql(business, admin))
  const approved = await rpc<{ status: string }>("admin_confirm_paid_service_agreement_v1", [adminToken, SYNTHETIC_APPROVAL_REQUEST, SYNTHETIC_APPROVAL_EVIDENCE])
  if (approved.status !== "confirmed") throw new Error(approved.status ?? "approval missing")
  alexSession = await portalSession("alex@example.com", alexAuth)
  samSession = await portalSession("sam@example.com", samAuth)
}, 180000)

afterAll(async () => { await db.close() })

beforeEach(async () => {
  stripeState.checkout = {}
  stripeState.intent = {}
  sentMail.length = 0
  vi.unstubAllEnvs()
  for (const [name, value] of Object.entries(workerEnv)) vi.stubEnv(name, value)
  await db.exec(`
    alter table admin_private.job_attempts disable trigger job_attempts_immutable;
    truncate admin_private.job_attempts, admin_private.jobs, admin_private.job_outbox,
      admin_private.stripe_event_receipts, admin_private.job_worker_heartbeats;
    alter table admin_private.job_attempts enable trigger job_attempts_immutable;
  `)
})
afterEach(() => vi.unstubAllEnvs())

async function receive(eventId: string, type: string, objectId: string, livemode = false) {
  return rpc<Json>("payment_receive_stripe_event_v1", [eventId, type, objectId, livemode])
}

async function openGuided(reference: string): Promise<Opened> {
  const caseId = await insertCase(reference)
  const accepted = await acceptQuote(caseId)
  expect(accepted.status).toBe("success")
  await guidedToPaymentRequired(caseId)
  const order = (await rows<{ id: string; public_ref: string; amount_minor: number }>(
    "select id, public_ref, amount_minor from public.service_orders where case_id = $1",
    [caseId],
  ))[0]
  const obligationId = (await rows<{ id: string }>("select id from public.payment_obligations where service_order_id = $1 and kind = 'UPFRONT'", [order.id]))[0].id
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_payment_command_v1", [adminToken, key(), "issue_guided_payment_action", {
    serviceOrderId: order.id, expiresAt: actionExpiry(), secretHash,
  }, 1])
  expect(issued.status).toBe("success")
  const actionSelector = await selector(issued.id as string)
  const request = key()
  const started = await rpc<Json>("customer_portal_payment_command_v1", [
    alexSession, request, reference, actionSelector, "start_checkout", { idempotencyKey: request },
  ])
  expect(started.status).toBe("success")
  expect(await rpc("payment_ensure_customer_map_v1", [alex, stripeCustomerId])).toMatchObject({ status: "success" })
  return {
    reference, caseId, orderId: order.id, orderRef: order.public_ref, amountMinor: order.amount_minor,
    obligationId, attemptId: String(started.attemptId), providerOperationId: String(started.providerOperationId),
  }
}

function meta(opened: Opened) {
  return {
    customerId: alex,
    serviceOrderId: opened.orderId,
    obligationId: opened.obligationId,
    attemptId: opened.attemptId,
    providerOperationId: opened.providerOperationId,
    orderRef: opened.orderRef,
  }
}

function pin(opened: Opened, checkoutId: string, paymentIntentId: string, amount = opened.amountMinor, livemode = false) {
  stripeState.checkout[checkoutId] = {
    id: checkoutId,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    payment_intent: paymentIntentId,
    customer: stripeCustomerId,
    url: null,
    livemode,
    metadata: meta(opened),
  }
  stripeState.intent[paymentIntentId] = {
    id: paymentIntentId,
    status: "succeeded",
    amount,
    currency: "gbp",
    customer: stripeCustomerId,
    livemode,
    latest_charge: "ch_wkrcharge",
    metadata: meta(opened),
  }
}

async function obligationState(id: string) {
  return (await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [id]))[0].state
}

async function receiptCount(orderId: string) {
  return count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [orderId])
}

async function confirmationCount(caseId: string) {
  return count(
    `select count(*)::int as n from public.communications where case_id = $1 and template_key = 'PAYMENT_CONFIRMATION'`,
    [caseId],
  )
}

describe("DEV payment event worker", () => {
  it("claims one settlement event, reclaims an expired lease, and leaves other work queued", async () => {
    await db.query(`select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'operator', null, '{}'::jsonb, now())`, ["email-ahead-0001"])
    expect(await receive("evt_wkrpi", "payment_intent.succeeded", "pi_wkrclaim")).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrinv", "invoice.paid", "in_wkrplain")).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrset", "setup_intent.succeeded", "seti_wkrplain")).toMatchObject({ status: "success" })
    expect(await receive("evt_wrkcs", "checkout.session.completed", "cs_wkrorder")).toMatchObject({ status: "success" })
    await db.query(`update admin_private.job_outbox set available_at = now() - interval '2 hours' where event_key = 'process-stripe-event:evt_wrkcs'`)
    const queued = await rpc<{ unprocessed: number }>("dev_payment_event_queue_v1")
    expect(queued.unprocessed).toBe(2)
    const listed = await rpc<{ events: Array<{ eventId: string }> }>("dev_payment_event_candidates_v1", [20])
    expect(listed.events.map(event => event.eventId)).toEqual(["evt_wkrpi", "evt_wrkcs"])

    const claimed = await rpc<Json>("dev_payment_event_claim_v1", ["evt_wkrpi", false])
    expect(claimed).toMatchObject({ status: "success", jobType: "PROCESS_STRIPE_EVENT", attempts: 1 })
    expect(await rows<{ lease_owner: string }>("select lease_owner from admin_private.jobs")).toEqual([{ lease_owner: "dev-payment-events" }])
    expect(await rpc("dev_payment_event_claim_v1", ["evt_wkrpi", false])).toMatchObject({ status: "conflict", reason: "leased" })
    await db.query(`update admin_private.jobs set lease_expires_at = now() - interval '1 minute' where lease_owner = 'dev-payment-events'`)
    const reclaimed = await rpc<Json>("dev_payment_event_claim_v1", ["evt_wkrpi", false])
    expect(reclaimed).toMatchObject({ status: "success", attempts: 2 })
    expect(reclaimed.leaseToken).not.toBe(claimed.leaseToken)
    const released = await rpc<Json>("dev_payment_event_release_v1", [reclaimed.jobId, reclaimed.leaseToken, "Released without applying a payment."])
    expect(released).toMatchObject({ status: "success", jobStatus: "PENDING" })
    expect(await rows<{ status: string; attempts: number }>("select status, attempts from admin_private.jobs")).toEqual([{ status: "PENDING", attempts: 1 }])
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_wkrpi' and processed")).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'email-ahead-0001' and promoted_at is null")).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key in ('process-stripe-event:evt_wkrinv', 'process-stripe-event:evt_wkrset') and promoted_at is null")).toBe(2)

    expect(await receive("evt_wkrlive", "payment_intent.succeeded", "pi_wkrlive")).toMatchObject({ status: "success" })
    await db.query(
      `update admin_private.job_outbox set payload = jsonb_set(payload, '{livemode}', 'true'::jsonb) where event_key = 'process-stripe-event:evt_wkrlive'`,
    )
    expect(await rpc("dev_payment_event_claim_v1", ["evt_wkrlive", false])).toMatchObject({ status: "denied", reason: "not_stripe_test" })
    const afterLive = await rpc<{ events: Array<{ eventId: string }> }>("dev_payment_event_candidates_v1", [20])
    expect(afterLive.events.map(event => event.eventId)).not.toContain("evt_wkrlive")

    for (const signature of [
      "public.dev_payment_event_candidates_v1(integer)",
      "public.dev_payment_event_queue_v1()",
      "public.dev_payment_event_claim_v1(text, boolean)",
      "public.dev_payment_event_release_v1(uuid, uuid, text)",
    ]) {
      expect((await rows<{ ok: boolean }>("select has_function_privilege('anon', $1, 'EXECUTE') as ok", [signature]))[0].ok).toBe(false)
      expect((await rows<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'EXECUTE') as ok", [signature]))[0].ok).toBe(true)
    }
    const source = await rows<{ src: string }>(`
      select string_agg(p.prosrc, ' ') as src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'dev_payment_event_%'
    `)
    expect(source[0].src).not.toMatch(/job_promote_outbox_v1|job_claim_batch_v1|processed\s*=\s*true|payment_receipts/)
    const confirmation = await rows<{ src: string }>(`
      select p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'dev_payment_confirmation_claim_v1'
    `)
    expect(confirmation[0].src).not.toMatch(/job_promote_outbox_v1|job_claim_batch_v1/)
    expect((await rows<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.dev_payment_confirmation_claim_v1(text)', 'EXECUTE') as ok",
    ))[0].ok).toBe(false)
  })

  it("settles both event orders once, ignores a duplicate, and queues one confirmation", async () => {
    const opened = await openGuided("PR-26-WKRPAY")
    expect(opened.amountMinor).toBe(9900)
    pin(opened, "cs_wkrpay", "pi_wkrpay")
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, "cs_wkrpay", "checkout.session"])).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrpaycs", "checkout.session.completed", "cs_wkrpay")).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrpaypi", "payment_intent.succeeded", "pi_wkrpay")).toMatchObject({ status: "success" })
    await db.query(`select admin_private.enqueue_outbox_v1($1, 'SEND_EMAIL', 'operator', null, '{}'::jsonb, now())`, ["email-wkrpay-0001"])

    const first = await runWorker()
    expect(first.result).toMatchObject({ status: "success", counts: { claimed: 2, succeeded: 2, retried: 0, deadLettered: 0 } })
    expect(first.calls).not.toContain("job_promote_outbox_v1")
    expect(first.calls).not.toContain("job_claim_batch_v1")
    expect(first.calls.join(" ")).not.toContain(secret)
    expect(jobWorkerConfig().enabled).toBe(false)
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await confirmationCount(opened.caseId)).toBe(1)
    expect(await rows<{ state: string }>("select state from public.service_orders where id = $1", [opened.orderId])).toEqual([{ state: "ACCEPTED_AWAITING_PAYMENT" }])
    expect(await rows<{ work_stage: string; status: string; next_action_at: string | null }>(
      "select work_stage, status, next_action_at from public.cases where id = $1",
      [opened.caseId],
    )).toEqual([{ work_stage: "PREPARATION", status: "UNDER_REVIEW", next_action_at: null }])
    expect(await count(
      "select count(*)::int as n from public.case_events where case_id = $1 and event_type = 'GUIDED_PAYMENT_HANDOVER' and actor_type = 'SYSTEM'",
      [opened.caseId],
    )).toBe(1)
    const letter = (await rows<{ body_text: string }>(
      "select body_text from public.communications where case_id = $1 and template_key = 'PAYMENT_CONFIRMATION'",
      [opened.caseId],
    ))[0].body_text
    expect(letter).toContain("£99.00 GBP")
    expect(letter).toContain(opened.orderRef)
    expect(letter).toContain("Guided Relaunch")
    expect(letter).not.toMatch(/pi_|cs_|cus_|ch_/)
    expect(sentMail).toHaveLength(1)
    expect(sentMail[0].to).toBe("alex@example.com")
    expect(sentMail[0].text).toContain("£99.00 GBP")
    expect(sentMail[0].text).toContain(opened.orderRef)
    expect(await count("select count(*)::int as n from admin_private.jobs where job_type = 'SEND_EMAIL' and status = 'SUCCEEDED'")).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'PAYMENT_CONFIRMATION' and status = 'SENT' and delivery_status = 'PROVIDER_ACCEPTED'", [opened.caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and delivery_status = 'DELIVERED'", [opened.caseId])).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'email-wkrpay-0001' and promoted_at is null")).toBe(1)
    const heartbeat = await rows<{ worker_name: string; environment: string }>(
      "select worker_name, environment from admin_private.job_worker_heartbeats",
    )
    expect(heartbeat).toEqual([{ worker_name: "dev-payment-events", environment: "preview" }])

    const replay = await runWorker()
    expect(replay.result.counts.claimed).toBe(0)
    expect(sentMail).toHaveLength(1)
    expect(await receive("evt_wkrpayp2", "payment_intent.succeeded", "pi_wkrpay")).toMatchObject({ status: "success" })
    const duplicate = await runWorker()
    expect(duplicate.result).toMatchObject({ status: "success", counts: { claimed: 1, succeeded: 1 } })
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await confirmationCount(opened.caseId)).toBe(1)
    expect(sentMail).toHaveLength(1)

    const view = await rpc<{ case: { orders: Array<{ obligations: Array<{ state: string }>; receipts: Array<{ selector: string }> }>; actions: Array<{ kind: string }> } }>(
      "customer_portal_case_payments_v1",
      [alexSession, opened.reference],
    )
    expect(view.case.orders[0].obligations[0].state).toBe("PAID")
    expect(view.case.orders[0].receipts).toHaveLength(1)
    expect(view.case.actions.map(action => action.kind)).not.toContain("guided_payment")
    expect(JSON.stringify(view)).not.toMatch(/cus_|pi_|cs_|sk_|whsec_|ch_/)
    const download = await rpc<Record<string, unknown>>("customer_portal_receipt_v1", [alexSession, view.case.orders[0].receipts[0].selector])
    expect(download).toMatchObject({
      status: "ok",
      receiptRef: expect.stringMatching(/^RC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/),
      reference: opened.reference,
      orderRef: opened.orderRef,
      serviceName: "Guided Relaunch",
      amountMinor: 9900,
      currency: "GBP",
      paymentStatus: "Paid",
      providerLabel: "Card payment through Stripe",
    })
    expect(download.receiptRef).not.toBe(opened.orderRef)
    expect(JSON.stringify(download).replaceAll("Card payment through Stripe", "")).not.toMatch(/pi_|cs_|cus_|ch_|stripe/)
    const requestId = randomUUID()
    const documentId = randomUUID()
    const versionId = randomUUID()
    await db.query(
      `insert into public.evidence_requests(id, case_id, title, request_text, status, created_by)
       values ($1, $2, 'Ownership letter', 'Upload the ownership letter.', 'OPEN', $3)`,
      [requestId, opened.caseId, admin],
    )
    await db.query(
      `insert into public.case_documents(id, case_id, evidence_request_id, title, created_by)
       values ($1, $2, $3, 'Ownership letter', $4)`,
      [documentId, opened.caseId, requestId, admin],
    )
    await db.query(
      `insert into public.case_document_versions(
         id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
         storage_bucket, storage_key, upload_status, scan_status, validation_status, review_status, created_by
       ) values ($1, $2, 1, 'letter.pdf', 'application/pdf', 1024, 'evidence', $3,
         'UPLOADED', 'NO_THREATS_FOUND', 'VALID', 'ACCEPTED', $4)`,
      [versionId, documentId, `cases/${opened.caseId}/documents/${documentId}/versions/${versionId}`, admin],
    )
    await db.query("update public.evidence_requests set status = 'FULFILLED', fulfilled_at = now() where id = $1", [requestId])
    const factsPayload = (await db.query<{ value: unknown }>(
      "select public.admin_case_flow_facts_v1($1, $2::uuid[]) as value",
      [adminToken, [opened.caseId]],
    )).rows[0].value
    const facts = requiredCase(narrowCaseFlowFacts(factsPayload, [opened.caseId], {
      liveMailEnabled: false,
      paymentsEnabled: true,
      googleSubmissionLive: false,
    }), opened.caseId)
    const journey = presentCaseJourney(facts, "2026-10-26T16:40:00.000Z")
    expect(journey.steps.find(step => step.id === "SERVICE_ACTIVATION")?.state).toBe("COMPLETED")
    expect(journey.focusStepId).toBe("PREPARATION")
    expect(journey.steps.find(step => step.id === "PREPARATION")?.focus).toBe(true)
    const portalCase = await rpc<{ case: { attentionItems: Array<{ code: string }> } }>("customer_portal_case_v1", [alexSession, opened.reference])
    expect(portalCase.case.attentionItems.map(item => item.code)).not.toContain("GUIDED_PAYMENT")
    const ownList = JSON.stringify(await rpc("customer_portal_payments_v1", [alexSession]))
    expect(ownList).toContain(opened.orderRef)
    expect(ownList).not.toMatch(/cus_|pi_|cs_|sk_|whsec_|ch_/)
    const foreign = await rpc<{ found?: boolean }>("customer_portal_case_payments_v1", [samSession, opened.reference])
    expect(foreign.found).toBe(false)
    expect(JSON.stringify(await rpc("customer_portal_payments_v1", [samSession]))).not.toContain(opened.orderRef)
  })

  it("keeps the obligation due until the payment event arrives, in either order", async () => {
    const opened = await openGuided("PR-26-WKRSEQ")
    pin(opened, "cs_wkrseq", "pi_wkrseq")
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, "cs_wkrseq", "checkout.session"])).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrseqcs", "checkout.session.completed", "cs_wkrseq")).toMatchObject({ status: "success" })
    const checkoutOnly = await runWorker()
    expect(checkoutOnly.result).toMatchObject({ status: "success", counts: { claimed: 1, succeeded: 1 } })
    expect(await obligationState(opened.obligationId)).toBe("DUE")
    expect(await receiptCount(opened.orderId)).toBe(0)
    expect(await confirmationCount(opened.caseId)).toBe(0)
    expect(await receive("evt_wkrseqpi", "payment_intent.succeeded", "pi_wkrseq")).toMatchObject({ status: "success" })
    const paid = await runWorker()
    expect(paid.result).toMatchObject({ status: "success", counts: { claimed: 1, succeeded: 1 } })
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await confirmationCount(opened.caseId)).toBe(1)
  })

  it("completes a lease lost after the handler without a second receipt or email", async () => {
    const opened = await openGuided("PR-26-WKRLSE")
    pin(opened, "cs_wkrlos", "pi_wkrlos")
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, "cs_wkrlos", "checkout.session"])).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrloscs", "checkout.session.completed", "cs_wkrlos")).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrlospi", "payment_intent.succeeded", "pi_wkrlos")).toMatchObject({ status: "success" })
    const crashed = await runWorker(true)
    expect(crashed.result.status).toBe("error")
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await confirmationCount(opened.caseId)).toBe(1)
    expect(await rows<{ status: string }>(
      "select status from admin_private.jobs where idempotency_key = 'process-stripe-event:evt_wkrlospi'",
    )).toEqual([{ status: "RUNNING" }])
    await db.query(`update admin_private.jobs set lease_expires_at = now() - interval '1 minute' where idempotency_key = 'process-stripe-event:evt_wkrlospi'`)
    const recovered = await runWorker()
    expect(recovered.result).toMatchObject({ status: "success" })
    expect(recovered.result.counts.succeeded).toBeGreaterThanOrEqual(1)
    expect(sentMail).toHaveLength(1)
    expect(await rows<{ status: string }>("select status from admin_private.jobs where job_type = 'PROCESS_STRIPE_EVENT' order by idempotency_key")).toEqual([
      { status: "SUCCEEDED" },
      { status: "SUCCEEDED" },
    ])
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await confirmationCount(opened.caseId)).toBe(1)
  })

  it("denies a mismatched amount and leaves Guard, invoice and a live object unclaimed", async () => {
    const opened = await openGuided("PR-26-WKRAMT")
    pin(opened, "cs_wkramt", "pi_wkramt", opened.amountMinor + 1)
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, "cs_wkramt", "checkout.session"])).toMatchObject({ status: "success" })
    expect(await receive("evt_wkramtpi", "payment_intent.succeeded", "pi_wkramt")).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrguard", "checkout.session.completed", "cs_wkrguard")).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrbill", "invoice.paid", "in_wkrbill")).toMatchObject({ status: "success" })
    stripeState.checkout.cs_wkrguard = {
      id: "cs_wkrguard", mode: "subscription", status: "complete", payment_status: "paid",
      payment_intent: null, customer: stripeCustomerId, url: null, livemode: false,
      metadata: { guardSubscriptionId: "gsub_wkr" },
    }
    stripeState.checkout.cs_wkrliveobj = {
      id: "cs_wkrliveobj", mode: "payment", status: "complete", payment_status: "paid",
      payment_intent: "pi_wkrliveobj", customer: stripeCustomerId, url: null, livemode: true, metadata: {},
    }
    expect(await receive("evt_wkrliveobj", "checkout.session.completed", "cs_wkrliveobj")).toMatchObject({ status: "success" })
    const result = await runWorker()
    expect(result.result.status).toBe("success")
    expect(result.calls).not.toContain("guard_apply_subscription_event_v1")
    expect(await obligationState(opened.obligationId)).toBe("DUE")
    expect(await receiptCount(opened.orderId)).toBe(0)
    expect(await confirmationCount(opened.caseId)).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_wkramtpi' and processed")).toBe(1)
    expect(await count(
      "select count(*)::int as n from admin_private.job_outbox where event_key in ('process-stripe-event:evt_wkrguard', 'process-stripe-event:evt_wkrbill', 'process-stripe-event:evt_wkrliveobj') and promoted_at is null",
    )).toBe(3)
    expect(await count("select count(*)::int as n from admin_private.jobs where idempotency_key like '%evt_wkrguard%' or idempotency_key like '%evt_wkrbill%' or idempotency_key like '%evt_wkrliveobj%'")).toBe(0)
  })

  it("settles a PaymentIntent that arrives with no metadata once checkout has linked it", async () => {
    const opened = await openGuided("PR-26-WKRLNK")
    pin(opened, "cs_wkrord", "pi_wkrord")
    stripeState.intent.pi_wkrord = { ...stripeState.intent.pi_wkrord, metadata: {} }
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, "cs_wkrord", "checkout.session"])).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrordcs", "checkout.session.completed", "cs_wkrord")).toMatchObject({ status: "success" })
    expect(await receive("evt_wkrordpi", "payment_intent.succeeded", "pi_wkrord")).toMatchObject({ status: "success" })
    const settled = await runWorker()
    expect(settled.result).toMatchObject({ status: "success", counts: { claimed: 2, succeeded: 2, retried: 0, deadLettered: 0 } })
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await confirmationCount(opened.caseId)).toBe(1)
    expect(await rows<{ work_stage: string }>("select work_stage from public.cases where id = $1", [opened.caseId])).toEqual([{ work_stage: "PREPARATION" }])
    const replay = await runWorker()
    expect(replay.result.counts.claimed).toBe(0)
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(sentMail).toHaveLength(1)
  })
})
