import { describe, expect, it } from "vitest"
import type { CaseAuthorization } from "../authorization/model"
import type { CaseFlowAuthorizationFact, CaseFlowFacts, CaseFlowOrderFact, CaseFlowQuoteFact } from "../case-flow/model"
import type { MoneyOrder } from "../payments/model"
import { buildJourneyActivationPanel } from "./activation"

const NOW = "2026-06-01T12:00:00.000Z"
const FUTURE = "2026-07-01T12:00:00.000Z"
const PAST = "2026-05-01T12:00:00.000Z"
const ORDER_ID = "55555555-5555-4555-8555-555555555555"
const CASE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

function authorization(overrides: Partial<CaseFlowAuthorizationFact> = {}): CaseFlowAuthorizationFact {
  return {
    membershipStatus: "verified",
    customerEmailVerified: true,
    businessAuthorityVerified: true,
    serviceAgreementAccepted: false,
    caseManagementPermissionActive: false,
    managerAccessVerified: false,
    authorizationReady: false,
    reviewRequired: [],
    agreementKinds: [],
    hasLocation: true,
    ...overrides,
  }
}

function quote(overrides: Partial<CaseFlowQuoteFact> = {}): CaseFlowQuoteFact {
  return {
    id: "quote-1",
    status: "ACCEPTED",
    taxBehaviour: "INCLUSIVE",
    validUntil: FUTURE,
    actionStatus: null,
    actionExpiresAt: null,
    orderId: ORDER_ID,
    ...overrides,
  }
}

function upfront(overrides: Partial<CaseFlowOrderFact> = {}): CaseFlowOrderFact {
  return {
    orderId: ORDER_ID,
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    obligationKind: "UPFRONT",
    obligationState: "DUE",
    setupReady: false,
    consentRecorded: false,
    receiptRecorded: false,
    ...overrides,
  }
}

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "CASE-0001",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "PAYMENT_REQUIRED",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["PREPARATION"],
    reopened: false,
    tasks: [],
    submissions: [],
    authorization: authorization(),
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [quote()] },
    payment: { complete: true, orders: [upfront()] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    ...overrides,
  }
}

function money(overrides: Partial<MoneyOrder> = {}): MoneyOrder {
  return {
    orderId: ORDER_ID,
    orderRef: "SO-100",
    customerId: "11111111-1111-4111-8111-111111111111",
    caseId: CASE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    version: 3,
    obligationId: "66666666-6666-4666-8666-666666666666",
    obligationKind: "UPFRONT",
    obligationState: "DUE",
    setupReady: false,
    consentId: null,
    approvalId: null,
    receiptId: null,
    ...overrides,
  }
}

const managedAuthorization = {
  caseId: CASE_ID,
  reference: "CASE-0001",
  customerId: "11111111-1111-4111-8111-111111111111",
  businessId: "22222222-2222-4222-8222-222222222222",
  locationId: "33333333-3333-4333-8333-333333333333",
  track: "MANAGED",
  stage: "AUTHORIZATION_REQUIRED",
  emailMasked: "a***@example.com",
  membershipStatus: "verified",
  readiness: {
    businessAuthorityVerified: true,
    customerEmailVerified: true,
    serviceAgreementAccepted: false,
    caseManagementPermissionActive: false,
    managerAccessVerified: false,
    managedTrack: true,
    authorizationReady: false,
  },
  readinessNote: "not payment",
  agreements: [],
  authorizations: [],
  actions: [],
  managerAccess: null,
} as CaseAuthorization

function panel(overrides: Partial<CaseFlowFacts> = {}, extra: { recordsConflict?: boolean; moneyOrders?: MoneyOrder[]; authorization?: CaseAuthorization | null } = {}) {
  return buildJourneyActivationPanel({
    facts: facts(overrides),
    now: NOW,
    order: null,
    orderDetailMissing: false,
    moneyOrders: extra.moneyOrders ?? [money()],
    authorization: extra.authorization ?? null,
    recordsConflict: extra.recordsConflict ?? false,
  })
}

