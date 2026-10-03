// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowFacts } from "@/lib/case-flow/model"

const getCase = vi.fn()
const loadCaseFlowFacts = vi.fn()
const loadCatalogue = vi.fn()
const loadQuotes = vi.fn()
const loadOrders = vi.fn()
const loadMoney = vi.fn()

vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("@/lib/case-flow/load", () => ({ loadCaseFlowFacts: (...args: unknown[]) => loadCaseFlowFacts(...args) }))
vi.mock("@/lib/commerce/queries", () => ({
  loadCatalogue: (...args: unknown[]) => loadCatalogue(...args),
  loadQuotes: (...args: unknown[]) => loadQuotes(...args),
  loadOrders: (...args: unknown[]) => loadOrders(...args),
}))
vi.mock("@/lib/payments/queries", () => ({ loadMoney: (...args: unknown[]) => loadMoney(...args) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import CaseCommercialPage from "./page"

const caseId = "55555555-5555-4555-8555-555555555555"

function facts(): CaseFlowFacts {
  return {
    caseId,
    reference: "PR-1",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "SERVICE_SELECTION",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "GUIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: "11111111-1111-4111-8111-111111111111",
    businessId: "22222222-2222-4222-8222-222222222222",
    locationId: null,
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["PAYMENT_REQUIRED"],
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
      hasLocation: false,
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

afterEach(() => cleanup())

describe("case commercial page", () => {
  it("uses the case next action and does not ask for pasted identifiers", async () => {
    getCase.mockResolvedValue({
      id: caseId,
      reference: "PR-1",
      client: "Alex",
      business: "Bakery",
      customerId: "11111111-1111-4111-8111-111111111111",
      businessId: "22222222-2222-4222-8222-222222222222",
      locationId: "",
    } as CaseDetail)
    loadCaseFlowFacts.mockResolvedValue(facts())
    loadCatalogue.mockResolvedValue({ prices: [] })
    loadQuotes.mockResolvedValue({ quotes: [] })
    loadOrders.mockResolvedValue({ orders: [] })
    loadMoney.mockResolvedValue({ orders: [] })
    render(await CaseCommercialPage({ params: Promise.resolve({ id: caseId }) }))
    expect(screen.getByRole("heading", { name: "Commercial and money" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to case PR-1" })).toHaveAttribute("href", `/cases/${caseId}`)
    expect(screen.getByText("Create the quote")).toBeInTheDocument()
    expect(screen.getByText(/No current approved price/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/customer id/i)).toBeNull()
    expect(screen.queryByRole("button", { name: /mark paid|force success|charge/i })).toBeNull()
  })
})
