// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import type { EvidenceCase } from "@/lib/evidence/model"

const getCase = vi.fn()
const getEvidenceCase = vi.fn()
const getPreparedPackCase = vi.fn()
vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("@/lib/evidence/queries", () => ({ getEvidenceCase: (...args: unknown[]) => getEvidenceCase(...args) }))
vi.mock("@/lib/packs/queries", () => ({ getPreparedPackCase: (...args: unknown[]) => getPreparedPackCase(...args) }))
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
  PreparedPackPanel: ({ packs }: { packs: { packs: { status: string; packNumber: number }[]; eligible: { documentTitle: string }[] } }) => (
    <section>
      <h2>Prepared submission pack</h2>
      <p>Pack approval confirms the selected evidence only. It does not confirm payment, customer authority or permission to submit, and it does not submit anything to Google.</p>
      {packs.packs.some(pack => pack.status === "STALE") && <p>Pack stale — included evidence has changed. Do not use this pack for submission. Create a new prepared pack.</p>}
      {packs.eligible.map(row => <p key={row.documentTitle}>Eligible: {row.documentTitle}</p>)}
      {packs.packs.length > 0 && <>
        <button type="button">View</button>
        <button type="button">Download</button>
        <p>I confirm this exact evidence selection is the prepared pack. This does not confirm payment, customer authority, or submission to Google.</p>
      </>}
    </section>
  ),
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
  getPreparedPackCase.mockReset().mockResolvedValue({ caseId, packs: [], eligible: [] })
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
    expect(screen.getByRole("heading", { name: "Prepared submission pack" })).toBeTruthy()
    expect(screen.getByText(/does not confirm payment, customer authority or permission to submit/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Submit to Google|customer portal|Mark as paid|permission granted/i)
  })
  it("shows eligible evidence, reused View/Download and a stale warning", async () => {
    getEvidenceCase.mockResolvedValue({ caseId, reference: "PR-1", requests: [], documents: [] } as EvidenceCase)
    getPreparedPackCase.mockResolvedValue({
      caseId,
      packs: [{ status: "STALE", packNumber: 1 }],
      eligible: [{ documentTitle: "Accepted invoice" }],
    })
    render(await EvidencePage({ params: Promise.resolve({ id: caseId }) }))
    expect(screen.getByText(/Pack stale — included evidence has changed/)).toBeTruthy()
    expect(screen.getByText("Eligible: Accepted invoice")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "View" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "Download" }).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /submit to google/i })).toBeNull()
    expect(screen.queryByRole("link", { name: /customer portal/i })).toBeNull()
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
