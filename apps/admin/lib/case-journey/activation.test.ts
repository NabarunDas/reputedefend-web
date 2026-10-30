import { describe, expect, it } from "vitest"
import type { CaseAuthorization } from "../authorization/model"
import type { CaseFlowAuthorizationFact, CaseFlowFacts, CaseFlowOrderFact, CaseFlowQuoteFact } from "../case-flow/model"
import type { ServiceOrder } from "../commerce/model"
import type { MoneyOrder } from "../payments/model"
import { resolveCaseFlow } from "../case-flow/resolve"
import { buildJourneyActivationPanel } from "./activation"

const NOW = "2026-06-01T12:00:00.000Z"
const FUTURE = "2026-07-01T12:00:00.000Z"
const PAST = "2026-05-01T12:00:00.000Z"
const ORDER_ID = "55555555-5555-4555-8555-555555555555"
const OTHER_ORDER_ID = "99999999-9999-4999-8999-999999999999"
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

function serviceOrder(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: ORDER_ID,
    publicRef: "SO-100",
    quoteId: "quote-1",
    quoteRef: "Q-1",
    quoteVersionId: "version-1",
    customerName: "Alex",
    businessName: "Bakery",
    caseReference: "CASE-0001",
    caseId: CASE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    taxBehaviour: "INCLUSIVE",
    taxAmountMinor: 0,
    state: "ACCEPTED_AWAITING_PAYMENT",
    acceptedAt: "2026-05-02T12:00:00.000Z",
    ...overrides,
  }
}

function panel(
  overrides: Partial<CaseFlowFacts> = {},
  extra: { recordsConflict?: boolean; moneyOrders?: MoneyOrder[]; authorization?: CaseAuthorization | null; order?: ServiceOrder | null; orderDetailMissing?: boolean; mailReady?: boolean } = {},
) {
  const source = facts(overrides)
  return buildJourneyActivationPanel({
    facts: source,
    now: NOW,
    order: extra.order === undefined ? (source.serviceTrack === "GUIDED" ? serviceOrder() : null) : extra.order,
    orderDetailMissing: extra.orderDetailMissing ?? false,
    moneyOrders: extra.moneyOrders ?? [money()],
    authorization: extra.authorization ?? null,
    recordsConflict: extra.recordsConflict ?? false,
    mailReady: extra.mailReady,
  })
}

function openPayment(expiresAt = FUTURE) {
  return { id: "action-pay", kind: "GUIDED_PAYMENT", agreementKind: null, status: "OPEN", expiresAt }
}

