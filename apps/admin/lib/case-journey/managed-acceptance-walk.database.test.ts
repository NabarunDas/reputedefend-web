/**
 * Composed Managed acceptance walks on the full migration chain in PGlite.
 *
 * Both cases use the existing commands. Nothing here inserts a success-fee
 * approval, an obligation, an invoice, a receipt, or a VOID row. Settlement
 * is the test-mode `invoice.paid` event (`livemode` omitted, matching the
 * payments suite, which treats a missing flag as test mode). The email worker
 * is not run and nothing is submitted to Google.
 *
 * Membership and email verification have no RPC. Those two rows are the only
 * inserted authority facts. Agreement, case permission, manager access, and
 * `authorizationReady` come from their commands.
 *
 * Both cases move AUTHORIZATION_REQUIRED → PREPARATION → READY_TO_SUBMIT
 * before the first submission. No saved card or payment consent is inserted.
 * A first submission from any earlier Managed stage is denied. A later
 * submission from FURTHER_REVIEW still requires current authorisation.
 * Revoked permission or revoked manager access refuses that retry.
 *
 * `approve_success_fee` before a stored outcome, and after a non-qualifying
 * outcome, returns denied. Those refusals store no approval, obligation,
 * invoice, or receipt.
 *
 * No function updates `payment_obligations.state` to VOID, so a composed
 * voided-fee close is not reachable. The inserted-row case stays in
 * `close-billing.database.test.ts`.
 */

import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { narrowCaseFlowFacts, requiredCase } from "../case-flow/projection"
import type { CaseFlowCapabilityFact, CaseFlowFacts } from "../case-flow/model"
import type { CaseDetail } from "../cases/model"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../commercial/paid-service-approval.fixture"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import type { MoneyOrder } from "../payments/model"
import { applyChain, preparePlatform } from "../recovery/harness"
import { judgeAssessment, parseCaseAssessment } from "./assessment"
import { journeyStepIds } from "./catalogue"
import type { JourneyWorkEvent } from "./decisions"
import { presentJourneyOutcome } from "./outcome"
import { presentCaseJourney } from "./present"
import { renderManagedNotice, type ManagedNoticeVariant } from "../../../../lib/email/managed-journey"
import { createFakePaymentProvider } from "../../../../lib/payments/fake"
import { reconcileDisputedInvoice } from "../payments/invoice-hold"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const otherAuth = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const otherCustomer = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const business = "33333333-3333-4333-8333-333333333333"
const successLocation = "b2000000-0000-4000-8000-0000000000b2"
const unsuccessfulLocation = "c2000000-0000-4000-8000-0000000000c2"
const reviewLocation = "e2000000-0000-4000-8000-0000000000e2"
const successCase = "b1000000-0000-4000-8000-0000000000b1"
const unsuccessfulCase = "c1000000-0000-4000-8000-0000000000c1"
const reviewCase = "e1000000-0000-4000-8000-0000000000e1"
const token = "b".repeat(64)
const note = "Reviewed the caller’s request and confirmed the details."
const staffNote = "Staff intake note stays off the customer record."
const agreementBody = "This is the owner-approved service wording for this exact case snapshot and must not be invented by the application."
const agreementScope = "Restore the listed Google Business Profile for this case only."
const managerEvidence = "Seen in Google Business Manager on a live screen share."
const feeNote = "Screenshot of the Google outcome page."
const feeReason = "Outcome matches the accepted success definition."
const packNote = "This exact evidence selection is the prepared pack for internal use."
const publishNote = "Publish this pack for the customer case-access view."
const capabilities: CaseFlowCapabilityFact = { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false }
const now = "2026-10-20T12:00:00.000Z"
let alexSession = ""
let samSession = ""

type Json = Record<string, unknown> & {
  status?: string
  id?: string
  version?: number
  recordVersion?: number
  authorizationId?: string
  versionId?: string
  documentId?: string
  orderId?: string
  obligationId?: string
  providerOperationId?: string
  authorizationReady?: boolean
  duplicate?: boolean
}

const key = () => crypto.randomUUID()
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const secret = () => hash(randomBytes(32).toString("hex"))
const ahead = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString()
const historicReason = "Disposable synthetic evidence was accepted at the stated check time."

async function orderBasis(orderId: string) {
  return (await db.query<{
    success_definition: string
    customer_id: string
    case_id: string
    case_type: string
    issue_description: string
    target_ref: string
  }>(`
    select qv.success_definition, so.customer_id, so.case_id, cs.case_type, cs.issue_description,
      qa.accepted_target_ref as target_ref
    from public.service_orders so
    join public.quote_versions qv on qv.id = so.quote_version_id
    join public.quote_acceptances qa on qa.id = so.quote_acceptance_id
    join public.cases cs on cs.id = so.case_id
    where so.id = $1
  `, [orderId])).rows[0]
}

async function insertAcceptedFile(caseId: string, createdAt: string) {
  const documentId = key()
  const versionId = key()
  await db.query(
    "insert into public.case_documents(id, case_id, title, created_by) values ($1,$2,'Check screenshot',$3)",
    [documentId, caseId, admin],
  )
  await db.query(`
    insert into public.case_document_versions(
      id, document_id, version_number, original_filename, declared_content_type, declared_size_bytes,
      storage_bucket, storage_key, upload_status, scan_status, validation_status, review_status, created_by, created_at
    ) values ($1,$2,1,'check.png','image/png',2048,'test-evidence',$3,'UPLOADED','NO_THREATS_FOUND','VALID','ACCEPTED',$4,$5::timestamptz)
  `, [versionId, documentId, `cases/${caseId}/documents/${documentId}/versions/${versionId}`, admin, createdAt])
  return versionId
}

/**
 * Reuse an accepted file that already belonged to the case when the assessment
 * was approved. Changing its upload time does not change the assessment basis.
 * A brand-new file is only for a rolled-back negative, where it cannot reopen
 * the approved assessment.
 */
async function acceptedEvidence(caseId: string, createdAt: string) {
  const free = await db.query<{ id: string }>(`
    select v.id
    from public.case_document_versions v
    join public.case_documents d on d.id = v.document_id
    where d.case_id = $1
      and v.upload_status = 'UPLOADED'
      and v.scan_status = 'NO_THREATS_FOUND'
      and v.validation_status = 'VALID'
      and v.review_status = 'ACCEPTED'
      and not exists (select 1 from public.success_baselines b where b.evidence_version_id = v.id)
      and not exists (select 1 from public.success_observations o where o.evidence_version_id = v.id)
    order by v.created_at, v.id
    limit 1
  `, [caseId])
  if (!free.rows[0]) return insertAcceptedFile(caseId, createdAt)
  await db.query("update public.case_document_versions set created_at = $2::timestamptz where id = $1", [free.rows[0].id, createdAt])
  return free.rows[0].id
}

async function ensureBaseline(orderId: string) {
  const existing = await db.query<{ id: string }>("select id from public.success_baselines where service_order_id = $1", [orderId])
  if (existing.rows[0]) return existing.rows[0].id
  const basis = await orderBasis(orderId)
  const evidenceId = await acceptedEvidence(basis.case_id, "2025-12-01T00:00:00.000Z")
  const inserted = await db.query<{ id: string }>(`
    insert into public.success_baselines(
      request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
      evidence_version_id, recorded_by
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    returning id
  `, [
    key(), basis.case_id, basis.customer_id, orderId, basis.target_ref, basis.issue_description,
    basis.success_definition, evidenceId, admin,
  ])
  return inserted.rows[0].id
}

function visibilityFor(caseType: string, finding: string) {
  if (caseType !== "REVIEW_PROTECTION") return "NOT_APPLICABLE"
  return finding === "PRESENT" || finding === "RECURRENCE" ? "VISIBLE" : "NOT_SHOWN"
}

/**
 * Historic checks use disposable evidence whose created_at is the check time.
 * They are not a backdate of a real DEV observation.
 */
async function insertObservation(orderId: string, input: {
  observedAt: string
  finding?: string
  customerId?: string
  visibility?: string
  successDefinition?: string
  historic?: boolean
  evidenceVersionId?: string
  sourceAccess?: string
}) {
  const basis = await orderBasis(orderId)
  const baselineId = await ensureBaseline(orderId)
  const finding = input.finding ?? "ABSENT"
  const historic = input.historic !== false
  const evidenceVersionId = input.evidenceVersionId ?? await acceptedEvidence(basis.case_id, historic ? input.observedAt : new Date().toISOString())
  const inserted = await db.query<{ id: string }>(`
    insert into public.success_observations(
      request_id, baseline_id, case_id, customer_id, service_order_id, evidence_version_id, success_definition,
      observed_at, finding, review_visibility, source_access, historic_exception, historic_reason,
      observer_ref, note, approved_by, approved_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11,$12,$13,$14,$15,$16, now()
    ) returning id
  `, [
    key(),
    baselineId,
    basis.case_id,
    input.customerId ?? basis.customer_id,
    orderId,
    evidenceVersionId,
    input.successDefinition ?? basis.success_definition,
    input.observedAt,
    finding,
    input.visibility ?? visibilityFor(basis.case_type, finding),
    input.sourceAccess ?? "ACCESSIBLE",
    historic,
    historic ? historicReason : null,
    "staff-observer-live-check",
    "Checked the contracted target on the accepted evidence.",
    admin,
  ])
  return inserted.rows[0].id
}

async function verificationReady(caseId: string, orderId: string) {
  return (await db.query<{ ready: boolean }>(
    "select admin_private.success_verification_ready_v1($1::uuid, $2::uuid) as ready",
    [caseId, orderId],
  )).rows[0].ready
}

async function invoicePortal(caseId: string) {
  const reference = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [caseId])).rows[0].public_ref
  const action = (await db.query<{ id: string }>(`
    select id from public.customer_actions
    where case_id = $1 and customer_id = $2 and kind = 'INVOICE_PAYMENT'
    order by created_at desc limit 1
  `, [caseId, customer])).rows[0]
  const selector = (await db.query<{ selector: string }>(
    "select admin_private.customer_portal_action_selector_v1($1::uuid) as selector",
    [action.id],
  )).rows[0].selector
  const target = await rpc<{ status?: string; hostedInvoiceUrl?: string }>("customer_portal_invoice_target_v1", [alexSession, reference, selector])
  return { reference, selector, target }
}

async function recordInvoiceHold(
  pauseId: string,
  invoiceId: string,
  state: "VOID_CONFIRMED" | "ALREADY_PAID" | "VOID_UNCONFIRMED",
  providerStatus: string | null,
) {
  const detail = state === "VOID_CONFIRMED"
    ? "The fake provider confirmed this hosted invoice is void."
    : state === "ALREADY_PAID"
      ? "The fake provider reported this invoice paid. No refund was created."
      : "The fake provider did not confirm a void. The local invoice was left unchanged."
  return rpc<{ status?: string; hold?: string; invoiceStatus?: string }>("admin_record_success_fee_invoice_hold_v1", [token, key(), {
    pauseId, invoiceId, state, providerStatus, detail,
  }])
}

async function rolledBack(seed: () => Promise<void>) {
  await db.exec("begin")
  try {
    await seed()
  } finally {
    await db.exec("rollback")
  }
}

async function rpc<T = Json>(name: string, args: unknown[]): Promise<T> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",")
  const value = (await db.query<{ value: T }>(`select public.${name}(${placeholders}) as value`, args)).rows[0].value
  if (value === undefined || value === null) throw new Error(`${name} returned null`)
  return value
}

const mailOrigin = "https://customer.example.test"
const mailFrom = "ops@example.com"
const mailReply = "cases@profilerelaunch.com"

