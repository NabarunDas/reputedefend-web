/**
 * The Evidence workspace, as a pure reading of facts already loaded.
 *
 * Request state, version state and contact state come from the case-flow
 * helpers. What a file may do comes from `evidenceActions`. This module
 * only arranges those answers for the page: it does not decide them again,
 * and it does not read the database.
 */

import {
  evidenceContactState,
  evidenceVersionState,
  summariseEvidence,
  type EvidenceContactState,
  type EvidenceRequestState,
  type EvidenceRequestView,
  type EvidenceSummary,
  type EvidenceVersionState,
} from "../case-flow/evidence"
import type { CaseFlowCommunicationFact, CaseFlowEvidenceFact, CaseNextAction } from "../case-flow/model"
import {
  evidenceActions,
  type EvidenceActionState,
  type EvidenceCase,
  type EvidenceDocument,
  type EvidenceRequest,
  type EvidenceVersionRow,
} from "./model"

const requestLabels: Record<EvidenceRequestState, string> = {
  OPEN_NOT_STARTED: "Waiting for evidence",
  OPEN_IN_PROGRESS: "Evidence received — checks or review still in progress",
  OPEN_SATISFIED: "Accepted evidence received — request still open",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
}

const versionLabels: Record<EvidenceVersionState, string> = {
  UPLOAD_PENDING: "Upload incomplete",
  UPLOAD_FAILED: "Upload failed",
  SCAN_PENDING: "Waiting for malware scan",
  THREAT_BLOCKED: "Threat detected — file blocked",
  SCAN_UNAVAILABLE: "Security scan needs refreshing",
  CONTENT_INVALID: "File validation failed",
  CHECK_NEEDED: "Security scan needs checking",
  AWAITING_REVIEW: "Ready for Admin review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
}

const contactLabels: Record<EvidenceContactState, string> = {
  NOT_PREPARED: "No evidence-request email prepared",
  DRAFTED: "Evidence-request email drafted",
  REVIEWED: "Evidence-request email reviewed",
  QUEUED: "Waiting for email provider",
  ACCEPTANCE_UNKNOWN: "Provider acceptance needs reconciliation",
  PROVIDER_ACCEPTED: "Accepted by email provider — delivery not confirmed",
  DELIVERED: "Delivered",
  FAILED: "Delivery failed",
  CANCELLED: "Cancelled",
}

/** Presentation only. The state has already been decided. */
export function evidenceRequestStateLabel(state: EvidenceRequestState): string {
  return requestLabels[state]
}

/** Presentation only. The state has already been decided. */
export function evidenceVersionStateLabel(state: EvidenceVersionState): string {
  return versionLabels[state]
}

/** Presentation only. Provider acceptance is never labelled as delivery. */
export function evidenceContactStateLabel(state: EvidenceContactState): string {
  return contactLabels[state]
}

/** Stable in-page anchor for one version. The id is the version record, never a filename. */
export function evidenceVersionAnchor(versionId: string): string {
  return `evidence-version-${versionId}`
}

export function evidenceRequestAnchor(requestId: string): string {
  return `evidence-request-${requestId}`
}

export type EvidencePipelineStep = {
  stage: "Upload" | "Security scan" | "File validation" | "Admin review"
  detail: string
  tone: "done" | "waiting" | "problem"
}

/**
 * The four stored status columns, in the order an operator checks them.
 * This is not a workflow: it does not decide what the file may do.
 */
