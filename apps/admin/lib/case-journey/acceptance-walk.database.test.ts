/**
 * Disposable eleven-step walk for a Guided profile recovery.
 *
 * Every write goes through an existing command on the full migration chain
 * in PGlite. Settlement is the test-mode provider event (`livemode: false`).
 * The email worker is not run, nothing is submitted to Google, and this file
 * never connects to a live database.
 */

import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { narrowCaseFlowFacts, requiredCase } from "../case-flow/projection"
import type { CaseFlowCapabilityFact } from "../case-flow/model"
import type { CaseDetail } from "../cases/model"
import { paidQuoteCommand } from "../commercial/paid-quote-acceptance"
import { SYNTHETIC_APPROVAL_EVIDENCE, SYNTHETIC_APPROVAL_REQUEST } from "../commercial/paid-service-approval.fixture"
import { syntheticPurchasingEstablishmentSql } from "../commercial/purchasing-establishment.fixture"
import type { MoneyOrder } from "../payments/model"
import { applyChain, preparePlatform } from "../recovery/harness"
import { judgeAssessment, parseCaseAssessment } from "./assessment"
import { presentJourneyClosure } from "./closure"
import { journeyStepIds } from "./catalogue"
import { presentJourneyOutcome } from "./outcome"
import { presentCaseJourney } from "./present"
import type { JourneyWorkEvent } from "./decisions"

const db = new PGlite()
const admin = "11111111-1111-4111-8111-111111111111"
const customer = "22222222-2222-4222-8222-222222222222"
const customerAuth = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const otherAuth = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const otherCustomer = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const business = "33333333-3333-4333-8333-333333333333"
const location = "44444444-4444-4444-8444-444444444444"
const caseId = "55555555-5555-4555-8555-555555555555"
const token = "a".repeat(64)
const note = "Reviewed the caller’s request and confirmed the details."
const staffNote = "Staff intake note stays off the customer record."
const summary = "The listing was restored and the customer can see it."
const packNote = "This exact evidence selection is the prepared pack for internal use."
const publishNote = "Publish this pack for the customer case-access view."
const capabilities: CaseFlowCapabilityFact = { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false }
const now = "2026-10-20T12:00:00.000Z"

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
  amountMinor?: number
}

const key = () => crypto.randomUUID()
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const secret = () => hash(randomBytes(32).toString("hex"))

async function rpc<T = Json>(name: string, args: unknown[]): Promise<T> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",")
  const value = (await db.query<{ value: T }>(`select public.${name}(${placeholders}) as value`, args)).rows[0].value
  if (value === undefined || value === null) throw new Error(`${name} returned null`)
  return value
}

function expectOk(value: { status?: string }, label: string) {
  expect(value.status, `${label}: ${JSON.stringify(value)}`).toBe("success")
}

async function version() {
  return (await db.query<{ workflow_version: number }>("select workflow_version from public.cases where id = $1", [caseId])).rows[0].workflow_version
}

async function caseCommand(operation: string, data: Record<string, unknown>, request = key()) {
  const result = await rpc("admin_case_command_v1", [token, request, caseId, await version(), operation, { note, ...data }])
  return result
}

async function move(target: string, due: string | null = null) {
  const result = await caseCommand("transition", { target, nextAction: due ? "Follow up with the customer" : "", due })
  expectOk(result, `transition ${target}`)
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
    insert into public.locations(id, business_id, country) values ('${location}', '${business}', 'United Kingdom');
    insert into public.cases(
      id, case_type, customer_id, business_id, location_id, issue_description, intake_snapshot, created_at,
      information_accurate_at, privacy_accepted_at
    ) values (
      '${caseId}', 'PROFILE_RECOVERY', '${customer}', '${business}', '${location}', 'The profile disappeared.',
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
}, 240000)

afterAll(async () => {
  await db.close()
})