async function drainManagedMail(caseId: string, kind: string) {
  const queued: string[] = []
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ctx = await rpc<Json>("admin_managed_notice_context_v1", [token, kind, caseId])
    if (ctx.status === "already_queued" || ctx.status === "not_applicable") return { status: ctx.status, queued }
    expect(ctx.status, JSON.stringify(ctx)).toBe("applicable")
    const rendered = renderManagedNotice({
      variant: ctx.variant as ManagedNoticeVariant,
      serviceCode: String(ctx.serviceCode),
      serviceName: String(ctx.serviceName),
      caseRef: String(ctx.caseRef),
      amountMinor: ctx.amountMinor == null ? null : Number(ctx.amountMinor),
      currency: "GBP",
      origin: mailOrigin,
      replyTo: mailReply,
    })
    expect(rendered, JSON.stringify(ctx)).not.toBeNull()
    const request = key()
    const payload = {
      subject: rendered!.subject,
      bodyText: rendered!.text,
      bodyHtml: rendered!.html,
      fromAddress: mailFrom,
      replyTo: mailReply,
      customerOrigin: mailOrigin,
    }
    expectOk(await rpc("admin_queue_managed_notice_v1", [token, request, caseId, kind, payload]), `${kind} email`)
    expect(await rpc("admin_queue_managed_notice_v1", [token, request, caseId, kind, payload])).toMatchObject({ status: "success", replay: true })
    queued.push(String(ctx.variant))
  }
  throw new Error(`too many ${kind} emails for ${caseId}`)
}

function expectOk(value: { status?: string }, label: string) {
  expect(value.status, `${label}: ${JSON.stringify(value)}`).toBe("success")
}