export function evidenceVersionPipeline(version: {
  uploadStatus: string
  scanStatus: string
  validationStatus: string
  reviewStatus: string
}): EvidencePipelineStep[] {
  const upload: EvidencePipelineStep = version.uploadStatus === "UPLOADED"
    ? { stage: "Upload", detail: "Complete", tone: "done" }
    : version.uploadStatus === "PENDING_UPLOAD"
      ? { stage: "Upload", detail: "Incomplete", tone: "waiting" }
      : { stage: "Upload", detail: "Failed", tone: "problem" }
  const scan: EvidencePipelineStep = version.scanStatus === "NO_THREATS_FOUND"
    ? { stage: "Security scan", detail: "No threats found", tone: "done" }
    : version.scanStatus === "PENDING"
      ? { stage: "Security scan", detail: "Waiting", tone: "waiting" }
      : version.scanStatus === "THREATS_FOUND"
        ? { stage: "Security scan", detail: "Threat detected", tone: "problem" }
        : version.scanStatus === "FAILED" || version.scanStatus === "UNSUPPORTED" || version.scanStatus === "ACCESS_DENIED"
          ? { stage: "Security scan", detail: "Needs refreshing", tone: "problem" }
          : { stage: "Security scan", detail: "Not complete", tone: "waiting" }
  const validation: EvidencePipelineStep = version.validationStatus === "VALID"
    ? { stage: "File validation", detail: "Valid", tone: "done" }
    : version.validationStatus === "INVALID" || version.validationStatus === "ERROR"
      ? { stage: "File validation", detail: "Failed", tone: "problem" }
      : { stage: "File validation", detail: "Not run yet", tone: "waiting" }
  const review: EvidencePipelineStep = version.reviewStatus === "ACCEPTED"
    ? { stage: "Admin review", detail: "Accepted", tone: "done" }
    : version.reviewStatus === "REJECTED"
      ? { stage: "Admin review", detail: "Rejected", tone: "problem" }
      : version.reviewStatus === "SUPERSEDED"
        ? { stage: "Admin review", detail: "Superseded", tone: "done" }
        : { stage: "Admin review", detail: "Needs review", tone: "waiting" }
  return [upload, scan, validation, review]
}

export type EvidenceVersionWorkspace = {
  version: EvidenceVersionRow
  state: EvidenceVersionState
  label: string
  actions: EvidenceActionState
  anchorId: string
  latest: boolean
}

export type EvidenceDocumentWorkspace = {
  document: EvidenceDocument
  requestTitle: string | null
  latest: EvidenceVersionWorkspace
  history: EvidenceVersionWorkspace[]
}

export type EvidenceRequestWorkspace = {
  request: EvidenceRequest
  view: EvidenceRequestView | null
  label: string
  headline: string
  overdue: boolean
  needsAttention: boolean
  anchorId: string
  documents: EvidenceDocumentWorkspace[]
}

export type EvidenceCaseActionPresentation =
  | { kind: "evidence"; label: string; description: string }
  | { kind: "elsewhere"; label: string; description: string; href: string | null; destinationLabel: string | null }
  | { kind: "none" }

export type EvidenceWorkspaceModel = {
  summary: EvidenceSummary
  summaryLines: string[]
  requests: EvidenceRequestWorkspace[]
  openRequests: EvidenceRequestWorkspace[]
  completedRequests: EvidenceRequestWorkspace[]
  unlinkedDocuments: EvidenceDocumentWorkspace[]
  contactState: EvidenceContactState
  contactLabel: string
  showContact: boolean
  caseAction: EvidenceCaseActionPresentation
  parityMismatches: string[]
  empty: boolean
}

const adminVersionStates = new Set<EvidenceVersionState>([
  "THREAT_BLOCKED",
  "SCAN_UNAVAILABLE",
  "CONTENT_INVALID",
  "CHECK_NEEDED",
  "AWAITING_REVIEW",
  "UPLOAD_FAILED",
])

/** Which live file, if several are attached, the request sentence should lead with. */
const headlineOrder: EvidenceVersionState[] = [
  "THREAT_BLOCKED",
  "CONTENT_INVALID",
  "SCAN_UNAVAILABLE",
  "CHECK_NEEDED",
  "AWAITING_REVIEW",
  "UPLOAD_FAILED",
  "SCAN_PENDING",
  "UPLOAD_PENDING",
  "REJECTED",
]

function countLine(count: number, one: string, many: string): string | null {
  if (count <= 0) return null
  return `${count} ${count === 1 ? one : many}`
}

export function evidenceSummaryLines(summary: EvidenceSummary): string[] {
  return [
    countLine(summary.openRequests.length, "open evidence request", "open evidence requests"),
    countLine(summary.awaitingReview, "file needs Admin review", "files need Admin review"),
    countLine(summary.scanInProgress, "file is waiting for a malware scan", "files are waiting for a malware scan"),
    countLine(summary.needsScanCheck, "file needs a scan check", "files need a scan check"),
    countLine(summary.threatBlocked, "file has a security threat", "files have a security threat"),
    countLine(summary.contentInvalid, "file failed content validation", "files failed content validation"),
    countLine(summary.uploadInProgress, "upload is still incomplete", "uploads are still incomplete"),
    countLine(summary.uploadFailed, "upload failed", "uploads failed"),
    countLine(summary.accepted, "accepted evidence file", "accepted evidence files"),
    countLine(summary.satisfiedButOpen.length, "request can now be marked fulfilled", "requests can now be marked fulfilled"),
  ].filter((line): line is string => line !== null)
}