describe("accepted order reconciliation", () => {
  it("offers one Continue action for an accepted Guided order while the stored track is undecided", () => {
    const view = panel({
      technicalStage: "INITIAL_REVIEW",
      serviceTrack: "UNDECIDED",
      caseStatus: "RECEIVED",
      allowedTransitions: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"],
    }, { order: serviceOrder() })
    expect(view.continueToPayment).toEqual({
      label: "Continue to Guided Payment",
      headline: "Guided Relaunch — accepted; £99 payment outstanding",
    })
    expect(view.headline).toBe("Guided Relaunch — accepted; £99 payment outstanding")
    expect(view.issueUpfront).toBeNull()
    expect(view.who).toMatch(/already chosen/)
    expect(view.who).not.toMatch(/still have to choose/)
    expect(view.trackNote).toMatch(/not chosen/)
    expect(view.detail).toMatch(/does not send email/)
  })

  it("uses the Guided Review amount and does not infer the service from £99", () => {
    const review = panel({
      technicalStage: "INITIAL_REVIEW",
      serviceTrack: "UNDECIDED",
      allowedTransitions: ["ASSESSMENT_READY"],
    }, {
      order: serviceOrder({ serviceCode: "GUIDED_REVIEW", amountMinor: 5900 }),
      moneyOrders: [money({ serviceCode: "GUIDED_REVIEW", amountMinor: 5900 })],
    })
    expect(review.headline).toBe("Guided Review — accepted; £59 payment outstanding")
    expect(review.continueToPayment?.label).toBe("Continue to Guided Payment")
    const pricedAsGuided = panel({
      technicalStage: "INITIAL_REVIEW",
      serviceTrack: "UNDECIDED",
      allowedTransitions: ["ASSESSMENT_READY"],
    }, {
      order: serviceOrder({ serviceCode: "GUIDED_REVIEW", amountMinor: 9900 }),
      moneyOrders: [money({ serviceCode: "MANAGED_RELAUNCH", amountMinor: 9900, paymentModel: "SUCCESS_FEE" })],
    })
    expect(pricedAsGuided.continueToPayment).toBeNull()
    expect(pricedAsGuided.issueUpfront).toBeNull()
  })

  it("continues a Managed order without an upfront payment link", () => {
    const view = panel({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "UNDECIDED",
      allowedTransitions: ["PAYMENT_REQUIRED", "AUTHORIZATION_REQUIRED"],
      payment: { complete: true, orders: [upfront({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })] },
    }, {
      order: serviceOrder({ serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", state: "ACCEPTED_SUCCESS_FEE" }),
      moneyOrders: [money({ serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, amountMinor: 9900 })],
    })
    expect(view.continueToPayment?.label).toBe("Continue to Managed authorisation")
    expect(view.headline).toBe("Managed Relaunch — accepted; no upfront payment")
    expect(view.issueUpfront).toBeNull()
  })
})

describe("guided service activation", () => {
  it("offers the existing upfront link only when collection is already the next action", () => {
    const view = panel()
    expect(view.track).toBe("GUIDED")
    expect(view.headline).toBe("Guided payment outstanding")
    expect(view.issueUpfront).toEqual({ serviceOrderId: ORDER_ID, version: 3 })
    expect(view.paymentRequest).toBeNull()
    expect(view.paymentRequestStatus).toBe(true)
    expect(view.notices.join(" ")).toMatch(/monitored Reply-To/)
    expect(view.notices.join(" ")).not.toMatch(/No open payment action is available to reuse/)
    const ready = panel({}, { mailReady: true })
    expect(ready.paymentRequest).toEqual({ serviceOrderId: ORDER_ID, version: 3 })
    expect(ready.paymentRequestStatus).toBe(true)
    expect(view.continueToPayment).toBeNull()
    expect(view.requirements.find(item => item.label === "Upfront obligation PAID")?.state).toBe("Not met")
    expect(view.detail).toMatch(/not the selected track/)
    expect(view.authorization).toBeNull()
  })

  it("offers the payment-request email for an open action while the case flow waits for payment", () => {
    const source = {
      customerActions: [openPayment()],
    }
    const view = panel(source, { mailReady: true })
    expect(resolveCaseFlow(facts(source), NOW).primaryAction?.id).toBe("WAIT_FOR_UPFRONT_PAYMENT")
    expect(view.issueUpfront).toBeNull()
    expect(view.paymentRequest).toEqual({ serviceOrderId: ORDER_ID, version: 3 })
    expect(view.paymentRequestStatus).toBe(true)
    expect(view.notices.join(" ")).not.toMatch(/not sent from here/)

    const withheld = panel(source)
    expect(withheld.paymentRequest).toBeNull()
    expect(withheld.paymentRequestStatus).toBe(true)
    expect(withheld.notices.join(" ")).toMatch(/monitored Reply-To/)

    const expired = panel({ customerActions: [openPayment(PAST)] }, { mailReady: true })
    expect(expired.paymentRequest).toBeNull()
    expect(expired.paymentRequestStatus).toBe(false)
    expect(expired.notices.join(" ")).toMatch(/expired, so this step does not send/)

    const paid = panel({
      customerActions: [openPayment()],
      payment: { complete: true, orders: [upfront({ obligationState: "PAID", receiptRecorded: true })] },
    }, { mailReady: true, moneyOrders: [money({ obligationState: "PAID", receiptId: "receipt-1" })] })
    expect(paid.paymentRequest).toBeNull()

    const foreign = panel({
      customerActions: [openPayment()],
      commercial: { complete: true, quotes: [quote({ orderId: OTHER_ORDER_ID })] },
    }, { mailReady: true })
    expect(foreign.paymentRequest).toBeNull()

    const several = panel({
      customerActions: [openPayment(), { ...openPayment(), id: "action-pay-2" }],
    }, { mailReady: true })
    expect(several.paymentRequest).toBeNull()
    expect(several.notices.join(" ")).toMatch(/More than one payment action is open/)

    const unverified = panel({
      customerActions: [openPayment()],
      authorization: authorization({ customerEmailVerified: false }),
    }, { mailReady: true })
    expect(unverified.paymentRequest).toBeNull()
    expect(unverified.paymentRequestStatus).toBe(false)

    const unauthorised = panel({
      customerActions: [openPayment()],
      authorization: authorization({ businessAuthorityVerified: false }),
    }, { mailReady: true })
    expect(unauthorised.paymentRequest).toBeNull()
  })

  it("does not start a payment when collection is switched off, the list is incomplete, or the records disagree", () => {
    const disabled = panel({ capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false } })
    expect(disabled.issueUpfront).toBeNull()
    expect(disabled.notices.join(" ")).toMatch(/switched off/)
    expect(disabled.notices.join(" ")).not.toMatch(/live charge/)

    const incomplete = panel({ payment: { complete: false, orders: [upfront({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT", receiptRecorded: true })] } })
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
      payment: { complete: true, orders: [upfront({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT", receiptRecorded: true })] },
    }, { moneyOrders: [money({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "PAID", receiptId: "receipt-1" })] })
    expect(settled.headline).toBe("Guided payment settled")
    expect(settled.issueUpfront).toBeNull()
    expect(settled.order?.orderState).toBe("ACCEPTED_AWAITING_PAYMENT")
    expect(settled.requirements.find(item => item.label === "Accepted upfront order")?.state).toBe("Met")
    const synthetic = panel({
      payment: { complete: true, orders: [upfront({ obligationState: "PAID", orderState: "ACCEPTED_PAID", receiptRecorded: true })] },
    }, { moneyOrders: [money({ orderState: "ACCEPTED_PAID", obligationState: "PAID", receiptId: "receipt-1" })] })
    expect(synthetic.headline).not.toBe("Guided payment settled")
    expect(synthetic.requirements.find(item => item.label === "Accepted upfront order")?.state).toBe("Not met")
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

  it("does not activate or issue a link when the accepted quote names a different order", () => {
    const mismatched = panel({
      commercial: { complete: true, quotes: [quote({ orderId: OTHER_ORDER_ID })] },
      payment: { complete: true, orders: [upfront({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT", receiptRecorded: true })] },
    }, { moneyOrders: [money({ orderState: "ACCEPTED_AWAITING_PAYMENT", obligationState: "PAID", receiptId: "receipt-1" })] })
    expect(mismatched.headline).toBe("Activation records disagree")
    expect(mismatched.issueUpfront).toBeNull()
    expect(mismatched.who).toMatch(/reconciles the quote and the service order/)
    expect(mismatched.notices.join(" ")).toMatch(/do not refer to the same order/)
    expect(mismatched.requirements.find(item => item.label === "Upfront obligation PAID")?.state).toBe("Not met")

    const missingQuoteOrder = panel({
      commercial: { complete: true, quotes: [quote({ orderId: null })] },
      payment: { complete: true, orders: [upfront({ obligationState: "PAID", orderState: "ACCEPTED_AWAITING_PAYMENT", receiptRecorded: true })] },
    })
    expect(missingQuoteOrder.headline).toBe("Activation records disagree")
    expect(missingQuoteOrder.issueUpfront).toBeNull()

    const several = panel({
      payment: { complete: true, orders: [upfront(), upfront({ orderId: OTHER_ORDER_ID })] },
    })
    expect(several.headline).toBe("Activation records disagree")
    expect(several.issueUpfront).toBeNull()
    expect(several.notices.join(" ")).toMatch(/More than one upfront order/)
  })

  it("issues a payment link only for the order named by the accepted quote", () => {
    const matching = panel({}, {
      moneyOrders: [money({ orderId: OTHER_ORDER_ID, version: 9 }), money({ version: 4 })],
    })
    expect(matching.issueUpfront).toEqual({ serviceOrderId: ORDER_ID, version: 4 })
    expect(matching.issueUpfront?.serviceOrderId).not.toBe(OTHER_ORDER_ID)

    const missingDetail = panel({}, { order: null })
    expect(missingDetail.issueUpfront).toBeNull()
    expect(missingDetail.notices.join(" ")).toMatch(/order detail is missing/)

    const otherCustomer = panel({}, { moneyOrders: [money({ customerId: "00000000-0000-4000-8000-000000000000" })] })
    expect(otherCustomer.issueUpfront).toBeNull()
    expect(otherCustomer.notices.join(" ")).toMatch(/records disagree/)

    const otherCase = panel({}, { order: serviceOrder({ caseId: null }) })
    expect(otherCase.issueUpfront).toBeNull()
    expect(otherCase.notices.join(" ")).toMatch(/does not match the accepted quote/)

    const otherModel = panel({}, { order: serviceOrder({ paymentModel: "SUCCESS_FEE" }) })
    expect(otherModel.issueUpfront).toBeNull()
  })

  it("does not treat a Managed order as activated when it is not the accepted quote's order", () => {
    const source = {
      technicalStage: "AUTHORIZATION_REQUIRED" as const,
      serviceTrack: "MANAGED" as const,
      authorization: authorization({
        businessAuthorityVerified: true,
        serviceAgreementAccepted: true,
        caseManagementPermissionActive: true,
        managerAccessVerified: true,
        authorizationReady: true,
      }),
      payment: { complete: true, orders: [upfront({ paymentModel: "SUCCESS_FEE" as const, orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })] },
    }
    const mismatched = panel({
      ...source,
      commercial: { complete: true, quotes: [quote({ orderId: OTHER_ORDER_ID })] },
    }, { authorization: managedAuthorization, moneyOrders: [] })
    expect(mismatched.headline).toBe("Activation records disagree")
    expect(mismatched.issueUpfront).toBeNull()
    expect(mismatched.requirements.find(item => item.label === "Accepted success-fee order")?.state).toBe("Not met")

    const missing = panel({
      ...source,
      commercial: { complete: true, quotes: [quote({ orderId: null })] },
    }, { authorization: managedAuthorization, moneyOrders: [] })
    expect(missing.headline).toBe("Activation records disagree")
    expect(missing.issueUpfront).toBeNull()

    const several = panel({
      ...source,
      payment: { complete: true, orders: [
        upfront({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null }),
        upfront({ orderId: OTHER_ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null }),
      ] },
    }, { authorization: managedAuthorization, moneyOrders: [] })
    expect(several.headline).toBe("Activation records disagree")
    expect(several.notices.join(" ")).toMatch(/More than one success-fee order/)
  })

  it("does not treat an unchosen track as either branch", () => {
    const view = panel({ serviceTrack: "UNDECIDED", technicalStage: "SERVICE_SELECTION", commercial: { complete: true, quotes: [] }, payment: { complete: true, orders: [] } })
    expect(view.headline).toBe("Service track not chosen")
    expect(view.requirements).toEqual([])
    expect(view.issueUpfront).toBeNull()
    expect(view.trackNote).toMatch(/does not select it/)
  })
})
