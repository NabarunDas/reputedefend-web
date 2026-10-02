/**
 * The evidence picture, which is the part operators get wrong most often.
 *
 * Two things this makes impossible to confuse. An evidence request is a
 * record of what is needed; it contacts nobody, and raising one is not the
 * same as asking. And a message that a provider accepted is not a message
 * that arrived. Both distinctions exist in the database already and are
 * simply invisible unless somebody opens two different Admin surfaces, which
 * is the problem UX-1 exists to solve.
 *
 * The per-version precedence comes from `evidenceActions` in
 * `lib/evidence/model.ts` rather than being invented here, so the flow model
 * and the evidence workspace cannot disagree about what a file is doing.
 */

import { evidenceActions } from "../evidence/model"
import type { CaseFlowCommunicationFact, CaseFlowEvidenceFact, CaseFlowEvidenceVersionFact } from "./model"

export const evidenceVersionStates = [
  "UPLOAD_PENDING",
  "UPLOAD_FAILED",
  "SCAN_PENDING",
  "THREAT_BLOCKED",
  "SCAN_UNAVAILABLE",
  "CONTENT_INVALID",
  "CHECK_NEEDED",
  "AWAITING_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
] as const

export type EvidenceVersionState = (typeof evidenceVersionStates)[number]

/**
 * One uploaded file's situation.
 *
 * `contentType` only decides whether the workspace can preview a file, which
 * has no bearing on the journey, so a neutral value is passed.
 */
export function evidenceVersionState(version: CaseFlowEvidenceVersionFact): EvidenceVersionState {
  const actions = evidenceActions({ ...version, contentType: "application/pdf" })
  const uploaded = version.uploadStatus === "UPLOADED"
  if (version.uploadStatus === "PENDING_UPLOAD") return "UPLOAD_PENDING"
  if (uploaded && version.scanStatus === "PENDING") return "SCAN_PENDING"
  if (actions.threatBlocked) return "THREAT_BLOCKED"
  if (version.scanStatus === "FAILED" || version.scanStatus === "UNSUPPORTED" || version.scanStatus === "ACCESS_DENIED") {
    return "SCAN_UNAVAILABLE"
  }
  if (actions.validationFailed) return "CONTENT_INVALID"
  const cleanValid = uploaded && version.scanStatus === "NO_THREATS_FOUND" && version.validationStatus === "VALID"
  if (!cleanValid) return uploaded ? "CHECK_NEEDED" : "UPLOAD_FAILED"
  if (version.reviewStatus === "SUPERSEDED") return "SUPERSEDED"
  if (version.reviewStatus === "ACCEPTED") return "ACCEPTED"
  if (version.reviewStatus === "REJECTED") return "REJECTED"
  return "AWAITING_REVIEW"
}

