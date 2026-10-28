// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { presentJourneyClosure } from "@/lib/case-journey/closure"
import { presentCaseJourney } from "@/lib/case-journey/present"
import type { CaseDetail, Submission } from "@/lib/cases/model"
import type { MoneyOrder } from "@/lib/payments/model"
import { CaseJourneyView } from "./view"
import { ClosurePanel } from "./closure"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const ORDER_ID = "88888888-8888-4888-8888-888888888888"
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111"
const WHEN = "2026-06-01T12:00:00.000Z"
const NOW = "2026-10-03T12:00:00.000Z"
const SUMMARY = "The listing was restored after the recorded appeal."

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

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "OUTCOME_REVIEW",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: "RESTORED",
    outcomeSummary: SUMMARY,
    customerId: CUSTOMER_ID,
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
    resultNote: null,
    ...overrides,
  }
}

function money(overrides: Partial<MoneyOrder> = {}): MoneyOrder {
  return {
    orderId: ORDER_ID,
    orderRef: "SO-26-ABCDEF",
    customerId: CUSTOMER_ID,
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
    version: 7,
    outcome: "RESTORED",
    summary: SUMMARY,
    priorityReason: "",
    firstResponseDue: null,
    issue: "Profile suspended",
    reviewUrl: null,
    customerId: CUSTOMER_ID,
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    events: [],
    tasks: [],
    submissions: [attempt()],
    transitions: [],
    customerPreview: { reference: "PR-1", type: "PROFILE_RECOVERY", summary: SUMMARY, notes: [] },
    ...overrides,
  }
}

