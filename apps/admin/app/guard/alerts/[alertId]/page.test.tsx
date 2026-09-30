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
      },
    })
    render(await GuardAlertDetailPage({ params: Promise.resolve({ alertId: "11111111-1111-4111-8111-111111111111" }) }))
    expect(screen.getByRole("heading", { name: "High Street alert" })).toBeInTheDocument()
    expect(screen.getByText("Provider accepted")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Escalate" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create intervention case" })).toBeInTheDocument()
    expect(screen.getByText(/does not create a quote discount snapshot/)).toBeInTheDocument()
  })
})
