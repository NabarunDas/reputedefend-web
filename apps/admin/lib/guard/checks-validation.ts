import { isUuid } from "../records/model"
import {
  guardCheckClassifications,
  guardCheckOperations,
  type GuardCheckClassification,
  type GuardCheckOperation,
} from "./checks-model"

export function isGuardCheckOperation(value: unknown): value is GuardCheckOperation {
  return typeof value === "string" && (guardCheckOperations as readonly string[]).includes(value)
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  return next.length >= min && next.length <= max ? next : null
}

export function guardCheckArgs(operation: GuardCheckOperation, body: Record<string, unknown>) {
  if (!isUuid(body.obligationId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) {
    return null
  }
  if (operation === "claim") return { obligationId: body.obligationId, version: body.version }
  if (operation === "release") return { obligationId: body.obligationId, version: body.version, reason: text(body.reason, 0, 200) || "released" }
  if (operation === "fail") {
    const reason = text(body.reason, 10, 200)
    if (!reason) return null
    return { obligationId: body.obligationId, version: body.version, reason }
  }
  if (operation === "cancel") {
    const reason = text(body.reason, 3, 200)
    if (!reason) return null
    return { obligationId: body.obligationId, version: body.version, reason }
  }
  if (operation === "complete") {
    const classification = body.classification
    if (typeof classification !== "string" || !(guardCheckClassifications as readonly string[]).includes(classification)) return null
    const profileAvailability = body.profileAvailability
    if (profileAvailability !== "AVAILABLE" && profileAvailability !== "UNAVAILABLE" && profileAvailability !== "UNKNOWN") return null
    if (typeof body.locationIdentified !== "boolean") return null
    const notes = typeof body.notes === "string" ? body.notes : ""
    if (notes.length > 2000) return null
    const displayedBusinessName = typeof body.displayedBusinessName === "string" ? body.displayedBusinessName.trim() : ""
    const reviewCount = body.reviewCount === "" || body.reviewCount == null ? null : Number(body.reviewCount)
    if (reviewCount != null && (!Number.isInteger(reviewCount) || reviewCount < 0)) return null
    const ratingAvailable = body.ratingAvailable === true
    const rating = body.rating === "" || body.rating == null ? null : Number(body.rating)
    if (rating != null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) return null
    if (ratingAvailable && rating == null) return null
    if (!ratingAvailable && rating != null) return null
    return {
      obligationId: body.obligationId,
      version: body.version,
      classification: classification as GuardCheckClassification,
      profileAvailability,
      locationIdentified: body.locationIdentified,
      displayedBusinessName,
      reviewCount,
      rating,
      ratingAvailable,
      latestReviewReference: typeof body.latestReviewReference === "string" ? body.latestReviewReference.trim() : "",
      latestReviewAt: typeof body.latestReviewAt === "string" && body.latestReviewAt ? body.latestReviewAt : null,
      profileUrl: typeof body.profileUrl === "string" ? body.profileUrl.trim() : "",
      notes,
      baselineId: isUuid(body.baselineId) ? body.baselineId : null,
    }
  }
  return null
}
