// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import { caseDetail, CASE_ID } from "../cockpit/fixtures"

const notFoundError = new Error("NEXT_NOT_FOUND")
const requireStaff = vi.fn()
const getCase = vi.fn()
const loadCaseFlowFacts = vi.fn()
const recordDetail = vi.fn()
const getMembership = vi.fn()
const loadJourneyExtension = vi.fn()

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
    expect(screen.getByText(/alex@example.com/)).toBeInTheDocument()
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
    expect(screen.getByText("Assessment actions are not available in this preview.")).toBeInTheDocument()
    expect(screen.getByText(/cannot be completed from here/)).toBeInTheDocument()
    const extra = screen.getByText("Additional details").closest("details")
    expect(extra).not.toHaveAttribute("open")
    expect(extra).toHaveTextContent(/does not perform it/)
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "LOCKED")
    expect(screen.queryByRole("button", { name: "Record the intake review" })).toBeNull()
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
    expect(screen.getByText("https://bakery.example")).toBeInTheDocument()
    expect(screen.getByText("https://maps.example/listing")).toBeInTheDocument()
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
    expect(screen.getByText("Document-request actions are not available in this preview.")).toBeInTheDocument()
    expect(document.querySelector("[data-step='REQUEST_DOCUMENTS']")).toHaveAttribute("data-state", "CURRENT")
    expect(screen.queryByRole("button", { name: "Record the intake review" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record the screening decision" })).toBeNull()
    const system = screen.getByText("System details").closest("details")
    expect(system).not.toHaveAttribute("open")
    expect(system).toHaveTextContent("Review the new case")
    expect(screen.queryByRole("heading", { name: "What the case-flow model already recommends" })).toBeNull()
  })
})
