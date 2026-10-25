// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { buildJourneySubmissionPanel } from "@/lib/case-journey/submission"
import { presentCaseJourney } from "@/lib/case-journey/present"
import type { CaseDetail, Submission } from "@/lib/cases/model"
import { SubmissionPanel } from "./submission"
import { CaseJourneyView } from "./view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const WHEN = "2026-06-01T12:00:00.000Z"

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
    technicalStage: "READY_TO_SUBMIT",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["WAITING_GOOGLE"],
    reopened: false,
    tasks: [],
    submissions: [],
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
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [{ orderId: "88888888-8888-4888-8888-888888888888", paymentModel: "UPFRONT", orderState: "ACCEPTED_AWAITING_PAYMENT", obligationKind: "UPFRONT", obligationState: "PAID", setupReady: false, consentRecorded: false, receiptRecorded: true }] },
    evidence: { requests: [], versions: [{ documentId: "77777777-7777-4777-8777-777777777777", versionId: "66666666-6666-4666-8666-666666666666", evidenceRequestId: "request-1", uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "ACCEPTED" }] },
    packs: { packs: [{ id: "pack-1", packNumber: 1, status: "APPROVED", published: true, everPublished: true, itemCount: 1 }], eligibleCount: 0 },
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
    result: null,
    resultNote: null,
    ...overrides,
  }
}

function detail(source: CaseFlowFacts, submissions: Submission[], stage: CaseDetail["stage"]): CaseDetail {
  return {
    id: CASE_ID,
    reference: "PR-1",
    type: "PROFILE_RECOVERY",
    stage,
    track: source.serviceTrack,
    status: source.caseStatus,
    client: "Alex",
    business: "Bakery",
    assigned: true,
    priority: "NORMAL",
    nextAction: "",
    due: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    version: 4,
    outcome: null,
    summary: "",
    priorityReason: "",
    firstResponseDue: null,
    issue: "The listing was suspended.",
    reviewUrl: null,
    customerId: source.customerId ?? "11111111-1111-4111-8111-111111111111",
    businessId: source.businessId ?? "22222222-2222-4222-8222-222222222222",
    locationId: source.locationId ?? "33333333-3333-4333-8333-333333333333",
    events: [],
    tasks: [],
    submissions,
    transitions: [],
    customerPreview: { reference: "PR-1", type: "PROFILE_RECOVERY", summary: "", notes: [] },
  }
}

