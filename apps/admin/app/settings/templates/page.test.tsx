// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadTemplates = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/settings/queries", () => ({
  loadTemplates: (...args: unknown[]) => loadTemplates(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import TemplatesPage from "./page"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => loadTemplates.mockReset())

describe("Templates page", () => {
  it("separates approved versions from drafts and keeps send-path keys", async () => {
    loadTemplates.mockResolvedValue({
      approved: [{ key: "CASE_UPDATE", version: 1, name: "Case update", subject: "Update on {case_ref}", createdAt: "2026-03-01T12:00:00Z" }],
      drafts: [{ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", key: "CASE_UPDATE", name: "Case update v2", subject: "Update on {case_ref}", createdAt: "2026-03-29T12:00:00Z", recordVersion: 1 }],
    })
    render(await TemplatesPage())
    expect(screen.getByRole("heading", { name: "Template lifecycle" })).toBeTruthy()
    expect(screen.getByText(/CASE_UPDATE v1/)).toBeTruthy()
    expect(screen.getByText(/Case update v2/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy()
    expect(screen.getByText(/latest approved version only/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/MARKETING_BLAST|invite staff/i)
  })
})
