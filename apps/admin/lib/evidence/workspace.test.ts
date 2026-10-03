import { describe, expect, it } from "vitest"
import { destination } from "../case-flow/destinations"
import { evidenceContactState, evidenceVersionState, type EvidenceVersionState } from "../case-flow/evidence"
import type { CaseFlowCommunicationFact, CaseFlowEvidenceFact, CaseNextAction } from "../case-flow/model"
import { evidenceActions, type EvidenceCase, type EvidenceDocument, type EvidenceRequest, type EvidenceVersionRow } from "./model"
import {
  buildEvidenceWorkspaceModel,
  compareEvidenceProjections,
  evidenceContactStateLabel,
  evidenceSummaryLines,
  evidenceVersionPipeline,
  evidenceVersionStateLabel,
} from "./workspace"

const NOW = "2026-10-03T12:00:00.000Z"
const CASE_ID = "55555555-5555-4555-8555-555555555555"

function version(id: string, overrides: Partial<EvidenceVersionRow> = {}): EvidenceVersionRow {
  return {
    id,
    versionNumber: 1,
    originalFilename: `${id.slice(0, 8)}.pdf`,
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
    recordVersion: 1,
    ...overrides,
  }
}

function request(id: string, overrides: Partial<EvidenceRequest> = {}): EvidenceRequest {
  return {
    id,
    title: `Request ${id.slice(0, 4)}`,
    requestText: "Please upload the file we asked for.",
    status: "OPEN",
    dueAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    fulfilledAt: null,
    version: 1,
    ...overrides,
  }
}

function document(id: string, versions: EvidenceVersionRow[], evidenceRequestId: string | null, title = "Document"): EvidenceDocument {
  return {
    id,
    title,
    evidenceRequestId,
    createdAt: "2026-09-18T10:00:00.000Z",
    updatedAt: "2026-09-18T10:00:00.000Z",
    version: 1,
    versions,
  }
}

function evidenceCase(requests: EvidenceRequest[], documents: EvidenceDocument[]): EvidenceCase {
  return { caseId: CASE_ID, reference: "PR-1", requests, documents }
}

function factsFrom(evidence: EvidenceCase, versions: CaseFlowEvidenceFact["versions"] = evidence.documents.flatMap(item => item.versions.map(row => ({
  documentId: item.id,
  versionId: row.id,
  evidenceRequestId: item.evidenceRequestId,
  uploadStatus: row.uploadStatus,
  scanStatus: row.scanStatus,
  validationStatus: row.validationStatus,
  reviewStatus: row.reviewStatus,
})))): CaseFlowEvidenceFact {
  return {
    requests: evidence.requests.map(item => ({ id: item.id, status: item.status, dueAt: item.dueAt, createdAt: item.createdAt })),
    versions,
  }
}

function modelFor(
  evidence: EvidenceCase,
  communications: CaseFlowCommunicationFact[] = [],
  primaryAction: CaseNextAction | null = null,
  evidenceFacts = factsFrom(evidence),
  hasPack = false,
) {
  return buildEvidenceWorkspaceModel({
    evidence,
    evidenceFacts,
    communications,
    primaryAction,
    now: NOW,
    hasPack,
  })
}