function show(source: CaseFlowFacts, submissions: Submission[] | null, stage: CaseDetail["stage"]) {
  const now = "2026-10-03T12:00:00.000Z"
  const panel = buildJourneySubmissionPanel({
    facts: source,
    submissions,
    status: source.caseStatus,
    track: source.serviceTrack,
    stage,
  })
  const journey = presentCaseJourney(source, now, [], submissions !== null && panel.headline === "Submission records disagree" ? { submissionRecordsDisagree: true } : {})
  const locked = journey.steps.find(step => step.id === "SUBMISSION")?.state === "LOCKED"
  const caseDetail = detail(source, submissions ?? [], stage)
  return render(<CaseJourneyView
    reference="PR-1"
    customer="Alex"
    business="Bakery"
    caseId={CASE_ID}
    journey={journey}
    selectedId="SUBMISSION"
    brief={brief}
    version={4}
    documents={null}
    submission={locked ? null : { caseDetail, panel }}
  />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("guided submission tracking", () => {
  it("keeps a locked step free of submission commands", () => {
    show(facts({ technicalStage: "INITIAL_REVIEW", allowedTransitions: ["ASSESSMENT_READY"], packs: { packs: [], eligibleCount: 0 } }), [], "INITIAL_REVIEW")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Submission tracking stays closed until the earlier steps are recorded.")).toBeTruthy()
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
  })

  it("records an external attempt without submitting it to Google", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Saved. The case history has been updated." }) })
    vi.stubGlobal("fetch", fetchMock)
    show(facts(), [], "READY_TO_SUBMIT")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "NOT_APPLICABLE")
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    cleanup()
    const source = facts()
    const panel = buildJourneySubmissionPanel({
      facts: source,
      submissions: [],
      status: source.caseStatus,
      track: source.serviceTrack,
      stage: "READY_TO_SUBMIT",
    })
    render(<SubmissionPanel caseDetail={detail(source, [], "READY_TO_SUBMIT")} panel={panel} />)
    expect(document.querySelector("[data-submission]")).toHaveAttribute("data-submission", "Not submitted")
    fireEvent.click(screen.getByText("Record an externally completed submission"))
    fireEvent.change(screen.getByLabelText("Submission date and time (UTC)"), { target: { value: "2026-06-01T12:00" } })
    fireEvent.change(screen.getByLabelText("Google reference or submission receipt reference"), { target: { value: "GOOGLE-123" } })
    fireEvent.change(screen.getByLabelText("Submission channel"), { target: { value: "Google appeals tool" } })
    fireEvent.change(screen.getByLabelText("Customer confirmation and evidence reference"), { target: { value: "Submission receipt reviewed and referenced" } })
    fireEvent.click(screen.getByRole("checkbox", { name: /already completed/i }))
    fireEvent.change(screen.getByRole("textbox", { name: /Supporting note/ }), { target: { value: "The customer sent the appeal yesterday." } })
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!)
    expect(await screen.findByText(/case history has been updated/)).toBeTruthy()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("submission")
    expect(payload.data.confirmed).toBe(true)
    expect(payload.data.reference).toBe("GOOGLE-123")
    expect(payload.data.evidence).toMatch(/receipt/)
    expect(payload.operation).not.toBe("resolve_submission")
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
  })

  it("records a withdrawal on an open attempt and does not start another", async () => {
    const source = facts({
      technicalStage: "WAITING_GOOGLE",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: null }],
    })
    show(source, [attempt()], "WAITING_GOOGLE")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "WAITING")
    expect(document.querySelector("[data-submission]")).toHaveAttribute("data-submission", "Submitted, awaiting Google's decision")
    expect(screen.getByText(/GOOGLE-123: Submitted, awaiting Google's decision/)).toBeTruthy()
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
    fireEvent.click(screen.getByText("Record a decision or withdrawal"))
    fireEvent.change(screen.getByLabelText("Attempt status"), { target: { value: "WITHDRAWN" } })
    fireEvent.change(screen.getByRole("textbox", { name: /Supporting note/ }), { target: { value: "The customer withdrew the appeal." } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Saved. The case history has been updated." }) })
    vi.stubGlobal("fetch", fetchMock)
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!)
    expect(await screen.findByText(/case history has been updated/)).toBeTruthy()
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("resolve_submission")
    expect(payload.data.result).toBe("WITHDRAWN")
    expect(payload.data.submissionId).toBe("submission-1")
  })

  it("shows a recorded decision, a second open attempt, and a conflicting record without a command", () => {
    const decided = facts({
      technicalStage: "OUTCOME_REVIEW",
      allowedTransitions: ["FINISHED"],
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "DECIDED" }],
    })
    show(decided, [attempt({ result: "DECIDED", resultNote: "The listing was restored." })], "OUTCOME_REVIEW")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "COMPLETED")
    expect(document.querySelector("[data-submission]")).toHaveAttribute("data-submission", "Decision recorded")
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()

    cleanup()
    const both = facts({
      technicalStage: "FURTHER_REVIEW",
      submissions: [
        { id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "DECIDED" },
        { id: "submission-2", actor: "CUSTOMER", submittedAt: "2026-06-02T12:00:00.000Z", result: null },
      ],
    })
    show(both, [
      attempt({ result: "DECIDED", resultNote: "First decision." }),
      attempt({ id: "submission-2", reference: "GOOGLE-456", submittedAt: "2026-06-02T12:00:00.000Z" }),
    ], "FURTHER_REVIEW")
    expect(document.querySelector("[data-step='SUBMISSION']")).not.toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getByText(/GOOGLE-456: Submitted, awaiting Google's decision/)).toBeTruthy()
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()

    cleanup()
    const conflict = facts({
      technicalStage: "FURTHER_REVIEW",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "DECIDED" }],
    })
    show(conflict, [attempt()], "FURTHER_REVIEW")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(screen.getAllByText(/records disagree/).length).toBeGreaterThan(0)
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.queryByText("Record a decision or withdrawal")).toBeNull()
  })

  it("withholds every command when the recorded track is not the case track", () => {
    const managed = facts({
      serviceTrack: "MANAGED",
      technicalStage: "FURTHER_REVIEW",
      submissions: [{ id: "submission-1", actor: "CUSTOMER", submittedAt: WHEN, result: "DECIDED" }],
    })
    show(managed, [attempt({ actor: "CUSTOMER", track: "GUIDED", result: "DECIDED", resultNote: "The listing was restored." })], "FURTHER_REVIEW")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-submission]")).toHaveAttribute("data-submission", "Submission records disagree")
    expect(screen.getAllByText(/service track/).length).toBeGreaterThan(0)
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.queryByText("Record a decision or withdrawal")).toBeNull()

    cleanup()
    const guided = facts({
      serviceTrack: "GUIDED",
      technicalStage: "FURTHER_REVIEW",
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
    })
    show(guided, [attempt({ actor: "ADMIN", track: "MANAGED", result: "DECIDED", resultNote: "ProfileRelaunch sent the appeal." })], "FURTHER_REVIEW")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(document.querySelector("[data-submission]")).toHaveAttribute("data-submission", "Submission records disagree")
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.queryByText("Record a decision or withdrawal")).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()

    cleanup()
    const matching = facts({
      serviceTrack: "MANAGED",
      technicalStage: "OUTCOME_REVIEW",
      allowedTransitions: ["FINISHED"],
      submissions: [{ id: "submission-1", actor: "ADMIN", submittedAt: WHEN, result: "DECIDED" }],
    })
    show(matching, [attempt({ actor: "ADMIN", track: "MANAGED", result: "DECIDED", resultNote: "The listing was restored." })], "OUTCOME_REVIEW")
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "COMPLETED")
    expect(document.querySelector("[data-submission]")).toHaveAttribute("data-submission", "Decision recorded")
    expect(screen.queryByText("Record a decision or withdrawal")).toBeNull()
  })
})
