// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { presentJourneyOutcome } from "@/lib/case-journey/outcome"
import { presentCaseJourney } from "@/lib/case-journey/present"
import type { CaseDetail, Submission } from "@/lib/cases/model"
import type { ServiceOrder } from "@/lib/commerce/model"
import type { MoneyOrder } from "@/lib/payments/model"
import { CaseJourneyView } from "./view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const ORDER_ID = "88888888-8888-4888-8888-888888888888"
const WHEN = "2026-06-01T12:00:00.000Z"
const NOW = "2026-10-03T12:00:00.000Z"

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
    payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "PAID", setupReady: false, consentRecorded: false, receiptRecorded: true }] },
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    ...overrides,
  }
}

function attempt(overrides: Partial<Submission> = {}): Submission {
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

function caseDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: CASE_ID,
    reference: "PR-1",
    type: "PROFILE_RECOVERY",
    stage: "OUTCOME_REVIEW",
    track: "GUIDED",
    status: "UNDER_REVIEW",
    client: "Alex",
    business: "Bakery",
    assigned: true,
    priority: "NORMAL",
    nextAction: "",
    due: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    version: 4,
    outcome: null,
    summary: "",
    priorityReason: "",
    firstResponseDue: null,
    issue: "Profile suspended",
    reviewUrl: null,
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    events: [],
    tasks: [],
    submissions: [],
    transitions: [],
    customerPreview: { reference: "PR-1", type: "PROFILE_RECOVERY", summary: "", notes: [] },
    ...overrides,
  }
}

