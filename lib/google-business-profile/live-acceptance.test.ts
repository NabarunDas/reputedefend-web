import { describe, expect, it } from "vitest"
import {
  liveAcceptanceGate,
  liveAcceptanceStepDescriptions,
  liveAcceptanceSteps,
  runLiveAcceptance,
} from "./live-acceptance"
import { googleBusinessProfileProvider } from "./google-adapter"
import type { ProviderConnectionState } from "./provider"

const liveEnv = {
  GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
  GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true",
  GOOGLE_BUSINESS_PROFILE_CLIENT_ID: "client-id",
  GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "client-secret",
  GOOGLE_BUSINESS_PROFILE_REDIRECT_URI: "https://admin.example.com/api/integrations/google/callback",
  GOOGLE_BUSINESS_PROFILE_TOKEN_KEY: "0123456789abcdef0123456789abcdef",
  GOOGLE_LIVE_ACCEPTANCE_ENABLED: "true",
}

const connected: ProviderConnectionState = {
  status: "CONNECTED",
  connectionRef: "connection-1",
  grantedScopes: ["https://www.googleapis.com/auth/business.manage"],
  connectedAt: "2026-01-01T00:00:00.000Z",
  revokedAt: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
}

function countingProvider() {
  let calls = 0
  const provider = googleBusinessProfileProvider({
    transport: { async get() { calls += 1; return { status: 200, body: {} } } },
    connection: connected,
  })
  return { provider, calls: () => calls }
}

describe("live acceptance harness", () => {
  it("documents the full future acceptance sequence", () => {
    expect([...liveAcceptanceSteps]).toEqual([
      "oauth_connection", "account_listing", "location_listing", "profile_retrieval", "review_retrieval",
      "token_refresh", "revoked_authorization", "permission_loss", "quota_rate_limit", "manual_fallback",
    ])
    for (const step of liveAcceptanceSteps) {
      expect(liveAcceptanceStepDescriptions[step].length, step).toBeGreaterThan(20)
    }
  })

  it("does not run in ordinary CI", () => {
    expect(liveAcceptanceGate({})).toEqual({
      runnable: false, reason: "acceptance_flag_missing", blockers: ["GOOGLE_LIVE_ACCEPTANCE_ENABLED"],
    })
    // The repository default: no Google variable is set anywhere.
    expect(liveAcceptanceGate(process.env).runnable).toBe(false)
  })

  it("requires the exact opt-in flag as well as every live condition", () => {
    for (const value of ["", "yes", "1", "TRUE"]) {
      expect(liveAcceptanceGate({ ...liveEnv, GOOGLE_LIVE_ACCEPTANCE_ENABLED: value }).runnable, value).toBe(false)
    }
    const partial = liveAcceptanceGate({ ...liveEnv, GOOGLE_BUSINESS_PROFILE_API_ENABLED: "" })
    expect(partial).toEqual({ runnable: false, reason: "live_conditions_unmet", blockers: ["api_disabled"] })
    expect(liveAcceptanceGate(liveEnv)).toEqual({ runnable: true })
  })

  it("skips without touching the provider when the gate is closed", async () => {
    const { provider, calls } = countingProvider()
    const result = await runLiveAcceptance({ env: {}, provider, run: async (_step, p) => { await p.listAccounts() } })
    expect(result).toEqual({ status: "skipped", reason: "acceptance_flag_missing", blockers: ["GOOGLE_LIVE_ACCEPTANCE_ENABLED"] })
    expect(calls()).toBe(0)
  })

  it("skips rather than passing when no live provider is supplied", async () => {
    const result = await runLiveAcceptance({ env: liveEnv })
    expect(result).toEqual({ status: "skipped", reason: "live_provider_unavailable", blockers: [] })
  })

  it("walks every step once the operator opens both gates", async () => {
    const { provider, calls } = countingProvider()
    const result = await runLiveAcceptance({ env: liveEnv, provider, run: async (_step, p) => { await p.listAccounts() } })
    expect(result).toEqual({ status: "completed", steps: [...liveAcceptanceSteps] })
    expect(calls()).toBe(liveAcceptanceSteps.length)
  })
})
