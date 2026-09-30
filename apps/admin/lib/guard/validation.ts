import { isUuid } from "../records/model"
import { guardOperations, type GuardOperation } from "./model"

export function isGuardOperation(value: unknown): value is GuardOperation {
  return typeof value === "string" && (guardOperations as readonly string[]).includes(value)
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  return next.length >= min && next.length <= max ? next : null
}

function futureTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const at = Date.parse(value)
  if (!Number.isFinite(at) || at <= Date.now() || at > Date.now() + 7 * 24 * 3600 * 1000) return null
  return value
}

export function guardArgs(operation: GuardOperation, body: Record<string, unknown>) {
  if (operation === "identify_location") {
    if (!isUuid(body.monitoringRequestId) || !isUuid(body.locationId)) return null
    return { monitoringRequestId: body.monitoringRequestId, locationId: body.locationId }
  }
  if (operation === "remove_location" || operation === "mark_mapping_ready") {
    if (!isUuid(body.mappingId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
    return { mappingId: body.mappingId, version: body.version }
  }
  if (operation === "create_direct_coverage") {
    if (!isUuid(body.mappingId) || !isUuid(body.serviceOrderId)) return null
    return { mappingId: body.mappingId, serviceOrderId: body.serviceOrderId }
  }
  if (operation === "create_included_offer") {
    if (!isUuid(body.caseId) || !isUuid(body.serviceOrderId)) return null
    return { caseId: body.caseId, serviceOrderId: body.serviceOrderId }
  }
  if (operation === "issue_permission_action") {
    const expiresAt = futureTimestamp(body.expiresAt)
    if (!isUuid(body.coverageId) || !expiresAt) return null
    return { coverageId: body.coverageId, expiresAt }
  }
  if (operation === "record_baseline") {
    const profileUrl = text(body.profileUrl, 8, 500)
    const displayedBusinessName = text(body.displayedBusinessName, 1, 200)
    const notes = typeof body.notes === "string" ? body.notes.trim() : ""
    if (!isUuid(body.coverageId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
    if (!profileUrl || !displayedBusinessName || !["AVAILABLE", "UNAVAILABLE", "UNKNOWN"].includes(String(body.profileAvailability))) return null
    if (notes.length > 2000) return null
    const reviewCount = body.reviewCount === "" || body.reviewCount == null ? null : Number(body.reviewCount)
    const rating = body.rating === "" || body.rating == null ? null : Number(body.rating)
    if (reviewCount !== null && (!Number.isInteger(reviewCount) || reviewCount < 0)) return null
    if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) return null
    return {
      coverageId: body.coverageId, version: body.version, profileUrl, displayedBusinessName,
      profileAvailability: String(body.profileAvailability), notes,
      reviewCount, rating,
      latestReviewReference: typeof body.latestReviewReference === "string" ? body.latestReviewReference.trim().slice(0, 200) : "",
      latestReviewAt: typeof body.latestReviewAt === "string" && body.latestReviewAt ? body.latestReviewAt : null,
      profileDetails: body.profileDetails && typeof body.profileDetails === "object" && !Array.isArray(body.profileDetails) ? body.profileDetails : {},
    }
  }
  if (operation === "assign_rota" || operation === "activate" || operation === "record_activation_exception") {
    if (!isUuid(body.coverageId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
    const notes = typeof body.notes === "string" ? body.notes.trim() : ""
    if (notes.length > 2000) return null
    return { coverageId: body.coverageId, version: body.version, ...(notes ? { notes } : {}) }
  }
  if (operation === "acknowledge_exception") {
    if (!isUuid(body.exceptionId)) return null
    return { exceptionId: body.exceptionId }
  }
  if (operation === "revoke_permission") {
    const reason = text(body.reason, 10, 2000)
    if (!isUuid(body.coverageId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1 || !reason) return null
    return { coverageId: body.coverageId, version: body.version, reason }
  }
  return null
}