function show(
  source: CaseFlowFacts,
  orders: MoneyOrder[] | null,
  submissions: Submission[] | null,
  order: ServiceOrder | null = null,
  detail: CaseDetail = caseDetail({ stage: source.technicalStage === "OUTCOME_REVIEW" ? "OUTCOME_REVIEW" : "INITIAL_REVIEW", type: source.caseType, track: source.serviceTrack === "MANAGED" ? "MANAGED" : source.serviceTrack === "GUIDED" ? "GUIDED" : "UNDECIDED", status: source.caseStatus, outcome: source.outcome as CaseDetail["outcome"] }),
  events: { id: string; event: string; details: Record<string, unknown> }[] = [],
  verificationReady = true,
) {
  const work = events.map(event => ({ ...event, createdAt: WHEN }))
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
    order,
    events: work,
    verificationReady,
  })
  const journey = presentCaseJourney(source, NOW, work, {
    ...(presented.disagreed ? { outcomeRecordsDisagree: true } : {}),
    outcomeEvents: work,
  })
  const locked = journey.steps.find(step => step.id === "OUTCOME_BILLING")?.state === "LOCKED"
  return render(<CaseJourneyView
    reference="PR-1"
    customer="Alex"
    business="Bakery"
    caseId={CASE_ID}
    journey={journey}
    selectedId="OUTCOME_BILLING"
    brief={brief}
    version={4}
    documents={null}
    outcome={locked ? null : { caseDetail: detail, panel: presented.panel }}
  />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("guided outcome verification", () => {
  it("keeps a locked step free of billing commands", () => {
    show(facts({ technicalStage: "INITIAL_REVIEW", caseStatus: "UNDER_REVIEW", outcome: null, submissions: [], commercial: { complete: true, quotes: [] }, payment: { complete: true, orders: [] } }), [], [])
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Outcome verification stays closed until the earlier steps are recorded.")).toBeTruthy()
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
    expect(screen.queryByText("Record outcome")).toBeNull()
    expect(screen.queryByRole("button", { name: /Close case|Submit to Google/i })).toBeNull()
  })

  it("shows a settled Guided receipt and does not offer another charge", () => {
    show(facts(), [money()], [attempt()])
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).toHaveAttribute("data-state", "COMPLETED")
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Settled")
    expect(screen.getByText(/GOOGLE-123: Decision recorded/)).toBeTruthy()
    expect(screen.getAllByText(/No second charge/).length).toBeGreaterThan(0)
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
    expect(screen.queryByText("Record outcome")).toBeNull()
    expect(screen.queryByRole("button", { name: /Close case|Submit to Google|Mark as paid/i })).toBeNull()
  })

  it("approves a qualifying Managed fee without taking payment, and withholds the command otherwise", async () => {
    const versionId = "66666666-6666-4666-8666-666666666666"
    const source = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true, receiptRecorded: false }] },
      evidence: { requests: [], versions: [{ documentId: "77777777-7777-4777-8777-777777777777", versionId, evidenceRequestId: "request-1", uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED" }] },
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
    show(source, [row], [attempt({ actor: "ADMIN", track: "MANAGED" })], serviceOrder())
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Pending billing")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).not.toHaveAttribute("data-state", "COMPLETED")
    fireEvent.click(screen.getByText("Approve the success fee"))
    fireEvent.change(screen.getByLabelText("Accepted outcome evidence"), { target: { value: versionId } })
    fireEvent.change(screen.getByLabelText("Evidence note"), { target: { value: "The restored listing screenshot was accepted." } })
    fireEvent.change(screen.getByLabelText("Approval reason"), { target: { value: "The qualifying restoration is documented." } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The success fee is approved. It is collected by a hosted invoice after verified success. This did not charge a saved card." }) })
    vi.stubGlobal("fetch", fetchMock)
    fireEvent.submit(screen.getByRole("button", { name: "Approve success fee" }).closest("form")!)
    expect(await screen.findByText(/did not charge a saved card/)).toBeTruthy()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/payments")
    expect(payload.operation).toBe("approve_success_fee")
    expect(payload.outcomeEvidenceVersionId).toBe(versionId)
    expect(payload.operation).not.toBe("issue_invoice_fallback")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).not.toHaveAttribute("data-state", "COMPLETED")

    cleanup()
    const unsuccessful = facts({
      outcome: "NOT_RESTORED",
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true, receiptRecorded: false }] },
    })
    show(unsuccessful, [money({
      serviceCode: "MANAGED_RELAUNCH",
      paymentModel: "SUCCESS_FEE",
      orderState: "ACCEPTED_SUCCESS_FEE",
      obligationId: null,
      obligationKind: null,
      obligationState: null,
      setupReady: true,
      consentId: "consent-1",
      receiptId: null,
    })], [attempt({ actor: "ADMIN", track: "MANAGED" })])
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Not billable")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).toHaveAttribute("data-state", "COMPLETED")
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
  })

  it("settles an awaiting Guided order when the obligation is paid and a receipt is recorded", () => {
    const source = facts({
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "PAID", setupReady: false, consentRecorded: false, receiptRecorded: true }] },
    })
    show(source, [money({ orderState: "ACCEPTED_AWAITING_PAYMENT" })], [attempt()])
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Settled")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).toHaveAttribute("data-state", "COMPLETED")
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
    expect(screen.queryByText("Record outcome")).toBeNull()

    cleanup()
    const unpaidReceipt = facts({
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "PAID", setupReady: false, consentRecorded: false, receiptRecorded: false }] },
    })
    show(unpaidReceipt, [money({ orderState: "ACCEPTED_AWAITING_PAYMENT", receiptId: null })], [attempt()])
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Billing records disagree")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
  })

  it("offers approval for one valid proof among extra accepted files, and withholds a rejected or mismatched record", () => {
    const selected = "66666666-6666-4666-8666-666666666666"
    const source = facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true, receiptRecorded: false }] },
      evidence: {
        requests: [],
        versions: ["66666666-6666-4666-8666-666666666666", "77777777-7777-4777-8777-777777777777", "88888888-8888-4888-8888-888888888888"].map(versionId => ({
          documentId: `doc-${versionId}`,
          versionId,
          evidenceRequestId: "request-1",
          uploadStatus: "UPLOADED",
          scanStatus: "NO_THREATS_FOUND",
          validationStatus: "VALID",
          reviewStatus: "ACCEPTED",
        })),
      },
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
      acceptedEvidence: [{ id: selected, filename: "outcome.png", versionNumber: 1 }],
    })
    show(source, [row], [attempt({ actor: "ADMIN", track: "MANAGED" })], serviceOrder())
    expect(screen.getByText("Approve the success fee")).toBeTruthy()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()

    cleanup()
    show(facts({
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true, receiptRecorded: false }] },
      evidence: { requests: [], versions: [{ documentId: "doc-1", versionId: selected, evidenceRequestId: "request-1", uploadStatus: "UPLOADED", scanStatus: "THREATS_FOUND", validationStatus: "VALID", reviewStatus: "REJECTED" }] },
      capabilities: { liveMailEnabled: false, paymentsEnabled: true, googleSubmissionLive: false },
    }), [row], [attempt({ actor: "ADMIN", track: "MANAGED" })], serviceOrder())
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()

    cleanup()
    show(source, [money({ ...row, customerId: "12121212-1212-4121-8121-121212121212" })], [attempt({ actor: "ADMIN", track: "MANAGED" })], serviceOrder())
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
  })

  it("records an outcome without closing the case, approving a fee, or taking payment", async () => {
    const source = facts({
      technicalStage: "OUTCOME_REVIEW",
      caseStatus: "UNDER_REVIEW",
      outcome: null,
      outcomeSummary: "",
      submissions: [],
      commercial: { complete: true, quotes: [] },
      payment: { complete: true, orders: [] },
    })
    show(source, [], [])
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).not.toHaveAttribute("data-state", "LOCKED")
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Outcome not recorded")
    fireEvent.click(screen.getByText("Record outcome", { selector: "summary" }))
    expect(screen.getByText(/does not close the case, change the stage, approve a success fee/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "RESTORED" } })
    fireEvent.change(screen.getByLabelText("Customer summary"), { target: { value: "The listing was restored and the customer can see it." } })
    fireEvent.change(screen.getByRole("textbox", { name: /Supporting note/ }), { target: { value: "Reviewed the restoration evidence before recording it." } })
    fireEvent.click(screen.getByRole("checkbox", { name: /checked the outcome evidence/ }))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Saved. The case history has been updated.", id: CASE_ID }) })
    vi.stubGlobal("fetch", fetchMock)
    fireEvent.submit(screen.getByRole("button", { name: "Record outcome" }).closest("form")!)
    expect(await screen.findByText("Saved. The case history has been updated.")).toBeTruthy()
    expect(screen.queryByText(/case is closed|success fee is approved|invoice issued/i)).toBeNull()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/command")
    expect(payload.operation).toBe("record_outcome")
    expect(payload.data.outcome).toBe("RESTORED")
    expect(payload.data.summary).toBe("The listing was restored and the customer can see it.")
    expect(payload.operation).not.toBe("close")
    expect(payload.operation).not.toBe("approve_success_fee")
    expect(payload.operation).not.toBe("issue_invoice_fallback")

    cleanup()
    show(source, [], [])
    fireEvent.click(screen.getByText("Record outcome", { selector: "summary" }))
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "RESTORED" } })
    fireEvent.change(screen.getByLabelText("Customer summary"), { target: { value: "The listing was restored and the customer can see it." } })
    fireEvent.change(screen.getByRole("textbox", { name: /Supporting note/ }), { target: { value: "Reviewed the restoration evidence before recording it." } })
    fireEvent.click(screen.getByRole("checkbox", { name: /checked the outcome evidence/ }))
    const denied = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: "This action is not available at the current case stage. Reload and check the case." }) })
    vi.stubGlobal("fetch", denied)
    fireEvent.submit(screen.getByRole("button", { name: "Record outcome" }).closest("form")!)
    expect(await screen.findByText(/not available at the current case stage/)).toBeTruthy()

    cleanup()
    show(source, [], [])
    fireEvent.click(screen.getByText("Record outcome", { selector: "summary" }))
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "RESTORED" } })
    fireEvent.change(screen.getByLabelText("Customer summary"), { target: { value: "The listing was restored and the customer can see it." } })
    fireEvent.change(screen.getByRole("textbox", { name: /Supporting note/ }), { target: { value: "Reviewed the restoration evidence before recording it." } })
    fireEvent.click(screen.getByRole("checkbox", { name: /checked the outcome evidence/ }))
    const stale = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: "This case has changed. Reload it before trying again." }) })
    vi.stubGlobal("fetch", stale)
    fireEvent.submit(screen.getByRole("button", { name: "Record outcome" }).closest("form")!)
    expect(await screen.findByText(/Reload it before trying again/)).toBeTruthy()
  })

  it("hides the record form when an outcome is already stored", () => {
    show(facts({ technicalStage: "OUTCOME_REVIEW", caseStatus: "UNDER_REVIEW" }), [money()], [attempt()])
    expect(screen.queryByText("Record outcome")).toBeNull()
    expect(screen.queryByRole("button", { name: "Record outcome" })).toBeNull()
  })

  it("shows a fresh outcome after reopen, and withholds a retained one", () => {
    const summary = "The listing was restored."
    const versionId = "66666666-6666-4666-8666-666666666666"
    const managed = facts({
      reopened: true,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
      serviceTrack: "MANAGED",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
      payment: { complete: true, orders: [{ orderId: ORDER_ID, paymentModel: "SUCCESS_FEE", orderState: "ACCEPTED_SUCCESS_FEE", obligationKind: null, obligationState: null, setupReady: true, consentRecorded: true, receiptRecorded: false }] },
      evidence: { requests: [], versions: [{ documentId: "77777777-7777-4777-8777-777777777777", versionId, evidenceRequestId: "request-1", uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED" }] },
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
    const fresh = [
      { id: "9", event: "reopen", details: { previousOutcome: "RESTORED" } },
      { id: "10", event: "record_outcome", details: { outcome: "RESTORED", summary, closesCase: false } },
    ]
    show(managed, [row], [attempt({ actor: "ADMIN", track: "MANAGED" })], serviceOrder(), caseDetail({
      stage: "OUTCOME_REVIEW",
      type: "PROFILE_RECOVERY",
      track: "MANAGED",
      status: "UNDER_REVIEW",
      outcome: "RESTORED",
      summary,
    }), fresh)
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Pending billing")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).not.toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-step='CLOSURE']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getAllByText(/later record stored this outcome/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/not an authoritative pre-closure record/)).toBeNull()
    expect(screen.getByText("Approve the success fee")).toBeTruthy()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
    expect(screen.queryByText("Record outcome")).toBeNull()
    expect(screen.queryByRole("button", { name: /Close case/i })).toBeNull()

    cleanup()
    show(facts({
      reopened: true,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
    }), [money()], [attempt()])
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Billing records disagree")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-step='CLOSURE']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getAllByText(/not an authoritative pre-closure record/).length).toBeGreaterThan(0)
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
    expect(screen.queryByText("Record outcome")).toBeNull()

    cleanup()
    show(facts({
      reopened: false,
      caseStatus: "UNDER_REVIEW",
      technicalStage: "OUTCOME_REVIEW",
      outcome: "RESTORED",
      outcomeSummary: summary,
    }), [money()], [attempt()])
    expect(document.querySelector("[data-outcome]")).toHaveAttribute("data-outcome", "Settled")
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).not.toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-step='CLOSURE']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getAllByText(/already stored on an open case/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/not an authoritative pre-closure record/)).toBeNull()
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Record outcome")).toBeNull()
  })
})
