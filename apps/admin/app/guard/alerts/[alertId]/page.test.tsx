// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const loadGuardAlert = vi.fn()
vi.mock("@/lib/guard/alerts-queries", () => ({
  loadGuardAlert: (...args: unknown[]) => loadGuardAlert(...args),
}))

import GuardAlertDetailPage from "./page"

afterEach(() => cleanup())

describe("guard alert detail", () => {
  it("shows only database-permitted actions and factual delivery labels", async () => {
    loadGuardAlert.mockResolvedValue({
      status: "success",
      enabled: true,
      alert: {
        id: "11111111-1111-4111-8111-111111111111",
        version: 2,
        state: "ACKNOWLEDGED",
        severity: "HIGH",
        reviewDisposition: "CONFIRMED_CUSTOMER_ISSUE",
        customerName: "Alex",
        businessName: "Bakery",
        locationName: "High Street",
        coverageBasis: "DIRECT_GUARD",
        coverageState: "ACTIVE",
        issueCodes: ["BUSINESS_NAME_CHANGED"],
        linkedCaseRef: null,
      },
      observations: [{ id: "obs-1", classification: "CHANGE_DETECTED", issueCodes: ["BUSINESS_NAME_CHANGED"], observedAt: "2026-09-30T08:15:00Z", attached: true }],
      events: [{ event: "ACKNOWLEDGED", reason: "Reviewed", createdAt: "2026-09-30T09:00:00Z" }],
      notifications: [{ id: "n1", communicationId: "c1", kind: "INITIAL", lifecycle: "QUEUED", deliveryStatus: "PROVIDER_ACCEPTED", subject: "Relaunch Guard update for High Street" }],
      serviceActions: [],
      contact: { emailVerified: true, phoneVerified: false },
      access: { verified: true },
      coverage: { state: "ACTIVE", activatedAt: "2026-09-01T00:00:00Z", resumeReady: false },
      discount: { managedRelaunch: { eligible: false, reason: "guided_or_undecided_not_eligible" }, managedReview: { eligible: false, reason: "guided_or_undecided_not_eligible" }, guided: { eligible: false, reason: "guided_or_undecided_not_eligible" } },
      permittedActions: {
        acknowledge: false, dismiss: false, escalate: true, resolve: true, prepareNotification: true,
        createInterventionCase: true, linkExistingCase: true, pauseForRecovery: false, resume: false,
        reviewNewEvidence: false, prepareResolutionNotification: false,
      },
    })
    render(await GuardAlertDetailPage({ params: Promise.resolve({ alertId: "11111111-1111-4111-8111-111111111111" }) }))
    expect(screen.getByRole("heading", { name: "High Street alert" })).toBeInTheDocument()
    expect(screen.getByText("Provider accepted")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escalate" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create intervention case" })).toBeInTheDocument()
    expect(screen.getByText(/does not create a quote discount snapshot/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Review new evidence" })).not.toBeInTheDocument()
  })

  it("shows review-new-evidence and hides customer actions while needs_review is true", async () => {
    loadGuardAlert.mockResolvedValue({
      status: "success",
      enabled: true,
      alert: {
        id: "11111111-1111-4111-8111-111111111111",
        version: 3,
        state: "ACKNOWLEDGED",
        severity: "HIGH",
        reviewDisposition: "CONFIRMED_CUSTOMER_ISSUE",
        customerName: "Alex",
        businessName: "Bakery",
        locationName: "High Street",
        needsReview: true,
        acknowledgedAt: "2026-09-30T09:00:00Z",
      },
      observations: [],
      recentCoverageObservations: [],
      events: [{ event: "ACKNOWLEDGED", reason: "Reviewed", createdAt: "2026-09-30T09:00:00Z" }],
      notifications: [],
      serviceActions: [],
      contact: { emailVerified: true },
      access: { verified: true },
      coverage: { state: "ACTIVE" },
      discount: {},
      permittedActions: {
        reviewNewEvidence: true, resolve: false, prepareNotification: false,
        createInterventionCase: false, escalate: true,
      },
    })
    render(await GuardAlertDetailPage({ params: Promise.resolve({ alertId: "11111111-1111-4111-8111-111111111111" }) }))
    expect(screen.getByRole("button", { name: "Review new evidence" })).toBeInTheDocument()
    expect(screen.getByText(/Later evidence requires review/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escalate" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Resolve alert" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Prepare notification" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Create intervention case" })).not.toBeInTheDocument()
  })

  it("allows a resolution notification after the alert is resolved", async () => {
    loadGuardAlert.mockResolvedValue({
      status: "success",
      enabled: true,
      alert: {
        id: "11111111-1111-4111-8111-111111111111",
        version: 4,
        state: "RESOLVED",
        severity: "HIGH",
        reviewDisposition: "CONFIRMED_CUSTOMER_ISSUE",
        customerName: "Alex",
        businessName: "Bakery",
        locationName: "High Street",
        needsReview: false,
        acknowledgedAt: "2026-09-30T09:00:00Z",
      },
      observations: [],
      recentCoverageObservations: [],
      events: [
        { event: "ACKNOWLEDGED", reason: "Reviewed", createdAt: "2026-09-30T09:00:00Z" },
        { event: "RESOLVED", reason: "Restored", createdAt: "2026-09-30T12:00:00Z" },
      ],
      notifications: [],
      serviceActions: [],
      contact: { emailVerified: true },
      access: { verified: true },
      coverage: { state: "ACTIVE" },
      discount: {},
      permittedActions: {
        prepareResolutionNotification: true, prepareNotification: false, reviewNewEvidence: false, resolve: false,
      },
    })
    render(await GuardAlertDetailPage({ params: Promise.resolve({ alertId: "11111111-1111-4111-8111-111111111111" }) }))
    expect(screen.getByRole("heading", { name: "Prepare resolution notification" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Resolution" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Initial" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Resolve alert" })).not.toBeInTheDocument()
  })
})
