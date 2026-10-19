// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import { caseDetail, CASE_ID, CUSTOMER_ID } from "../cockpit/fixtures"

const notFoundError = new Error("NEXT_NOT_FOUND")
const requireStaff = vi.fn()
const getCase = vi.fn()
const loadCaseFlowFacts = vi.fn()
const recordDetail = vi.fn()
const getMembership = vi.fn()
const loadJourneyExtension = vi.fn()
const loadCaseAssessment = vi.fn(async (..._args: unknown[]) => null)
const getEvidenceCase = vi.fn()
const loadCaseCommunications = vi.fn()
const loadCatalogue = vi.fn(async (..._args: unknown[]) => ({ prices: [], services: [] }))
const loadQuote = vi.fn(async (..._args: unknown[]) => null)
const loadOrder = vi.fn(async (..._args: unknown[]) => null)
const loadMoney = vi.fn(async (..._args: unknown[]) => ({ orders: [] }))
const getCaseAuthorization = vi.fn(async (..._args: unknown[]) => null)
const getPreparedPackCase = vi.fn(async (..._args: unknown[]) => ({ caseId: "55555555-5555-4555-8555-555555555555", packs: [], eligible: [] }))

vi.mock("next/navigation", () => ({
  notFound: () => { throw notFoundError },
  useRouter: () => ({ refresh: () => undefined }),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))
vi.mock("@/lib/require-staff", () => ({ requireStaff: () => requireStaff() }))
vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("@/lib/case-flow/load", () => ({ loadCaseFlowFacts: (...args: unknown[]) => loadCaseFlowFacts(...args) }))
vi.mock("@/lib/records/queries", () => ({
  recordDetail: (...args: unknown[]) => recordDetail(...args),
  getMembership: (...args: unknown[]) => getMembership(...args),
}))
vi.mock("@/lib/case-journey/read", () => ({ loadJourneyExtension: (...args: unknown[]) => loadJourneyExtension(...args) }))
vi.mock("@/lib/case-journey/assessment-command", () => ({ loadCaseAssessment: (...args: unknown[]) => loadCaseAssessment(...args) }))
vi.mock("@/lib/evidence/queries", () => ({ getEvidenceCase: (...args: unknown[]) => getEvidenceCase(...args) }))
vi.mock("@/lib/communications/queries", () => ({ loadCaseCommunications: (...args: unknown[]) => loadCaseCommunications(...args) }))
vi.mock("@/lib/commerce/queries", () => ({
  loadCatalogue: (...args: unknown[]) => loadCatalogue(...args),
  loadQuote: (...args: unknown[]) => loadQuote(...args),
  loadOrder: (...args: unknown[]) => loadOrder(...args),
}))
vi.mock("@/lib/payments/queries", () => ({ loadMoney: (...args: unknown[]) => loadMoney(...args) }))
vi.mock("@/lib/authorization/queries", () => ({ getCaseAuthorization: (...args: unknown[]) => getCaseAuthorization(...args) }))
vi.mock("@/lib/packs/queries", () => ({ getPreparedPackCase: (...args: unknown[]) => getPreparedPackCase(...args) }))

import CaseJourneyPage from "./page"

const open = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
}

function facts(): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "PR-1042",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "INITIAL_REVIEW",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "UNDECIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "22222222-2222-4222-8222-222222222222",
    businessId: "33333333-3333-4333-8333-333333333333",
    locationId: "44444444-4444-4444-8444-444444444444",
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["ASSESSMENT_READY", "EVIDENCE_COLLECTION"],
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
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

function records() {
  recordDetail.mockImplementation(async (entity: string) => ({
    record: entity === "client"
      ? { id: "client", name: "Alex Mercer", email: "alex@example.com", phone: null, emailVerified: false, version: 1 }
      : entity === "business"
        ? { id: "business", name: "Mercer Bakery", website: null, version: 1 }
        : { id: "location", name: "High Street", country: "United Kingdom", profileUrl: null, version: 1 },
    memberships: [],
    submittedBusinesses: [],
    duplicates: [],
    work: [],
  }))
  getMembership.mockResolvedValue(undefined)
  loadJourneyExtension.mockResolvedValue(null)
  getEvidenceCase.mockResolvedValue({ caseId: CASE_ID, reference: "PR-1042", requests: [], documents: [] })
  loadCaseCommunications.mockResolvedValue({
    status: "success",
    complete: true,
    total: 0,
    returned: 0,
    verifiedEmail: "alex@example.com",
    verifiedEmailSuppressed: false,
    communications: [],
  })
}