const versionColumns: Record<EvidenceVersionState, Partial<EvidenceVersionRow>> = {
  UPLOAD_PENDING: { uploadStatus: "PENDING_UPLOAD", scanStatus: "PENDING", validationStatus: "PENDING", uploadedAt: null, validatedAt: null },
  UPLOAD_FAILED: { uploadStatus: "FAILED", scanStatus: "PENDING", validationStatus: "PENDING", uploadedAt: null, validatedAt: null },
  SCAN_PENDING: { scanStatus: "PENDING", validationStatus: "PENDING", validatedAt: null },
  THREAT_BLOCKED: { scanStatus: "THREATS_FOUND", validationStatus: "PENDING", validatedAt: null },
  SCAN_UNAVAILABLE: { scanStatus: "FAILED", validationStatus: "PENDING", validatedAt: null },
  CONTENT_INVALID: { validationStatus: "INVALID", validationError: "The PDF has no pages." },
  CHECK_NEEDED: { scanStatus: "NO_THREATS_FOUND", validationStatus: "PENDING", validatedAt: null },
  AWAITING_REVIEW: { reviewStatus: "UNREVIEWED" },
  ACCEPTED: { reviewStatus: "ACCEPTED", reviewNote: "Matches the account.", reviewedAt: "2026-09-19T10:00:00.000Z", customerVisible: true },
  REJECTED: { reviewStatus: "REJECTED", reviewNote: "Wrong business." },
  SUPERSEDED: { reviewStatus: "SUPERSEDED" },
}

