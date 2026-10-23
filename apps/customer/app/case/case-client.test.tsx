// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { CaseClient } from "./case-client"
import { DOCX_MIME, MAX_EVIDENCE_BYTES, allowedFileAccept, evidenceFormatSummary, evidenceSizeSummary, type CustomerCasePack, type CustomerEvidenceRequest } from "@/lib/case/model"

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

const openRequest: CustomerEvidenceRequest = {
  requestId: "88888888-8888-4888-8888-888888888888",
  title: "Utility bill",
  requestText: "Please upload a recent utility bill.",
  dueAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-09-28T12:00:00.000Z",
  submissionStatus: "NOT_SUBMITTED",
  filename: null,
  submittedAt: null,
}

function fileWithSize(name: string, type: string, size: number) {
  const file = new File(["x"], name, { type })
  Object.defineProperty(file, "size", { value: size })
  return file
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
    await waitFor(() => expect(screen.getAllByRole("status").map(node => node.textContent)).toEqual(["Uploaded — awaiting security review"]))
    expect(screen.getAllByText("Uploaded — awaiting security review")).toHaveLength(1)
    expect(screen.getByText("Your document has been received. Our team will review it and contact you by email if we need anything else. No further action is required at the moment. You can close this window.")).toBeTruthy()
    expect(screen.getByText("bill.pdf").closest("[role='status']")).toBeNull()
    expect(screen.queryByLabelText("Upload evidence")).toBeNull()
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull()
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

  it("shows three independently uploadable documents from one secured evidence request", async () => {
    const documents = [
      "Google suspension or rejection notice",
      "Address details",
      "Council address details",
    ]
    const request = {
      ...openRequest,
      title: documents.join("; "),
      requestText: documents.map(title => `${title} — Please provide a supporting document.`).join("\n"),
      items: documents.map(title => ({
        title, submissionStatus: "NOT_SUBMITTED" as const, filename: null, submittedAt: null,
      })),
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        versionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        upload: { url: "https://s3.example/post", fields: { key: "cases/x", "Content-Type": "application/pdf" } },
      }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "Uploaded — awaiting security review" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        versionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        upload: { url: "https://s3.example/post", fields: { key: "cases/y", "Content-Type": "application/pdf" } },
      }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "Uploaded — awaiting security review" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<CaseClient data={{ ...empty, evidenceRequests: [request] }} />)
    expect(screen.getByText("0 of 3 documents received")).toBeTruthy()
    expect(screen.getByLabelText("Upload Google suspension or rejection notice")).toBeTruthy()
    expect(screen.getByLabelText("Upload Address details")).toBeTruthy()
    expect(screen.getByLabelText("Upload Council address details")).toBeTruthy()
    const pdf = new File(["%PDF-1.4"], "notice.pdf", { type: "application/pdf" })
    fireEvent.change(screen.getByLabelText("Upload Google suspension or rejection notice"), { target: { files: [pdf] } })
    await waitFor(() => expect(screen.getByText("1 of 3 documents received")).toBeTruthy())
    expect(screen.queryByLabelText("Upload Google suspension or rejection notice")).toBeNull()
    expect(screen.getByLabelText("Upload Address details")).toBeTruthy()
    expect(screen.getByLabelText("Upload Council address details")).toBeTruthy()
    expect(screen.queryByText(/No further action is required at the moment/)).toBeNull()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      operation: "begin", evidenceRequestId: openRequest.requestId,
      itemTitle: "Google suspension or rejection notice", filename: "notice.pdf",
    })
    fireEvent.change(screen.getByLabelText("Upload Address details"), {
      target: { files: [new File(["%PDF-1.4"], "address.pdf", { type: "application/pdf" })] },
    })
    await waitFor(() => expect(screen.getByText("2 of 3 documents received")).toBeTruthy())
    expect(JSON.parse(String(fetchMock.mock.calls[3][1].body))).toMatchObject({
      operation: "begin", evidenceRequestId: openRequest.requestId,
      itemTitle: "Address details", filename: "address.pdf",
    })
    expect(screen.getByLabelText("Upload Council address details")).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it("keeps previously submitted document slots while offering only missing items", () => {
    const titles = ["Notice from Google", "Business address proof", "Council letter"]
    render(<CaseClient data={{ ...empty, evidenceRequests: [{
      ...openRequest,
      title: titles.join("; "),
      items: titles.map((title, index) => ({
        title,
        submissionStatus: index === 0 ? "AWAITING_REVIEW" as const : "NOT_SUBMITTED" as const,
        filename: index === 0 ? "notice.pdf" : null,
        submittedAt: index === 0 ? "2026-10-23T13:00:00Z" : null,
      })),
    }] }} />)
    expect(screen.getByText("1 of 3 documents received")).toBeTruthy()
    expect(screen.getByText("Uploaded — awaiting security review")).toBeTruthy()
    expect(screen.getByText("notice.pdf")).toBeTruthy()
    expect(screen.queryByLabelText("Upload Notice from Google")).toBeNull()
    expect(screen.getByLabelText("Upload Business address proof")).toBeTruthy()
    expect(screen.getByLabelText("Upload Council letter")).toBeTruthy()
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
    expect(screen.getAllByRole("status").map(node => node.textContent)).toEqual(["Uploaded — awaiting security review"])
    expect(screen.getAllByText("Uploaded — awaiting security review")).toHaveLength(1)
    expect(screen.getByText("Your document has been received. Our team will review it and contact you by email if we need anything else. No further action is required at the moment. You can close this window.")).toBeTruthy()
    expect(screen.getByText("bill.pdf").closest("[role='status']")).toBeNull()
    expect(screen.queryByLabelText("Upload evidence")).toBeNull()
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull()
    expect(screen.queryByText("No case documents are currently published.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "View" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Download" })).toBeNull()
  })

  it("shows accepted formats and the 10 MB limit from the upload policy", () => {
    render(<CaseClient data={{ ...empty, evidenceRequests: [openRequest] }} />)
    expect(evidenceFormatSummary()).toBe("PDF, JPG/JPEG, PNG, WebP, DOCX")
    expect(evidenceSizeSummary()).toBe("Maximum 10 MB per file")
    expect(screen.getByText(`Accepted formats: ${evidenceFormatSummary()}. ${evidenceSizeSummary()}.`)).toBeTruthy()
    expect(screen.getByLabelText("Upload evidence")).toHaveAttribute("accept", allowedFileAccept)
    expect(screen.getByLabelText("Upload evidence")).toHaveAttribute("aria-describedby")
  })

  it("rejects an empty file, a disallowed type and an oversized file before the upload API", () => {
    render(<CaseClient data={{ ...empty, evidenceRequests: [openRequest] }} />)
    const input = screen.getByLabelText("Upload evidence")
    fireEvent.change(input, { target: { files: [new File([], "empty.pdf", { type: "application/pdf" })] } })
    expect(screen.getByRole("alert").textContent).toMatch(/This file is empty/)
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { files: [new File(["notes"], "notes.txt", { type: "text/plain" })] } })
    expect(screen.getByRole("alert").textContent).toBe("This file type is not accepted. Use PDF, JPG/JPEG, PNG, WebP or DOCX.")
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { files: [fileWithSize("big.pdf", "application/pdf", MAX_EVIDENCE_BYTES + 1)] } })
    expect(screen.getByRole("alert").textContent).toBe("This file is too large. Maximum 10 MB per file.")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Upload evidence")).toBeTruthy()
  })

  it("accepts every format in the upload policy and still asks the server to validate it", async () => {
    const samples = [
      ["bill.pdf", "application/pdf"],
      ["photo.jpg", "image/jpeg"],
      ["photo.jpeg", "image/jpeg"],
      ["scan.png", "image/png"],
      ["scan.webp", "image/webp"],
      ["letter.docx", DOCX_MIME],
    ] as const
    for (const [name, type] of samples) {
      cleanup()
      fetchMock.mockReset()
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "That file cannot be uploaded." }) })
      render(<CaseClient data={{ ...empty, evidenceRequests: [openRequest] }} />)
      fireEvent.change(screen.getByLabelText("Upload evidence"), { target: { files: [new File(["x"], name, { type })] } })
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
        operation: "begin",
        filename: name,
        contentType: type,
      })
      expect(screen.queryByText(/not accepted/)).toBeNull()
      expect(screen.queryByText(/too large/)).toBeNull()
      expect(screen.queryByText(/file is empty/)).toBeNull()
    }
  })

  it("hides published-document copy on an evidence-only link", () => {
    render(<CaseClient data={{
      ...empty,
      kind: "COMMUNICATION_ACCESS",
      pack: published.pack,
      evidenceRequests: [{ ...openRequest, submissionStatus: "AWAITING_REVIEW", filename: "bill.pdf", submittedAt: "2026-09-28T13:00:00.000Z" }],
    }} />)
    expect(screen.queryByText("No case documents are currently published.")).toBeNull()
    expect(screen.queryByText("Published pack #2")).toBeNull()
    expect(screen.queryByText("Supporting invoice")).toBeNull()
    expect(screen.getByText("Utility bill")).toBeTruthy()
    expect(screen.getAllByRole("status").map(node => node.textContent)).toEqual(["Uploaded — awaiting security review"])
    expect(screen.queryByLabelText("Upload evidence")).toBeNull()
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull()
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
    expect(screen.getByText("Upload pending")).toBeTruthy()
    expect(screen.getByText("bill.pdf")).toBeTruthy()
    expect(screen.getByText(/same file to resume/)).toBeTruthy()
    expect(screen.getByLabelText("Upload evidence")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "View" })).toBeNull()
  })
})