/**
 * The detailed evidence case and the case-flow evidence facts must name the
 * same requests, the same versions and the same request association.
 * Ordering is not part of the contract. A mismatch is reported; it is never
 * repaired by guessing from a filename, a date or a subject line.
 */
export function compareEvidenceProjections(evidence: EvidenceCase, facts: CaseFlowEvidenceFact): string[] {
  const mismatches: string[] = []
  const caseRequests = new Set(evidence.requests.map(request => request.id))
  const factRequests = new Set(facts.requests.map(request => request.id))
  for (const id of caseRequests) {
    if (!factRequests.has(id)) mismatches.push(`Request ${id} is on the evidence case and missing from the case-flow facts.`)
  }
  for (const id of factRequests) {
    if (!caseRequests.has(id)) mismatches.push(`Request ${id} is in the case-flow facts and missing from the evidence case.`)
  }
  const caseVersions = new Map<string, string | null>()
  for (const document of evidence.documents) {
    for (const version of document.versions) {
      if (caseVersions.has(version.id)) mismatches.push(`Version ${version.id} is listed more than once on the evidence case.`)
      caseVersions.set(version.id, document.evidenceRequestId)
    }
  }
  const factVersions = new Map(facts.versions.map(version => [version.versionId, version.evidenceRequestId]))
  for (const [id, requestId] of caseVersions) {
    if (!factVersions.has(id)) {
      mismatches.push(`Version ${id} is on the evidence case and missing from the case-flow facts.`)
    } else if (factVersions.get(id) !== requestId) {
      mismatches.push(`Version ${id} is linked to ${requestId ?? "no request"} on the document and ${factVersions.get(id) ?? "no request"} in the case-flow facts.`)
    }
  }
  for (const id of factVersions.keys()) {
    if (!caseVersions.has(id)) mismatches.push(`Version ${id} is in the case-flow facts and missing from the evidence case.`)
  }
  return mismatches
}

function presentVersion(document: EvidenceDocument, version: EvidenceVersionRow, latest: boolean): EvidenceVersionWorkspace {
  const state = evidenceVersionState({
    documentId: document.id,
    versionId: version.id,
    evidenceRequestId: document.evidenceRequestId,
    uploadStatus: version.uploadStatus,
    scanStatus: version.scanStatus,
    validationStatus: version.validationStatus,
    reviewStatus: version.reviewStatus,
  })
  return {
    version,
    state,
    label: evidenceVersionStateLabel(state),
    actions: evidenceActions(version),
    anchorId: evidenceVersionAnchor(version.id),
    latest,
  }
}

function presentDocument(document: EvidenceDocument, requestTitle: string | null): EvidenceDocumentWorkspace | null {
  const versions = [...document.versions].sort((left, right) => right.versionNumber - left.versionNumber)
  const latest = versions[0]
  if (!latest) return null
  const presented = versions.map((version, index) => presentVersion(document, version, index === 0))
  return { document, requestTitle, latest: presented[0], history: presented.slice(1) }
}

function requestHeadline(state: EvidenceRequestState | null, documents: EvidenceDocumentWorkspace[]): string {
  if (state === "OPEN_SATISFIED") return "Accepted evidence received — this request is still open."
  if (state === "FULFILLED") return "Fulfilled."
  if (state === "CANCELLED") return "Cancelled."
  const latest = documents.map(document => document.latest.state)
  if (state === "OPEN_NOT_STARTED" || state === null) {
    if (latest.includes("REJECTED")) return "Rejected evidence received. No evidence is currently in progress against this request."
    return "No evidence received against this request yet."
  }
  for (const candidate of headlineOrder) {
    if (latest.includes(candidate)) return `${versionLabels[candidate]}.`
  }
  return "Evidence received — checks or review still in progress."
}