async function versionOf(caseId: string) {
  return (await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id = $1", [caseId])).rows[0].workflow_version
}

async function stageOf(caseId: string) {
  return (await db.query<{ work_stage: string }>("select work_stage from public.cases where id = $1", [caseId])).rows[0].work_stage
}

async function submissionCount(caseId: string) {
  return (await db.query<{ n: number }>("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).rows[0].n
}

async function stepState(caseId: string, id: string) {
  return (await journeyFor(caseId)).steps.find(step => step.id === id)?.state
}

function submissionData(reference: string, submittedAt = "2026-02-01T12:00:00.000Z") {
  return {
    submittedAt,
    reference,
    channel: "Google appeals tool",
    evidence: "Submission receipt reviewed and referenced",
    confirmed: true,
  }
}

async function caseCommand(caseId: string, operation: string, data: Record<string, unknown>, request = key()) {
  return rpc("admin_case_command_v1", [token, request, caseId, await versionOf(caseId), operation, { note, ...data }])
}

async function move(caseId: string, target: string, due: string | null = null) {
  const result = await caseCommand(caseId, "transition", { target, nextAction: due ? "Follow up with the customer" : "", due })
  expectOk(result, `transition ${target}`)
}

async function freshSession() {
  await db.exec(`update public.admin_sessions set created_at = now() where token_hash = '${token}'`)
}

async function orderRow(caseId: string) {
  return (await db.query<{ id: string; public_ref: string; amount_minor: number; record_version: number; state: string }>(
    "select id, public_ref, amount_minor, record_version, state from public.service_orders where case_id = $1",
    [caseId],
  )).rows[0]
}

async function approvalCount(orderId: string) {
  return (await db.query<{ n: number }>(
    "select count(*)::int as n from public.success_fee_approvals where service_order_id = $1",
    [orderId],
  )).rows[0].n
}

async function commandReceiptCount(requestId: string) {
  return (await db.query<{ n: number }>(
    "select count(*)::int as n from admin_private.payment_command_receipts where request_id = $1",
    [requestId],
  )).rows[0].n
}

async function chargeCounts(caseId: string) {
  const obligations = await db.query<{ n: number }>(
    "select count(*)::int as n from public.payment_obligations where case_id = $1",
    [caseId],
  )
  const invoices = await db.query<{ n: number }>(
    `select count(*)::int as n from public.payment_invoices i
     join public.payment_obligations b on b.id = i.obligation_id
     where b.case_id = $1`,
    [caseId],
  )
  const receipts = await db.query<{ n: number }>(
    `select count(*)::int as n from public.payment_receipts r
     join public.payment_obligations b on b.id = r.obligation_id
     where b.case_id = $1`,
    [caseId],
  )
  return { obligations: obligations.rows[0].n, invoices: invoices.rows[0].n, receipts: receipts.rows[0].n }
}

async function factsFor(caseId: string) {
  const payload = (await db.query<{ value: unknown }>("select public.admin_case_flow_facts_v1($1, $2::uuid[]) as value", [token, [caseId]])).rows[0].value
  return requiredCase(narrowCaseFlowFacts(payload, [caseId], capabilities), caseId)
}

async function eventsFor(caseId: string): Promise<JourneyWorkEvent[]> {
  const work = await db.query<{ id: string; event: string; created_at: string; details: Record<string, unknown> }>(
    "select id::text, event, created_at::text, details from public.case_work_events where case_id = $1 order by id",
    [caseId],
  )
  return work.rows.map(row => ({ id: row.id, event: row.event, createdAt: row.created_at, details: row.details }))
}

async function journeyFor(caseId: string) {
  const facts = await factsFor(caseId)
  const assessment = judgeAssessment(parseCaseAssessment(await rpc("admin_case_assessment_read_v1", [token, caseId])))
  return presentCaseJourney(facts, now, await eventsFor(caseId), { assessment })
}

function stepStates(presented: Awaited<ReturnType<typeof journeyFor>>) {
  return presented.steps.map(step => ({ id: step.id, state: step.state }))
}

async function moneyFor(caseId: string, facts: CaseFlowFacts): Promise<MoneyOrder> {
  const order = facts.payment.orders[0]
  const row = await orderRow(caseId)
  const obligation = (await db.query<{ id: string; kind: string; state: string }>(
    "select id, kind, state from public.payment_obligations where service_order_id = $1",
    [row.id],
  )).rows[0]
  const invoice = obligation
    ? (await db.query<{ id: string; status: string }>(
      "select id, status from public.payment_invoices where obligation_id = $1",
      [obligation.id],
    )).rows[0]
    : undefined
  const receipt = obligation
    ? (await db.query<{ id: string }>("select id from public.payment_receipts where obligation_id = $1", [obligation.id])).rows[0]
    : undefined
  const approval = (await db.query<{ id: string }>(
    "select id from public.success_fee_approvals where service_order_id = $1",
    [row.id],
  )).rows[0]
  return {
    orderId: row.id,
    orderRef: row.public_ref,
    customerId: customer,
    caseId,
    serviceCode: "MANAGED_RELAUNCH",
    amountMinor: row.amount_minor,
    currency: "GBP",
    paymentModel: order.paymentModel,
    orderState: order.orderState,
    version: row.record_version,
    obligationId: obligation?.id ?? null,
    obligationKind: obligation?.kind ?? null,
    obligationState: obligation?.state ?? null,
    setupReady: order.setupReady,
    consentId: order.consentRecorded ? "consent" : null,
    approvalId: approval?.id ?? null,
    receiptId: receipt?.id ?? null,
    invoiceId: invoice?.id ?? null,
    invoiceStatus: invoice?.status ?? null,
    acceptedEvidence: [],
  }
}

async function outcomePanel(caseId: string) {
  const facts = await factsFor(caseId)
  const detail = await rpc<CaseDetail>("admin_case_detail_v1", [token, caseId, null])
  return presentJourneyOutcome({
    facts,
    now,
    recorded: {
      submissions: detail.submissions,
      caseTrack: "MANAGED",
      caseOutcome: facts.outcome,
      caseStatus: facts.caseStatus,
      moneyOrders: [await moneyFor(caseId, facts)],
    },
    events: await eventsFor(caseId),
  })
}

async function openCustomer(email: string, authUser: string) {
  const pending = secret()
  expect(await rpc("customer_portal_begin_login_v1", [email, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_portal_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  const session = secret()
  expect(await rpc("customer_portal_finish_otp_v1", [pending, session, authUser, email])).toMatchObject({ status: "ok" })
  return session
}

async function acceptLink(actionId: string | undefined, secretHash: string) {
  const pending = secret()
  const session = secret()
  expect(await rpc("customer_action_exchange_v1", [actionId, secretHash, pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
  expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
  return session
}

async function acceptAgreement(caseId: string, kind: "SERVICE_AGREEMENT" | "CASE_MANAGEMENT_PERMISSION") {
  const raw = randomBytes(32).toString("hex")
  const created = await rpc("admin_authorization_command_v1", [token, key(), caseId, "create_agreement_action", {
    kind,
    title: kind === "SERVICE_AGREEMENT"
      ? "Managed recovery service agreement"
      : "Case-management permission snapshot for this case only",
    bodyText: agreementBody,
    scopeText: agreementScope,
    expiresAt: ahead(48),
    secretHash: hash(raw),
  }])
  expectOk(created, kind)
  const session = await acceptLink(created.id, hash(raw))
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", { accepted: true }])
  expect(accepted).toMatchObject({
    status: "success",
    authorizationStatus: "ACTIVE",
  })
  return accepted
}

async function deliverRequest(caseId: string, requestId: string, marker: string) {
  const drafted = await rpc("admin_communication_command_v1", [token, key(), "draft", {
    templateKey: "EVIDENCE_REQUEST",
    caseId,
    evidenceRequestId: requestId,
    customerOrigin: "https://customer.profilerelaunch.com",
    actionId: key(),
    secretHash: secret(),
    linkKeyVersion: 1,
  }, null])
  expectOk(drafted, "draft request")
  const reviewed = await rpc("admin_communication_command_v1", [token, key(), "review", {
    communicationId: drafted.id, fromAddress: "ops@example.com",
  }, drafted.version])
  expectOk(reviewed, "review request")
  const queued = await rpc("admin_communication_command_v1", [token, key(), "queue", {
    communicationId: reviewed.id, sendEnabled: true,
  }, reviewed.version])
  expectOk(queued, "queue request")
  expect(await rpc("communication_mark_provider_accepted_v1", [reviewed.id, "resend", `msg_${marker}`, `send-email:${reviewed.id}:v1`])).toMatchObject({ status: "success" })
  expect(await rpc("communication_apply_provider_event_v1", ["resend", `evt_${marker}`, "email.delivered", `msg_${marker}`, "2026-02-02T12:00:00.000Z"])).toMatchObject({ status: "success", applied: true })
}

async function approveFee(orderId: string, evidenceVersionId: string, recordVersion: number, requestId = key(), sessionToken = token) {
  await freshSession()
  return rpc("admin_payment_command_v1", [sessionToken, requestId, "approve_success_fee", {
    serviceOrderId: orderId,
    outcomeEvidenceVersionId: evidenceVersionId,
    evidenceNote: feeNote,
    approvalReason: feeReason,
  }, recordVersion])
}

async function walkToReadyForOutcome(input: { caseId: string; locationId: string; marker: string; closeOutcome: string; serviceCode?: string }) {
  const { caseId, locationId, marker, closeOutcome } = input
  const serviceCode = input.serviceCode ?? "MANAGED_RELAUNCH"
  expectOk(await rpc("admin_case_journey_decision_v1", [token, key(), caseId, await versionOf(caseId), "intake", {
    outcome: "REVIEWED", nextAction: "", note: staffNote,
  }]), "intake")
  expectOk(await rpc("admin_case_journey_decision_v1", [token, key(), caseId, await versionOf(caseId), "verification", {
    outcome: "PRELIMINARY_COMPLETE",
    source: "The enquiry and the location record",
    listing: "SUSPENDED_OR_MISSING",
    website: "NONE",
    discrepancy: false,
    reason: "The name and country on the enquiry match the records we hold.",
    note,
  }]), "verification")

  const request = await rpc("admin_evidence_request_v1", [
    token, key(), caseId, null, null, "create", "Ownership letter", "Upload the ownership letter for this bakery.", null, null,
  ])
  expectOk(request, "evidence request")
  const begun = await rpc("admin_evidence_begin_v1", [
    token, key(), caseId, null, `${marker}.pdf`, "application/pdf", 1024, "Ownership letter", "test-evidence", request.id,
  ])
  expect(begun.versionId, JSON.stringify(begun)).toBeTruthy()
  expectOk(await rpc("admin_evidence_finalize_v1", [token, key(), caseId, begun.versionId]), "finalize")
  expectOk(await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, begun.versionId, "NO_THREATS_FOUND", "VALID", null]), "scan")
  const meta = await rpc("admin_evidence_version_v1", [token, caseId, begun.versionId])
  expectOk(await rpc("admin_evidence_review_v1", [
    token, key(), caseId, begun.versionId, meta.recordVersion, "accept", "Accepted after a clean scan.", null,
  ]), "accept evidence")
  const visible = await rpc("admin_evidence_version_v1", [token, caseId, begun.versionId])
  expectOk(await rpc("admin_evidence_review_v1", [
    token, key(), caseId, begun.versionId, visible.recordVersion, "set_visibility", "Customer may see this accepted file.", true,
  ]), "customer visibility")
  await deliverRequest(caseId, request.id!, marker)
  expectOk(await rpc("admin_evidence_request_v1", [
    token, key(), caseId, request.id, request.version, "fulfill", null, null, null, "Completed after the customer sent the letter.",
  ]), "fulfill")
  for (let spare = 0; spare < 8; spare += 1) await insertAcceptedFile(caseId, "2025-11-01T00:00:00.000Z")

  const draft = {
    recordVersion: 0,
    findings: "The profile was suspended and the ownership letter matches the bakery account.",
    evidenceConsidered: "One accepted ownership letter on a fulfilled request.",
    profileIssue: "The Google listing is suspended.",
    policyConcerns: "Ownership of the profile is the policy concern in view.",
    recommendedAction: "Recommend Managed recovery and leave the quote for a later step.",
    servicePathway: "MANAGED",
    rationale: "The accepted evidence is enough to recommend Managed rather than Guided.",
    risks: "Google may still refuse the recovery request.",
    outstandingInformation: "",
  }
  const saved = await rpc("admin_case_assessment_command_v1", [token, key(), caseId, await versionOf(caseId), "save_draft", draft])
  expectOk(saved, "assessment draft")
  const submitted = await rpc("admin_case_assessment_command_v1", [
    token, key(), caseId, await versionOf(caseId), "submit_review", { recordVersion: saved.recordVersion },
  ])
  expectOk(submitted, "assessment review")
  expectOk(await rpc("admin_case_assessment_command_v1", [
    token, key(), caseId, await versionOf(caseId), "approve", { recordVersion: submitted.recordVersion },
  ]), "assessment approval")
  expectOk(await caseCommand(caseId, "plan", {
    track: "MANAGED", priority: "NORMAL", assigned: true, nextAction: "Offer the Managed quote", due: null, firstResponseDue: null,
  }), "plan")
  await move(caseId, "ASSESSMENT_READY")
  await move(caseId, "SERVICE_SELECTION")

  const price = (await db.query<{ id: string }>(
    "select id from public.price_versions where service_code = $1 and seed_key is not null",
    [serviceCode],
  )).rows[0].id
  const quote = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    customerId: customer, businessId: business, caseId, locationId,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later success-fee collection are excluded.",
    validUntil: ahead(24 * 30),
    applyDiscount: false, priceVersionId: price, serviceCode,
  }, null])
  expectOk(quote, "quote draft")
  expectOk(await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", {
    quoteId: quote.id, taxBehaviour: "NOT_APPLICABLE",
  }, quote.version]), "quote tax")
  expectOk(await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: quote.id }, Number(quote.version) + 1]), "quote offer")
  const raw = randomBytes(32).toString("hex")
  const acceptance = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", {
    quoteId: quote.id, expiresAt: ahead(48), secretHash: hash(raw),
  }, null])
  expectOk(acceptance, "acceptance link")
  const session = await acceptLink(acceptance.id, hash(raw))
  const pinned = (await db.query<{ quote_version_id: string; service_code: string; location_id: string; total_amount_minor: number }>(
    `select a.quote_version_id, v.service_code, v.location_id, v.total_amount_minor
     from public.customer_actions a join public.quote_versions v on v.id = a.quote_version_id where a.id = $1`,
    [acceptance.id],
  )).rows[0]
  const accepted = await rpc("customer_action_command_v1", [session, key(), "accept", paidQuoteCommand({
    quoteVersionId: pinned.quote_version_id,
    serviceCode: pinned.service_code,
    locationId: pinned.location_id,
    amountMinor: pinned.total_amount_minor,
  })])
  expect(accepted).toMatchObject({ orderState: "ACCEPTED_SUCCESS_FEE" })
  expect(await chargeCounts(caseId)).toEqual({ obligations: 0, invoices: 0, receipts: 0 })

  const premature = await caseCommand(caseId, "submission", submissionData(`GOOGLE-${marker}`))
  expect(premature.status, JSON.stringify(premature)).toBe("denied")
  expect(await stageOf(caseId)).toBe("SERVICE_SELECTION")

  await move(caseId, "AUTHORIZATION_REQUIRED", ahead(24 * 40))
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(false)
  const absentAgreement = await caseCommand(caseId, "transition", { target: "PREPARATION", nextAction: "", due: null })
  expect(absentAgreement.status, JSON.stringify(absentAgreement)).toBe("prerequisite")
  expect(await stageOf(caseId)).toBe("AUTHORIZATION_REQUIRED")
  const earlySubmission = await caseCommand(caseId, "submission", submissionData(`GOOGLE-${marker}`))
  expect(earlySubmission.status, JSON.stringify(earlySubmission)).toBe("denied")
  expect(await stageOf(caseId)).toBe("AUTHORIZATION_REQUIRED")

  await acceptAgreement(caseId, "SERVICE_AGREEMENT")
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  expect((await caseCommand(caseId, "transition", { target: "PREPARATION", nextAction: "", due: null })).status).toBe("prerequisite")
  expect(await stageOf(caseId)).toBe("AUTHORIZATION_REQUIRED")

  const permission = await acceptAgreement(caseId, "CASE_MANAGEMENT_PERMISSION")
  expect(permission.authorizationId).toBeTruthy()
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(false)
  expect((await caseCommand(caseId, "transition", { target: "PREPARATION", nextAction: "", due: null })).status).toBe("prerequisite")
  expect(await stageOf(caseId)).toBe("AUTHORIZATION_REQUIRED")

  await freshSession()
  const verified = await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", {
    accessLevel: "MANAGER", evidence: managerEvidence, confirmed: true, recordVersion: 0,
  }])
  expect(verified).toMatchObject({ status: "success", managerStatus: "VERIFIED" })
  const readiness = await rpc("admin_case_authorization_readiness_v1", [token, caseId])
  expect(readiness).toMatchObject({
    serviceAgreementAccepted: true,
    caseManagementPermissionActive: true,
    managerAccessVerified: true,
    businessAuthorityVerified: true,
    authorizationReady: true,
  })
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).toBe("COMPLETED")
  const order = await orderRow(caseId)
  expect((await db.query<{ n: number }>("select count(*)::int as n from public.saved_payment_methods where service_order_id = $1", [order.id])).rows[0].n).toBe(0)
  expect((await db.query<{ n: number }>(
    "select count(*)::int as n from public.payment_consents where service_order_id = $1",
    [order.id],
  )).rows[0].n).toBe(0)
  expect((await db.query<{ ready: boolean }>("select admin_private.managed_setup_ready_v1($1) as ready", [caseId])).rows[0].ready).toBe(false)

  const version = await versionOf(caseId)
  const preparation = { note, target: "PREPARATION", nextAction: "", due: null }
  expect((await rpc("admin_case_command_v1", [token, key(), caseId, version - 1, "transition", preparation])).status).toBe("conflict")
  expect((await rpc("admin_case_command_v1", ["c".repeat(64), key(), caseId, version, "transition", preparation])).status).toBe("unauthorized")
  const preparationRequest = key()
  const entered = await rpc("admin_case_command_v1", [token, preparationRequest, caseId, version, "transition", preparation])
  expectOk(entered, "preparation")
  expect(await rpc("admin_case_command_v1", [token, preparationRequest, caseId, version, "transition", preparation])).toEqual(entered)
  expect((await db.query<{ n: number }>(
    "select count(*)::int as n from public.case_work_events where case_id = $1 and event = 'transition' and details->>'to' = 'PREPARATION'",
    [caseId],
  )).rows[0].n).toBe(1)
  expect(await stageOf(caseId)).toBe("PREPARATION")
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).toBe("COMPLETED")

  const duringPreparation = await caseCommand(caseId, "submission", submissionData(`GOOGLE-${marker}`))
  expect(duringPreparation.status, JSON.stringify(duringPreparation)).toBe("denied")
  expect(await stageOf(caseId)).toBe("PREPARATION")
  expect((await caseCommand(caseId, "transition", { target: "READY_TO_SUBMIT", nextAction: "", due: null })).status).toBe("prerequisite")
  expect(await stageOf(caseId)).toBe("PREPARATION")
  expect(await stepState(caseId, "PREPARATION")).not.toBe("COMPLETED")

  const pack = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, null, null, "create", {}])
  expectOk(pack, "pack")
  const added = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, pack.id, pack.recordVersion, "add_item", { versionId: begun.versionId }])
  expectOk(added, "pack item")
  const approvedPack = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, pack.id, added.recordVersion ?? 2, "approve", { note: packNote, confirmed: true }])
  expectOk(approvedPack, "pack approval")
  expectOk(await rpc("admin_prepared_pack_command_v1", [
    token, key(), caseId, pack.id, approvedPack.recordVersion, "publish", { note: publishNote, confirmed: true },
  ]), "pack publication")
  expect(await stepState(caseId, "PREPARATION")).toBe("COMPLETED")
  expect(await stageOf(caseId)).toBe("PREPARATION")

  await freshSession()
  const revokedAccess = await rpc("admin_manager_access_command_v1", [token, key(), caseId, "revoke", {
    reason: "Access removed after a live Google check.", confirmed: true, recordVersion: verified.recordVersion,
  }])
  expect(revokedAccess).toMatchObject({ status: "success", managerStatus: "REVOKED" })
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(false)
  expect((await caseCommand(caseId, "transition", { target: "READY_TO_SUBMIT", nextAction: "", due: null })).status).toBe("prerequisite")
  expect(await stageOf(caseId)).toBe("PREPARATION")
  await freshSession()
  const restoredAccess = await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", {
    accessLevel: "MANAGER", evidence: managerEvidence, confirmed: true, recordVersion: revokedAccess.recordVersion,
  }])
  expect(restoredAccess).toMatchObject({ status: "success", managerStatus: "VERIFIED" })
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).toBe("COMPLETED")

  await freshSession()
  expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "admin_revoke_authorization", {
    authorizationId: permission.authorizationId,
    reason: "Customer asked for an emergency stop after a live call.",
    confirmed: true,
    recordVersion: 1,
  }])).toMatchObject({ status: "success", authorizationStatus: "REVOKED" })
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(false)
  expect((await caseCommand(caseId, "transition", { target: "READY_TO_SUBMIT", nextAction: "", due: null })).status).toBe("prerequisite")
  expect(await stageOf(caseId)).toBe("PREPARATION")
  const restoredPermission = await acceptAgreement(caseId, "CASE_MANAGEMENT_PERMISSION")
  expect(restoredPermission.authorizationId).toBeTruthy()
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(true)
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).toBe("COMPLETED")
  expect((await db.query<{ ready: boolean }>("select admin_private.managed_setup_ready_v1($1) as ready", [caseId])).rows[0].ready).toBe(false)

  await move(caseId, "READY_TO_SUBMIT")
  expect(await stageOf(caseId)).toBe("READY_TO_SUBMIT")
  expect(await stepState(caseId, "PREPARATION")).toBe("COMPLETED")
  const filed = await caseCommand(caseId, "submission", submissionData(`GOOGLE-${marker}`))
  expectOk(filed, "submission")
  expect(await stageOf(caseId)).toBe("SUBMITTED")
  expect(await stepState(caseId, "SUBMISSION")).not.toBe("COMPLETED")
  const detail = await rpc<CaseDetail>("admin_case_detail_v1", [token, caseId, null])
  expect(detail.submissions[0]?.actor).toBe("ADMIN")
  await move(caseId, "OUTCOME_REVIEW")
  expect(await stageOf(caseId)).toBe("OUTCOME_REVIEW")
  expect((await caseCommand(caseId, "close", { outcome: closeOutcome, summary: "Probe while the submission is still open." })).status).toBe("open_work")
  expectOk(await caseCommand(caseId, "resolve_submission", { submissionId: detail.submissions[0].id, result: "DECIDED" }), "submission result")
  expect(await stepState(caseId, "SUBMISSION")).toBe("COMPLETED")
  const openTasks = await db.query<{ id: string }>("select id from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])
  expect(openTasks.rows.length).toBeGreaterThan(0)
  expect((await caseCommand(caseId, "close", { outcome: closeOutcome, summary: "Probe while a follow-up task is still open." })).status).toBe("open_work")
  for (const task of openTasks.rows) expectOk(await caseCommand(caseId, "resolve_task", { taskId: task.id, status: "DONE" }), "resolve task")

  await move(caseId, "FURTHER_REVIEW")
  expect(await stageOf(caseId)).toBe("FURTHER_REVIEW")
  expect(await submissionCount(caseId)).toBe(1)
  const retry = { note, ...submissionData(`GOOGLE-${marker}-2`, "2026-02-02T12:00:00.000Z") }
  await freshSession()
  expect(await rpc("admin_authorization_command_v1", [token, key(), caseId, "admin_revoke_authorization", {
    authorizationId: restoredPermission.authorizationId,
    reason: "Customer withdrew case-management permission before another submission.",
    confirmed: true,
    recordVersion: 1,
  }])).toMatchObject({ status: "success", authorizationStatus: "REVOKED" })
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(false)
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  const blockedPermissionVersion = await versionOf(caseId)
  const blockedPermissionRequest = key()
  const blockedPermission = await rpc("admin_case_command_v1", [token, blockedPermissionRequest, caseId, blockedPermissionVersion, "submission", retry])
  expect(blockedPermission.status, JSON.stringify(blockedPermission)).toBe("prerequisite")
  expect(await rpc("admin_case_command_v1", [token, blockedPermissionRequest, caseId, blockedPermissionVersion, "submission", retry])).toEqual(blockedPermission)
  expect(await submissionCount(caseId)).toBe(1)
  expect(await stageOf(caseId)).toBe("FURTHER_REVIEW")

  const currentPermission = await acceptAgreement(caseId, "CASE_MANAGEMENT_PERMISSION")
  expect(currentPermission.authorizationId).toBeTruthy()
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(true)
  await freshSession()
  const revokedRetryAccess = await rpc("admin_manager_access_command_v1", [token, key(), caseId, "revoke", {
    reason: "Access removed after a live Google check.", confirmed: true, recordVersion: restoredAccess.recordVersion,
  }])
  expect(revokedRetryAccess).toMatchObject({ status: "success", managerStatus: "REVOKED" })
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(false)
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  const blockedAccessVersion = await versionOf(caseId)
  const blockedAccessRequest = key()
  const blockedAccess = await rpc("admin_case_command_v1", [token, blockedAccessRequest, caseId, blockedAccessVersion, "submission", retry])
  expect(blockedAccess.status, JSON.stringify(blockedAccess)).toBe("prerequisite")
  expect(await rpc("admin_case_command_v1", [token, blockedAccessRequest, caseId, blockedAccessVersion, "submission", retry])).toEqual(blockedAccess)
  expect(await submissionCount(caseId)).toBe(1)
  expect(await stageOf(caseId)).toBe("FURTHER_REVIEW")

  await freshSession()
  expect(await rpc("admin_manager_access_command_v1", [token, key(), caseId, "verify", {
    accessLevel: "MANAGER", evidence: managerEvidence, confirmed: true, recordVersion: revokedRetryAccess.recordVersion,
  }])).toMatchObject({ status: "success", managerStatus: "VERIFIED" })
  expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(true)
  expect(await stepState(caseId, "SERVICE_ACTIVATION")).toBe("COMPLETED")
  const retryVersion = await versionOf(caseId)
  const retryRequest = key()
  const repeated = await rpc("admin_case_command_v1", [token, retryRequest, caseId, retryVersion, "submission", retry])
  expectOk(repeated, "later submission")
  expect(await rpc("admin_case_command_v1", [token, retryRequest, caseId, retryVersion, "submission", retry])).toEqual(repeated)
  expect(await submissionCount(caseId)).toBe(2)
  expect(await stageOf(caseId)).toBe("SUBMITTED")
  const attempts = await db.query<{ actor: string; recorded_by: string; google_reference: string }>(
    "select actor, recorded_by::text, google_reference from public.case_submissions where case_id = $1",
    [caseId],
  )
  expect(attempts.rows).toHaveLength(2)
  expect(attempts.rows.every(row => row.actor === "ADMIN" && row.recorded_by === admin)).toBe(true)
  expect(attempts.rows.filter(row => row.google_reference === `GOOGLE-${marker}-2`)).toHaveLength(1)
  const later = await rpc<CaseDetail>("admin_case_detail_v1", [token, caseId, null])
  const openAttempt = later.submissions.find(item => item.result === null)
  expect(openAttempt?.id).toBeTruthy()
  expect(openAttempt?.actor).toBe("ADMIN")
  expectOk(await caseCommand(caseId, "resolve_submission", { submissionId: openAttempt?.id, result: "DECIDED" }), "later result")
  expect((await drainManagedMail(caseId, "submission")).queued).toEqual(["submitted", "follow_up"])
  expect((await drainManagedMail(caseId, "result")).queued).toEqual(["google_reply", "google_reply"])
  await move(caseId, "OUTCOME_REVIEW")
  expect(await stageOf(caseId)).toBe("OUTCOME_REVIEW")
  expect(await stepState(caseId, "SUBMISSION")).toBe("COMPLETED")
  expect((await db.query<{ status: string }>("select status from public.cases where id = $1", [caseId])).rows[0].status).not.toBe("CLOSED")
  return { evidenceVersionId: begun.versionId!, orderId: (await orderRow(caseId)).id }
}

