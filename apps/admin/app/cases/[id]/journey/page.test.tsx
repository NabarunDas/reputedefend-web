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

vi.mock("next/navigation", () => ({ notFound: () => { throw notFoundError } }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))
vi.mock("@/lib/require-staff", () => ({ requireStaff: () => requireStaff() }))
vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("@/lib/case-flow/load", () => ({ loadCaseFlowFacts: (...args: unknown[]) => loadCaseFlowFacts(...args) }))

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
      await expect(CaseJourneyPage({
        params: Promise.resolve({ id: CASE_ID }),
        searchParams: Promise.resolve({}),
      })).rejects.toBe(notFoundError)
      expect(requireStaff).not.toHaveBeenCalled()
      expect(getCase).not.toHaveBeenCalled()
    }
  })

  it("shows all eleven steps to an authenticated operator on the develop Preview", async () => {
    allowPreview()
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
    expect(document.querySelector("button")).toBeNull()
    expect(screen.getByText(/does not perform it/)).toBeInTheDocument()
  })

  it("keeps a locked step readable and says why it is unavailable", async () => {
    allowPreview()
    getCase.mockResolvedValue(caseDetail())
    loadCaseFlowFacts.mockResolvedValue(facts())
    render(await CaseJourneyPage({
      params: Promise.resolve({ id: CASE_ID }),
      searchParams: Promise.resolve({ step: "ASSESSMENT" }),
    }))
    expect(screen.getByRole("heading", { name: "Assessment & Recommended Path" })).toBeInTheDocument()
    expect(screen.getByText(/cannot be completed from here/)).toBeInTheDocument()
    expect(document.querySelector("[data-step='ASSESSMENT']")).toHaveAttribute("data-state", "LOCKED")
  })
})
