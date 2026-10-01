// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { GuardAlertQueuePage } from "@/lib/guard/alerts-model"

const loadGuardAlerts = vi.fn()
vi.mock("@/lib/guard/alerts-queries", () => ({
  loadGuardAlerts: (...args: unknown[]) => loadGuardAlerts(...args),
}))

import GuardAlertsPage from "./page"

function emptyPage(overrides: Partial<GuardAlertQueuePage> = {}): GuardAlertQueuePage {
  return { rows: [], hasMore: false, nextCursor: null, after: null, invalidCursor: false, ...overrides }
}

describe("guard alert queues", () => {
  beforeEach(() => {
    loadGuardAlerts.mockReset().mockResolvedValue({
      enabled: false,
      queues: {
        newReview: emptyPage(),
        acknowledged: emptyPage(),
        highCritical: emptyPage(),
        needsReview: emptyPage(),
        contact: emptyPage(),
        access: emptyPage(),
        resolved: emptyPage(),
      },
    })
  })
  afterEach(() => cleanup())

  it("says alerts are not enabled and paginates queues", async () => {
    loadGuardAlerts.mockResolvedValue({
      enabled: false,
      queues: {
        newReview: emptyPage({
          rows: [{
            id: "11111111-1111-4111-8111-111111111111",
            locationName: "High Street",
            businessName: "Bakery",
            customerName: "Alex",
            coverageBasis: "DIRECT_GUARD",
            state: "NEW",
            severity: "UNASSESSED",
            issueCodes: ["BUSINESS_NAME_CHANGED"],
            latestObservedAt: "2026-09-30T08:15:00Z",
            notificationStatus: "None",
            version: 1,
          }],
          hasMore: true,
          nextCursor: "22222222-2222-4222-8222-222222222222",
        }),
        acknowledged: emptyPage({ invalidCursor: true, after: "not-valid" }),
        highCritical: emptyPage(),
        needsReview: emptyPage(),
        contact: emptyPage(),
        access: emptyPage(),
        resolved: emptyPage(),
      },
    })
    render(await GuardAlertsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText("Guard alerts are not enabled")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "New review" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "High Street" })).toHaveAttribute("href", "/guard/alerts/11111111-1111-4111-8111-111111111111")
    expect(screen.getByRole("link", { name: "View more" })).toBeInTheDocument()
    expect(screen.getByText(/That page is not valid for this queue/)).toBeInTheDocument()
  })
})
