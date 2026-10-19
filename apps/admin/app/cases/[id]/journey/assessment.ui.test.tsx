// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { AssessmentVersionView, CaseAssessmentView } from "@/lib/case-journey/assessment"
import type { JourneyIntakeBrief } from "@/lib/case-journey/intake"
import { presentCaseJourney } from "@/lib/case-journey/present"
import { CaseJourneyView } from "./view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const NOW = "2026-10-03T12:00:00.000Z"
const CASE_ID = "55555555-5555-4555-8555-555555555555"
const VERSION_ID = "77777777-7777-4777-8777-777777777777"

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
    technicalStage: "ASSESSMENT_READY",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "UNDECIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["EVIDENCE_COLLECTION", "SERVICE_SELECTION"],
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
    evidence: {
      requests: [{ id: "request-1", status: "FULFILLED", dueAt: null, createdAt: "2026-09-01T00:00:00.000Z" }],
      versions: [{
        documentId: "document-1",
        versionId: "version-1",
        evidenceRequestId: "request-1",
        uploadStatus: "UPLOADED",
        scanStatus: "NO_THREATS_FOUND",
        validationStatus: "VALID",
        reviewStatus: "ACCEPTED",
      }],
    },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    ...overrides,
  }
}

function version(overrides: Partial<AssessmentVersionView> = {}): AssessmentVersionView {
  return {
    id: VERSION_ID,
    versionNumber: 1,
    status: "DRAFT",
    recordVersion: 2,
    findings: "The profile was suspended and the ownership letter matches the account.",
    evidenceConsidered: "Accepted ownership letter on a fulfilled request.",
    profileIssue: "The listing is suspended.",
    policyConcerns: "Ownership is the policy concern.",
    recommendedAction: "Recommend the Guided pathway.",
    servicePathway: "GUIDED",
    rationale: "The accepted evidence supports a guided recovery.",
    risks: "Google may still refuse the appeal.",
    outstandingInformation: "The customer has not sent a second bill.",
    draftedAt: "2026-10-01T12:00:00.000Z",
    reviewedAt: null,
    approvedAt: null,
    current: false,
    stale: false,
    staleReason: null,
    ...overrides,
  }
}

function assessment(versions: AssessmentVersionView[]): CaseAssessmentView {
  return { workflowVersion: 3, basisFingerprint: "a".repeat(32), reopenedAt: null, versions }
}

function show(view: CaseAssessmentView | null, phase: "none" | "draft" | "reviewed" | "approved" | "stale" | "reopened" = "none") {
  const pathway = view?.versions[0]?.servicePathway ?? null
  const journey = presentCaseJourney(facts(), NOW, [], {
    assessment: phase === "none" ? null : { phase, pathway, versionNumber: view?.versions[0]?.versionNumber ?? null },
  })
  return render(<CaseJourneyView
    reference="PR-1"
    customer="Alex"
    business="Bakery"
    caseId={CASE_ID}
    journey={journey}
    selectedId="ASSESSMENT"
    brief={brief}
    version={3}
    documents={null}
    assessment={view}
  />)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("guided assessment", () => {
  it("keeps an empty step editable and does not treat the save as completion", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: "Saved as a draft. Saving a draft does not complete this step." }),
    })
    vi.stubGlobal("fetch", fetchMock)
    show(null)
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "CURRENT")
    expect(screen.getByText(/Saving the form does not complete this step/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Approve assessment" })).toBeNull()
    fireEvent.submit(screen.getByRole("button", { name: "Save draft" }).closest("form")!)
    expect(await screen.findByRole("status")).toHaveTextContent(/does not complete this step/)
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.operation).toBe("save_draft")
    expect(payload.data.recordVersion).toBe(0)
    expect(payload).not.toHaveProperty("actor")
    expect(document.querySelector("[data-step='ASSESSMENT']")).not.toHaveAttribute("data-state", "COMPLETED")
  })

  it("reviews a stored draft and approves only the stored record version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Marked for review. Reviewing it does not complete this step." }) })
    vi.stubGlobal("fetch", fetchMock)
    const { unmount } = show(assessment([version()]), "draft")
    expect(document.querySelector("[data-step='ASSESSMENT']")).not.toHaveAttribute("data-state", "COMPLETED")
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }))
    expect(await screen.findByRole("status")).toHaveTextContent(/does not complete this step/)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ operation: "submit_review", data: { recordVersion: 2 } })
    unmount()

    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Approved. The step is complete only while this approval still matches the case, the profile, and the evidence, and the case has not been reopened." }) })
    show(assessment([version({ status: "REVIEWED", reviewedAt: "2026-10-02T12:00:00.000Z", recordVersion: 3 })]), "reviewed")
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Approve assessment" }))
    await screen.findByText(/complete only while/)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ operation: "approve", data: { recordVersion: 3 } })
    expect(screen.getByText("Service: Not chosen")).toBeTruthy()
  })

  it("shows a current recommendation as not an agreement, and a stale approval as not current", () => {
    const { unmount } = show(assessment([version({
      status: "APPROVED",
      current: true,
      reviewedAt: "2026-10-02T12:00:00.000Z",
      approvedAt: "2026-10-03T12:00:00.000Z",
    })]), "approved")
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "COMPLETED")
    expect(screen.getAllByText(/It is not an accepted agreement and the service is not activated/).length).toBeGreaterThan(0)
    expect(screen.getByText("Service: Not chosen")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Start a new draft" }))
    expect(screen.getByText(/does not undo the current approval/)).toBeTruthy()
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "COMPLETED")
    unmount()

    show(assessment([version({
      status: "APPROVED",
      current: false,
      stale: true,
      staleReason: "facts",
      reviewedAt: "2026-10-02T12:00:00.000Z",
      approvedAt: "2026-10-03T12:00:00.000Z",
    })]), "stale")
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "NEEDS_ATTENTION")
    expect(screen.getAllByText(/no longer matches the case, the profile, or the evidence/).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Approve assessment" })).toBeNull()
  })
})
