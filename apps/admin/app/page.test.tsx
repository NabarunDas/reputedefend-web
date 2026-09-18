// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const listEnquiries = vi.fn()
const listCases = vi.fn()
const listTasks = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/enquiries/queries", () => ({ listEnquiries: (...args: unknown[]) => listEnquiries(...args) }))
vi.mock("@/lib/cases/queries", () => ({
  listCases: (...args: unknown[]) => listCases(...args),
  listTasks: (...args: unknown[]) => listTasks(...args),
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
beforeEach(() => {
  listEnquiries.mockReset()
  listCases.mockReset()
  listTasks.mockReset()
})

describe("Today home", () => {
  it("summarises existing queues and links to current screens", async () => {
    listEnquiries.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({ id: String(index) })))
    listCases.mockResolvedValue([{ id: "case-1" }])
    listTasks.mockImplementation(async (filter: { filter: string }) => filter.filter === "overdue"
      ? [{ id: "task-1", caseId: "case-1", reference: "PR-1", title: "Call the owner", owner: "ADMIN", due: "2026-09-01T09:00:00Z", status: "OPEN" }]
      : [{ id: "task-1" }, { id: "task-2" }])
    render(await AdminHome())
    expect(requireStaff).toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Today" })).toBeTruthy()
    expect(screen.getByText("50+")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Open enquiries/ })).toHaveAttribute("href", "/enquiries")
    expect(screen.getByRole("link", { name: /Open cases/ })).toHaveAttribute("href", "/cases")
    expect(screen.getByRole("link", { name: /Open tasks/ })).toHaveAttribute("href", "/tasks")
    expect(screen.getByRole("link", { name: /Overdue tasks/ })).toHaveAttribute("href", "/tasks?filter=overdue")
    expect(screen.getByRole("link", { name: /PR-1: Call the owner/ })).toHaveAttribute("href", "/cases/case-1")
    expect(document.body.textContent).not.toContain("admin@profilerelaunch.com")
    expect(document.body.textContent).not.toMatch(/revenue|Guard statistics|Documents/)
  })
})
