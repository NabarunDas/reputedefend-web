// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowCommunicationFact, CaseNextAction } from "@/lib/case-flow/model"
import type { EvidenceCase, EvidenceDocument, EvidenceRequest, EvidenceVersionRow } from "@/lib/evidence/model"
import { buildEvidenceWorkspaceModel } from "@/lib/evidence/workspace"
import { PACK_STALE_WARNING, type PreparedPack, type PreparedPackCase } from "@/lib/packs/model"
import { EvidenceWorkspace } from "./workspace-view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

const NOW = "2026-10-03T12:00:00.000Z"
const caseId = "55555555-5555-4555-8555-555555555555"
const caseDetail = { id: caseId, reference: "PR-1", client: "Alex", business: "Bakery" } as CaseDetail

function version(id: string, overrides: Partial<EvidenceVersionRow> = {}): EvidenceVersionRow {
  return {
    id, versionNumber: 1, originalFilename: "invoice.pdf", contentType: "application/pdf", sizeBytes: 2048,
    uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", validationError: null,
    reviewStatus: "UNREVIEWED", reviewNote: null, customerVisible: false,
    createdAt: "2026-09-18T10:00:00.000Z", uploadedAt: "2026-09-18T10:00:00.000Z", validatedAt: "2026-09-18T10:05:00.000Z",
    reviewedAt: null, recordVersion: 1, ...overrides,
  }
}

function request(id: string, overrides: Partial<EvidenceRequest> = {}): EvidenceRequest {
  return {
    id, title: "Proof of ownership", requestText: "Upload the document that shows ownership.", status: "OPEN",
    dueAt: null, createdAt: "2026-09-01T00:00:00.000Z", fulfilledAt: null, version: 1, ...overrides,
  }
}

function doc(id: string, versions: EvidenceVersionRow[], evidenceRequestId: string | null, title = "Bank letter"): EvidenceDocument {
  return { id, title, evidenceRequestId, createdAt: "2026-09-18T10:00:00.000Z", updatedAt: "2026-09-18T10:00:00.000Z", version: 1, versions }
}

function evidence(requests: EvidenceRequest[], documents: EvidenceDocument[]): EvidenceCase {
  return { caseId, reference: "PR-1", requests, documents }
}

function message(overrides: Partial<CaseFlowCommunicationFact>): CaseFlowCommunicationFact {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", templateKey: "EVIDENCE_REQUEST", lifecycle: "QUEUED",
    deliveryStatus: null, legacyStatus: null, draftedAt: "2026-09-02T00:00:00.000Z", ...overrides,
  }
}

const noPacks: PreparedPackCase = { caseId, packs: [], eligible: [] }

function show(item: EvidenceCase, communications: CaseFlowCommunicationFact[] = [], packs: PreparedPackCase = noPacks, primaryAction: CaseNextAction | null = null) {
  const model = buildEvidenceWorkspaceModel({
    evidence: item,
    evidenceFacts: {
      requests: item.requests.map(row => ({ id: row.id, status: row.status, dueAt: row.dueAt, createdAt: row.createdAt })),
      versions: item.documents.flatMap(row => row.versions.map(file => ({
        documentId: row.id, versionId: file.id, evidenceRequestId: row.evidenceRequestId,
        uploadStatus: file.uploadStatus, scanStatus: file.scanStatus, validationStatus: file.validationStatus, reviewStatus: file.reviewStatus,
      }))),
    },
    communications,
    primaryAction,
    now: NOW,
    hasPack: packs.packs.length > 0 || packs.eligible.length > 0,
  })
  return render(<EvidenceWorkspace caseDetail={caseDetail} evidence={item} packs={packs} model={model} />)
}

afterEach(() => cleanup())

const requestId = "11111111-1111-4111-8111-111111111111"
const secondRequest = "22222222-2222-4222-8222-222222222222"
const documentId = "33333333-3333-4333-8333-333333333333"
const versionId = "77777777-7777-4777-8777-777777777777"

