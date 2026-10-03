import { describe, expect, it } from "vitest"
import { resolveCaseFlow } from "../case-flow/resolve"
import type { CaseFlowFacts, CaseFlowOrderFact, CaseFlowQuoteFact, CaseNextAction } from "../case-flow/model"
import type { PriceVersion, QuoteListItem, ServiceOrder } from "../commerce/model"
import type { MoneyOrder } from "../payments/model"
import { buildCommercialWorkspaceModel, type CommercialWorkspaceModel } from "./model"

const NOW = "2026-10-03T12:00:00.000Z"
const FUTURE = "2026-11-03T12:00:00.000Z"
const PAST = "2026-09-01T12:00:00.000Z"
const CASE_ID = "55555555-5555-4555-8555-555555555555"
const QUOTE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const VERSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const ORDER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const PRICE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

function quoteFact(overrides: Partial<CaseFlowQuoteFact> = {}): CaseFlowQuoteFact {
  return {
    id: QUOTE_ID,
    status: "DRAFT",
    taxBehaviour: "INCLUSIVE",
    validUntil: FUTURE,
    actionStatus: null,
    actionExpiresAt: null,
    orderId: null,
    ...overrides,
  }
}

function orderFact(overrides: Partial<CaseFlowOrderFact> = {}): CaseFlowOrderFact {
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
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "SERVICE_SELECTION",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["PAYMENT_REQUIRED"],
    reopened: false,
    tasks: [],
    submissions: [],
    authorization: {
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
    },
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    ...overrides,
  }
}

function detail(overrides: Partial<QuoteListItem> = {}, version: Partial<QuoteListItem["currentVersion"]> = {}): QuoteListItem {
  return {
    id: QUOTE_ID,
    publicRef: "QT-26-ABCDEF",
    status: "DRAFT",
    version: 3,
    customerId: "11111111-1111-4111-8111-111111111111",
    customerName: "Alex",
    businessName: "Bakery",
    locationName: "High Street",
    caseId: CASE_ID,
    caseReference: "PR-1",
    monitoringRequestId: null,
    acceptedAt: null,
    orderId: null,
    orderRef: null,
    action: null,
    currentVersion: {
      id: VERSION_ID,
      versionNumber: 1,
      status: "DRAFT",
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      paymentModel: "UPFRONT",
      scope: "Prepare the profile recovery pack.",
      exclusions: "Google's decision is not guaranteed.",
      successDefinition: "Payment is a later step.",
      standardAmountMinor: 9900,
      discountPolicyId: "NONE",
      discountBps: 0,
      discountAmountMinor: 0,
      quotedSubtotalMinor: 9900,
      taxBehaviour: "INCLUSIVE",
      taxAmountMinor: 0,
      totalAmountMinor: 9900,
      currency: "GBP",
      validUntil: FUTURE,
      paymentTiming: "The quoted amount is payable later through the payment workflow.",
      offeredAt: null,
      discountSnapshot: null,
      ...version,
    },
    ...overrides,
  }
}

function serviceOrder(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
  return {
    id: ORDER_ID,
    publicRef: "SO-26-ABCDEF",
    quoteId: QUOTE_ID,
    quoteRef: "QT-26-ABCDEF",
    quoteVersionId: VERSION_ID,
    customerName: "Alex",
    businessName: "Bakery",
    caseReference: "PR-1",
    caseId: CASE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    taxBehaviour: "INCLUSIVE",
    taxAmountMinor: 0,
    state: "ACCEPTED_AWAITING_PAYMENT",
    acceptedAt: "2026-10-02T09:00:00.000Z",
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
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    orderState: "ACCEPTED_AWAITING_PAYMENT",
    version: 2,
    obligationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    obligationKind: "UPFRONT",
    obligationState: "DUE",
    setupReady: false,
    consentId: null,
    approvalId: null,
    receiptId: null,
    acceptedEvidence: [],
    ...overrides,
  }
}

function price(overrides: Partial<PriceVersion> = {}): PriceVersion {
  return {
    id: PRICE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    displayName: "Guided Relaunch",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    billingCadence: "ONCE",
    billingUnit: "SERVICE",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    status: "APPROVED",
    taxBehaviour: "INCLUSIVE",
    taxJurisdiction: null,
    taxRateBps: null,
    taxCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    approvedAt: "2026-01-01T00:00:00.000Z",
    retiredAt: null,
    version: 1,
    seedKey: null,
    ...overrides,
  }
}

