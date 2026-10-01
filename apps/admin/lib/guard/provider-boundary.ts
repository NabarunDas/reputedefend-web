import type { GoogleBusinessProfileEnv } from "../../../../lib/google-business-profile/config"
import type {
  GoogleBusinessProfileProvider,
  ProviderProfileSnapshot,
  ProviderReviewSnapshot,
} from "../../../../lib/google-business-profile/provider"
import { resolveGoogleBusinessProfileProvider } from "../../../../lib/google-business-profile/resolve"
import { capabilityAllowsAutomation } from "../../../../lib/google-business-profile/capability"
import { guardCheckClassificationAllowed } from "./checks-model"

// How a Guard observation was obtained. Only MANUAL can be persisted today:
// guard_check_observations.capture_method still accepts nothing else, so an
// automated result cannot reach the observation table without a further
// migration and a separate activation decision.
export const observationSources = ["MANUAL", "PROVIDER"] as const
export type ObservationSource = (typeof observationSources)[number]

export type GuardAutomationDecision = {
  // True only when a live Google provider actually resolved and reports
  // AVAILABLE. Every other state keeps the Step 17 manual workflow in place.
  automationAvailable: boolean
  source: ObservationSource
  reason: string | null
}

export async function guardAutomationDecision(options: {
  env?: GoogleBusinessProfileEnv
  liveProvider?: GoogleBusinessProfileProvider
} = {}): Promise<GuardAutomationDecision> {
  const resolution = resolveGoogleBusinessProfileProvider({
    env: options.env,
    liveProvider: options.liveProvider,
  })
  const capability = await resolution.provider.capability()
  const allowed =
    resolution.provider.kind === "google" &&
    capability.reads.automatedGuardObservations &&
    capabilityAllowsAutomation(capability.state)
  if (allowed) return { automationAvailable: true, source: "PROVIDER", reason: null }
  return {
    automationAvailable: false,
    source: "MANUAL",
    reason: resolution.fallbackReason ?? capability.state.toLowerCase(),
  }
}

// What a provider snapshot would become if automation were ever switched on.
// Deliberately shaped like the manual completion payload so it has to satisfy
// exactly the same classification rules, baseline comparison and alert review
// that an Admin's manual observation does.
export type GuardObservationCandidate = {
  source: ObservationSource
  profileAvailability: ProviderProfileSnapshot["availability"]
  classification: "HEALTHY" | "CHANGE_DETECTED" | "PROFILE_UNAVAILABLE" | "INCOMPLETE"
  locationIdentified: boolean
  displayedBusinessName: string
  reviewCount: number | null
  rating: number | null
  ratingAvailable: boolean
  latestReviewReference: string
  latestReviewAt: string | null
  profileUrl: string
  observedAt: string
}

// A provider snapshot is never trusted to classify itself. It can only ever
// propose the conservative classification its availability permits; a detected
// change still needs the existing baseline comparison to confirm it.
function conservativeClassification(
  availability: ProviderProfileSnapshot["availability"],
): GuardObservationCandidate["classification"] {
  if (availability === "UNAVAILABLE") return "PROFILE_UNAVAILABLE"
  if (availability === "UNKNOWN") return "INCOMPLETE"
  return "HEALTHY"
}

export function providerObservationCandidate(
  profile: ProviderProfileSnapshot,
  reviews?: ProviderReviewSnapshot | null,
): GuardObservationCandidate | null {
  const classification = conservativeClassification(profile.availability)
  // The same domain rule the manual path uses. A snapshot that cannot satisfy
  // it is rejected rather than downgraded into something that would pass.
  if (!guardCheckClassificationAllowed(profile.availability, classification)) return null
  const rating = profile.ratingAvailable ? profile.rating : null
  if (profile.ratingAvailable && (rating == null || !Number.isFinite(rating) || rating < 1 || rating > 5)) return null
  const reviewCount = reviews?.reviewCount ?? profile.reviewCount
  if (reviewCount != null && (!Number.isInteger(reviewCount) || reviewCount < 0)) return null
  return {
    source: "PROVIDER",
    profileAvailability: profile.availability,
    classification,
    locationIdentified: profile.availability === "AVAILABLE",
    displayedBusinessName: profile.displayedBusinessName ?? "",
    reviewCount,
    rating,
    ratingAvailable: profile.ratingAvailable,
    latestReviewReference: reviews?.latestReviewReference ?? "",
    latestReviewAt: reviews?.latestReviewAt ?? null,
    profileUrl: profile.profileUrl ?? "",
    observedAt: profile.observedAt,
  }
}

// Guard never persists a provider-sourced observation in this step. The
// function exists so the decision is written down in one place rather than
// assumed at each call site.
export function providerObservationPersistable(): boolean {
  return false
}
