// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { evidenceActions, type EvidenceRequest } from "@/lib/evidence/model"
import { AccessButtons, ApprovePackForm, CreateDraftPackForm, CreateRequestForm, PreparedPackPanel, RequestStatusForm, ReviewForms, UploadEvidenceForm, VisibilityForm } from "./forms"
import { PACK_APPROVAL_WARNING, PACK_CONFIRMATION, PACK_PUBLISH_CONFIRMATION, PACK_PUBLISH_WARNING, type PreparedPack } from "@/lib/packs/model"
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
function tab() {
  return {
    opener: {} as Window | null,
    close: vi.fn(),
    location: { href: "about:blank", replace: vi.fn() },
  }
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

const enabledAccess = {
  refresh: false, view: true, download: true, accept: false, reject: false, visibility: false,
  threatBlocked: false, validationFailed: false, viewHint: null, statusLabel: null,
}

describe("evidence forms", () => {
  it("states that creating a request does not send email", () => {
    render(<CreateRequestForm caseId="55555555-5555-4555-8555-555555555555" />)
    expect(screen.getByText(/does not send an email/)).toBeTruthy()
    expect(screen.getByText(/records what is needed. It does not contact the customer/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/customer portal|mailto:|Request sent/i)
  })
  it("shows 10 MB type guidance on upload", () => {
    render(<UploadEvidenceForm caseId="55555555-5555-4555-8555-555555555555" documents={[]} openRequests={[]} />)
    expect(screen.getByText(/Maximum file size 10 MB/)).toBeTruthy()
    expect(screen.getByLabelText("File")).toHaveAttribute("accept", ".pdf,.jpg,.jpeg,.png,.webp,.docx")
    expect(screen.queryByLabelText(/Which evidence request/)).toBeNull()
  })
  it("can associate an upload with an open request or leave it standalone", () => {
    const request = {
      id: "88888888-8888-4888-8888-888888888888", title: "Proof of ownership", requestText: "Please upload it.",
      status: "OPEN", dueAt: null, createdAt: "2026-09-01T00:00:00.000Z", fulfilledAt: null, version: 1,
    } as EvidenceRequest
    render(<UploadEvidenceForm caseId="55555555-5555-4555-8555-555555555555" documents={[]} openRequests={[request]} />)
    const select = screen.getByLabelText("Which evidence request does this file answer?")
    expect(select).toHaveValue("")
    expect(screen.getByRole("option", { name: "Not linked to a request" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Proof of ownership" })).toBeTruthy()
  })
  it("shows Mark fulfilled immediately when accepted evidence leaves the request open", () => {
    const request = {
      id: "88888888-8888-4888-8888-888888888888", title: "Proof of ownership", requestText: "Please upload it.",
      status: "OPEN", dueAt: null, createdAt: "2026-09-01T00:00:00.000Z", fulfilledAt: null, version: 2,
    } as EvidenceRequest
    render(<RequestStatusForm caseId="55555555-5555-4555-8555-555555555555" request={request} prominentFulfil />)
    expect(screen.getByRole("button", { name: "Mark fulfilled Proof of ownership" })).toBeTruthy()
    expect(screen.queryByText("Request sent")).toBeNull()
    expect(document.body.textContent).not.toMatch(/automatically fulfil/i)
  })
  it("does not offer view, download or accept for a threat-blocked file", () => {
    const actions = evidenceActions({
      uploadStatus: "UPLOADED", scanStatus: "THREATS_FOUND", validationStatus: "VALID", reviewStatus: "UNREVIEWED", contentType: "application/pdf",
    })
    render(<AccessButtons caseId="55555555-5555-4555-8555-555555555555" versionId={version.id} actions={actions} />)
    expect(screen.getByRole("button", { name: "View" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Download" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
    cleanup()
    render(<ReviewForms caseId="55555555-5555-4555-8555-555555555555" version={version} actions={actions} />)
    expect(screen.queryByText("Accept")).toBeNull()
    expect(screen.queryByText("Reject")).toBeNull()
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
    expect(screen.getByText(/required before a pack containing this file can be published/)).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: /visibility change/ }) as HTMLInputElement).required).toBe(true)
  })
  it("opens a blank tab synchronously and navigates it after a successful View", async () => {
    let resolveFetch: (value: { ok: boolean; status: number; json: () => Promise<{ message: string; url: string }> }) => void = () => { /* pending */ }
    fetchMock.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve }))
    const opened = tab()
    open.mockReturnValue(opened)
    render(<AccessButtons caseId="55555555-5555-4555-8555-555555555555" versionId={version.id} actions={enabledAccess} />)
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    expect(open).toHaveBeenCalledWith("about:blank", "_blank")
    expect(open).toHaveBeenCalledTimes(1)
    expect(opened.opener).toBeNull()
    expect(opened.location.replace).not.toHaveBeenCalled()
    resolveFetch({ ok: true, status: 200, json: async () => ({ message: "Open the file in the new tab.", url: "https://s3.example/object?X-Amz-Expires=60" }) })
    await waitFor(() => expect(opened.location.replace).toHaveBeenCalledWith("https://s3.example/object?X-Amz-Expires=60"))
    expect(opened.close).not.toHaveBeenCalled()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "view", caseId: "55555555-5555-4555-8555-555555555555", versionId: version.id,
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("storageKey")
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
  it("closes the temporary tab when View is denied", async () => {
    const opened = tab()
    open.mockReturnValue(opened)
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: "That file cannot be opened." }) })
    render(<AccessButtons caseId="55555555-5555-4555-8555-555555555555" versionId={version.id} actions={enabledAccess} />)
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    await waitFor(() => expect(opened.close).toHaveBeenCalled())
    expect(opened.location.replace).not.toHaveBeenCalled()
    expect(screen.getByRole("status").textContent).toContain("That file cannot be opened.")
  })
  it("explains when the browser blocks the new tab", async () => {
    open.mockReturnValue(null)
    render(<AccessButtons caseId="55555555-5555-4555-8555-555555555555" versionId={version.id} actions={enabledAccess} />)
    fireEvent.click(screen.getByRole("button", { name: "Download" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Your browser blocked the new tab. Allow pop-ups for the Admin Portal and try again.")
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("keeps DOCX View disabled", () => {
    render(<AccessButtons caseId="55555555-5555-4555-8555-555555555555" versionId={version.id} actions={{
      ...enabledAccess, view: false, viewHint: "Preview not available for this file type",
    }} />)
    expect(screen.getByRole("button", { name: "View" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Download" })).not.toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "View" }))
    expect(open).not.toHaveBeenCalled()
  })
  it("states that pack approval does not confirm payment, permission or Google submission", () => {
    render(<CreateDraftPackForm caseId="55555555-5555-4555-8555-555555555555" />)
    expect(screen.getByText(PACK_APPROVAL_WARNING)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create new draft pack" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Submit to Google|customer portal|payment received/i)
  })
  it("offers Create new draft pack only when no DRAFT pack exists", () => {
    const caseId = "55555555-5555-4555-8555-555555555555"
    const draft: PreparedPack = {
      id: "99999999-9999-4999-8999-999999999999", packNumber: 2, status: "DRAFT", approvalNote: "",
      createdAt: "2026-09-18T10:00:00.000Z", approvedAt: null, recordVersion: 1, items: [],
    }
    const stale: PreparedPack = { ...draft, id: "88888888-8888-4888-8888-888888888888", packNumber: 1, status: "STALE", approvalNote: "This exact evidence selection is the prepared pack for internal use.", approvedAt: "2026-09-18T11:00:00.000Z" }
    render(<PreparedPackPanel caseId={caseId} packs={{ caseId, packs: [stale], eligible: [] }} />)
    expect(screen.getByRole("button", { name: "Create new draft pack" })).toBeTruthy()
    cleanup()
    render(<PreparedPackPanel caseId={caseId} packs={{ caseId, packs: [stale, draft], eligible: [] }} />)
    expect(screen.queryByRole("button", { name: "Create new draft pack" })).toBeNull()
  })
  it("requires an approval note and explicit confirmation", () => {
    render(<ApprovePackForm caseId="55555555-5555-4555-8555-555555555555" pack={{
      id: "99999999-9999-4999-8999-999999999999", packNumber: 1, status: "DRAFT", approvalNote: "",
      createdAt: "2026-09-18T10:00:00.000Z", approvedAt: null, recordVersion: 2, items: [],
    }} />)
    fireEvent.click(screen.getByRole("button", { name: "Review and approve pack" }))
    expect(screen.getByText("Approval note")).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: PACK_CONFIRMATION }) as HTMLInputElement).required).toBe(true)
    expect(screen.queryByRole("button", { name: /submit to google/i })).toBeNull()
  })
  it("offers publish and unpublish without changing workflow copy", () => {
    const caseId = "55555555-5555-4555-8555-555555555555"
    const item = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      versionId: version.id, position: 1, documentTitle: "Supporting invoice", originalFilename: "invoice.pdf",
      contentType: "application/pdf", sizeBytes: 1024, versionNumber: 1, customerVisible: true,
    }
    const approved: PreparedPack = {
      id: "99999999-9999-4999-8999-999999999999", packNumber: 1, status: "APPROVED",
      approvalNote: "This exact evidence selection is the prepared pack for internal use.",
      createdAt: "2026-09-18T10:00:00.000Z", approvedAt: "2026-09-18T11:00:00.000Z", recordVersion: 3,
      published: false, publicationBlock: null, items: [item],
    }
    render(<PreparedPackPanel caseId={caseId} packs={{ caseId, packs: [approved], eligible: [] }} />)
    expect(screen.getByText("Approved — not yet shared with customer")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Review and publish pack" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Prepare a replacement draft" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Create new draft pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Publish pack" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Review and publish pack" }))
    expect(screen.getByText(PACK_PUBLISH_WARNING)).toBeTruthy()
    expect(screen.getByRole("region", { name: "Review pack before publishing" })).toHaveTextContent("Supporting invoice")
    expect(screen.getByRole("region", { name: "Review pack before publishing" })).toHaveTextContent("File name: invoice.pdf")
    expect((screen.getByRole("checkbox", { name: PACK_PUBLISH_CONFIRMATION }) as HTMLInputElement).required).toBe(true)
    expect((screen.getByRole("checkbox", { name: "I confirm these exact files are suitable for this customer to access." }) as HTMLInputElement).required).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/Submit to Google|Mark as paid|customer upload/i)
    cleanup()
    render(<PreparedPackPanel caseId={caseId} packs={{ caseId, packs: [{ ...approved, published: true, publicationNote: "Publish this pack for the customer case-access view." }], eligible: [] }} />)
    expect(screen.getByText("Published — available in the customer portal")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Unpublish pack" })).toHaveClass("secondary")
    expect(screen.queryByRole("button", { name: "Review and publish pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Publish pack" })).toBeNull()
  })
})

describe("prepared pack publication actions", () => {
  const caseId = "55555555-5555-4555-8555-555555555555"
  const item = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    versionId: version.id, position: 1, documentTitle: "How to submit", originalFilename: "How to submit.docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 4096, versionNumber: 1,
    customerVisible: true, role: "INSTRUCTIONS" as const,
  }
  const second = {
    ...item, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    versionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", position: 2, documentTitle: "Ownership letter",
    originalFilename: "ownership.pdf", contentType: "application/pdf", role: undefined,
  }
  function pack(overrides: Partial<PreparedPack> = {}): PreparedPack {
    return {
      id: "99999999-9999-4999-8999-999999999999", packNumber: 1, status: "APPROVED",
      approvalNote: "Selected evidence only.", createdAt: "2026-09-18T10:00:00.000Z",
      approvedAt: "2026-09-18T11:00:00.000Z", recordVersion: 4, published: false, publicationBlock: null, items: [item, second],
      ...overrides,
    }
  }
  function show(rows: PreparedPack[]) {
    render(<PreparedPackPanel caseId={caseId} packs={{ caseId, packs: rows, eligible: [] }} />)
  }
  const absent = (name: string) => expect(screen.queryByRole("button", { name })).toBeNull()

  it("keeps publish behind the file inventory and sends the existing payload", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The pack is available in the portal." }) })
    show([pack()])
    fireEvent.click(screen.getByRole("button", { name: "Review and publish pack" }))
    const review = screen.getByRole("region", { name: "Review pack before publishing" })
    expect(review).toHaveTextContent("2 files.")
    expect(review).toHaveTextContent("How to submit")
    expect(review).toHaveTextContent("File name: How to submit.docx")
    expect(review).toHaveTextContent("Role: Customer submission instructions")
    expect(review).toHaveTextContent("Ownership letter")
    expect(review).toHaveTextContent("File name: ownership.pdf")
    expect(review).not.toHaveTextContent("Role: Supporting evidence")
    expect(review).toHaveTextContent("This screen does not decide whether a file name is safe to share.")
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole("textbox", { name: /Publication note/ }), { target: { value: "Share these two files in the portal." } })
    fireEvent.click(screen.getByRole("checkbox", { name: "I confirm these exact files are suitable for this customer to access." }))
    fireEvent.click(screen.getByRole("checkbox", { name: PACK_PUBLISH_CONFIRMATION }))
    fireEvent.submit(screen.getByRole("button", { name: "Publish pack" }).closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/packs/command")
    expect(JSON.parse(request.body)).toEqual({
      operation: "publish",
      caseId,
      packId: "99999999-9999-4999-8999-999999999999",
      recordVersion: 4,
      note: "Share these two files in the portal.",
      confirmed: true,
    })
    expect(request.headers["idempotency-key"]).toEqual(expect.any(String))
  })

  it("explains that publishing will share files which are not visible yet", () => {
    show([pack({ items: [{ ...item, customerVisible: false, shareable: true }, { ...second, customerVisible: false, shareable: true }] })])
    fireEvent.click(screen.getByRole("button", { name: "Review and publish pack" }))
    expect(screen.getByText("Publishing makes these exact files available in the customer portal. Staff do not mark each file visible separately.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Publish pack" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Prepare a replacement draft" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Evidence & Documents/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("disables publication when eligibility is missing or a real blocker is known", () => {
    show([pack({ publicationBlock: undefined })])
    fireEvent.click(screen.getByRole("button", { name: "Review and publish pack" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Eligibility could not be confirmed")
    expect(screen.getByRole("button", { name: "Publish pack" })).toBeDisabled()
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.getByRole("button", { name: "Prepare a replacement draft" })).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    cleanup()
    show([pack({ publicationBlock: "version", items: [{ ...item, customerVisible: false, shareable: false }] })])
    fireEvent.click(screen.getByRole("button", { name: "Review and publish pack" }))
    expect(screen.getByRole("alert")).toHaveTextContent("A listed file is not a clean, accepted version")
    expect(screen.getByRole("button", { name: "Publish pack" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Prepare a replacement draft" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Publish pack" }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("emphasises adding documents and approval while a draft is open", () => {
    show([pack({ status: "DRAFT", approvedAt: null, published: false, items: [item] })])
    expect(screen.getByText("Draft — add documents, then approve")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Eligible accepted evidence" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Review and approve pack" })).toBeTruthy()
    absent("Review and publish pack")
    absent("Publish pack")
    absent("Create new draft pack")
    absent("Prepare a replacement draft")
    absent("Unpublish pack")
  })

  it("offers no publication action for a stale or superseded pack", () => {
    show([pack({ status: "STALE", items: [item] })])
    expect(screen.getByText(/Pack stale/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create new draft pack" })).toBeTruthy()
    absent("Review and publish pack")
    absent("Publish pack")
    absent("Unpublish pack")
    absent("Review and approve pack")
    cleanup()
    show([pack({ status: "SUPERSEDED", published: false, items: [item] })])
    expect(screen.getByText("Superseded — read-only history")).toBeTruthy()
    expect(screen.getByText("This pack was replaced by a later pack. It cannot be changed or published.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create new draft pack" })).toBeTruthy()
    absent("Review and publish pack")
    absent("Publish pack")
    absent("Unpublish pack")
    absent("Prepare a replacement draft")
    absent("Review and approve pack")
  })

  it("keeps the current draft in front and leaves older packs in history", () => {
    const older = pack({
      id: "88888888-8888-4888-8888-888888888888",
      packNumber: 1,
      status: "APPROVED",
      published: true,
      publicationNote: "Shared with the customer.",
    })
    const draft = pack({
      id: "77777777-7777-4777-8777-777777777771",
      packNumber: 2,
      status: "DRAFT",
      approvedAt: null,
      published: false,
      publicationNote: undefined,
      items: [{ ...item, role: "DELIVERABLE" }],
    })
    render(<PreparedPackPanel caseId={caseId} guided packs={{ caseId, packs: [older, draft], eligible: [] }} />)
    expect(screen.getByRole("article", { name: "Current pack 2" })).toHaveTextContent("This is the pack to change.")
    expect(screen.getByRole("article", { name: "Current pack 2" })).toHaveTextContent("Draft — add documents, then approve")
    const history = screen.getByText("Previous packs / History").closest("details") as HTMLDetailsElement
    expect(history.querySelector("summary")?.tagName).toBe("SUMMARY")
    expect(history.open).toBe(false)
    expect(screen.queryByRole("button", { name: "Review and publish pack", hidden: true })).toBeNull()
    expect(screen.queryByRole("button", { name: "Publish pack", hidden: true })).toBeNull()
    expect(within(screen.getByRole("article", { name: "Current pack 2" })).queryByRole("button", { name: "Unpublish pack" })).toBeNull()
    history.open = true
    expect(fetchMock).not.toHaveBeenCalled()
    const previous = screen.getByRole("article", { name: "Pack 1" })
    expect(within(previous).getByRole("button", { name: "Unpublish pack" })).toBeTruthy()
    expect(within(previous).queryByRole("button", { name: "Change role" })).toBeNull()
    expect(within(previous).queryByRole("button", { name: "Remove" })).toBeNull()
    expect(previous).toHaveTextContent("Published — available in the customer portal")
    expect(screen.getByRole("article", { name: "Pack 1" })).toHaveTextContent("Creating a draft does not remove customer access.")
    expect(screen.getByRole("article", { name: "Pack 1" })).toHaveTextContent("Publication note: Shared with the customer.")
    expect(screen.getByRole("article", { name: "Pack 1" }).querySelector("button[type='submit']")).toBeNull()
    expect(screen.getAllByRole("button", { name: "View" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("button", { name: "Download" }).length).toBeGreaterThan(0)
  })

  it("requires a chosen role before a file can be added", () => {
    render(<PreparedPackPanel caseId={caseId} guided packs={{
      caseId,
      packs: [pack({ status: "DRAFT", approvedAt: null, published: false, items: [{ ...item, role: "DELIVERABLE" }] })],
      eligible: [{
        documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        versionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        versionNumber: 1,
        documentTitle: "Ownership letter",
        originalFilename: "ownership.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048,
      }],
    }} />)
    const selects = screen.getAllByRole("combobox", { name: "Role in the Guided pack" }) as HTMLSelectElement[]
    expect(selects.map(select => select.value).sort()).toEqual(["", "DELIVERABLE"])
    expect(selects.every(select => select.required)).toBe(true)
    expect(screen.getAllByRole("option", { name: "Choose a role" }).every(option => (option as HTMLOptionElement).disabled)).toBe(true)
    expect(screen.getByText(/Choose a role\. A Guided pack needs exactly one completed statement/)).toBeTruthy()
  })

  it("changes a draft document role without removing the file", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The document role has been updated. The pack is still a draft." }) })
    render(<PreparedPackPanel caseId={caseId} guided packs={{
      caseId,
      packs: [pack({ status: "DRAFT", approvedAt: null, published: false, items: [{ ...item, role: "DELIVERABLE" }] })],
      eligible: [],
    }} />)
    const form = screen.getByRole("button", { name: "Change role" }).closest("form")!
    fireEvent.change(form.querySelector("select")!, { target: { value: "INSTRUCTIONS" } })
    fireEvent.submit(form)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "set_item_role",
      caseId,
      packId: "99999999-9999-4999-8999-999999999999",
      recordVersion: 4,
      versionId: version.id,
      role: "INSTRUCTIONS",
    })
  })

  it("explains a Guided draft that has five statements and no instructions", () => {
    const files = ["DELIVERABLE", "DELIVERABLE", "DELIVERABLE", "DELIVERABLE", "DELIVERABLE"].map((role, index) => ({
      ...item,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
      documentId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`,
      versionId: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`,
      role: role as "DELIVERABLE",
    }))
    render(<PreparedPackPanel caseId={caseId} guided packs={{
      caseId,
      packs: [pack({ status: "DRAFT", approvedAt: null, published: false, items: files })],
      eligible: [],
    }} />)
    expect(screen.getByRole("button", { name: "Approve prepared pack" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("5 completed statements; exactly 1 required")
    expect(screen.getByRole("alert")).toHaveTextContent("0 customer submission instructions; exactly 1 required")
    expect(screen.queryByRole("button", { name: "Review and approve pack" })).toBeNull()
    expect(screen.queryByText("That action is not allowed for this pack.")).toBeNull()
  })

  it("explains a missing instructions document and allows a valid 1, 1 and 3 draft to be reviewed", () => {
    const missing = [
      { ...item, role: "DELIVERABLE" as const },
      { ...second, id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", role: "EVIDENCE" as const },
      { ...second, id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2", versionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2", documentId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2", role: "EVIDENCE" as const },
      { ...second, id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3", versionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3", documentId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3", role: "EVIDENCE" as const },
    ]
    render(<PreparedPackPanel caseId={caseId} guided packs={{
      caseId,
      packs: [pack({ status: "DRAFT", approvedAt: null, published: false, items: missing })],
      eligible: [],
    }} />)
    expect(screen.getByRole("button", { name: "Approve prepared pack" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("0 customer submission instructions; exactly 1 required")
    expect(screen.getByRole("alert")).not.toHaveTextContent("completed statements")
    cleanup()
    const ready = [
      missing[0],
      { ...second, role: "INSTRUCTIONS" as const },
      missing[1],
      missing[2],
      missing[3],
    ]
    render(<PreparedPackPanel caseId={caseId} guided packs={{
      caseId,
      packs: [pack({ status: "DRAFT", approvedAt: null, published: false, items: ready })],
      eligible: [],
    }} />)
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Review and approve pack" }))
    expect(screen.getByText("Role counts match. The server still checks these files before approval.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Approve prepared pack" })).toBeEnabled()
  })

  it("lets staff unpublish a published history pack without touching the newer draft", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The pack is no longer published." }) })
    const older = pack({
      id: "88888888-8888-4888-8888-888888888888",
      packNumber: 1,
      status: "APPROVED",
      published: true,
      recordVersion: 9,
    })
    const draft = pack({
      id: "77777777-7777-4777-8777-777777777771",
      packNumber: 2,
      status: "DRAFT",
      approvedAt: null,
      published: false,
      items: [item],
    })
    render(<PreparedPackPanel caseId={caseId} guided packs={{ caseId, packs: [older, draft], eligible: [] }} />)
    const history = screen.getByText("Previous packs / History").closest("details") as HTMLDetailsElement
    history.open = true
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/Creating a draft does not remove customer access/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Unpublish pack" }))
    expect(fetchMock).not.toHaveBeenCalled()
    const reason = "Withdraw this published pack from customer access."
    fireEvent.change(screen.getByRole("textbox", { name: /Reason for unpublishing/ }), { target: { value: reason } })
    fireEvent.click(screen.getByRole("checkbox", { name: "I confirm this pack should no longer be published." }))
    fireEvent.submit(screen.getByRole("button", { name: "Unpublish pack" }).closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "unpublish",
      caseId,
      packId: older.id,
      recordVersion: 9,
      reason,
      confirmed: true,
    })
    const previous = screen.getByRole("article", { name: "Pack 1" })
    expect(within(previous).queryByRole("button", { name: "Review and publish pack" })).toBeNull()
    expect(within(previous).queryByRole("button", { name: "Change role" })).toBeNull()
    expect(within(previous).queryByRole("button", { name: "Remove" })).toBeNull()
  })

  it("adds a Managed file without a Guided role", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "The file has been added to the draft pack." }) })
    const draft = pack({ status: "DRAFT", approvedAt: null, published: false, items: [item] })
    render(<PreparedPackPanel caseId={caseId} packs={{
      caseId,
      packs: [draft],
      eligible: [{
        documentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        versionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        versionNumber: 1,
        documentTitle: "Ownership letter",
        originalFilename: "ownership.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048,
      }],
    }} />)
    expect(screen.queryByRole("combobox", { name: "Role in the Guided pack" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Change role" })).toBeNull()
    expect(screen.queryByText(/exactly one completed statement/)).toBeNull()
    fireEvent.submit(screen.getByRole("button", { name: "Add to pack" }).closest("form")!)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      operation: "add_item",
      caseId,
      packId: draft.id,
      recordVersion: draft.recordVersion,
      versionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    })
  })

  it("shows a newer stale pack as the pack to replace and keeps the older approval unpublished", () => {
    const approved = pack({
      id: "88888888-8888-4888-8888-888888888888",
      packNumber: 1,
      status: "APPROVED",
      published: false,
    })
    const stale = pack({
      id: "77777777-7777-4777-8777-777777777771",
      packNumber: 2,
      status: "STALE",
      items: [item],
    })
    render(<PreparedPackPanel caseId={caseId} packs={{ caseId, packs: [approved, stale], eligible: [] }} />)
    expect(screen.getByRole("article", { name: "Current pack 2" })).toHaveTextContent("Stale — do not publish this pack")
    expect(screen.getByRole("button", { name: "Create new draft pack" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Review and publish pack", hidden: true })).toBeNull()
    expect(screen.queryByRole("button", { name: "Unpublish pack", hidden: true })).toBeNull()
    const history = screen.getByText("Previous packs / History").closest("details") as HTMLDetailsElement
    history.open = true
    expect(screen.getByRole("article", { name: "Pack 1" })).toHaveTextContent("This is not the pack to publish.")
    expect(screen.queryByRole("button", { name: "Review and publish pack", hidden: true })).toBeNull()
  })
})
