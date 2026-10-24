// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts, CaseFlowQuoteFact } from "@/lib/case-flow/model"
import type { PriceVersion, QuoteListItem } from "@/lib/commerce/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { standardScopeExclusions } from "../../../../../../lib/commercial/scope-templates"
import { presentCaseJourney } from "@/lib/case-journey/present"
import { buildJourneyQuotePanel } from "@/lib/case-journey/quote"
import type { QuoteReadiness } from "@/lib/case-journey/quote-readiness"
import { projectQuoteEmail, type QuoteEmailView } from "@/lib/case-journey/quote-email"
import type { CaseCommunicationRead, CaseCommunicationRow } from "@/lib/communications/model"
import type { Membership } from "@/lib/records/model"
import { QuotePanel } from "./quote"
import { CaseJourneyView } from "./view"

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => navigation }))
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
const ACTION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const COMMUNICATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const PAST = "2026-10-01T12:00:00.000Z"

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

function quoteItem(status = "DRAFT", taxBehaviour = "INCLUSIVE"): QuoteListItem {
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
      taxBehaviour,
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

const verifiedGb: QuoteReadiness = {
  status: "verified",
  countryCode: "GB",
  countryLabel: "United Kingdom",
  legalName: "Bakery Ltd",
  sellerVat: "NOT_VAT_REGISTERED",
  taxPath: "uk_not_charged",
}

const missingPurchaser: QuoteReadiness = {
  status: "missing",
  countryCode: null,
  countryLabel: null,
  legalName: null,
  sellerVat: "NOT_VAT_REGISTERED",
  taxPath: "unavailable",
}

function communication(overrides: Partial<CaseCommunicationRow> = {}): CaseCommunicationRow {
  return {
    id: COMMUNICATION_ID,
    caseId: CASE_ID,
    caseReference: "PR-1",
    evidenceRequestId: null,
    communicationType: "QUOTE_OFFER",
    templateKey: "QUOTE_OFFER",
    templateVersion: 1,
    lifecycle: "QUEUED",
    deliveryStatus: "NONE",
    legacyStatus: null,
    recipient: "alex@example.com",
    subject: "Your ProfileRelaunch quotation Q-100",
    bodyText: `https://customer.example/action/${ACTION_ID}`,
    bodyHtml: `<a href="https://customer.example/action/${ACTION_ID}">Review and accept quotation</a>`,
    provider: null,
    providerMessageId: null,
    lastError: null,
    contentLocked: true,
    contentVersion: 1,
    version: 1,
    draftedAt: NOW,
    reviewedAt: NOW,
    queuedAt: NOW,
    firstProviderAttemptAt: null,
    providerAcceptedAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    supersededBy: null,
    events: [],
    eventsTruncated: false,
    canReplace: false,
    ...overrides,
  }
}

function emailView(actionId: string | null, rows: CaseCommunicationRow[], devSend = true): QuoteEmailView {
  const history: CaseCommunicationRead = {
    status: "success",
    complete: true,
    total: rows.length,
    returned: rows.length,
    verifiedEmail: "alex@example.com",
    verifiedEmailSuppressed: false,
    communications: rows,
  }
  return projectQuoteEmail(history, actionId, { devSend })
}

function show(
  source: CaseFlowFacts,
  quote: QuoteListItem | null,
  readiness: QuoteReadiness = verifiedGb,
  email?: QuoteEmailView,
  options: { membership?: Membership; emailRecovery?: "send" | "resend" | null } = {},
) {
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
    quoteReadiness={readiness}
    quoteEmail={email}
    membership={options.membership}
    emailRecovery={options.emailRecovery}
  />)
}

function summaryFact(label: string): string {
  const row = [...document.querySelectorAll(".quote-summary > div")].find(node => node.querySelector("dt")?.textContent === label)
  if (!row) throw new Error(`Missing fact ${label}`)
  return row.querySelector("dd")?.textContent ?? ""
}

function offeredCase(auth: Partial<CaseFlowFacts["authorization"]>): CaseFlowFacts {
  return facts({
    authorization: { ...facts().authorization, ...auth },
    commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
  })
}

function relationship(status: Membership["status"], version: number): Membership {
  return {
    customerId: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    name: "Bakery",
    version,
    status,
    evidence: "An earlier note was recorded.",
    verifiedAt: null,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  navigation.refresh.mockClear()
})

