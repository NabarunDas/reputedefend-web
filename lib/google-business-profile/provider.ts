import type { ProviderCapability, ResolvedProviderKind } from "./capability"
import type { ProviderFailure } from "./errors"

// ProfileRelaunch domain objects. Google response shapes are mapped into these
// inside the Google adapter and never leak past it.
export type ProviderAccount = {
  accountRef: string
  displayName: string
  // ProfileRelaunch classification, not a Google enum.
  kind: "PERSONAL" | "ORGANIZATION" | "UNKNOWN"
}

export type ProviderLocation = {
  locationRef: string
  accountRef: string
  displayName: string
  // Normalised single-line address. Never a raw provider address object.
  address: string
  profileUrl: string | null
  verified: boolean
}

// Mirrors the fields Guard already captures for a manual observation so an
// automated snapshot can later flow through the same domain validation.
export type ProviderProfileSnapshot = {
  locationRef: string
  availability: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN"
  displayedBusinessName: string | null
  profileUrl: string | null
  reviewCount: number | null
  rating: number | null
  ratingAvailable: boolean
  observedAt: string
}

export type ProviderReviewSnapshot = {
  locationRef: string
  reviewCount: number | null
  latestReviewReference: string | null
  latestReviewAt: string | null
  observedAt: string
}

export type ProviderConnectionState = {
  status: "NOT_CONNECTED" | "CONNECTED" | "REVOKED" | "EXPIRED"
  connectionRef: string | null
  grantedScopes: string[]
  connectedAt: string | null
  revokedAt: string | null
  expiresAt: string | null
}

export type ProviderHealth = {
  capability: ProviderCapability
  connection: ProviderConnectionState
  lastSuccessAt: string | null
  lastFailure: ProviderFailure | null
}

// Every provider call returns a discriminated result rather than throwing, so
// a caller cannot accidentally treat a failure as success.
export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ProviderFailure }

export function providerOk<T>(value: T): ProviderResult<T> {
  return { ok: true, value }
}

export function providerError<T>(failure: ProviderFailure): ProviderResult<T> {
  return { ok: false, failure }
}

export type ProviderSnapshotRequest = {
  accountRef: string
  locationRef: string
}

// The single boundary every caller uses. Guard, cases, monitoring and the UI
// depend on this interface and never on a Google client.
export type GoogleBusinessProfileProvider = {
  readonly kind: ResolvedProviderKind
  capability(): Promise<ProviderCapability>
  listAccounts(): Promise<ProviderResult<ProviderAccount[]>>
  listLocations(accountRef: string): Promise<ProviderResult<ProviderLocation[]>>
  profileSnapshot(request: ProviderSnapshotRequest): Promise<ProviderResult<ProviderProfileSnapshot>>
  reviewSnapshot(request: ProviderSnapshotRequest): Promise<ProviderResult<ProviderReviewSnapshot>>
  connectionState(): Promise<ProviderConnectionState>
  health(): Promise<ProviderHealth>
}
