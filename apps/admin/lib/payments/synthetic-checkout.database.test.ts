/**
 * PAY-ENV-05A settlement rehearsal. Synthetic identities go in through fixtures.
 * Quote acceptance and settlement go through the existing RPCs and the real
 * Stripe event handler. Event payloads here are assumed verified: this file
 * does not compute a Stripe signature. Checkout creation is covered by
 * test/pay-env-05/checkout-creation.database.test.ts. The Stripe SDK is mocked, so this file
 * never calls Stripe or a connected database.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { PGlite } from "@electric-sql/pglite"
import { sessionCookie } from "@/lib/auth/config"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { applyChain, preparePlatform } from "../recovery/harness"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../commercial/paid-service-approval.fixture"
import { devStripeOneShotBlock, devStripeOneShotCommand, settleClaimedStripeEvent } from "../jobs/dev-stripe-one-shot"
import type { JobHandlerResult, JobRpc } from "../jobs/model"

const stripeState = vi.hoisted(() => ({
  constructed: [] as string[],
  checkout: {} as Record<string, Record<string, unknown>>,
  intent: {} as Record<string, Record<string, unknown>>,
  setup: {} as Record<string, Record<string, unknown>>,
}))

vi.mock("stripe", () => ({
  default: class Stripe {
    constructor(key: string) {
      stripeState.constructed.push(key)
    }
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
    setupIntents = { retrieve: async (id: string) => {
      const row = stripeState.setup[id]
      if (!row) throw new Error(`missing setup ${id}`)
      return row
    } }
  },
}))

import { processStripeEventHandler } from "./handlers"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const sam = "77777777-7777-4777-8777-777777777777"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const samAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const adminToken = "a".repeat(64)
const testKey = "sk_test_placeholdernotarealkey"

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const key = () => randomUUID()
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

type Json = Record<string, unknown> & {
  status?: string
  id?: string
  version?: number
  quoteVersionId?: string
  providerOperationId?: string
  attemptId?: string
  idempotencyKey?: string
  amountMinor?: number
  orderRef?: string
}

type Opened = {
  reference: string
  caseId: string
  orderId: string
  orderRef: string
  amountMinor: number
  obligationId: string
  attemptId: string
  providerOperationId: string
  stripeCustomerId: string
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

async function portalSession(email: string, authUser: string) {
  const pending = hash(token())
  await rpc("customer_portal_begin_login_v1", [email, pending])
  await rpc("customer_portal_confirm_otp_sent_v1", [pending])
  const sessionHash = hash(token())
  const finished = await rpc<{ status: string }>("customer_portal_finish_otp_v1", [pending, sessionHash, authUser, email])
  if (finished.status !== "ok") throw new Error(finished.status)
  return sessionHash
}

async function priceId(code: string) {
  return (await rows<{ id: string }>("select id from public.price_versions where service_code = $1 and seed_key is not null", [code]))[0].id
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
    validUntil: later(), applyDiscount: false, priceVersionId: await priceId("GUIDED_RELAUNCH"),
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
  const accepted = await rpc<Json>("customer_action_command_v1", [session, key(), "accept", paidQuoteCommand({
    quoteVersionId: String(offered.quoteVersionId),
    serviceCode: "GUIDED_RELAUNCH",
  })])
  return accepted
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

beforeEach(() => {
  stripeState.constructed.length = 0
  stripeState.checkout = {}
  stripeState.intent = {}
  stripeState.setup = {}
  vi.stubEnv("PAYMENTS_PROVIDER_MODE", "stripe_test")
  vi.stubEnv("STRIPE_SECRET_KEY", testKey)
  vi.stubEnv("STRIPE_LIVE_ACTIVATION", "")
})
afterEach(() => vi.unstubAllEnvs())

function meta(opened: Opened, overrides: Record<string, string> = {}) {
  return {
    customerId: alex,
    serviceOrderId: opened.orderId,
    obligationId: opened.obligationId,
    attemptId: opened.attemptId,
    providerOperationId: opened.providerOperationId,
    orderRef: opened.orderRef,
    ...overrides,
  }
}

function jobRpc(calls: string[]): JobRpc {
  return {
    async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      calls.push(name)
      if (name === "payment_provider_lane_status_v1") return rpc<T>(name, [])
      if (name === "payment_apply_provider_event_v1" || name === "guard_apply_subscription_event_v1") {
        return rpc<T>(name, [args.p_event_id, args.p_type, args.p_object_id, args.p_payload])
      }
      if (name === "job_complete_v1") return rpc<T>(name, [args.p_job, args.p_lease])
      if (name === "job_fail_v1") return rpc<T>(name, [args.p_job, args.p_lease, args.p_error, args.p_retryable])
      throw new Error(name)
    },
  }
}

async function runHandler(eventId: string, eventType: string, objectId: string, livemode = false): Promise<{ result: JobHandlerResult; calls: string[] }> {
  const calls: string[] = []
  const result = await processStripeEventHandler().execute({
    idempotencyKey: `process-stripe-event:${eventId}`,
    payload: { eventId, eventType, objectId, livemode },
    rpc: jobRpc(calls),
  })
  return { result, calls }
}

async function openGuided(reference: string, stripeCustomerId: string): Promise<Opened> {
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
  expect(started.amountMinor).toBe(order.amount_minor)
  const mapped = await rpc<Json>("payment_ensure_customer_map_v1", [alex, stripeCustomerId])
  expect(mapped.status).toBe("success")
  return {
    reference, caseId, orderId: order.id, orderRef: order.public_ref, amountMinor: order.amount_minor,
    obligationId, attemptId: String(started.attemptId), providerOperationId: String(started.providerOperationId),
    stripeCustomerId,
  }
}

function pinCheckout(opened: Opened, checkoutId: string, paymentIntentId: string, overrides: Record<string, unknown> = {}) {
  stripeState.checkout[checkoutId] = {
    id: checkoutId,
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    payment_intent: paymentIntentId,
    customer: opened.stripeCustomerId,
    url: null,
    livemode: false,
    metadata: meta(opened),
    ...overrides,
  }
}

function pinIntent(opened: Opened, paymentIntentId: string, overrides: Record<string, unknown> = {}) {
  const metadata = { ...meta(opened), ...(overrides.metadata as Record<string, string> | undefined) }
  const { metadata: _ignored, ...rest } = overrides
  stripeState.intent[paymentIntentId] = {
    id: paymentIntentId,
    status: "succeeded",
    amount: opened.amountMinor,
    currency: "gbp",
    customer: opened.stripeCustomerId,
    livemode: false,
    latest_charge: "ch_synthcharge",
    metadata,
    ...rest,
  }
}

async function obligationState(id: string) {
  return (await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [id]))[0].state
}

async function receiptCount(orderId: string) {
  return count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [orderId])
}

async function ledgerEvents(obligationId: string) {
  return rows<{ event: string; amount_minor: number }>(
    "select event, amount_minor from public.payment_ledger where obligation_id = $1 order by created_at, event",
    [obligationId],
  )
}

describe("synthetic order-linked Stripe Checkout", () => {
  it("settles one guided checkout from assumed-verified event payloads and shows one owned receipt", async () => {
    const opened = await openGuided("PR-26-SYNCH2", "cus_synthalex")
    const checkoutId = "cs_synthpay02"
    const paymentIntentId = "pi_synthpay02"
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, checkoutId, "checkout.session"])).toMatchObject({ status: "success" })
    pinCheckout(opened, checkoutId, paymentIntentId)
    pinIntent(opened, paymentIntentId)
    const checkoutEvent = "evt_synthcs2"
    const paidEvent = "evt_synthpi2"
    expect(await rpc("payment_receive_stripe_event_v1", [checkoutEvent, "checkout.session.completed", checkoutId, false])).toMatchObject({ status: "success", duplicate: false })
    expect(await rpc("payment_receive_stripe_event_v1", [checkoutEvent, "checkout.session.completed", checkoutId, false])).toMatchObject({ status: "success", duplicate: true })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = $1", [`process-stripe-event:${checkoutEvent}`])).toBe(1)

    const correlated = await runHandler(checkoutEvent, "checkout.session.completed", checkoutId)
    expect(correlated.result).toEqual({ ok: true })
    expect(correlated.calls).toEqual(["payment_provider_lane_status_v1", "payment_apply_provider_event_v1"])
    expect(await obligationState(opened.obligationId)).toBe("DUE")
    expect(await receiptCount(opened.orderId)).toBe(0)

    expect(await rpc("payment_receive_stripe_event_v1", [paidEvent, "payment_intent.succeeded", paymentIntentId, false])).toMatchObject({ status: "success" })
    const paid = await runHandler(paidEvent, "payment_intent.succeeded", paymentIntentId)
    expect(paid.result).toEqual({ ok: true })
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await ledgerEvents(opened.obligationId)).toEqual([
      { event: "OBLIGATION_CREATED", amount_minor: opened.amountMinor },
      { event: "PROVIDER_PAYMENT_SUCCEEDED", amount_minor: opened.amountMinor },
      { event: "RECEIPT_RECORDED", amount_minor: opened.amountMinor },
    ])
    expect(stripeState.constructed).toEqual([testKey, testKey])
    expect(await count("select count(*)::int as n from public.guard_subscriptions")).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.job_outbox where topic <> 'PROCESS_STRIPE_EVENT'")).toBe(0)

    const replay = await runHandler(paidEvent, "payment_intent.succeeded", paymentIntentId)
    expect(replay.result).toEqual({ ok: true })
    const secondId = await runHandler("evt_synthpi2b", "payment_intent.succeeded", paymentIntentId)
    expect(secondId.result).toEqual({ ok: true })
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect((await ledgerEvents(opened.obligationId)).filter(row => row.event === "RECEIPT_RECORDED")).toHaveLength(1)

    const view = await rpc<{ case: { orders: Array<{ obligations: Array<{ state: string }>; receipts: Array<{ selector: string }> }>; actions: Array<{ kind: string }> } }>(
      "customer_portal_case_payments_v1",
      [alexSession, opened.reference],
    )
    expect(view.case.orders[0].obligations[0].state).toBe("PAID")
    expect(view.case.orders[0].receipts).toHaveLength(1)
    expect(view.case.actions.map(action => action.kind)).not.toContain("guided_payment")
    expect(JSON.stringify(view)).not.toMatch(/cus_|pi_|cs_|sk_|whsec_|ch_/)
    const download = await rpc<Record<string, unknown>>("customer_portal_receipt_v1", [alexSession, view.case.orders[0].receipts[0].selector])
    expect(download).toMatchObject({ status: "ok", reference: opened.reference, orderRef: opened.orderRef, amountMinor: opened.amountMinor, currency: "GBP" })
    expect(await rpc("customer_portal_case_payments_v1", [samSession, opened.reference])).toEqual({ found: false })
    expect(await rpc("customer_portal_receipt_v1", [samSession, view.case.orders[0].receipts[0].selector])).toEqual({ status: "not_found" })
  })

  it("pays from the PaymentIntent when it arrives before the Checkout event", async () => {
    const opened = await openGuided("PR-26-SYNCH3", "cus_synthalex")
    const paymentIntentId = "pi_synthpay03"
    pinIntent(opened, paymentIntentId)
    const early = await runHandler("evt_synthpi3", "payment_intent.succeeded", paymentIntentId)
    expect(early.result).toEqual({ ok: true })
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
    pinCheckout(opened, "cs_synthpay03", paymentIntentId)
    const later = await runHandler("evt_synthcs3", "checkout.session.completed", "cs_synthpay03")
    expect(later.result).toEqual({ ok: true })
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect(await obligationState(opened.obligationId)).toBe("PAID")
  })

  it("keeps a mismatch, a failure, the wrong lane and a Guard checkout unpaid", async () => {
    const opened = await openGuided("PR-26-SYNCH4", "cus_synthalex")
    const checkoutId = "cs_synthpay04"
    const paymentIntentId = "pi_synthpay04"
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, checkoutId, "checkout.session"])).toMatchObject({ status: "success" })

    pinIntent(opened, paymentIntentId, { amount: opened.amountMinor + 1 })
    const wrongAmount = await runHandler("evt_synthbadamt", "payment_intent.succeeded", paymentIntentId)
    expect(wrongAmount.result).toEqual({ ok: true })
    expect(await obligationState(opened.obligationId)).toBe("DUE")
    expect(await receiptCount(opened.orderId)).toBe(0)

    pinIntent(opened, paymentIntentId, { currency: "usd" })
    const wrongCurrency = await runHandler("evt_synthbadccy", "payment_intent.succeeded", paymentIntentId)
    expect(wrongCurrency.result).toEqual({ ok: true })
    expect(await receiptCount(opened.orderId)).toBe(0)

    pinIntent(opened, paymentIntentId, { metadata: { ...meta(opened), customerId: sam } })
    const wrongCustomer = await runHandler("evt_synthbadcus", "payment_intent.succeeded", paymentIntentId)
    expect(wrongCustomer.result).toEqual({ ok: true })
    expect(await receiptCount(opened.orderId)).toBe(0)

    pinIntent(opened, paymentIntentId, { metadata: { ...meta(opened), serviceOrderId: randomUUID() } })
    const wrongOrder = await runHandler("evt_synthbadord", "payment_intent.succeeded", paymentIntentId)
    expect(wrongOrder.result).toEqual({ ok: true })
    expect(await receiptCount(opened.orderId)).toBe(0)

    pinIntent(opened, paymentIntentId, { customer: "cus_someoneelse" })
    const wrongMap = await runHandler("evt_synthbadmap", "payment_intent.succeeded", paymentIntentId)
    expect(wrongMap.result).toEqual({ ok: true })
    expect(await obligationState(opened.obligationId)).toBe("DUE")

    pinIntent(opened, "pi_unknownmeta", {
      metadata: {
        customerId: alex,
        serviceOrderId: randomUUID(),
        obligationId: randomUUID(),
        attemptId: randomUUID(),
        providerOperationId: randomUUID(),
        orderRef: "SO-26-ZZZZZ2",
      },
    })
    const unmatched = await runHandler("evt_synthunmatch", "payment_intent.succeeded", "pi_unknownmeta")
    expect(unmatched.result).toEqual({ ok: false, retryable: true, error: "correlation_pending" })
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_synthunmatch' and processed")).toBe(0)

    const live = await runHandler("evt_synthlive", "payment_intent.succeeded", paymentIntentId, true)
    expect(live.result).toEqual({ ok: false, retryable: false, error: "Event livemode does not match the payment lane." })
    expect(live.calls).toEqual([])
    expect(await rpc("payment_apply_provider_event_v1", ["evt_synthliveapply", "payment_intent.succeeded", paymentIntentId, {
      livemode: true, paymentIntentStatus: "succeeded", amountMinor: opened.amountMinor, currency: "gbp",
      providerOperationId: opened.providerOperationId,
    }])).toMatchObject({ status: "denied", reason: "livemode" })
    expect(await receiptCount(opened.orderId)).toBe(0)

    pinIntent(opened, paymentIntentId, { status: "requires_payment_method", last_payment_error: { code: "card_declined" } })
    const failed = await runHandler("evt_synthfail", "payment_intent.payment_failed", paymentIntentId)
    expect(failed.result).toEqual({ ok: true })
    expect(await obligationState(opened.obligationId)).toBe("FAILED")
    expect(await receiptCount(opened.orderId)).toBe(0)
    expect((await ledgerEvents(opened.obligationId)).map(row => row.event)).toContain("PROVIDER_PAYMENT_FAILED")

    pinIntent(opened, paymentIntentId)
    const recovered = await runHandler("evt_syncrecover", "payment_intent.succeeded", paymentIntentId)
    expect(recovered.result).toEqual({ ok: true })
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)

    const guardId = randomUUID()
    stripeState.checkout.cs_guardpay = {
      id: "cs_guardpay",
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      livemode: false,
      metadata: { guardSubscriptionId: guardId },
      customer: opened.stripeCustomerId,
      url: null,
    }
    const guard = await runHandler("evt_synthguard", "checkout.session.completed", "cs_guardpay")
    expect(guard.calls).toEqual(["payment_provider_lane_status_v1", "guard_apply_subscription_event_v1"])
    expect(guard.calls).not.toContain("payment_apply_provider_event_v1")
    expect(await count("select count(*)::int as n from public.guard_subscriptions")).toBe(0)
    expect(await receiptCount(opened.orderId)).toBe(1)

    stripeState.setup.seti_synthpay = {
      id: "seti_synthpay",
      status: "succeeded",
      usage: "off_session",
      customer: opened.stripeCustomerId,
      payment_method: null,
      livemode: false,
      metadata: meta(opened),
    }
    const setup = await runHandler("evt_synthsetup", "setup_intent.succeeded", "seti_synthpay")
    expect(setup.calls).toContain("payment_apply_provider_event_v1")
    expect(await count("select count(*)::int as n from public.saved_payment_methods")).toBe(0)
    expect(await receiptCount(opened.orderId)).toBe(1)
  })

  it("replaces an expired Checkout and still records one receipt for the replacement", async () => {
    const opened = await openGuided("PR-26-SYNCH5", "cus_synthalex")
    const checkoutId = "cs_synthpay05"
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, checkoutId, "checkout.session"])).toMatchObject({ status: "success" })
    stripeState.checkout[checkoutId] = {
      id: checkoutId, mode: "payment", status: "expired", payment_status: "unpaid", livemode: false,
      metadata: meta(opened), customer: opened.stripeCustomerId, url: null,
    }
    const expired = await runHandler("evt_synthexpire", "checkout.session.expired", checkoutId)
    expect(expired.result).toEqual({ ok: true })
    expect((await rows<{ status: string }>("select status from public.payment_attempts where id = $1", [opened.attemptId]))[0].status).toBe("FAILED")
    expect(await receiptCount(opened.orderId)).toBe(0)
    const replaced = await rpc<Json>("payment_replace_expired_checkout_v1", [opened.providerOperationId, false])
    expect(replaced.status).toBe("success")
    expect(replaced.providerOperationId).not.toBe(opened.providerOperationId)
    const next: Opened = { ...opened, providerOperationId: String(replaced.providerOperationId), attemptId: String(replaced.attemptId) }
    const nextCheckout = "cs_synthpay05b"
    const nextIntent = "pi_synthpay05b"
    expect(await rpc("payment_record_provider_refs_v1", [next.providerOperationId, nextCheckout, "checkout.session"])).toMatchObject({ status: "success" })
    pinCheckout(next, nextCheckout, nextIntent)
    pinIntent(next, nextIntent)
    await runHandler("evt_synthcs5b", "checkout.session.completed", nextCheckout)
    const paid = await runHandler("evt_synthpi5b", "payment_intent.succeeded", nextIntent)
    expect(paid.result).toEqual({ ok: true })
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
  })

  it("claims the linked PaymentIntent through the one-shot lease and leaves other jobs queued", async () => {
    expect(devStripeOneShotBlock()).toBe("wrong_environment")
    const previewOrigin = "https://profilerelaunch-admin-git-develop-clientcove.vercel.app"
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret")
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test-publishable")
    vi.stubEnv("AWS_EVIDENCE_BUCKET", "profilerelaunch-evidence-dev-01")
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret_value")
    expect(devStripeOneShotBlock()).toBe("disabled")
    const jobsBeforeGate = await count("select count(*)::int as n from admin_private.jobs")
    const closed = await devStripeOneShotCommand(new NextRequest(`${previewOrigin}/api/operations/dev-stripe-reconcile`, {
      method: "POST",
      headers: {
        origin: previewOrigin,
        "content-type": "application/json",
        "idempotency-key": key(),
        cookie: `${sessionCookie}=${"d".repeat(64)}`,
      },
      body: JSON.stringify({ eventId: "evt_gate_closed", confirmed: true }),
    }))
    expect(closed.status).toBe(403)
    expect(await count("select count(*)::int as n from admin_private.jobs")).toBe(jobsBeforeGate)

    const opened = await openGuided("PR-26-SYNCH7", "cus_synthalex")
    expect(await rpc("payment_record_provider_refs_v1", [opened.providerOperationId, "cs_oneshot07", "checkout.session"])).toMatchObject({ status: "success" })
    await db.query("update public.admin_sessions set created_at = now() where token_hash = $1", [adminToken])
    const unrelated = [
      ["email-oneshot-0001", "SEND_EMAIL"],
      ["guard-oneshot-0001", "RECONCILE_GUARD_BILLING"],
    ] as const
    for (const [eventKey, topic] of unrelated) {
      await db.query(
        `select admin_private.enqueue_outbox_v1($1, $2, 'operator', null, '{}'::jsonb, now() - interval '1 hour')`,
        [eventKey, topic],
      )
    }
    const untouched = async () => JSON.stringify(await rows(
      `select event_key, topic, promoted_at is not null as promoted
       from admin_private.job_outbox where event_key = any($1::text[]) order by event_key`,
      [unrelated.map(([eventKey]) => eventKey)],
    ))
    const before = await untouched()

    expect(await rpc("payment_receive_stripe_event_v1", ["evt_oneshot_other", "customer.created", "cus_oneshotother", false])).toMatchObject({ status: "success" })
    expect(await rpc<Json>("admin_dev_stripe_one_shot_claim_v1", [adminToken, key(), "evt_oneshot_other", true, false])).toMatchObject({
      status: "denied", reason: "unsupported",
    })
    expect(await count("select count(*)::int as n from admin_private.job_outbox where event_key = 'process-stripe-event:evt_oneshot_other' and promoted_at is null")).toBe(1)

    const badIntent = "pi_oneshotbad"
    pinIntent(opened, badIntent, { amount: opened.amountMinor + 1 })
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_oneshot_bad", "payment_intent.succeeded", badIntent, false])).toMatchObject({ status: "success" })
    const badClaim = await rpc<Json>("admin_dev_stripe_one_shot_claim_v1", [adminToken, key(), "evt_oneshot_bad", true, false])
    expect(badClaim).toMatchObject({ status: "success", jobType: "PROCESS_STRIPE_EVENT", replay: false })
    const badSettle = await settleClaimedStripeEvent({ rpc: jobRpc([]), claim: badClaim })
    expect(badSettle.outcome).toBe("succeeded")
    expect(await obligationState(opened.obligationId)).toBe("DUE")
    expect(await receiptCount(opened.orderId)).toBe(0)
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_oneshot_bad' and processed")).toBe(1)

    const paymentIntentId = "pi_oneshotpay"
    pinIntent(opened, paymentIntentId)
    expect(await rpc("payment_receive_stripe_event_v1", ["evt_oneshot_paid", "payment_intent.succeeded", paymentIntentId, false])).toMatchObject({ status: "success" })
    const claimRequest = key()
    const claimed = await rpc<Json>("admin_dev_stripe_one_shot_claim_v1", [adminToken, claimRequest, "evt_oneshot_paid", true, false])
    expect(claimed).toMatchObject({
      status: "success",
      replay: false,
      jobType: "PROCESS_STRIPE_EVENT",
      eventId: "evt_oneshot_paid",
      idempotencyKey: "process-stripe-event:evt_oneshot_paid",
    })
    const calls: string[] = []
    const settled = await settleClaimedStripeEvent({ rpc: jobRpc(calls), claim: claimed })
    expect(settled).toEqual({ outcome: "succeeded", detail: "The selected test-mode Stripe event was processed." })
    expect(calls).toEqual(["payment_provider_lane_status_v1", "payment_apply_provider_event_v1", "job_complete_v1"])
    expect(await obligationState(opened.obligationId)).toBe("PAID")
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect((await ledgerEvents(opened.obligationId)).map(row => row.event)).toEqual([
      "OBLIGATION_CREATED",
      "PROVIDER_PAYMENT_SUCCEEDED",
      "RECEIPT_RECORDED",
    ])
    expect(await count("select count(*)::int as n from admin_private.stripe_event_receipts where provider_event_id = 'evt_oneshot_paid' and processed")).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.jobs where job_type <> 'PROCESS_STRIPE_EVENT'")).toBe(0)
    expect(await untouched()).toBe(before)

    const replay = await rpc<Json>("admin_dev_stripe_one_shot_claim_v1", [adminToken, claimRequest, "evt_oneshot_paid", true, false])
    expect(replay.replay).toBe(true)
    expect(replay.currentJobStatus).toBe("SUCCEEDED")
    const again = await rpc<Json>("admin_dev_stripe_one_shot_claim_v1", [adminToken, key(), "evt_oneshot_paid", true, false])
    expect(again).toMatchObject({ status: "denied", reason: "already_processed" })
    expect(await receiptCount(opened.orderId)).toBe(1)
    expect((await ledgerEvents(opened.obligationId)).filter(row => row.event === "RECEIPT_RECORDED")).toHaveLength(1)
  })
})