function allowPreview() {
  vi.stubEnv("VERCEL_ENV", open.VERCEL_ENV)
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", open.VERCEL_GIT_COMMIT_REF)
  vi.stubEnv("SUPABASE_URL", open.SUPABASE_URL)
}

describe("the case journey route", () => {
  it("does not resolve a case in Production or on an unrelated Preview", async () => {
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    for (const env of [
      { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "develop", SUPABASE_URL: open.SUPABASE_URL },
      { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature/other", SUPABASE_URL: open.SUPABASE_URL },
    ]) {
      vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV)
      vi.stubEnv("VERCEL_GIT_COMMIT_REF", env.VERCEL_GIT_COMMIT_REF)
      vi.stubEnv("SUPABASE_URL", env.SUPABASE_URL)
      requireStaff.mockClear()
      getCase.mockClear()
      recordDetail.mockClear()
      await expect(CaseJourneyPage({
        params: Promise.resolve({ id: CASE_ID }),
        searchParams: Promise.resolve({}),
      })).rejects.toBe(notFoundError)
      expect(requireStaff).not.toHaveBeenCalled()
      expect(getCase).not.toHaveBeenCalled()
      expect(recordDetail).not.toHaveBeenCalled()
      expect(getEvidenceCase).not.toHaveBeenCalled()
      expect(loadCaseCommunications).not.toHaveBeenCalled()
      expect(loadCatalogue).not.toHaveBeenCalled()
      expect(loadQuote).not.toHaveBeenCalled()
      expect(loadOrder).not.toHaveBeenCalled()
      expect(loadMoney).not.toHaveBeenCalled()
      expect(getCaseAuthorization).not.toHaveBeenCalled()
      expect(getPreparedPackCase).not.toHaveBeenCalled()
    }
  })

  it("shows all eleven steps to an authenticated operator on the develop Preview", async () => {
    allowPreview()
    records()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({}),
    }))
    expect(requireStaff).toHaveBeenCalled()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PR-1042")
    expect(screen.getByText("Alex Mercer — Mercer Bakery")).toBeInTheDocument()
    expect(screen.getByText("Service: Not chosen")).toBeInTheDocument()
    const nav = screen.getByRole("navigation", { name: "Eleven-step case workflow" })
    expect(nav.querySelectorAll("a")).toHaveLength(11)
    expect(nav.querySelector("[data-step='CASE_RECEIVED']")).toHaveAttribute("data-state", "CURRENT")
    expect(screen.getByRole("link", { name: /Case Received/ })).toHaveAttribute("aria-current", "step")
    expect(screen.getByRole("button", { name: "Record the intake review" })).toBeInTheDocument()
    expect(screen.getByText("The business profile was suspended without warning.")).toBeInTheDocument()
    expect(screen.getByText(/alex@example.com — Not verified/)).toBeInTheDocument()
    expect(screen.getByText(/does not verify this address/)).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Open the customer record" })).toBeNull()
    expect(screen.getByText("Mercer Bakery")).toBeInTheDocument()
    const known = screen.getByRole("heading", { name: "What is already known" })
    expect(known.closest("details")).not.toHaveAttribute("open")
    expect(screen.queryByText("No outstanding attention is recorded on the case-flow projection.")).toBeNull()
    expect(screen.queryByText("No blocker is recorded.")).toBeNull()
    const system = screen.getByText("System details").closest("details")
    expect(system).not.toHaveAttribute("open")
    expect(system).toHaveTextContent("Review the new case")
    expect(screen.queryByRole("button", { name: "Record the screening decision" })).toBeNull()
    const locked = nav.querySelectorAll("[data-state='LOCKED'] .guided-step-state")
    expect(locked).toHaveLength(0)
  })

  it("keeps a locked step readable and says why it is unavailable", async () => {
    allowPreview()
    records()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "ASSESSMENT" }),
    }))
    expect(screen.getByRole("heading", { name: "Assessment & Recommended Path" })).toBeInTheDocument()
    expect(screen.getByText("Assessment stays closed until the earlier steps are recorded.")).toBeInTheDocument()
    expect(screen.getByText(/cannot be completed from here/)).toBeInTheDocument()
    const extra = screen.getByText("Additional details").closest("details")
    expect(extra).not.toHaveAttribute("open")
    expect(extra).toHaveTextContent(/does not activate the service/)
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record the intake review" })).toBeNull()
  })

  it("keeps quote preparation closed until the earlier steps are recorded", async () => {
    allowPreview()
    records()
    loadCatalogue.mockClear()
    loadQuote.mockClear()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "QUOTE_ACCEPTANCE" }),
    }))
    expect(screen.getByRole("heading", { name: "Quote & Contract Acceptance" })).toBeInTheDocument()
    expect(screen.getByText("Quote and acceptance stay closed until the earlier steps are recorded.")).toBeInTheDocument()
    expect(document.querySelector("[data-step='QUOTE_ACCEPTANCE']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByRole("button", { name: "Create draft quote" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Offer quote" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Set draft tax" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Issue customer acceptance link" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Activate|Pay|Stripe|Choose the service track/i })).toBeNull()
    expect(loadCatalogue).not.toHaveBeenCalled()
    expect(loadQuote).not.toHaveBeenCalled()
  })

  it("keeps service activation closed until the earlier steps are recorded", async () => {
    allowPreview()
    records()
    loadOrder.mockClear()
    loadMoney.mockClear()
    getCaseAuthorization.mockClear()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "SERVICE_ACTIVATION" }),
    }))
    expect(screen.getByRole("heading", { name: "Service Activation — Guided or Managed" })).toBeInTheDocument()
    expect(screen.getByText("Service activation stays closed until the earlier steps are recorded.")).toBeInTheDocument()
    expect(document.querySelector("[data-step='SERVICE_ACTIVATION']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByRole("button", { name: "Issue upfront payment link" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record Manager access" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve success fee" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Mark as paid|Grant Google|Submit to Google/i })).toBeNull()
    expect(loadOrder).not.toHaveBeenCalled()
    expect(loadMoney).not.toHaveBeenCalled()
    expect(getCaseAuthorization).not.toHaveBeenCalled()
  })

  it("keeps case preparation closed until the earlier steps are recorded", async () => {
    allowPreview()
    records()
    getPreparedPackCase.mockClear()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "PREPARATION" }),
    }))
    expect(screen.getByRole("heading", { name: "Case Preparation & Approval" })).toBeInTheDocument()
    expect(screen.getByText("Case preparation stays closed until the earlier steps are recorded.")).toBeInTheDocument()
    expect(document.querySelector("[data-step='PREPARATION']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByRole("button", { name: "Create new draft pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve prepared pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Publish pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google|Mark as paid/i })).toBeNull()
    expect(getPreparedPackCase).not.toHaveBeenCalled()
  })

  it("keeps submission tracking closed until the earlier steps are recorded", async () => {
    allowPreview()
    records()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "SUBMISSION" }),
    }))
    expect(screen.getByRole("heading", { name: "Submission & Tracking" })).toBeInTheDocument()
    expect(screen.getByText("Submission tracking stays closed until the earlier steps are recorded.")).toBeInTheDocument()
    expect(document.querySelector("[data-step='SUBMISSION']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.queryByText("Record a decision or withdrawal")).toBeNull()
    expect(screen.queryByRole("button", { name: /Submit to Google/i })).toBeNull()
  })

  it("keeps outcome verification closed until the earlier steps are recorded", async () => {
    allowPreview()
    records()
    loadMoney.mockClear()
    loadOrder.mockClear()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "OUTCOME_BILLING" }),
    }))
    expect(screen.getByRole("heading", { name: "Outcome Verification & Billing" })).toBeInTheDocument()
    expect(screen.getByText("Outcome verification stays closed until the earlier steps are recorded.")).toBeInTheDocument()
    expect(document.querySelector("[data-step='OUTCOME_BILLING']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByText("Approve the success fee")).toBeNull()
    expect(screen.queryByText("Issue a TEST-MODE hosted invoice")).toBeNull()
    expect(screen.queryByRole("button", { name: /Close case|Submit to Google|Mark as paid/i })).toBeNull()
    expect(loadMoney).not.toHaveBeenCalled()
    expect(loadOrder).not.toHaveBeenCalled()
  })

  it("does not offer screening completion while the intake review is still the current step", async () => {
    allowPreview()
    records()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "VERIFICATION" }),
    }))
    expect(screen.getByRole("heading", { name: "Business, Profile & Contact Verification" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Record the screening decision" })).toBeNull()
    expect(screen.getByText(/no control that skips ahead/)).toBeInTheDocument()
  })

  it("shows the original submission in UK time and prefills screening from the recorded website and profile", async () => {
    allowPreview()
    records()
    recordDetail.mockImplementation(async (entity: string) => ({
      record: entity === "client"
        ? { id: "client", name: "Alex Mercer", email: "alex@example.com", phone: "07000900000", emailVerified: false, version: 1 }
        : entity === "business"
          ? { id: "business", name: "Mercer Bakery", website: "https://bakery.example", version: 1 }
          : { id: "location", name: "High Street", country: "United Kingdom", profileUrl: "https://maps.example/listing", version: 1 },
      memberships: [],
      submittedBusinesses: [],
      duplicates: [],
      work: [],
    }))
    loadJourneyExtension.mockResolvedValue({
      openedAt: "2026-01-15T12:00:00.000Z",
      snapshot: {
        fullName: "Alex Submitted",
        email: "submitted@example.com",
        businessName: "Submitted Bakery",
        country: "United Kingdom",
        phone: "07000111000",
        websiteUrl: "",
        businessProfileUrl: "",
        reviewUrl: "",
        details: "The original enquiry text.",
      },
      events: [{ event: "INTAKE_REVIEW", createdAt: "2026-01-16T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } }],
    })
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "VERIFICATION" }),
    }))
    expect(screen.getByText("Mercer Bakery")).toBeInTheDocument()
    expect(screen.getByText("United Kingdom")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "https://bakery.example (new tab)" })).toHaveAttribute("href", "https://bakery.example")
    expect(screen.getByRole("link", { name: "https://maps.example/listing (new tab)" })).toHaveAttribute("href", "https://maps.example/listing")
    expect(screen.getByRole("alert")).toHaveTextContent(/conflict/i)
    expect(screen.getByRole("alert")).toHaveTextContent("Submitted Bakery")
    const details = screen.getByText("Verification details").closest("details")
    expect(details).not.toHaveAttribute("open")
    expect(details).toHaveTextContent("The original enquiry text.")
    expect(details).toHaveTextContent("Submitted 15 January 2026 at 12:00.")
    expect(details).toHaveTextContent("A website is not required.")
    expect(screen.getByLabelText("Website")).toHaveValue("PRESENT")
    expect(screen.getByLabelText("Google listing")).toHaveValue("")
    expect(screen.getByRole("option", { name: "Accessible" })).toHaveProperty("selected", false)
    expect(screen.getByRole("option", { name: "Not supplied" })).toHaveProperty("selected", false)
    expect(screen.getByRole("option", { name: "Suspended, missing or inaccessible" })).toBeInTheDocument()
  })

  it("starts from no website and not supplied when neither is recorded", async () => {
    allowPreview()
    records()
    loadJourneyExtension.mockResolvedValue({
      openedAt: null,
      snapshot: null,
      events: [{ event: "INTAKE_REVIEW", createdAt: "2026-01-16T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } }],
    })
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "VERIFICATION" }),
    }))
    expect(screen.getByLabelText("Website")).toHaveValue("NONE")
    expect(screen.getByLabelText("Google listing")).toHaveValue("NOT_SUPPLIED")
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0)
    expect(screen.queryByRole("alert")).toBeNull()
    const details = screen.getByText("Verification details").closest("details")
    expect(details).not.toHaveAttribute("open")
    expect(details).toHaveTextContent("Submitted 18 May 2026 at 11:00.")
    expect(details).toHaveTextContent(/not shown as a separate original submission/)
    expect(details).toHaveTextContent(/does not block this screening/)
  })

  it("keeps the guided step in front of the case-flow recommendation after screening is recorded", async () => {
    allowPreview()
    records()
    loadJourneyExtension.mockResolvedValue({
      openedAt: "2026-01-15T12:00:00.000Z",
      snapshot: null,
      events: [
        { event: "INTAKE_REVIEW", createdAt: "2026-01-16T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } },
        {
          event: "BUSINESS_VERIFICATION",
          createdAt: "2026-01-17T00:00:00.000Z",
          details: {
            outcome: "PRELIMINARY_COMPLETE",
            source: "The enquiry",
            listing: "NOT_SUPPLIED",
            website: "NONE",
            discrepancy: false,
            reason: "The name and country agree with the records.",
          },
        },
      ],
    })
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({}),
    }))
    expect(screen.getByRole("heading", { name: "Review Request & Request Documents" })).toBeInTheDocument()
    expect(screen.getByText("Choose the documents, save one request, then edit and approve the email. Approving does not send it.")).toBeInTheDocument()
    expect(screen.getByText("The business profile was suspended without warning.")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Include Google suspension or rejection notice" })).toBeChecked()
    expect(screen.getByRole("button", { name: "Save evidence requirements" })).toBeEnabled()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
    expect(screen.queryByText("Document-request actions are not available in this preview.")).toBeNull()
    expect(document.querySelector("[data-step='REQUEST_DOCUMENTS']")).toHaveAttribute("data-state", "CURRENT")
    expect(screen.queryByRole("button", { name: "Record the intake review" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record the screening decision" })).toBeNull()
    const system = screen.getByText("System details").closest("details")
    expect(system).not.toHaveAttribute("open")
    expect(system).toHaveTextContent("Review the new case")
    expect(screen.queryByRole("heading", { name: "What the case-flow model already recommends" })).toBeNull()
  })

  it("keeps active blockers visible and leaves the technical recommendation collapsed", async () => {
    allowPreview()
    records()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue({ ...facts(), technicalStage: "SERVICE_SELECTION" })
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({}),
    }))
    const blockers = screen.getByRole("heading", { name: "Blockers" }).closest("section")
    expect(blockers).toHaveTextContent("No service track chosen")
    expect(blockers).toHaveTextContent("Nothing commercial can be raised until the case is Guided or Managed")
    expect(screen.getAllByText("No service track chosen")).toHaveLength(1)
    const system = screen.getByText("System details").closest("details")
    expect(system).not.toHaveAttribute("open")
    expect(system).toHaveTextContent("Choose the service track")
    expect(system).toHaveTextContent("Technical stage")
    expect(system).not.toHaveTextContent("No service track chosen")
    expect(system).not.toHaveTextContent("Nothing commercial can be raised")
  })

  it("lets an operator amend a completed intake review from a collapsed action", async () => {
    allowPreview()
    records()
    loadJourneyExtension.mockResolvedValue({
      openedAt: "2026-01-15T12:00:00.000Z",
      snapshot: null,
      events: [{ event: "INTAKE_REVIEW", createdAt: "2026-01-16T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } }],
    })
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "CASE_RECEIVED" }),
    }))
    const workspace = screen.getByRole("article")
    expect(workspace).toHaveTextContent("Complete")
    expect(workspace).toHaveTextContent("This intake review is recorded.")
    expect(workspace).toHaveTextContent("The business profile was suspended without warning.")
    const amend = screen.getByText("Amend recorded decision").closest("details")
    expect(amend).not.toHaveAttribute("open")
    const button = screen.getByRole("button", { name: "Record the intake review" })
    expect(button.closest("details")).toBe(amend)
    expect(screen.getAllByRole("button", { name: "Record the intake review" })).toHaveLength(1)
  })

  it("lets an operator amend a completed screening decision from a collapsed action", async () => {
    allowPreview()
    records()
    loadJourneyExtension.mockResolvedValue({
      openedAt: "2026-01-15T12:00:00.000Z",
      snapshot: null,
      events: [
        { event: "INTAKE_REVIEW", createdAt: "2026-01-16T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } },
        {
          event: "BUSINESS_VERIFICATION",
          createdAt: "2026-01-17T00:00:00.000Z",
          details: {
            outcome: "PRELIMINARY_COMPLETE",
            source: "The enquiry",
            listing: "NOT_SUPPLIED",
            website: "NONE",
            discrepancy: false,
            reason: "The name and country agree with the records.",
          },
        },
      ],
    })
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "VERIFICATION" }),
    }))
    const workspace = screen.getByRole("article")
    expect(workspace).toHaveTextContent("Complete")
    expect(workspace).toHaveTextContent("Preliminary screening is recorded.")
    expect(workspace).toHaveTextContent("Mercer Bakery")
    const amend = screen.getByText("Amend recorded decision").closest("details")
    expect(amend).not.toHaveAttribute("open")
    const button = screen.getByRole("button", { name: "Record the screening decision" })
    expect(button.closest("details")).toBe(amend)
    expect(screen.getAllByRole("button", { name: "Record the screening decision" })).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Record the intake review" })).toBeNull()
  })

  it("does not offer an amendment on a locked step", async () => {
    allowPreview()
    records()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "ASSESSMENT" }),
    }))
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull()
    expect(screen.queryByText("Amend recorded decision")).toBeNull()
    expect(screen.queryByRole("button", { name: "Record the intake review" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record the screening decision" })).toBeNull()

    cleanup()
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "VERIFICATION" }),
    }))
    expect(document.querySelector("[data-step='VERIFICATION']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByText("Amend recorded decision")).toBeNull()
    expect(screen.queryByRole("button", { name: "Record the screening decision" })).toBeNull()
  })

  it("keeps document requests closed until the earlier steps are recorded", async () => {
    allowPreview()
    records()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    getEvidenceCase.mockClear()
    loadCaseCommunications.mockClear()
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "REQUEST_DOCUMENTS" }),
    }))
    expect(document.querySelector("[data-step='REQUEST_DOCUMENTS']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.getByText("Document requests stay closed until the earlier steps are recorded.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save evidence requirements" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Generate email draft" })).toBeNull()
    expect(getEvidenceCase).not.toHaveBeenCalled()
    expect(loadCaseCommunications).not.toHaveBeenCalled()
  })

  it("shows verified, suppressed and conflicting email status before step 3", async () => {
    allowPreview()
    records()
    recordDetail.mockImplementation(async (entity: string) => ({
      record: entity === "client"
        ? { id: CUSTOMER_ID, name: "Alex Mercer", email: "alex@example.com", phone: null, emailVerified: true, version: 1 }
        : entity === "business"
          ? { id: "business", name: "Mercer Bakery", website: null, version: 1 }
          : { id: "location", name: "High Street", country: "United Kingdom", profileUrl: null, version: 1 },
      memberships: [],
      submittedBusinesses: [],
      duplicates: [],
      work: [],
    }))
    getCase.mockResolvedValue(caseDetail())
    const verified = facts()
    verified.authorization.customerEmailVerified = true
    loadCaseFlowFacts.mockResolvedValue(verified)
    loadCaseCommunications.mockResolvedValue({
      status: "success",
      complete: true,
      total: 0,
      returned: 0,
      verifiedEmail: "alex@example.com",
      verifiedEmailSuppressed: false,
      communications: [],
    })
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "CASE_RECEIVED" }),
    }))
    expect(screen.getByText(/alex@example.com — Verified/)).toBeInTheDocument()
    expect(screen.queryByText(/Email verification is still outstanding/)).toBeNull()
    expect(screen.getByRole("button", { name: "Record the intake review" })).toBeInTheDocument()

    cleanup()
    loadJourneyExtension.mockResolvedValue({
      openedAt: "2026-01-15T12:00:00.000Z",
      snapshot: null,
      events: [{ event: "INTAKE_REVIEW", createdAt: "2026-01-16T00:00:00.000Z", details: { outcome: "REVIEWED", nextAction: "" } }],
    })
    loadCaseCommunications.mockResolvedValue({
      status: "success",
      complete: true,
      total: 0,
      returned: 0,
      verifiedEmail: "alex@example.com",
      verifiedEmailSuppressed: true,
      communications: [],
    })
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "VERIFICATION" }),
    }))
    expect(screen.getByText(/Verified and suppressed/)).toBeInTheDocument()
    expect(screen.getByText(/This verified address is suppressed/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record the screening decision" })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /email/i })).toBeNull()

    cleanup()
    const conflict = facts()
    conflict.authorization.customerEmailVerified = false
    loadCaseFlowFacts.mockResolvedValue(conflict)
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "VERIFICATION" }),
    }))
    expect(screen.getByText(/alex@example.com — Not verified/)).toBeInTheDocument()
    expect(screen.getAllByText(/do not agree/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Email verification is still outstanding/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open the customer record" })).toHaveAttribute("href", `/records/client/${CUSTOMER_ID}`)
    expect(screen.getByRole("button", { name: "Record the screening decision" })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /email/i })).toBeNull()
  })
})
