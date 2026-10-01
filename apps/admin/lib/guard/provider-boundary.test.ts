import { describe, expect, it } from "vitest"
import { googleBusinessProfileProvider } from "../../../../lib/google-business-profile/google-adapter"
import { mockGoogleBusinessProfileProvider } from "../../../../lib/google-business-profile/testing/mock-adapter"
import type {
  ProviderConnectionState,
  ProviderProfileSnapshot,
} from "../../../../lib/google-business-profile/provider"
import { guardCheckClassificationAllowed } from "./checks-model"
import {
  guardAutomationDecision,
  providerObservationCandidate,
  providerObservationPersistable,
} from "./provider-boundary"

const liveEnv = {
  GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
  GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true",
  GOOGLE_BUSINESS_PROFILE_CLIENT_ID: "client-id",
  GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "client-secret",
  GOOGLE_BUSINESS_PROFILE_REDIRECT_URI: "https://admin.example.com/api/integrations/google/callback",
  GOOGLE_BUSINESS_PROFILE_TOKEN_KEY: "0123456789abcdef0123456789abcdef",
}

const connected: ProviderConnectionState = {
  status: "CONNECTED",
  connectionRef: "connection-1",
  grantedScopes: ["https://www.googleapis.com/auth/business.manage"],
  connectedAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
}

function live(status = 200, body: unknown = {}) {
  return googleBusinessProfileProvider({
    transport: { async get() { return { status, body } } },
    connection: connected,
  })
}

function snapshot(overrides: Partial<ProviderProfileSnapshot> = {}): ProviderProfileSnapshot {
  return {
    locationRef: "locations/1",
    availability: "AVAILABLE",
    displayedBusinessName: "Example Plumbing",
    profileUrl: "https://maps.google.com/?cid=1",
    reviewCount: 31,
    rating: 4.6,
    ratingAvailable: true,
    observedAt: "2026-02-01T10:00:00.000Z",
    ...overrides,
  }
}

describe("Guard provider boundary", () => {
  it("keeps Guard on the manual workflow in today's environment", async () => {
    const decision = await guardAutomationDecision({ env: {} })
    expect(decision).toEqual({ automationAvailable: false, source: "MANUAL", reason: "provider_mode_manual" })
  })

  it("keeps Guard manual when every gate passes but no live transport exists", async () => {
    const decision = await guardAutomationDecision({ env: liveEnv })
    expect(decision.automationAvailable).toBe(false)
    expect(decision.source).toBe("MANUAL")
  })

  it("refuses to let a mock provider drive Guard", async () => {
    const decision = await guardAutomationDecision({ env: liveEnv, liveProvider: mockGoogleBusinessProfileProvider() })
    expect(decision).toEqual({ automationAvailable: false, source: "MANUAL", reason: "live_provider_rejected" })
  })

  it("keeps Guard manual whenever the provider is not fully available", async () => {
    for (const status of [401, 403, 429, 500]) {
      const provider = live(status)
      await provider.listAccounts()
      const decision = await guardAutomationDecision({ env: liveEnv, liveProvider: provider })
      expect(decision.automationAvailable, String(status)).toBe(false)
      expect(decision.source, String(status)).toBe("MANUAL")
    }
  })

  it("allows automation only for a live, available provider", async () => {
    const decision = await guardAutomationDecision({ env: liveEnv, liveProvider: live() })
    expect(decision).toEqual({ automationAvailable: true, source: "PROVIDER", reason: null })
  })
})

describe("provider observation candidates", () => {
  it("never persists a provider observation in this step", () => {
    expect(providerObservationPersistable()).toBe(false)
  })

  it("proposes only the conservative classification its availability permits", () => {
    expect(providerObservationCandidate(snapshot())?.classification).toBe("HEALTHY")
    expect(providerObservationCandidate(snapshot({ availability: "UNAVAILABLE" }))?.classification).toBe("PROFILE_UNAVAILABLE")
    expect(providerObservationCandidate(snapshot({ availability: "UNKNOWN" }))?.classification).toBe("INCOMPLETE")
  })

  it("never proposes a detected change without the existing baseline comparison", () => {
    const candidate = providerObservationCandidate(snapshot({ displayedBusinessName: "Renamed Plumbing" }))
    expect(candidate?.classification).not.toBe("CHANGE_DETECTED")
  })

  it("satisfies exactly the domain rule a manual observation must satisfy", () => {
    for (const availability of ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"] as const) {
      const candidate = providerObservationCandidate(snapshot({ availability }))!
      expect(guardCheckClassificationAllowed(candidate.profileAvailability, candidate.classification), availability).toBe(true)
    }
  })

  it("rejects a snapshot that cannot satisfy the manual validation rules", () => {
    expect(providerObservationCandidate(snapshot({ ratingAvailable: true, rating: null }))).toBeNull()
    expect(providerObservationCandidate(snapshot({ ratingAvailable: true, rating: 9 }))).toBeNull()
    expect(providerObservationCandidate(snapshot({ reviewCount: -1 }))).toBeNull()
    expect(providerObservationCandidate(snapshot({ reviewCount: 1.5 }))).toBeNull()
  })

  it("drops a rating that the provider did not actually report", () => {
    const candidate = providerObservationCandidate(snapshot({ ratingAvailable: false, rating: 4.6 }))
    expect(candidate?.rating).toBeNull()
    expect(candidate?.ratingAvailable).toBe(false)
  })
})
