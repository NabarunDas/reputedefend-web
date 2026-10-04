// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../layout"
import { CaseDocuments, CaseDocumentsUnavailable } from "../cases/[reference]/documents/case-documents"
import { DocumentsUnavailable, DocumentsView } from "./documents-view"
import { EvidenceUploadForm } from "./upload-form"
import type { CustomerCaseDocuments, CustomerDocuments } from "@/lib/portal/documents/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/documents" }))
const refresh = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh }),
}))

const submittedAt = "2026-10-04T12:00:00.000Z"
const publishedAt = "2026-10-05T12:00:00.000Z"
const dueAt = "2026-10-08T12:00:00.000Z"

const context = {
  reference: "PR-26-ABCDEF",
  caseType: "PROFILE_RECOVERY" as const,
  serviceTrack: "GUIDED" as const,
  businessName: "Harbour Bakery",
  locationName: "High Street",
}

const documents: CustomerDocuments = {
  needs: [{
    ...context,
    selector: "er-1",
    title: "Proof of control",
    requestText: "Upload the document that shows you control the profile.",
    dueAt,
    state: "NOT_SUBMITTED",
    filename: null,
  }],
  submissions: [
    { ...context, title: "Proof of control", filename: "control.pdf", submittedAt, state: "RECEIVED" },
    { ...context, reference: "PR-26-SECOND2", title: "Checking file", filename: "check.png", submittedAt, state: "BEING_CHECKED" },
    { ...context, reference: "PR-26-THIRD32", title: "Review file", filename: "review.pdf", submittedAt, state: "UNDER_REVIEW" },
    { ...context, reference: "PR-26-FOURTH2", title: "Accepted file", filename: "accepted.pdf", submittedAt, state: "ACCEPTED" },
    { ...context, reference: "PR-26-FIFTH32", title: "Another file", filename: "again.pdf", submittedAt, state: "NEEDS_ANOTHER" },
  ],
  documents: [{
    ...context,
    selector: "pd-1",
    title: "Prepared letter",
    filename: "letter.pdf",
    contentType: "application/pdf",
    sizeBytes: 20480,
    publishedAt,
  }],
}

const caseDocuments: CustomerCaseDocuments = {
  found: true,
  case: context,
  requests: [
    {
      selector: "er-1",
      title: "Proof of control",
      requestText: "Upload the document that shows you control the profile.",
      dueAt,
      state: "NOT_SUBMITTED",
      filename: null,
      submittedAt: null,
      canUpload: true,
    },
    {
      selector: "er-2",
      title: "Earlier upload",
      requestText: "This file is already with ProfileRelaunch.",
      dueAt: null,
      state: "UPLOAD_IN_PROGRESS",
      filename: "pending.pdf",
      submittedAt: null,
      canUpload: true,
    },
  ],
  submissions: [{ title: "Earlier upload", filename: "control.pdf", submittedAt, state: "RECEIVED" }],
  documents: [{
    selector: "pd-1",
    title: "Prepared letter",
    filename: "letter.pdf",
    contentType: "application/pdf",
    sizeBytes: 20480,
    publishedAt,
  }],
}

const raw = /PENDING_UPLOAD|UPLOADED|NO_THREATS_FOUND|THREATS_FOUND|VALID|REJECTED|ACCEPTED|UNREVIEWED|supabase|storageKey|storage_key|X-Amz|s3:\/\//
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

afterEach(cleanup)

