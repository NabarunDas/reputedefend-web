import { describe, expect, it } from "vitest"
import type { CaseFlowFacts } from "../case-flow/model"
import type { Submission } from "../cases/model"
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
    technicalStage: "OUTCOME_REVIEW",
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

function shown(source: CaseFlowFacts, orders: MoneyOrder[] | null = [money()], submissions: Submission[] | null = [submission()]) {
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
  })
  const step = presentCaseJourney(source, NOW, [], presented.disagreed ? { outcomeRecordsDisagree: true } : {}).steps.find(item => item.id === "OUTCOME_BILLING")
  return { presented, step }
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
    const source = facts({ payment: { complete: true, orders: [upfront({ obligationState: "DUE", receiptRecorded: false })] } })
    const { presented, step } = shown(source, [money({ obligationState: "DUE", receiptId: null })])
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
    const { presented, step } = shown(source, [row], [submission({ actor: "ADMIN", track: "MANAGED" })])
    expect(presented.panel.headline).toBe("Pending billing")
    expect(presented.panel.commands).toEqual({ approve: true, invoice: false })
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
    const approved = shown(managed, [baseMoney], [attempt])
    expect(approved.presented.panel.headline).toBe("Approved fee")
    expect(approved.presented.panel.commands).toEqual({ approve: false, invoice: true })
    expect(approved.step?.state).toBe("WAITING")

    const drafted = shown(managed, [{ ...baseMoney, invoiceStatus: "DRAFT" }], [attempt])
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
    const failed = shown(failedSource, [{ ...baseMoney, obligationState: "FAILED" }], [attempt])
    expect(failed.presented.panel.headline).toBe("Payment failed")
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

  it("does not treat an open outcome, a reopened case, or a fee on an unsuccessful case as finished", () => {
    const open = shown(facts({ caseStatus: "UNDER_REVIEW", technicalStage: "OUTCOME_REVIEW" }))
    expect(open.presented.panel.headline).toBe("Billing records disagree")
    expect(open.presented.panel.commands).toBeNull()
    expect(open.step?.state).toBe("NEEDS_ATTENTION")

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
    expect(again.presented.panel.commands).toBeNull()
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
})