function modelFor(
  factOverrides: Partial<CaseFlowFacts>,
  extras: {
    quote?: QuoteListItem | null
    quoteDetailMissing?: boolean
    order?: ServiceOrder | null
    orderDetailMissing?: boolean
    money?: MoneyOrder[]
    prices?: PriceVersion[]
    primaryAction?: CaseNextAction | null
  } = {},
): CommercialWorkspaceModel {
  const loaded = facts(factOverrides)
  const flow = resolveCaseFlow(loaded, NOW)
  return buildCommercialWorkspaceModel({
    facts: loaded,
    primaryAction: extras.primaryAction === undefined ? flow.primaryAction : extras.primaryAction,
    now: NOW,
    quote: extras.quote ?? null,
    quoteDetailMissing: extras.quoteDetailMissing,
    order: extras.order ?? null,
    orderDetailMissing: extras.orderDetailMissing,
    money: extras.money ?? [],
    prices: extras.prices ?? [],
  })
}

function stage(model: CommercialWorkspaceModel, id: CommercialWorkspaceModel["journey"][number]["id"]) {
  const found = model.journey.find(item => item.id === id)
  if (!found) throw new Error(id)
  return found
}

describe("commercial workspace model", () => {
  it("shows no quote, and does not ask for a pasted customer id", () => {
    const model = modelFor({}, { prices: [price()] })
    expect(model.quoteHeadline).toBe("No quote")
    expect(stage(model, "quote").toneLabel).toBe("Not started")
    expect(stage(model, "order").detail).toBe("No order expected yet")
    expect(model.commands.createQuote).toBe(true)
    expect(model.commands.offer).toBe(false)
    expect(model.priceChoices[0]?.serviceName).toBe("Guided Relaunch")
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Create the quote" })
    expect(JSON.stringify(model.summary)).not.toContain(CASE_ID)
  })

  it("keeps an unconfigured draft short of offer", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "UNCONFIRMED" })] },
    }, { quote: detail({}, { taxBehaviour: "UNCONFIRMED" }) })
    expect(model.quoteHeadline).toBe("Draft quote — tax treatment is not confirmed")
    expect(stage(model, "quote").toneLabel).toBe("Needs attention")
    expect(model.commands.setTax).toBe(true)
    expect(model.commands.offer).toBe(false)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Finish the quote configuration" })
  })

  it("treats a configured draft as ready to offer", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact()] },
    }, { quote: detail() })
    expect(model.quoteHeadline).toBe("Draft quote — ready to offer")
    expect(stage(model, "quote").toneLabel).toBe("In progress")
    expect(model.commands.offer).toBe(true)
    expect(model.commands.issueAcceptance).toBe(false)
    expect(model.summary.find(row => row.label === "Quoted amount")?.value).toBe("£99.00 GBP")
  })

  it("shows an offered quote with a live acceptance link as waiting", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
    }, {
      quote: detail({ status: "OFFERED", action: { id: "action-1", status: "OPEN", expiresAt: FUTURE, kind: "QUOTE_ACCEPTANCE" } }, { status: "OFFERED" }),
    })
    expect(model.quoteHeadline).toBe("Offered — waiting for the customer")
    expect(stage(model, "acceptance").toneLabel).toBe("In progress")
    expect(stage(model, "acceptance").detail).toContain("Waiting for the customer")
    expect(model.commands.offer).toBe(false)
    expect(model.commands.issueAcceptance).toBe(false)
    expect(model.commands.revokeAcceptance).toBe(true)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Waiting for the customer to accept the quote" })
  })

  it("shows an offered quote whose acceptance link has expired", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", actionStatus: "OPEN", actionExpiresAt: PAST })] },
    }, {
      quote: detail({ status: "OFFERED", action: { id: "action-1", status: "OPEN", expiresAt: PAST, kind: "QUOTE_ACCEPTANCE" } }, { status: "OFFERED" }),
    })
    expect(model.quoteHeadline).toBe("Offered — the acceptance link has expired")
    expect(stage(model, "acceptance").toneLabel).toBe("Needs attention")
    expect(model.commands.issueAcceptance).toBe(true)
    expect(model.commands.revokeAcceptance).toBe(true)
    expect(model.commands.offer).toBe(false)
  })

  it("shows an offered quote with no usable acceptance action", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", actionStatus: "REVOKED" })] },
    }, { quote: detail({ status: "OFFERED" }, { status: "OFFERED" }) })
    expect(model.quoteHeadline).toBe("Offered — the customer has no usable acceptance link")
    expect(model.commands.issueAcceptance).toBe(true)
    expect(model.commands.revokeAcceptance).toBe(false)
    expect(model.commands.offer).toBe(false)
  })

  it("treats a declined quote as terminal", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "DECLINED" })] },
    }, { quote: detail({ status: "DECLINED" }, { status: "DECLINED" }) })
    expect(model.quoteHeadline).toBe("Quote declined")
    expect(stage(model, "acceptance").toneLabel).toBe("Needs attention")
    expect(model.commands.offer).toBe(false)
    expect(model.commands.issueAcceptance).toBe(false)
    expect(model.commands.cancel).toBe(false)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Pick up the declined quote" })
  })

  it("shows the service order created from an accepted quote", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
      payment: { complete: true, orders: [orderFact()] },
    }, {
      quote: detail({ status: "ACCEPTED", acceptedAt: "2026-10-02T09:00:00.000Z", orderId: ORDER_ID, orderRef: "SO-26-ABCDEF" }, { status: "ACCEPTED" }),
      order: serviceOrder(),
      money: [money()],
    })
    expect(model.quoteHeadline).toBe("Quote accepted")
    expect(model.orderHeadline).toBe("Customer accepted the quote — service order created")
    expect(model.summary.find(row => row.label === "Service order")?.value).toBe("SO-26-ABCDEF")
    expect(model.summary.find(row => row.label === "Accepted")?.value).not.toBe("")
    expect(stage(model, "order").toneLabel).toBe("Complete")
    expect(model.commands.offer).toBe(false)
    expect(model.commands.issueAcceptance).toBe(false)
    expect(JSON.stringify(model.summary)).not.toContain(QUOTE_ID)
    expect(model.technical.some(row => row.value === QUOTE_ID)).toBe(true)
  })

  it("fails closed when an accepted quote has no service order", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED" })] },
    }, { quote: detail({ status: "ACCEPTED", acceptedAt: "2026-10-02T09:00:00.000Z" }, { status: "ACCEPTED" }) })
    expect(model.orderHeadline).toBe("The quote is accepted, but the service order is missing")
    expect(stage(model, "order").toneLabel).toBe("Needs attention")
    expect(stage(model, "payment").toneLabel).toBe("Needs attention")
    expect(model.failClosed).toBe(true)
    expect(model.notices.some(notice => notice.startsWith("Commercial records disagree"))).toBe(true)
    expect(model.commands.offer).toBe(false)
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.commands.approveSuccessFee).toBe(false)
  })

  it("describes a Guided payment that is due", () => {
    const model = guided("DUE")
    expect(model.paymentHeadline).toBe("Payment due")
    expect(stage(model, "payment").toneLabel).toBe("In progress")
    expect(model.commands.issueUpfront).toBe(true)
    expect(model.guided?.detail).not.toMatch(/paid/i)
  })

  it("does not treat Guided collection as paid", () => {
    const model = guided("COLLECTING")
    expect(model.paymentHeadline).toBe("Collection processing")
    expect(model.paymentDetail).toMatch(/completed checkout page is not a payment/i)
    expect(model.commands.issueUpfront).toBe(false)
  })

  it("says when Guided payment needs bank authentication", () => {
    const model = guided("AUTHENTICATION_REQUIRED")
    expect(model.paymentHeadline).toBe("Customer needs to complete bank authentication")
    expect(stage(model, "payment").toneLabel).toBe("Needs attention")
    expect(model.paymentHeadline).not.toBe("AUTHENTICATION_REQUIRED")
  })

  it("says when a Guided payment has failed", () => {
    const model = guided("FAILED")
    expect(model.paymentHeadline).toBe("Payment failed")
    expect(model.paymentDetail).toMatch(/nothing has been collected/i)
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.commands.issueRecovery).toBe(false)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Resolve a payment problem" })
  })

  it("shows a Guided payment as paid without a collection control", () => {
    const model = guided("PAID", { receiptRecorded: true })
    expect(model.paymentHeadline).toBe("Paid")
    expect(stage(model, "payment").toneLabel).toBe("Complete")
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.commands.approveSuccessFee).toBe(false)
    expect(model.managed).toBeNull()
  })

  it("keeps Managed consent and a saved payment method apart when consent is missing", () => {
    const model = managed({ consentRecorded: false, setupReady: false })
    expect(model.managed?.rows.find(row => row.label === "Later-charge consent")?.state).toBe("Missing")
    expect(model.managed?.rows.find(row => row.label === "Reusable payment method")?.state).toBe("Missing")
    expect(model.managed?.collectedNow).not.toContain("Payment method saved")
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.caseAction).not.toMatchObject({ label: "Send the payment-setup link" })
    expect(model.commands.approveSuccessFee).toBe(false)
  })

  it("shows Managed consent without treating a missing payment method as ready", () => {
    const model = managed({ consentRecorded: true, setupReady: false })
    expect(model.managed?.rows.find(row => row.label === "Later-charge consent")?.state).toBe("In place")
    expect(model.managed?.rows.find(row => row.label === "Reusable payment method")?.state).toBe("Missing")
    expect(stage(model, "payment").toneLabel).toBe("Needs attention")
    expect(model.managed?.collectedNow).not.toContain("Payment method saved")
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Resolve a payment-setup problem" })
  })

  it("shows Managed setup ready without claiming money was collected", () => {
    const model = managed({ consentRecorded: true, setupReady: true })
    expect(model.paymentHeadline).toBe("Setup ready — nothing collected")
    expect(stage(model, "payment").toneLabel).toBe("Complete")
    expect(model.managed?.collectedNow).toBe("£0 collected now. Payment method saved for the agreed success fee if the qualifying outcome is achieved and approved.")
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.commands.issueUpfront).toBe(false)
  })

  it("shows success-fee approval only once setup is ready and the outcome qualifies", () => {
    const ready = managed({ consentRecorded: true, setupReady: true }, { outcome: "RESTORED" })
    expect(ready.commands.approveSuccessFee).toBe(true)
    expect(ready.managed?.approval).toMatch(/immutable accepted amount/i)
    expect(ready.managed?.approval).toMatch(/does not charge a card/i)
    const waiting = managed({ consentRecorded: false, setupReady: false }, { outcome: "RESTORED" })
    expect(waiting.commands.approveSuccessFee).toBe(false)
    expect(waiting.managed?.approval).toMatch(/not yet chargeable/i)
  })

  it("does not treat a capped commercial list as no quote", () => {
    const model = modelFor({ commercial: { complete: false, quotes: [] } })
    expect(model.quoteHeadline).toBe("Commercial records are incomplete")
    expect(stage(model, "quote").toneLabel).toBe("Unknown — source data is incomplete")
    expect(model.commands.createQuote).toBe(false)
    expect(model.commands.offer).toBe(false)
    expect(model.notices.some(notice => /commercial projection/i.test(notice))).toBe(true)
    expect(model.notices.some(notice => /global quote|capped at 100/i.test(notice))).toBe(false)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Check the commercial position for this case" })
  })

  it("does not treat a capped payment list as unpaid or paid", () => {
    const model = modelFor({
      technicalStage: "PAYMENT_REQUIRED",
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
      payment: { complete: false, orders: [] },
    }, {
      quote: detail({ status: "ACCEPTED", orderId: ORDER_ID, orderRef: "SO-26-ABCDEF" }, { status: "ACCEPTED" }),
    })
    expect(model.paymentHeadline).not.toBe("Paid")
    expect(model.paymentHeadline).not.toBe("Payment due")
    expect(stage(model, "payment").tone).toBe("unknown")
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.notices.some(notice => /payment projection/i.test(notice))).toBe(true)
  })

  it("sends a non-commercial next action out of this workspace, and drops an unsafe href", () => {
    const outside = modelFor({ technicalStage: "INITIAL_REVIEW", serviceTrack: "UNDECIDED" })
    expect(outside.caseAction.kind).toBe("elsewhere")
    if (outside.caseAction.kind === "elsewhere") {
      expect(outside.caseAction.href).toBe(`/cases/${CASE_ID}`)
      expect(outside.caseAction.label).toBe("Review the new case")
    }
    const unsafe = modelFor({}, {
      primaryAction: {
        id: "CREATE_QUOTE",
        label: "Leave the application",
        description: "Do not follow this.",
        owner: "ADMIN",
        state: "ACTION_REQUIRED",
        priorityBand: "JOURNEY",
        dueAt: null,
        overdue: false,
        destination: { kind: "COMMERCIAL", href: "https://evil.example/commercial", label: "External" },
        reasonCodes: [],
      },
    })
    expect(unsafe.caseAction.kind).toBe("elsewhere")
    if (unsafe.caseAction.kind === "elsewhere") expect(unsafe.caseAction.href).toBeNull()
  })

  it("distinguishes superseded, cancelled and expired quotes without offering them", () => {
    for (const status of ["SUPERSEDED", "CANCELLED", "EXPIRED"] as const) {
      const model = modelFor({
        commercial: { complete: true, quotes: [quoteFact({ status })] },
      }, { quote: detail({ status }, { status }) })
      expect(model.quoteHeadline.toLowerCase()).toContain(status === "SUPERSEDED" ? "superseded" : status === "CANCELLED" ? "cancelled" : "expired")
      expect(model.commands.offer).toBe(false)
      expect(stage(model, "acceptance").toneLabel).toBe("Not applicable")
    }
  })

  it("does not collapse a recurring Guard order into an upfront payment", () => {
    const model = modelFor({
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
      payment: { complete: true, orders: [orderFact({ paymentModel: "RECURRING_MONTHLY", orderState: "ACCEPTED_RECURRING", obligationKind: null, obligationState: null })] },
    }, {
      quote: detail({ status: "ACCEPTED", orderId: ORDER_ID }, { serviceCode: "RELAUNCH_GUARD", serviceName: "Relaunch Guard", paymentModel: "RECURRING_MONTHLY", status: "ACCEPTED" }),
      order: serviceOrder({ serviceCode: "RELAUNCH_GUARD", paymentModel: "RECURRING_MONTHLY", state: "ACCEPTED_RECURRING" }),
      money: [money({ serviceCode: "RELAUNCH_GUARD", paymentModel: "RECURRING_MONTHLY", obligationKind: null, obligationState: null })],
    })
    expect(model.guardNote).toMatch(/recurring Guard/i)
    expect(model.guided).toBeNull()
    expect(model.managed).toBeNull()
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.paymentDetail).not.toMatch(/£0 collected now/)
  })

  it("flags a payment model that does not match the service", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
      payment: { complete: true, orders: [orderFact({ paymentModel: "SUCCESS_FEE", obligationKind: null, obligationState: null })] },
    }, {
      quote: detail({ status: "ACCEPTED", orderId: ORDER_ID }, { status: "ACCEPTED", paymentModel: "UPFRONT" }),
      order: serviceOrder({ paymentModel: "SUCCESS_FEE" }),
      money: [money({ paymentModel: "SUCCESS_FEE", obligationKind: null, obligationState: null })],
    })
    expect(model.failClosed).toBe(true)
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.commands.approveSuccessFee).toBe(false)
  })

  it("does not offer success-fee approval before a qualifying outcome", () => {
    const none = managed({ consentRecorded: true, setupReady: true })
    expect(none.commands.approveSuccessFee).toBe(false)
    expect(none.managed?.approval).toMatch(/No success fee is due yet/i)
    expect(none.managed?.approval).toMatch(/restoration/i)
    expect(none.managed?.approval).toMatch(/removal/i)
    expect(none.managed?.approval).not.toMatch(/has been restored|has been removed/i)

    const partial = managed({ consentRecorded: true, setupReady: true }, { outcome: "PARTIALLY_RESTORED" })
    expect(partial.commands.approveSuccessFee).toBe(false)
    const notRestored = managed({ consentRecorded: true, setupReady: true }, { outcome: "NOT_RESTORED" })
    expect(notRestored.commands.approveSuccessFee).toBe(false)

    const restored = managed({ consentRecorded: true, setupReady: true }, { outcome: "RESTORED" })
    expect(restored.commands.approveSuccessFee).toBe(true)

    const removed = managed({ consentRecorded: true, setupReady: true }, { outcome: "REMOVED", caseType: "REVIEW_PROTECTION", serviceCode: "MANAGED_REVIEW" })
    expect(removed.commands.approveSuccessFee).toBe(true)
    const recommended = managed({ consentRecorded: true, setupReady: true }, { outcome: "RESPONSE_RECOMMENDED", caseType: "REVIEW_PROTECTION", serviceCode: "MANAGED_REVIEW" })
    expect(recommended.commands.approveSuccessFee).toBe(false)
    const restoredReview = managed({ consentRecorded: true, setupReady: true }, { outcome: "RESTORED", caseType: "REVIEW_PROTECTION", serviceCode: "MANAGED_REVIEW" })
    expect(restoredReview.commands.approveSuccessFee).toBe(false)

    const already = managed({ consentRecorded: true, setupReady: true }, { outcome: "RESTORED", approvalId: "approval-1" })
    expect(already.commands.approveSuccessFee).toBe(false)
    expect(already.managed?.approval).toMatch(/not a collection/i)
  })

  it("does not offer quote creation while the case still needs a service track", () => {
    const model = modelFor({ technicalStage: "SERVICE_SELECTION", serviceTrack: "UNDECIDED" }, { prices: [price()] })
    expect(model.caseAction).toMatchObject({ label: "Choose the service track" })
    expect(model.commands.createQuote).toBe(false)
    expect(model.priceChoices).toHaveLength(0)
    expect(model.guardDiscount).toBeNull()
  })

  it("does not issue Managed setup while authorisation is still incomplete", () => {
    const model = modelFor({
      serviceTrack: "MANAGED",
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: {
        membershipStatus: "pending",
        customerEmailVerified: false,
        businessAuthorityVerified: false,
        serviceAgreementAccepted: false,
        caseManagementPermissionActive: false,
        managerAccessVerified: false,
        authorizationReady: false,
        reviewRequired: [],
        agreementKinds: [],
        hasLocation: true,
      },
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
      payment: { complete: true, orders: [orderFact({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })] },
    }, {
      quote: detail({ status: "ACCEPTED", orderId: ORDER_ID }, { status: "ACCEPTED", serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE" }),
      order: serviceOrder({ serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE" }),
      money: [money({ paymentModel: "SUCCESS_FEE", obligationKind: null, obligationState: null })],
    })
    expect(model.caseAction).toMatchObject({ label: "Verify the customer's email address" })
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.commands.issueRecovery).toBe(false)
  })

  it("waits on an active Managed setup link and does not offer another", () => {
    const model = managedSetup("OPEN", FUTURE)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Waiting for the customer to save a payment method" })
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.paymentDetail).toMatch(/open until/i)
    expect(model.paymentDetail).toContain("2026")
  })

  it("returns an expired Managed setup link to issuing another", () => {
    const model = managedSetup("OPEN", PAST)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Send the payment-setup link" })
    expect(model.commands.issueManagedSetup).toBe(true)
    expect(model.paymentDetail).toMatch(/expired/i)
    expect(model.caseAction.kind === "here" ? model.caseAction.description : "").not.toMatch(/waiting/i)
  })

  it("waits on an active Guided payment link and does not offer another", () => {
    const model = guidedLink("GUIDED_PAYMENT", FUTURE)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Waiting for the upfront payment" })
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.commands.issueRecovery).toBe(false)
    expect(model.paymentDetail).toMatch(/open until/i)
  })

  it("returns an expired Guided payment link to sending another", () => {
    const model = guidedLink("GUIDED_PAYMENT", PAST)
    expect(model.caseAction).toMatchObject({ kind: "here", label: "Send the payment link" })
    expect(model.commands.issueUpfront).toBe(true)
    expect(model.paymentDetail).toMatch(/expired/i)
  })

  it("returns an expired Guided recovery link to sending the upfront payment", () => {
    const model = guidedLink("PAYMENT_RECOVERY", PAST)
    expect(model.caseAction).toMatchObject({ label: "Send the payment link" })
    expect(model.commands.issueUpfront).toBe(true)
    expect(model.commands.issueRecovery).toBe(false)
  })

  it("does not enable payment or setup issuance when payments are switched off", () => {
    const guidedOff = modelFor({
      technicalStage: "PAYMENT_REQUIRED",
      capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
      payment: { complete: true, orders: [orderFact()] },
    }, {
      quote: detail({ status: "ACCEPTED", orderId: ORDER_ID }, { status: "ACCEPTED" }),
      order: serviceOrder(),
      money: [money()],
    })
    expect(guidedOff.caseAction).toMatchObject({ kind: "here", label: "Send the payment link" })
    if (guidedOff.caseAction.kind === "here") expect(guidedOff.caseAction.description).toMatch(/switched off/i)
    expect(guidedOff.commands.issueUpfront).toBe(false)
    expect(guidedOff.commands.issueManagedSetup).toBe(false)
    expect(guidedOff.commands.issueRecovery).toBe(false)

    const managedOff = managedSetup("NONE", null, false)
    expect(managedOff.commands.issueManagedSetup).toBe(false)
    expect(managedOff.commands.issueUpfront).toBe(false)
    expect(managedOff.commands.issueRecovery).toBe(false)
    if (managedOff.caseAction.kind === "here") expect(managedOff.caseAction.description).toMatch(/switched off/i)
  })

  it("does not issue acceptance while the customer email is unverified", () => {
    const model = offered({ customerEmailVerified: false, businessAuthorityVerified: true })
    expect(model.caseAction).toMatchObject({ label: "Verify the customer's email address" })
    expect(model.commands.issueAcceptance).toBe(false)
  })

  it("does not issue acceptance while business authority is unverified", () => {
    const model = offered({ customerEmailVerified: true, businessAuthorityVerified: false })
    expect(model.caseAction).toMatchObject({ label: "Verify the customer's authority over the business" })
    expect(model.commands.issueAcceptance).toBe(false)
  })

  it("uses the exact quote it was given and does not substitute another", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact()] },
    }, { quote: detail() })
    expect(model.summary.some(row => row.value.includes("QT-26-ABCDEF"))).toBe(true)
    expect(model.failClosed).toBe(false)
    expect(model.quoteContext?.quoteId).toBe(QUOTE_ID)
  })

  it("fails closed when the named quote cannot be loaded", () => {
    const model = modelFor({
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED" })] },
    }, {
      quote: detail({ id: "99999999-9999-4999-8999-999999999999", publicRef: "QT-OTHER", status: "OFFERED" }, { status: "OFFERED" }),
      quoteDetailMissing: true,
    })
    expect(model.failClosed).toBe(true)
    expect(model.quoteHeadline).not.toBe("No quote")
    expect(model.notices.some(notice => /could not be loaded/i.test(notice))).toBe(true)
    expect(JSON.stringify(model.summary)).not.toContain("QT-OTHER")
    expect(model.commands.issueAcceptance).toBe(false)
    expect(model.commands.offer).toBe(false)
    expect(model.commands.createQuote).toBe(false)
    expect(model.quoteContext).toBeNull()
  })

  it("fails closed when the loaded order is not the order the case names", () => {
    const other = "ffffffff-ffff-4fff-8fff-ffffffffffff"
    const model = modelFor({
      technicalStage: "PAYMENT_REQUIRED",
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
      payment: { complete: true, orders: [orderFact()] },
    }, {
      quote: detail({ status: "ACCEPTED", orderId: other }, { status: "ACCEPTED" }),
      order: serviceOrder({ id: other }),
      orderDetailMissing: true,
      money: [money({ orderId: other })],
    })
    expect(model.failClosed).toBe(true)
    expect(model.notices.some(notice => /different service order|not the order this case names|does not belong/i.test(notice))).toBe(true)
    expect(model.commands.issueUpfront).toBe(false)
    expect(model.commands.issueManagedSetup).toBe(false)
    expect(model.orderContext).toBeNull()
  })

  it("says a Managed quote form does not apply the Guard discount", () => {
    const model = modelFor({
      serviceTrack: "MANAGED",
      caseType: "PROFILE_RECOVERY",
      technicalStage: "AUTHORIZATION_REQUIRED",
      authorization: authorised(),
      commercial: { complete: true, quotes: [] },
      payment: { complete: true, orders: [] },
    }, {
      prices: [price({ serviceCode: "MANAGED_RELAUNCH", displayName: "Managed Relaunch", paymentModel: "SUCCESS_FEE" })],
    })
    expect(model.commands.createQuote).toBe(true)
    expect(model.guardDiscount?.href).toBe("/commercial?tab=quotes")
    expect(model.guardDiscount?.message).toMatch(/does not apply a discount/i)
    expect(model.guardDiscount?.message).toMatch(/Paid Direct Guard/i)
    expect(model.guardDiscount?.message).not.toMatch(/qualifies|eligible/i)
  })
})

