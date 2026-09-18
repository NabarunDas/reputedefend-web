// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const listEvidenceQueue = vi.fn()
vi.mock("@/lib/evidence/queries", () => ({
  listEvidenceQueue: (...args: unknown[]) => listEvidenceQueue(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import DocumentsPage from "./page"

afterEach(() => cleanup())
beforeEach(() => listEvidenceQueue.mockReset())

describe("documents queue", () => {
  it("defaults to needs review and links rows to the case evidence workspace", async () => {
    listEvidenceQueue.mockResolvedValue([{
      caseId: "55555555-5555-4555-8555-555555555555",
      reference: "PR-1",
      client: "Alex",
      business: "Bakery",
      documentId: "66666666-6666-4666-8666-666666666666",
      versionId: "77777777-7777-4777-8777-777777777777",
      title: "Invoice",
      filename: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
      scanStatus: "NO_THREATS_FOUND",
      validationStatus: "VALID",
      reviewStatus: "UNREVIEWED",
      customerVisible: false,
      uploadedAt: "2026-09-18T10:00:00.000Z",
    }])
    render(await DocumentsPage({ searchParams: Promise.resolve({}) }))
    expect(listEvidenceQueue).toHaveBeenCalledWith({ filter: "needs_review", time: null, before: null })
    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy()
    expect(screen.getByLabelText("Show")).toBeTruthy()
    expect([...screen.getByLabelText("Show").querySelectorAll("option")].map(option => option.textContent)).toEqual([
      "Needs review", "Scanning", "Blocked", "Accepted", "Rejected", "All",
    ])
    expect(screen.getByRole("link", { name: "PR-1" })).toHaveAttribute("href", "/cases/55555555-5555-4555-8555-555555555555/evidence")
    expect(document.body.textContent).not.toMatch(/customer portal|send an email|Google Docs/i)
  })
})