describe("documents pages", () => {
  beforeEach(() => {
    nav.pathname = "/portal/documents"
  })

  it("shows needs, submissions, published documents and the documents navigation state", () => {
    render(<PortalLayout><DocumentsView documents={documents} /></PortalLayout>)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Documents" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Evidence we need from you" })).toBeTruthy()
    expect(screen.getAllByRole("heading", { name: "Proof of control" }).length).toBeGreaterThan(0)
    expect(screen.getByText("Upload the document that shows you control the profile.")).toBeTruthy()
    expect(screen.getByText("Requested by 8 October 2026")).toBeTruthy()
    expect(screen.getByText("Not submitted")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Upload evidence for PR-26-ABCDEF" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/documents")
    expect(screen.getByText("Received")).toBeTruthy()
    expect(screen.getByText("Being checked")).toBeTruthy()
    expect(screen.getByText("Under review")).toBeTruthy()
    expect(screen.getByText("Accepted")).toBeTruthy()
    expect(screen.getByText("We need another document")).toBeTruthy()
    expect(screen.getAllByText("Submitted 4 October 2026").length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "Documents from ProfileRelaunch" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Download letter.pdf" })).toHaveAttribute(
      "href",
      "/api/portal/documents/download?reference=PR-26-ABCDEF&selector=pd-1",
    )
    const current = screen.getByRole("navigation", { name: "Customer portal" }).querySelector("[aria-current='page']")
    expect(current).toHaveTextContent("Documents")
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("href", "/portal/payments")
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toHaveAttribute("href", "/portal/guard")
    expect(screen.queryByRole("link", { name: "Account" })).toBeNull()
    expect(screen.queryByRole("button", { name: /quote|agreement|pay|message/i })).toBeNull()
    expect(document.body.innerHTML).not.toMatch(uuid)
    expect(document.body.textContent).not.toMatch(raw)
    expect(document.body.innerHTML).not.toMatch(/[?&](caseId|requestId|documentId|versionId)=/)
  })

  it("uses empty states when nothing is waiting", () => {
    render(<DocumentsView documents={{ needs: [], submissions: [], documents: [] }} />)
    expect(screen.getByText("Nothing is waiting for you to upload.")).toBeTruthy()
    expect(screen.getByText("You haven't submitted any evidence yet.")).toBeTruthy()
    expect(screen.getByText("ProfileRelaunch hasn't published any documents for you yet.")).toBeTruthy()
  })

  it("keeps a service failure distinct from an empty page", () => {
    render(<DocumentsUnavailable />)
    expect(screen.getByRole("heading", { name: "We couldn't load your documents" })).toBeTruthy()
    expect(screen.queryByText("Nothing is waiting for you to upload.")).toBeNull()
  })

  it("shows a case workspace for evidence, including a closed case without a new upload", () => {
    nav.pathname = "/portal/cases/PR-26-ABCDEF/documents"
    const { unmount } = render(<PortalLayout><CaseDocuments documents={caseDocuments} /></PortalLayout>)
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Documents and evidence" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to this case" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF")
    expect(screen.getAllByLabelText("Choose a file")).toHaveLength(2)
    expect(screen.getAllByRole("button", { name: "Upload evidence" })).toHaveLength(2)
    expect(screen.getAllByText("PDF, JPEG, PNG, WebP or DOCX. Maximum size 10 MB.")).toHaveLength(2)
    expect(screen.getByText(/Upload in progress/)).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Customer portal" }).querySelector("[aria-current='page']")).toHaveTextContent("Cases")
    expect(document.body.innerHTML).not.toMatch(uuid)
    unmount()

    const closed: CustomerCaseDocuments = {
      ...caseDocuments,
      requests: [{ ...caseDocuments.requests[0], state: "NEEDS_ANOTHER", filename: "old.pdf", submittedAt, canUpload: false }],
      submissions: [{ title: "Proof of control", filename: "old.pdf", submittedAt, state: "NEEDS_ANOTHER" }],
    }
    render(<CaseDocuments documents={closed} />)
    expect(screen.queryByLabelText("Choose a file")).toBeNull()
    expect(screen.queryByRole("button", { name: "Upload evidence" })).toBeNull()
    expect(screen.getByText("We need another document")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Download letter.pdf" })).toBeTruthy()
  })

  it("keeps a case documents failure distinct from a missing case", () => {
    render(<CaseDocumentsUnavailable />)
    expect(screen.getByRole("heading", { name: "We couldn't load documents for this case" })).toBeTruthy()
    expect(screen.queryByText(/not found|does not exist/i)).toBeNull()
  })
})

describe("evidence upload form", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    refresh.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  function renderForm() {
    return render(<EvidenceUploadForm reference="PR-26-ABCDEF" selector="er-1" />)
  }

  function chooseFile(name: string, type: string) {
    const input = screen.getByLabelText("Choose a file") as HTMLInputElement
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["bytes"], name, { type })] })
    const form = input.form
    if (!form) throw new Error("missing form")
    return form
  }

  it("rejects an unsupported file before calling the server", async () => {
    renderForm()
    fireEvent.submit(chooseFile("notes.exe", "application/octet-stream"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Check the file type and size")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uploads through begin, storage and finalise, and ignores a second submit while busy", async () => {
    let release: (value: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    renderForm()
    const form = chooseFile("control.pdf", "application/pdf")
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Uploading evidence" })).toBeDisabled()
    release({
      ok: true,
      json: async () => ({
        message: "Upload the file directly using the provided fields.",
        upload: { url: "https://uploads.example/post", fields: { key: "opaque", "Content-Type": "application/pdf" } },
      }),
    })
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "We've received your file. It still needs to be checked." }),
    })
    expect(await screen.findByText("We've received your file. It still needs to be checked.")).toBeTruthy()
    expect(refresh).toHaveBeenCalled()
    const begin = fetchMock.mock.calls[0]
    expect(begin[0]).toBe("/api/portal/evidence")
    expect(JSON.parse(begin[1].body)).toMatchObject({ operation: "begin", reference: "PR-26-ABCDEF", selector: "er-1", filename: "control.pdf" })
    expect(begin[1].body).not.toMatch(uuid)
    expect(fetchMock.mock.calls[1][0]).toBe("https://uploads.example/post")
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ operation: "finalize", reference: "PR-26-ABCDEF", selector: "er-1" })
  })

  it("shows a service failure without infrastructure detail", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "We couldn't upload that file. Please try again shortly." }) })
    renderForm()
    fireEvent.submit(chooseFile("control.pdf", "application/pdf"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Please try again shortly")
    await waitFor(() => expect(screen.getByRole("button", { name: "Upload evidence" })).toBeEnabled())
  })
})