describe("evidence workspace presentation", () => {
  it("starts an empty case in one place", () => {
    show(evidence([], []))
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { name: "Evidence" })).toBeTruthy()
    expect(screen.getByText("No evidence has been requested or uploaded for this case.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Create request" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Add evidence" })).toBeTruthy()
    expect(screen.getAllByText(/does not contact the customer/).length).toBeGreaterThan(0)
    expect(screen.getByText(/does not send an email/)).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Open evidence requests" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Prepared submission pack" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Customer contact" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Request sent/)
  })

  it("shows an open request with nothing received and no invented wait", () => {
    show(evidence([request(requestId, { dueAt: "2026-10-01T00:00:00.000Z" })], []))
    expect(screen.getByRole("heading", { name: "Proof of ownership" })).toBeTruthy()
    expect(screen.getByText("Waiting for evidence.")).toBeTruthy()
    expect(screen.getByText("No evidence received against this request yet.")).toBeTruthy()
    expect(screen.getByText(/Overdue/)).toBeTruthy()
    expect(screen.getByText(/no evidence-request email has been prepared/)).toBeTruthy()
    expect(screen.getByText(/not per evidence request/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/customer is waiting|response due|within \d+ days/i)
    expect(screen.getByLabelText("Which evidence request does this file answer?")).toBeTruthy()
    expect(screen.getByRole("option", { name: "Not linked to a request" })).toBeTruthy()
  })

  it("shows a customer upload that is still being scanned", () => {
    show(evidence(
      [request(requestId)],
      [doc(documentId, [version(versionId, { scanStatus: "PENDING", validationStatus: "PENDING", validatedAt: null, submissionSource: "CUSTOMER", originalFilename: "bill.pdf" })], requestId, "Utility bill")],
    ))
    expect(screen.getByText("Customer submitted. This file still goes through the security scan, file validation and Admin review.")).toBeTruthy()
    expect(screen.getAllByText("Waiting for malware scan.").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Refresh scan status for Utility bill, version 1" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "View Utility bill, version 1" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Download Utility bill, version 1" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
  })

  it("surfaces refresh when the scan needs checking", () => {
    show(evidence(
      [request(requestId)],
      [doc(documentId, [version(versionId, { scanStatus: "UNSUPPORTED", validationStatus: "PENDING", validatedAt: null })], requestId)],
    ))
    expect(screen.getAllByText("Security scan needs refreshing.").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /Refresh scan status/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
  })

  it("announces a threat and does not offer view, download or accept", () => {
    show(evidence(
      [request(requestId)],
      [doc(documentId, [version(versionId, { scanStatus: "THREATS_FOUND", validationStatus: "PENDING", validatedAt: null, originalFilename: "risky.pdf" })], requestId)],
    ))
    expect(screen.getAllByText("Threat detected — file blocked.").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /View/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull()
    expect(document.getElementById(`evidence-version-${versionId}`)).toBeTruthy()
  })

  it("shows a validation failure separately from malware", () => {
    show(evidence(
      [request(requestId)],
      [doc(documentId, [version(versionId, { validationStatus: "INVALID", validationError: "The PDF has no pages." })], requestId)],
    ))
    expect(screen.getAllByText("File validation failed.").length).toBeGreaterThan(0)
    expect(screen.getByText(/File validation failed\. This is not a malware result\. The PDF has no pages\./)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull()
  })

  it("leads an unreviewed clean file with the review actions", () => {
    show(evidence(
      [request(requestId)],
      [doc(documentId, [version(versionId)], requestId)],
    ))
    expect(screen.getAllByText("Ready for Admin review.").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "View Bank letter, version 1" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Download Bank letter, version 1" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Accept Bank letter, version 1" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Reject Bank letter, version 1" })).toBeTruthy()
    expect(screen.getByText("1 file needs Admin review")).toBeTruthy()
    expect(screen.getByText(/Processing stages/)).toBeTruthy()
  })

  it("keeps an accepted file on an open request and offers Mark fulfilled", () => {
    show(evidence(
      [request(requestId)],
      [doc(documentId, [version(versionId, { reviewStatus: "ACCEPTED", reviewNote: "Matches the account.", reviewedAt: "2026-09-19T10:00:00.000Z", customerVisible: true })], requestId)],
    ))
    expect(screen.getByText("Accepted evidence received — this request is still open.")).toBeTruthy()
    expect(screen.getByText("Accepted.")).toBeTruthy()
    expect(screen.getByText("Review note: Matches the account.")).toBeTruthy()
    expect(screen.getByText(/Marked for future customer visibility/)).toBeTruthy()
    expect(screen.getAllByText(/No current customer portal exposes this file/).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Mark fulfilled Proof of ownership" })).toBeTruthy()
    expect(screen.getByText("1 request can now be marked fulfilled")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/automatically fulfil|Request fulfilled/)
  })

  it("keeps a fulfilled request quieter and still shows its file", () => {
    show(evidence(
      [request(requestId, { status: "FULFILLED", fulfilledAt: "2026-09-20T00:00:00.000Z" })],
      [doc(documentId, [version(versionId, { reviewStatus: "ACCEPTED" })], requestId)],
    ))
    expect(screen.getByRole("heading", { name: "Completed requests" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Open evidence requests" })).toBeNull()
    expect(screen.getByText("Bank letter")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Mark fulfilled/ })).toBeNull()
  })

  it("keeps a rejected version in history once a replacement exists", () => {
    const older = version("77777777-7777-4777-8777-777777777771", { versionNumber: 1, reviewStatus: "REJECTED", reviewNote: "Wrong business.", originalFilename: "old.pdf" })
    const newer = version(versionId, { versionNumber: 2, originalFilename: "new.pdf" })
    show(evidence([request(requestId)], [doc(documentId, [older, newer], requestId)]))
    expect(screen.getByText(/new\.pdf/)).toBeTruthy()
    expect(screen.getByText("Version history (1)")).toBeTruthy()
    expect(screen.getByText("Review note: Wrong business.")).toBeTruthy()
    expect(document.getElementById("evidence-version-77777777-7777-4777-8777-777777777771")).toBeTruthy()
    expect(document.getElementById(`evidence-version-${versionId}`)).toBeTruthy()
  })

  it("shows several versions without giving them equal weight", () => {
    const files = [1, 2, 3].map(number => version(`77777777-7777-4777-8777-77777777777${number}`, {
      versionNumber: number, reviewStatus: number === 3 ? "UNREVIEWED" : "SUPERSEDED", originalFilename: `file-${number}.pdf`,
    }))
    show(evidence([request(requestId)], [doc(documentId, files, requestId)]))
    const latest = document.getElementById("evidence-version-77777777-7777-4777-8777-777777777773")
    expect(latest?.textContent).toMatch(/Ready for Admin review/)
    expect(latest?.closest("details")).toBeNull()
    expect(screen.getByText("Version history (2)")).toBeTruthy()
  })

  it("does not attribute one case email to either open request", () => {
    show(
      evidence([
        request(requestId, { title: "Proof of ownership" }),
        request(secondRequest, { title: "Utility bill" }),
      ], []),
      [message({ deliveryStatus: "PROVIDER_ACCEPTED" })],
    )
    const contact = screen.getByRole("region", { name: "Customer contact" })
    expect(contact.textContent).toMatch(/Accepted by email provider — delivery not confirmed/)
    expect(contact.textContent).not.toMatch(/Delivered/)
    expect(contact.textContent).toMatch(/not per evidence request/)
    expect(contact.textContent).not.toMatch(/Proof of ownership|Utility bill/)
    expect(screen.getByRole("link", { name: "View case communications" })).toHaveAttribute("href", `/communications?case=${caseId}`)
    for (const card of document.querySelectorAll(".evidence-request")) expect(card.textContent).not.toMatch(/Delivered|email provider/)
  })

  it("says delivered only for a delivered case-level email", () => {
    show(evidence([request(requestId)], []), [message({ deliveryStatus: "DELIVERED" })])
    const contact = screen.getByRole("region", { name: "Customer contact" })
    expect(contact.textContent).toMatch(/Latest evidence-request email for this case: Delivered/)
    expect(contact.textContent).toMatch(/not per evidence request/)
    expect(document.querySelector(".evidence-request")?.textContent).not.toMatch(/Delivered/)
  })

  it("warns when the case email failed and links to communications", () => {
    show(evidence([request(requestId)], []), [message({ deliveryStatus: "FAILED" })])
    const contact = screen.getByRole("region", { name: "Customer contact" })
    expect(contact.textContent).toMatch(/Delivery failed/)
    expect(screen.getByRole("link", { name: "View case communications" })).toHaveAttribute("href", `/communications?case=${caseId}`)
    expect(screen.queryByRole("button", { name: /resend|draft email/i })).toBeNull()
  })

  it("keeps unlinked evidence out of the open request", () => {
    show(evidence(
      [request(requestId)],
      [doc("44444444-4444-4444-8444-444444444444", [version("55555555-5555-4555-8555-555555555551", { originalFilename: "loose.pdf" })], null, "Loose file")],
    ))
    expect(screen.getByRole("heading", { name: "Evidence not linked to a request" })).toBeTruthy()
    expect(screen.getByText("Not linked to an evidence request.")).toBeTruthy()
    expect(document.querySelector(".evidence-request")?.textContent).not.toMatch(/Loose file/)
  })

  it("keeps a stale pack warning below evidence collection", () => {
    const stale: PreparedPack = {
      id: "99999999-9999-4999-8999-999999999999", packNumber: 1, status: "STALE",
      approvalNote: "Selected evidence only.", createdAt: "2026-09-18T10:00:00.000Z", approvedAt: "2026-09-18T11:00:00.000Z",
      recordVersion: 2, items: [],
    }
    show(evidence([request(requestId)], []), [], { caseId, packs: [stale], eligible: [] })
    expect(screen.getByText(PACK_STALE_WARNING)).toBeTruthy()
    expect(screen.getAllByText(/does not confirm payment, customer authority or permission to submit/).length).toBeGreaterThan(0)
    const summary = screen.getByRole("heading", { name: "Open evidence requests" })
    const pack = screen.getByRole("heading", { name: "Prepared submission pack" })
    expect(summary.compareDocumentPosition(pack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows an approved published pack as customer access, not a Google submission", () => {
    const item = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", documentId, versionId, position: 1, documentTitle: "Bank letter",
      originalFilename: "invoice.pdf", contentType: "application/pdf", sizeBytes: 1024, versionNumber: 1, customerVisible: true,
    }
    const approved: PreparedPack = {
      id: "99999999-9999-4999-8999-999999999999", packNumber: 2, status: "APPROVED",
      approvalNote: "Selected evidence only.", publicationNote: "Visible on the case-access link.",
      createdAt: "2026-09-18T10:00:00.000Z", approvedAt: "2026-09-18T11:00:00.000Z", recordVersion: 4,
      published: true, items: [item],
    }
    show(evidence([], []), [], { caseId, packs: [approved], eligible: [] })
    expect(screen.getByText("Published for customer case access")).toBeTruthy()
    expect(screen.getByText(/does not confirm payment, permission or submission to Google/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /submit to google/i })).toBeNull()
  })

  it("allows a safe DOCX download and withholds preview", () => {
    show(evidence([], [doc(documentId, [version(versionId, {
      originalFilename: "letter.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })], null, "Letter")]))
    expect(screen.getByRole("button", { name: "View Letter, version 1" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Download Letter, version 1" })).toBeEnabled()
    expect(screen.getByText("Preview not available for this file type")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Google Docs Viewer|Microsoft Office Viewer/)
  })

  it("shows the case next action only when it already points at evidence", () => {
    show(evidence([], []), [], noPacks, {
      id: "REVIEW_EVIDENCE",
      label: "Review the uploaded evidence",
      description: "A file is ready for review.",
      owner: "ADMIN",
      state: "ACTION_REQUIRED",
      priorityBand: "ADMIN_ACTION",
      dueAt: null,
      overdue: false,
      destination: { kind: "CASE_EVIDENCE", href: `/cases/${caseId}/evidence`, label: "Evidence and documents" },
      reasonCodes: [],
    })
    expect(screen.getByRole("heading", { name: "Case next action" })).toBeTruthy()
    expect(screen.getByText("Review the uploaded evidence")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Evidence and documents" })).toBeNull()
  })

  it("points elsewhere when the case next action is not evidence", () => {
    show(evidence([request(requestId)], []), [], noPacks, {
      id: "CONFIRM_COMMERCIAL_STATE",
      label: "Check the commercial position for this case",
      description: "The quote still needs a look.",
      owner: "ADMIN",
      state: "ACTION_REQUIRED",
      priorityBand: "ADMIN_ACTION",
      dueAt: null,
      overdue: false,
      destination: { kind: "COMMERCIAL", href: "/commercial", label: "Commercial" },
      reasonCodes: [],
    })
    expect(screen.queryByRole("heading", { name: "Case next action" })).toBeNull()
    expect(screen.getByText(/next action is outside Evidence/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Commercial" })).toHaveAttribute("href", "/commercial")
    expect(screen.getByText("Waiting for evidence.")).toBeTruthy()
  })
})
