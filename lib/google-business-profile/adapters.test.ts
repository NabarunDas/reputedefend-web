import { describe, expect, it } from "vitest"
import { googleBusinessProfileProvider, mapGoogleFailure, mapGoogleGrantFailure } from "./google-adapter"
import { manualGoogleBusinessProfileProvider } from "./manual-adapter"
import { isSyntheticRef, mockGoogleBusinessProfileProvider, syntheticPrefix } from "./testing/mock-adapter"
import type { ProviderConnectionState } from "./provider"

const connected: ProviderConnectionState = {
  status: "CONNECTED",
  connectionRef: "connection-1",
  grantedScopes: ["https://www.googleapis.com/auth/business.manage"],
  connectedAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
}

function adapter(response: unknown, status = 200) {
  let calls = 0
  const provider = googleBusinessProfileProvider({
    transport: {
      async get() {
        calls += 1
        return { status, body: response }
      },
    },
    connection: connected,
    now: () => new Date("2026-02-01T10:00:00.000Z"),
  })
  return { provider, calls: () => calls }
}

describe("manual adapter", () => {
  it("makes no provider call and never fabricates profile or review data", async () => {
    const provider = manualGoogleBusinessProfileProvider({ lastManualCheckAt: "2026-02-01T09:00:00.000Z" })
    expect(provider.kind).toBe("manual")
    const capability = await provider.capability()
    expect(capability.state).toBe("MANUAL")
    expect(capability.manualFallbackActive).toBe(true)
    expect(capability.reads).toEqual({
      accounts: false, locations: false, profile: false, reviews: false, automatedGuardObservations: false,
    })
    for (const result of [
      await provider.listAccounts(),
      await provider.listLocations("accounts/1"),
      await provider.profileSnapshot({ accountRef: "accounts/1", locationRef: "locations/1" }),
      await provider.reviewSnapshot({ accountRef: "accounts/1", locationRef: "locations/1" }),
    ]) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.failure.code).toBe("PROVIDER_DISABLED")
    }
  })

  it("never reports a manual check as API verified", async () => {
    const health = await manualGoogleBusinessProfileProvider({ lastManualCheckAt: "2026-02-01T09:00:00.000Z" }).health()
    expect(health.connection.status).toBe("NOT_CONNECTED")
    expect(health.capability.state).toBe("MANUAL")
    expect(health.lastSuccessAt).toBe("2026-02-01T09:00:00.000Z")
  })
})

