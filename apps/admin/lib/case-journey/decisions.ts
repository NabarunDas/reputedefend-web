/**
 * Staff decisions for the first two guided-journey steps.
 *
 * A case row, a confirmation email, a saved website and a saved Google URL
 * are not these decisions. Email control and business authority stay on their
 * own records and are never written here.
 */

export const intakeOutcomes = ["REVIEWED", "INCOMPLETE"] as const
export const verificationOutcomes = [
  "PRELIMINARY_COMPLETE",
  "FURTHER_INFORMATION",
  "LISTING_UNAVAILABLE",
  "DUPLICATE_REVIEW",
  "ESCALATE",
] as const
export const listingStates = ["ACCESSIBLE", "SUSPENDED_OR_MISSING", "NOT_SUPPLIED"] as const
export const websiteStates = ["PRESENT", "NONE"] as const

export type IntakeOutcome = (typeof intakeOutcomes)[number]
export type VerificationOutcome = (typeof verificationOutcomes)[number]
export type ListingState = (typeof listingStates)[number]
export type WebsiteState = (typeof websiteStates)[number]

export type JourneyWorkEvent = {
  /** Case-detail event id. Intake events may omit it. Outcome proof requires it. */
  id?: string
  event: string
  createdAt: string
  details: Record<string, unknown>
}

export type IntakeDecision = {
  at: number
  outcome: IntakeOutcome
  nextAction: string
  reopened: boolean
}

export type VerificationDecision = {
  at: number
  outcome: VerificationOutcome
  source: string
  listing: ListingState
  website: WebsiteState
  discrepancy: boolean
  reason: string
  reopened: boolean
}

const intakeSet = new Set<string>(intakeOutcomes)
const verificationSet = new Set<string>(verificationOutcomes)
const listingSet = new Set<string>(listingStates)
const websiteSet = new Set<string>(websiteStates)