function guided(obligationState: string, orderOverrides: Partial<CaseFlowOrderFact> = {}): CommercialWorkspaceModel {
  return modelFor({
    technicalStage: "PAYMENT_REQUIRED",
    commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
    payment: { complete: true, orders: [orderFact({ obligationState, ...orderOverrides })] },
  }, {
    quote: detail({ status: "ACCEPTED", acceptedAt: "2026-10-02T09:00:00.000Z", orderId: ORDER_ID, orderRef: "SO-26-ABCDEF" }, { status: "ACCEPTED" }),
    order: serviceOrder(),
    money: [money({ obligationState, receiptId: orderOverrides.receiptRecorded ? "receipt-1" : null })],
  })
}

function managed(
  flags: { consentRecorded: boolean; setupReady: boolean },
  options: { outcome?: string | null; caseType?: string; serviceCode?: string; approvalId?: string | null } = {},
): CommercialWorkspaceModel {
  const serviceCode = options.serviceCode ?? "MANAGED_RELAUNCH"
  return modelFor({
    serviceTrack: "MANAGED",
    caseType: options.caseType ?? "PROFILE_RECOVERY",
    outcome: options.outcome ?? null,
    technicalStage: "AUTHORIZATION_REQUIRED",
    commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
    payment: {
      complete: true,
      orders: [orderFact({
        paymentModel: "SUCCESS_FEE",
        orderState: "ACCEPTED_SUCCESS_FEE",
        obligationKind: null,
        obligationState: null,
        ...flags,
      })],
    },
  }, {
    quote: detail({ status: "ACCEPTED", orderId: ORDER_ID, orderRef: "SO-26-ABCDEF" }, { status: "ACCEPTED", serviceCode, serviceName: serviceCode === "MANAGED_REVIEW" ? "Managed Review" : "Managed Relaunch", paymentModel: "SUCCESS_FEE" }),
    order: serviceOrder({ serviceCode, paymentModel: "SUCCESS_FEE", state: "ACCEPTED_SUCCESS_FEE" }),
    money: [money({
      serviceCode,
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationKind: null,
      obligationState: null,
      setupReady: flags.setupReady,
      consentId: flags.consentRecorded ? "consent-1" : null,
      approvalId: options.approvalId ?? null,
      acceptedEvidence: [{ id: "99999999-9999-4999-8999-999999999999", filename: "outcome.png", versionNumber: 1 }],
    })],
  })
}