describe("google adapter failure mapping", () => {
  it("normalises each provider status onto a domain failure", () => {
    expect(mapGoogleFailure({ status: 401, body: {} })).toBe("AUTH_REVOKED")
    expect(mapGoogleFailure({ status: 403, body: { error: { status: "PERMISSION_DENIED" } } })).toBe("PERMISSION_DENIED")
    expect(mapGoogleFailure({ status: 403, body: { error: { details: [{ reason: "insufficientScope" }] } } })).toBe("INSUFFICIENT_SCOPE")
    expect(mapGoogleFailure({ status: 403, body: { error: { details: [{ reason: "rateLimitExceeded" }] } } })).toBe("QUOTA_EXCEEDED")
    expect(mapGoogleFailure({ status: 404, body: {} })).toBe("LOCATION_UNAVAILABLE")
    expect(mapGoogleFailure({ status: 409, body: {} })).toBe("ACCOUNT_INACCESSIBLE")
    expect(mapGoogleFailure({ status: 429, body: {} })).toBe("QUOTA_EXCEEDED")
    expect(mapGoogleFailure({ status: 503, body: {} })).toBe("TRANSIENT_FAILURE")
    expect(mapGoogleGrantFailure({ error: "invalid_grant" })).toBe("AUTH_REVOKED")
    expect(mapGoogleGrantFailure({ error: "access_denied" })).toBe("PERMISSION_DENIED")
    expect(mapGoogleGrantFailure({ error: "something_else" })).toBeNull()
  })

  it("treats a malformed response as a failure rather than an empty profile", async () => {
    const { provider } = adapter({ accounts: "not-a-list" })
    const result = await provider.listAccounts()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.code).toBe("MALFORMED_RESPONSE")
    expect((await provider.capability()).state).toBe("ERROR")
  })

  it("turns a thrown transport error into a transient failure with no detail", async () => {
    const provider = googleBusinessProfileProvider({
      transport: { async get() { throw new Error("connect ECONNREFUSED 10.0.0.1:443 token=abc") } },
      connection: connected,
    })
    const result = await provider.listAccounts()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure.code).toBe("TRANSIENT_FAILURE")
      expect(result.failure.message).not.toMatch(/ECONNREFUSED|10\.0\.0\.1|token/)
    }
  })

  it("refuses every read once the stored authorization is revoked", async () => {
    let called = false
    const provider = googleBusinessProfileProvider({
      transport: { async get() { called = true; return { status: 200, body: {} } } },
      connection: { ...connected, status: "REVOKED", revokedAt: "2026-02-01T00:00:00.000Z" },
    })
    const result = await provider.profileSnapshot({ accountRef: "accounts/1", locationRef: "locations/1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.code).toBe("AUTH_REVOKED")
    expect(called).toBe(false)
    expect((await provider.capability()).state).toBe("REVOKED")
  })

  it("reports quota exhaustion as quota limited rather than healthy", async () => {
    const { provider } = adapter({ error: { status: "RESOURCE_EXHAUSTED" } }, 429)
    const result = await provider.listAccounts()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.retryable).toBe(true)
    const capability = await provider.capability()
    expect(capability.state).toBe("QUOTA_LIMITED")
    expect(capability.manualFallbackActive).toBe(true)
  })

  it("maps a successful location read into domain objects only", async () => {
    const { provider } = adapter({
      title: "Example Plumbing",
      openInfo: { status: "OPEN" },
      averageRating: 4.6,
      totalReviewCount: 31,
      metadata: { mapsUri: "https://maps.google.com/?cid=1" },
    })
    const result = await provider.profileSnapshot({ accountRef: "accounts/1", locationRef: "locations/1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        locationRef: "locations/1",
        availability: "AVAILABLE",
        displayedBusinessName: "Example Plumbing",
        profileUrl: "https://maps.google.com/?cid=1",
        reviewCount: 31,
        rating: 4.6,
        ratingAvailable: true,
        observedAt: "2026-02-01T10:00:00.000Z",
      })
    }
  })
})

describe("mock adapter containment", () => {
  it("refuses to be constructed outside a test runtime", () => {
    expect(() => mockGoogleBusinessProfileProvider({ env: { NODE_ENV: "production" } }))
      .toThrow(/test-only/)
    expect(() => mockGoogleBusinessProfileProvider({ env: { NODE_ENV: "production", VERCEL_ENV: "preview" } }))
      .toThrow(/test-only/)
    expect(() => mockGoogleBusinessProfileProvider({ env: {} })).toThrow(/test-only/)
  })

  it("marks every fixture reference as synthetic", async () => {
    const provider = mockGoogleBusinessProfileProvider()
    const accounts = await provider.listAccounts()
    const locations = await provider.listLocations("accounts/1")
    const connection = await provider.connectionState()
    expect(accounts.ok && accounts.value.every(row => isSyntheticRef(row.accountRef))).toBe(true)
    expect(locations.ok && locations.value.every(row => isSyntheticRef(row.locationRef))).toBe(true)
    expect(isSyntheticRef(connection.connectionRef)).toBe(true)
    expect(syntheticPrefix).toBe("SYNTHETIC-TEST-")
  })

  it("holds no credential or token of any kind", async () => {
    const provider = mockGoogleBusinessProfileProvider()
    const serialised = JSON.stringify({
      connection: await provider.connectionState(),
      health: await provider.health(),
      accounts: await provider.listAccounts(),
    })
    expect(serialised).not.toMatch(/accessToken|refreshToken|clientSecret|ya29\.|1\/\//)
  })
})