function panelFor(source: CaseFlowFacts, detail: CaseDetail, precedingComplete = true, mailRecovery = false) {
  return presentJourneyClosure({
    facts: source,
    now: NOW,
    recorded: {
      submissions: detail.submissions,
      caseTrack: detail.track,
      caseOutcome: detail.outcome,
      caseStatus: detail.status,
      moneyOrders: [money()],
    },
    events: detail.events,
    detail,
    precedingComplete,
    mailRecovery,
  }).panel
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the closure step", () => {
  it("submits the existing close command with the exact recorded outcome and the current version", async () => {
    const detail = caseDetail()
    render(<ClosurePanel caseDetail={detail} panel={panelFor(facts(), detail)} />)
    expect(screen.getByText("Not closed.")).toBeTruthy()
    expect(screen.queryByLabelText("Outcome")).toBeNull()
    expect(screen.getByText(/Customer summary: The listing was restored/)).toBeTruthy()
    fireEvent.click(screen.getByText("Close with the recorded outcome"))
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.change(screen.getByLabelText(/Supporting note/), { target: { value: "Checked the restored listing before closing." } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Saved. The case history has been updated." }) })
    vi.stubGlobal("fetch", fetchMock)
    fireEvent.submit(screen.getByRole("button", { name: "Close the case" }).closest("form")!)
    expect(await screen.findByText(/case history has been updated/)).toBeTruthy()
    expect(screen.queryByText(/The case is closed/)).toBeNull()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/command")
    expect(payload.operation).toBe("close")
    expect(payload.version).toBe(7)
    expect(payload.data).toMatchObject({ outcome: "RESTORED", summary: SUMMARY })
    expect(screen.getByRole("link", { name: "Open the Guard workspace" })).toHaveAttribute("href", "/guard")
    expect(screen.queryByRole("button", { name: /Enrol|Invoice|Charge|Submit to Google|Send/i })).toBeNull()
  })

  it("shows the command refusal for a stale version and for a denied permission", async () => {
    const detail = caseDetail()
    const panel = panelFor(facts(), detail)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: "This case has changed. Reload it before trying again." }) })
    vi.stubGlobal("fetch", fetchMock)
    const view = render(<ClosurePanel caseDetail={detail} panel={panel} />)
    fireEvent.click(screen.getByText("Close with the recorded outcome"))
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.change(screen.getByLabelText(/Supporting note/), { target: { value: "Checked the restored listing before closing." } })
    fireEvent.submit(screen.getByRole("button", { name: "Close the case" }).closest("form")!)
    expect(await screen.findByText(/Reload it before trying again/)).toBeTruthy()
    expect(screen.queryByText("Closed.")).toBeNull()

    view.unmount()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ message: "This action is not available at the current case stage. Reload and check the case." }) })
    render(<ClosurePanel caseDetail={detail} panel={panel} />)
    fireEvent.click(screen.getByText("Close with the recorded outcome"))
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.change(screen.getByLabelText(/Supporting note/), { target: { value: "Checked the restored listing before closing." } })
    fireEvent.submit(screen.getByRole("button", { name: "Close the case" }).closest("form")!)
    expect(await screen.findByText(/not available at the current case stage/)).toBeTruthy()
  })

  it("shows the settlement refusal and does not claim the case is closed", async () => {
    const detail = caseDetail()
    const panel = panelFor(facts(), detail)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: "Closure needs the accepted service for this case and the recorded settlement that service requires. A checkout return, a saved card or an unpaid fee is not enough, and an unsuccessful case is not charged in order to close." }),
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<ClosurePanel caseDetail={detail} panel={panel} />)
    fireEvent.click(screen.getByText("Close with the recorded outcome"))
    expect(screen.getByText(/An unpaid fee, a checkout return or a saved card does not close the case/)).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.change(screen.getByLabelText(/Supporting note/), { target: { value: "Checked the restored listing before closing." } })
    fireEvent.submit(screen.getByRole("button", { name: "Close the case" }).closest("form")!)
    expect(await screen.findByText(/is not enough/)).toBeTruthy()
    expect(screen.queryByText("Closed.")).toBeNull()
    expect(screen.queryByText(/The case is closed/)).toBeNull()
    expect(screen.queryByText(/case history has been updated/)).toBeNull()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cases/command")
    expect(payload.operation).toBe("close")
  })

  it("reopens with the existing command and does not offer close again", async () => {
    const source = facts({
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "WITHDRAWN" }],
    })
    const detail = caseDetail({
      status: "CANCELLED",
      stage: "FINISHED",
      outcome: "WITHDRAWN",
      submissions: [attempt({ result: "WITHDRAWN" })],
      events: [{
        id: "9",
        event: "close",
        note: "Customer withdrew.",
        visibility: "INTERNAL",
        createdAt: WHEN,
        details: { outcome: "WITHDRAWN", summary: SUMMARY },
      }],
    })
    render(<ClosurePanel caseDetail={detail} panel={panelFor(source, detail)} />)
    expect(screen.getByText("Cancelled.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Closure record" })).toBeTruthy()
    expect(screen.getByText(/Status CANCELLED/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Close the case" })).toBeNull()
    fireEvent.click(screen.getByText("Reopen with a follow-up task"))
    fireEvent.change(screen.getByLabelText("Task"), { target: { value: "Review the withdrawal" } })
    fireEvent.change(screen.getByLabelText("Due date and time (UTC)"), { target: { value: "2026-11-01T12:00" } })
    fireEvent.change(screen.getByLabelText("Source of deadline"), { target: { value: "Follow-up agreed on the phone" } })
    fireEvent.change(screen.getByLabelText(/Supporting note/), { target: { value: "The customer asked for another look." } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Saved. The case history has been updated." }) })
    vi.stubGlobal("fetch", fetchMock)
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!)
    expect(await screen.findByText(/case history has been updated/)).toBeTruthy()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("reopen")
    expect(payload.version).toBe(7)
    expect(payload.data.title).toBe("Review the withdrawal")
  })

  it("keeps a locked closure step free of the close control", () => {
    const source = facts({ technicalStage: "INITIAL_REVIEW", caseStatus: "UNDER_REVIEW", outcome: null, outcomeSummary: "", submissions: [], commercial: { complete: true, quotes: [] }, payment: { complete: true, orders: [] } })
    const journey = presentCaseJourney(source, NOW)
    render(<CaseJourneyView
      reference="PR-1"
      customer="Alex"
      business="Bakery"
      caseId={CASE_ID}
      journey={journey}
      selectedId="CLOSURE"
      brief={brief}
      version={4}
      documents={null}
    />)
    expect(document.querySelector("[data-step='CLOSURE']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Closure stays closed until the earlier steps are recorded.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Close the case" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Open the Guard workspace" })).toBeNull()
  })

  it("shows a cancelled case as cancelled and links Guard without offering it", () => {
    const source = facts({
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "WITHDRAWN" }],
    })
    const detail = caseDetail({
      status: "CANCELLED",
      stage: "FINISHED",
      outcome: "WITHDRAWN",
      submissions: [attempt({ result: "WITHDRAWN" })],
    })
    const journey = presentCaseJourney(source, NOW)
    render(<CaseJourneyView
      reference="PR-1"
      customer="Alex"
      business="Bakery"
      caseId={CASE_ID}
      journey={journey}
      selectedId="CLOSURE"
      brief={brief}
      version={7}
      documents={null}
      closure={{ caseDetail: detail, panel: panelFor(source, detail, false) }}
    />)
    expect(document.querySelector("[data-step='CLOSURE']")).toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getByText("This case is cancelled. The database status is CANCELLED. Optional Guard was not required.")).toBeTruthy()
    expect(document.querySelector("[data-closure]")).toHaveAttribute("data-closure", "Cancelled")
    expect(screen.getByRole("link", { name: "Open the Guard workspace" })).toHaveAttribute("href", "/guard")
    expect(screen.getByText(/does not enrol the customer/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Close the case" })).toBeNull()
  })

  it("renders an inconsistent terminal record as needs attention and still offers reopen", () => {
    const summary = "The customer withdrew the request."
    const withdrawn = facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: "WITHDRAWN",
      outcomeSummary: summary,
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "WITHDRAWN" }],
    })
    const withdrawnDetail = caseDetail({
      status: "CLOSED",
      stage: "FINISHED",
      outcome: "WITHDRAWN",
      summary,
      submissions: [attempt({ result: "WITHDRAWN" })],
    })
    const withdrawnJourney = presentCaseJourney(withdrawn, NOW)
    render(<CaseJourneyView
      reference="PR-1"
      customer="Alex"
      business="Bakery"
      caseId={CASE_ID}
      journey={withdrawnJourney}
      selectedId="CLOSURE"
      brief={brief}
      version={7}
      documents={null}
      closure={{ caseDetail: withdrawnDetail, panel: panelFor(withdrawn, withdrawnDetail, false) }}
    />)
    expect(document.querySelector("[data-step='CLOSURE']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(screen.getByText("This closure record is inconsistent. The database status is shown for diagnosis. It is not a verified closure.")).toBeTruthy()
    expect(document.querySelector("[data-closure]")).toHaveAttribute("data-closure", "Inconsistent closure")
    expect(screen.getAllByText(/database status is CLOSED/).length).toBeGreaterThan(0)
    expect(screen.queryByRole("heading", { name: "Closure record" })).toBeNull()
    expect(screen.getByText("Reopen with a follow-up task")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Close the case" })).toBeNull()
    expect(screen.queryByText(/included Guard offer/)).toBeNull()

    cleanup()
    const cancelled = facts({
      caseStatus: "CANCELLED",
      technicalStage: "FINISHED",
      outcome: "RESTORED",
      outcomeSummary: SUMMARY,
    })
    const cancelledDetail = caseDetail({
      status: "CANCELLED",
      stage: "FINISHED",
      outcome: "RESTORED",
      summary: SUMMARY,
    })
    render(<CaseJourneyView
      reference="PR-1"
      customer="Alex"
      business="Bakery"
      caseId={CASE_ID}
      journey={presentCaseJourney(cancelled, NOW)}
      selectedId="CLOSURE"
      brief={brief}
      version={7}
      documents={null}
      closure={{ caseDetail: cancelledDetail, panel: panelFor(cancelled, cancelledDetail, false) }}
    />)
    expect(document.querySelector("[data-step='CLOSURE']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-closure]")).toHaveAttribute("data-closure", "Inconsistent closure")
    expect(screen.getAllByText(/database status is CANCELLED/).length).toBeGreaterThan(0)
    expect(screen.queryByText("Cancelled.")).toBeNull()
    expect(screen.queryByRole("heading", { name: "Closure record" })).toBeNull()
    expect(screen.getByText("Reopen with a follow-up task")).toBeTruthy()
  })

  it("offers one completion update on a closed Guided case that has no completion email", () => {
    const summary = "The Guided preparation was handed to the customer."
    const source = facts({
      caseStatus: "CLOSED",
      technicalStage: "FINISHED",
      outcome: null,
      outcomeSummary: summary,
      submissions: [],
    })
    const detail = caseDetail({
      status: "CLOSED",
      stage: "FINISHED",
      outcome: null,
      summary,
      submissions: [],
    })
    render(<ClosurePanel caseDetail={detail} panel={panelFor(source, detail, true, false)} />)
    expect(screen.getByText(/No case-closure email has been queued/)).toBeTruthy()
    expect(screen.getByText(/document-ready email/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send completion update" })).toBeNull()
    cleanup()
    render(<ClosurePanel caseDetail={detail} panel={panelFor(source, detail, true, true)} />)
    expect(screen.getByText("Send the completion update")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send completion update" })).toBeTruthy()
    expect(screen.getAllByText(/The Guided preparation is already closed/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/The provider reported delivery/)).toBeNull()
  })
})