describe("eleven-step Guided acceptance walk", () => {
  it("closes a restored profile only after the recorded test-mode settlement", async () => {
    const intake = await rpc("admin_case_journey_decision_v1", [token, key(), caseId, await version(), "intake", {
      outcome: "REVIEWED", nextAction: "", note: staffNote,
    }])
    expectOk(intake, "intake")
    const screening = await rpc("admin_case_journey_decision_v1", [token, key(), caseId, await version(), "verification", {
      outcome: "PRELIMINARY_COMPLETE",
      source: "The enquiry and the location record",
      listing: "SUSPENDED_OR_MISSING",
      website: "NONE",
      discrepancy: false,
      reason: "The name and country on the enquiry match the records we hold.",
      note,
    }])
    expectOk(screening, "verification")

    const request = await rpc("admin_evidence_request_v1", [
      token, key(), caseId, null, null, "create", "Ownership letter", "Upload the ownership letter for this bakery.", null, null,
    ])
    expectOk(request, "evidence request")
    const begun = await rpc("admin_evidence_begin_v1", [
      token, key(), caseId, null, "letter.pdf", "application/pdf", 1024, "Ownership letter", "test-evidence", request.id,
    ])
    expect(begun.versionId, JSON.stringify(begun)).toBeTruthy()
    expectOk(await rpc("admin_evidence_finalize_v1", [token, key(), caseId, begun.versionId]), "finalize")
    expectOk(await rpc("admin_evidence_refresh_scan_v1", [token, key(), caseId, begun.versionId, "NO_THREATS_FOUND", "VALID", null]), "scan")
    const meta = await rpc("admin_evidence_version_v1", [token, caseId, begun.versionId])
    const acceptedEvidence = await rpc("admin_evidence_review_v1", [
      token, key(), caseId, begun.versionId, meta.recordVersion, "accept", "Accepted after a clean scan.", null,
    ])
    expectOk(acceptedEvidence, "accept evidence")
    const visible = await rpc("admin_evidence_version_v1", [token, caseId, begun.versionId])
    expectOk(await rpc("admin_evidence_review_v1", [
      token, key(), caseId, begun.versionId, visible.recordVersion, "set_visibility", "Customer may see this accepted file.", true,
    ]), "customer visibility")

    const actionId = key()
    const drafted = await rpc("admin_communication_command_v1", [token, key(), "draft", {
      templateKey: "EVIDENCE_REQUEST",
      caseId,
      evidenceRequestId: request.id,
      customerOrigin: "https://customer.profilerelaunch.com",
      actionId,
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
    expect(await rpc("communication_mark_provider_accepted_v1", [reviewed.id, "resend", "msg_walk", `send-email:${reviewed.id}:v1`])).toMatchObject({ status: "success" })
    expect(await rpc("communication_apply_provider_event_v1", ["resend", "evt_walk_delivered", "email.delivered", "msg_walk", "2026-02-02T12:00:00.000Z"])).toMatchObject({ status: "success", applied: true })
    expect((await db.query<{ delivery_status: string }>("select delivery_status from public.communications where id = $1", [reviewed.id])).rows[0].delivery_status).toBe("DELIVERED")
    expect((await db.query<{ n: number }>("select count(*)::int as n from admin_private.jobs where job_type = 'SEND_EMAIL' and status = 'SUCCEEDED'")).rows[0].n).toBe(0)

    expectOk(await rpc("admin_evidence_request_v1", [
      token, key(), caseId, request.id, request.version, "fulfill", null, null, null, "Completed after the customer sent the letter.",
    ]), "fulfill")

    const draft = {
      recordVersion: 0,
      findings: "The profile was suspended and the ownership letter matches the bakery account.",
      evidenceConsidered: "One accepted ownership letter on a fulfilled request.",
      profileIssue: "The Google listing is suspended.",
      policyConcerns: "Ownership of the profile is the policy concern in view.",
      recommendedAction: "Recommend Guided recovery and leave the quote for a later step.",
      servicePathway: "GUIDED",
      rationale: "The accepted evidence is enough to recommend Guided rather than Managed.",
      risks: "Google may still refuse the recovery request.",
      outstandingInformation: "",
    }
    const saved = await rpc("admin_case_assessment_command_v1", [token, key(), caseId, await version(), "save_draft", draft])
    expectOk(saved, "assessment draft")
    const submitted = await rpc("admin_case_assessment_command_v1", [
      token, key(), caseId, await version(), "submit_review", { recordVersion: saved.recordVersion },
    ])
    expectOk(submitted, "assessment review")
    expectOk(await rpc("admin_case_assessment_command_v1", [
      token, key(), caseId, await version(), "approve", { recordVersion: submitted.recordVersion },
    ]), "assessment approval")

    expectOk(await caseCommand("plan", {
      track: "GUIDED", priority: "NORMAL", assigned: true, nextAction: "Offer the Guided quote", due: null, firstResponseDue: null,
    }), "plan")
    await move("ASSESSMENT_READY")
    await move("SERVICE_SELECTION")

    const price = (await db.query<{ id: string }>(
      "select id from public.price_versions where service_code = 'GUIDED_RELAUNCH' and seed_key is not null",
    )).rows[0].id
    const quote = await rpc("admin_quote_command_v1", [token, key(), "create_draft", {
      customerId: customer, businessId: business, caseId, locationId: location,
      scope: "Prepare the agreed recovery pack for this location only.",
      exclusions: "Google decisions, Manager access, and later payment collection are excluded.",
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      applyDiscount: false, priceVersionId: price, serviceCode: "GUIDED_RELAUNCH",
    }, null])
    expectOk(quote, "quote draft")
    expectOk(await rpc("admin_quote_command_v1", [token, key(), "set_draft_tax", {
      quoteId: quote.id, taxBehaviour: "NOT_APPLICABLE",
    }, quote.version]), "quote tax")
    expectOk(await rpc("admin_quote_command_v1", [token, key(), "offer", { quoteId: quote.id }, Number(quote.version) + 1]), "quote offer")
    const raw = randomBytes(32).toString("hex")
    const acceptance = await rpc("admin_quote_command_v1", [token, key(), "create_quote_acceptance_action", {
      quoteId: quote.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), secretHash: hash(raw),
    }, null])
    expectOk(acceptance, "acceptance link")
    const pending = secret()
    const session = secret()
    expect(await rpc("customer_action_exchange_v1", [acceptance.id, hash(raw), pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_begin_otp_v1", [pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_confirm_otp_sent_v1", [pending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_finish_otp_v1", [pending, session, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
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
    expect(accepted).toMatchObject({ orderState: "ACCEPTED_AWAITING_PAYMENT" })

    const unpaid = await caseCommand("close", { outcome: "RESTORED", summary })
    expect(unpaid.status, JSON.stringify(unpaid)).toBe("denied")
    expect((await db.query<{ status: string }>("select status from public.cases where id = $1", [caseId])).rows[0].status).not.toBe("CLOSED")

    const order = (await db.query<{ id: string; public_ref: string; amount_minor: number; record_version: number }>(
      "select id, public_ref, amount_minor, record_version from public.service_orders where case_id = $1",
      [caseId],
    )).rows[0]
    const obligationId = (await db.query<{ id: string }>(
      "select id from public.payment_obligations where service_order_id = $1 and kind = 'UPFRONT'",
      [order.id],
    )).rows[0].id
    const paymentSecret = secret()
    const issued = await rpc("admin_payment_command_v1", [token, key(), "issue_guided_payment_action", {
      serviceOrderId: order.id, expiresAt: "2026-10-22T12:00:00.000Z", secretHash: paymentSecret,
    }, order.record_version])
    expectOk(issued, "payment link")
    const paymentPending = secret()
    const paymentSession = secret()
    expect(await rpc("customer_action_exchange_v1", [issued.id, paymentSecret, paymentPending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_begin_otp_v1", [paymentPending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_confirm_otp_sent_v1", [paymentPending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_action_finish_otp_v1", [paymentPending, paymentSession, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
    const checkout = await rpc("customer_payment_command_v1", [paymentSession, key(), "start_checkout", { idempotencyKey: key() }])
    expectOk(checkout, "test-mode checkout")
    expect(await rpc("payment_ensure_customer_map_v1", [customer, "cus_walk"])).toMatchObject({ status: "success" })
    expect(await rpc("payment_record_provider_refs_v1", [checkout.providerOperationId, "cs_walk", "checkout.session"])).toMatchObject({ status: "success" })
    const settled = await rpc("payment_apply_provider_event_v1", ["evt_walk_paid", "payment_intent.succeeded", "pi_walk", {
      paymentIntentStatus: "succeeded",
      amountMinor: order.amount_minor,
      currency: "gbp",
      stripeCustomerId: "cus_walk",
      customerId: customer,
      serviceOrderId: order.id,
      obligationId,
      attemptId: checkout.attemptId,
      providerOperationId: checkout.providerOperationId,
      orderRef: order.public_ref,
      livemode: false,
    }])
    expectOk(settled, "test-mode settlement")
    expect((await db.query<{ state: string }>("select state from public.service_orders where id = $1", [order.id])).rows[0].state).toBe("ACCEPTED_AWAITING_PAYMENT")
    expect((await db.query<{ state: string }>("select state from public.payment_obligations where id = $1", [obligationId])).rows[0].state).toBe("PAID")
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.payment_receipts where obligation_id = $1", [obligationId])).rows[0].n).toBe(1)

    const pack = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, null, null, "create", {}])
    expectOk(pack, "pack")
    const added = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, pack.id, pack.recordVersion, "add_item", { versionId: begun.versionId }])
    expectOk(added, "pack item")
    const approvedPack = await rpc("admin_prepared_pack_command_v1", [token, key(), caseId, pack.id, added.recordVersion ?? 2, "approve", { note: packNote, confirmed: true }])
    expectOk(approvedPack, "pack approval")
    expectOk(await rpc("admin_prepared_pack_command_v1", [
      token, key(), caseId, pack.id, approvedPack.recordVersion, "publish", { note: publishNote, confirmed: true },
    ]), "pack publication")

    await move("PAYMENT_REQUIRED", "2026-12-01T12:00:00.000Z")
    await move("PREPARATION")
    await move("READY_TO_SUBMIT")
    const filed = await caseCommand("submission", {
      submittedAt: "2026-02-01T12:00:00.000Z",
      reference: "GOOGLE-WALK-1",
      channel: "Google appeals tool",
      evidence: "Submission receipt reviewed and referenced",
      confirmed: true,
    })
    expectOk(filed, "submission")
    const detailAfterFiling = await rpc<CaseDetail>("admin_case_detail_v1", [token, caseId, null])
    expect(detailAfterFiling.submissions[0]?.actor).toBe("CUSTOMER")
    await move("OUTCOME_REVIEW")
    const openAttempt = await caseCommand("close", { outcome: "RESTORED", summary })
    expect(openAttempt.status, JSON.stringify(openAttempt)).toBe("open_work")
    expectOk(await caseCommand("resolve_submission", { submissionId: detailAfterFiling.submissions[0].id, result: "DECIDED" }), "submission result")
    const openTasks = await db.query<{ id: string }>("select id from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])
    expect(openTasks.rows.length).toBeGreaterThan(0)
    const stillOpen = await caseCommand("close", { outcome: "RESTORED", summary })
    expect(stillOpen.status, JSON.stringify(stillOpen)).toBe("open_work")
    for (const task of openTasks.rows) {
      expectOk(await caseCommand("resolve_task", { taskId: task.id, status: "DONE" }), "resolve task")
    }

    const recorded = await caseCommand("record_outcome", { outcome: "RESTORED", summary })
    expectOk(recorded, "record outcome")
    const open = await db.query<{ status: string; work_stage: string; outcome: string }>(
      "select status, work_stage, outcome from public.cases where id = $1",
      [caseId],
    )
    expect(open.rows[0]).toMatchObject({ status: "UNDER_REVIEW", work_stage: "OUTCOME_REVIEW", outcome: "RESTORED" })

    const payload = (await db.query<{ value: unknown }>("select public.admin_case_flow_facts_v1($1, $2::uuid[]) as value", [token, [caseId]])).rows[0].value
    const facts = requiredCase(narrowCaseFlowFacts(payload, [caseId], capabilities), caseId)
    const assessment = judgeAssessment(parseCaseAssessment(await rpc("admin_case_assessment_read_v1", [token, caseId])))
    const work = await db.query<{ id: string; event: string; created_at: string; details: Record<string, unknown> }>(
      "select id::text, event, created_at::text, details from public.case_work_events where case_id = $1 order by id",
      [caseId],
    )
    const events: JourneyWorkEvent[] = work.rows.map(row => ({ id: row.id, event: row.event, createdAt: row.created_at, details: row.details }))
    const beforeClose = presentCaseJourney(facts, now, events, { assessment })
    const unfinished = beforeClose.steps
      .filter(step => step.id !== "CLOSURE" && step.state !== "COMPLETED")
      .map(step => ({ id: step.id, state: step.state, missing: step.missing }))
    expect(unfinished, JSON.stringify(unfinished, null, 2)).toEqual([])
    expect(beforeClose.steps.find(step => step.id === "CLOSURE")?.state).not.toBe("COMPLETED")
    expect(beforeClose.focusStepId).toBe("CLOSURE")
    expect(beforeClose.steps.find(step => step.id === "CASE_RECEIVED")?.destination?.href).toBe(`/cases/${caseId}`)
    expect(beforeClose.steps.find(step => step.id === "VERIFICATION")?.destination?.kind).toBe("BUSINESS_RECORD")
    expect(beforeClose.steps.find(step => step.id === "QUOTE_ACCEPTANCE")?.destination?.href).toBe(`/cases/${caseId}/commercial`)
    expect(beforeClose.steps.find(step => step.id === "PREPARATION")?.destination?.href).toBe(`/cases/${caseId}/evidence`)
    expect(beforeClose.steps.find(step => step.id === "OUTCOME_BILLING")?.destination?.href).toBe("/money")

    const receiptId = (await db.query<{ id: string }>("select id from public.payment_receipts where obligation_id = $1", [obligationId])).rows[0].id
    const orderFact = facts.payment.orders[0]
    const money: MoneyOrder = {
      orderId: order.id,
      orderRef: order.public_ref,
      customerId: customer,
      caseId,
      serviceCode: "GUIDED_RELAUNCH",
      amountMinor: order.amount_minor,
      currency: "GBP",
      paymentModel: orderFact.paymentModel,
      orderState: orderFact.orderState,
      version: order.record_version,
      obligationId,
      obligationKind: orderFact.obligationKind,
      obligationState: orderFact.obligationState,
      setupReady: orderFact.setupReady,
      consentId: null,
      approvalId: null,
      receiptId,
      invoiceId: null,
      invoiceStatus: null,
      acceptedEvidence: [],
    }
    const detail = await rpc<CaseDetail>("admin_case_detail_v1", [token, caseId, null])
    expect(detail.customerPreview.notes).not.toContain(staffNote)
    expect(JSON.stringify(detail.customerPreview)).not.toContain(staffNote)
    const outcome = presentJourneyOutcome({
      facts,
      now,
      recorded: { submissions: detail.submissions, caseTrack: "GUIDED", caseOutcome: "RESTORED", caseStatus: facts.caseStatus, moneyOrders: [money] },
      events,
    })
    expect(outcome.panel.headline).toBe("Settled")
    expect(outcome.panel.requirements.find(item => item.label === "Billing position")?.state).toBe("Met")
    const closure = presentJourneyClosure({
      facts,
      now,
      recorded: { submissions: detail.submissions, caseTrack: "GUIDED", caseOutcome: "RESTORED", caseStatus: facts.caseStatus, moneyOrders: [money] },
      events,
      detail,
      precedingComplete: true,
    })
    expect(closure.panel.commands?.close).toBe(true)
    expect(closure.panel.blockers).not.toContain("The billing position is not ready.")

    const mismatched = await caseCommand("close", { outcome: "NOT_RESTORED", summary })
    expect(mismatched.status).toBe("denied")
    const stale = await version()
    expectOk(await caseCommand("note", { visibility: "INTERNAL" }), "note")
    expect((await rpc("admin_case_command_v1", [token, key(), caseId, stale, "close", { note, outcome: "RESTORED", summary }])).status).toBe("conflict")
    expect((await rpc("admin_case_command_v1", ["bad", key(), caseId, await version(), "close", { note, outcome: "RESTORED", summary }])).status).toBe("unauthorized")

    const closeRequest = key()
    expectOk(await caseCommand("close", { outcome: "RESTORED", summary }, closeRequest), "close")
    expect((await rpc("admin_case_command_v1", [token, closeRequest, caseId, (await version()) - 1, "close", { note, outcome: "RESTORED", summary }])).status).toBe("success")
    expect((await caseCommand("close", { outcome: "RESTORED", summary })).status).toBe("denied")
    const closedRow = (await db.query<{ status: string; work_stage: string; outcome: string; closure_summary: string }>(
      "select status, work_stage, outcome, closure_summary from public.cases where id = $1",
      [caseId],
    )).rows[0]
    expect(closedRow).toMatchObject({ status: "CLOSED", work_stage: "FINISHED", outcome: "RESTORED", closure_summary: summary })
    const history = await db.query<{ event: string }>("select event from public.case_work_events where case_id = $1 order by id", [caseId])
    expect(history.rows.map(row => row.event)).toEqual(expect.arrayContaining(["INTAKE_REVIEW", "BUSINESS_VERIFICATION", "record_outcome", "close"]))
    expect(history.rows.filter(row => row.event === "close")).toHaveLength(1)
    const audits = await db.query<{ action: string }>("select action from public.admin_audit_events where target_id = $1", [caseId])
    expect(audits.rows.map(row => row.action)).toContain("CASE_CHANGED")

    const closedFacts = requiredCase(narrowCaseFlowFacts(
      (await db.query<{ value: unknown }>("select public.admin_case_flow_facts_v1($1, $2::uuid[]) as value", [token, [caseId]])).rows[0].value,
      [caseId],
      capabilities,
    ), caseId)
    const closedEvents = (await db.query<{ id: string; event: string; created_at: string; details: Record<string, unknown> }>(
      "select id::text, event, created_at::text, details from public.case_work_events where case_id = $1 order by id",
      [caseId],
    )).rows.map(row => ({ id: row.id, event: row.event, createdAt: row.created_at, details: row.details }))
    const closedJourney = presentCaseJourney(closedFacts, now, closedEvents, { assessment })
    expect(closedJourney.closed).toBe(true)
    expect(closedJourney.focusStepId).toBeNull()
    expect(closedJourney.steps.map(step => step.state)).toEqual(journeyStepIds.map(() => "COMPLETED"))

    const reference = (await db.query<{ public_ref: string }>("select public_ref from public.cases where id = $1", [caseId])).rows[0].public_ref
    const alexPending = secret()
    expect(await rpc("customer_portal_begin_login_v1", ["alex@example.com", alexPending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_portal_confirm_otp_sent_v1", [alexPending])).toMatchObject({ status: "ok" })
    const alexSession = secret()
    expect(await rpc("customer_portal_finish_otp_v1", [alexPending, alexSession, customerAuth, "alex@example.com"])).toMatchObject({ status: "ok" })
    const owned = await rpc<{ found: boolean; case: { status: string; outcomeCode: string; serviceTrack: string }; timeline: Array<{ code: string }> }>(
      "customer_portal_case_v1",
      [alexSession, reference],
    )
    expect(owned.found).toBe(true)
    expect(owned.case).toMatchObject({ status: "CLOSED", outcomeCode: "RESTORED", serviceTrack: "GUIDED" })
    expect(owned.timeline.map(item => item.code)).toEqual(expect.arrayContaining(["QUOTE_ACCEPTED", "PAYMENT_RECEIVED", "SUBMITTED_TO_GOOGLE", "CASE_COMPLETED"]))
    expect(JSON.stringify(owned)).not.toContain(staffNote)
    const closedDetail = await rpc<CaseDetail>("admin_case_detail_v1", [token, caseId, null])
    expect(closedDetail.summary).toBe(summary)
    expect(closedDetail.customerPreview.summary).toBe(summary)
    expect(closedDetail.customerPreview.notes).not.toContain(staffNote)
    const samPending = secret()
    expect(await rpc("customer_portal_begin_login_v1", ["sam@example.com", samPending])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_portal_confirm_otp_sent_v1", [samPending])).toMatchObject({ status: "ok" })
    const samSession = secret()
    expect(await rpc("customer_portal_finish_otp_v1", [samPending, samSession, otherAuth, "sam@example.com"])).toMatchObject({ status: "ok" })
    expect(await rpc("customer_portal_case_v1", [samSession, reference])).toEqual({ found: false })

    const followUp = {
      title: "Call the customer",
      owner: "ADMIN",
      kind: "FOLLOW_UP",
      due: "2026-12-01T12:00:00.000Z",
      source: "Agreed on the phone",
      timezone: "Europe/London",
    }
    expectOk(await caseCommand("reopen", followUp), "reopen")
    const reopened = (await db.query<{ status: string; work_stage: string; outcome: string | null }>(
      "select status, work_stage, outcome from public.cases where id = $1",
      [caseId],
    )).rows[0]
    expect(reopened).toMatchObject({ status: "UNDER_REVIEW", work_stage: "FURTHER_REVIEW", outcome: null })
    expect((await caseCommand("record_outcome", { outcome: "RESTORED", summary })).status).toBe("denied")
    await move("OUTCOME_REVIEW")
    const followUps = await db.query<{ id: string }>("select id from public.case_tasks where case_id = $1 and status = 'OPEN'", [caseId])
    expect(followUps.rows.length).toBeGreaterThan(0)
    for (const task of followUps.rows) expectOk(await caseCommand("resolve_task", { taskId: task.id, status: "DONE" }), "resolve reopen task")
    const secondSummary = "The listing stayed down and the customer was not charged again."
    expectOk(await caseCommand("record_outcome", { outcome: "NOT_RESTORED", summary: secondSummary }), "replacement outcome")
    expect((await db.query<{ status: string }>("select status from public.cases where id = $1", [caseId])).rows[0].status).not.toBe("CLOSED")
    expect((await caseCommand("record_outcome", { outcome: "RESTORED", summary })).status).toBe("denied")
    expectOk(await caseCommand("close", { outcome: "NOT_RESTORED", summary: secondSummary }), "close replacement")
    const replaced = (await db.query<{ status: string; outcome: string; closure_summary: string }>(
      "select status, outcome, closure_summary from public.cases where id = $1",
      [caseId],
    )).rows[0]
    expect(replaced).toMatchObject({ status: "CLOSED", outcome: "NOT_RESTORED", closure_summary: secondSummary })
    const preserved = await db.query<{ event: string }>("select event from public.case_work_events where case_id = $1", [caseId])
    expect(preserved.rows.filter(row => row.event === "INTAKE_REVIEW")).toHaveLength(1)
    expect(preserved.rows.filter(row => row.event === "close").length).toBeGreaterThan(1)
    const replacedView = await rpc<{ case: { status: string; outcomeCode: string | null } }>("customer_portal_case_v1", [alexSession, reference])
    expect(replacedView.case.status).toBe("CLOSED")
    expect(replacedView.case.outcomeCode).toBe("NOT_RESTORED")
    expect(JSON.stringify(replacedView)).not.toContain(secondSummary)

    for (const role of ["anon", "authenticated", "service_role"]) {
      const privilege = await db.query<{ ok: boolean }>(
        "select has_function_privilege($1, 'admin_private.case_close_billing_ready_v1(public.cases, text)', 'EXECUTE') as ok",
        [role],
      )
      expect(privilege.rows[0].ok).toBe(false)
    }
    await db.exec("set role anon")
    await expect(db.query("update public.cases set status = 'CANCELLED' where id = $1", [caseId])).rejects.toThrow()
    await db.exec("reset role")
    expect((await db.query<{ status: string }>("select status from public.cases where id = $1", [caseId])).rows[0].status).toBe("CLOSED")
  }, 120000)
})
