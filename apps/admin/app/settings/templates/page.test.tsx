// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadTemplates = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/settings/queries", () => ({ loadTemplates: (...args: unknown[]) => loadTemplates(...args) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))
import TemplatesPage from "./page"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => loadTemplates.mockReset())

describe("Templates review page", () => {
  const approved = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", key: "CASE_UPDATE", version: 1, name: "Case update", subject: "Update on {case_ref}", body: "Hello,\n\nAn update for {case_ref}.", createdAt: "2026-03-01T12:00:00Z", recordVersion: 1 }
  const draft = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", key: "EVIDENCE_REQUEST", version: 3, name: "Evidence request", subject: "Supporting documents for {case_ref}", body: "Hello,\n\nThank you for contacting ProfileRelaunch.\n\nWe are reviewing your enquiry.\n\nDocuments requested\n\n{specific_document}\n\n{upload_url}", createdAt: "2026-10-17T12:00:00Z", recordVersion: 1 }

  it("shows actual full saved wording before each approval control", async () => {
    loadTemplates.mockResolvedValue({ approved: [approved], drafts: [draft] })
    render(await TemplatesPage())
    expect(screen.getByRole("heading", { name: "Review email templates" })).toBeTruthy()
    expect(screen.getByText(/Thank you for contacting ProfileRelaunch/)).toBeInTheDocument()
    expect(screen.getByText(/An update for/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve: EVIDENCE_REQUEST: Evidence request" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retire template: CASE_UPDATE v1" })).toBeInTheDocument()
    expect(screen.getByText("See example branded layout")).toBeInTheDocument()
    expect(screen.getByTitle("Sample branded email layout for EVIDENCE_REQUEST version 3")).toHaveAttribute("sandbox", "")
  })

  it("fails closed when the RPC has not returned the body", async () => {
    loadTemplates.mockResolvedValue({approved:[{...approved,body:undefined}],drafts:[{...draft,body:undefined}]})
    render(await TemplatesPage())
    expect(screen.getAllByText(/Approval is blocked until/)).toHaveLength(2)
    expect(screen.queryByRole("button",{name:/^Approve:/})).not.toBeInTheDocument()
    expect(screen.queryByRole("button",{name:/^Retire template:/})).not.toBeInTheDocument()
  })
})
