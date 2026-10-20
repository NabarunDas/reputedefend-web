import { describe, expect, it } from "vitest"
import type { CaseFlowFacts, CaseFlowEvidenceVersionFact } from "../case-flow/model"
import type { Submission } from "../cases/model"
import type { ServiceOrder } from "../commerce/model"
import type { MoneyOrder } from "../payments/model"
import { presentCaseJourney } from "./present"
import { judgeOutcomeBilling, presentJourneyOutcome } from "./outcome"

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const ORDER_ID = "88888888-8888-4888-8888-888888888888"
const OTHER_ORDER = "99999999-9999-4999-8999-999999999999"
const WHEN = "2026-06-01T12:00:00.000Z"
const NOW = "2026-10-03T12:00:00.000Z"

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "FINISHED",
    caseStatus: "CLOSED",
    serviceTrack: "GUIDED",
    outcome: "RESTORED",
    outcomeSummary: "The listing was restored.",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: [],
    reopened: false,
    tasks: [],
    submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "DECIDED" }],
    authorization: {
      membershipStatus: "verified",
      customerEmailVerified: true,
      businessAuthorityVerified: true,
      serviceAgreementAccepted: true,
      caseManagementPermissionActive: false,
      managerAccessVerified: false,
      authorizationReady: false,
      reviewRequired: [],
      agreementKinds: [],
      hasLocation: true,
    },
    customerActions: [],
    commercial: { complete: true, quotes: [{ id: "quote-1", status: "ACCEPTED", taxBehaviour: "NOT_APPLICABLE", validUntil: "2026-12-01T00:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: ORDER_ID }] },
    payment: { complete: true, orders: [upfront()] },
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    ...overrides,
  }
}

function upfront(overrides: Partial<CaseFlowFacts["payment"]["orders"][number]> = {}): CaseFlowFacts["payment"]["orders"][number] {
  return {
    orderId: ORDER_ID,
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    obligationKind: "UPFRONT",
    obligationState: "PAID",
    setupReady: false,
    consentRecorded: false,
    receiptRecorded: true,
    ...overrides,
  }
}

function success(overrides: Partial<CaseFlowFacts["payment"]["orders"][number]> = {}): CaseFlowFacts["payment"]["orders"][number] {
  return {
    orderId: ORDER_ID,
    paymentModel: "SUCCESS_FEE",
    orderState: "ACCEPTED_SUCCESS_FEE",
    obligationKind: null,
    obligationState: null,
    setupReady: true,
    consentRecorded: true,
    receiptRecorded: false,
    ...overrides,
  }
}

function submission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: "submission-1",
    actor: "CUSTOMER",
    track: "GUIDED",
    submittedAt: WHEN,
    reference: "GOOGLE-123",
    channel: "Google appeals tool",
    evidence: "Submission receipt reviewed and referenced",
    result: "DECIDED",
    resultNote: "The listing was restored.",
    ...overrides,
  }
}

function money(overrides: Partial<MoneyOrder> = {}): MoneyOrder {
  return {
    orderId: ORDER_ID,
    orderRef: "SO-26-ABCDEF",
    customerId: "11111111-1111-4111-8111-111111111111",
    caseId: CASE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    amountMinor: 14900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    version: 2,
    obligationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    obligationKind: "UPFRONT",
    obligationState: "PAID",
    setupReady: false,
    consentId: null,
    approvalId: null,
    receiptId: "receipt-1",
    invoiceId: null,
    invoiceStatus: null,
    acceptedEvidence: [],
    ...overrides,
  }
}

function serviceOrder(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: ORDER_ID,
    publicRef: "SO-26-ABCDEF",
    quoteId: "quote-1",
    quoteRef: "Q-26-ABCDEF",
    quoteVersionId: "quote-version-1",
    customerName: "Alex",
    businessName: "Bakery",
    caseReference: "PR-1",
    caseId: CASE_ID,
    serviceCode: "MANAGED_RELAUNCH",
    amountMinor: 14900,
    currency: "GBP",
    paymentModel: "SUCCESS_FEE",
    taxBehaviour: "NOT_APPLICABLE",
    taxAmountMinor: 0,
    state: "ACCEPTED_SUCCESS_FEE",
    acceptedAt: WHEN,
    ...overrides,
  }
}