describe("guided quote acceptance", () => {
  it("keeps a locked step free of quote, payment and activation controls", () => {
    const source = facts({ technicalStage: "INITIAL_REVIEW", allowedTransitions: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"] })
    show(source, null)
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Quote and acceptance stay closed until the earlier steps are recorded.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Create Draft Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Activate|Pay|Stripe|Choose the service track/i })).toBeNull()
  })

  it("drafts through the existing quote command and does not write the service track", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The quote record has been updated. This does not take payment." }) })
    vi.stubGlobal("fetch", fetchMock)
    show(facts(), null)
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getByText("Service: Not chosen")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Purchasing establishment" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Activate|Pay|Stripe|Choose the service track/i })).toBeNull()
    fireEvent.submit(screen.getByRole("button", { name: "Create Draft Quotation" }).closest("form")!)
    expect(await screen.findByRole("status")).toHaveTextContent(/does not take payment/)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/quotes")
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    const standard = standardScopeExclusions("GUIDED_RELAUNCH")
    expect(payload.operation).toBe("create_draft")
    expect(payload.serviceCode).toBe("GUIDED_RELAUNCH")
    expect(payload.scope).toBe(standard?.scope)
    expect(payload.exclusions).toBe(standard?.exclusions)
    expect(payload).not.toHaveProperty("serviceTrack")
    expect(payload).not.toHaveProperty("applyDiscount")
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).not.toHaveAttribute("data-state", "COMPLETED")
  })

  it("offers a configured draft and does not treat a declined quote as acceptance", () => {
    const { unmount } = show(facts({ commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "NOT_APPLICABLE" })] } }), quoteItem("DRAFT", "NOT_APPLICABLE"))
    const offer = screen.getByRole("button", { name: "Review & Offer Quotation" })
    const scope = screen.getByText("Recover the suspended profile.")
    const exclusions = screen.getByText("No Google submission from this quote.")
    expect(scope.compareDocumentPosition(offer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(exclusions.compareDocumentPosition(offer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText("Verified — United Kingdom")).toBeTruthy()
    expect(screen.getByText("Review the service details, then offer this quotation.")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Purchasing establishment" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Record the purchasing establishment" })).toBeNull()
    expect(screen.queryByText(/basis point|tax rate \(bps\)|DEV_MAIL_ALLOWED_RECIPIENTS/i)).toBeNull()
    expect(screen.queryByRole("button", { name: "Create Draft Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Activate|Pay|Stripe/i })).toBeNull()
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).not.toHaveAttribute("data-state", "COMPLETED")
    unmount()

    show(facts({ commercial: { complete: true, quotes: [quoteFact({ status: "DECLINED" })] } }), quoteItem("DECLINED"))
    expect(screen.getByText("This quote is not accepted. A declined, expired or incomplete record is not the customer's agreement.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create Draft Quotation" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
  })

  it("keeps scope and exclusions full width, with line breaks, and stacks on a narrow screen", () => {
    const source = facts({ commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "NOT_APPLICABLE" })] } })
    const quote = quoteItem("DRAFT", "NOT_APPLICABLE")
    quote.currentVersion = {
      ...quote.currentVersion,
      scope: "First scope line.\n\nSecond scope line stays in the scope section.",
      exclusions: "First exclusion.\nSecond exclusion stays in the exclusions section.",
    }
    show(source, quote)
    const labels = [...document.querySelectorAll(".quote-summary dt")].map(node => node.textContent)
    expect(labels).toEqual([
      "Service",
      "Quote",
      "Total customer price",
      "Expiry",
      "Quotation status",
      "Customer email",
      "Purchasing establishment",
      "Business authority",
      "Quotation",
      "Pricing",
    ])
    const details = document.querySelector("details.guided-details")
    expect(details).toHaveAttribute("open")
    expect(details?.textContent).toContain("First scope line.")
    expect(details?.textContent).toContain("Second scope line stays in the scope section.")
    expect(details?.textContent).toContain("First exclusion.")
    expect(details?.textContent).toContain("Second exclusion stays in the exclusions section.")
    const scope = details?.querySelectorAll("p.preserve-lines")[0]
    const exclusions = details?.querySelectorAll("p.preserve-lines")[1]
    expect(scope).toHaveClass("preserve-lines")
    expect(exclusions).toHaveClass("preserve-lines")
    const quoteRow = [...document.querySelectorAll(".quote-summary > div")].find(node => node.querySelector("dt")?.textContent === "Quote")
    expect(quoteRow).not.toHaveClass("quote-summary-block")
    expect(quoteRow?.parentElement).toHaveClass("quote-summary")
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
    expect(css).toContain(".guided-facts dl.quote-summary")
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)")
    expect(css).toContain(".guided-facts dl.quote-summary > .quote-summary-block")
    expect(css).toMatch(/@media \(max-width: 800px\) \{[\s\S]*\.guided-facts dl\.quote-summary > div/)
    expect(css).toMatch(/@media \(max-width: 800px\) \{[\s\S]*\.quote-progress \{ flex-direction: column; \}/)
    expect(css).toMatch(/dl \{ display: grid; grid-template-columns: 10rem minmax\(0, 1fr\)/)
  })

  it("does not link a quote readiness record when the case has no ids", () => {
    const source = facts({ commercial: { complete: true, quotes: [quoteFact()] } })
    const journey = presentCaseJourney(source, NOW, [], {
      assessment: { phase: "approved", pathway: "GUIDED", versionNumber: 1 },
    })
    const panel = buildJourneyQuotePanel({
      facts: source,
      now: NOW,
      assessment: { phase: "approved", pathway: "GUIDED", versionNumber: 1 },
      prices: [price()],
      quote: quoteItem(),
      quoteDetailMissing: false,
    })
    render(<QuotePanel
      panel={panel}
      readiness={missingPurchaser}
      caseId={CASE_ID}
      customerId=""
      businessId="not-a-business"
      locationId={null}
      customerName="Alex"
      businessName="Bakery"
    />)
    expect(journey.steps.some(step => step.id === "QUOTE_ACCEPTANCE")).toBe(true)
    expect(screen.queryByRole("heading", { name: "Purchasing establishment" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Open the business record" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Review the customer and business relationship" })).toBeNull()
    expect(screen.getByText("This case has no business record to open from here.")).toBeTruthy()
  })

  it("previews the quotation email and queues it only from the send button", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: "The quotation email is queued. The email provider has not accepted it yet, and queued is not delivered.",
        lifecycle: "QUEUED",
        deliveryStatus: "NONE",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const source = facts({
      authorization: {
        ...facts().authorization,
        customerEmailVerified: true,
        businessAuthorityVerified: true,
      },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
    })
    const quote = quoteItem("OFFERED")
    quote.currentVersion = { ...quote.currentVersion, taxBehaviour: "NOT_APPLICABLE" }
    show(source, quote)
    expect(screen.getByRole("button", { name: "Send Quotation Email" })).toBeTruthy()
    expect(screen.queryByText(/DEV_MAIL_ALLOWED_RECIPIENTS/)).toBeNull()
    expect(screen.queryByRole("heading", { name: "Plain text" })).toBeNull()
    const frame = document.querySelector("iframe[title='Quotation email']")
    expect(frame?.getAttribute("sandbox")).toBe("")
    expect(frame?.getAttribute("srcdoc")).toContain("Review and accept quotation")
    expect(frame?.getAttribute("srcdoc")).toContain("ProfileRelaunch")
    expect(frame?.getAttribute("srcdoc")).not.toContain("#t=")
    expect(frame?.getAttribute("srcdoc")).not.toContain("<script")
    expect(frame?.getAttribute("srcdoc")).not.toContain("https://customer.example/action/")
    expect(screen.queryByRole("button", { name: "Review and accept quotation" })).toBeNull()
    expect(screen.getByText("More Options")).toBeTruthy()
    expect(screen.getByText("Your ProfileRelaunch quotation Q-100 — Case PR-1")).toBeTruthy()
    expect(screen.getAllByText(/£99\.00/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Recover the suspended profile/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No Google submission from this quote/).length).toBeGreaterThan(0)
    expect(frame?.getAttribute("srcdoc")).toContain("For your security, please never share passwords")
    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("textbox", { name: "Subject" })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "Introduction" })).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Send Quotation Email" })).toHaveLength(1)
    fireEvent.submit(screen.getByRole("button", { name: "Send Quotation Email" }).closest("form")!)
    expect(await screen.findByText("Quotation email queued")).toBeTruthy()
    expect(screen.getByRole("status")).toHaveTextContent(/queued is not delivered/)
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("queue_quote_offer_email")
    expect(payload.quoteId).toBe(QUOTE_ID)
    expect(JSON.stringify(payload)).not.toContain("#t=")
    expect(payload).not.toHaveProperty("secretHash")
    expect(payload).not.toHaveProperty("recipient")
    expect(navigation.refresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("status").textContent).not.toMatch(/Delivered/)
    fireEvent.submit(document.querySelector("[data-quotation-email='preview']")!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("advances a submitted quotation email without leaving Send active", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: "The quotation email was submitted to the email provider. Accepted by the provider is not delivered.",
        lifecycle: "QUEUED",
        deliveryStatus: "PROVIDER_ACCEPTED",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
    })
    show(source, quoteItem("OFFERED", "NOT_APPLICABLE"))
    expect(screen.getAllByRole("button", { name: "Send Quotation Email" })).toHaveLength(1)
    fireEvent.submit(screen.getByRole("button", { name: "Send Quotation Email" }).closest("form")!)
    expect(await screen.findByText("Quotation submitted to email provider")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByText("Waiting for Customer Acceptance")).toBeNull()
    expect(navigation.refresh).toHaveBeenCalledTimes(1)
    fireEvent.submit(document.querySelector("[data-quotation-email='preview']")!)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("retries an unconfirmed quotation email and does not reuse a failed request as a second queue", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          message: "The quotation email is queued. The email provider has not accepted it yet, and queued is not delivered.",
          lifecycle: "QUEUED",
          deliveryStatus: "NONE",
        }),
      })
    vi.stubGlobal("fetch", fetchMock)
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
    })
    show(source, quoteItem("OFFERED", "NOT_APPLICABLE"))
    fireEvent.submit(screen.getByRole("button", { name: "Send Quotation Email" }).closest("form")!)
    expect(await screen.findByText(/Reload the page and try again/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send Quotation Email" })).toBeTruthy()
    fireEvent.submit(screen.getByRole("button", { name: "Send Quotation Email" }).closest("form")!)
    expect(await screen.findByText("Quotation email queued")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).not.toBe(fetchMock.mock.calls[1][1].headers["idempotency-key"])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).operation).toBe("queue_quote_offer_email")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).operation).toBe("queue_quote_offer_email")
  })

  it("hides the purchaser form when the establishment is already verified", () => {
    show(facts({ commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "UNCONFIRMED" })] } }), quoteItem("DRAFT", "UNCONFIRMED"))
    expect(screen.getByText("Verified — United Kingdom")).toBeTruthy()
    expect(screen.getByText("View Verification Details")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Record the purchasing establishment" })).toBeNull()
    expect(screen.getByRole("button", { name: "Confirm Pricing" })).toBeTruthy()
    expect(screen.getByText("VAT: Not charged")).toBeTruthy()
    expect(screen.getByText("No additional taxes or mandatory fees charged by ProfileRelaunch.")).toBeTruthy()
    expect(screen.getAllByText("£99.00").length).toBeGreaterThan(0)
  })

  it("shows a short purchaser form only when verification is missing", () => {
    show(facts(), null, missingPurchaser)
    expect(screen.getByRole("heading", { name: "Record the purchasing establishment" })).toBeTruthy()
    expect(screen.getByLabelText("Legal purchasing name")).toBeTruthy()
    expect(screen.getByLabelText("Purchaser")).toBeTruthy()
    expect(screen.getByLabelText("Purchasing country")).toBeTruthy()
    const registration = screen.getByLabelText("Registration number, if you already have one")
    const taxId = screen.getByLabelText("Tax identifier, only if you already hold one")
    expect(registration.closest("details")).not.toHaveAttribute("open")
    expect(taxId.closest("details")?.querySelector("summary")?.textContent).toBe("Add a registration or tax identifier")
    expect(screen.queryByRole("button", { name: "Confirm Pricing" })).toBeNull()
    expect(screen.queryByText("VAT: Not charged")).toBeNull()
  })

  it("does not treat a pending or conflicting establishment as verified", () => {
    const pending: QuoteReadiness = { ...missingPurchaser, status: "pending" }
    const { unmount } = show(facts(), null, pending)
    expect(screen.getAllByText("Purchasing establishment not verified").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/not a verified purchasing establishment/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Purchaser verified/)).toBeNull()
    unmount()

    const conflicting: QuoteReadiness = {
      status: "conflicting",
      countryCode: null,
      countryLabel: null,
      legalName: null,
      sellerVat: "NOT_VAT_REGISTERED",
      taxPath: "review",
    }
    show(facts({ commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "UNCONFIRMED" })] } }), quoteItem("DRAFT", "UNCONFIRMED"), conflicting)
    expect(screen.getByText("This step cannot treat the purchaser as verified.")).toBeTruthy()
    expect(screen.getAllByText("Tax treatment needs review").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Confirm Pricing" })).toBeNull()
    expect(screen.queryByText("VAT: Not charged")).toBeNull()
  })

  it("confirms UK pricing without a rate and does not ask again once saved", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The quote record has been updated. This does not take payment." }) })
    vi.stubGlobal("fetch", fetchMock)
    const { unmount } = show(facts({ commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "UNCONFIRMED" })] } }), quoteItem("DRAFT", "UNCONFIRMED"))
    fireEvent.submit(screen.getByRole("button", { name: "Confirm Pricing" }).closest("form")!)
    expect(await screen.findByRole("status")).toBeTruthy()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload).toEqual({
      operation: "set_draft_tax",
      quoteId: QUOTE_ID,
      version: 2,
      quoteVersionId: VERSION_ID,
      taxBehaviour: "NOT_APPLICABLE",
    })
    expect(payload).not.toHaveProperty("taxRateBps")
    expect(payload).not.toHaveProperty("taxJurisdiction")
    expect(payload).not.toHaveProperty("taxCode")
    unmount()

    show(facts({ commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "NOT_APPLICABLE" })] } }), quoteItem("DRAFT", "NOT_APPLICABLE"))
    expect(screen.getAllByText("Pricing confirmed").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Confirm Pricing" })).toBeNull()
    expect(screen.getAllByText("£99.00").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /Pay|Stripe/i })).toBeNull()
  })

  it("requires an approved percentage before an inclusive tax request", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const overseas: QuoteReadiness = {
      status: "verified",
      countryCode: "FR",
      countryLabel: "France",
      legalName: "Bakery SARL",
      sellerVat: "UNKNOWN",
      taxPath: "review",
    }
    show(facts({ commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "UNCONFIRMED" })] } }), quoteItem("DRAFT", "UNCONFIRMED"), overseas)
    expect(screen.getAllByText("Tax treatment needs review").length).toBeGreaterThan(0)
    expect(screen.queryByText("VAT: Not charged")).toBeNull()
    expect(screen.queryByRole("button", { name: "Confirm Pricing" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    fireEvent.click(screen.getByText("Review tax treatment"))
    fireEvent.change(screen.getByLabelText("Tax treatment"), { target: { value: "INCLUSIVE" } })
    fireEvent.submit(screen.getByRole("button", { name: "Save reviewed tax treatment" }).closest("form")!)
    expect(screen.getByRole("alert")).toHaveTextContent(/approved tax percentage/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps an offered quotation incomplete until the customer accepts", () => {
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
    })
    const { unmount } = show(source, quoteItem("OFFERED", "NOT_APPLICABLE"))
    expect(screen.queryByText("Waiting for Customer Acceptance")).toBeNull()
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.queryByRole("link", { name: "Continue to Step 7" })).toBeNull()
    unmount()

    const accepted = facts({
      technicalStage: "SERVICE_SELECTION",
      serviceTrack: "GUIDED",
      commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED", taxBehaviour: "NOT_APPLICABLE", orderId: "order-1" })] },
    })
    show(accepted, quoteItem("ACCEPTED", "NOT_APPLICABLE"))
    expect(screen.getByText("Quotation accepted — Continue to Step 7")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Continue to Step 7" })).toHaveAttribute("href", `/cases/${CASE_ID}/journey?step=SERVICE_ACTIVATION`)
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).toHaveAttribute("data-state", "COMPLETED")
    expect(document.querySelector("[data-step='SERVICE_ACTIVATION']")).not.toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByRole("button", { name: /Pay|Stripe/i })).toBeNull()
  })

  it("offers an approved non-GB quotation by email instead of returning to tax review", () => {
    const france: QuoteReadiness = {
      status: "verified",
      countryCode: "FR",
      countryLabel: "France",
      legalName: "Bakery SARL",
      sellerVat: "NOT_VAT_REGISTERED",
      taxPath: "review",
    }
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
    })
    show(source, quoteItem("OFFERED", "NOT_APPLICABLE"), france, emailView(null, []))
    expect(screen.getByRole("button", { name: "Send Quotation Email" })).toBeTruthy()
    expect(screen.queryByText("Tax treatment needs review")).toBeNull()
    expect(screen.getByText("Tax treatment recorded")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    expect(screen.queryByText("Waiting for Customer Acceptance")).toBeNull()
  })

  it("does not call a queued quotation email sent or delivered", () => {
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.action = { id: ACTION_ID, status: "OPEN", expiresAt: FUTURE, kind: "QUOTE_ACCEPTANCE" }
    show(source, quote, verifiedGb, emailView(ACTION_ID, [communication()], false))
    expect(screen.getByText("Quotation email queued")).toBeTruthy()
    expect(screen.getByText("The queued quotation email stays on this step. It is not created again from here.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Process Pending Quotation Email" })).toBeNull()
    expect(screen.queryByText("Waiting for Customer Acceptance")).toBeNull()
    expect(screen.queryByText("Quotation delivered")).toBeNull()
    expect(screen.queryByText("Quotation submitted to email provider")).toBeNull()
  })

  it("recovers a failed quotation email instead of creating another", () => {
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.action = { id: ACTION_ID, status: "OPEN", expiresAt: FUTURE, kind: "QUOTE_ACCEPTANCE" }
    show(source, quote, verifiedGb, emailView(ACTION_ID, [communication({ deliveryStatus: "FAILED", failedAt: NOW })]))
    expect(screen.getByText("Email needs attention")).toBeTruthy()
    expect(screen.getByText("This quotation email was not confirmed. It was not sent again.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Process Pending Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue Replacement" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
  })

  it("keeps the queued communication when recent login fails and processes that same email", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          id: COMMUNICATION_ID,
          lifecycle: "QUEUED",
          deliveryStatus: "NONE",
          message: "The quotation email is queued. Sign out and sign in again, then return to this step and process the pending quotation email within 30 minutes. The queued email was kept. Queued is not delivered.",
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: "Sign out and sign in with a new email code, then try again within 30 minutes." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ message: "The queued email was submitted to the email provider." }),
      })
    vi.stubGlobal("fetch", fetchMock)
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
    })
    show(source, quoteItem("OFFERED", "NOT_APPLICABLE"))
    fireEvent.submit(screen.getByRole("button", { name: "Send Quotation Email" }).closest("form")!)
    expect(await screen.findByText(/return to this step and process the pending quotation email/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Process Pending Quotation Email" }))
    expect(await screen.findByText(/Return to this step after signing in/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Process Pending Quotation Email" }))
    expect(await screen.findByText("Quotation submitted to email provider")).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/quotes")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).operation).toBe("queue_quote_offer_email")
    expect(fetchMock.mock.calls[1][0]).toBe("/api/operations/dev-send-email")
    expect(fetchMock.mock.calls[2][0]).toBe("/api/operations/dev-send-email")
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ communicationId: COMMUNICATION_ID, confirmed: true })
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ communicationId: COMMUNICATION_ID, confirmed: true })
    expect(fetchMock.mock.calls[1][1].headers["idempotency-key"]).toBe(fetchMock.mock.calls[2][1].headers["idempotency-key"])
    expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body).operation).filter(Boolean)).toEqual(["queue_quote_offer_email"])
  })

  it("does not send the provider again when acceptance is unknown", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        id: COMMUNICATION_ID,
        lifecycle: "QUEUED",
        deliveryStatus: "ACCEPTANCE_UNKNOWN",
        message: "Provider acceptance is unknown. The email was not sent again.",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE" })] },
    })
    show(source, quoteItem("OFFERED", "NOT_APPLICABLE"))
    fireEvent.submit(screen.getByRole("button", { name: "Send Quotation Email" }).closest("form")!)
    expect(await screen.findByText("Email needs attention")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Process Pending Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/quotes")
  })

  it("does not claim a manual acceptance link was emailed", () => {
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.action = { id: ACTION_ID, status: "OPEN", expiresAt: FUTURE, kind: "QUOTE_ACCEPTANCE" }
    show(source, quote, verifiedGb, emailView(ACTION_ID, []))
    expect(screen.getByText("The acceptance link exists, but the quotation has not been emailed.")).toBeTruthy()
    expect(screen.getByText(/This one-time link cannot be retrieved after you leave this page/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Revoke open quote action" })).toBeTruthy()
    expect(screen.queryByText("Waiting for Customer Acceptance")).toBeNull()
    expect(screen.queryByText("Quotation delivered")).toBeNull()
    expect(screen.queryByText("Quotation email queued")).toBeNull()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send replacement quotation email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
  })

  it("sends a replacement quotation email for an expired acceptance link and does not issue it while rendering", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "The quotation email is queued. The provider has not accepted it." }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", actionStatus: "OPEN", actionExpiresAt: PAST })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.action = { id: ACTION_ID, status: "OPEN", expiresAt: PAST, kind: "QUOTE_ACCEPTANCE" }
    show(source, quote, verifiedGb, emailView(ACTION_ID, []))
    const primary = document.querySelector("[data-primary-action='expired']")
    expect(primary?.textContent).toContain("Send replacement quotation email")
    expect(primary?.textContent).toContain("The expired acceptance link is revoked only as part of that send.")
    expect(primary?.textContent).not.toContain("Issue manual replacement link")
    const manual = document.querySelector("[data-secondary='manual-replacement']")
    expect(manual).not.toHaveAttribute("open")
    expect(manual?.textContent).toContain("Issue manual replacement link does not email the customer.")
    expect(manual?.textContent).toContain("The one-time secret cannot be retrieved after you leave this page.")
    expect(screen.queryByRole("button", { name: "Issue Replacement" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
    expect(screen.queryByText("Waiting for Customer Acceptance")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.submit(screen.getByRole("button", { name: "Send replacement quotation email" }).closest("form")!)
    expect(await screen.findByRole("status")).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/quotes")
    const posted = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(posted.operation).toBe("queue_quote_offer_email")
    expect(posted.quoteId).toBe(QUOTE_ID)
  })

  it("cancels a quotation that cannot hold a replacement acceptance link instead of sending it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "The quote record has been updated. This does not take payment." }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", actionStatus: "OPEN", actionExpiresAt: PAST, validUntil: soon })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.currentVersion.validUntil = soon
    quote.action = { id: ACTION_ID, status: "OPEN", expiresAt: PAST, kind: "QUOTE_ACCEPTANCE" }
    show(source, quote, verifiedGb, emailView(ACTION_ID, []))
    const primary = document.querySelector("[data-primary-action='renew']")
    expect(primary?.textContent).toContain("This quotation expires too soon for a replacement acceptance link.")
    expect(primary?.textContent).toContain("Cancel it, then return to this step and create a new draft with a longer expiry.")
    expect(screen.getByRole("button", { name: "Cancel this quotation" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send replacement quotation email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue manual replacement link" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.submit(screen.getByRole("button", { name: "Cancel this quotation" }).closest("form")!)
    expect(await screen.findByRole("status")).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/quotes")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      operation: "cancel",
      quoteId: QUOTE_ID,
      version: 2,
    })
  })

  it("does not offer Send when an offered quotation has less than sixteen minutes of validity", () => {
    const soon = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", validUntil: soon })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.currentVersion.validUntil = soon
    show(source, quote)
    expect(screen.getByRole("button", { name: "Cancel this quotation" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send replacement quotation email" })).toBeNull()
  })

  it("keeps the replacement email closed until the customer email and business authority are verified", () => {
    const source = facts({
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", actionStatus: "OPEN", actionExpiresAt: PAST })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.action = { id: ACTION_ID, status: "OPEN", expiresAt: PAST, kind: "QUOTE_ACCEPTANCE" }
    show(source, quote, verifiedGb, emailView(ACTION_ID, []))
    expect(screen.getByText(/The quotation email stays closed because the customer email is not verified/)).toBeTruthy()
    expect(screen.queryByText(/email and business authority/)).toBeNull()
    expect(summaryFact("Customer email")).toBe("Not verified")
    expect(summaryFact("Business authority")).toBe("Pending review")
    expect(screen.getByRole("link", { name: "Open the existing email confirmation on Case Received" })).toHaveAttribute("href", `/cases/${CASE_ID}/journey?step=CASE_RECEIVED`)
    expect(screen.queryByRole("button", { name: "Record business authority" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send replacement quotation email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue manual replacement link" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
  })

  it("does not issue a second link while a valid acceptance link is open", () => {
    const source = facts({
      authorization: { ...facts().authorization, customerEmailVerified: true, businessAuthorityVerified: true },
      commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", taxBehaviour: "NOT_APPLICABLE", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
    })
    const quote = quoteItem("OFFERED", "NOT_APPLICABLE")
    quote.action = { id: ACTION_ID, status: "OPEN", expiresAt: FUTURE, kind: "QUOTE_ACCEPTANCE" }
    show(source, quote, verifiedGb, emailView(ACTION_ID, [communication({
      deliveryStatus: "DELIVERED",
      deliveredAt: NOW,
      lifecycle: "QUEUED",
    })]))
    expect(screen.getByText("Quotation delivered")).toBeTruthy()
    expect(screen.getByText("Waiting for Customer Acceptance")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Issue Replacement" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send replacement quotation email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
  })

  it("keeps purchaser verification as the only primary action", () => {
    show(facts(), null, missingPurchaser)
    const primary = document.querySelector("[data-primary-action='verify']")
    expect(primary?.textContent).toContain("Record the purchasing establishment")
    expect(primary?.textContent).not.toContain("Create Draft Quotation")
    expect(document.querySelector("[data-secondary='draft']")).not.toHaveAttribute("open")
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Confirm Pricing" })).toBeNull()
  })

  it("shows a verified email and missing business authority as separate facts, then records authority in this step", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "Saved. The activity history has been updated.", id: CUSTOMER_ID }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const first = show(
      offeredCase({ customerEmailVerified: true, businessAuthorityVerified: false, membershipStatus: "missing" }),
      quoteItem("OFFERED", "NOT_APPLICABLE"),
    )
    expect(summaryFact("Customer email")).toBe("Verified")
    expect(summaryFact("Purchasing establishment")).toBe("Verified — United Kingdom")
    expect(summaryFact("Business authority")).toBe("Not yet verified")
    expect(summaryFact("Quotation")).toBe("Offered; £99.00 pricing confirmed")
    expect(screen.getByText(/business authority is not yet verified/)).toBeTruthy()
    expect(screen.queryByText(/email and business authority/)).toBeNull()
    expect(document.querySelector("[data-primary-action='verify-authority']")).toBeTruthy()
    expect(screen.getByText("Verify business authority")).toBeTruthy()
    expect(screen.getByLabelText("Relationship status")).toHaveValue("pending")
    expect(screen.getByText(/more than 30 minutes ago/)).toBeTruthy()
    expect(screen.getByText(/does not ask the customer to confirm an email/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Create Draft Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Pay|Stripe|Activate/i })).toBeNull()
    fireEvent.change(screen.getByLabelText("Relationship status"), { target: { value: "verified" } })
    fireEvent.change(screen.getByLabelText(/Reason and evidence for this relationship/), { target: { value: "Checked the authority letter on 23 October 2026." } })
    fireEvent.click(screen.getByRole("checkbox", { name: /may represent this business/ }))
    fireEvent.submit(screen.getByRole("button", { name: "Record business authority" }).closest("form")!)
    expect(await screen.findByRole("status")).toHaveTextContent(/activity history/)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/records/membership")
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      customerId: CUSTOMER_ID,
      businessId: BUSINESS_ID,
      version: 0,
      status: "verified",
      evidence: "Checked the authority letter on 23 October 2026.",
    })
    expect(navigation.refresh).toHaveBeenCalledTimes(1)
    expect(navigation.push).not.toHaveBeenCalled()
    first.unmount()

    show(
      offeredCase({ customerEmailVerified: true, businessAuthorityVerified: true, membershipStatus: "verified" }),
      quoteItem("OFFERED", "NOT_APPLICABLE"),
      verifiedGb,
      undefined,
      { membership: relationship("verified", 1) },
    )
    expect(summaryFact("Customer email")).toBe("Verified")
    expect(summaryFact("Business authority")).toBe("Verified")
    expect(summaryFact("Quotation")).toBe("Offered; £99.00 pricing confirmed")
    expect(screen.getAllByRole("button", { name: "Send Quotation Email" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Record business authority" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record business authority review" })).toBeNull()
    expect(screen.queryByText("Verify business authority")).toBeNull()
    expect(screen.queryByRole("button", { name: "Create Draft Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Review & Offer Quotation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send confirmation" })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps a pending or withdrawn relationship closed and sends the stored version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "Saved. The activity history has been updated.", id: CUSTOMER_ID }),
    })
    vi.stubGlobal("fetch", fetchMock)
    const pending = show(
      offeredCase({ customerEmailVerified: true, businessAuthorityVerified: false, membershipStatus: "pending" }),
      quoteItem("OFFERED", "NOT_APPLICABLE"),
      verifiedGb,
      undefined,
      { membership: relationship("pending", 4) },
    )
    expect(summaryFact("Business authority")).toBe("Pending review")
    expect(screen.getByText(/business authority is still pending/)).toBeTruthy()
    expect(document.querySelector("[data-primary-action='review-authority']")).toBeTruthy()
    expect(screen.getByLabelText("Relationship status")).toHaveValue("pending")
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByText(/email and business authority/)).toBeNull()
    fireEvent.change(screen.getByLabelText("Relationship status"), { target: { value: "verified" } })
    fireEvent.change(screen.getByLabelText(/Reason and evidence for this relationship/), { target: { value: "Checked the authority letter on 23 October 2026." } })
    fireEvent.click(screen.getByRole("checkbox", { name: /may represent this business/ }))
    fireEvent.submit(screen.getByRole("button", { name: "Record business authority review" }).closest("form")!)
    expect(await screen.findByRole("status")).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).version).toBe(4)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).status).toBe("verified")
    pending.unmount()

    show(
      offeredCase({ customerEmailVerified: true, businessAuthorityVerified: false, membershipStatus: "revoked" }),
      quoteItem("OFFERED", "NOT_APPLICABLE"),
      verifiedGb,
      undefined,
      { membership: relationship("revoked", 2) },
    )
    expect(summaryFact("Customer email")).toBe("Verified")
    expect(summaryFact("Business authority")).toBe("Withdrawn — needs an evidenced review")
    expect(screen.getByText(/business authority was withdrawn/)).toBeTruthy()
    expect(screen.getByLabelText("Relationship status")).toHaveValue("revoked")
    expect(screen.getByRole("button", { name: "Record business authority review" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record business authority" })).toBeNull()
  })

  it("routes a missing email to confirmation and does not open a second authority form", () => {
    const authorityVerified = show(
      offeredCase({ customerEmailVerified: false, businessAuthorityVerified: true, membershipStatus: "verified" }),
      quoteItem("OFFERED", "NOT_APPLICABLE"),
      verifiedGb,
      undefined,
      { emailRecovery: "resend", membership: relationship("verified", 1) },
    )
    expect(summaryFact("Customer email")).toBe("Not verified")
    expect(summaryFact("Business authority")).toBe("Verified")
    expect(screen.getByRole("button", { name: "Resend confirmation" })).toBeTruthy()
    expect(screen.getByText(/does not verify the address/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Record business authority/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
    expect(screen.queryByText(/email and business authority/)).toBeNull()
    authorityVerified.unmount()

    show(
      offeredCase({ customerEmailVerified: false, businessAuthorityVerified: false, membershipStatus: "missing" }),
      quoteItem("OFFERED", "NOT_APPLICABLE"),
      verifiedGb,
      undefined,
      { emailRecovery: "send" },
    )
    expect(summaryFact("Customer email")).toBe("Not verified")
    expect(summaryFact("Business authority")).toBe("Not yet verified")
    expect(summaryFact("Purchasing establishment")).toBe("Verified — United Kingdom")
    expect(document.querySelector("[data-primary-action='confirm-email']")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send confirmation" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Record business authority/ })).toBeNull()
    expect(screen.queryByText(/email and business authority/)).toBeNull()
    expect(screen.getByText(/customer email is not verified/)).toBeTruthy()
  })

  it("does not open the authority form for a case that has no business id", () => {
    const source = offeredCase({ customerEmailVerified: true, businessAuthorityVerified: false, membershipStatus: "missing" })
    const panel = buildJourneyQuotePanel({
      facts: source,
      now: NOW,
      assessment: { phase: "approved", pathway: "GUIDED", versionNumber: 1 },
      prices: [price()],
      quote: quoteItem("OFFERED", "NOT_APPLICABLE"),
      quoteDetailMissing: false,
    })
    render(<QuotePanel
      panel={panel}
      readiness={verifiedGb}
      caseId={CASE_ID}
      customerId="not-a-customer"
      businessId={BUSINESS_ID}
      locationId={LOCATION_ID}
      customerName="Alex"
      businessName="Bakery"
    />)
    expect(screen.getByText("This case has no business record to open from here.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Record business authority/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send Quotation Email" })).toBeNull()
  })
})
