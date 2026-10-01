// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadComplaints = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/settings/queries", () => ({
  loadComplaints: (...args: unknown[]) => loadComplaints(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import ComplaintsPage from "./page"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => loadComplaints.mockReset())

describe("Complaints page", () => {
  it("lists open complaint tasks against their cases", async () => {
    loadComplaints.mockResolvedValue({
      rows: [{
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        caseId: "55555555-5555-4555-8555-555555555555",
        reference: "PR-26-AAAAAA",
        title: "Complaint about delay",
        status: "OPEN",
        dueAt: "2026-03-29T12:00:00Z",
      }],
    })
    render(await ComplaintsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("heading", { name: "Complaints" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "PR-26-AAAAAA: Complaint about delay" })).toHaveAttribute("href", "/cases/55555555-5555-4555-8555-555555555555")
    expect(screen.getByText(/Closing a case does not delete a complaint/)).toBeTruthy()
    expect(loadComplaints).toHaveBeenCalledWith("open")
  })
})
