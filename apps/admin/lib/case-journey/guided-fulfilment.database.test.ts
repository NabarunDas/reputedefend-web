/**
 * Disposable Guided fulfilment walk. Settlement is a test-mode provider event.
 * Nothing here connects to a live database, sends mail, or edits a real case.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../commercial/paid-service-approval.fixture"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import { settleDevSendEmailClaim, type DevSendClaim } from "../communications/dev-send"
import { sendEmailHandler } from "../communications/handler"
import { createIdempotentMailProvider } from "../communications/mail"
import { applyChain, preparePlatform } from "../recovery/harness"
import {
  guidedCompletionGuardSentence,
  guidedCustomerSubmitsSentence,
  renderGuidedCompletion,
  renderPackReady,
  renderPaymentConfirmation,
} from "../../../../lib/email/fulfilment"
import { renderPaymentRequest } from "../../../../lib/email/payment-request"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const alex = "22222222-2222-4222-8222-222222222222"
const sam = "77777777-7777-4777-8777-777777777777"
const alexAuth = "66666666-6666-4666-8666-666666666666"
const samAuth = "88888888-8888-4888-8888-888888888888"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const adminToken = "a".repeat(64)
const origin = "https://customer.example.test"
const fromAddress = "ops@example.com"
const packNote = "This exact evidence selection is the prepared pack for internal use."

type Json = Record<string, unknown> & {
  status?: string
  id?: string
  version?: number
  recordVersion?: number
  versionId?: string
  documentId?: string
  orderId?: string
  attemptId?: string
  providerOperationId?: string
  reason?: string
  replay?: boolean
  published?: boolean
  packEmail?: string
}

const token = () => randomBytes(32).toString("hex")
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const key = () => randomUUID()
const later = () => new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
const actionExpiry = () => new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString()

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
     values ($1,$2,'verified',now(),$3,$4)
     on conflict (customer_id, business_id) do update
       set status = 'verified', verified_at = now(), verified_by = excluded.verified_by, evidence = excluded.evidence`,
    [id, business, admin, "Companies House match discussed on a live call."],
  )
}

async function insertCase(reference: string, track = "GUIDED", caseType = "PROFILE_RECOVERY") {
  const id = randomUUID()
  await db.query(
    `insert into public.cases(
      id, public_ref, case_type, customer_id, business_id, location_id, issue_description,
      information_accurate_at, privacy_accepted_at, service_track
    ) values ($1,$2,$3,$4,$5,$6,'Profile suspended', now(), now(), $7)`,
    [id, reference, caseType, alex, business, location, track],
  )
  return id
}

async function acceptQuote(caseId: string, serviceCode = "GUIDED_RELAUNCH") {
  await verify()
  const draft = await rpc<Json>("admin_quote_command_v1", [adminToken, key(), "create_draft", {
    customerId: alex, businessId: business, caseId, locationId: location,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later payment collection are excluded.",
    validUntil: later(), applyDiscount: false, priceVersionId: await priceId(serviceCode),
    serviceCode,
  }, null])
  if (draft.status !== "success") throw new Error(`draft ${JSON.stringify(draft)}`)
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
    serviceCode,
    locationId: location,
    amountMinor: serviceCode === "GUIDED_REVIEW" ? 5900 : 9900,
  })])
  return accepted
}

async function caseVersion(caseId: string) {
  return (await rows<{ workflow_version: number }>("select workflow_version from public.cases where id = $1", [caseId]))[0].workflow_version
}

async function caseCmd(caseId: string, operation: string, data: Record<string, unknown>) {
  return rpc<Json>("admin_case_command_v1", [adminToken, key(), caseId, await caseVersion(caseId), operation, {
    note: "Reviewed the caller’s request and confirmed the details.", ...data,
  }])
}

async function guidedToPaymentRequired(caseId: string) {
  await caseCmd(caseId, "plan", { track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Review the request", due: null, firstResponseDue: null })
  await caseCmd(caseId, "transition", { target: "ASSESSMENT_READY", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "SERVICE_SELECTION", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
  await caseCmd(caseId, "transition", { target: "PAYMENT_REQUIRED", nextAction: "Follow up with customer", due: "2026-12-01T12:00:00Z" })
}

async function openPayment(orderId: string, version: number) {
  const secretHash = hash(token())
  const issued = await rpc<Json>("admin_payment_command_v1", [adminToken, key(), "issue_guided_payment_action", {
    serviceOrderId: orderId, expiresAt: actionExpiry(), secretHash,
  }, version])
  const pending = hash(token())
  const session = hash(token())
  await rpc("customer_action_exchange_v1", [issued.id, secretHash, pending])
  await rpc("customer_action_begin_otp_v1", [pending])
  await rpc("customer_action_confirm_otp_sent_v1", [pending])
  await rpc("customer_action_finish_otp_v1", [pending, session, alexAuth, "alex@example.com"])
  return { issued, session }
}

async function orderOf(caseId: string) {
  return (await rows<{ id: string; public_ref: string; amount_minor: number; record_version: number; service_code: string }>(
    "select id, public_ref, amount_minor, record_version, service_code from public.service_orders where case_id = $1",
    [caseId],
  ))[0]
}

async function checkout(caseId: string, suffix: string, opened?: { session: string }) {
  const order = await orderOf(caseId)
  const obligationId = (await rows<{ id: string }>(
    "select id from public.payment_obligations where service_order_id = $1 and kind = 'UPFRONT'",
    [order.id],
  ))[0].id
  const paymentSession = opened ?? await openPayment(order.id, order.record_version)
  const started = await rpc<Json>("customer_payment_command_v1", [paymentSession.session, key(), "start_checkout", { idempotencyKey: key() }])
  if (started.status !== "success") throw new Error(`checkout ${JSON.stringify(started)}`)
  const mapped = await rpc<Json>("payment_ensure_customer_map_v1", [alex, "cus_fulfil1"])
  if (mapped.status !== "success") throw new Error(`map ${JSON.stringify(mapped)}`)
  await rpc("payment_record_provider_refs_v1", [started.providerOperationId, `cs_${suffix}`, "checkout.session"])
  return { order, obligationId, started }
}

async function settle(caseId: string, suffix: string, eventId: string, opened?: { session: string }) {
  const intent = `pi_${suffix}`
  const { order, obligationId, started } = await checkout(caseId, suffix, opened)
  const unpaid = await rpc<Json>("payment_apply_provider_event_v1", [`${eventId}_checkout`, "checkout.session.completed", `cs_${suffix}`, {
    mode: "payment",
    paymentStatus: "unpaid",
    paymentIntentId: intent,
    livemode: false,
    customerId: alex,
    serviceOrderId: order.id,
    obligationId,
    attemptId: started.attemptId,
    providerOperationId: started.providerOperationId,
    orderRef: order.public_ref,
  }])
  const unknown = await rpc<Json>("payment_apply_provider_event_v1", [`${eventId}_unknown`, "customer.created", "cus_unknown1", { livemode: false }])
  const receiptsBeforeSuccess = await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])
  const stateBeforeSuccess = (await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [obligationId]))[0].state
  const settled = await rpc<Json>("payment_apply_provider_event_v1", [eventId, "payment_intent.succeeded", intent, {
    paymentIntentStatus: "succeeded",
    amountMinor: order.amount_minor,
    currency: "gbp",
    stripeCustomerId: "cus_fulfil1",
    customerId: alex,
    serviceOrderId: order.id,
    obligationId,
    attemptId: started.attemptId,
    providerOperationId: started.providerOperationId,
    orderRef: order.public_ref,
    livemode: false,
  }])
  const replay = await rpc<Json>("payment_apply_provider_event_v1", [eventId, "payment_intent.succeeded", intent, {
    paymentIntentStatus: "succeeded",
    amountMinor: order.amount_minor,
    currency: "gbp",
    livemode: false,
    customerId: alex,
    serviceOrderId: order.id,
    obligationId,
  }])
  return { order, obligationId, unpaid, unknown, settled, replay, receiptsBeforeSuccess, stateBeforeSuccess }
}

async function acceptedFile(caseId: string, filename: string, scan: "NO_THREATS_FOUND" | "THREATS_FOUND" = "NO_THREATS_FOUND", documentId: string | null = null) {
  const created = await rpc<Json>("admin_evidence_begin_v1", [
    adminToken, key(), caseId, documentId, filename, "application/pdf", 1024, "Completed statement", "test-evidence", null,
  ])
  if (!created.versionId) throw new Error(`begin ${JSON.stringify(created)}`)
  await rpc("admin_evidence_finalize_v1", [adminToken, key(), caseId, created.versionId])
  const validation = scan === "NO_THREATS_FOUND" ? "VALID" : "PENDING"
  await rpc("admin_evidence_refresh_scan_v1", [adminToken, key(), caseId, created.versionId, scan, validation, null])
  if (scan === "NO_THREATS_FOUND") {
    const meta = await rpc<Json>("admin_evidence_version_v1", [adminToken, caseId, created.versionId])
    const accepted = await rpc<Json>("admin_evidence_review_v1", [
      adminToken, key(), caseId, created.versionId, meta.recordVersion, "accept", "Accepted after a clean scan.", null,
    ])
    if (accepted.status !== "success") throw new Error(`accept ${JSON.stringify(accepted)}`)
    await setVisible(caseId, created.versionId!, true)
  }
  return created
}

async function setVisible(caseId: string, versionId: string, visible: boolean) {
  const meta = await rpc<Json>("admin_evidence_version_v1", [adminToken, caseId, versionId])
  const result = await rpc<Json>("admin_evidence_review_v1", [
    adminToken, key(), caseId, versionId, meta.recordVersion, "set_visibility",
    visible ? "Customer may see this accepted file." : "Hide this file from the customer pack.",
    visible,
  ])
  if (result.status !== "success") throw new Error(`visibility ${JSON.stringify(result)}`)
}

async function packCmd(caseId: string, operation: string, data: Record<string, unknown>, pack: string | null = null, version: number | null = null, request = key()) {
  return rpc<Json>("admin_prepared_pack_command_v1", [adminToken, request, caseId, pack, version, operation, data])
}

const sendSignatures: Record<string, string[]> = {
  communication_load_send_v1: ["p_communication", "p_content_version"],
  communication_begin_provider_attempt_v1: ["p_communication", "p_content_version", "p_idempotency_key"],
  communication_mark_provider_accepted_v1: ["p_communication", "p_provider", "p_provider_message_id", "p_idempotency_key"],
  communication_mark_acceptance_unknown_v1: ["p_communication", "p_idempotency_key"],
  communication_mark_provider_rejected_v1: ["p_communication", "p_error", "p_retryable", "p_idempotency_key"],
  job_complete_v1: ["p_job", "p_lease"],
  job_fail_v1: ["p_job", "p_lease", "p_error", "p_retryable"],
}

function namedRpc() {
  return {
    async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
      const order = sendSignatures[name] ?? Object.keys(args)
      const values = order.map(item => args[item] ?? null)
      return rpc<T>(name, values)
    },
  }
}

function mailPayload(rendered: { subject: string; text: string; html: string }, page: "payments" | "documents", extra: Record<string, unknown> = {}) {
  return {
    subject: rendered.subject,
    bodyText: rendered.text,
    bodyHtml: rendered.html,
    fromAddress,
    customerOrigin: origin,
    replyTo: "cases@profilerelaunch.com",
    sendEnabled: true,
    ...extra,
  }
}

async function providerAccept(communicationId: string, pageUrl: string) {
  const loaded = await rpc<Json>("communication_load_send_v1", [communicationId, 1])
  expect(loaded.status, JSON.stringify(loaded)).toBe("success")
  expect(loaded.customerOrigin).toBe(origin)
  expect(String(loaded.bodyText)).toContain(pageUrl)
  expect(`${loaded.bodyText}\n${loaded.bodyHtml}`).not.toMatch(/#t=|\/action\//)
  const claimed = await rpc<DevSendClaim>("admin_dev_send_email_claim_v1", [adminToken, key(), communicationId, true, origin])
  expect(claimed.status, JSON.stringify(claimed)).toBe("success")
  const provider = createIdempotentMailProvider()
  expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: claimed, provider })).toBe("succeeded")
  expect(provider.effects).toBe(1)
  expect(provider.payloads[0].text).toContain(pageUrl)
  expect(provider.payloads[0].text.match(/\/portal\/cases\//g)).toHaveLength(1)
  expect(`${provider.payloads[0].text}\n${provider.payloads[0].html}`).not.toMatch(/#t=|\/action\/|pi_|cus_/)
  expect((await rows<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [communicationId]))[0].delivery_status).toBe("PROVIDER_ACCEPTED")
  expect(await rpc<Json>("admin_dev_send_email_claim_v1", [adminToken, key(), communicationId, true, origin])).toMatchObject({ status: "denied", reason: "already_processed" })
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
      ('${alex}', 'Alex', 'alex@example.com'),
      ('${sam}', 'Sam', 'sam@example.com');
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

describe("guided fulfilment handover", () => {
  it("settles the accepted quote total and rejects a forged amount, currency, version or discount", async () => {
    const reference = "PR-26-FULAMT"
    const caseId = await insertCase(reference)
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const payment = await settle(caseId, "fulamt", "evt_fulamt")
    expect(payment.order.amount_minor).toBe(9900)
    expect(await rows<{ reason: string | null }>("select admin_private.guided_settlement_reason_v1($1) as reason", [caseId])).toEqual([{ reason: null }])
    const orderId = payment.order.id
    const quoteVersionId = (await rows<{ quote_version_id: string }>("select quote_version_id from public.service_orders where id = $1", [orderId]))[0].quote_version_id
    const acceptanceId = (await rows<{ quote_acceptance_id: string }>("select quote_acceptance_id from public.service_orders where id = $1", [orderId]))[0].quote_acceptance_id
    const obligationId = payment.obligationId

    async function reason(): Promise<string | null> {
      return (await rows<{ reason: string | null }>("select admin_private.guided_settlement_reason_v1($1) as reason", [caseId]))[0].reason
    }

    await db.exec("begin")
    try {
      await db.exec("set local session_replication_role = replica")
      await db.query("update public.service_orders set amount_minor = 1 where id = $1", [orderId])
      expect(await reason()).toBe("order")
      await db.query(`
        update public.quote_versions set total_amount_minor = 7920, quoted_subtotal_minor = 7920, standard_amount_minor = 7920 where id = $1
      `, [quoteVersionId])
      await db.query("update public.quote_acceptances set total_amount_minor = 7920 where id = $1", [acceptanceId])
      await db.query("update public.service_orders set amount_minor = 7920 where id = $1", [orderId])
      await db.query("update public.payment_obligations set amount_minor = 7920 where id = $1", [obligationId])
      await db.query("update public.payment_receipts set amount_minor = 7920 where obligation_id = $1", [obligationId])
      expect(await reason()).toBeNull()
      await db.query("update public.service_orders set currency = 'USD' where id = $1", [orderId])
      expect(await reason()).toBe("order")
      await db.query("update public.service_orders set currency = 'GBP' where id = $1", [orderId])
      await db.query("update public.quote_versions set status = 'OFFERED' where id = $1", [quoteVersionId])
      expect(await reason()).toBe("order")
      await db.query("update public.quote_versions set status = 'ACCEPTED' where id = $1", [quoteVersionId])
      await db.query("update public.cases set service_track = 'MANAGED' where id = $1", [caseId])
      expect(await reason()).toBe("not_guided")
      await expect(db.query(
        "update public.quote_versions set discount_policy_id = 'PAID_GUARD_MANAGED_20', discount_bps = 2000 where id = $1",
        [quoteVersionId],
      )).rejects.toThrow(/discount|check/i)
    } finally {
      await db.exec("rollback")
    }
    expect(await reason()).toBeNull()
    expect(payment.order.amount_minor).toBe(9900)
  })

  it("settles £99 once, queues one receipt email, and keeps checkout and a failed webhook unpaid", async () => {
    const reference = "PR-26-FULF99"
    const caseId = await insertCase(reference)
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const before = await count("select count(*)::int as n from public.payment_receipts")
    const payment = await settle(caseId, "fulf99", "evt_fulf99")
    expect(payment.order.amount_minor).toBe(9900)
    expect(payment.receiptsBeforeSuccess).toBe(0)
    expect(payment.stateBeforeSuccess).not.toBe("PAID")
    expect((await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [payment.obligationId]))[0].state).toBe("PAID")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [payment.obligationId])).toBe(1)
    expect(payment.settled.status, JSON.stringify({ settled: payment.settled, unpaid: payment.unpaid, unknown: payment.unknown })).toBe("success")
    expect(payment.replay.status).toBe("success")
    expect(await count("select count(*)::int as n from public.payment_receipts")).toBe(before + 1)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [payment.obligationId])).toBe(1)
    const context = await rpc<Json>("payment_confirmation_context_v1", ["pi_fulf99"])
    const receiptRef = (await rows<{ public_ref: string }>("select public_ref from public.payment_receipts where obligation_id = $1", [payment.obligationId]))[0].public_ref
    expect(context).toMatchObject({
      status: "applicable",
      alreadyQueued: false,
      caseRef: reference,
      orderRef: payment.order.public_ref,
      receiptRef,
      amountMinor: 9900,
      currency: "GBP",
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
    })
    const rendered = renderPaymentConfirmation({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      orderRef: payment.order.public_ref,
      caseRef: reference,
      receiptRef,
      amountMinor: 9900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    expect(rendered).not.toBeNull()
    const queued = await rpc<Json>("payment_queue_confirmation_v1", [{
      ...mailPayload(rendered!, "payments"),
      paymentIntentId: "pi_fulf99",
    }])
    expect(queued, JSON.stringify(queued)).toMatchObject({ status: "success", replay: false })
    const replay = await rpc<Json>("payment_queue_confirmation_v1", [{
      ...mailPayload(rendered!, "payments"),
      paymentIntentId: "pi_fulf99",
    }])
    expect(replay).toMatchObject({ status: "success", id: queued.id, replay: true })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'PAYMENT_CONFIRMATION'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.guided_payment_confirmations where receipt_id = (select id from public.payment_receipts where obligation_id = $1)", [payment.obligationId])).toBe(1)
    const loaded = await rpc<Json>("communication_load_send_v1", [queued.id, 1])
    expect(loaded.status, JSON.stringify(loaded)).toBe("success")
    expect(loaded.customerOrigin).toBe(origin)
    expect(String(loaded.bodyText)).toContain("£99.00 GBP")
    expect(String(loaded.bodyText)).not.toMatch(/pi_|cus_/)
    const claimed = await rpc<DevSendClaim>("admin_dev_send_email_claim_v1", [adminToken, key(), queued.id, true, origin])
    expect(claimed.status, JSON.stringify(claimed)).toBe("success")
    const provider = createIdempotentMailProvider()
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: claimed, provider })).toBe("succeeded")
    expect(provider.effects).toBe(1)
    expect(provider.payloads[0].text).toContain(`${origin}/portal/cases/${reference}/payments`)
    expect(provider.payloads[0].text.match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(`${provider.payloads[0].text}\n${provider.payloads[0].html}`).not.toMatch(/#t=|\/action\/|pi_|cus_/)
    expect((await rows<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [queued.id]))[0].delivery_status).toBe("PROVIDER_ACCEPTED")
    expect(await rpc<Json>("admin_dev_send_email_claim_v1", [adminToken, key(), queued.id, true, origin])).toMatchObject({ status: "denied", reason: "already_processed" })
    await expect(db.query(
      `insert into public.payment_receipts(
        obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency, tax_behaviour, tax_amount_minor
      )
      select obligation_id, service_order_id, customer_id, null, amount_minor, currency, tax_behaviour, tax_amount_minor
      from public.payment_receipts where obligation_id = $1`,
      [payment.obligationId],
    )).rejects.toThrow(/unique|duplicate|receipt|null/i)
  })

  it("refuses an unpaid, unsafe or unauthorised pack, then publishes one portal pack and one announcement", async () => {
    const reference = "PR-26-FULF99"
    const caseId = (await rows<{ id: string }>("select id from public.cases where public_ref = $1", [reference]))[0].id
    const order = await orderOf(caseId)
    const threat = await acceptedFile(caseId, "malware.pdf", "THREATS_FOUND")
    const draft = await packCmd(caseId, "create", {})
    expect(draft.status).toBe("success")
    expect((await packCmd(caseId, "add_item", { versionId: threat.versionId, role: "EVIDENCE" }, draft.id, draft.recordVersion)).status).toBe("denied")
    const statement = await acceptedFile(caseId, "statement.pdf")
    const source = (await rows<{ source: string; request: string | null }>(
      "select submission_source as source, customer_evidence_request_id as request from public.case_document_versions where id = $1",
      [statement.versionId],
    ))[0]
    expect(source).toEqual({ source: "ADMIN", request: null })
    const added = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, draft.id, draft.recordVersion)
    expect(added.status, JSON.stringify(added)).toBe("success")
    expect(await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, added.recordVersion)).toMatchObject({ status: "denied", reason: "instructions" })
    const instructions = await acceptedFile(caseId, "instructions.pdf")
    const withRole = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, added.recordVersion)
    expect(withRole.status).toBe("success")
    expect((await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "NOT_A_ROLE" }, draft.id, withRole.recordVersion)).status).toBe("invalid")
    const removed = await packCmd(caseId, "remove_item", { versionId: instructions.versionId }, draft.id, withRole.recordVersion)
    expect(removed.status).toBe("success")
    expect(await count("select count(*)::int as n from public.guided_pack_item_roles where item_id not in (select id from public.case_prepared_pack_items)")).toBe(0)
    const restored = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, removed.recordVersion)
    expect(restored.status).toBe("success")
    const statementDocument = (await rows<{ document_id: string }>("select document_id from public.case_document_versions where id = $1", [statement.versionId]))[0].document_id
    const sameDocument = await acceptedFile(caseId, "statement-again.pdf", "NO_THREATS_FOUND", statementDocument)
    await db.exec(`begin; set local session_replication_role = replica; update public.case_document_versions set review_status = 'ACCEPTED' where id = '${statement.versionId}'; commit;`)
    const withoutDistinct = await packCmd(caseId, "remove_item", { versionId: instructions.versionId }, draft.id, restored.recordVersion)
    const duplicated = await packCmd(caseId, "add_item", { versionId: sameDocument.versionId, role: "INSTRUCTIONS" }, draft.id, withoutDistinct.recordVersion)
    expect(await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, duplicated.recordVersion)).toMatchObject({ status: "denied", reason: "document" })
    const withoutDuplicate = await packCmd(caseId, "remove_item", { versionId: sameDocument.versionId }, draft.id, duplicated.recordVersion)
    const distinctAgain = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, withoutDuplicate.recordVersion)
    expect(distinctAgain.status).toBe("success")
    const loose = await acceptedFile(caseId, "loose.pdf")
    const untagged = await packCmd(caseId, "add_item", { versionId: loose.versionId }, draft.id, distinctAgain.recordVersion)
    expect(untagged.status).toBe("success")
    expect(await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, untagged.recordVersion)).toMatchObject({ status: "denied", reason: "role" })
    const withoutLoose = await packCmd(caseId, "remove_item", { versionId: loose.versionId }, draft.id, untagged.recordVersion)
    const otherCase = await insertCase("PR-26-FULFRN")
    const foreign = await acceptedFile(otherCase, "foreign.pdf")
    expect((await packCmd(caseId, "add_item", { versionId: foreign.versionId, role: "EVIDENCE" }, draft.id, withoutLoose.recordVersion)).status).toBe("denied")
    const customerRequest = randomUUID()
    await db.query(
      `insert into public.evidence_requests(id, case_id, title, request_text, status, created_by)
       values ($1,$2,'Customer photo','Upload a photo of the premises.','OPEN',$3)`,
      [customerRequest, caseId, admin],
    )
    await db.query(
      `update public.case_document_versions
       set submission_source = 'CUSTOMER', customer_evidence_request_id = $2, portal_submission = true
       where id = $1`,
      [statement.versionId, customerRequest],
    )
    expect(await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withoutLoose.recordVersion)).toMatchObject({ status: "denied", reason: "author" })
    await db.query(
      `update public.case_document_versions
       set submission_source = 'ADMIN', customer_evidence_request_id = null, portal_submission = false
       where id = $1`,
      [statement.versionId],
    )
    const withoutStatement = await packCmd(caseId, "remove_item", { versionId: statement.versionId }, draft.id, withoutLoose.recordVersion)
    expect(await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withoutStatement.recordVersion)).toMatchObject({ status: "denied", reason: "deliverable" })
    const statementBack = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, draft.id, withoutStatement.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, statementBack.recordVersion)
    expect(approved.status, JSON.stringify(approved)).toBe("success")

    const membershipVersion = (await rows<{ record_version: number }>(
      "select record_version from public.business_memberships where customer_id = $1 and business_id = $2",
      [alex, business],
    ))[0].record_version
    const pendingMembership = await rpc<Json>("admin_membership_save_v1", [
      adminToken, alex, business, membershipVersion, "pending", "Authority is being rechecked before publication.", key(),
    ])
    expect(pendingMembership.status, JSON.stringify(pendingMembership)).toBe("success")
    const unauthorised = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)
    expect(unauthorised).toMatchObject({ status: "denied", reason: "authority" })
    await verify()
    await setVisible(caseId, statement.versionId!, false)
    expect(await rows<{ reason: string | null }>("select admin_private.pack_publication_block_v1($1) as reason", [draft.id])).toEqual([{ reason: null }])

    const partial = await packCmd(caseId, "publish", { note: packNote, confirmed: true, subject: "Only a subject" }, draft.id, approved.recordVersion)
    expect(partial.status).toBe("denied")
    expect((await rows<{ published_at: string | null }>("select published_at from public.case_prepared_packs where id = $1", [draft.id]))[0].published_at).toBeNull()
    const silent = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)
    expect(silent, JSON.stringify(silent)).toMatchObject({ status: "success", packEmail: "skipped" })
    expect((await rows<{ customer_visible: boolean }>("select customer_visible from public.case_document_versions where id = $1", [statement.versionId]))[0].customer_visible).toBe(true)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(0)
    const recoveredMail = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: order.amount_minor,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const withheld = await packCmd(caseId, "send_pack_email", { ...mailPayload(recoveredMail!, "documents"), replyTo: "" }, draft.id, silent.recordVersion)
    expect(withheld).toMatchObject({ status: "denied", reason: "reply_to" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(0)
    const recovered = await packCmd(caseId, "send_pack_email", mailPayload(recoveredMail!, "documents"), draft.id, silent.recordVersion)
    expect(recovered, JSON.stringify(recovered)).toMatchObject({ status: "success", packEmail: "success", published: true })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)
    expect(await packCmd(caseId, "send_pack_email", mailPayload(recoveredMail!, "documents"), draft.id, silent.recordVersion)).toMatchObject({ status: "success", packEmail: "already_queued" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)
    const withdrawn = await packCmd(caseId, "unpublish", { confirmed: true, reason: packNote }, draft.id, silent.recordVersion)
    expect(withdrawn.status, JSON.stringify(withdrawn)).toBe("success")

    const rendered = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: order.amount_minor,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    expect(rendered).not.toBeNull()
    const published = await packCmd(caseId, "publish", { note: packNote, confirmed: true, ...mailPayload(rendered!, "documents") }, draft.id, withdrawn.recordVersion)
    expect(published, JSON.stringify(published)).toMatchObject({ status: "success", published: true, packEmail: "success" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)
    const announcement = await rpc<Json>("communication_load_send_v1", [
      (await rows<{ id: string }>("select communication_id as id from public.guided_pack_announcements where pack_id = $1", [draft.id]))[0].id,
      1,
    ])
    expect(announcement.status).toBe("success")
    expect(announcement.customerOrigin).toBe(origin)
    expect(String(announcement.bodyText)).toContain(guidedCustomerSubmitsSentence)
    expect(String(announcement.bodyText).match(/\/portal\/cases\//g)).toHaveLength(1)
    const packClaim = await rpc<DevSendClaim>("admin_dev_send_email_claim_v1", [adminToken, key(), announcement.communicationId, true, origin])
    expect(packClaim.status, JSON.stringify(packClaim)).toBe("success")
    let packSends = 0
    const unknownPack = await sendEmailHandler({}, {
      async send() {
        packSends += 1
        return { ok: false, retryable: true, acceptanceUnknown: true, error: "provider timed out" }
      },
    }).execute({
      idempotencyKey: String(packClaim.idempotencyKey),
      payload: packClaim.payload ?? {},
      rpc: namedRpc(),
    })
    expect(unknownPack.ok).toBe(false)
    expect(packSends).toBe(1)
    await db.query("update admin_private.jobs set lease_expires_at = now() - interval '1 second' where id = $1", [packClaim.jobId])
    expect(await rpc<Json>("admin_dev_send_email_claim_v1", [adminToken, key(), announcement.communicationId, true, origin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(packSends).toBe(1)

    const documents = await rpc<{
      found: boolean
      documents: Array<{ selector: string; filename: string }>
      pack: { title: string; serviceName: string; instructions: string; instructionSelectors: string[]; customerSubmitted: boolean; correctionRequested: boolean } | null
    }>("customer_portal_case_documents_v1", [alexSession, reference])
    expect(documents.found).toBe(true)
    expect(documents.pack).toMatchObject({
      title: "Guided Relaunch submission pack",
      serviceName: "Guided Relaunch",
      instructions: guidedCustomerSubmitsSentence,
      customerSubmitted: false,
      correctionRequested: false,
    })
    expect(documents.pack?.instructionSelectors).toEqual(["pd-1"])
    expect(documents.documents.map(item => item.filename).sort()).toEqual(["instructions.pdf", "statement.pdf"])
    const resolved = await rpc<{ found: boolean; available: boolean; storageKey?: string }>("customer_portal_document_resolve_v1", [alexSession, reference, "pd-2"])
    expect(resolved).toMatchObject({ found: true, available: true })
    expect(resolved.storageKey).toContain(String(statement.versionId))
    expect(await rpc("customer_portal_document_access_v1", [alexSession, key(), reference, "pd-2"])).toEqual({ status: "success" })
    expect(await rpc("customer_portal_document_resolve_v1", [samSession, reference, "pd-2"])).toEqual({ found: false })
    expect(JSON.stringify(documents)).not.toMatch(/pi_|cus_|storage_key|amazonaws/i)

    const correction = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "request_correction", { note: "Please correct the opening date in the statement." },
    ])
    expect(correction).toMatchObject({ status: "success", kind: "CORRECTION" })
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN' and owner = 'ADMIN' and title = 'Review a correction to the Guided pack'", [caseId])).toBe(1)
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "request_correction", { note: "Please also correct the town name in the statement." },
    ])).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and title = 'Review a correction to the Guided pack'", [caseId])).toBe(1)
    await db.query(
      `update public.case_tasks set status = 'DONE', resolved_at = now(), resolution = 'Corrected the opening date in the statement.'
       where case_id = $1 and status = 'OPEN' and title = 'Review a correction to the Guided pack'`,
      [caseId],
    )
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "request_correction", { note: "Please also correct the town name in the statement." },
    ])).toMatchObject({ status: "success", kind: "CORRECTION" })
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent this pack through the Google appeals tool.",
        submittedOn: "2026-10-20",
        googleReference: "https://google.example/appeal",
      },
    ])).toMatchObject({ status: "invalid" })
    const reported = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent this pack through the Google appeals tool.",
        submittedOn: "2026-10-20",
      },
    ])
    expect((await rows<{ google_reference: string | null }>(
      "select google_reference from public.guided_customer_reports where pack_id = $1 and kind = 'GOOGLE_SUBMISSION'",
      [draft.id],
    ))[0].google_reference).toBeNull()
    expect(reported).toMatchObject({ status: "success", kind: "GOOGLE_SUBMISSION" })
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent this pack through the Google appeals tool.",
        submittedOn: "2026-10-20",
        googleReference: "GOOGLE-FULFIL-2",
      },
    ])).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.case_submission_results")).toBe(0)
    const afterReport = await rpc<{ pack: { customerSubmitted: boolean; correctionRequested: boolean } }>("customer_portal_case_documents_v1", [alexSession, reference])
    expect(afterReport.pack).toMatchObject({ customerSubmitted: true, correctionRequested: true })

    const replacementFile = await acceptedFile(caseId, "statement-v2.pdf")
    const replacementInstructions = await acceptedFile(caseId, "instructions-v2.pdf")
    const next = await packCmd(caseId, "create", {})
    const nextItem = await packCmd(caseId, "add_item", { versionId: replacementFile.versionId, role: "DELIVERABLE" }, next.id, next.recordVersion)
    const nextInstructions = await packCmd(caseId, "add_item", { versionId: replacementInstructions.versionId, role: "INSTRUCTIONS" }, next.id, nextItem.recordVersion)
    const nextApproved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, next.id, nextInstructions.recordVersion)
    const nextRendered = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: order.amount_minor,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const nextPublished = await packCmd(caseId, "publish", {
      note: packNote, confirmed: true, ...mailPayload(nextRendered!, "documents"),
    }, next.id, nextApproved.recordVersion)
    expect(nextPublished, JSON.stringify(nextPublished)).toMatchObject({ status: "success", packEmail: "success" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(2)
    expect(await count("select count(*)::int as n from public.case_prepared_packs where id = $1 and unpublished_at is not null", [draft.id])).toBe(1)
    const current = await rpc<{ documents: Array<{ filename: string }>; pack: { packNumber: number; customerSubmitted: boolean; correctionRequested: boolean } }>("customer_portal_case_documents_v1", [alexSession, reference])
    expect(current.documents.map(item => item.filename).sort()).toEqual(["instructions-v2.pdf", "statement-v2.pdf"])
    expect(current.pack.packNumber).toBeGreaterThan(1)
    expect(current.pack).toMatchObject({ customerSubmitted: false, correctionRequested: false })
    const currentStatement = await rpc<{ available: boolean; storageKey?: string }>("customer_portal_document_resolve_v1", [alexSession, reference, "pd-1"])
    expect(currentStatement.available).toBe(true)
    expect(currentStatement.storageKey).toContain(String(replacementFile.versionId))
    expect(currentStatement.storageKey).not.toContain(String(statement.versionId))
    const receiptsBeforeReport = await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])
    const reportedAgain = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent the corrected pack through the Google appeals tool.",
        submittedOn: "2026-10-21",
        googleReference: "GOOGLE-FULFIL-2",
      },
    ])
    expect(reportedAgain).toMatchObject({ status: "success", kind: "GOOGLE_SUBMISSION" })
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent the corrected pack through the Google appeals tool.",
        submittedOn: "2026-10-21",
        googleReference: "GOOGLE-FULFIL-3",
      },
    ])).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from public.guided_customer_reports where case_id = $1 and kind = 'GOOGLE_SUBMISSION'", [caseId])).toBe(2)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toBe(receiptsBeforeReport)
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
  })

  it("settles Guided Review at £59 and still hides a pack that has not been paid", async () => {
    const declinedRef = "PR-26-FULBAD"
    const declined = await insertCase(declinedRef)
    expect((await acceptQuote(declined)).status).toBe("success")
    await guidedToPaymentRequired(declined)
    const opened = await checkout(declined, "fulbad")
    const failed = await rpc<Json>("payment_apply_provider_event_v1", ["evt_fulbad", "payment_intent.payment_failed", "pi_fulbad", {
      paymentIntentStatus: "requires_payment_method",
      failureCode: "card_declined",
      amountMinor: opened.order.amount_minor,
      currency: "gbp",
      livemode: false,
      customerId: alex,
      serviceOrderId: opened.order.id,
      obligationId: opened.obligationId,
      attemptId: opened.started.attemptId,
      providerOperationId: opened.started.providerOperationId,
      orderRef: opened.order.public_ref,
    }])
    expect(failed.status, JSON.stringify(failed)).toBe("success")
    expect((await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [opened.obligationId]))[0].state).toBe("FAILED")
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [opened.obligationId])).toBe(0)
    expect((await rpc<Json>("payment_confirmation_context_v1", ["pi_fulbad"])).status).toBe("not_applicable")
    const hiddenPack = await packCmd(declined, "create", {})
    const hiddenFile = await acceptedFile(declined, "declined.pdf")
    const hiddenItem = await packCmd(declined, "add_item", { versionId: hiddenFile.versionId, role: "DELIVERABLE" }, hiddenPack.id, hiddenPack.recordVersion)
    expect(await packCmd(declined, "approve", { note: packNote, confirmed: true }, hiddenPack.id, hiddenItem.recordVersion)).toMatchObject({ status: "denied", reason: "instructions" })
    const hiddenInstructions = await acceptedFile(declined, "declined-instructions.pdf")
    const hiddenWithInstructions = await packCmd(declined, "add_item", { versionId: hiddenInstructions.versionId, role: "INSTRUCTIONS" }, hiddenPack.id, hiddenItem.recordVersion)
    const hiddenApproved = await packCmd(declined, "approve", { note: packNote, confirmed: true }, hiddenPack.id, hiddenWithInstructions.recordVersion)
    expect(await packCmd(declined, "publish", { note: packNote, confirmed: true }, hiddenPack.id, hiddenApproved.recordVersion)).toMatchObject({ status: "denied", reason: "unpaid" })

    const reference = "RV-26-FULF59"
    const caseId = await insertCase(reference, "GUIDED", "REVIEW_PROTECTION")
    expect((await acceptQuote(caseId, "GUIDED_REVIEW")).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const file = await acceptedFile(caseId, "review-notes.pdf")
    const reviewInstructions = await acceptedFile(caseId, "review-instructions.pdf")
    const draft = await packCmd(caseId, "create", {})
    const added = await packCmd(caseId, "add_item", { versionId: file.versionId, role: "DELIVERABLE" }, draft.id, draft.recordVersion)
    const withInstructions = await packCmd(caseId, "add_item", { versionId: reviewInstructions.versionId, role: "INSTRUCTIONS" }, draft.id, added.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withInstructions.recordVersion)
    const early = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)
    expect(early).toMatchObject({ status: "denied", reason: "unpaid" })
    expect(await rpc("customer_portal_case_documents_v1", [alexSession, reference])).toMatchObject({
      found: true,
      documents: [],
      pack: null,
    })
    const payment = await settle(caseId, "fulf59", "evt_fulf59")
    expect(payment.order.amount_minor).toBe(5900)
    expect(payment.settled.status).toBe("success")
    expect((await rpc<Json>("payment_confirmation_context_v1", ["pi_fulf59"])).status).toBe("applicable")
    const rendered = renderPackReady({
      serviceCode: "GUIDED_REVIEW",
      serviceName: "Guided Review",
      caseRef: reference,
      amountMinor: 5900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const version = (await rows<{ record_version: number }>("select record_version from public.case_prepared_packs where id = $1", [draft.id]))[0].record_version
    const published = await packCmd(caseId, "publish", { note: packNote, confirmed: true, ...mailPayload(rendered!, "documents") }, draft.id, version)
    expect(published, JSON.stringify(published)).toMatchObject({ status: "success", packEmail: "success" })
    const documents = await rpc<{ pack: { title: string; serviceName: string } | null }>("customer_portal_case_documents_v1", [alexSession, reference])
    expect(documents.pack).toMatchObject({ title: "Guided Review submission pack", serviceName: "Guided Review" })
  })

  it("walks an accepted Guided quote through payment, the pack, closure and a later correction", async () => {
    const reference = "PR-26-FULCLS"
    const caseId = await insertCase(reference)
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const summary = "Your Guided Relaunch pack is complete. You submit it to Google yourself."
    const note = "Closed after the completed pack was available in the portal. Notification is recorded separately."
    const order = await orderOf(caseId)
    expect(order.amount_minor).toBe(9900)
    expect(order.service_code).toBe("GUIDED_RELAUNCH")
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary },
    ])).toMatchObject({ status: "denied", reason: "unpaid" })
    const openedPayment = await openPayment(order.id, order.record_version)
    const payable = await orderOf(caseId)
    const paymentRequest = renderPaymentRequest({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      orderRef: order.public_ref,
      caseRef: reference,
      amountMinor: order.amount_minor,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    expect(paymentRequest?.buttonLabel).toBe("Pay £99.00 securely")
    const paymentBody = {
      serviceOrderId: order.id,
      version: payable.record_version,
      ...mailPayload(paymentRequest!, "payments"),
    }
    const queuedPayment = await rpc<Json>("admin_queue_guided_payment_request_v1", [adminToken, key(), paymentBody])
    expect(queuedPayment, JSON.stringify(queuedPayment)).toMatchObject({ status: "success", replay: false })
    const paymentsUrl = `${origin}/portal/cases/${reference}/payments`
    await providerAccept(String(queuedPayment.id), paymentsUrl)
    const queuedAgain = await rpc<Json>("admin_queue_guided_payment_request_v1", [adminToken, key(), paymentBody])
    expect(queuedAgain).toMatchObject({ status: "success", replay: true, id: queuedPayment.id })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PAYMENT_REQUEST'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.customer_actions where service_order_id = $1 and kind = 'GUIDED_PAYMENT'", [order.id])).toBe(1)
    expect(queuedPayment.reusedAction).toBe(true)

    const statement = await acceptedFile(caseId, "closure-statement.pdf")
    const draft = await packCmd(caseId, "create", {})
    const added = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, draft.id, draft.recordVersion)
    expect(await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, added.recordVersion)).toMatchObject({ status: "denied", reason: "instructions" })
    const instructions = await acceptedFile(caseId, "closure-instructions.pdf")
    const withInstructions = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, added.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withInstructions.recordVersion)
    expect(approved.status, JSON.stringify(approved)).toBe("success")
    expect(await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)).toMatchObject({ status: "denied", reason: "unpaid" })

    const payment = await settle(caseId, "fulcls", "evt_fulcls", openedPayment)
    expect(payment.settled.status).toBe("success")
    expect(payment.order.amount_minor).toBe(9900)
    expect(payment.receiptsBeforeSuccess).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [payment.obligationId])).toBe(1)
    expect((await rows<{ state: string }>("select state from public.service_orders where id = $1", [order.id]))[0].state).toBe("ACCEPTED_AWAITING_PAYMENT")
    expect((await rows<{ state: string }>("select state from public.payment_obligations where id = $1", [payment.obligationId]))[0].state).toBe("PAID")
    const quoteVersionId = (await rows<{ quote_version_id: string }>("select quote_version_id from public.service_orders where id = $1", [order.id]))[0].quote_version_id
    const acceptanceId = (await rows<{ quote_acceptance_id: string }>("select quote_acceptance_id from public.service_orders where id = $1", [order.id]))[0].quote_acceptance_id
    await db.exec("begin")
    try {
      await db.exec("set local session_replication_role = replica")
      await db.query("update public.service_orders set amount_minor = 1 where id = $1", [order.id])
      expect((await rows<{ reason: string | null }>("select admin_private.guided_settlement_reason_v1($1) as reason", [caseId]))[0].reason).toBe("order")
      await db.query("update public.quote_versions set total_amount_minor = 7920, quoted_subtotal_minor = 7920, standard_amount_minor = 7920 where id = $1", [quoteVersionId])
      await db.query("update public.quote_acceptances set total_amount_minor = 7920 where id = $1", [acceptanceId])
      await db.query("update public.service_orders set amount_minor = 7920 where id = $1", [order.id])
      await db.query("update public.payment_obligations set amount_minor = 7920 where id = $1", [payment.obligationId])
      await db.query("update public.payment_receipts set amount_minor = 7920 where obligation_id = $1", [payment.obligationId])
      expect((await rows<{ reason: string | null }>("select admin_private.guided_settlement_reason_v1($1) as reason", [caseId]))[0].reason).toBeNull()
      await expect(db.query(
        "update public.quote_versions set discount_policy_id = 'PAID_GUARD_MANAGED_20', discount_bps = 2000 where id = $1",
        [quoteVersionId],
      )).rejects.toThrow(/discount|check/i)
    } finally {
      await db.exec("rollback")
    }
    expect((await rows<{ reason: string | null }>("select admin_private.guided_settlement_reason_v1($1) as reason", [caseId]))[0].reason).toBeNull()
    expect((await rows<{ amount_minor: number }>("select amount_minor from public.service_orders where id = $1", [order.id]))[0].amount_minor).toBe(9900)

    const confirmationReceipt = (await rows<{ public_ref: string }>("select public_ref from public.payment_receipts where obligation_id = $1", [payment.obligationId]))[0].public_ref
    const confirmation = renderPaymentConfirmation({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      orderRef: order.public_ref,
      caseRef: reference,
      receiptRef: confirmationReceipt,
      amountMinor: 9900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const queuedConfirmation = await rpc<Json>("payment_queue_confirmation_v1", [{
      ...mailPayload(confirmation!, "payments"),
      paymentIntentId: "pi_fulcls",
    }])
    expect(queuedConfirmation, JSON.stringify(queuedConfirmation)).toMatchObject({ status: "success", replay: false })
    const failedClaim = await rpc<DevSendClaim>("admin_dev_send_email_claim_v1", [adminToken, key(), queuedConfirmation.id, true, origin])
    expect(failedClaim.status, JSON.stringify(failedClaim)).toBe("success")
    let failedSends = 0
    const failedSend = await sendEmailHandler({}, {
      async send() {
        failedSends += 1
        return { ok: false, retryable: false, error: "mailbox rejected the recipient" }
      },
    }).execute({
      idempotencyKey: String(failedClaim.idempotencyKey),
      payload: failedClaim.payload ?? {},
      rpc: namedRpc(),
    })
    expect(failedSend.ok).toBe(false)
    expect(failedSends).toBe(1)
    expect((await rows<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [queuedConfirmation.id]))[0].delivery_status).toBe("FAILED")
    await db.query("update admin_private.jobs set lease_expires_at = now() - interval '1 second' where id = $1", [failedClaim.jobId])
    expect(await rpc<Json>("admin_dev_send_email_claim_v1", [adminToken, key(), queuedConfirmation.id, true, origin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(failedSends).toBe(1)
    expect(await rpc<Json>("payment_queue_confirmation_v1", [{
      ...mailPayload(confirmation!, "payments"),
      paymentIntentId: "pi_fulcls",
    }])).toMatchObject({ status: "success", id: queuedConfirmation.id, replay: true })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'PAYMENT_CONFIRMATION'", [caseId])).toBe(1)

    const packMail = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: 9900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const published = await packCmd(caseId, "publish", {
      note: packNote, confirmed: true, ...mailPayload(packMail!, "documents"),
    }, draft.id, approved.recordVersion)
    expect(published, JSON.stringify(published)).toMatchObject({ status: "success", packEmail: "success" })
    const packAnnouncement = (await rows<{ id: string }>("select communication_id as id from public.guided_pack_announcements where pack_id = $1", [draft.id]))[0].id
    await providerAccept(packAnnouncement, `${origin}/portal/cases/${reference}/documents`)
    const downloaded = await rpc<{ found: boolean; available: boolean; storageKey?: string }>(
      "customer_portal_document_resolve_v1", [alexSession, reference, "pd-1"],
    )
    expect(downloaded).toMatchObject({ found: true, available: true })
    expect(downloaded.storageKey).toContain(String(statement.versionId))
    const instructionDownload = await rpc<{ found: boolean; available: boolean; storageKey?: string }>(
      "customer_portal_document_resolve_v1", [alexSession, reference, "pd-2"],
    )
    expect(instructionDownload).toMatchObject({ found: true, available: true })
    expect(instructionDownload.storageKey).toContain(String(instructions.versionId))
    expect(await rpc("customer_portal_document_access_v1", [alexSession, key(), reference, "pd-1"])).toEqual({ status: "success" })
    expect(await rpc("customer_portal_document_resolve_v1", [samSession, reference, "pd-1"])).toEqual({ found: false })

    const reported = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I submitted this pack through the Google appeals form.",
        submittedOn: "2026-10-21",
        googleReference: "GOOGLE-FULCLS-1",
      },
    ])
    expect(reported).toMatchObject({ status: "success", kind: "GOOGLE_SUBMISSION" })
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I submitted this pack through the Google appeals form.",
        submittedOn: "2026-10-21",
        googleReference: "GOOGLE-FULCLS-2",
      },
    ])).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.case_submission_results")).toBe(0)

    const correction = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "request_correction", { note: "Please correct the business name on the statement." },
    ])
    expect(correction).toMatchObject({ status: "success", kind: "CORRECTION" })
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary },
    ])).toMatchObject({ status: "open_work" })
    expect(await caseCmd(caseId, "close", { summary })).toMatchObject({ status: "invalid" })
    expect(await caseCmd(caseId, "close", {
      outcome: "RESTORED",
      summary: "Google restored the profile after the appeal.",
    })).toMatchObject({ status: "denied" })

    const openTasks = await rows<{ id: string }>("select id from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])
    expect(openTasks.length).toBeGreaterThan(0)
    for (const task of openTasks) {
      expect((await caseCmd(caseId, "resolve_task", { taskId: task.id, status: "DONE" })).status).toBe("success")
    }
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])).toBe(0)

    const partial = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary, subject: "Only a subject" },
    ])
    expect(partial, JSON.stringify(partial)).toMatchObject({ status: "denied", reason: "mail" })
    expect((await rows<{ status: string }>("select status from public.cases where id = $1", [caseId]))[0].status).not.toBe("CLOSED")

    const quietVersion = await caseVersion(caseId)
    const quietRequest = key()
    const quiet = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, quietRequest, caseId, quietVersion, { note, summary },
    ])
    expect(quiet, JSON.stringify(quiet)).toMatchObject({ status: "success", completionEmail: "not_sent" })
    expect(quiet).not.toHaveProperty("recovered")
    expect((await rows<{ status: string; work_stage: string; outcome: string | null }>(
      "select status, work_stage, outcome from public.cases where id = $1", [caseId],
    ))[0]).toMatchObject({ status: "CLOSED", work_stage: "FINISHED", outcome: null })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_COMPLETION'", [caseId])).toBe(0)
    expect((await rows<{ communication_id: string | null }>(
      "select communication_id from public.guided_service_deliveries where case_id = $1", [caseId],
    ))[0].communication_id).toBeNull()
    expect((await rpc<Json>("admin_guided_completion_context_v1", [adminToken, caseId])).status).toBe("applicable")

    const rendered = renderGuidedCompletion({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: 9900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    expect(rendered).not.toBeNull()
    expect(rendered!.text).toContain("Reply to this email")
    const missingReply = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId),
      { note, summary, ...mailPayload(rendered!, "documents"), replyTo: "" },
    ])
    expect(missingReply, JSON.stringify(missingReply)).toMatchObject({ status: "denied", reason: "reply_to" })
    expect((await rows<{ status: string }>("select status from public.cases where id = $1", [caseId]))[0].status).toBe("CLOSED")
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_COMPLETION'", [caseId])).toBe(0)
    const payload = { note, summary, ...mailPayload(rendered!, "documents") }
    const recoveryVersion = await caseVersion(caseId)
    const recoveryId = key()
    const recovered = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, recoveryId, caseId, recoveryVersion, payload,
    ])
    expect(recovered, JSON.stringify(recovered)).toMatchObject({ status: "success", id: caseId, completionEmail: "success", recovered: true })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_COMPLETION'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.guided_completion_notices where case_id = $1", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toBe(1)
    expect((await rpc<Json>("admin_guided_completion_context_v1", [adminToken, caseId])).status).toBe("already_queued")
    const recoveryReplay = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, recoveryId, caseId, recoveryVersion, payload,
    ])
    expect(recoveryReplay).toMatchObject({ status: "success", completionEmail: "success", recovered: true })
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), payload,
    ])).toMatchObject({ status: "success", completionEmail: "already_queued", recovered: true })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_COMPLETION'", [caseId])).toBe(1)
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, quietRequest, caseId, quietVersion, { note, summary },
    ])).toMatchObject({ status: "success", completionEmail: "not_sent" })

    const completionId = (await rows<{ id: string }>(
      "select communication_id as id from public.guided_completion_notices where case_id = $1",
      [caseId],
    ))[0].id
    const loaded = await rpc<Json>("communication_load_send_v1", [completionId, 1])
    expect(loaded.status, JSON.stringify(loaded)).toBe("success")
    expect(loaded.customerOrigin).toBe(origin)
    expect(String(loaded.bodyText)).toContain(guidedCustomerSubmitsSentence)
    expect(String(loaded.bodyText)).toContain(guidedCompletionGuardSentence)
    expect(String(loaded.bodyText).match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(String(loaded.bodyText)).not.toMatch(/pi_|cus_/)
    const unknownClaim = await rpc<DevSendClaim>("admin_dev_send_email_claim_v1", [adminToken, key(), completionId, true, origin])
    expect(unknownClaim.status, JSON.stringify(unknownClaim)).toBe("success")
    let unknownSends = 0
    const unknown = await sendEmailHandler({}, {
      async send() {
        unknownSends += 1
        return { ok: false, retryable: true, acceptanceUnknown: true, error: "provider timed out" }
      },
    }).execute({
      idempotencyKey: String(unknownClaim.idempotencyKey),
      payload: unknownClaim.payload ?? {},
      rpc: namedRpc(),
    })
    expect(unknown.ok).toBe(false)
    expect(unknownSends).toBe(1)
    await db.query("update admin_private.jobs set lease_expires_at = now() - interval '1 second' where id = $1", [unknownClaim.jobId])
    expect(await rpc<Json>("admin_dev_send_email_claim_v1", [adminToken, key(), completionId, true, origin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(unknownSends).toBe(1)
    expect((await rows<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [completionId]))[0].delivery_status).toBe("ACCEPTANCE_UNKNOWN")
    expect(await count("select count(*)::int as n from public.guard_subscriptions")).toBe(0)
    const event = await rows<{ details: { fulfilment?: string } }>(
      "select details from public.case_work_events where case_id = $1 and event = 'close'",
      [caseId],
    )
    expect(event[0]?.details.fulfilment).toBe("guided_preparation")

    const receiptsBeforeCorrection = await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])
    const afterClose = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "request_correction", { note: "Please correct the opening date after closure." },
    ])
    expect(afterClose).toMatchObject({ status: "success", kind: "CORRECTION" })
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toMatchObject({ status: "CLOSED", outcome: null })
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN' and kind = 'FOLLOW_UP'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toBe(receiptsBeforeCorrection)

    const replacementFile = await acceptedFile(caseId, "closure-statement-v2.pdf")
    const replacementInstructions = await acceptedFile(caseId, "closure-instructions-v2.pdf")
    const next = await packCmd(caseId, "create", {})
    const nextItem = await packCmd(caseId, "add_item", { versionId: replacementFile.versionId, role: "DELIVERABLE" }, next.id, next.recordVersion)
    const nextInstructions = await packCmd(caseId, "add_item", { versionId: replacementInstructions.versionId, role: "INSTRUCTIONS" }, next.id, nextItem.recordVersion)
    const nextApproved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, next.id, nextInstructions.recordVersion)
    expect(nextApproved.status, JSON.stringify(nextApproved)).toBe("success")
    expect(await count("select count(*)::int as n from public.case_prepared_packs where id = $1 and unpublished_at is not null", [draft.id])).toBe(1)
    const nextRendered = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: 9900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const nextPublished = await packCmd(caseId, "publish", {
      note: packNote, confirmed: true, ...mailPayload(nextRendered!, "documents"),
    }, next.id, nextApproved.recordVersion)
    expect(nextPublished, JSON.stringify(nextPublished)).toMatchObject({ status: "success", packEmail: "success" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(2)
    const replacementAnnouncement = (await rows<{ id: string }>("select communication_id as id from public.guided_pack_announcements where pack_id = $1", [next.id]))[0].id
    await providerAccept(replacementAnnouncement, `${origin}/portal/cases/${reference}/documents`)
    const current = await rpc<{ available: boolean; storageKey?: string }>("customer_portal_document_resolve_v1", [alexSession, reference, "pd-1"])
    expect(current.available).toBe(true)
    expect(current.storageKey).toContain(String(replacementFile.versionId))
    expect(current.storageKey).not.toContain(String(statement.versionId))
    const currentInstructions = await rpc<{ available: boolean; storageKey?: string }>("customer_portal_document_resolve_v1", [alexSession, reference, "pd-2"])
    expect(currentInstructions.storageKey).toContain(String(replacementInstructions.versionId))
    expect(currentInstructions.storageKey).not.toContain(String(instructions.versionId))
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toMatchObject({ status: "CLOSED", outcome: null })
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [order.id])).toBe(1)
    expect(await count("select count(*)::int as n from public.service_orders where case_id = $1", [caseId])).toBe(1)
    const reportedAgain = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent the corrected pack through the Google appeals tool.",
        submittedOn: "2026-10-22",
        googleReference: "GOOGLE-FULCLS-3",
      },
    ])
    expect(reportedAgain).toMatchObject({ status: "success", kind: "GOOGLE_SUBMISSION" })
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent the corrected pack through the Google appeals tool.",
        submittedOn: "2026-10-22",
        googleReference: "GOOGLE-FULCLS-4",
      },
    ])).toMatchObject({ status: "conflict" })
    expect(await count("select count(*)::int as n from public.guided_customer_reports where case_id = $1 and kind = 'GOOGLE_SUBMISSION'", [caseId])).toBe(2)
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.guard_subscriptions")).toBe(0)
  })

  it("advances a published Guided pack from preparation to ready for the customer, and rolls that back when publication fails", async () => {
    const reference = "PR-26-STAGE2"
    const caseId = await insertCase(reference)
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const statement = await acceptedFile(caseId, "stage-statement.pdf")
    const instructions = await acceptedFile(caseId, "stage-instructions.pdf")
    const draft = await packCmd(caseId, "create", {})
    const added = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, draft.id, draft.recordVersion)
    const withInstructions = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, added.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withInstructions.recordVersion)
    expect(approved.status).toBe("success")
    const payment = await settle(caseId, "stage2", "evt_stage2")
    expect(payment.settled.status).toBe("success")
    const receipts = await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])
    expect((await rows<{ work_stage: string; next_action: string }>(
      "select work_stage, next_action from public.cases where id = $1", [caseId],
    ))[0].work_stage).toBe("PREPARATION")
    const blocked = await rows<{ value: { status?: string; reason?: string } }>(
      "select admin_private.advance_guided_published_pack_stage_v1($1, c) as value from public.cases c where c.id = $2",
      [adminToken, caseId],
    )
    expect(blocked[0].value).toMatchObject({ status: "denied", reason: "prerequisite" })
    expect((await rows<{ work_stage: string }>("select work_stage from public.cases where id = $1", [caseId]))[0].work_stage).toBe("PREPARATION")

    const partial = await packCmd(caseId, "publish", { note: packNote, confirmed: true, subject: "Only a subject" }, draft.id, approved.recordVersion)
    expect(partial).toMatchObject({ status: "denied" })
    expect((await rows<{ published_at: string | null; work_stage: string }>(
      `select p.published_at, c.work_stage from public.case_prepared_packs p join public.cases c on c.id = p.case_id where p.id = $1`,
      [draft.id],
    ))[0]).toMatchObject({ published_at: null, work_stage: "PREPARATION" })
    expect(await count("select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'to' = 'READY_TO_SUBMIT'", [caseId])).toBe(0)

    await db.query("delete from admin_private.case_transitions where from_stage = 'PREPARATION' and to_stage = 'READY_TO_SUBMIT'")
    try {
      const conflicted = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)
      expect(conflicted).toMatchObject({ status: "denied", reason: "transition" })
      expect((await rows<{ published_at: string | null; work_stage: string }>(
        `select p.published_at, c.work_stage from public.case_prepared_packs p join public.cases c on c.id = p.case_id where p.id = $1`,
        [draft.id],
      ))[0]).toMatchObject({ published_at: null, work_stage: "PREPARATION" })
    } finally {
      await db.query("insert into admin_private.case_transitions(from_stage, to_stage) values ('PREPARATION', 'READY_TO_SUBMIT') on conflict do nothing")
    }

    const request = key()
    const published = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion, request)
    expect(published, JSON.stringify(published)).toMatchObject({ status: "success", published: true, packEmail: "skipped", workStage: "READY_TO_SUBMIT" })
    expect(await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion, request)).toEqual(published)
    const again = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, published.recordVersion)
    expect(again).toMatchObject({ status: "success", workStage: "READY_TO_SUBMIT" })
    const moved = (await rows<{ work_stage: string; status: string; next_action: string; outcome: string | null; closed_at: string | null }>(
      "select work_stage, status, next_action, outcome, closed_at from public.cases where id = $1",
      [caseId],
    ))[0]
    expect(moved).toMatchObject({
      work_stage: "READY_TO_SUBMIT",
      status: "UNDER_REVIEW",
      next_action: "The customer has the published pack and chooses if and when to submit it to Google. Do not record a Google submission until the customer confirms it.",
      outcome: null,
      closed_at: null,
    })
    expect(await count("select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'from' = 'PREPARATION' and details->>'to' = 'READY_TO_SUBMIT'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])).toBe(receipts)

    const beforeMail = await rpc<{ found: boolean; case: { workStage: string }; timeline: { code: string }[] }>("customer_portal_case_v1", [alexSession, reference])
    expect(beforeMail.case.workStage).toBe("READY_TO_SUBMIT")
    expect(beforeMail.timeline.map(event => event.code)).toContain("PACK_PUBLISHED")
    expect(beforeMail.timeline.map(event => event.code)).not.toContain("NOTIFICATION_DELIVERED")
    expect(JSON.stringify(beforeMail)).not.toMatch(/alex@example.com|readAt|openedAt/)

    const withdrawn = await packCmd(caseId, "unpublish", { confirmed: true, reason: packNote }, draft.id, again.recordVersion)
    expect(withdrawn.status).toBe("success")
    expect((await rows<{ work_stage: string }>("select work_stage from public.cases where id = $1", [caseId]))[0].work_stage).toBe("READY_TO_SUBMIT")
    expect((await rpc<{ pack: unknown }>("customer_portal_case_documents_v1", [alexSession, reference])).pack).toBeNull()
    const hidden = await rpc<{ timeline: { code: string }[] }>("customer_portal_case_v1", [alexSession, reference])
    expect(hidden.timeline.map(event => event.code)).not.toContain("PACK_PUBLISHED")

    const rendered = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: payment.order.amount_minor,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const republished = await packCmd(caseId, "publish", {
      note: packNote, confirmed: true, ...mailPayload(rendered!, "documents"),
    }, draft.id, withdrawn.recordVersion)
    expect(republished).toMatchObject({ status: "success", packEmail: "success", workStage: "READY_TO_SUBMIT" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'to' = 'READY_TO_SUBMIT'", [caseId])).toBe(1)
    const communicationId = (await rows<{ id: string }>("select communication_id as id from public.guided_pack_announcements where pack_id = $1", [draft.id]))[0].id
    await providerAccept(communicationId, `${origin}/portal/cases/${reference}/documents`)
    const acceptedOnly = await rpc<{ timeline: { code: string }[] }>("customer_portal_case_v1", [alexSession, reference])
    expect(acceptedOnly.timeline.map(event => event.code)).toContain("PACK_PUBLISHED")
    expect(acceptedOnly.timeline.map(event => event.code)).not.toContain("NOTIFICATION_DELIVERED")
    const messageId = (await rows<{ provider_message_id: string }>("select provider_message_id from public.communications where id = $1", [communicationId]))[0].provider_message_id
    const deliveredAt = "2026-10-30T09:17:00.000Z"
    expect(await rpc<Json>("communication_apply_provider_event_v1", ["resend", "evt_stage2_delivered", "email.delivered", messageId, deliveredAt])).toMatchObject({ applied: true })
    expect(await rpc<Json>("communication_apply_provider_event_v1", ["resend", "evt_stage2_delivered", "email.delivered", messageId, deliveredAt])).toMatchObject({ duplicate: true })
    expect(await rpc<Json>("communication_apply_provider_event_v1", ["resend", "evt_stage2_opened", "email.opened", messageId, "2026-10-30T09:20:00.000Z"])).toMatchObject({ applied: false })
    const delivered = await rpc<{ timeline: { code: string; occurredAt: string }[] }>("customer_portal_case_v1", [alexSession, reference])
    const deliveredEvents = delivered.timeline.filter(event => event.code === "NOTIFICATION_DELIVERED")
    expect(deliveredEvents).toHaveLength(1)
    expect(Date.parse(deliveredEvents[0].occurredAt)).toBe(Date.parse(deliveredAt))
    expect(delivered.timeline.map(event => event.code)).not.toContain("SUBMITTED_TO_GOOGLE")
    expect(JSON.stringify(delivered)).not.toMatch(/alex@example.com|readAt|openedAt/)
    expect((await rows<{ status: string; work_stage: string }>("select status, work_stage from public.cases where id = $1", [caseId]))[0]).toEqual({ status: "UNDER_REVIEW", work_stage: "READY_TO_SUBMIT" })
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])).toBe(receipts)

    await db.exec("begin")
    try {
      await db.query("update public.cases set work_stage = 'PREPARATION' where id = $1", [caseId])
      expect((await rows<{ ready: boolean }>("select admin_private.case_stage_ready_v1(c, 'READY_TO_SUBMIT') as ready from public.cases c where id = $1", [caseId]))[0].ready).toBe(true)
      expect(await caseCmd(caseId, "transition", {
        target: "READY_TO_SUBMIT",
        nextAction: "The customer has the published pack and chooses if and when to submit it to Google. Do not record a Google submission until the customer confirms it.",
      })).toMatchObject({ status: "success" })
    } finally {
      await db.exec("rollback")
    }
    expect((await rows<{ work_stage: string }>("select work_stage from public.cases where id = $1", [caseId]))[0].work_stage).toBe("READY_TO_SUBMIT")
  })

  it("keeps the new handover tables closed to portal and service roles", async () => {
    for (const table of [
      "public.guided_pack_item_roles",
      "public.guided_payment_confirmations",
      "public.guided_pack_announcements",
      "public.guided_customer_reports",
      "admin_private.guided_handover_receipts",
      "public.guided_completion_notices",
      "public.guided_service_deliveries",
    ]) {
      for (const role of ["anon", "authenticated", "service_role"]) {
        const privilege = await db.query<{ ok: boolean }>("select has_table_privilege($1, $2, 'SELECT') as ok", [role, table])
        expect(privilege.rows[0].ok, `${role} ${table}`).toBe(false)
      }
    }
    const anonQueue = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.payment_queue_confirmation_v1(jsonb)', 'EXECUTE') as ok",
    )
    const serviceQueue = await db.query<{ ok: boolean }>(
      "select has_function_privilege('service_role', 'public.payment_queue_confirmation_v1(jsonb)', 'EXECUTE') as ok",
    )
    expect(anonQueue.rows[0].ok).toBe(false)
    expect(serviceQueue.rows[0].ok).toBe(true)
    const closeSignature = "public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)"
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('anon', $1, 'EXECUTE') as ok", [closeSignature])).rows[0].ok).toBe(false)
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'EXECUTE') as ok", [closeSignature])).rows[0].ok).toBe(true)
  })

  it("keeps an approved assessment current when a prepared pack is added or revised", async () => {
    const reference = "PR-26-EVBASE"
    const caseId = await insertCase(reference)
    const request = await rpc<Json>("admin_evidence_request_v1", [
      adminToken, key(), caseId, null, null, "create", "Ownership letter", "Upload the ownership letter for this bakery.", null, null,
    ])
    expect(request.status, JSON.stringify(request)).toBe("success")
    const evidence = await rpc<Json>("admin_evidence_begin_v1", [
      adminToken, key(), caseId, null, "ownership-letter.pdf", "application/pdf", 1024, "Ownership letter", "test-evidence", request.id,
    ])
    expect(evidence.versionId, JSON.stringify(evidence)).toBeTruthy()
    await rpc("admin_evidence_finalize_v1", [adminToken, key(), caseId, evidence.versionId])
    await rpc("admin_evidence_refresh_scan_v1", [adminToken, key(), caseId, evidence.versionId, "NO_THREATS_FOUND", "VALID", null])
    const evidenceMeta = await rpc<Json>("admin_evidence_version_v1", [adminToken, caseId, evidence.versionId])
    expect((await rpc<Json>("admin_evidence_review_v1", [
      adminToken, key(), caseId, evidence.versionId, evidenceMeta.recordVersion, "accept", "Accepted after a clean scan.", null,
    ])).status).toBe("success")
    await setVisible(caseId, evidence.versionId!, true)
    expect((await rpc<Json>("admin_evidence_request_v1", [
      adminToken, key(), caseId, request.id, request.version, "fulfill", null, null, null, "Completed after the customer sent the letter.",
    ])).status).toBe("success")

    const draftAssessment = {
      recordVersion: 0,
      findings: "The profile was suspended and the ownership letter matches the bakery account.",
      evidenceConsidered: "One accepted ownership letter is the assessment evidence.",
      profileIssue: "The Google listing is suspended.",
      policyConcerns: "Ownership of the profile is the policy concern in view.",
      recommendedAction: "Recommend Guided recovery and leave the quote for a later step.",
      servicePathway: "GUIDED",
      rationale: "The accepted evidence is enough to recommend Guided rather than Managed.",
      risks: "Google may still refuse the recovery request.",
      outstandingInformation: "",
    }
    const saved = await rpc<Json>("admin_case_assessment_command_v1", [adminToken, key(), caseId, await caseVersion(caseId), "save_draft", draftAssessment])
    expect(saved.status, JSON.stringify(saved)).toBe("success")
    const submitted = await rpc<Json>("admin_case_assessment_command_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), "submit_review", { recordVersion: saved.recordVersion },
    ])
    expect(submitted.status, JSON.stringify(submitted)).toBe("success")
    const approved = await rpc<Json>("admin_case_assessment_command_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), "approve", { recordVersion: submitted.recordVersion },
    ])
    expect(approved.status, JSON.stringify(approved)).toBe("success")

    const stored = async () => (await rows<{ basis_fingerprint: string }>(
      "select basis_fingerprint from public.case_assessments where case_id = $1 and status = 'APPROVED' order by version_number desc limit 1",
      [caseId],
    ))[0].basis_fingerprint
    const live = async () => (await rows<{ fp: string }>(
      "select admin_private.case_assessment_fingerprint_v1(admin_private.case_assessment_basis_v1($1)) as fp",
      [caseId],
    ))[0].fp
    const documentIds = async () => (await rows<{ id: string }>(
      "select item->>'id' as id from jsonb_array_elements(admin_private.case_assessment_basis_v1($1)->'documents') item",
      [caseId],
    )).map(row => row.id)
    const ready = async () => (await rows<{ ready: boolean }>(
      "select admin_private.case_assessment_evidence_ready_v1($1) as ready",
      [caseId],
    ))[0].ready
    const read = async () => rpc<{ versions: Array<{ current: boolean; stale: boolean; staleReason: string | null }> }>(
      "admin_case_assessment_read_v1",
      [adminToken, caseId],
    )
    const isEvidence = async (documentId: string) => (await rows<{ evidence: boolean }>(
      "select admin_private.assessment_evidence_document_v1($1) as evidence",
      [documentId],
    ))[0].evidence

    const approvedFingerprint = await stored()
    expect(await live()).toBe(approvedFingerprint)
    expect(await ready()).toBe(true)
    expect((await read()).versions[0]).toMatchObject({ current: true, stale: false, staleReason: null })

    const statement = await acceptedFile(caseId, "pack-statement.pdf")
    const instructions = await acceptedFile(caseId, "pack-instructions.pdf")
    expect(await isEvidence(statement.documentId!)).toBe(true)
    expect(await live()).not.toBe(approvedFingerprint)
    expect(await stored()).toBe(approvedFingerprint)
    expect((await read()).versions[0]).toMatchObject({ current: false, stale: true, staleReason: "facts" })
    expect(await documentIds()).toEqual(expect.arrayContaining([statement.documentId, evidence.documentId]))

    const pack = await packCmd(caseId, "create", {})
    expect(pack.status, JSON.stringify(pack)).toBe("success")
    const added = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, pack.id, pack.recordVersion)
    expect(added.status, JSON.stringify(added)).toBe("success")
    const withInstructions = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, pack.id, added.recordVersion)
    expect(withInstructions.status, JSON.stringify(withInstructions)).toBe("success")
    expect(await isEvidence(statement.documentId!)).toBe(false)
    expect(await isEvidence(instructions.documentId!)).toBe(false)
    expect(await live()).toBe(approvedFingerprint)
    expect(await stored()).toBe(approvedFingerprint)
    expect(await documentIds()).toEqual([evidence.documentId])
    expect((await read()).versions[0]).toMatchObject({ current: true, stale: false, staleReason: null })

    const extra = await acceptedFile(caseId, "pack-annex.pdf")
    expect(await live()).not.toBe(approvedFingerprint)
    const extraAdded = await packCmd(caseId, "add_item", { versionId: extra.versionId, role: "DELIVERABLE" }, pack.id, withInstructions.recordVersion)
    expect(extraAdded.status, JSON.stringify(extraAdded)).toBe("success")
    expect(await isEvidence(extra.documentId!)).toBe(false)
    expect(await live()).toBe(approvedFingerprint)
    const markedEvidence = await packCmd(caseId, "set_item_role", { versionId: extra.versionId, role: "EVIDENCE" }, pack.id, extraAdded.recordVersion)
    expect(markedEvidence.status, JSON.stringify(markedEvidence)).toBe("success")
    expect(await isEvidence(extra.documentId!)).toBe(true)
    expect(await live()).not.toBe(approvedFingerprint)
    expect(await documentIds()).toContain(extra.documentId)
    const restoredRole = await packCmd(caseId, "set_item_role", { versionId: extra.versionId, role: "DELIVERABLE" }, pack.id, markedEvidence.recordVersion)
    expect(restoredRole.status, JSON.stringify(restoredRole)).toBe("success")
    expect(await live()).toBe(approvedFingerprint)
    expect(await stored()).toBe(approvedFingerprint)

    await db.exec("begin")
    try {
      const untagged = await acceptedFile(caseId, "pack-untagged.pdf")
      const untaggedAdded = await packCmd(caseId, "add_item", { versionId: untagged.versionId }, pack.id, restoredRole.recordVersion)
      expect(untaggedAdded.status, JSON.stringify(untaggedAdded)).toBe("success")
      expect(await isEvidence(untagged.documentId!)).toBe(true)
      expect(await live()).not.toBe(approvedFingerprint)
      const tagged = await packCmd(caseId, "set_item_role", { versionId: untagged.versionId, role: "DELIVERABLE" }, pack.id, untaggedAdded.recordVersion)
      expect(tagged.status, JSON.stringify(tagged)).toBe("success")
      expect(await isEvidence(untagged.documentId!)).toBe(false)
      expect(await live()).toBe(approvedFingerprint)
      const linked = await packCmd(caseId, "add_item", { versionId: evidence.versionId, role: "DELIVERABLE" }, pack.id, tagged.recordVersion)
      expect(linked.status, JSON.stringify(linked)).toBe("success")
      expect(await isEvidence(evidence.documentId!)).toBe(true)
      expect(await documentIds()).toContain(evidence.documentId)
      expect(await stored()).toBe(approvedFingerprint)
    } finally {
      await db.exec("rollback")
    }
    expect(await live()).toBe(approvedFingerprint)
    expect(await stored()).toBe(approvedFingerprint)

    const keptEvidence = await packCmd(caseId, "set_item_role", { versionId: extra.versionId, role: "EVIDENCE" }, pack.id, restoredRole.recordVersion)
    expect(keptEvidence.status, JSON.stringify(keptEvidence)).toBe("success")
    expect(await isEvidence(extra.documentId!)).toBe(true)
    const historical = await acceptedFile(caseId, "pack-historical.pdf")
    const historicalAdded = await packCmd(caseId, "add_item", { versionId: historical.versionId, role: "EVIDENCE" }, pack.id, keptEvidence.recordVersion)
    expect(historicalAdded.status, JSON.stringify(historicalAdded)).toBe("success")
    expect(await isEvidence(historical.documentId!)).toBe(true)
    expect(await live()).not.toBe(approvedFingerprint)
    const approvedPack = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, pack.id, historicalAdded.recordVersion)
    expect(approvedPack.status, JSON.stringify(approvedPack)).toBe("success")
    expect(await isEvidence(statement.documentId!)).toBe(false)
    expect(await isEvidence(instructions.documentId!)).toBe(false)
    expect(await isEvidence(historical.documentId!)).toBe(true)

    const laterInstructions = await acceptedFile(caseId, "pack-later-instructions.pdf")
    const nextPack = await packCmd(caseId, "create", {})
    expect(nextPack.status, JSON.stringify(nextPack)).toBe("success")
    const relabelled = await packCmd(caseId, "add_item", { versionId: historical.versionId, role: "DELIVERABLE" }, nextPack.id, nextPack.recordVersion)
    expect(relabelled.status, JSON.stringify(relabelled)).toBe("success")
    expect(await isEvidence(historical.documentId!)).toBe(true)
    const nextInstructions = await packCmd(caseId, "add_item", { versionId: laterInstructions.versionId, role: "INSTRUCTIONS" }, nextPack.id, relabelled.recordVersion)
    expect(nextInstructions.status, JSON.stringify(nextInstructions)).toBe("success")
    const nextPackApproved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, nextPack.id, nextInstructions.recordVersion)
    expect(nextPackApproved.status, JSON.stringify(nextPackApproved)).toBe("success")
    expect(await count("select count(*)::int as n from public.case_prepared_packs where id = $1 and status = 'SUPERSEDED'", [pack.id])).toBe(1)
    expect(await isEvidence(historical.documentId!)).toBe(true)
    expect(await isEvidence(statement.documentId!)).toBe(false)
    expect(await isEvidence(laterInstructions.documentId!)).toBe(false)
    expect(await documentIds()).toContain(historical.documentId)
    expect(await documentIds()).toContain(extra.documentId)
    expect(await documentIds()).not.toContain(statement.documentId)
    expect(await stored()).toBe(approvedFingerprint)

    const beforeRevision = await live()
    await db.query("update public.case_documents set title = 'Revised staff statement' where id = $1", [statement.documentId])
    const revised = await acceptedFile(caseId, "pack-statement-v2.pdf", "NO_THREATS_FOUND", statement.documentId!)
    expect(revised.documentId).toBe(statement.documentId)
    expect(await isEvidence(statement.documentId!)).toBe(false)
    expect(await documentIds()).not.toContain(statement.documentId)
    expect(await live()).toBe(beforeRevision)
    expect(await ready()).toBe(true)
    expect(await stored()).toBe(approvedFingerprint)

    const laterRequest = await rpc<Json>("admin_evidence_request_v1", [
      adminToken, key(), caseId, null, null, "create", "Trading licence", "Upload the trading licence for this bakery.", null, null,
    ])
    expect(laterRequest.status, JSON.stringify(laterRequest)).toBe("success")
    expect(await ready()).toBe(false)
    expect(await live()).not.toBe(approvedFingerprint)
    const customerFile = await rpc<Json>("customer_portal_evidence_begin_v1", [
      alexSession, key(), reference, "er-2", "trading-licence.pdf", "application/pdf", 1024, "test-evidence",
    ])
    expect(customerFile.status, JSON.stringify(customerFile)).toBe("success")
    const customerVersion = (await rows<{ id: string; document_id: string; submission_source: string; customer_request: string | null }>(
      `select v.id, v.document_id, v.submission_source, v.customer_evidence_request_id::text as customer_request
       from public.case_document_versions v
       join public.case_documents d on d.id = v.document_id
       where d.case_id = $1 and v.original_filename = 'trading-licence.pdf'`,
      [caseId],
    ))[0]
    expect(customerVersion).toMatchObject({ submission_source: "CUSTOMER", customer_request: laterRequest.id })
    expect(await isEvidence(customerVersion.document_id)).toBe(true)
    expect(await documentIds()).toEqual(expect.arrayContaining([evidence.documentId, customerVersion.document_id]))
    expect(await documentIds()).not.toContain(statement.documentId)
    expect(await stored()).toBe(approvedFingerprint)
    expect((await read()).versions[0]).toMatchObject({ current: false, stale: true, staleReason: "facts" })

    const replacement = await rpc<Json>("admin_case_assessment_command_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), "save_draft", draftAssessment,
    ])
    expect(replacement.status, JSON.stringify(replacement)).toBe("success")
    const replacementReview = await rpc<Json>("admin_case_assessment_command_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), "submit_review", { recordVersion: replacement.recordVersion },
    ])
    expect(replacementReview.status, JSON.stringify(replacementReview)).toBe("success")
    expect(await rpc<Json>("admin_case_assessment_command_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), "approve", { recordVersion: replacementReview.recordVersion },
    ])).toMatchObject({ status: "prerequisite" })
    expect(await stored()).toBe(approvedFingerprint)

    for (const role of ["anon", "authenticated", "service_role"]) {
      const privilege = await db.query<{ ok: boolean }>(
        "select has_function_privilege($1, 'admin_private.assessment_evidence_document_v1(uuid)', 'EXECUTE') as ok",
        [role],
      )
      expect(privilege.rows[0].ok, role).toBe(false)
    }
    expect(await count(
      `select count(*)::int as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'admin_private'
         and p.proname in ('advance_guided_pack_ready_v1', 'advance_guided_pack_on_publish_v1')`,
    )).toBe(0)
    expect(await count("select count(*)::int as n from pg_trigger where tgname = 'case_prepared_packs_guided_ready'")).toBe(0)
  })

  it("keeps an approval current when staff files saved with it are later classified", async () => {
    const reference = "PR-26-PRECLS"
    const caseId = await insertCase(reference)
    const request = await rpc<Json>("admin_evidence_request_v1", [
      adminToken, key(), caseId, null, null, "create", "Ownership letter", "Upload the ownership letter for this bakery.", null, null,
    ])
    expect(request.status, JSON.stringify(request)).toBe("success")
    const evidence = await rpc<Json>("admin_evidence_begin_v1", [
      adminToken, key(), caseId, null, "ownership-letter.pdf", "application/pdf", 1024, "Ownership letter", "test-evidence", request.id,
    ])
    expect(evidence.versionId, JSON.stringify(evidence)).toBeTruthy()
    await rpc("admin_evidence_finalize_v1", [adminToken, key(), caseId, evidence.versionId])
    await rpc("admin_evidence_refresh_scan_v1", [adminToken, key(), caseId, evidence.versionId, "NO_THREATS_FOUND", "VALID", null])
    const evidenceMeta = await rpc<Json>("admin_evidence_version_v1", [adminToken, caseId, evidence.versionId])
    expect((await rpc<Json>("admin_evidence_review_v1", [
      adminToken, key(), caseId, evidence.versionId, evidenceMeta.recordVersion, "accept", "Accepted after a clean scan.", null,
    ])).status).toBe("success")
    await setVisible(caseId, evidence.versionId!, true)
    expect((await rpc<Json>("admin_evidence_request_v1", [
      adminToken, key(), caseId, request.id, request.version, "fulfill", null, null, null, "Completed after the customer sent the letter.",
    ])).status).toBe("success")

    const statement = await acceptedFile(caseId, "included-statement.pdf")
    const instructions = await acceptedFile(caseId, "included-instructions.pdf")
    const draftAssessment = {
      recordVersion: 0,
      findings: "The profile was suspended and the ownership letter matches the bakery account.",
      evidenceConsidered: "One accepted ownership letter, plus the staff statement and submission instructions.",
      profileIssue: "The Google listing is suspended.",
      policyConcerns: "Ownership of the profile is the policy concern in view.",
      recommendedAction: "Recommend Guided recovery and leave the quote for a later step.",
      servicePathway: "GUIDED",
      rationale: "The accepted evidence is enough to recommend Guided rather than Managed.",
      risks: "Google may still refuse the recovery request.",
      outstandingInformation: "",
    }
    const saved = await rpc<Json>("admin_case_assessment_command_v1", [adminToken, key(), caseId, await caseVersion(caseId), "save_draft", draftAssessment])
    expect(saved.status, JSON.stringify(saved)).toBe("success")
    const submitted = await rpc<Json>("admin_case_assessment_command_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), "submit_review", { recordVersion: saved.recordVersion },
    ])
    expect(submitted.status, JSON.stringify(submitted)).toBe("success")
    const approved = await rpc<Json>("admin_case_assessment_command_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), "approve", { recordVersion: submitted.recordVersion },
    ])
    expect(approved.status, JSON.stringify(approved)).toBe("success")

    const stored = async () => (await rows<{ basis_fingerprint: string }>(
      "select basis_fingerprint from public.case_assessments where case_id = $1 and status = 'APPROVED' order by version_number desc limit 1",
      [caseId],
    ))[0].basis_fingerprint
    const fingerprintOf = async (basis: string) => (await rows<{ fp: string }>(
      `select admin_private.case_assessment_fingerprint_v1(admin_private.${basis}($1)) as fp`,
      [caseId],
    ))[0].fp
    const read = async () => rpc<{ versions: Array<{ current: boolean; stale: boolean; staleReason: string | null }> }>(
      "admin_case_assessment_read_v1",
      [adminToken, caseId],
    )

    const approvedFingerprint = await stored()
    expect(await fingerprintOf("case_assessment_basis_v1")).toBe(approvedFingerprint)
    expect(await fingerprintOf("case_assessment_inclusive_basis_v1")).toBe(approvedFingerprint)
    expect((await read()).versions[0]).toMatchObject({ current: true, stale: false, staleReason: null })

    const pack = await packCmd(caseId, "create", {})
    const added = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, pack.id, pack.recordVersion)
    const withInstructions = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, pack.id, added.recordVersion)
    expect(withInstructions.status, JSON.stringify(withInstructions)).toBe("success")
    expect(await fingerprintOf("case_assessment_basis_v1")).not.toBe(approvedFingerprint)
    expect(await fingerprintOf("case_assessment_inclusive_basis_v1")).toBe(approvedFingerprint)
    expect(await stored()).toBe(approvedFingerprint)
    expect((await read()).versions[0]).toMatchObject({ current: true, stale: false, staleReason: null })

    await db.exec("begin")
    try {
      await db.query(
        `insert into public.case_work_events(case_id, actor_id, event, note)
         values ($1, $2, 'reopen', 'The customer asked for the assessment to be reopened.')`,
        [caseId, admin],
      )
      expect((await read()).versions[0]).toMatchObject({ current: false, stale: true, staleReason: "reopened" })
      expect(await stored()).toBe(approvedFingerprint)
    } finally {
      await db.exec("rollback")
    }
    expect((await read()).versions[0]).toMatchObject({ current: true, stale: false, staleReason: null })

    const laterRequest = await rpc<Json>("admin_evidence_request_v1", [
      adminToken, key(), caseId, null, null, "create", "Trading licence", "Upload the trading licence for this bakery.", null, null,
    ])
    expect(laterRequest.status, JSON.stringify(laterRequest)).toBe("success")
    const customerFile = await rpc<Json>("customer_portal_evidence_begin_v1", [
      alexSession, key(), reference, "er-2", "trading-licence.pdf", "application/pdf", 1024, "test-evidence",
    ])
    expect(customerFile.status, JSON.stringify(customerFile)).toBe("success")
    expect(await fingerprintOf("case_assessment_basis_v1")).not.toBe(approvedFingerprint)
    expect(await fingerprintOf("case_assessment_inclusive_basis_v1")).not.toBe(approvedFingerprint)
    expect(await stored()).toBe(approvedFingerprint)
    expect((await read()).versions[0]).toMatchObject({ current: false, stale: true, staleReason: "facts" })
  })

  it("closes a paid Guided case from its current published pack without a Google decision", async () => {
    const reference = "PR-26-READYX"
    const caseId = await insertCase(reference)
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const statement = await acceptedFile(caseId, "ready-statement.pdf")
    const draft = await packCmd(caseId, "create", {})
    const deliverableOnly = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, draft.id, draft.recordVersion)
    expect(await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, deliverableOnly.recordVersion)).toMatchObject({ status: "denied", reason: "instructions" })
    const instructions = await acceptedFile(caseId, "ready-instructions.pdf")
    const withInstructions = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, deliverableOnly.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withInstructions.recordVersion)
    expect(approved.status, JSON.stringify(approved)).toBe("success")
    expect(await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)).toMatchObject({ status: "denied", reason: "unpaid" })
    const note = "The Guided pack was handed to the customer and the preparation is complete."
    const summary = "The Guided preparation was handed to the customer. This does not record a Google decision."
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary },
    ])).toMatchObject({ status: "denied", reason: "unpaid" })

    const payment = await settle(caseId, "readyx", "evt_readyx")
    expect(payment.settled.status).toBe("success")
    expect((await rows<{ work_stage: string; status: string }>("select work_stage, status from public.cases where id = $1", [caseId]))[0]).toMatchObject({
      work_stage: "PREPARATION",
      status: "UNDER_REVIEW",
    })
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary },
    ])).toMatchObject({ status: "denied", reason: "pack" })

    const published = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)
    expect(published, JSON.stringify(published)).toMatchObject({ status: "success", packEmail: "skipped" })
    expect((await rows<{ work_stage: string; status: string; outcome: string | null }>(
      "select work_stage, status, outcome from public.cases where id = $1",
      [caseId],
    ))[0]).toMatchObject({ work_stage: "READY_TO_SUBMIT", status: "UNDER_REVIEW", outcome: null })
    expect(await count(
      "select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'from' = 'PREPARATION' and details->>'to' = 'READY_TO_SUBMIT'",
      [caseId],
    )).toBe(1)
    expect(await count(
      "select count(*)::int as n from public.case_work_events where case_id = $1 and details->>'source' = 'pack_publish'",
      [caseId],
    )).toBe(0)
    expect(await count(
      "select count(*)::int as n from public.admin_audit_events where target_id = $1 and details->>'source' = 'pack_publish'",
      [caseId],
    )).toBe(0)
    expect(await count(
      "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'admin_private' and p.proname = 'advance_guided_published_pack_stage_v1'",
    )).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_COMPLETION'", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(0)
    expect((await rows<{ status: string }>("select status from public.cases where id = $1", [caseId]))[0].status).not.toBe("CLOSED")

    const replacementFile = await acceptedFile(caseId, "ready-statement-v2.pdf")
    const replacementInstructions = await acceptedFile(caseId, "ready-instructions-v2.pdf")
    const next = await packCmd(caseId, "create", {})
    const nextItem = await packCmd(caseId, "add_item", { versionId: replacementFile.versionId, role: "DELIVERABLE" }, next.id, next.recordVersion)
    const nextInstructions = await packCmd(caseId, "add_item", { versionId: replacementInstructions.versionId, role: "INSTRUCTIONS" }, next.id, nextItem.recordVersion)
    const nextApproved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, next.id, nextInstructions.recordVersion)
    expect(nextApproved.status, JSON.stringify(nextApproved)).toBe("success")
    expect(await count("select count(*)::int as n from public.case_prepared_packs where id = $1 and status = 'SUPERSEDED' and unpublished_at is not null", [draft.id])).toBe(1)
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary },
    ])).toMatchObject({ status: "denied", reason: "pack" })
    const nextPublished = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, next.id, nextApproved.recordVersion)
    expect(nextPublished, JSON.stringify(nextPublished)).toMatchObject({ status: "success", packEmail: "skipped" })
    expect(await count(
      "select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'to' = 'READY_TO_SUBMIT'",
      [caseId],
    )).toBe(1)
    expect(await count(
      "select count(*)::int as n from public.case_work_events where case_id = $1 and details->>'source' = 'pack_publish'",
      [caseId],
    )).toBe(0)
    expect((await rows<{ work_stage: string; status: string }>("select work_stage, status from public.cases where id = $1", [caseId]))[0]).toMatchObject({
      work_stage: "READY_TO_SUBMIT",
      status: "UNDER_REVIEW",
    })
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)

    const quiet = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary },
    ])
    expect(quiet, JSON.stringify(quiet)).toMatchObject({ status: "success", completionEmail: "not_sent" })
    expect((await rows<{ status: string; work_stage: string; outcome: string | null }>(
      "select status, work_stage, outcome from public.cases where id = $1",
      [caseId],
    ))[0]).toMatchObject({ status: "CLOSED", work_stage: "FINISHED", outcome: null })
    const closedDownload = await rpc<{ found: boolean; available: boolean; storageKey?: string }>(
      "customer_portal_document_resolve_v1",
      [alexSession, reference, "pd-1"],
    )
    expect(closedDownload).toMatchObject({ found: true, available: true })
    expect(closedDownload.storageKey).toContain(String(replacementFile.versionId))
    const closeEvent = await rows<{ details: { fulfilment?: string; outcome?: string } }>(
      "select details from public.case_work_events where case_id = $1 and event = 'close'",
      [caseId],
    )
    expect(closeEvent).toHaveLength(1)
    expect(closeEvent[0].details.fulfilment).toBe("guided_preparation")
    expect(closeEvent[0].details.outcome).toBeUndefined()

    const rendered = renderGuidedCompletion({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: 9900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const payload = { note, summary, ...mailPayload(rendered!, "documents") }
    const recovered = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), payload,
    ])
    expect(recovered, JSON.stringify(recovered)).toMatchObject({ status: "success", completionEmail: "success", recovered: true })
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), payload,
    ])).toMatchObject({ status: "success", completionEmail: "already_queued", recovered: true })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_COMPLETION'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.guided_completion_notices where case_id = $1", [caseId])).toBe(1)
    expect((await rows<{ outcome: string | null }>("select outcome from public.cases where id = $1", [caseId]))[0].outcome).toBeNull()
  })

  it("records a customer Google report without closing the service or changing payment", async () => {
    const reference = "PR-26-GHAND2"
    const caseId = await insertCase(reference)
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const statement = await acceptedFile(caseId, "handover-statement.pdf")
    const instructions = await acceptedFile(caseId, "handover-instructions.pdf")
    const draft = await packCmd(caseId, "create", {})
    const added = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, draft.id, draft.recordVersion)
    const withInstructions = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, added.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withInstructions.recordVersion)
    const payment = await settle(caseId, "ghand1", "evt_ghand1")
    expect(payment.settled.status).toBe("success")
    const receipts = await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])
    const renderedPack = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: payment.order.amount_minor,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const published = await packCmd(caseId, "publish", {
      note: packNote, confirmed: true, ...mailPayload(renderedPack!, "documents"),
    }, draft.id, approved.recordVersion)
    expect(published.status, JSON.stringify(published)).toBe("success")
    const before = await rpc<{ timeline: { code: string }[] }>("customer_portal_case_v1", [alexSession, reference])
    expect(before.timeline.map(event => event.code)).toContain("PACK_PUBLISHED")
    expect(before.timeline.map(event => event.code)).not.toContain("SUBMITTED_TO_GOOGLE")
    expect(before.timeline.map(event => event.code)).not.toContain("CUSTOMER_REPORTED_SUBMISSION")
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toEqual({ status: "UNDER_REVIEW", outcome: null })

    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      samSession, key(), reference, "report_submission", {
        note: "I sent this pack through the Google appeals form.",
        submittedOn: "2026-10-21",
      },
    ])).toMatchObject({ status: "unavailable" })
    const reported = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_submission", {
        note: "I sent this pack through the Google appeals form.",
        submittedOn: "2026-10-21",
        googleReference: "GOOGLE-GHAND-1",
      },
    ])
    expect(reported).toMatchObject({ status: "success", kind: "GOOGLE_SUBMISSION" })
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN' and title = 'Review the customer''s Google submission report'", [caseId])).toBe(1)
    const submittedTimeline = await rpc<{ timeline: { code: string }[] }>("customer_portal_case_v1", [alexSession, reference])
    expect(submittedTimeline.timeline.map(event => event.code)).toContain("CUSTOMER_REPORTED_SUBMISSION")
    expect(submittedTimeline.timeline.map(event => event.code)).not.toContain("SUBMITTED_TO_GOOGLE")
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toEqual({ status: "UNDER_REVIEW", outcome: null })
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])).toBe(receipts)

    const reinstated = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_outcome", {
        note: "Google said the profile is visible again.",
        outcome: "REINSTATED",
        decidedOn: "2026-10-22",
        googleReference: "GOOGLE-GHAND-2",
      },
    ])
    expect(reinstated).toMatchObject({ status: "success", kind: "GOOGLE_OUTCOME", outcome: "REINSTATED" })
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
    expect(await count(
      "select count(*)::int as n from public.case_submission_results result join public.case_submissions submission on submission.id = result.submission_id where submission.case_id = $1",
      [caseId],
    )).toBe(0)
    const reinstatedTimeline = await rpc<{ timeline: { code: string }[] }>("customer_portal_case_v1", [alexSession, reference])
    expect(reinstatedTimeline.timeline.map(event => event.code)).toContain("CUSTOMER_REPORTED_OUTCOME")
    expect(reinstatedTimeline.timeline.map(event => event.code)).not.toContain("GOOGLE_DECISION_RECORDED")
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toEqual({ status: "UNDER_REVIEW", outcome: null })

    const failedRequest = key()
    const failed = await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, failedRequest, reference, "report_outcome", {
        note: "Google said the profile stays suspended.",
        outcome: "NOT_REINSTATED",
        decidedOn: "2026-10-23",
      },
    ])
    expect(failed).toMatchObject({ status: "success", outcome: "NOT_REINSTATED" })
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, failedRequest, reference, "report_outcome", {
        note: "Google said the profile stays suspended.",
        outcome: "NOT_REINSTATED",
        decidedOn: "2026-10-23",
      },
    ])).toEqual(failed)
    expect(await count("select count(*)::int as n from public.guided_customer_reports where case_id = $1 and kind = 'GOOGLE_OUTCOME'", [caseId])).toBe(2)
    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_outcome", {
        note: "A file that is not on this case.",
        outcome: "OTHER",
        decidedOn: "2026-10-23",
        evidenceSelector: "er-9",
      },
    ])).toMatchObject({ status: "invalid" })
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toEqual({ status: "UNDER_REVIEW", outcome: null })
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])).toBe(receipts)

    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "request_correction", { note: "Please correct the opening sentence before I rely on it." },
    ])).toMatchObject({ status: "success", kind: "CORRECTION" })
    const note = "Closed after the completed pack was available. The Google report stays separate."
    const summary = "Your Guided Relaunch pack is complete. You submit it to Google yourself."
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary },
    ])).toMatchObject({ status: "open_work" })
    const correction = await rows<{ id: string }>(
      "select id from public.case_tasks where case_id = $1 and status = 'OPEN' and title = 'Review a correction to the Guided pack'",
      [caseId],
    )
    expect(correction).toHaveLength(1)
    expect((await caseCmd(caseId, "resolve_task", { taskId: correction[0].id, status: "DONE" })).status).toBe("success")
    expect(await count("select count(*)::int as n from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])).toBeGreaterThan(0)
    const completion = renderGuidedCompletion({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: payment.order.amount_minor,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    const closed = await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId), { note, summary, ...mailPayload(completion!, "documents") },
    ])
    expect(closed, JSON.stringify(closed)).toMatchObject({ status: "success" })
    expect((await rows<{ status: string; outcome: string | null; work_stage: string }>(
      "select status, outcome, work_stage from public.cases where id = $1",
      [caseId],
    ))[0]).toEqual({ status: "CLOSED", outcome: null, work_stage: "FINISHED" })
    const completionBody = await rows<{ body_text: string }>(
      "select body_text from public.communications where case_id = $1 and template_key = 'GUIDED_COMPLETION'",
      [caseId],
    )
    expect(completionBody[0].body_text).toContain("Your Guided Relaunch service is complete. Your submission pack remains available in your account. You can tell us when you've submitted it to Google and update us when you hear back.")
    expect(completionBody[0].body_text).toContain(guidedCustomerSubmitsSentence)
    expect(completionBody[0].body_text).not.toMatch(/reinstated|ProfileRelaunch submitted/i)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])).toBe(receipts)

    expect(await rpc<Json>("customer_portal_guided_handover_v1", [
      alexSession, key(), reference, "report_outcome", {
        note: "I am still waiting for Google to reply.",
        outcome: "STILL_WAITING",
        decidedOn: "2026-10-24",
      },
    ])).toMatchObject({ status: "success", outcome: "STILL_WAITING" })
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toEqual({ status: "CLOSED", outcome: null })
    const outcomeTask = await rows<{ id: string }>(
      "select id from public.case_tasks where case_id = $1 and status = 'OPEN' and title = 'Review the customer''s Google outcome report'",
      [caseId],
    )
    expect(outcomeTask).toHaveLength(1)
    expect((await caseCmd(caseId, "resolve_task", { taskId: outcomeTask[0].id, status: "DONE" })).status).toBe("denied")
    const reviewRequest = key()
    const reviewVersion = await caseVersion(caseId)
    const review = await rpc<Json>("admin_guided_report_review_v1", [
      adminToken, reviewRequest, caseId, reviewVersion, {
        note: "Reviewed the customer's report. It is not a verified Google decision.",
        taskId: outcomeTask[0].id,
        status: "DONE",
      },
    ])
    expect(review).toMatchObject({ status: "success", id: caseId })
    expect(await rpc<Json>("admin_guided_report_review_v1", [
      adminToken, reviewRequest, caseId, reviewVersion, {
        note: "Reviewed the customer's report. It is not a verified Google decision.",
        taskId: outcomeTask[0].id,
        status: "DONE",
      },
    ])).toEqual(review)
    expect((await rows<{ status: string; outcome: string | null }>("select status, outcome from public.cases where id = $1", [caseId]))[0]).toEqual({ status: "CLOSED", outcome: null })
    expect(await count("select count(*)::int as n from public.case_tasks where id = $1 and status = 'DONE'", [outcomeTask[0].id])).toBe(1)
    expect(await count("select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'review_guided_report'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).toBe(0)
    expect(await count("select count(*)::int as n from public.payment_receipts where service_order_id = $1", [payment.order.id])).toBe(receipts)
    const documents = await rpc<{ pack: { customerSubmitted: boolean; outcomeReported: boolean; outcomeReviewed: boolean } | null }>(
      "customer_portal_case_documents_v1",
      [alexSession, reference],
    )
    expect(documents.pack).toMatchObject({ customerSubmitted: true, outcomeReported: true, outcomeReviewed: true })
  })

  it("leaves Managed publication and closure on the existing rules", async () => {
    const caseId = await insertCase("PR-26-MANPKG", "MANAGED")
    await db.query("update public.cases set work_stage = 'PREPARATION', status = 'UNDER_REVIEW' where id = $1", [caseId])
    const file = await acceptedFile(caseId, "managed-note.pdf")
    const draft = await packCmd(caseId, "create", {})
    const added = await packCmd(caseId, "add_item", { versionId: file.versionId }, draft.id, draft.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, added.recordVersion)
    expect(approved.status, JSON.stringify(approved)).toBe("success")
    const published = await packCmd(caseId, "publish", { note: packNote, confirmed: true }, draft.id, approved.recordVersion)
    expect(published, JSON.stringify(published)).toMatchObject({ status: "success", packEmail: "skipped" })
    expect((await rows<{ work_stage: string; status: string; outcome: string | null }>(
      "select work_stage, status, outcome from public.cases where id = $1",
      [caseId],
    ))[0]).toMatchObject({ work_stage: "PREPARATION", status: "UNDER_REVIEW", outcome: null })
    expect(await count(
      "select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'source' = 'pack_publish'",
      [caseId],
    )).toBe(0)
    expect(await rpc<Json>("admin_guided_fulfilment_close_v1", [
      adminToken, key(), caseId, await caseVersion(caseId),
      { note: "This Managed case is not a Guided preparation.", summary: "Managed closure stays on the existing outcome command." },
    ])).toMatchObject({ status: "denied", reason: "not_guided" })
    expect(await caseCmd(caseId, "close", {
      outcome: "RESTORED",
      summary: "Google restored the profile after the appeal.",
    })).toMatchObject({ status: "denied" })
  })

  it("leases one published pack email without an activation row and refuses a stale or suppressed pack", async () => {
    const devOrigin = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
    const signature = "public.dev_mail_dispatch_claim_pack_v1(uuid, text)"
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('anon', $1, 'EXECUTE') as ok", [signature])).rows[0].ok).toBe(false)
    expect((await db.query<{ ok: boolean }>("select has_function_privilege('service_role', $1, 'EXECUTE') as ok", [signature])).rows[0].ok).toBe(true)
    expect(await count("select count(*)::int as n from admin_private.dev_mail_dispatch_activation")).toBe(0)
    const managedLink = await db.query<{ value: string | null }>(
      "select admin_private.dev_mail_link_reason_v1($1, $2, $3, $4, $5) as value",
      [
        "MANAGED_PROGRESS",
        `See ${devOrigin}/portal/cases/PR-26-PACK2A`,
        `<p>See ${devOrigin}/portal/cases/PR-26-PACK2A</p>`,
        devOrigin,
        "PR-26-PACK2A",
      ],
    )
    expect(managedLink.rows[0].value).toBe("origin")

    const reference = "PR-26-PACK2A"
    const caseId = await insertCase(reference)
    expect((await acceptQuote(caseId)).status).toBe("success")
    await guidedToPaymentRequired(caseId)
    const statement = await acceptedFile(caseId, "dispatch-statement.pdf")
    const instructions = await acceptedFile(caseId, "dispatch-instructions.pdf")
    const draft = await packCmd(caseId, "create", {})
    const deliverable = await packCmd(caseId, "add_item", { versionId: statement.versionId, role: "DELIVERABLE" }, draft.id, draft.recordVersion)
    const withInstructions = await packCmd(caseId, "add_item", { versionId: instructions.versionId, role: "INSTRUCTIONS" }, draft.id, deliverable.recordVersion)
    const approved = await packCmd(caseId, "approve", { note: packNote, confirmed: true }, draft.id, withInstructions.recordVersion)
    expect(approved.status, JSON.stringify(approved)).toBe("success")
    const payment = await settle(caseId, "pack2a", "evt_pack2a")
    expect(payment.settled.status).toBe("success")
    const order = await orderOf(caseId)
    const rendered = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: reference,
      amountMinor: order.amount_minor,
      currency: "GBP",
      origin: devOrigin,
      replyTo: "cases@profilerelaunch.com",
    })
    expect(rendered).not.toBeNull()
    const published = await packCmd(caseId, "publish", {
      note: packNote,
      confirmed: true,
      ...mailPayload(rendered!, "documents", { customerOrigin: devOrigin }),
    }, draft.id, approved.recordVersion)
    expect(published, JSON.stringify(published)).toMatchObject({ status: "success", packEmail: "success" })
    const communicationId = (await rows<{ id: string }>(
      "select communication_id as id from public.guided_pack_announcements where pack_id = $1",
      [draft.id],
    ))[0].id
    const eventKey = `send-email:${communicationId}:v1`
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)
    expect((await rows<{ promoted_at: string | null }>("select promoted_at from admin_private.job_outbox where event_key = $1", [eventKey]))[0].promoted_at).toBeNull()
    expect(await count("select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id where o.event_key = $1", [eventKey])).toBe(0)
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [communicationId, devOrigin])).toMatchObject({ status: "denied", reason: "before_activation" })
    expect(await rpc<Json>("dev_mail_pack_retry_recovery_v1", [])).toMatchObject({ status: "success", eligible: 0, wake: "not_needed" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_retry_v1", [devOrigin])).toMatchObject({ status: "denied", reason: "not_queued" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [draft.id, "https://customer.example.test"])).toMatchObject({ status: "denied", reason: "origin" })
    expect(await count("select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id where o.event_key = $1", [eventKey])).toBe(0)

    await db.query(
      "insert into admin_private.email_suppressions(address_normalized, reason) values ('alex@example.com', 'SUPPRESSED')",
    )
    try {
      expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [draft.id, devOrigin])).toMatchObject({ status: "denied", reason: "suppressed" })
      expect(await count("select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id where o.event_key = $1", [eventKey])).toBe(0)
    } finally {
      await db.query("delete from admin_private.email_suppressions where address_normalized = 'alex@example.com'")
    }

    const claimed = await rpc<DevSendClaim>("dev_mail_dispatch_claim_pack_v1", [draft.id, devOrigin])
    expect(claimed.status, JSON.stringify(claimed)).toBe("success")
    expect(claimed.replay).toBe(false)
    expect(claimed.payload).toEqual({ communicationId, contentVersion: 1 })
    expect((await rows<{ promoted_at: string | null }>("select promoted_at from admin_private.job_outbox where event_key = $1", [eventKey]))[0].promoted_at).not.toBeNull()
    expect(await count("select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id where o.event_key = $1", [eventKey])).toBe(1)
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [draft.id, devOrigin])).toMatchObject({ status: "conflict", reason: "leased" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)

    const failing = { async send() { return { ok: false as const, retryable: true, error: "temporary" } } }
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: claimed, provider: failing })).toBe("retry")
    expect(await rpc<Json>("dev_mail_pack_retry_recovery_v1", [])).toMatchObject({ status: "success", eligible: 0, wake: "not_needed" })
    await db.query("update admin_private.jobs set scheduled_at = now() - interval '1 second' where id = $1 and status = 'RETRY'", [claimed.jobId])
    expect(await rpc<Json>("communication_mark_acceptance_unknown_v1", [communicationId, eventKey])).toMatchObject({ status: "success", deliveryStatus: "ACCEPTANCE_UNKNOWN" })
    expect(await rpc<Json>("dev_mail_pack_retry_recovery_v1", [])).toMatchObject({ status: "success", eligible: 0, wake: "not_needed" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [draft.id, devOrigin])).toMatchObject({ status: "denied", reason: "acceptance_unknown" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_retry_v1", [devOrigin])).toMatchObject({ status: "denied", reason: "not_queued" })
    await db.exec(`begin; set local session_replication_role = replica; update public.communications set delivery_status = 'NONE' where id = '${communicationId}'; commit;`)
    expect(await rpc<Json>("dev_mail_pack_retry_recovery_v1", [])).toMatchObject({ status: "success", eligible: 1, wake: "not_configured" })
    const retried = await rpc<DevSendClaim>("dev_mail_dispatch_claim_pack_retry_v1", [devOrigin])
    expect(retried.status, JSON.stringify(retried)).toBe("success")
    expect(retried.jobId).toBe(claimed.jobId)
    const provider = createIdempotentMailProvider()
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: retried, provider })).toBe("succeeded")
    expect(provider.effects).toBe(1)
    expect((await rows<{ delivery_status: string; job_status: string }>(
      `select c.delivery_status, j.status as job_status
       from public.communications c
       join admin_private.job_outbox o on o.event_key = $1
       join admin_private.jobs j on j.outbox_id = o.id
       where c.id = $2`,
      [eventKey, communicationId],
    ))[0]).toMatchObject({ delivery_status: "PROVIDER_ACCEPTED", job_status: "SUCCEEDED" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [draft.id, devOrigin])).toMatchObject({ status: "denied", reason: "already_processed" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_retry_v1", [devOrigin])).toMatchObject({ status: "denied", reason: "not_queued" })
    expect(await rpc<Json>("dev_mail_pack_retry_recovery_v1", [])).toMatchObject({ status: "success", eligible: 0, wake: "not_needed" })
    await db.exec(`begin; set local session_replication_role = replica; update public.communications set delivery_status = 'DELIVERED' where id = '${communicationId}'; commit;`)
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [draft.id, devOrigin])).toMatchObject({ status: "denied", reason: "already_processed" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_retry_v1", [devOrigin])).toMatchObject({ status: "denied", reason: "not_queued" })
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [caseId])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id where o.event_key = $1", [eventKey])).toBe(1)
    expect(await count("select count(*)::int as n from admin_private.dev_mail_dispatch_activation")).toBe(0)
    expect(await rpc<Json>("dev_mail_dispatch_claim_v1", [communicationId, devOrigin])).toMatchObject({ status: "denied", reason: "before_activation" })

    const withdrawn = await packCmd(caseId, "unpublish", { confirmed: true, reason: packNote }, draft.id, published.recordVersion)
    expect(withdrawn.status, JSON.stringify(withdrawn)).toBe("success")
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [draft.id, devOrigin])).toMatchObject({ status: "denied", reason: "unpublished" })

    const staleReference = "PR-26-PKSTLE"
    const staleCase = await insertCase(staleReference)
    expect((await acceptQuote(staleCase)).status).toBe("success")
    await guidedToPaymentRequired(staleCase)
    const staleStatement = await acceptedFile(staleCase, "stale-statement.pdf")
    const staleInstructions = await acceptedFile(staleCase, "stale-instructions.pdf")
    const staleDraft = await packCmd(staleCase, "create", {})
    const staleDeliverable = await packCmd(staleCase, "add_item", { versionId: staleStatement.versionId, role: "DELIVERABLE" }, staleDraft.id, staleDraft.recordVersion)
    const staleWithInstructions = await packCmd(staleCase, "add_item", { versionId: staleInstructions.versionId, role: "INSTRUCTIONS" }, staleDraft.id, staleDeliverable.recordVersion)
    const staleApproved = await packCmd(staleCase, "approve", { note: packNote, confirmed: true }, staleDraft.id, staleWithInstructions.recordVersion)
    expect(staleApproved.status, JSON.stringify(staleApproved)).toBe("success")
    await settle(staleCase, "pkstle", "evt_pkstle")
    const staleOrder = await orderOf(staleCase)
    const staleRendered = renderPackReady({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      caseRef: staleReference,
      amountMinor: staleOrder.amount_minor,
      currency: "GBP",
      origin: devOrigin,
      replyTo: "cases@profilerelaunch.com",
    })
    const stalePublished = await packCmd(staleCase, "publish", {
      note: packNote,
      confirmed: true,
      ...mailPayload(staleRendered!, "documents", { customerOrigin: devOrigin }),
    }, staleDraft.id, staleApproved.recordVersion)
    expect(stalePublished, JSON.stringify(stalePublished)).toMatchObject({ status: "success", packEmail: "success" })
    const staleMail = (await rows<{ id: string }>(
      "select communication_id as id from public.guided_pack_announcements where pack_id = $1",
      [staleDraft.id],
    ))[0].id
    const staleKey = `send-email:${staleMail}:v1`
    await db.exec(`begin; set local session_replication_role = replica; update public.case_prepared_packs set status = 'STALE', unpublished_at = now(), unpublished_by = '${admin}', unpublished_reason = 'Included evidence changed after the pack was approved.' where id = '${staleDraft.id}'; commit;`)
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [staleDraft.id, devOrigin])).toMatchObject({ status: "denied", reason: "stale" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_retry_v1", [devOrigin])).toMatchObject({ status: "denied", reason: "not_queued" })
    expect(await count("select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id where o.event_key = $1", [staleKey])).toBe(0)
    await db.exec(`begin; set local session_replication_role = replica; update public.case_prepared_packs set status = 'SUPERSEDED', unpublished_at = now(), unpublished_by = '${admin}', unpublished_reason = 'A later pack replaced this published pack.' where id = '${staleDraft.id}'; commit;`)
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [staleDraft.id, devOrigin])).toMatchObject({ status: "denied", reason: "superseded" })
    expect(await count("select count(*)::int as n from admin_private.jobs j join admin_private.job_outbox o on o.id = j.outbox_id where o.event_key = $1", [staleKey])).toBe(0)
    await db.exec(`begin; set local session_replication_role = replica; update public.case_prepared_packs set status = 'APPROVED', unpublished_at = null, unpublished_by = null, unpublished_reason = '' where id = '${staleDraft.id}'; commit;`)
    const recovered = await rpc<DevSendClaim>("dev_mail_dispatch_claim_pack_v1", [staleDraft.id, devOrigin])
    expect(recovered.status, JSON.stringify(recovered)).toBe("success")
    expect(await count("select count(*)::int as n from public.communications where case_id = $1 and template_key = 'GUIDED_PACK_READY'", [staleCase])).toBe(1)
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [staleDraft.id, devOrigin])).toMatchObject({ status: "conflict", reason: "leased" })
    const recoveredProvider = createIdempotentMailProvider()
    expect(await settleDevSendEmailClaim({ rpc: namedRpc(), claim: recovered, provider: recoveredProvider })).toBe("succeeded")
    expect(recoveredProvider.effects).toBe(1)
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_v1", [staleDraft.id, devOrigin])).toMatchObject({ status: "denied", reason: "already_processed" })
    expect(await rpc<Json>("dev_mail_dispatch_claim_pack_retry_v1", [devOrigin])).toMatchObject({ status: "denied", reason: "not_queued" })
  })
})
