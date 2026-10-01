// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadDashboard = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/reports/queries", () => ({
  loadDashboard: (...args: unknown[]) => loadDashboard(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import AdminHome from "./page"
import { requireStaff } from "@/lib/require-staff"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => loadDashboard.mockReset())

describe("Today home", () => {
  it("shows exact Needs Attention counts and does not invent 50+ cards", async () => {
    loadDashboard.mockResolvedValue({
      computedAt: "2026-03-29T12:00:00Z",
      timezone: "Europe/London",
      freshness: { status: "HEALTHY", lateAfterSeconds: 93600 },
      monitoringScheduleConfigured: false,
      needsAttention: {
        overdueWork: { count: 61 },
        unassignedEnquiries: { count: 2 },
        missedGuardChecks: { count: 0 },
        unreviewedGuardAlerts: { count: 0 },
        guardAlertsNeedsReview: { count: 0 },
        failedCustomerEmail: { count: 0 },
        accessRecovery: { count: 0 },
        contactRecovery: { count: 0 },
        paymentExceptions: { count: 0 },
        guardBillingExceptions: { count: 0 },
        failedJobs: { count: 1 },
      },
      metrics: {
        clientsTotal: { count: 4 },
        clientsActiveService: { count: 1 },
        contactsEnquiryOnly: { count: 3 },
        openEnquiries: { count: 2 },
        openCases: { count: 1 },
        collectedGross: { count: 1, amounts: [{ currency: "GBP", amountMinor: 24900 }] },
        collectedRefunds: { count: 0, amounts: [] },
        outstandingMoney: { count: 0, amounts: [] },
        checkCoverage: { numerator: 0, denominator: 0, percentage: null },
      },
      secondary: {},
    })
    render(await AdminHome({ searchParams: Promise.resolve({}) }))
    expect(requireStaff).toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeTruthy()
    expect(screen.getByText("61")).toBeTruthy()
    expect(document.body.textContent).not.toContain("50+")
    expect(screen.getByRole("link", { name: /Overdue work/ })).toHaveAttribute("href", expect.stringContaining("/reports/overdue_work"))
    expect(screen.getByText("Monitoring schedule not configured")).toBeTruthy()
    expect(screen.getByText(/Europe\/London/)).toBeTruthy()
    expect(document.body.textContent).not.toContain("admin@profilerelaunch.com")
    expect(document.body.textContent).not.toMatch(/googletagmanager|google-analytics|gtag\(/)
  })
})