function authorised(): CaseFlowFacts["authorization"] {
  return {
    membershipStatus: "verified",
    customerEmailVerified: true,
    businessAuthorityVerified: true,
    serviceAgreementAccepted: true,
    caseManagementPermissionActive: true,
    managerAccessVerified: true,
    authorizationReady: true,
    reviewRequired: [],
    agreementKinds: ["SERVICE_AGREEMENT", "CASE_MANAGEMENT_PERMISSION"],
    hasLocation: true,
  }
}

function offered(auth: { customerEmailVerified: boolean; businessAuthorityVerified: boolean }): CommercialWorkspaceModel {
  return modelFor({
    authorization: { ...facts().authorization, ...auth },
    commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", actionStatus: null })] },
  }, { quote: detail({ status: "OFFERED" }, { status: "OFFERED" }) })
}

function guidedLink(kind: string, expiresAt: string): CommercialWorkspaceModel {
  return modelFor({
    technicalStage: "PAYMENT_REQUIRED",
    commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
    payment: { complete: true, orders: [orderFact()] },
    customerActions: [{ id: "pay-1", kind, agreementKind: null, status: "OPEN", expiresAt }],
  }, {
    quote: detail({ status: "ACCEPTED", orderId: ORDER_ID }, { status: "ACCEPTED" }),
    order: serviceOrder(),
    money: [money()],
  })
}

function managedSetup(status: "OPEN" | "NONE", expiresAt: string | null, paymentsEnabled = true): CommercialWorkspaceModel {
  return modelFor({
    serviceTrack: "MANAGED",
    technicalStage: "AUTHORIZATION_REQUIRED",
    authorization: authorised(),
    capabilities: { liveMailEnabled: false, paymentsEnabled, googleSubmissionLive: false },
    commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", orderId: ORDER_ID })] },
    payment: {
      complete: true,
      orders: [orderFact({ paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null })],
    },
    customerActions: status === "OPEN" && expiresAt
      ? [{ id: "setup-1", kind: "MANAGED_PAYMENT_SETUP", agreementKind: null, status: "OPEN", expiresAt }]
      : [],
  }, {
    quote: detail({ status: "ACCEPTED", orderId: ORDER_ID }, { status: "ACCEPTED", serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE" }),
    order: serviceOrder({ serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", state: "ACCEPTED_SUCCESS_FEE" }),
    money: [money({ serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", obligationKind: null, obligationState: null })],
  })
}
