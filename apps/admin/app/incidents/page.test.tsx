// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadIncidents = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/settings/queries", () => ({
  loadIncidents: (...args: unknown[]) => loadIncidents(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import IncidentsPage from "./page"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => loadIncidents.mockReset())

describe("Incidents page", () => {
  it("shows open incidents without an invented acknowledgement SLA", async () => {
    loadIncidents.mockResolvedValue({
      rows: [{
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        kind: "EMAIL",
        status: "OPEN",
        title: "Outbound mail paused",
        summary: "Provider reported a sending outage.",
        openedAt: "2026-03-29T12:00:00Z",
        recordVersion: 1,
      }],
    })
    render(await IncidentsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("heading", { name: "Incidents" })).toBeTruthy()
    expect(screen.getByText("Outbound mail paused")).toBeTruthy()
    expect(screen.getByText(/no invented acknowledgement SLA/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Resolve" })).toBeTruthy()
    expect(screen.queryByLabelText("Incident id")).toBeNull()
  })
})