function version(id: string, overrides: Partial<CaseFlowEvidenceVersionFact> = {}): CaseFlowEvidenceVersionFact {
  return {
    documentId: `doc-${id}`,
    versionId: id,
    evidenceRequestId: "request-1",
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    reviewStatus: "ACCEPTED",
    ...overrides,
  }
}

function shown(
  source: CaseFlowFacts,
  orders: MoneyOrder[] | null = [money()],
  submissions: Submission[] | null = [submission()],
  detail: { order?: ServiceOrder | null; orderDetailMissing?: boolean; events?: { id: string; event: string; details: Record<string, unknown> }[] } = {},
) {
  const events = (detail.events ?? []).map(event => ({ ...event, createdAt: WHEN }))
  const presented = presentJourneyOutcome({
    facts: source,
    now: NOW,
    recorded: {
      submissions,
      caseTrack: source.serviceTrack,
      caseOutcome: source.outcome,
      caseStatus: source.caseStatus,
      moneyOrders: orders,
    },
    order: detail.order ?? null,
    orderDetailMissing: detail.orderDetailMissing === true,
    events,
  })
  const journey = presentCaseJourney(source, NOW, events, {
    ...(presented.disagreed ? { outcomeRecordsDisagree: true } : {}),
    outcomeEvents: events,
  })
  return {
    presented,
    step: journey.steps.find(item => item.id === "OUTCOME_BILLING"),
    closure: journey.steps.find(item => item.id === "CLOSURE"),
  }
}