function time(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function latest(events: readonly JourneyWorkEvent[], name: string): { at: number; details: Record<string, unknown> } | null {
  let best: { at: number; details: Record<string, unknown> } | null = null
  for (const row of events) {
    if (row.event !== name || !row.details || typeof row.details !== "object") continue
    const at = time(row.createdAt)
    if (at === null) continue
    if (!best || at >= best.at) best = { at, details: row.details }
  }
  return best
}

function reopenedAfter(events: readonly JourneyWorkEvent[], at: number): boolean {
  return events.some(row => row.event === "reopen" && (time(row.createdAt) ?? -1) > at)
}

export function latestIntakeDecision(events: readonly JourneyWorkEvent[]): IntakeDecision | null {
  const found = latest(events, "INTAKE_REVIEW")
  if (!found) return null
  const outcome = text(found.details.outcome)
  const nextAction = text(found.details.nextAction)
  if (!outcome || !intakeSet.has(outcome) || nextAction === null) return null
  if (outcome === "REVIEWED" && nextAction !== "") return null
  if (outcome === "INCOMPLETE" && (nextAction.trim().length < 3 || nextAction.length > 200)) return null
  return { at: found.at, outcome: outcome as IntakeOutcome, nextAction, reopened: reopenedAfter(events, found.at) }
}

export function latestVerificationDecision(events: readonly JourneyWorkEvent[]): VerificationDecision | null {
  const found = latest(events, "BUSINESS_VERIFICATION")
  if (!found) return null
  const outcome = text(found.details.outcome)
  const source = text(found.details.source)
  const listing = text(found.details.listing)
  const website = text(found.details.website)
  const reason = text(found.details.reason)
  if (!outcome || !verificationSet.has(outcome)) return null
  if (!source || source.trim().length < 3 || source.length > 200) return null
  if (!listing || !listingSet.has(listing) || !website || !websiteSet.has(website)) return null
  if (typeof found.details.discrepancy !== "boolean") return null
  if (!reason || reason.trim().length < 10 || reason.length > 1000) return null
  if (found.details.discrepancy && outcome !== "ESCALATE") return null
  if (outcome === "LISTING_UNAVAILABLE" && listing !== "SUSPENDED_OR_MISSING") return null
  if ("emailVerified" in found.details || "businessAuthorityVerified" in found.details) return null
  return {
    at: found.at,
    outcome: outcome as VerificationOutcome,
    source,
    listing: listing as ListingState,
    website: website as WebsiteState,
    discrepancy: found.details.discrepancy,
    reason,
    reopened: reopenedAfter(events, found.at),
  }
}

/** True only for a current staff review. Incomplete, unreadable and reopened reviews are not reviews. */
export function intakeReviewComplete(events: readonly JourneyWorkEvent[]): boolean {
  const decision = latestIntakeDecision(events)
  return decision?.outcome === "REVIEWED" && !decision.reopened
}

/**
 * True only for a current preliminary check with no material discrepancy.
 * A suspended listing can be part of that check. It is not a verified listing,
 * and the check does not verify email or business authority.
 */
export function verificationScreeningComplete(events: readonly JourneyWorkEvent[], membershipRevoked: boolean): boolean {
  const decision = latestVerificationDecision(events)
  if (!decision || decision.reopened || membershipRevoked) return false
  return decision.outcome === "PRELIMINARY_COMPLETE" && !decision.discrepancy
}

/**
 * Why a preliminary screening must not be treated as complete.
 * An unverified email or a pending membership is not one of these reasons.
 * A stale screening event does not override a current disagreement.
 */
export function preliminaryBlock(input: {
  events: readonly JourneyWorkEvent[]
  emailRecordsDisagree: boolean
  authorityRecordsDisagree: boolean
  submittedConflict: boolean
}): "review" | "records" | null {
  const recordsDisagree = input.emailRecordsDisagree || input.authorityRecordsDisagree || input.submittedConflict
  if (recordsDisagree) return "records"
  if (!intakeReviewComplete(input.events)) return "review"
  return null
}

function trimmed(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (text.length < min || value.length > max) return null
  return text
}

export function intakeDecisionArgs(raw: unknown): { outcome: IntakeOutcome; nextAction: string; note: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  if (Object.keys(body).length !== 3 || !["outcome", "nextAction", "note"].every(key => Object.hasOwn(body, key))) return null
  const outcome = text(body.outcome)
  const note = trimmed(body.note, 10, 1000)
  if (!outcome || !intakeSet.has(outcome) || !note) return null
  if (outcome === "REVIEWED") {
    if (body.nextAction !== "") return null
    return { outcome, nextAction: "", note }
  }
  const nextAction = trimmed(body.nextAction, 3, 200)
  if (!nextAction) return null
  return { outcome: "INCOMPLETE", nextAction, note }
}

export function verificationDecisionArgs(raw: unknown): {
  outcome: VerificationOutcome
  source: string
  listing: ListingState
  website: WebsiteState
  discrepancy: boolean
  reason: string
  note: string
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  const keys = ["outcome", "source", "listing", "website", "discrepancy", "reason", "note"]
  if (Object.keys(body).length !== keys.length || !keys.every(key => Object.hasOwn(body, key))) return null
  const outcome = text(body.outcome)
  const source = trimmed(body.source, 3, 200)
  const listing = text(body.listing)
  const website = text(body.website)
  const reason = trimmed(body.reason, 10, 1000)
  const note = trimmed(body.note, 10, 1000)
  if (!outcome || !verificationSet.has(outcome) || !source || !listing || !listingSet.has(listing)) return null
  if (!website || !websiteSet.has(website) || typeof body.discrepancy !== "boolean" || !reason || !note) return null
  if (body.discrepancy && outcome !== "ESCALATE") return null
  if (outcome === "LISTING_UNAVAILABLE" && listing !== "SUSPENDED_OR_MISSING") return null
  return {
    outcome: outcome as VerificationOutcome,
    source,
    listing: listing as ListingState,
    website: website as WebsiteState,
    discrepancy: body.discrepancy,
    reason,
    note,
  }
}
