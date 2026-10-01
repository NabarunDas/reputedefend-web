// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadSettingsOverview = vi.fn()
const loadSettingVersions = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/settings/queries", () => ({
  loadSettingsOverview: (...args: unknown[]) => loadSettingsOverview(...args),
  loadSettingVersions: (...args: unknown[]) => loadSettingVersions(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import SettingsPage from "./page"
import { requireStaff } from "@/lib/require-staff"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => {
  loadSettingsOverview.mockReset()
  loadSettingVersions.mockReset()
  loadSettingVersions.mockResolvedValue({ versions: [] })
})

describe("Settings page", () => {
  it("shows the singleton staff identity and versioned settings without extra roles", async () => {
    loadSettingsOverview.mockResolvedValue({
      staff: {
        title: "ProfileRelaunch Administrator",
        registeredAccount: "admin@profilerelaunch.com",
        removable: false,
        roles: "None. This workspace has one staff identity and no staff levels.",
        lastSignIn: "2026-03-29T12:00:00Z",
        activeSessions: 1,
      },
      serviceHours: { version: 1, payload: { firstResponseTargetHours: 8 }, effectiveFrom: "2026-04-01T00:00:00Z" },
      retention: null,
      templates: { approved: 4, drafts: 0 },
      openComplaints: 1,
      openIncidents: 0,
      activeHolds: 0,
      openPrivacy: 2,
      schedules: [],
      temporalNote: "Approved settings apply from effective_from and never rewrite historical obligations.",
    })
    render(await SettingsPage())
    expect(requireStaff).toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
    expect(document.body.textContent).toContain("admin@profilerelaunch.com")
    expect(screen.getByText(/cannot be removed, invited, disabled or rebound/)).toBeTruthy()
    expect(screen.getByText(/one staff account/)).toBeTruthy()
    expect(screen.getByText(/never rewrite historical obligations/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Manage sessions" })).toHaveAttribute("href", "/security")
    expect(screen.getByRole("link", { name: "Approved template lifecycle" })).toHaveAttribute("href", "/settings/templates")
    expect(screen.getByRole("link", { name: "Privacy requests and legal holds" })).toHaveAttribute("href", "/privacy")
    expect(document.body.textContent).not.toMatch(/invite staff|Owner \/ Finance|capability matrix|sk_live|otp/i)
  })
})
