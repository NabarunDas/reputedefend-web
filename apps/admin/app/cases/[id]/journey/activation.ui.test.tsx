// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseAuthorization } from "@/lib/authorization/model"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { buildJourneyActivationPanel } from "@/lib/case-journey/activation"
import { presentCaseJourney } from "@/lib/case-journey/present"
import type { ServiceOrder } from "@/lib/commerce/model"
import type { MoneyOrder } from "@/lib/payments/model"
import { CaseJourneyView } from "./view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const NOW = "2026-10-03T12:00:00.000Z"
const CASE_ID = "55555555-5555-4555-8555-555555555555"
const ORDER_ID = "66666666-6666-4666-8666-666666666666"

const brief = {
  message: "The listing was suspended.",
  reviewUrl: null,
  openedAt: "2026-09-01T00:00:00.000Z",
  submittedAtLabel: null,
  customerName: "Alex",
  email: "alex@example.com",
  phone: null,
  customerId: "11111111-1111-4111-8111-111111111111",
  emailControl: "not_recorded",
  emailSuppressed: null,
  businessName: "Bakery",
  website: null,
  locationName: null,
  country: "United Kingdom",
  profileUrl: null,
  duplicates: [],
  authority: "not_recorded",
  snapshot: null,
  conflicts: [],
} as JourneyIntakeBrief

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
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
    commercial: { complete: true, quotes: [{ id: "quote-1", status: "ACCEPTED", taxBehaviour: "INCLUSIVE", validUntil: "2026-11-01T00:00:00.000Z", actionStatus: null, actionExpiresAt: null, orderId: ORDER_ID }] },
    payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "DUE", setupReady: false, consentRecorded: false, receiptRecorded: false }] },
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
    version: 4,
    obligationId: "77777777-7777-4777-8777-777777777777",
    obligationKind: "UPFRONT",
    obligationState: "DUE",
    setupReady: false,
    consentId: null,
    approvalId: null,
    receiptId: null,
    ...overrides,
  }
}

const authorization = {
  caseId: CASE_ID,
  reference: "PR-1",
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

function loadedOrder(source: CaseFlowFacts): ServiceOrder {
  return {
    id: ORDER_ID,
    publicRef: "SO-100",
    quoteId: "quote-1",
    quoteRef: "Q-1",
    quoteVersionId: "version-1",
    customerName: "Alex",
    businessName: "Bakery",
    caseReference: "PR-1",
    caseId: CASE_ID,
    serviceCode: source.serviceTrack === "MANAGED" ? "MANAGED_RELAUNCH" : "GUIDED_RELAUNCH",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: source.serviceTrack === "MANAGED" ? "SUCCESS_FEE" : "UPFRONT",
    taxBehaviour: "INCLUSIVE",
    taxAmountMinor: 0,
    state: source.payment.orders[0]?.orderState ?? "ACCEPTED_AWAITING_PAYMENT",
    acceptedAt: "2026-05-02T12:00:00.000Z",
  }
}

function show(source: CaseFlowFacts, authorizationRecord: CaseAuthorization | null = null, moneyOrders: MoneyOrder[] = [money()]) {
  const journey = presentCaseJourney(source, NOW)
  const panel = buildJourneyActivationPanel({
    facts: source,
    now: NOW,
    order: source.serviceTrack === "GUIDED" ? loadedOrder(source) : null,
    orderDetailMissing: false,
    moneyOrders,
    authorization: authorizationRecord,
    recordsConflict: false,
  })
  return render(<CaseJourneyView
    reference="PR-1"
    customer="Alex"
    business="Bakery"
    caseId={CASE_ID}
    journey={journey}
    selectedId="SERVICE_ACTIVATION"
    brief={brief}
    version={3}
    documents={null}
    activation={journey.steps.find(step => step.id === "SERVICE_ACTIVATION")?.state === "LOCKED" ? null : panel}
  />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("guided service activation", () => {
  it("keeps a locked step free of payment and Google controls", () => {
    show(facts({ technicalStage: "INITIAL_REVIEW", allowedTransitions: ["ASSESSMENT_READY"], serviceTrack: "UNDECIDED", commercial: { complete: true, quotes: [] }, payment: { complete: true, orders: [] } }))
    expect(document.querySelector("[data-step='SERVICE_ACTIVATION']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Service activation stays closed until the earlier steps are recorded.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Issue upfront payment link" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record Manager access" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Mark as paid|Approve success fee|Submit to Google/i })).toBeNull()
  })

  it("issues the existing upfront link and does not mark the obligation paid", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The secure customer payment action is ready." }) })
    vi.stubGlobal("fetch", fetchMock)
    show(facts())
    expect(document.querySelector("[data-step='SERVICE_ACTIVATION']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getAllByText(/Returning from Checkout is not payment/).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /Mark as paid|Approve success fee|Issue payment-method setup link/i })).toBeNull()
    fireEvent.submit(screen.getByRole("button", { name: "Issue upfront payment link" }).closest("form")!)
    expect(await screen.findByRole("status")).toHaveTextContent(/payment action is ready/)
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("issue_guided_payment_action")
    expect(payload.serviceOrderId).toBe(ORDER_ID)
    expect(payload.version).toBe(4)
    expect(payload).not.toHaveProperty("obligationState")
    expect(document.querySelector("[data-step='SERVICE_ACTIVATION']")).not.toHaveAttribute("data-state", "COMPLETED")
  })

  it("shows Managed authorisation without a saved-card or case-access control", () => {
    show(facts({
      technicalStage: "AUTHORIZATION_REQUIRED",
      serviceTrack: "MANAGED",
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true, receiptRecorded: false }] },
    }), authorization, [money({ serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationId: null, obligationKind: null, obligationState: null, setupReady: true })])
    expect(screen.getAllByText(/A saved card is not required/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Nothing is collected now/)).toBeTruthy()
    expect(screen.getByText("Success fee")).toBeTruthy()
    expect(screen.getByText("Record Manager access verified")).toBeTruthy()
    expect(screen.queryByText("Issue customer case-access link")).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue upfront payment link" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Mark as paid|Submit to Google/i })).toBeNull()
    expect(document.querySelector("input[type=password]")).toBeNull()
    expect(document.querySelector("[data-step='SERVICE_ACTIVATION']")).not.toHaveAttribute("data-state", "COMPLETED")
  })
})