describe("evidence workspace model", () => {
  it.each(Object.keys(versionColumns) as EvidenceVersionState[])("labels %s from the canonical version state and evidenceActions", (state) => {
    const row = version("22222222-2222-4222-8222-222222222222", versionColumns[state])
    const evidence = evidenceCase([], [document("33333333-3333-4333-8333-333333333333", [row], null)])
    const built = modelFor(evidence)
    const presented = built.unlinkedDocuments[0].latest
    const fact = factsFrom(evidence).versions[0]
    expect(presented.state).toBe(state)
    expect(presented.state).toBe(evidenceVersionState(fact))
    expect(presented.label).toBe(evidenceVersionStateLabel(state))
    expect(presented.actions).toEqual(evidenceActions(row))
    expect(presented.anchorId).toBe(`evidence-version-${row.id}`)
  })

  it("keeps threat, pending scan, invalid content and review actions apart", () => {
    const threat = evidenceActions({ uploadStatus: "UPLOADED", scanStatus: "THREATS_FOUND", validationStatus: "VALID", reviewStatus: "UNREVIEWED", contentType: "application/pdf" })
    expect(threat).toMatchObject({ view: false, download: false, accept: false, reject: false, threatBlocked: true })
    const pending = evidenceActions({ uploadStatus: "UPLOADED", scanStatus: "PENDING", validationStatus: "PENDING", reviewStatus: "UNREVIEWED", contentType: "application/pdf" })
    expect(pending.refresh).toBe(true)
    expect(pending.view).toBe(false)
    const invalid = evidenceActions({ uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "INVALID", reviewStatus: "UNREVIEWED", contentType: "application/pdf" })
    expect(invalid).toMatchObject({ refresh: true, view: false, download: false, accept: false, validationFailed: true, threatBlocked: false })
    const review = evidenceActions({ uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "UNREVIEWED", contentType: "application/pdf" })
    expect(review).toMatchObject({ refresh: false, view: true, download: true, accept: true, reject: true })
    const docx = evidenceActions({ uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "UNREVIEWED", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
    expect(docx.view).toBe(false)
    expect(docx.download).toBe(true)
    expect(docx.viewHint).toMatch(/Preview not available/)
  })

  it("presents the four stored columns without turning them into actions", () => {
    const steps = evidenceVersionPipeline({ uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "VALID", reviewStatus: "UNREVIEWED" })
    expect(steps.map(step => [step.stage, step.detail])).toEqual([
      ["Upload", "Complete"],
      ["Security scan", "No threats found"],
      ["File validation", "Valid"],
      ["Admin review", "Needs review"],
    ])
    expect(evidenceVersionPipeline({ uploadStatus: "UPLOADED", scanStatus: "THREATS_FOUND", validationStatus: "PENDING", reviewStatus: "UNREVIEWED" })[1]).toMatchObject({ detail: "Threat detected", tone: "problem" })
    expect(evidenceVersionPipeline({ uploadStatus: "UPLOADED", scanStatus: "NO_THREATS_FOUND", validationStatus: "INVALID", reviewStatus: "UNREVIEWED" })[2]).toMatchObject({ detail: "Failed" })
  })

  it("has no requests", () => {
    const built = modelFor(evidenceCase([], []))
    expect(built.empty).toBe(true)
    expect(built.openRequests).toEqual([])
    expect(built.summaryLines).toEqual([])
    expect(built.showContact).toBe(false)
    expect(built.parityMismatches).toEqual([])
  })

  it("shows an open request with nothing received", () => {
    const open = request("11111111-1111-4111-8111-111111111111", { title: "Proof of ownership", dueAt: "2026-10-01T00:00:00.000Z" })
    const built = modelFor(evidenceCase([open], []))
    expect(built.openRequests).toHaveLength(1)
    expect(built.openRequests[0].view?.state).toBe("OPEN_NOT_STARTED")
    expect(built.openRequests[0].label).toBe("Waiting for evidence")
    expect(built.openRequests[0].headline).toBe("No evidence received against this request yet.")
    expect(built.openRequests[0].overdue).toBe(true)
    expect(built.openRequests[0].needsAttention).toBe(false)
  })

  it.each([
    ["upload pending", "UPLOAD_PENDING", "OPEN_IN_PROGRESS"],
    ["scan pending", "SCAN_PENDING", "OPEN_IN_PROGRESS"],
    ["scan unavailable", "SCAN_UNAVAILABLE", "OPEN_IN_PROGRESS"],
    ["validation invalid", "CONTENT_INVALID", "OPEN_IN_PROGRESS"],
    ["awaiting review", "AWAITING_REVIEW", "OPEN_IN_PROGRESS"],
  ] as const)("keeps an open request in progress while evidence is %s", (_name, state, requestState) => {
    const requestId = "11111111-1111-4111-8111-111111111111"
    const row = version("22222222-2222-4222-8222-222222222222", versionColumns[state])
    const built = modelFor(evidenceCase(
      [request(requestId)],
      [document("33333333-3333-4333-8333-333333333333", [row], requestId)],
    ))
    expect(built.openRequests[0].view?.state).toBe(requestState)
    expect(built.openRequests[0].documents[0].latest.state).toBe(state)
    expect(built.openRequests[0].headline).toBe(`${evidenceVersionStateLabel(state)}.`)
    expect(built.unlinkedDocuments).toEqual([])
  })

  it("keeps accepted evidence on an open request and does not fulfil it", () => {
    const requestId = "11111111-1111-4111-8111-111111111111"
    const open = request(requestId, { title: "Proof of ownership", status: "OPEN" })
    const row = version("22222222-2222-4222-8222-222222222222", versionColumns.ACCEPTED)
    const built = modelFor(evidenceCase([open], [document("33333333-3333-4333-8333-333333333333", [row], requestId, "Bank letter")]))
    expect(built.openRequests[0].request.status).toBe("OPEN")
    expect(built.openRequests[0].view?.state).toBe("OPEN_SATISFIED")
    expect(built.openRequests[0].headline).toBe("Accepted evidence received — this request is still open.")
    expect(built.openRequests[0].needsAttention).toBe(true)
    expect(built.summary.satisfiedButOpen).toHaveLength(1)
    expect(built.summaryLines).toContain("1 request can now be marked fulfilled")
    expect(built.completedRequests).toEqual([])
  })

  it("keeps fulfilled and cancelled requests as history with their files", () => {
    const fulfilledId = "11111111-1111-4111-8111-111111111111"
    const cancelledId = "44444444-4444-4444-8444-444444444444"
    const built = modelFor(evidenceCase(
      [
        request(fulfilledId, { status: "FULFILLED", fulfilledAt: "2026-09-20T00:00:00.000Z" }),
        request(cancelledId, { status: "CANCELLED" }),
      ],
      [document("33333333-3333-4333-8333-333333333333", [version("22222222-2222-4222-8222-222222222222", versionColumns.ACCEPTED)], fulfilledId)],
    ))
    expect(built.openRequests).toEqual([])
    expect(built.completedRequests.map(item => item.view?.state)).toEqual(["FULFILLED", "CANCELLED"])
    expect(built.completedRequests[0].documents).toHaveLength(1)
    expect(built.completedRequests[0].documents[0].latest.state).toBe("ACCEPTED")
  })

  it("orders attention, other open requests, fulfilled, then cancelled, using a recorded due date inside a class", () => {
    const review = "11111111-1111-4111-8111-111111111111"
    const satisfied = "22222222-2222-4222-8222-222222222222"
    const waiting = "33333333-3333-4333-8333-333333333333"
    const scanning = "44444444-4444-4444-8444-444444444444"
    const fulfilled = "55555555-5555-4555-8555-555555555551"
    const cancelled = "66666666-6666-4666-8666-666666666666"
    const evidence = evidenceCase(
      [
        request(waiting, { dueAt: "2026-10-20T00:00:00.000Z" }),
        request(satisfied, { dueAt: "2026-11-01T00:00:00.000Z" }),
        request(fulfilled, { status: "FULFILLED" }),
        request(review, { dueAt: "2026-10-05T00:00:00.000Z" }),
        request(cancelled, { status: "CANCELLED" }),
        request(scanning, { dueAt: "2026-10-02T00:00:00.000Z" }),
      ],
      [
        document("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", [version("aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa", versionColumns.AWAITING_REVIEW)], review),
        document("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", [version("bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb", versionColumns.ACCEPTED)], satisfied),
        document("cccccccc-cccc-4ccc-8ccc-cccccccccccc", [version("ccccccc1-cccc-4ccc-8ccc-cccccccccccc", versionColumns.SCAN_PENDING)], scanning),
      ],
    )
    const built = modelFor(evidence)
    expect(built.requests.map(item => item.request.id)).toEqual([review, satisfied, scanning, waiting, fulfilled, cancelled])
  })

  it("leaves a standalone file unlinked even when its title matches an open request", () => {
    const requestId = "11111111-1111-4111-8111-111111111111"
    const evidence = evidenceCase(
      [request(requestId, { title: "Proof of ownership" })],
      [
        document("33333333-3333-4333-8333-333333333333", [version("22222222-2222-4222-8222-222222222222")], requestId, "Proof of ownership"),
        document("44444444-4444-4444-8444-444444444444", [version("55555555-5555-4555-8555-555555555551")], null, "Proof of ownership"),
      ],
    )
    const built = modelFor(evidence)
    expect(built.openRequests[0].documents.map(item => item.document.id)).toEqual(["33333333-3333-4333-8333-333333333333"])
    expect(built.unlinkedDocuments.map(item => item.document.id)).toEqual(["44444444-4444-4444-8444-444444444444"])
    expect(built.unlinkedDocuments[0].requestTitle).toBeNull()
  })

  it("keeps two concurrent requests separate", () => {
    const first = "11111111-1111-4111-8111-111111111111"
    const second = "22222222-2222-4222-8222-222222222222"
    const evidence = evidenceCase(
      [request(first, { title: "Proof of ownership" }), request(second, { title: "Utility bill" })],
      [
        document("33333333-3333-4333-8333-333333333333", [version("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", versionColumns.AWAITING_REVIEW)], first),
        document("44444444-4444-4444-8444-444444444444", [version("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", versionColumns.SCAN_PENDING)], second),
      ],
    )
    const built = modelFor(evidence)
    expect(built.openRequests.map(item => [item.request.title, item.documents[0].latest.state])).toEqual([
      ["Proof of ownership", "AWAITING_REVIEW"],
      ["Utility bill", "SCAN_PENDING"],
    ])
  })

  it("shows the latest version first and keeps every older version", () => {
    const requestId = "11111111-1111-4111-8111-111111111111"
    const older = version("22222222-2222-4222-8222-222222222221", { ...versionColumns.REJECTED, versionNumber: 1, originalFilename: "old.pdf" })
    const newer = version("22222222-2222-4222-8222-222222222222", { ...versionColumns.AWAITING_REVIEW, versionNumber: 2, originalFilename: "new.pdf" })
    const built = modelFor(evidenceCase(
      [request(requestId)],
      [document("33333333-3333-4333-8333-333333333333", [older, newer], requestId)],
    ))
    const presented = built.openRequests[0].documents[0]
    expect(presented.latest.version.id).toBe(newer.id)
    expect(presented.history.map(item => item.version.id)).toEqual([older.id])
    expect(presented.history[0].state).toBe("REJECTED")
    const anchors = [presented.latest, ...presented.history].map(item => item.anchorId)
    expect(new Set(anchors).size).toBe(anchors.length)
  })

  it("fails visibly when the evidence case and the case-flow facts disagree", () => {
    const requestId = "11111111-1111-4111-8111-111111111111"
    const otherId = "22222222-2222-4222-8222-222222222222"
    const versionId = "33333333-3333-4333-8333-333333333333"
    const evidence = evidenceCase(
      [request(requestId), request(otherId)],
      [document("44444444-4444-4444-8444-444444444444", [version(versionId)], requestId)],
    )
    const drifted = factsFrom(evidence)
    drifted.versions[0] = { ...drifted.versions[0], evidenceRequestId: otherId }
    const mismatches = compareEvidenceProjections(evidence, drifted)
    expect(mismatches.join(" ")).toMatch(new RegExp(versionId))
    const built = modelFor(evidence, [], null, drifted)
    expect(built.parityMismatches.length).toBeGreaterThan(0)
    expect(built.requests.find(item => item.request.id === requestId)?.documents).toHaveLength(1)
    expect(built.requests.find(item => item.request.id === otherId)?.documents).toEqual([])
  })

  it("accepts matching request ids, version ids and associations without requiring the same order", () => {
    const first = "11111111-1111-4111-8111-111111111111"
    const second = "22222222-2222-4222-8222-222222222222"
    const evidence = evidenceCase(
      [request(first), request(second)],
      [document("33333333-3333-4333-8333-333333333333", [version("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")], first)],
    )
    const reversed = factsFrom(evidence)
    reversed.requests.reverse()
    expect(compareEvidenceProjections(evidence, reversed)).toEqual([])
  })

  it.each([
    ["no message", [], "NOT_PREPARED", "No evidence-request email prepared"],
    ["draft", [{ lifecycle: "DRAFT", deliveryStatus: null }], "DRAFTED", "Evidence-request email drafted"],
    ["reviewed", [{ lifecycle: "REVIEWED", deliveryStatus: null }], "REVIEWED", "Evidence-request email reviewed"],
    ["queued", [{ lifecycle: "QUEUED", deliveryStatus: null }], "QUEUED", "Waiting for email provider"],
    ["acceptance unknown", [{ lifecycle: "QUEUED", deliveryStatus: "ACCEPTANCE_UNKNOWN" }], "ACCEPTANCE_UNKNOWN", "Provider acceptance needs reconciliation"],
    ["provider accepted", [{ lifecycle: "QUEUED", deliveryStatus: "PROVIDER_ACCEPTED" }], "PROVIDER_ACCEPTED", "Accepted by email provider — delivery not confirmed"],
    ["delivered", [{ lifecycle: "QUEUED", deliveryStatus: "DELIVERED" }], "DELIVERED", "Delivered"],
    ["failed", [{ lifecycle: "QUEUED", deliveryStatus: "FAILED" }], "FAILED", "Delivery failed"],
    ["cancelled", [{ lifecycle: "CANCELLED", deliveryStatus: null }], "CANCELLED", "Cancelled"],
  ] as const)("reads contact %s at case level", (_name, rows, state, label) => {
    const communications = rows.map((row, index) => ({
      id: `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index}`,
      templateKey: "EVIDENCE_REQUEST",
      lifecycle: row.lifecycle,
      deliveryStatus: row.deliveryStatus,
      legacyStatus: null,
      draftedAt: "2026-09-02T00:00:00.000Z",
    }))
    expect(evidenceContactState(communications)).toBe(state)
    expect(evidenceContactStateLabel(state)).toBe(label)
    if (state === "PROVIDER_ACCEPTED") expect(label).not.toMatch(/Delivered/)
    const evidence = evidenceCase([
      request("11111111-1111-4111-8111-111111111111", { title: "Proof of ownership" }),
      request("22222222-2222-4222-8222-222222222222", { title: "Utility bill" }),
    ], [])
    const built = modelFor(evidence, communications)
    expect(built.contactState).toBe(state)
    expect(built.contactLabel).toBe(label)
    expect(built.showContact).toBe(true)
    expect(JSON.stringify(built.requests)).not.toContain("EVIDENCE_REQUEST")
  })

  it("does not attribute one evidence-request email to either of two open requests", () => {
    const communications = [{
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      templateKey: "EVIDENCE_REQUEST",
      lifecycle: "QUEUED",
      deliveryStatus: "PROVIDER_ACCEPTED",
      legacyStatus: null,
      draftedAt: "2026-09-02T00:00:00.000Z",
    }]
    const built = modelFor(evidenceCase([
      request("11111111-1111-4111-8111-111111111111", { title: "Proof of ownership" }),
      request("22222222-2222-4222-8222-222222222222", { title: "Utility bill" }),
    ], []), communications)
    expect(built.contactLabel).not.toMatch(/Delivered|Proof of ownership|Utility bill/)
    expect(built.openRequests).toHaveLength(2)
  })

  it("omits zero counts and does not invent a case action", () => {
    expect(evidenceSummaryLines({
      requests: [], contact: "NOT_PREPARED", versionStates: [], anyRequest: false, anyUpload: false,
      openRequests: [], earliestOpenDueAt: null, uploadInProgress: 0, uploadFailed: 0, threatBlocked: 0,
      contentInvalid: 0, needsScanCheck: 0, scanInProgress: 0, awaitingReview: 0, accepted: 0, rejected: 0,
      satisfiedButOpen: [], complete: false,
    })).toEqual([])
    const commercial = destination("COMMERCIAL")
    const elsewhere = modelFor(evidenceCase([], []), [], {
      id: "CONFIRM_COMMERCIAL_STATE",
      label: "Check the commercial position for this case",
      description: "The quote still needs a look.",
      owner: "ADMIN",
      state: "ACTION_REQUIRED",
      priorityBand: "ADMIN_ACTION",
      dueAt: null,
      overdue: false,
      destination: commercial,
      reasonCodes: [],
    })
    expect(elsewhere.caseAction).toMatchObject({ kind: "elsewhere", href: "/commercial", destinationLabel: "Commercial" })
    const onEvidence = modelFor(evidenceCase([], []), [], {
      id: "REVIEW_EVIDENCE",
      label: "Review the uploaded evidence",
      description: "A file is ready for review.",
      owner: "ADMIN",
      state: "ACTION_REQUIRED",
      priorityBand: "ADMIN_ACTION",
      dueAt: null,
      overdue: false,
      destination: { kind: "CASE_EVIDENCE", href: `/cases/${CASE_ID}/evidence`, label: "Evidence and documents" },
      reasonCodes: [],
    })
    expect(onEvidence.caseAction).toEqual({ kind: "evidence", label: "Review the uploaded evidence", description: "A file is ready for review." })
  })

  it("treats a pack as enough to leave the empty starting state", () => {
    expect(modelFor(evidenceCase([], []), [], null, factsFrom(evidenceCase([], [])), true).empty).toBe(false)
  })
})