beforeAll(async () => {
  await preparePlatform(db)
  await applyChain(db)
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${admin}', 'admin@profilerelaunch.com', now()),
      ('${customerAuth}', 'alex@example.com', now()),
      ('${otherAuth}', 'sam@example.com', now());
    insert into public.admin_identity(singleton, auth_user_id, enabled) values (true, '${admin}', true)
      on conflict (singleton) do update set auth_user_id = excluded.auth_user_id, enabled = true;
    insert into public.admin_sessions(token_hash, auth_user_id) values ('${token}', '${admin}');
    insert into public.customers(id, full_name, email) values
      ('${customer}', 'Alex', 'alex@example.com'),
      ('${otherCustomer}', 'Sam', 'sam@example.com');
    insert into public.businesses(id, display_name) values ('${business}', 'Bakery');
    insert into public.locations(id, business_id, country, business_profile_url) values
      ('${successLocation}', '${business}', 'United Kingdom', 'https://maps.google.com/?cid=managed-success'),
      ('${unsuccessfulLocation}', '${business}', 'United Kingdom', 'https://maps.google.com/?cid=managed-unsuccessful'),
      ('${reviewLocation}', '${business}', 'United Kingdom', 'https://maps.google.com/?cid=managed-review-place');
    insert into public.cases(
      id, case_type, customer_id, business_id, location_id, issue_description, review_url, intake_snapshot, created_at,
      information_accurate_at, privacy_accepted_at
    ) values
      (
        '${successCase}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${successLocation}', 'The profile disappeared.', null,
        '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"The profile disappeared."}'::jsonb,
        '2026-01-01', now(), now()
      ),
      (
        '${unsuccessfulCase}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${unsuccessfulLocation}', 'The profile disappeared.', null,
        '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"The profile disappeared."}'::jsonb,
        '2026-01-01', now(), now()
      ),
      (
        '${reviewCase}', 'REVIEW_PROTECTION', '${customer}', '${business}', '${reviewLocation}', 'A review should be removed.',
        'https://maps.google.com/maps/reviews/managed-review-1',
        '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"A review should be removed."}'::jsonb,
        '2026-01-01', now(), now()
      );
    insert into public.customer_contact_verifications(customer_id, channel, verified_value, verified_by, evidence) values
      ('${customer}', 'email', 'alex@example.com', '${admin}', 'Verified from a live call with the customer.'),
      ('${otherCustomer}', 'email', 'sam@example.com', '${admin}', 'Verified from a live call with the customer.');
    insert into public.business_memberships(customer_id, business_id, status, verified_at, verified_by, evidence) values
      ('${customer}', '${business}', 'verified', now(), '${admin}', 'Companies House match discussed on a live call.');
  `)
  await db.exec(syntheticPurchasingEstablishmentSql(business, admin))
  const approved = await rpc("admin_confirm_paid_service_agreement_v1", [token, SYNTHETIC_APPROVAL_REQUEST, SYNTHETIC_APPROVAL_EVIDENCE])
  expect(approved.status, JSON.stringify(approved)).toBe("confirmed")
  alexSession = await openCustomer("alex@example.com", customerAuth)
  samSession = await openCustomer("sam@example.com", otherAuth)
}, 240000)

afterAll(async () => {
  await db.close()
})

describe("composed Managed acceptance walks", () => {
  it("settles one qualifying Managed case only after the test-mode invoice is paid", async () => {
    const summary = "The listing was restored and the success fee was settled in test mode."
    const walked = await walkToReadyForOutcome({
      caseId: successCase, locationId: successLocation, marker: "managedok", closeOutcome: "RESTORED",
    })
    const beforeFee = await orderRow(successCase)
    expect((await caseCommand(successCase, "close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    const guard = await db.query<{ src: string }>(
      "select prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'admin_private' and p.proname = 'admin_payment_command_core_v1'",
    )
    expect(guard.rows[0].src).toContain("qualifying_success_outcome_v1(cs) IS NOT TRUE")
    const missingRequest = key()
    expect((await approveFee(beforeFee.id, walked.evidenceVersionId, beforeFee.record_version, missingRequest)).status).toBe("denied")
    expect((await approveFee(beforeFee.id, walked.evidenceVersionId, beforeFee.record_version, missingRequest)).status).toBe("denied")
    expect(await commandReceiptCount(missingRequest)).toBe(0)
    expect(await approvalCount(beforeFee.id)).toBe(0)
    expect(await chargeCounts(successCase)).toEqual({ obligations: 0, invoices: 0, receipts: 0 })

    expectOk(await caseCommand(successCase, "record_outcome", { outcome: "RESTORED", summary }), "record outcome")
    expect((await db.query<{ status: string; work_stage: string; outcome: string }>(
      "select status, work_stage, outcome from public.cases where id = $1",
      [successCase],
    )).rows[0]).toMatchObject({ status: "UNDER_REVIEW", work_stage: "OUTCOME_REVIEW", outcome: "RESTORED" })
    const recordedOrder = await orderRow(successCase)
    const unauthorizedRequest = key()
    expect((await approveFee(recordedOrder.id, walked.evidenceVersionId, recordedOrder.record_version, unauthorizedRequest, "c".repeat(64))).status).toBe("unauthorized")
    const staleRequest = key()
    expect((await approveFee(recordedOrder.id, walked.evidenceVersionId, recordedOrder.record_version + 99, staleRequest)).status).toBe("conflict")
    const invalidEvidenceRequest = key()
    expect((await approveFee(recordedOrder.id, key(), recordedOrder.record_version, invalidEvidenceRequest)).status).toBe("denied")
    for (const requestId of [unauthorizedRequest, staleRequest, invalidEvidenceRequest]) {
      expect(await commandReceiptCount(requestId)).toBe(0)
    }
    expect(await approvalCount(recordedOrder.id)).toBe(0)
    expect(await chargeCounts(successCase)).toEqual({ obligations: 0, invoices: 0, receipts: 0 })
    const unverifiedRequest = key()
    expect(await approveFee(recordedOrder.id, walked.evidenceVersionId, recordedOrder.record_version, unverifiedRequest)).toMatchObject({
      status: "denied", reason: "success_verification",
    })
    expect(await commandReceiptCount(unverifiedRequest)).toBe(0)
    expect(await approvalCount(recordedOrder.id)).toBe(0)
    await rolledBack(async () => {
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
    })
    await rolledBack(async () => {
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
    })
    await rolledBack(async () => {
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-02T00:00:00.000Z" })
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
    })
    await rolledBack(async () => {
      await expect(insertObservation(recordedOrder.id, { observedAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(), historic: false })).rejects.toThrow(/timestamp/)
    })
    await rolledBack(async () => {
      await expect(insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z", historic: false })).rejects.toThrow(/timestamp/)
    })
    await rolledBack(async () => {
      const shared = await acceptedEvidence(successCase, "2026-01-01T00:00:00.000Z")
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z", evidenceVersionId: shared })
      await expect(insertObservation(recordedOrder.id, { observedAt: "2026-01-03T00:00:00.000Z", evidenceVersionId: shared })).rejects.toThrow(/timestamp/)
    })
    await rolledBack(async () => {
      const shared = await acceptedEvidence(successCase, "2026-01-01T00:00:00.000Z")
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z", evidenceVersionId: shared })
      await expect(insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z", evidenceVersionId: shared })).rejects.toThrow(/duplicate|unique/i)
    })
    const acceptedTarget = (await db.query<{ accepted_target_ref: string }>(`
      select qa.accepted_target_ref
      from public.service_orders so
      join public.quote_acceptances qa on qa.id = so.quote_acceptance_id
      where so.id = $1
    `, [recordedOrder.id])).rows[0].accepted_target_ref
    expect(acceptedTarget).toBe("https://maps.google.com/?cid=managed-success")
    await rolledBack(async () => {
      await db.query("update public.locations set business_profile_url = 'https://maps.google.com/?cid=changed-before-baseline' where id = $1", [successLocation])
      const basis = await orderBasis(recordedOrder.id)
      const evidenceId = await acceptedEvidence(successCase, "2025-12-02T00:00:00.000Z")
      await expect(db.query(`
        insert into public.success_baselines(
          request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
          evidence_version_id, recorded_by
        ) values ($1,$2,$3,$4,'https://maps.google.com/?cid=changed-before-baseline',$5,$6,$7,$8)
      `, [key(), basis.case_id, basis.customer_id, recordedOrder.id, basis.issue_description, basis.success_definition, evidenceId, admin])).rejects.toThrow(/target_changed/)
    })
    await rolledBack(async () => {
      await db.query("update public.locations set business_profile_url = 'https://maps.google.com/?cid=changed-before-baseline' where id = $1", [successLocation])
      const basis = await orderBasis(recordedOrder.id)
      const evidenceId = await acceptedEvidence(successCase, "2025-12-03T00:00:00.000Z")
      await expect(db.query(`
        insert into public.success_baselines(
          request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
          evidence_version_id, recorded_by
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [key(), basis.case_id, basis.customer_id, recordedOrder.id, acceptedTarget, basis.issue_description, basis.success_definition, evidenceId, admin])).rejects.toThrow(/target_changed/)
    })
    await rolledBack(async () => {
      await db.query("update public.locations set business_profile_url = null where id = $1", [successLocation])
      const baselineId = await ensureBaseline(recordedOrder.id)
      expect(baselineId).toBeTruthy()
      expect((await db.query<{ target_ref: string }>("select target_ref from public.success_baselines where id = $1", [baselineId])).rows[0].target_ref).toBe(acceptedTarget)
    })
    await rolledBack(async () => {
      await ensureBaseline(recordedOrder.id)
      const frozen = (await db.query<{ target_ref: string }>("select target_ref from public.success_baselines where service_order_id = $1", [recordedOrder.id])).rows[0].target_ref
      await db.query("update public.locations set business_profile_url = 'https://maps.google.com/?cid=other-bakery' where id = $1", [successLocation])
      const still = (await db.query<{ target_ref: string }>("select target_ref from public.success_baselines where service_order_id = $1", [recordedOrder.id])).rows[0].target_ref
      expect(still).toBe(frozen)
      expect(still).not.toBe("https://maps.google.com/?cid=other-bakery")
      const basis = await orderBasis(recordedOrder.id)
      const evidenceId = await acceptedEvidence(successCase, "2025-12-02T00:00:00.000Z")
      await expect(db.query(`
        insert into public.success_baselines(
          request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
          evidence_version_id, recorded_by
        ) values ($1,$2,$3,$4,'https://maps.google.com/?cid=managed-success',$5,$6,$7,$8)
      `, [key(), basis.case_id, basis.customer_id, recordedOrder.id, basis.issue_description, basis.success_definition, evidenceId, admin])).rejects.toThrow(/target_changed/)
    })
    await rolledBack(async () => {
      await expect(insertObservation(recordedOrder.id, { customerId: otherCustomer, observedAt: "2026-01-01T00:00:00.000Z" })).rejects.toThrow(/baseline/)
    })
    expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
    await rolledBack(async () => {
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(recordedOrder.id, { finding: "AMBIGUOUS", observedAt: "2026-01-03T00:00:00.000Z" })
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
    })
    await rolledBack(async () => {
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-03T00:00:00.000Z" })
      await insertObservation(recordedOrder.id, { finding: "RECURRENCE", observedAt: "2026-01-02T12:00:00.000Z" })
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
    })
    await rolledBack(async () => {
      const first = await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-03T00:00:00.000Z" })
      const spoiler = await insertObservation(recordedOrder.id, { finding: "AMBIGUOUS", observedAt: "2026-01-02T00:00:00.000Z" })
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
      await db.query(
        "insert into public.success_observation_invalidations(observation_id, request_id, reason, invalidated_by) values ($1,$2,$3,$4)",
        [spoiler, key(), "The ambiguous check was a different incident and is withdrawn.", admin],
      )
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(true)
      const kept = (await db.query<{ id: string }>("select id from public.success_observations where id = $1", [first])).rows[0]
      expect(kept.id).toBe(first)
      const original = (await db.query<{ finding: string }>("select finding from public.success_observations where id = $1", [spoiler])).rows[0]
      expect(original.finding).toBe("AMBIGUOUS")
    })
    await rolledBack(async () => {
      await expect(insertObservation(recordedOrder.id, { visibility: "VISIBLE", observedAt: "2026-01-01T00:00:00.000Z" })).rejects.toThrow(/visibility/)
    })
    await rolledBack(async () => {
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(recordedOrder.id, { observedAt: "2026-01-03T00:00:00.000Z" })
      const spoiler = await insertObservation(recordedOrder.id, { finding: "AMBIGUOUS", observedAt: "2026-01-02T00:00:00.000Z" })
      const evidenceId = (await db.query<{ evidence_version_id: string }>(
        "select evidence_version_id from public.success_observations where id = $1",
        [spoiler],
      )).rows[0].evidence_version_id
      await db.query("update public.case_document_versions set review_status = 'REJECTED' where id = $1", [evidenceId])
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
      await db.query(
        "insert into public.success_observation_invalidations(observation_id, request_id, reason, invalidated_by) values ($1,$2,$3,$4)",
        [spoiler, key(), "The check's evidence is no longer accepted, so it is withdrawn.", admin],
      )
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(true)
    })
    await rolledBack(async () => {
      const liveAt = new Date().toISOString()
      await insertObservation(recordedOrder.id, { observedAt: liveAt, historic: false })
      await insertObservation(recordedOrder.id, { observedAt: liveAt, historic: false })
      expect(await verificationReady(successCase, recordedOrder.id)).toBe(false)
    })
    const firstCheck = await insertObservation(recordedOrder.id, { observedAt: "2026-01-01T00:00:00.000Z" })
    const secondCheck = await insertObservation(recordedOrder.id, { observedAt: "2026-01-03T00:00:00.000Z" })
    await insertObservation(recordedOrder.id, { observedAt: "2026-01-05T00:00:00.000Z" })
    await insertObservation(recordedOrder.id, { observedAt: "2026-01-07T00:00:00.000Z" })
    expect(await verificationReady(successCase, recordedOrder.id)).toBe(true)
    const snapshot = await rpc<{ status?: string; ready?: string[] }>("admin_success_verification_v1", [token, [recordedOrder.id]])
    expect(snapshot.status).toBe("success")
    expect(snapshot.ready).toContain(recordedOrder.id)
    const approvalRequest = key()
    const approved = await approveFee(recordedOrder.id, walked.evidenceVersionId, recordedOrder.record_version, approvalRequest)
    expectOk(approved, "success fee")
    expect((await db.query<{ first_observation_id: string; second_observation_id: string }>(
      "select first_observation_id, second_observation_id from public.success_fee_approvals where service_order_id = $1",
      [recordedOrder.id],
    )).rows[0]).toEqual({ first_observation_id: firstCheck, second_observation_id: secondCheck })
    expect((await db.query<{ kind: string; state: string; amount_minor: number }>(
      "select kind, state, amount_minor from public.payment_obligations where id = $1",
      [approved.obligationId],
    )).rows[0]).toEqual({ kind: "SUCCESS_FEE", state: "DUE", amount_minor: recordedOrder.amount_minor })
    expect(recordedOrder.amount_minor).toBe(29900)
    expect(await approvalCount(recordedOrder.id)).toBe(1)
    expect(await chargeCounts(successCase)).toEqual({ obligations: 1, invoices: 0, receipts: 0 })
    expect(await commandReceiptCount(approvalRequest)).toBe(1)
    const sameRequest = await approveFee(recordedOrder.id, walked.evidenceVersionId, recordedOrder.record_version, approvalRequest)
    expect(sameRequest).toMatchObject({ status: "success", id: approved.id, obligationId: approved.obligationId })
    expect(await commandReceiptCount(approvalRequest)).toBe(1)
    const replayed = await approveFee(recordedOrder.id, walked.evidenceVersionId, (await orderRow(successCase)).record_version)
    expect(replayed).toMatchObject({ status: "success", replay: true, id: approved.id, obligationId: approved.obligationId })
    expect(await approvalCount(recordedOrder.id)).toBe(1)
    expect(await chargeCounts(successCase)).toEqual({ obligations: 1, invoices: 0, receipts: 0 })
    expect((await caseCommand(successCase, "close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    expect((await outcomePanel(successCase)).panel.headline).toBe("Approved fee")
    expect((await journeyFor(successCase)).steps.find(step => step.id === "OUTCOME_BILLING")?.state).not.toBe("COMPLETED")

    const opened = await rpc("admin_success_fee_dispute_v1", [token, key(), {
      serviceOrderId: recordedOrder.id,
      action: "open",
      reason: "The customer wrote that the original restriction still appeared after the first check.",
    }])
    expectOk(opened, "pause collection")
    expect(await rpc("payment_prepare_invoice_v1", [token, approved.obligationId])).toMatchObject({ status: "denied", reason: "collection_paused" })
    const decided = await rpc("admin_success_fee_dispute_v1", [token, key(), {
      serviceOrderId: recordedOrder.id,
      action: "resolve",
      outcome: "NOT_UPHELD",
      resolution: "The contracted listing was still clear on both recorded checks.",
    }])
    expectOk(decided, "dispute not upheld")
    const prepared = await rpc("payment_prepare_invoice_v1", [token, approved.obligationId])
    expectOk(prepared, "prepare invoice")
    const hosted = "https://invoice.stripe.test/in_managedwalk1"
    expectOk(await rpc("payment_record_invoice_v1", [prepared.providerOperationId, "in_managedwalk1", hosted, recordedOrder.amount_minor, "gbp"]), "record invoice")
    expect((await db.query<{ status: string }>("select status from public.payment_invoices where obligation_id = $1", [approved.obligationId])).rows[0].status).toBe("ISSUED")
    expect(await rpc("admin_queue_managed_notice_v1", [token, key(), successCase, "invoice", {
      subject: "Invoice",
      bodyText: "This is not the approved wording.",
      bodyHtml: "<p>This is not the approved wording.</p>",
      fromAddress: mailFrom,
      replyTo: mailReply,
      customerOrigin: mailOrigin,
    }])).toMatchObject({ status: "denied", reason: "snapshot" })
    expect((await drainManagedMail(successCase, "invoice")).queued).toEqual(["invoice"])
    expect((await caseCommand(successCase, "close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    const invoiced = await outcomePanel(successCase)
    expect(invoiced.panel.headline).toBe("Invoiced")
    expect(invoiced.panel.notices.join(" ")).toMatch(/not payment/)
    expect((await journeyFor(successCase)).steps.find(step => step.id === "OUTCOME_BILLING")?.state).not.toBe("COMPLETED")

    expect(await rpc("payment_ensure_customer_map_v1", [customer, "cus_managedwalk"])).toMatchObject({ status: "success" })
    const currentOrder = await orderRow(successCase)
    await rolledBack(async () => {
      const opened = await rpc<{ status?: string; hold?: string; providerInvoiceId?: string; invoiceStatus?: string }>("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "open",
        reason: "The customer disputed the issued invoice before paying it.",
      }])
      expectOk(opened, "pause issued invoice")
      expect(opened).toMatchObject({ hold: "void_required", providerInvoiceId: "in_managedwalk1", invoiceStatus: "ISSUED" })
      const preparedWhilePaused = await rpc<{ status?: string; reason?: string; hostedInvoiceUrl?: string }>("payment_prepare_invoice_v1", [token, approved.obligationId])
      expect(preparedWhilePaused).toMatchObject({ status: "denied", reason: "collection_paused" })
      expect(preparedWhilePaused.hostedInvoiceUrl).toBeUndefined()
      expect(await rpc("admin_payment_command_v1", [token, key(), "issue_invoice_fallback", {
        serviceOrderId: currentOrder.id, obligationId: approved.obligationId, expiresAt: ahead(48), secretHash: secret(),
      }, currentOrder.record_version])).toMatchObject({ status: "denied", reason: "collection_paused" })
      expect((await db.query<{ status: string }>("select status from public.payment_invoices where obligation_id = $1", [approved.obligationId])).rows[0].status).toBe("ISSUED")
      expect((await db.query<{ state: string }>("select state from public.success_fee_invoice_holds where provider_invoice_id = 'in_managedwalk1'")).rows[0].state).toBe("VOID_REQUIRED")
    })
    expectOk(await rpc("admin_payment_command_v1", [token, key(), "issue_invoice_fallback", {
      serviceOrderId: currentOrder.id, obligationId: approved.obligationId, expiresAt: ahead(48), secretHash: secret(),
    }, currentOrder.record_version]), "invoice link")
    const portal = await invoicePortal(successCase)
    expect(portal.target).toMatchObject({ status: "redirect", hostedInvoiceUrl: hosted })
    expect(await rpc("customer_portal_invoice_target_v1", [samSession, portal.reference, portal.selector])).toEqual({ status: "not_found" })
    await rolledBack(async () => {
      const opened = await rpc<{ id?: string; invoiceId?: string; hold?: string }>("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "open",
        reason: "The customer disputed the issued invoice before the provider void could be confirmed.",
      }])
      expect(opened.hold).toBe("void_required")
      const provider = createFakePaymentProvider()
      provider.objects.set("in_managedwalk1", {
        id: "in_managedwalk1", status: "open", amountDueMinor: recordedOrder.amount_minor, amountPaidMinor: 0,
        currency: "gbp", hostedInvoiceUrl: hosted,
      })
      provider.nextVoidError = new Error("provider unavailable")
      const unconfirmed = await reconcileDisputedInvoice({
        provider,
        hold: "void_required",
        providerInvoiceId: "in_managedwalk1",
        idempotencyKey: key(),
        record: (state, providerStatus) => recordInvoiceHold(opened.id!, opened.invoiceId!, state, providerStatus),
      })
      expect(unconfirmed).toEqual({ hold: "void_unconfirmed", stripeCollectionStopped: false })
      expect((await db.query<{ status: string }>("select status from public.payment_invoices where obligation_id = $1", [approved.obligationId])).rows[0].status).toBe("ISSUED")
      expect((await invoicePortal(successCase)).target).toEqual({ status: "collection_paused" })
      expect(JSON.stringify((await invoicePortal(successCase)).target)).not.toContain("invoice.stripe")
      expect(await rpc("customer_portal_invoice_target_v1", [samSession, portal.reference, portal.selector])).toEqual({ status: "not_found" })
    })
    await rolledBack(async () => {
      const opened = await rpc<{ id?: string; invoiceId?: string }>("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "open",
        reason: "The customer disputed the issued invoice and the provider reported it paid.",
      }])
      const provider = createFakePaymentProvider()
      provider.objects.set("in_managedwalk1", {
        id: "in_managedwalk1", status: "paid", amountDueMinor: recordedOrder.amount_minor, amountPaidMinor: recordedOrder.amount_minor,
        currency: "gbp", hostedInvoiceUrl: hosted,
      })
      const paid = await reconcileDisputedInvoice({
        provider,
        hold: "void_required",
        providerInvoiceId: "in_managedwalk1",
        idempotencyKey: key(),
        record: (state, providerStatus) => recordInvoiceHold(opened.id!, opened.invoiceId!, state, providerStatus),
      })
      expect(paid).toEqual({ hold: "already_paid", stripeCollectionStopped: false })
      expect((await db.query<{ status: string }>("select status from public.payment_invoices where obligation_id = $1", [approved.obligationId])).rows[0].status).toBe("ISSUED")
      expect((await chargeCounts(successCase)).receipts).toBe(0)
    })
    await rolledBack(async () => {
      const opened = await rpc<{ id?: string; invoiceId?: string }>("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "open",
        reason: "The customer disputed the issued invoice after the provider confirmed a void.",
      }])
      const provider = createFakePaymentProvider()
      provider.objects.set("in_managedwalk1", {
        id: "in_managedwalk1", status: "open", amountDueMinor: recordedOrder.amount_minor, amountPaidMinor: 0,
        currency: "gbp", hostedInvoiceUrl: hosted,
      })
      const confirmed = await reconcileDisputedInvoice({
        provider,
        hold: "void_required",
        providerInvoiceId: "in_managedwalk1",
        idempotencyKey: key(),
        record: (state, providerStatus) => recordInvoiceHold(opened.id!, opened.invoiceId!, state, providerStatus),
      })
      expect(confirmed).toEqual({ hold: "void_confirmed", stripeCollectionStopped: true })
      expect((await db.query<{ status: string }>("select status from public.payment_invoices where provider_invoice_id = 'in_managedwalk1'")).rows[0].status).toBe("VOID")
      expect((await invoicePortal(successCase)).target).toEqual({ status: "collection_paused" })
      expect((await chargeCounts(successCase)).receipts).toBe(0)
      const upheld = await rpc("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "resolve",
        outcome: "UPHELD",
        resolution: "The original restriction was still present, so the fee is not payable.",
      }])
      expectOk(upheld, "upheld after void")
      expect(await rpc("payment_prepare_invoice_v1", [token, approved.obligationId])).toMatchObject({ status: "denied", reason: "collection_paused" })
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_invoices where obligation_id = $1 and status in ('DRAFT','ISSUED')", [approved.obligationId])).rows[0].n).toBe(0)
    })
    await rolledBack(async () => {
      const opened = await rpc<{ id?: string; invoiceId?: string }>("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "open",
        reason: "The customer disputed the issued invoice and the provider then confirmed a void.",
      }])
      expectOk(await recordInvoiceHold(opened.id!, opened.invoiceId!, "VOID_CONFIRMED", "void"), "confirm void")
      expect((await db.query<{ status: string }>(
        "select status from public.payment_attempts where obligation_id = $1 order by attempt_number",
        [approved.obligationId],
      )).rows.map(row => row.status)).toEqual(["CANCELLED"])
      expect((await chargeCounts(successCase)).receipts).toBe(0)
      expectOk(await rpc("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "resolve",
        outcome: "NOT_UPHELD",
        resolution: "The contracted listing was still clear, so the fee can be invoiced again.",
      }]), "reissue after void")
      const reissued = await rpc<{ status?: string; replay?: boolean; invoiceId?: string; hostedInvoiceUrl?: string }>("payment_prepare_invoice_v1", [token, approved.obligationId])
      expectOk(reissued, "reissue invoice")
      expect(reissued.replay).toBe(false)
      expect(reissued.invoiceId).not.toBe(opened.invoiceId)
      expect(reissued.hostedInvoiceUrl).toBeUndefined()
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_invoices where obligation_id = $1 and status in ('DRAFT','ISSUED')", [approved.obligationId])).rows[0].n).toBe(1)
    })
    await rolledBack(async () => {
      expectOk(await rpc("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "open",
        reason: "The customer disputed the issued invoice and the dispute was not upheld.",
      }]), "pause before resume")
      expectOk(await rpc("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "resolve",
        outcome: "NOT_UPHELD",
        resolution: "The contracted listing was still clear, so the issued invoice remains payable.",
      }]), "resume issued invoice")
      const resumed = await rpc<{ status?: string; replay?: boolean; invoiceId?: string; hostedInvoiceUrl?: string }>("payment_prepare_invoice_v1", [token, approved.obligationId])
      expect(resumed).toMatchObject({ status: "success", replay: true, hostedInvoiceUrl: hosted })
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_invoices where obligation_id = $1 and status = 'ISSUED'", [approved.obligationId])).rows[0].n).toBe(1)
      expect((await invoicePortal(successCase)).target).toMatchObject({ status: "redirect", hostedInvoiceUrl: hosted })
    })
    await rolledBack(async () => {
      expectOk(await rpc("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: currentOrder.id,
        action: "open",
        reason: "The customer disputed the invoice while the provider payment was also arriving.",
      }]), "pause during payment")
      expectOk(await rpc("payment_apply_provider_event_v1", ["evt_managed_race", "invoice.paid", "in_managedwalk1", {
        amountPaidMinor: recordedOrder.amount_minor,
        amountMinor: recordedOrder.amount_minor,
        currency: "gbp",
        stripeCustomerId: "cus_managedwalk",
        customerId: customer,
        serviceOrderId: currentOrder.id,
        obligationId: approved.obligationId,
        providerOperationId: prepared.providerOperationId,
        hostedInvoiceUrl: hosted,
      }]), "webhook during dispute")
      expect((await db.query<{ status: string }>("select status from public.payment_invoices where provider_invoice_id = 'in_managedwalk1'")).rows[0].status).toBe("PAID")
      expect((await chargeCounts(successCase)).receipts).toBe(1)
      const hold = (await db.query<{ pause_id: string; invoice_id: string }>("select pause_id, invoice_id from public.success_fee_invoice_holds where provider_invoice_id = 'in_managedwalk1'")).rows[0]
      const provider = createFakePaymentProvider()
      provider.objects.set("in_managedwalk1", {
        id: "in_managedwalk1", status: "open", amountDueMinor: recordedOrder.amount_minor, amountPaidMinor: 0,
        currency: "gbp", hostedInvoiceUrl: hosted,
      })
      const kept = await reconcileDisputedInvoice({
        provider,
        hold: "void_required",
        providerInvoiceId: "in_managedwalk1",
        idempotencyKey: key(),
        record: (state, providerStatus) => recordInvoiceHold(hold.pause_id, hold.invoice_id, state, providerStatus),
      })
      expect(kept).toEqual({ hold: "already_paid", stripeCollectionStopped: false })
      expect((await db.query<{ status: string }>("select status from public.payment_invoices where provider_invoice_id = 'in_managedwalk1'")).rows[0].status).toBe("PAID")
      expect((await db.query<{ status: string }>("select status from public.payment_attempts where obligation_id = $1", [approved.obligationId])).rows[0].status).toBe("SUCCEEDED")
      expect((await chargeCounts(successCase)).receipts).toBe(1)
    })
    const settled = await rpc("payment_apply_provider_event_v1", ["evt_managed_paid", "invoice.paid", "in_managedwalk1", {
      amountPaidMinor: recordedOrder.amount_minor,
      amountMinor: recordedOrder.amount_minor,
      currency: "gbp",
      stripeCustomerId: "cus_managedwalk",
      customerId: customer,
      serviceOrderId: currentOrder.id,
      obligationId: approved.obligationId,
      providerOperationId: prepared.providerOperationId,
      hostedInvoiceUrl: hosted,
    }])
    expectOk(settled, "test-mode invoice settlement")
    expect((await orderRow(successCase)).state).toBe("ACCEPTED_SUCCESS_FEE")
    expect((await db.query<{ state: string }>("select state from public.payment_obligations where id = $1", [approved.obligationId])).rows[0].state).toBe("PAID")
    expect((await db.query<{ status: string }>("select status from public.payment_invoices where obligation_id = $1", [approved.obligationId])).rows[0].status).toBe("PAID")
    expect(await chargeCounts(successCase)).toEqual({ obligations: 1, invoices: 1, receipts: 1 })
    expect(await rpc("payment_apply_provider_event_v1", ["evt_managed_paid_dup", "invoice.paid", "in_managedwalk1", {
      amountPaidMinor: recordedOrder.amount_minor, currency: "gbp", providerOperationId: prepared.providerOperationId,
    }])).toMatchObject({ status: "success", duplicate: true })
    expect((await chargeCounts(successCase)).receipts).toBe(1)
    const ledger = await db.query<{ event: string }>(
      "select event from public.payment_ledger where obligation_id = $1 order by id",
      [approved.obligationId],
    )
    const ledgerEvents = ledger.rows.map(row => row.event)
    expect(ledgerEvents).toEqual(expect.arrayContaining(["OBLIGATION_CREATED", "INVOICE_ISSUED", "PROVIDER_PAYMENT_SUCCEEDED", "RECEIPT_RECORDED"]))
    expect(ledgerEvents.filter(event => event === "RECEIPT_RECORDED")).toHaveLength(1)
    expect(ledgerEvents.filter(event => event === "PROVIDER_PAYMENT_SUCCEEDED")).toHaveLength(1)

    const settledPanel = await outcomePanel(successCase)
    expect(settledPanel.panel.headline).toBe("Settled")
    expect(settledPanel.panel.requirements.find(item => item.label === "Billing position")?.state).toBe("Met")
    const beforeClose = await journeyFor(successCase)
    const unfinished = beforeClose.steps.filter(step => step.id !== "CLOSURE" && step.state !== "COMPLETED").map(step => step.id)
    expect(unfinished, JSON.stringify(stepStates(beforeClose))).toEqual([])
    expect(beforeClose.steps.find(step => step.id === "CLOSURE")?.state).not.toBe("COMPLETED")
    expect(beforeClose.steps.map(step => step.id)).toEqual([...journeyStepIds])

    expectOk(await caseCommand(successCase, "close", { outcome: "RESTORED", summary }), "close")
    expect((await drainManagedMail(successCase, "completion")).queued).toEqual(["complete_paid"])
    expect((await drainManagedMail(successCase, "submission")).queued).toEqual([])
    const mailed = await db.query<{ template_key: string; lifecycle: string; delivery_status: string; recipient: string; body_text: string }>(
      "select template_key, lifecycle, delivery_status, recipient, body_text from public.communications where case_id = $1 and template_key like 'MANAGED_%' order by created_at",
      [successCase],
    )
    expect(mailed.rows.map(row => row.template_key)).toEqual([
      "MANAGED_PROGRESS", "MANAGED_PROGRESS", "MANAGED_RESULT", "MANAGED_RESULT", "MANAGED_INVOICE", "MANAGED_COMPLETION",
    ])
    for (const row of mailed.rows) {
      expect(row.lifecycle).toBe("QUEUED")
      expect(row.delivery_status).toBe("NONE")
      expect(row.recipient).toBe("alex@example.com")
      expect(row.body_text).not.toMatch(/invoice\.stripe|pi_|cus_|SUCCESS_FEE|[0-9a-f]{8}-[0-9a-f]{4}-/)
    }
    expect(mailed.rows[0].body_text).toContain("does not mean Google has made a decision")
    expect(mailed.rows.at(-1)?.body_text).toContain("Relaunch Guard is optional")
    const closed = (await db.query<{ status: string; work_stage: string; outcome: string; closure_summary: string }>(
      "select status, work_stage, outcome, closure_summary from public.cases where id = $1",
      [successCase],
    )).rows[0]
    expect(closed).toMatchObject({ status: "CLOSED", work_stage: "FINISHED", outcome: "RESTORED", closure_summary: summary })
    const afterClose = await journeyFor(successCase)
    expect(afterClose.steps.map(step => step.state)).toEqual(journeyStepIds.map(() => "COMPLETED"))
    const history = await db.query<{ event: string; actor_id: string }>(
      "select event, actor_id from public.case_work_events where case_id = $1",
      [successCase],
    )
    for (const event of ["INTAKE_REVIEW", "BUSINESS_VERIFICATION", "record_outcome", "close"]) {
      expect(history.rows.filter(row => row.event === event && row.actor_id === admin)).toHaveLength(1)
    }
    const audits = await db.query<{ actor_id: string; action: string }>(
      "select actor_id, action from public.admin_audit_events where target_id = $1",
      [successCase],
    )
    expect(audits.rows).toEqual(expect.arrayContaining([{ actor_id: admin, action: "CASE_CHANGED" }]))
    const paymentAudit = await db.query<{ actor_id: string; action: string }>(
      "select actor_id, action from public.admin_audit_events where target_id = $1 and action = 'PAYMENT_CHANGED'",
      [walked.orderId],
    )
    expect(paymentAudit.rows).toEqual([{ actor_id: admin, action: "PAYMENT_CHANGED" }])
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.service_orders where payment_model = 'RECURRING_MONTHLY'")).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where job_type = 'SEND_EMAIL' and status = 'SUCCEEDED'")).rows[0].n).toBe(0)

    const reference = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [successCase])).rows[0].public_ref
    const owned = await rpc<{ found: boolean; case: { status: string; outcomeCode: string; serviceTrack: string }; timeline: Array<{ code: string }> }>(
      "customer_portal_case_v1",
      [alexSession, reference],
    )
    expect(owned.found).toBe(true)
    expect(owned.case).toMatchObject({ status: "CLOSED", outcomeCode: "RESTORED", serviceTrack: "MANAGED" })
    expect(owned.timeline.map(item => item.code)).toEqual(expect.arrayContaining(["QUOTE_ACCEPTED", "PAYMENT_RECEIVED", "SUBMITTED_TO_GOOGLE", "CASE_COMPLETED"]))
    expect(JSON.stringify(owned)).not.toContain(staffNote)
    const detail = await rpc<CaseDetail>("admin_case_detail_v1", [token, successCase, null])
    expect(detail.customerPreview.summary).toBe(summary)
    expect(detail.customerPreview.notes).not.toContain(staffNote)
    expect(await rpc("customer_portal_case_v1", [samSession, reference])).toEqual({ found: false })
  }, 120000)

  it("closes an unsuccessful Managed case without a success fee and does not show that outcome to the customer", async () => {
    const summary = "The listing stayed down and no success fee was collected."
    const walked = await walkToReadyForOutcome({
      caseId: unsuccessfulCase, locationId: unsuccessfulLocation, marker: "managedno", closeOutcome: "NOT_RESTORED",
    })
    const before = await orderRow(unsuccessfulCase)
    const missingRequest = key()
    expect((await approveFee(before.id, walked.evidenceVersionId, before.record_version, missingRequest)).status).toBe("denied")
    expect((await approveFee(before.id, walked.evidenceVersionId, before.record_version, missingRequest)).status).toBe("denied")
    expect(await commandReceiptCount(missingRequest)).toBe(0)
    expect(await approvalCount(before.id)).toBe(0)
    expect(await chargeCounts(unsuccessfulCase)).toEqual({ obligations: 0, invoices: 0, receipts: 0 })

    expectOk(await caseCommand(unsuccessfulCase, "record_outcome", { outcome: "NOT_RESTORED", summary }), "record outcome")
    expect((await db.query<{ status: string; work_stage: string; outcome: string }>(
      "select status, work_stage, outcome from public.cases where id = $1",
      [unsuccessfulCase],
    )).rows[0]).toMatchObject({ status: "UNDER_REVIEW", work_stage: "OUTCOME_REVIEW", outcome: "NOT_RESTORED" })
    const after = await orderRow(unsuccessfulCase)
    await insertObservation(after.id, { observedAt: "2026-01-01T00:00:00.000Z" })
    await insertObservation(after.id, { observedAt: "2026-01-03T00:00:00.000Z" })
    expect(await verificationReady(unsuccessfulCase, after.id)).toBe(true)
    const refusedRequest = key()
    expect((await approveFee(after.id, walked.evidenceVersionId, after.record_version, refusedRequest)).status).toBe("denied")
    expect((await approveFee(after.id, walked.evidenceVersionId, after.record_version, refusedRequest)).status).toBe("denied")
    expect(await commandReceiptCount(refusedRequest)).toBe(0)
    expect(await approvalCount(after.id)).toBe(0)
    expect(await chargeCounts(unsuccessfulCase)).toEqual({ obligations: 0, invoices: 0, receipts: 0 })
    const panel = await outcomePanel(unsuccessfulCase)
    expect(panel.panel.headline).toBe("Not billable")
    expect(panel.panel.requirements.find(item => item.label === "Billing position")?.state).toBe("Met")
    const beforeClose = await journeyFor(unsuccessfulCase)
    expect(beforeClose.steps.map(step => step.id)).toEqual([...journeyStepIds])
    expect(beforeClose.steps.filter(step => step.id !== "CLOSURE" && step.state !== "COMPLETED").map(step => `${step.id}:${step.state}`)).toEqual([])
    expect(beforeClose.steps.find(step => step.id === "CLOSURE")?.state).not.toBe("COMPLETED")

    expectOk(await caseCommand(unsuccessfulCase, "close", { outcome: "NOT_RESTORED", summary }), "close")
    expect((await drainManagedMail(unsuccessfulCase, "completion")).queued).toEqual(["complete_no_fee"])
    expect((await drainManagedMail(unsuccessfulCase, "invoice")).queued).toEqual([])
    expect((await db.query<{ n: number }>(
      "select count(*)::int as n from public.communications where case_id = $1 and template_key = 'MANAGED_INVOICE'",
      [unsuccessfulCase],
    )).rows[0].n).toBe(0)
    expect(await approvalCount(after.id)).toBe(0)
    expect(await chargeCounts(unsuccessfulCase)).toEqual({ obligations: 0, invoices: 0, receipts: 0 })
    const closed = (await db.query<{ status: string; work_stage: string; outcome: string; closure_summary: string }>(
      "select status, work_stage, outcome, closure_summary from public.cases where id = $1",
      [unsuccessfulCase],
    )).rows[0]
    expect(closed).toMatchObject({ status: "CLOSED", work_stage: "FINISHED", outcome: "NOT_RESTORED", closure_summary: summary })
    const afterClose = await journeyFor(unsuccessfulCase)
    expect(stepStates(afterClose)).toEqual(journeyStepIds.map(id => ({ id, state: "COMPLETED" })))
    const history = await db.query<{ event: string; actor_id: string }>(
      "select event, actor_id from public.case_work_events where case_id = $1",
      [unsuccessfulCase],
    )
    for (const event of ["INTAKE_REVIEW", "BUSINESS_VERIFICATION", "record_outcome", "close"]) {
      expect(history.rows.filter(row => row.event === event && row.actor_id === admin)).toHaveLength(1)
    }

    const reference = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [unsuccessfulCase])).rows[0].public_ref
    const owned = await rpc<{ found: boolean; case: { status: string; outcomeCode: string | null; serviceTrack: string }; timeline: Array<{ code: string }> }>(
      "customer_portal_case_v1",
      [alexSession, reference],
    )
    expect(owned.case).toMatchObject({ status: "CLOSED", serviceTrack: "MANAGED", outcomeCode: "NOT_RESTORED" })
    expect(owned.timeline.map(item => item.code)).toContain("CASE_COMPLETED")
    expect(owned.timeline.map(item => item.code)).not.toContain("PAYMENT_RECEIVED")
    expect(JSON.stringify(owned)).not.toContain(summary)
    expect(JSON.stringify(owned)).not.toContain(staffNote)
    const detail = await rpc<CaseDetail>("admin_case_detail_v1", [token, unsuccessfulCase, null])
    expect(detail.customerPreview.summary).toBe(summary)
    expect(detail.customerPreview.notes).not.toContain(staffNote)
    expect(await rpc("customer_portal_case_v1", [samSession, reference])).toEqual({ found: false })
    const successReference = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [successCase])).rows[0].public_ref
    expect(await rpc("customer_portal_case_v1", [samSession, successReference])).toEqual({ found: false })

    const writers = await db.query<{ name: string }>(`
      select n.nspname || '.' || p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'admin_private')
        and p.prosrc ~* 'update[[:space:]]+(public\\.)?payment_obligations[[:space:]]+set[[:space:]]+state[[:space:]]*=[[:space:]]*''void'''
    `)
    expect(writers.rows, "a composed voided-fee close needs a command that writes VOID").toEqual([])
  }, 120000)

  it("approves a Managed Review fee only after two visible observations and withholds it when the review reappears", async () => {
    const summary = "The review was removed and the success fee was approved in test mode."
    const walked = await walkToReadyForOutcome({
      caseId: reviewCase, locationId: reviewLocation, marker: "managedreview", closeOutcome: "REMOVED", serviceCode: "MANAGED_REVIEW",
    })
    expectOk(await caseCommand(reviewCase, "record_outcome", { outcome: "REMOVED", summary }), "record outcome")
    const order = await orderRow(reviewCase)
    expect(order.amount_minor).toBe(14900)
    const earlyRequest = key()
    expect(await approveFee(order.id, walked.evidenceVersionId, order.record_version, earlyRequest)).toMatchObject({
      status: "denied", reason: "success_verification",
    })
    expect(await commandReceiptCount(earlyRequest)).toBe(0)
    const acceptedReview = (await db.query<{ accepted_target_ref: string }>(`
      select qa.accepted_target_ref
      from public.service_orders so
      join public.quote_acceptances qa on qa.id = so.quote_acceptance_id
      where so.id = $1
    `, [order.id])).rows[0].accepted_target_ref
    expect(acceptedReview).toBe("https://maps.google.com/maps/reviews/managed-review-1")
    await rolledBack(async () => {
      await db.query("update public.cases set review_url = 'https://maps.google.com/maps/reviews/wrong-review-id' where id = $1", [reviewCase])
      await expect(ensureBaseline(order.id)).rejects.toThrow(/target_changed/)
    })
    await rolledBack(async () => {
      await expect(insertObservation(order.id, { visibility: "VISIBLE", observedAt: "2026-01-01T00:00:00.000Z" })).rejects.toThrow(/visibility/)
    })
    await rolledBack(async () => {
      await insertObservation(order.id, { finding: "UNRELATED", observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(order.id, { finding: "UNRELATED", observedAt: "2026-01-03T00:00:00.000Z" })
      expect(await verificationReady(reviewCase, order.id)).toBe(false)
    })
    await rolledBack(async () => {
      await insertObservation(order.id, { observedAt: "2026-01-01T00:00:00.000Z" })
      await insertObservation(order.id, { observedAt: "2026-01-03T00:00:00.000Z" })
      await insertObservation(order.id, { finding: "RECURRENCE", observedAt: "2026-01-02T12:00:00.000Z" })
      expect(await verificationReady(reviewCase, order.id)).toBe(false)
    })
    await insertObservation(order.id, { observedAt: "2026-01-01T00:00:00.000Z" })
    await insertObservation(order.id, { observedAt: "2026-01-03T00:00:00.000Z" })
    expect(await verificationReady(reviewCase, order.id)).toBe(true)
    const frozenReview = (await db.query<{ target_ref: string }>("select target_ref from public.success_baselines where service_order_id = $1", [order.id])).rows[0].target_ref
    expect(frozenReview).toBe("https://maps.google.com/maps/reviews/managed-review-1")
    const approved = await approveFee(order.id, walked.evidenceVersionId, order.record_version)
    expectOk(approved, "review success fee")
    expect((await db.query<{ kind: string; state: string; amount_minor: number }>(
      "select kind, state, amount_minor from public.payment_obligations where id = $1",
      [approved.obligationId],
    )).rows[0]).toEqual({ kind: "SUCCESS_FEE", state: "DUE", amount_minor: 14900 })
    await insertObservation(order.id, { finding: "RECURRENCE", observedAt: "2026-10-01T00:00:00.000Z" })
    expect(await verificationReady(reviewCase, order.id)).toBe(true)
    expect(await chargeCounts(reviewCase)).toEqual({ obligations: 1, invoices: 0, receipts: 0 })
    await rolledBack(async () => {
      expectOk(await rpc("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: order.id,
        action: "open",
        reason: "The customer wrote that a different review was the one removed.",
      }]), "open review dispute")
      expectOk(await rpc("admin_success_fee_dispute_v1", [token, key(), {
        serviceOrderId: order.id,
        action: "resolve",
        outcome: "UPHELD",
        resolution: "The removed text was not the contracted review.",
      }]), "uphold review dispute")
      expect(await rpc("payment_prepare_invoice_v1", [token, approved.obligationId])).toMatchObject({ status: "denied", reason: "collection_paused" })
    })
    const prepared = await rpc("payment_prepare_invoice_v1", [token, approved.obligationId])
    expectOk(prepared, "review invoice")
    const again = await rpc("payment_prepare_invoice_v1", [token, approved.obligationId])
    expect(again).toMatchObject({ status: "success", invoiceId: prepared.invoiceId })
    expect(await chargeCounts(reviewCase)).toEqual({ obligations: 1, invoices: 1, receipts: 0 })
    expect((await caseCommand(reviewCase, "close", { outcome: "REMOVED", summary })).status).toBe("prerequisite")
    expect(await approvalCount(order.id)).toBe(1)
    const hostedReview = "https://invoice.stripe.test/in_managedreview1"
    expectOk(await rpc("payment_record_invoice_v1", [prepared.providerOperationId, "in_managedreview1", hostedReview, 14900, "gbp"]), "record review invoice")
    expect((await drainManagedMail(reviewCase, "invoice")).queued).toEqual(["invoice"])
    const reviewOrder = await orderRow(reviewCase)
    expectOk(await rpc("admin_payment_command_v1", [token, key(), "issue_invoice_fallback", {
      serviceOrderId: reviewOrder.id, obligationId: approved.obligationId, expiresAt: ahead(48), secretHash: secret(),
    }, reviewOrder.record_version]), "review invoice link")
    expectOk(await rpc("payment_apply_provider_event_v1", ["evt_managed_review_paid", "invoice.paid", "in_managedreview1", {
      amountPaidMinor: 14900,
      amountMinor: 14900,
      currency: "gbp",
      stripeCustomerId: "cus_managedwalk",
      customerId: customer,
      serviceOrderId: reviewOrder.id,
      obligationId: approved.obligationId,
      providerOperationId: prepared.providerOperationId,
      hostedInvoiceUrl: hostedReview,
    }]), "review settlement")
    expect(await chargeCounts(reviewCase)).toEqual({ obligations: 1, invoices: 1, receipts: 1 })
    expectOk(await caseCommand(reviewCase, "close", { outcome: "REMOVED", summary }), "review close")
    expect((await drainManagedMail(reviewCase, "completion")).queued).toEqual(["complete_paid"])
    const reviewMail = await db.query<{ body_text: string }>(
      "select body_text from public.communications where case_id = $1 and template_key = 'MANAGED_COMPLETION'",
      [reviewCase],
    )
    expect(reviewMail.rows).toHaveLength(1)
    expect(reviewMail.rows[0].body_text).toContain("exact review")
    expect(reviewMail.rows[0].body_text).toContain("£149.00 GBP")
    expect(reviewMail.rows[0].body_text).not.toContain("profile restriction")
  }, 120000)

  it("refuses a first Managed submission from FURTHER_REVIEW when none has been recorded", async () => {
    const caseId = "d1000000-0000-4000-8000-0000000000d1"
    const locationId = "d2000000-0000-4000-8000-0000000000d2"
    await db.exec(`
      insert into public.locations(id, business_id, country) values ('${locationId}', '${business}', 'United Kingdom');
      insert into public.cases(
        id, case_type, customer_id, business_id, location_id, issue_description, intake_snapshot, created_at,
        information_accurate_at, privacy_accepted_at
      ) values (
        '${caseId}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${locationId}', 'The profile disappeared.',
        '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"The profile disappeared."}'::jsonb,
        '2026-01-01', now(), now()
      );
    `)
    expectOk(await caseCommand(caseId, "plan", {
      track: "MANAGED", priority: "NORMAL", assigned: true, nextAction: "Record the withdrawal before preparation.", due: null, firstResponseDue: null,
    }), "plan")
    expectOk(await caseCommand(caseId, "close", {
      outcome: "WITHDRAWN", summary: "The customer withdrew before any submission was recorded.",
    }), "withdraw")
    expect((await drainManagedMail(caseId, "completion")).queued).toEqual(["withdrawn"])
    expect((await db.query<{ n: number }>(
      "select count(*)::int as n from public.communications where case_id = $1 and template_key = 'MANAGED_COMPLETION'",
      [caseId],
    )).rows[0].n).toBe(1)
    expect(await stageOf(caseId)).toBe("FINISHED")
    expectOk(await caseCommand(caseId, "reopen", {
      title: "Review the withdrawn case again",
      owner: "ADMIN",
      kind: "FOLLOW_UP",
      due: ahead(48),
      source: "Customer asked to continue this case.",
      timezone: "UTC",
    }), "reopen")
    expect(await stageOf(caseId)).toBe("FURTHER_REVIEW")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.case_submissions where case_id = $1", [caseId])).rows[0].n).toBe(0)
    const filed = await caseCommand(caseId, "submission", submissionData("GOOGLE-withdrawn"))
    expect(filed.status, JSON.stringify(filed)).toBe("denied")
    expect(await stageOf(caseId)).toBe("FURTHER_REVIEW")
    expect((await caseCommand(caseId, "transition", { target: "PREPARATION", nextAction: "", due: null })).status).toBe("prerequisite")
    expect(await stageOf(caseId)).toBe("FURTHER_REVIEW")
    expect((await rpc("admin_case_authorization_readiness_v1", [token, caseId])).authorizationReady).toBe(false)
    expect(await stepState(caseId, "SERVICE_ACTIVATION")).not.toBe("COMPLETED")
  }, 120000)
})