export const evidenceContactStates = [
  "NOT_PREPARED",
  "DRAFTED",
  "REVIEWED",
  "QUEUED",
  "ACCEPTANCE_UNKNOWN",
  "PROVIDER_ACCEPTED",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const

export type EvidenceContactState = (typeof evidenceContactStates)[number]

/** Delivery outcomes that mean the customer was not reached. */
const failedDelivery = ["BOUNCED", "TRANSIENT_BOUNCE", "UNDETERMINED_BOUNCE", "COMPLAINED", "SUPPRESSED", "FAILED"]

/**
 * How far the evidence request message has actually got.
 *
 * Read from the newest `EVIDENCE_REQUEST` message on the case. The
 * communications projection does not carry the evidence request each message
 * belongs to, so this is a case-level answer; see the gaps report.
 */
export function evidenceContactState(communications: CaseFlowCommunicationFact[]): EvidenceContactState {
  const latest = latestEvidenceRequestMessage(communications)
  if (!latest) return "NOT_PREPARED"
  if (latest.lifecycle === "CANCELLED") return "CANCELLED"
  const delivery = latest.deliveryStatus
  if (delivery && failedDelivery.includes(delivery)) return "FAILED"
  if (delivery === "DELIVERED") return "DELIVERED"
  if (delivery === "PROVIDER_ACCEPTED") return "PROVIDER_ACCEPTED"
  if (delivery === "ACCEPTANCE_UNKNOWN") return "ACCEPTANCE_UNKNOWN"
  if (latest.lifecycle === "QUEUED") return "QUEUED"
  if (latest.lifecycle === "REVIEWED") return "REVIEWED"
  if (latest.lifecycle === "DRAFT") return "DRAFTED"
  // A row with no lifecycle predates the communications workspace. It says
  // nothing reliable about whether this request was sent.
  return latest.legacyStatus === "SENT" ? "PROVIDER_ACCEPTED" : "NOT_PREPARED"
}

export function latestEvidenceRequestMessage(
  communications: CaseFlowCommunicationFact[],
): CaseFlowCommunicationFact | null {
  const relevant = communications.filter(row => row.templateKey === "EVIDENCE_REQUEST")
  if (relevant.length === 0) return null
  return relevant.reduce((newest, row) => (row.draftedAt > newest.draftedAt ? row : newest))
}

/** Whether the customer could plausibly have received the request. */
export function contactReachedCustomer(state: EvidenceContactState): boolean {
  return state === "PROVIDER_ACCEPTED" || state === "DELIVERED" || state === "ACCEPTANCE_UNKNOWN"
}

export const evidenceRequestStates = [
  "OPEN_NOT_STARTED",
  "OPEN_IN_PROGRESS",
  "OPEN_SATISFIED",
  "FULFILLED",
  "CANCELLED",
] as const

export type EvidenceRequestState = (typeof evidenceRequestStates)[number]

export type EvidenceRequestView = {
  id: string
  state: EvidenceRequestState
  dueAt: string | null
}

/**
 * Each request with what has happened against it.
 *
 * `OPEN_SATISFIED` is its own state because accepting a document does not
 * close its request: somebody has to mark the request fulfilled, and nothing
 * in the database does it for them.
 */
export function evidenceRequestViews(evidence: CaseFlowEvidenceFact): EvidenceRequestView[] {
  return evidence.requests.map(request => {
    if (request.status === "CANCELLED") return { id: request.id, state: "CANCELLED" as const, dueAt: request.dueAt }
    if (request.status === "FULFILLED") return { id: request.id, state: "FULFILLED" as const, dueAt: request.dueAt }
    const against = evidence.versions.filter(version => version.evidenceRequestId === request.id)
    const states = against.map(evidenceVersionState)
    if (states.includes("ACCEPTED")) return { id: request.id, state: "OPEN_SATISFIED" as const, dueAt: request.dueAt }
    const live = states.filter(state => state !== "SUPERSEDED" && state !== "REJECTED")
    return { id: request.id, state: live.length > 0 ? "OPEN_IN_PROGRESS" : "OPEN_NOT_STARTED", dueAt: request.dueAt }
  })
}

export type EvidenceSummary = {
  requests: EvidenceRequestView[]
  contact: EvidenceContactState
  /** Every version's state, including history. */
  versionStates: EvidenceVersionState[]
  anyRequest: boolean
  anyUpload: boolean
  openRequests: EvidenceRequestView[]
  /** The earliest due date across open requests, or null. */
  earliestOpenDueAt: string | null
  uploadInProgress: number
  uploadFailed: number
  threatBlocked: number
  contentInvalid: number
  needsScanCheck: number
  scanInProgress: number
  awaitingReview: number
  accepted: number
  rejected: number
  /** Open requests whose accepted evidence is in but which are still open. */
  satisfiedButOpen: EvidenceRequestView[]
  /** Nothing is outstanding: at least one request, none of them open. */
  complete: boolean
}

/**
 * A version somebody has already dealt with stops counting as a problem.
 * A rejected threat file is history, not an outstanding safety item, and
 * nagging about it forever would hide the thing that actually needs doing.
 */
function unresolved(version: CaseFlowEvidenceVersionFact): boolean {
  return version.reviewStatus !== "REJECTED" && version.reviewStatus !== "SUPERSEDED"
}

export function summariseEvidence(
  evidence: CaseFlowEvidenceFact,
  communications: CaseFlowCommunicationFact[],
): EvidenceSummary {
  const requests = evidenceRequestViews(evidence)
  const versionStates = evidence.versions.map(evidenceVersionState)
  const liveStates = evidence.versions.filter(unresolved).map(evidenceVersionState)
  const count = (state: EvidenceVersionState) => liveStates.filter(value => value === state).length
  const openRequests = requests.filter(request => request.state.startsWith("OPEN_"))
  const dueDates = openRequests.map(request => request.dueAt).filter((value): value is string => !!value).sort()
  return {
    requests,
    contact: evidenceContactState(communications),
    versionStates,
    anyRequest: requests.length > 0,
    anyUpload: evidence.versions.length > 0,
    openRequests,
    earliestOpenDueAt: dueDates[0] ?? null,
    uploadInProgress: count("UPLOAD_PENDING"),
    uploadFailed: count("UPLOAD_FAILED"),
    threatBlocked: count("THREAT_BLOCKED"),
    contentInvalid: count("CONTENT_INVALID"),
    needsScanCheck: count("CHECK_NEEDED") + count("SCAN_UNAVAILABLE"),
    scanInProgress: count("SCAN_PENDING"),
    awaitingReview: count("AWAITING_REVIEW"),
    accepted: count("ACCEPTED"),
    // Counted from the review decision rather than the derived state: a
    // rejected file with a threat in it still reads as blocked, and it has
    // still been rejected.
    rejected: evidence.versions.filter(version => version.reviewStatus === "REJECTED").length,
    satisfiedButOpen: requests.filter(request => request.state === "OPEN_SATISFIED"),
    complete: requests.length > 0 && openRequests.length === 0,
  }
}