function isOpenState(state: EvidenceRequestState | null, request: EvidenceRequest): boolean {
  if (state) return state.startsWith("OPEN_")
  return request.status === "OPEN"
}

function presentCaseAction(action: CaseNextAction | null): EvidenceCaseActionPresentation {
  if (!action) return { kind: "none" }
  if (action.destination?.kind === "CASE_EVIDENCE") {
    return { kind: "evidence", label: action.label, description: action.description }
  }
  return {
    kind: "elsewhere",
    label: action.label,
    description: action.description,
    href: action.destination?.href ?? null,
    destinationLabel: action.destination?.label ?? null,
  }
}

export function buildEvidenceWorkspaceModel(input: {
  evidence: EvidenceCase
  evidenceFacts: CaseFlowEvidenceFact
  communications: CaseFlowCommunicationFact[]
  primaryAction: CaseNextAction | null
  now: string
  hasPack: boolean
}): EvidenceWorkspaceModel {
  const summary = summariseEvidence(input.evidenceFacts, input.communications)
  const viewById = new Map(summary.requests.map(view => [view.id, view]))
  const titleById = new Map(input.evidence.requests.map(request => [request.id, request.title]))
  const knownRequests = new Set(titleById.keys())

  const documentsByRequest = new Map<string, EvidenceDocumentWorkspace[]>()
  const unlinked: EvidenceDocumentWorkspace[] = []
  for (const document of input.evidence.documents) {
    const requestId = document.evidenceRequestId
    const linked = requestId !== null && knownRequests.has(requestId)
    const presented = presentDocument(document, linked && requestId ? titleById.get(requestId) ?? null : null)
    if (!presented) continue
    if (!linked || !requestId) {
      unlinked.push(presented)
      continue
    }
    const list = documentsByRequest.get(requestId) ?? []
    list.push(presented)
    documentsByRequest.set(requestId, list)
  }

  const ordered = input.evidence.requests.map((request, index) => {
    const view = viewById.get(request.id) ?? null
    const documents = documentsByRequest.get(request.id) ?? []
    const state = view?.state ?? null
    const needsAttention = !!state?.startsWith("OPEN_") && (
      state === "OPEN_SATISFIED" || documents.some(document => adminVersionStates.has(document.latest.state))
    )
    return {
      request,
      view,
      label: state ? evidenceRequestStateLabel(state) : request.status === "FULFILLED" ? "Fulfilled" : request.status === "CANCELLED" ? "Cancelled" : "Open",
      headline: requestHeadline(state, documents),
      overdue: isOpenState(state, request) && !!request.dueAt && request.dueAt < input.now,
      needsAttention,
      anchorId: evidenceRequestAnchor(request.id),
      documents,
      index,
    }
  })

  ordered.sort((left, right) => {
    const rank = (item: typeof left) => {
      if (isOpenState(item.view?.state ?? null, item.request) && item.needsAttention) return 0
      if (isOpenState(item.view?.state ?? null, item.request)) return 1
      if ((item.view?.state ?? item.request.status) === "FULFILLED") return 2
      return 3
    }
    const difference = rank(left) - rank(right)
    if (difference !== 0) return difference
    if (left.request.dueAt && right.request.dueAt && left.request.dueAt !== right.request.dueAt) {
      return left.request.dueAt < right.request.dueAt ? -1 : 1
    }
    return left.index - right.index
  })

  const requests = ordered.map(({ index: _index, ...request }) => request)
  const contactState = evidenceContactState(input.communications)
  return {
    summary,
    summaryLines: evidenceSummaryLines(summary),
    requests,
    openRequests: requests.filter(request => isOpenState(request.view?.state ?? null, request.request)),
    completedRequests: requests.filter(request => !isOpenState(request.view?.state ?? null, request.request)),
    unlinkedDocuments: unlinked,
    contactState,
    contactLabel: evidenceContactStateLabel(contactState),
    showContact: input.evidence.requests.length > 0 || contactState !== "NOT_PREPARED",
    caseAction: presentCaseAction(input.primaryAction),
    parityMismatches: compareEvidenceProjections(input.evidence, input.evidenceFacts),
    empty: input.evidence.requests.length === 0 && input.evidence.documents.length === 0 && !input.hasPack,
  }
}