describe("guided service activation", () => {
  it("offers the existing upfront link only when collection is already the next action", () => {
    const view = panel()
    expect(view.track).toBe("GUIDED")
    expect(view.headline).toBe("Guided payment outstanding")
    expect(view.issueUpfront).toEqual({ serviceOrderId: ORDER_ID, version: 3 })
    expect(view.requirements.find(item => item.label === "Upfront obligation PAID")?.state).toBe("Not met")
    expect(view.detail).toMatch(/not the selected track/)
    expect(view.authorization).toBeNull()
  })

  it("does not start a payment when collection is switched off, the list is incomplete, or the records disagree", () => {
    const disabled = panel({ capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false } })
    expect(disabled.issueUpfront).toBeNull()
    expect(disabled.notices.join(" ")).toMatch(/switched off/)
    expect(disabled.notices.join(" ")).not.toMatch(/live charge/)

    const incomplete = panel({ payment: { complete: false, orders: [upfront({ obligationState: "PAID", orderState: "ACCEPTED_PAID", receiptRecorded: true })] } })
    expect(incomplete.headline).toBe("Activation records incomplete")
    expect(incomplete.issueUpfront).toBeNull()

    const conflict = panel({}, { recordsConflict: true })
    expect(conflict.issueUpfront).toBeNull()
    expect(conflict.notices.join(" ")).toMatch(/disagree/)
  })

  it("keeps a failed, void, or unpaid obligation from looking settled", () => {
    const failed = panel(
      { payment: { complete: true, orders: [upfront({ obligationState: "FAILED" })] } },
      { moneyOrders: [money({ obligationState: "FAILED" })] },
    )
    expect(failed.headline).toBe("Guided payment needs attention")
    expect(failed.issueUpfront).toBeNull()
    const unpaid = panel(
      { payment: { complete: true, orders: [upfront({ obligationState: "PAID", receiptRecorded: false })] } },
      { moneyOrders: [money({ obligationState: "PAID" })] },
    )
    expect(unpaid.requirements.find(item => item.label === "Receipt recorded")?.state).toBe("Not met")
    expect(unpaid.headline).not.toBe("Guided payment settled")
    const settled = panel({
      payment: { complete: true, orders: [upfront({ obligationState: "PAID", orderState: "ACCEPTED_PAID", receiptRecorded: true })] },
    }, { moneyOrders: [money({ orderState: "ACCEPTED_PAID", obligationState: "PAID", receiptId: "receipt-1" })] })
    expect(settled.headline).toBe("Guided payment settled")
    expect(settled.issueUpfront).toBeNull()
    expect(settled.order?.orderState).toBe("ACCEPTED_PAID")
  })

  it("shows Managed requirements without a saved card or an upfront link", () => {
    const view = panel({
      technicalStage: "AUTHORIZATION_REQUIRED",
      serviceTrack: "MANAGED",
      payment: { complete: true, orders: [upfront({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })] },
      customerActions: [{ id: "action-1", kind: "AGREEMENT_ACCEPTANCE", agreementKind: "SERVICE_AGREEMENT", status: "OPEN", expiresAt: PAST }],
    }, { authorization: managedAuthorization, moneyOrders: [] })
    expect(view.headline).toBe("Managed activation not recorded")
    expect(view.issueUpfront).toBeNull()
    expect(view.authorization).toBe(managedAuthorization)
    expect(view.requirements.find(item => item.label === "Saved card")?.state).toBe("Not required")
    expect(view.requirements.find(item => item.label === "Google manager access")?.state).toBe("Not met")
    expect(view.notices.join(" ")).toMatch(/saved card is not required/i)
    expect(view.notices.join(" ")).toMatch(/expired/)
    expect(view.detail).toMatch(/Nothing is collected now/)
  })

  it("does not treat an unchosen track as either branch", () => {
    const view = panel({ serviceTrack: "UNDECIDED", technicalStage: "SERVICE_SELECTION", commercial: { complete: true, quotes: [] }, payment: { complete: true, orders: [] } })
    expect(view.headline).toBe("Service track not chosen")
    expect(view.requirements).toEqual([])
    expect(view.issueUpfront).toBeNull()
    expect(view.trackNote).toMatch(/does not select it/)
  })
})
