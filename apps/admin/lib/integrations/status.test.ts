import { describe, expect, it } from "vitest"
import { googleBusinessProfileProvider } from "../../../../lib/google-business-profile/google-adapter"
import { mockGoogleBusinessProfileProvider } from "../../../../lib/google-business-profile/testing/mock-adapter"
import type { ProviderConnectionState } from "../../../../lib/google-business-profile/provider"
import { connectDisabledNotice, healthViewIsSafe } from "./model"
import { googleIntegrationHealth } from "./status"

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

function liveProvider() {
  return googleBusinessProfileProvider({
    transport: { async get() { return { status: 200, body: {} } } },
    connection: connected,
  })
}

describe("Google integration health", () => {
  it("reports manual mode with no connection for today's production environment", async () => {
    const health = await googleIntegrationHealth({ env: {}, lastManualCheckAt: "2026-02-01T09:00:00.000Z" })
    expect(health.mode).toBe("manual")
    expect(health.capability).toBe("MANUAL")
    expect(health.capabilityText).toBe("Manual mode")
    expect(health.connection).toBe("NOT_CONNECTED")
    expect(health.manualFallbackActive).toBe(true)
    expect(health.connectAvailable).toBe(false)
    expect(health.notice).toBe(connectDisabledNotice)
    expect(health.lastSuccessAt).toBe("2026-02-01T09:00:00.000Z")
    expect(health.blockers).toContain("provider_mode_manual")
  })

  it("never reports a stored connection while the provider resolves manual", async () => {
    const health = await googleIntegrationHealth({
      env: {},
      connection: { status: "CONNECTED", connectedAt: "2026-01-01T00:00:00.000Z" },
    })
    expect(health.connection).toBe("NOT_CONNECTED")
    expect(health.connectAvailable).toBe(false)
  })

  it("explains each unmet live condition in Admin-safe wording", async () => {
    const health = await googleIntegrationHealth({ env: { GOOGLE_BUSINESS_PROFILE_PROVIDER: "google" } })
    expect(health.requestedMode).toBe("google")
    expect(health.blockerText).toContain("Google Business Profile API access is disabled.")
    expect(health.blockerText).toContain("No server-side token encryption key is configured.")
    expect(health.blockerText.join(" ")).not.toMatch(/client-secret|0123456789abcdef/)
  })

  it("stays manual when every gate passes but no live transport exists", async () => {
    const health = await googleIntegrationHealth({ env: liveEnv })
    expect(health.capability).toBe("MANUAL")
    expect(health.blockers).toEqual(["live_transport_unavailable"])
    expect(health.connectAvailable).toBe(false)
  })

  it("refuses to report a mock provider as connected", async () => {
    const health = await googleIntegrationHealth({
      env: liveEnv,
      liveProvider: mockGoogleBusinessProfileProvider(),
      connection: { status: "CONNECTED" },
    })
    expect(health.capability).toBe("MANUAL")
    expect(health.connection).toBe("NOT_CONNECTED")
    expect(health.blockers).toEqual(["live_provider_rejected"])
  })

  it("surfaces a live connection and its last error classification only", async () => {
    const health = await googleIntegrationHealth({
      env: liveEnv,
      liveProvider: liveProvider(),
      connection: {
        status: "CONNECTED",
        lastSuccessAt: "2026-02-01T08:00:00.000Z",
        lastErrorCode: "QUOTA_EXCEEDED",
      },
    })
    expect(health.capability).toBe("AVAILABLE")
    expect(health.connection).toBe("CONNECTED")
    expect(health.lastErrorText).toBe("Quota or rate limit reached")
    expect(health.connectAvailable).toBe(true)
  })

  it("ignores an unrecognised stored status or error code", async () => {
    const health = await googleIntegrationHealth({
      env: liveEnv,
      liveProvider: liveProvider(),
      connection: { status: "TOTALLY_FINE", lastErrorCode: "NOT_A_CODE" },
    })
    expect(health.connection).toBe("NOT_CONNECTED")
    expect(health.lastErrorCode).toBeNull()
  })

  it("carries no token material in any state", async () => {
    for (const input of [
      { env: {} },
      { env: liveEnv },
      { env: liveEnv, liveProvider: liveProvider(), connection: { status: "CONNECTED" } },
    ]) {
      const health = await googleIntegrationHealth(input)
      expect(healthViewIsSafe(health)).toBe(true)
      expect(JSON.stringify(health)).not.toMatch(/client-secret|0123456789abcdef|ya29\./)
    }
  })
})
