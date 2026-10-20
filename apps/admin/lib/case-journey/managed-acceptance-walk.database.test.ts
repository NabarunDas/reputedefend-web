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

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const otherAuth = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const otherCustomer = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const business = "33333333-3333-4333-8333-333333333333"
const successLocation = "b2000000-0000-4000-8000-0000000000b2"
const unsuccessfulLocation = "c2000000-0000-4000-8000-0000000000c2"
const successCase = "b1000000-0000-4000-8000-0000000000b1"
const unsuccessfulCase = "c1000000-0000-4000-8000-0000000000c1"
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

async function rpc<T = Json>(name: string, args: unknown[]): Promise<T> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",")
  const value = (await db.query<{ value: T }>(`select public.${name}(${placeholders}) as value`, args)).rows[0].value
  if (value === undefined || value === null) throw new Error(`${name} returned null`)
  return value
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

async function walkToReadyForOutcome(input: { caseId: string; locationId: string; marker: string; closeOutcome: string }) {
  const { caseId, locationId, marker, closeOutcome } = input
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
    "select id from public.price_versions where service_code = 'MANAGED_RELAUNCH' and seed_key is not null",
  )).rows[0].id
  const quote = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
    customerId: customer, businessId: business, caseId, locationId,
    scope: "Prepare the agreed recovery pack for this location only.",
    exclusions: "Google decisions and later success-fee collection are excluded.",
    validUntil: ahead(24 * 30),
    applyDiscount: false, priceVersionId: price, serviceCode: "MANAGED_RELAUNCH",
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
    insert into public.locations(id, business_id, country) values
      ('${successLocation}', '${business}', 'United Kingdom'),
      ('${unsuccessfulLocation}', '${business}', 'United Kingdom');
    insert into public.cases(
      id, case_type, customer_id, business_id, location_id, issue_description, intake_snapshot, created_at,
      information_accurate_at, privacy_accepted_at
    ) values
      (
        '${successCase}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${successLocation}', 'The profile disappeared.',
        '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"The profile disappeared."}'::jsonb,
        '2026-01-01', now(), now()
      ),
      (
        '${unsuccessfulCase}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${unsuccessfulLocation}', 'The profile disappeared.',
        '{"fullName":"Alex","email":"alex@example.com","businessName":"Bakery","country":"United Kingdom","details":"The profile disappeared."}'::jsonb,
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
    const approvalRequest = key()
    const approved = await approveFee(recordedOrder.id, walked.evidenceVersionId, recordedOrder.record_version, approvalRequest)
    expectOk(approved, "success fee")
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

    const prepared = await rpc("payment_prepare_invoice_v1", [token, approved.obligationId])
    expectOk(prepared, "prepare invoice")
    const hosted = "https://invoice.stripe.test/in_managedwalk1"
    expectOk(await rpc("payment_record_invoice_v1", [prepared.providerOperationId, "in_managedwalk1", hosted, recordedOrder.amount_minor, "gbp"]), "record invoice")
    expect((await db.query<{ status: string }>("select status from public.payment_invoices where obligation_id = $1", [approved.obligationId])).rows[0].status).toBe("ISSUED")
    expect((await caseCommand(successCase, "close", { outcome: "RESTORED", summary })).status).toBe("prerequisite")
    const invoiced = await outcomePanel(successCase)
    expect(invoiced.panel.headline).toBe("Invoiced")
    expect(invoiced.panel.notices.join(" ")).toMatch(/not payment/)
    expect((await journeyFor(successCase)).steps.find(step => step.id === "OUTCOME_BILLING")?.state).not.toBe("COMPLETED")

    expect(await rpc("payment_ensure_customer_map_v1", [customer, "cus_managedwalk"])).toMatchObject({ status: "success" })
    const currentOrder = await orderRow(successCase)
    expectOk(await rpc("admin_payment_command_v1", [token, key(), "issue_invoice_fallback", {
      serviceOrderId: currentOrder.id, obligationId: approved.obligationId, expiresAt: ahead(48), secretHash: secret(),
    }, currentOrder.record_version]), "invoice link")
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
    expect(beforeClose.steps.filter(step => step.id !== "CLOSURE").every(step => step.state === "COMPLETED")).toBe(true)
    expect(beforeClose.steps.find(step => step.id === "CLOSURE")?.state).not.toBe("COMPLETED")

    expectOk(await caseCommand(unsuccessfulCase, "close", { outcome: "NOT_RESTORED", summary }), "close")
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
