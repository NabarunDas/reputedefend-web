// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { CaseClient } from "./case-client"
import type { CustomerCasePack } from "@/lib/case/model"

const fetchMock = vi.fn()
const open = vi.fn()
function tab() {
  return { opener: {} as Window | null, close: vi.fn(), location: { href: "about:blank", replace: vi.fn() } }
}

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

const empty: CustomerCasePack = {
  kind: "CASE_ACCESS",
  caseReference: "PR-26-ABCDEF",
  businessName: "Bakery",
  locationName: "High Street",
  maskedEmail: "a***@example.com",
  pack: null,
  evidenceRequests: [],
}

const published: CustomerCasePack = {
  ...empty,
  pack: {
    packNumber: 2,
    publishedAt: "2026-09-28T12:00:00.000Z",
    items: [{
      versionId: "77777777-7777-4777-8777-777777777777",
      position: 1,
      documentTitle: "Supporting invoice",
      originalFilename: "invoice.pdf",
      contentType: "application/pdf",
      sizeBytes: 1024,
    }],
  },
}

describe("customer case documents", () => {
  it("shows the empty published-pack state without OTP or upload controls", () => {
    render(<CaseClient data={empty} />)
    expect(screen.getByRole("heading", { name: "Case documents" })).toBeTruthy()
    expect(screen.getByText(/PR-26-ABCDEF/)).toBeTruthy()
    expect(screen.getByText(/No case documents are currently published/)).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Evidence requests" })).toBeTruthy()
    expect(screen.getByText("No open evidence requests.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull()
    expect(screen.queryByLabelText("Upload evidence")).toBeNull()
    expect(document.body.textContent).not.toMatch(/dashboard|billing|storage|arn:aws/i)
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Fulfil request" })).toBeNull()
  })

  it("lists published documents and opens View without sending a case id", async () => {
    const opened = tab()
    open.mockReturnValue(opened)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: "Open the file in the new tab.", url: "https://s3.example/object?X-Amz-Expires=60" }) })
    render(<CaseClient data={published} />)
    expect(screen.getByText("Supporting invoice")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    await waitFor(() => expect(opened.location.replace).toHaveBeenCalledWith("https://s3.example/object?X-Amz-Expires=60"))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "view", versionId: "77777777-7777-4777-8777-777777777777",
    })
    expect(JSON.stringify(fetchMock.mock.calls[0][1].body)).not.toMatch(/caseId|bucket|email/)
  })

  it("uploads only against an open request and then shows awaiting review", async () => {
    const request = {
      requestId: "88888888-8888-4888-8888-888888888888",
      title: "Utility bill",
      requestText: "Please upload a recent utility bill.",
      dueAt: "2026-10-01T00:00:00.000Z",
      createdAt: "2026-09-28T12:00:00.000Z",
      submissionStatus: "NOT_SUBMITTED" as const,
      filename: null,
      submittedAt: null,
    }
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: "Upload the file directly using the provided fields.",
          versionId: "77777777-7777-4777-8777-777777777777",
          upload: { url: "https://s3.example/post", fields: { key: "cases/x", "Content-Type": "application/pdf" } },
        }),
      })
      .mockResolvedValueOnce({ ok: true, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "Uploaded — awaiting security review" }) })
    render(<CaseClient data={{ ...empty, evidenceRequests: [request] }} />)
    expect(screen.getByText("Utility bill")).toBeTruthy()
    expect(screen.getByText("Please upload a recent utility bill.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Refresh scan" })).toBeNull()
    const file = new File(["%PDF-1.4"], "bill.pdf", { type: "application/pdf" })
    fireEvent.change(screen.getByLabelText("Upload evidence"), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText("Uploaded — awaiting security review")).toBeTruthy())
    expect(screen.getByText(/bill\.pdf/)).toBeTruthy()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "begin",
      evidenceRequestId: request.requestId,
      filename: "bill.pdf",
      contentType: "application/pdf",
      size: file.size,
    })
    expect(JSON.stringify(fetchMock.mock.calls[0][1].body)).not.toMatch(/caseId|bucket|storageKey|customerId|email/)
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      operation: "finalize",
      versionId: "77777777-7777-4777-8777-777777777777",
    })
    expect(screen.queryByRole("button", { name: "View" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull()
  })

  it("does not offer View or Download for an already uploaded customer file", () => {
    render(<CaseClient data={{
      ...empty,
      evidenceRequests: [{
        requestId: "88888888-8888-4888-8888-888888888888",
        title: "Utility bill",
        requestText: "Please upload a recent utility bill.",
        dueAt: null,
        createdAt: "2026-09-28T12:00:00.000Z",
        submissionStatus: "AWAITING_REVIEW",
        filename: "bill.pdf",
        submittedAt: "2026-09-28T13:00:00.000Z",
      }],
    }} />)
    expect(screen.getByText("Uploaded — awaiting security review · bill.pdf")).toBeTruthy()
    expect(screen.queryByLabelText("Upload evidence")).toBeNull()
    expect(screen.queryByRole("button", { name: "View" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull()
  })

  it("lets a pending upload choose the same file again or another file", () => {
    render(<CaseClient data={{
      ...empty,
      evidenceRequests: [{
        requestId: "88888888-8888-4888-8888-888888888888",
        title: "Utility bill",
        requestText: "Please upload a recent utility bill.",
        dueAt: null,
        createdAt: "2026-09-28T12:00:00.000Z",
        submissionStatus: "UPLOAD_PENDING",
        filename: "bill.pdf",
        submittedAt: null,
      }],
    }} />)
    expect(screen.getByText("Upload pending · bill.pdf")).toBeTruthy()
    expect(screen.getByText(/same file to resume/)).toBeTruthy()
    expect(screen.getByLabelText("Upload evidence")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "View" })).toBeNull()
  })
})
