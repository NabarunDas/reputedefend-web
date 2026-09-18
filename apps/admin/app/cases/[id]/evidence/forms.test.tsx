// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { AccessButtons, CreateRequestForm, ReviewForms, UploadEvidenceForm, VisibilityForm } from "./forms"
import type { EvidenceVersionRow } from "@/lib/evidence/model"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const version = {
  id: "77777777-7777-4777-8777-777777777777",
  versionNumber: 1,
  originalFilename: "invoice.pdf",
  contentType: "application/pdf",
  sizeBytes: 1024,
  uploadStatus: "UPLOADED",
  scanStatus: "NO_THREATS_FOUND",
  validationStatus: "VALID",
  validationError: null,
  reviewStatus: "ACCEPTED",
  reviewNote: "Looks genuine.",
  customerVisible: false,
  createdAt: "2026-09-18T10:00:00.000Z",
  uploadedAt: "2026-09-18T10:00:00.000Z",
  validatedAt: "2026-09-18T10:05:00.000Z",
  reviewedAt: "2026-09-18T10:06:00.000Z",
  recordVersion: 4,
} as EvidenceVersionRow

const fetchMock = vi.fn()
const open = vi.fn()
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("open", open)
  fetchMock.mockReset()
  open.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("evidence forms", () => {
  it("states that creating a request does not send email", () => {
    render(<CreateRequestForm caseId="55555555-5555-4555-8555-555555555555" />)
    expect(screen.getByText(/does not send an email/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/customer portal|mailto:/i)
  })
  it("shows 10 MB type guidance on upload", () => {
    render(<UploadEvidenceForm caseId="55555555-5555-4555-8555-555555555555" documents={[]} openRequests={[]} />)
    expect(screen.getByText(/Maximum file size 10 MB/)).toBeTruthy()
    expect(screen.getByLabelText("File")).toHaveAttribute("accept", ".pdf,.jpg,.jpeg,.png,.webp,.docx")
  })
  it("requires confirmation before rejecting an accepted version or changing visibility", () => {
    render(<>
      <ReviewForms caseId="55555555-5555-4555-8555-555555555555" version={version} actions={{
        refresh: false, view: true, download: true, accept: false, reject: true, visibility: true,
        threatBlocked: false, validationFailed: false, viewHint: null, statusLabel: null,
      }} />
      <VisibilityForm caseId="55555555-5555-4555-8555-555555555555" version={version} />
    </>)
    fireEvent.click(screen.getByText("Reject"))
    expect((screen.getByRole("checkbox", { name: /reject a previously accepted version/ }) as HTMLInputElement).required).toBe(true)
    fireEvent.click(screen.getByText("Customer visibility"))
    expect(screen.getByText(/No customer portal currently exposes this file/)).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: /visibility change/ }) as HTMLInputElement).required).toBe(true)
  })
  it("opens a returned view URL in a new tab instead of downloading through the page", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "Open the file in the new tab.", url: "https://s3.example/object?X-Amz-Expires=60" }) })
    render(<AccessButtons caseId="55555555-5555-4555-8555-555555555555" versionId={version.id} actions={{
      refresh: false, view: true, download: true, accept: false, reject: false, visibility: false,
      threatBlocked: false, validationFailed: false, viewHint: null, statusLabel: null,
    }} />)
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://s3.example/object?X-Amz-Expires=60", "_blank", "noopener,noreferrer"))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "view", caseId: "55555555-5555-4555-8555-555555555555", versionId: version.id,
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("storageKey")
  })
})
