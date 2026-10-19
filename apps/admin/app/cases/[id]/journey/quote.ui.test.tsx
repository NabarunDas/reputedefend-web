// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts, CaseFlowQuoteFact } from "@/lib/case-flow/model"
import type { PriceVersion, QuoteListItem } from "@/lib/commerce/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { presentCaseJourney } from "@/lib/case-journey/present"
import { buildJourneyQuotePanel } from "@/lib/case-journey/quote"
import { CaseJourneyView } from "./view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const NOW = "2026-10-03T12:00:00.000Z"
const FUTURE = "2026-11-03T12:00:00.000Z"
const CASE_ID = "55555555-5555-4555-8555-555555555555"
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111"
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222"
const LOCATION_ID = "33333333-3333-4333-8333-333333333333"
const QUOTE_ID = "44444444-4444-4444-8444-444444444444"
const VERSION_ID = "66666666-6666-4666-8666-666666666666"
const PRICE_ID = "77777777-7777-4777-8777-777777777777"

const brief = {
  message: "The listing was suspended.",
  reviewUrl: null,
  openedAt: "2026-09-01T00:00:00.000Z",
  submittedAtLabel: null,
  customerName: "Alex",
  email: "alex@example.com",
  phone: null,
  customerId: CUSTOMER_ID,
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

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "SERVICE_SELECTION",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "UNDECIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    locationId: LOCATION_ID,
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["AUTHORIZATION_REQUIRED", "PAYMENT_REQUIRED"],
    reopened: false,
    tasks: [],
    submissions: [],
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
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    ...overrides,
  }
}

function price(): PriceVersion {
  return {
    id: PRICE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    displayName: "Guided Relaunch",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    billingCadence: "ONCE",
    billingUnit: "CASE",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveTo: null,
    status: "APPROVED",
    taxBehaviour: "INCLUSIVE",
    taxJurisdiction: null,
    taxRateBps: null,
    taxCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    approvedAt: "2026-01-02T00:00:00.000Z",
    retiredAt: null,
    version: 1,
    seedKey: null,
  }
}

function quoteItem(status = "DRAFT"): QuoteListItem {
  return {
    id: QUOTE_ID,
    publicRef: "Q-100",
    status,
    version: 2,
    customerId: CUSTOMER_ID,
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
      status,
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      paymentModel: "UPFRONT",
      scope: "Recover the suspended profile.",
      exclusions: "No Google submission from this quote.",
      successDefinition: "The listing is restored.",
      standardAmountMinor: 9900,
      discountPolicyId: "",
      discountBps: 0,
      discountAmountMinor: 0,
      quotedSubtotalMinor: 9900,
      taxBehaviour: "INCLUSIVE",
      taxAmountMinor: 0,
      totalAmountMinor: 9900,
      currency: "GBP",
      validUntil: FUTURE,
      paymentTiming: "UPFRONT",
      offeredAt: null,
      discountSnapshot: null,
    },
  }
}

function show(source: CaseFlowFacts, quote: QuoteListItem | null) {
  const journey = presentCaseJourney(source, NOW, [], {
    assessment: { phase: "approved", pathway: "GUIDED", versionNumber: 1 },
  })
  const panel = buildJourneyQuotePanel({
    facts: source,
    now: NOW,
    assessment: { phase: "approved", pathway: "GUIDED", versionNumber: 1 },
    prices: [price()],
    quote,
    quoteDetailMissing: false,
  })
  return render(<CaseJourneyView
    reference="PR-1"
    customer="Alex"
    business="Bakery"
    caseId={CASE_ID}
    customerId={CUSTOMER_ID}
    businessId={BUSINESS_ID}
    locationId={LOCATION_ID}
    journey={journey}
    selectedId="QUOTE_ACCEPTANCE"
    brief={brief}
    version={3}
    documents={null}
    quote={journey.steps.find(step => step.id === "QUOTE_ACCEPTANCE")?.state === "LOCKED" ? null : panel}
  />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("guided quote acceptance", () => {
  it("keeps a locked step free of quote, payment and activation controls", () => {
    const source = facts({ technicalStage: "INITIAL_REVIEW", allowedTransitions: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"] })
    show(source, null)
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Quote and acceptance stay closed until the earlier steps are recorded.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Create draft quote" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Offer quote" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Activate|Pay|Stripe|Choose the service track/i })).toBeNull()
  })

  it("drafts through the existing quote command and does not write the service track", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The quote record has been updated. This does not take payment." }) })
    vi.stubGlobal("fetch", fetchMock)
    show(facts(), null)
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getAllByText(/not the customer's agreement/).length).toBeGreaterThan(0)
    expect(screen.getByText("Service: Not chosen")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Offer quote" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Activate|Pay|Stripe|Choose the service track/i })).toBeNull()
    fireEvent.submit(screen.getByRole("button", { name: "Create draft quote" }).closest("form")!)
    expect(await screen.findByRole("status")).toHaveTextContent(/does not take payment/)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/quotes")
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("create_draft")
    expect(payload.serviceCode).toBe("GUIDED_RELAUNCH")
    expect(payload).not.toHaveProperty("serviceTrack")
    expect(payload).not.toHaveProperty("applyDiscount")
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).not.toHaveAttribute("data-state", "COMPLETED")
  })

  it("offers a configured draft and does not treat a declined quote as acceptance", () => {
    const { unmount } = show(facts({ commercial: { complete: true, quotes: [quoteFact()] } }), quoteItem())
    expect(screen.getByRole("button", { name: "Offer quote" })).toBeTruthy()
    expect(screen.getByText(/does not add a country restriction/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Create draft quote" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Activate|Pay|Stripe/i })).toBeNull()
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).not.toHaveAttribute("data-state", "COMPLETED")
    unmount()

    show(facts({ commercial: { complete: true, quotes: [quoteFact({ status: "DECLINED" })] } }), quoteItem("DECLINED"))
    expect(screen.getByText("This quote is not accepted. A declined, expired or incomplete record is not the customer's agreement.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create draft quote" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Offer quote" })).toBeNull()
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
  })
})
