// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import type { EvidenceCase } from "@/lib/evidence/model"

const getCase = vi.fn()
const getEvidenceCase = vi.fn()
vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("@/lib/evidence/queries", () => ({ getEvidenceCase: (...args: unknown[]) => getEvidenceCase(...args) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))
vi.mock("./forms", () => ({
  AccessButtons: ({ actions }: { actions: { view: boolean; download: boolean; viewHint: string | null } }) => (
    <div>
      <button type="button" disabled={!actions.view} title={actions.viewHint || undefined}>View</button>
      <button type="button" disabled={!actions.download}>Download</button>
    </div>
  ),
  CreateRequestForm: () => <p>Creating an evidence request records the requirement only. It does not send an email.</p>,
  RequestStatusForm: () => null,
  ReviewForms: ({ actions }: { actions: { accept: boolean; reject: boolean } }) => (
    <div>{actions.accept && <button type="button">Accept version</button>}{actions.reject && <button type="button">Reject version</button>}</div>
  ),
  ScanRefreshForm: () => <button type="button">Refresh scan status</button>,
  UploadEvidenceForm: () => <p>Accepted: .pdf .jpg .jpeg .png .webp .docx. Maximum file size 10 MB.</p>,
  VisibilityForm: () => <p>Customer visibility is recorded for future customer access. No customer portal currently exposes this file.</p>,
}))

import EvidencePage from "./page"

const caseId = "55555555-5555-4555-8555-555555555555"
const c = { id: caseId, reference: "PR-1", client: "Alex", business: "Bakery" } as CaseDetail

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    versionNumber: 1,
    originalFilename: "invoice.pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
    uploadStatus: "UPLOADED",
    scanStatus: "NO_THREATS_FOUND",
    validationStatus: "VALID",
    validationError: null,
    reviewStatus: "UNREVIEWED",
    reviewNote: null,
    customerVisible: false,
    createdAt: "2026-09-18T10:00:00.000Z",
    uploadedAt: "2026-09-18T10:00:00.000Z",
    validatedAt: "2026-09-18T10:05:00.000Z",
    reviewedAt: null,
    recordVersion: 3,
    ...overrides,
  }
}

afterEach(() => cleanup())
beforeEach(() => {
  getCase.mockReset().mockResolvedValue(c)
  getEvidenceCase.mockReset()
})

describe("case evidence workspace", () => {
  it("shows request, upload and document guidance without customer or email actions", async () => {
    getEvidenceCase.mockResolvedValue({
      caseId, reference: "PR-1", requests: [], documents: [{
        id: "66666666-6666-4666-8666-666666666666", title: "Invoice", evidenceRequestId: null,
        createdAt: "2026-09-18T10:00:00.000Z", updatedAt: "2026-09-18T10:00:00.000Z", version: 1,
        versions: [version({ originalFilename: "letter.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })],
      }],
    } as EvidenceCase)
    render(await EvidencePage({ params: Promise.resolve({ id: caseId }) }))
    expect(screen.getByRole("heading", { name: "Evidence & Documents" })).toBeTruthy()
    expect(screen.getAllByText(/records the requirement only. It does not send an email/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Maximum file size 10 MB/).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "View" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Download" })).not.toBeDisabled()
    expect(screen.getByText("Preview not available for this file type")).toBeTruthy()
    expect(screen.queryByRole("link", { name: /customer portal/i })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Google Docs Viewer|Microsoft Office Viewer|mailto:/i)
  })
  it("disables unsafe actions while a scan is pending", async () => {
    getEvidenceCase.mockResolvedValue({
      caseId, reference: "PR-1", requests: [], documents: [{
        id: "66666666-6666-4666-8666-666666666666", title: "Invoice", evidenceRequestId: null,
        createdAt: "2026-09-18T10:00:00.000Z", updatedAt: "2026-09-18T10:00:00.000Z", version: 1,
        versions: [version({ scanStatus: "PENDING", validationStatus: "PENDING", validatedAt: null })],
      }],
    } as EvidenceCase)
    render(await EvidencePage({ params: Promise.resolve({ id: caseId }) }))
    expect(screen.getByRole("button", { name: "Refresh scan status" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "View" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Accept version" })).toBeNull()
  })
})