describe("outcome verification and billing", () => {
  it("settles a paid Guided case without a second charge", () => {
    const source = facts()
    const { presented, step } = shown(source)
    expect(presented.panel.headline).toBe("Settled")
    expect(presented.panel.commands).toBeNull()
    expect(presented.panel.notices.join(" ")).toMatch(/No second charge/)
    expect(presented.panel.billingLabel).toMatch(/receipt recorded/)
    expect(judgeOutcomeBilling(source, NOW).proof).toBe("complete")
    expect(step?.state).toBe("COMPLETED")
  })

  it("keeps an unpaid Guided obligation open and does not invoice it", () => {
    const source = facts({ payment: { complete: true, orders: [upfront({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "DUE", receiptRecorded: false })] } })
    const { presented, step } = shown(source, [money({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "DUE", receiptId: null })])
    expect(presented.panel.headline).toBe("Pending billing")
    expect(presented.panel.commands).toBeNull()
    expect(presented.panel.notices.join(" ")).toMatch(/No second charge/)
    expect(step?.state).toBe("WAITING")
    expect(step?.state).not.toBe("COMPLETED")
  })

  it("offers success-fee approval only for a qualifying Managed outcome with accepted evidence", () => {
    const version = { documentId: "77777777-7777-4777-8777-777777777777", versionId: "66666666-6666-4666-8666-666666666666", evidenceRequestId: "request-1", uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED" }
    const source = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success()] },
      evidence: { requests: [], versions: [version] },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    })
    const row = money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
      acceptedEvidence: [{ id: version.versionId, filename: "outcome.png", versionNumber: 1 }],
    })
    const { presented, step } = shown(source, [row], [submission({ actor: "ADMIN", track: "MANAGED" })], { order: serviceOrder() })
    expect(presented.panel.headline).toBe("Pending billing")
    expect(presented.panel.commands).toEqual({ approve: true, invoice: false, record: false })
    expect(presented.panel.evidence).toEqual(["outcome.png · v1"])
    expect(step?.state).toBe("WAITING")
    expect(step?.state).not.toBe("COMPLETED")

    const missing = shown(facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success()] },
    }), [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
    })], [submission({ actor: "ADMIN", track: "MANAGED" })])
    expect(missing.presented.panel.commands).toBeNull()
    expect(missing.presented.panel.requirements.find(item => item.label === "Billing position")?.state).toBe("Not met")
  })

  it("does not invoice a non-qualifying Managed outcome", () => {
    const source = facts({
      outcome: "NOT_RESTORED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success()] },
    })
    const { presented, step } = shown(source, [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
    })], [submission({ actor: "ADMIN", track: "MANAGED", resultNote: "The listing stayed suspended." })])
    expect(presented.panel.headline).toBe("Not billable")
    expect(presented.panel.commands).toBeNull()
    expect(presented.panel.notices.join(" ")).toMatch(/not invoiced/)
    expect(judgeOutcomeBilling(source, NOW).proof).toBe("complete")
    expect(step?.state).toBe("COMPLETED")

    const voidedSource = facts({
      outcome: "NOT_RESTORED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success({ obligationKind: "SUCCESS_FEE", obligationState: "VOID" })] },
    })
    const voided = shown(voidedSource, [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationKind: "SUCCESS_FEE",
      obligationState: "VOID",
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
    })], [submission({ actor: "ADMIN", track: "MANAGED" })])
    expect(voided.presented.panel.headline).toBe("Not billable")
    expect(voided.presented.panel.commands).toBeNull()
    expect(judgeOutcomeBilling(voidedSource, NOW).proof).toBe("complete")
    expect(voided.step?.state).toBe("COMPLETED")
    expect(voided.closure?.state).not.toBe("NEEDS_ATTENTION")
  })

  it("distinguishes an approved fee, an issued invoice, a failed collection and provider settlement", () => {
    const managed = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success({ obligationKind: "SUCCESS_FEE", obligationState: "DUE" })] },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    })
    const baseMoney = money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationKind: "SUCCESS_FEE",
      obligationState: "DUE",
      setupReady: true,
      consentId: "consent-1",
      approvalId: "approval-1",
      receiptId: null,
    })
    const attempt = submission({ actor: "ADMIN", track: "MANAGED" })
    const approved = shown(managed, [baseMoney], [attempt], { order: serviceOrder() })
    expect(approved.presented.panel.headline).toBe("Approved fee")
    expect(approved.presented.panel.commands).toEqual({ approve: false, invoice: true, record: false })
    expect(approved.step?.state).toBe("WAITING")

    const drafted = shown(managed, [{ ...baseMoney, invoiceStatus: "DRAFT" }], [attempt], { order: serviceOrder() })
    expect(drafted.presented.panel.headline).toBe("Approved fee")
    expect(drafted.presented.panel.notices.join(" ")).toMatch(/draft invoice/)
    expect(drafted.step?.state).not.toBe("COMPLETED")

    const issued = shown(managed, [{ ...baseMoney, invoiceId: "invoice-1", invoiceStatus: "ISSUED" }], [attempt])
    expect(issued.presented.panel.headline).toBe("Invoiced")
    expect(issued.presented.panel.commands).toBeNull()
    expect(issued.presented.panel.notices.join(" ")).toMatch(/not payment/)
    expect(issued.step?.state).toBe("WAITING")

    const failedSource = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success({ obligationKind: "SUCCESS_FEE", obligationState: "FAILED" })] },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    })
    const failed = shown(failedSource, [{ ...baseMoney, obligationState: "FAILED" }], [attempt], { order: serviceOrder() })
    expect(failed.presented.panel.headline).toBe("Payment failed")
    expect(failed.presented.panel.commands).toEqual({ approve: false, invoice: true, record: false })
    expect(failed.step?.state).toBe("NEEDS_ATTENTION")
    expect(failed.step?.state).not.toBe("COMPLETED")

    const settledSource = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success({ obligationKind: "SUCCESS_FEE", obligationState: "PAID", receiptRecorded: true })] },
    })
    const settled = shown(settledSource, [{ ...baseMoney, obligationState: "PAID", receiptId: "receipt-1", invoiceId: "invoice-1", invoiceStatus: "PAID" }], [attempt])
    expect(settled.presented.panel.headline).toBe("Settled")
    expect(settled.presented.panel.commands).toBeNull()
    expect(judgeOutcomeBilling(settledSource, NOW).proof).toBe("complete")
    expect(settled.step?.state).toBe("COMPLETED")
  })

  it("fails closed on a mismatched order, an incomplete list, a paid obligation without a receipt, and a loaded conflict", () => {
    const mismatched = facts({
      commercial: { complete: true, quotes: [{ id: "quote-1", status: "ACCEPTED", taxBehaviour: "NOT_APPLICABLE", validUntil: "2026-12-01T00:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: OTHER_ORDER }] },
    })
    const mismatch = shown(mismatched)
    expect(mismatch.presented.panel.headline).toBe("Billing records disagree")
    expect(mismatch.presented.panel.commands).toBeNull()
    expect(mismatch.step?.state).toBe("NEEDS_ATTENTION")

    const incomplete = shown(facts({ payment: { complete: false, orders: [upfront()] } }))
    expect(incomplete.presented.panel.headline).toBe("Billing records are incomplete")
    expect(incomplete.presented.panel.commands).toBeNull()
    expect(incomplete.step?.state).toBe("NEEDS_ATTENTION")

    const contradictory = facts({ payment: { complete: true, orders: [upfront({ receiptRecorded: false })] } })
    const contradicted = shown(contradictory, [money({ receiptId: null })])
    expect(contradicted.presented.panel.headline).toBe("Billing records disagree")
    expect(judgeOutcomeBilling(contradictory, NOW).proof).toBe("attention")
    expect(contradicted.step?.state).not.toBe("COMPLETED")

    const loaded = shown(facts(), [money({ obligationState: "DUE", receiptId: null })])
    expect(loaded.presented.panel.headline).toBe("Billing records disagree")
    expect(loaded.presented.panel.commands).toBeNull()
    expect(loaded.step?.state).toBe("NEEDS_ATTENTION")
  })

  it("reads a legitimate pre-closure outcome without closing the case or offering a record command", () => {
    const open = shown(facts({ caseStatus: "UNDER_REVIEW", technicalStage: "OUTCOME_REVIEW" }))
    expect(open.presented.panel.headline).toBe("Settled")
    expect(open.presented.panel.commands).toBeNull()
    expect(open.presented.panel.commands?.record ?? false).toBe(false)
    expect(open.presented.panel.notices.join(" ")).toMatch(/already stored on an open case/)
    expect(open.presented.panel.notices.join(" ")).toMatch(/does not close the case/)
    expect(open.step?.state).toBe("COMPLETED")
    const journey = presentCaseJourney(facts({ caseStatus: "UNDER_REVIEW", technicalStage: "OUTCOME_REVIEW" }), NOW)
    expect(journey.steps.find(item => item.id === "CLOSURE")?.state).not.toBe("COMPLETED")

    const versionId = "66666666-6666-4666-8666-666666666666"
    const managed = facts({
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success()] },
      evidence: { requests: [], versions: [version(versionId)] },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    })
    const approval = shown(managed, [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
      acceptedEvidence: [{ id: versionId, filename: "outcome.png", versionNumber: 1 }],
    })], [submission({ actor: "ADMIN", track: "MANAGED" })], { order: serviceOrder() })
    expect(approval.presented.panel.commands).toEqual({ approve: true, invoice: false, record: false })
    expect(approval.presented.panel.order).not.toBeNull()
    expect(approval.step?.state).not.toBe("COMPLETED")
    expect(presentCaseJourney(managed, NOW).steps.find(item => item.id === "CLOSURE")?.state).not.toBe("COMPLETED")
  })

  it("offers a record command only while the outcome is absent and the records agree", () => {
    const open = shown(facts({
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: null,
      outcomeSummary: "",
      submissions: [],
      commercial: { complete: true, quotes: [] },
      payment: { complete: true, orders: [] },
    }), [], [])
    expect(open.presented.panel.headline).toBe("Outcome not recorded")
    expect(open.presented.panel.commands).toEqual({ approve: false, invoice: false, record: true })
    expect(open.presented.panel.notices.join(" ")).toMatch(/does not close the case/)
    expect(open.presented.panel.notices.join(" ")).toMatch(/approve a success fee/)
    expect(open.step?.state).not.toBe("LOCKED")
    expect(open.step?.state).not.toBe("COMPLETED")

    const stored = shown(facts({ caseStatus: "UNDER_REVIEW", technicalStage: "OUTCOME_REVIEW" }))
    expect(stored.presented.panel.commands?.record ?? false).toBe(false)

    const disagree = shown(facts({
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: null,
      outcomeSummary: "",
      payment: { complete: true, orders: [upfront({ obligationState: "PAID", receiptRecorded: false })] },
    }), [money({ obligationState: "PAID", receiptId: null })])
    expect(disagree.presented.panel.headline).toBe("Billing records disagree")
    expect(disagree.presented.panel.commands).toBeNull()

    const unfinished = shown(facts({
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: null,
      outcomeSummary: "",
      submissions: [],
      commercial: { complete: false, quotes: [] },
      payment: { complete: true, orders: [] },
    }), [], [])
    expect(unfinished.presented.panel.headline).toBe("Billing records are incomplete")
    expect(unfinished.presented.panel.commands).toBeNull()

    const otherType = shown(facts({
      caseType: "OTHER",
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: null,
      outcomeSummary: "",
      submissions: [],
      commercial: { complete: true, quotes: [] },
      payment: { complete: true, orders: [] },
    }), [], [])
    expect(otherType.presented.panel.commands).toBeNull()
  })

  it("does not treat an open outcome, a reopened case, or a fee on an unsuccessful case as finished", () => {
    const forgedStage = shown(facts({ caseStatus: "UNDER_REVIEW", technicalStage: "PREPARATION" }))
    expect(forgedStage.presented.panel.headline).toBe("Billing records disagree")
    expect(forgedStage.presented.panel.commands).toBeNull()
    expect(forgedStage.step?.state).toBe("NEEDS_ATTENTION")

    const unfinishedClose = shown(facts({ technicalStage: "OUTCOME_REVIEW" }))
    expect(unfinishedClose.presented.panel.headline).toBe("Billing records disagree")
    expect(unfinishedClose.presented.panel.commands).toBeNull()

    const withdrawnClosed = shown(facts({ outcome: "WITHDRAWN", caseStatus: "CLOSED" }))
    expect(withdrawnClosed.presented.panel.headline).toBe("Billing records disagree")
    expect(withdrawnClosed.presented.panel.commands).toBeNull()

    const reopenedWithOutcome = shown(facts({
      reopened: true,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
    }))
    expect(reopenedWithOutcome.presented.panel.headline).toBe("Billing records disagree")
    expect(reopenedWithOutcome.presented.panel.notices.join(" ")).toMatch(/reopened/)
    expect(reopenedWithOutcome.presented.panel.commands).toBeNull()
    expect(reopenedWithOutcome.step?.state).not.toBe("COMPLETED")

    const bareOutcome = shown(facts({
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcomeSummary: "",
    }))
    expect(bareOutcome.presented.panel.headline).toBe("Billing records disagree")
    expect(bareOutcome.presented.panel.commands).toBeNull()

    const reopened = facts({
      reopened: true,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: null,
      outcomeSummary: "",
    })
    const again = shown(reopened)
    expect(again.presented.panel.headline).toBe("Outcome not recorded")
    expect(again.presented.panel.notices.join(" ")).toMatch(/reopened/)
    expect(again.presented.panel.commands).toEqual({ approve: false, invoice: false, record: true })
    expect(again.step?.state).not.toBe("COMPLETED")
    expect(judgeOutcomeBilling(reopened, NOW).known.join(" ")).toMatch(/does not close the case/)

    const fee = facts({
      outcome: "NOT_RESTORED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success({ obligationKind: "SUCCESS_FEE", obligationState: "DUE" })] },
    })
    const billed = shown(fee, [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationKind: "SUCCESS_FEE",
      obligationState: "DUE",
      setupReady: true,
      consentId: "consent-1",
      approvalId: "approval-1",
      receiptId: null,
    })], [submission({ actor: "ADMIN", track: "MANAGED" })])
    expect(billed.presented.panel.headline).toBe("Billing records disagree")
    expect(billed.presented.panel.commands).toBeNull()
    expect(billed.step?.state).not.toBe("COMPLETED")
  })

  it("accepts a new outcome recorded after reopen and rejects one retained from before it", () => {
    const summary = "The listing was restored."
    const versionId = "66666666-6666-4666-8666-666666666666"
    const freshEvents = [
      { id: "9", event: "reopen", details: { previousOutcome: "RESTORED" } },
      { id: "10", event: "record_outcome", details: { outcome: "RESTORED", summary, closesCase: false } },
    ]
    const managed = facts({
      reopened: true,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success()] },
      evidence: { requests: [], versions: [version(versionId)] },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    })
    const fresh = shown(managed, [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
      acceptedEvidence: [{ id: versionId, filename: "outcome.png", versionNumber: 1 }],
    })], [submission({ actor: "ADMIN", track: "MANAGED" })], { order: serviceOrder(), events: freshEvents })
    expect(fresh.presented.panel.headline).toBe("Pending billing")
    expect(fresh.presented.panel.commands).toEqual({ approve: true, invoice: false, record: false })
    expect(fresh.presented.panel.notices.join(" ")).toMatch(/later record stored this outcome/)
    expect(fresh.presented.panel.notices.join(" ")).not.toMatch(/not an authoritative/)
    expect(fresh.step?.state).not.toBe("NEEDS_ATTENTION")
    expect(fresh.step?.state).not.toBe("COMPLETED")
    expect(fresh.closure?.state).not.toBe("COMPLETED")

    const stale = shown(facts({
      reopened: true,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
    }))
    expect(stale.presented.panel.headline).toBe("Billing records disagree")
    expect(stale.presented.panel.commands).toBeNull()
    expect(stale.presented.panel.notices.join(" ")).toMatch(/not an authoritative/)
    expect(stale.step?.state).toBe("NEEDS_ATTENTION")
    expect(stale.closure?.state).not.toBe("COMPLETED")

    const ordinary = shown(facts({
      reopened: false,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
    }))
    expect(ordinary.presented.panel.headline).toBe("Settled")
    expect(ordinary.presented.panel.commands).toBeNull()
    expect(ordinary.presented.panel.notices.join(" ")).toMatch(/already stored on an open case/)
    expect(ordinary.presented.panel.notices.join(" ")).not.toMatch(/not an authoritative/)
    expect(ordinary.closure?.state).not.toBe("COMPLETED")

    const withdrawn = shown(facts({
      reopened: true,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "FURTHER_REVIEW",
      outcome: "WITHDRAWN",
      outcomeSummary: summary,
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "WITHDRAWN" }],
      payment: { complete: true, orders: [success()] },
    }), [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
    })], [submission({ actor: "ADMIN", track: "MANAGED", result: "WITHDRAWN" })], {
      events: [
        { id: "4", event: "reopen", details: {} },
        { id: "5", event: "record_outcome", details: { outcome: "WITHDRAWN", summary, closesCase: false } },
      ],
    })
    expect(withdrawn.presented.panel.headline).toBe("Not billable")
    expect(withdrawn.presented.panel.commands).toBeNull()
    expect(withdrawn.presented.panel.notices.join(" ")).not.toMatch(/not an authoritative/)
    expect(withdrawn.closure?.state).not.toBe("COMPLETED")
  })

  it("accepts only a consistent Guided order, obligation and receipt", () => {
    const pair = (orderState: string, obligationState: string, receipt: boolean) => {
      const source = facts({
        payment: { complete: true, orders: [upfront({ orderState, obligationState, receiptRecorded: receipt })] },
      })
      return shown(source, [money({ orderState, obligationState, receiptId: receipt ? "receipt-1" : null })])
    }
    const settled = pair("ACCEPTED_AWAITING_PAYMENT", "PAID", true)
    expect(settled.presented.panel.headline).toBe("Settled")
    expect(settled.step?.known.join(" ")).toMatch(/ACCEPTED_AWAITING_PAYMENT/)
    expect(settled.step?.known.join(" ")).toMatch(/No second charge/)
    expect(settled.presented.panel.commands).toBeNull()
    expect(settled.step?.state).toBe("COMPLETED")

    const due = pair("ACCEPTED_AWAITING_PAYMENT", "DUE", false)
    expect(due.presented.panel.headline).toBe("Pending billing")
    expect(due.presented.panel.commands).toBeNull()
    expect(due.step?.state).toBe("WAITING")

    const collecting = pair("ACCEPTED_AWAITING_PAYMENT", "COLLECTING", false)
    expect(collecting.presented.panel.headline).toBe("Pending billing")
    expect(collecting.presented.panel.commands).toBeNull()
    expect(collecting.step?.state).toBe("WAITING")

    const failed = pair("ACCEPTED_AWAITING_PAYMENT", "FAILED", false)
    expect(failed.presented.panel.headline).toBe("Payment failed")
    expect(failed.presented.panel.commands).toBeNull()
    expect(failed.step?.state).toBe("NEEDS_ATTENTION")

    const voidSource = facts({
      payment: { complete: true, orders: [upfront({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "VOID", receiptRecorded: false })] },
    })
    const voided = shown(voidSource, [money({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "VOID", receiptId: null })])
    expect(voided.presented.panel.notices.join(" ")).toMatch(/void/)
    expect(voided.presented.panel.commands).toBeNull()
    expect(judgeOutcomeBilling(voidSource, NOW).proof).toBe("attention")
    expect(voided.step?.state).toBe("NEEDS_ATTENTION")

    const authenticating = pair("ACCEPTED_AWAITING_PAYMENT", "AUTHENTICATION_REQUIRED", false)
    expect(authenticating.presented.panel.headline).not.toBe("Settled")
    expect(authenticating.step?.state).toBe("NEEDS_ATTENTION")

    for (const [orderState, obligationState, receipt] of [
      ["ACCEPTED_PAID", "PAID", true],
      ["ACCEPTED_PAID", "PAID", false],
      ["ACCEPTED_PAID", "DUE", false],
      ["ACCEPTED_PAID", "FAILED", false],
      ["ACCEPTED_PAID", "COLLECTING", false],
      ["ACCEPTED_AWAITING_PAYMENT", "PAID", false],
      ["ACCEPTED_AWAITING_PAYMENT", "DUE", true],
    ] as const) {
      const rejected = pair(orderState, obligationState, receipt)
      expect(rejected.presented.panel.headline).toBe("Billing records disagree")
      expect(rejected.presented.panel.commands).toBeNull()
      expect(rejected.step?.state).not.toBe("COMPLETED")
    }
  })

  it("checks the selected evidence version and ignores extra accepted files", () => {
    const selected = "66666666-6666-4666-8666-666666666666"
    const managed = (versions: CaseFlowEvidenceVersionFact[]) => facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success()] },
      evidence: { requests: [], versions },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    })
    const row = (id: string) => money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
      acceptedEvidence: [{ id, filename: "outcome.png", versionNumber: 1 }],
    })
    const attempt = submission({ actor: "ADMIN", track: "MANAGED" })
    const eligible = shown(managed([
      version(selected),
      version("77777777-7777-4777-8777-777777777777"),
      version("88888888-8888-4888-8888-888888888888"),
    ]), [row(selected)], [attempt], { order: serviceOrder() })
    expect(eligible.presented.panel.commands).toEqual({ approve: true, invoice: false, record: false })
    expect(eligible.presented.panel.evidence).toEqual(["outcome.png · v1"])

    for (const bad of [
      version(selected, { reviewStatus: "REJECTED" }),
      version(selected, { scanStatus: "THREATS_FOUND" }),
      version(selected, { validationStatus: "INVALID" }),
      version(selected, { uploadStatus: "PENDING" }),
      version(selected, { documentId: " " }),
    ]) {
      const refused = shown(managed([bad, version("77777777-7777-4777-8777-777777777777")]), [row(selected)], [attempt], { order: serviceOrder() })
      expect(refused.presented.panel.commands).toBeNull()
      expect(refused.presented.panel.headline).toBe("Billing records disagree")
      expect(refused.step?.state).not.toBe("COMPLETED")
    }

    const missing = shown(managed([version("77777777-7777-4777-8777-777777777777")]), [row(selected)], [attempt], { order: serviceOrder() })
    expect(missing.presented.panel.commands).toBeNull()
    expect(missing.presented.panel.headline).toBe("Billing records disagree")
  })

  it("withholds billing commands unless the quote, order, case and customer agree", () => {
    const versionId = "66666666-6666-4666-8666-666666666666"
    const source = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [success()] },
      evidence: { requests: [], versions: [version(versionId)] },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    })
    const row = money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
      acceptedEvidence: [{ id: versionId, filename: "outcome.png", versionNumber: 1 }],
    })
    const attempt = submission({ actor: "ADMIN", track: "MANAGED" })
    const ready = shown(source, [row], [attempt], { order: serviceOrder() })
    expect(ready.presented.panel.commands).toEqual({ approve: true, invoice: false, record: false })

    const otherCustomer = "12121212-1212-4121-8121-121212121212"
    const wrongCustomer = shown(source, [money({ ...row, customerId: otherCustomer })], [attempt], { order: serviceOrder() })
    expect(wrongCustomer.presented.panel.headline).toBe("Billing records disagree")
    expect(wrongCustomer.presented.panel.commands).toBeNull()
    expect(wrongCustomer.step?.state).toBe("NEEDS_ATTENTION")

    const wrongCase = shown(source, [money({ ...row, caseId: otherCustomer })], [attempt], { order: serviceOrder() })
    expect(wrongCase.presented.panel.commands).toBeNull()
    expect(wrongCase.step?.state).toBe("NEEDS_ATTENTION")

    const nullCase = shown(source, [money({ ...row, caseId: null })], [attempt], { order: serviceOrder() })
    expect(nullCase.presented.panel.commands).toBeNull()

    const missingDetail = shown(source, [row], [attempt], { orderDetailMissing: true })
    expect(missingDetail.presented.panel.headline).toBe("Billing records disagree")
    expect(missingDetail.presented.panel.commands).toBeNull()
    expect(missingDetail.presented.panel.notices.join(" ")).toMatch(/same case and customer/)

    const wrongQuote = shown(source, [row], [attempt], { order: serviceOrder({ quoteId: "quote-other" }) })
    expect(wrongQuote.presented.panel.commands).toBeNull()
    expect(wrongQuote.presented.panel.headline).toBe("Billing records disagree")

    const wrongOrderCase = shown(source, [row], [attempt], { order: serviceOrder({ caseId: null }) })
    expect(wrongOrderCase.presented.panel.commands).toBeNull()

    const wrongModel = shown(source, [row], [attempt], { order: serviceOrder({ paymentModel: "UPFRONT" }) })
    expect(wrongModel.presented.panel.commands).toBeNull()

    const duplicate = shown(source, [row, { ...row, orderId: OTHER_ORDER }], [attempt], { order: serviceOrder() })
    expect(duplicate.presented.panel.commands).toBeNull()

    const guidedCustomer = shown(facts(), [money({ customerId: otherCustomer })])
    expect(guidedCustomer.presented.panel.headline).toBe("Billing records disagree")
    expect(guidedCustomer.presented.panel.commands).toBeNull()
    expect(guidedCustomer.step?.state).not.toBe("COMPLETED")
  })
})
