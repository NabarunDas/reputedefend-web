import { describe, expect, it } from "vitest"
import { googleOAuthConfig } from "./config"
import {
  authorizationUrl,
  hashOAuthState,
  isOAuthNormalisedReason,
  issueOAuthState,
  normaliseOAuthError,
  oauthNormalisedReasons,
  oauthStateLength,
  oauthStatePattern,
  oauthTerminalReasons,
  type StoredOAuthState,
  validateOAuthCallback,
} from "./oauth"

const config = googleOAuthConfig({
  GOOGLE_BUSINESS_PROFILE_CLIENT_ID: "client-id",
  GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "client-secret",
  GOOGLE_BUSINESS_PROFILE_REDIRECT_URI: "https://admin.example.com/api/integrations/google/callback",
})!

const now = new Date("2026-02-01T10:00:00.000Z")
const issued = issueOAuthState({ now })

function stored(overrides: Partial<StoredOAuthState> = {}): StoredOAuthState {
  return {
    stateHash: issued.stateHash,
    actorId: "actor-1",
    sessionBinding: "session-hash-1",
    redirectUri: config.redirectUri,
    expiresAt: issued.expiresAt,
    consumedAt: null,
    ...overrides,
  }
}

function callback(overrides: Record<string, unknown> = {}) {
  return {
    state: issued.state,
    code: "authorization-code",
    error: null,
    actorId: "actor-1",
    sessionBinding: "session-hash-1",
    redirectUri: config.redirectUri,
    now,
    ...overrides,
  }
}

describe("OAuth state", () => {
  it("issues a cryptographically random single-use state and stores only its hash", () => {
    const first = issueOAuthState({ now })
    const second = issueOAuthState({ now })
    expect(first.state).not.toBe(second.state)
    expect(first.state).toHaveLength(oauthStateLength)
    expect(oauthStatePattern.test(first.state)).toBe(true)
    expect(first.stateHash).toBe(hashOAuthState(first.state))
    expect(first.stateHash).not.toContain(first.state)
    expect(Date.parse(first.expiresAt) - now.getTime()).toBe(600_000)
  })

  it("builds an authorization URL that carries no secret", () => {
    const url = new URL(authorizationUrl(config, issued.state))
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(url.searchParams.get("state")).toBe(issued.state)
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri)
    expect(url.toString()).not.toContain(config.clientSecret)
  })
})

describe("OAuth callback validation", () => {
  it("accepts a correct first-time callback", () => {
    expect(validateOAuthCallback(callback(), stored())).toEqual({ status: "accepted", stateHash: issued.stateHash })
  })

  it("rejects a forged state", () => {
    const forged = issueOAuthState({ now }).state
    expect(validateOAuthCallback(callback({ state: forged }), stored())).toEqual({
      status: "rejected", reason: "state_unknown",
    })
  })

  it("rejects a missing, malformed or unknown state", () => {
    expect(validateOAuthCallback(callback({ state: "" }), stored())).toEqual({ status: "rejected", reason: "state_missing" })
    expect(validateOAuthCallback(callback({ state: "not-a-state" }), stored())).toEqual({ status: "rejected", reason: "state_malformed" })
    expect(validateOAuthCallback(callback(), null)).toEqual({ status: "rejected", reason: "state_unknown" })
  })

  it("rejects an expired state", () => {
    const outcome = validateOAuthCallback(callback({ now: new Date(Date.parse(issued.expiresAt) + 1) }), stored())
    expect(outcome).toEqual({ status: "rejected", reason: "state_expired" })
  })

  it("rejects a replayed state before anything else can use it", () => {
    const outcome = validateOAuthCallback(callback(), stored({ consumedAt: "2026-02-01T10:01:00.000Z" }))
    expect(outcome).toEqual({ status: "rejected", reason: "state_replayed" })
  })

  it("rejects a callback that did not start in this authenticated context", () => {
    expect(validateOAuthCallback(callback({ actorId: "actor-2" }), stored())).toEqual({
      status: "rejected", reason: "context_mismatch",
    })
    expect(validateOAuthCallback(callback({ sessionBinding: "session-hash-2" }), stored())).toEqual({
      status: "rejected", reason: "context_mismatch",
    })
  })

  it("requires the exact redirect URI the authorization began with", () => {
    const outcome = validateOAuthCallback(
      callback({ redirectUri: "https://admin.example.com/api/integrations/google/callback/" }),
      stored(),
    )
    expect(outcome).toEqual({ status: "rejected", reason: "redirect_mismatch" })
  })

  it("treats a denial as a cancellation and never echoes the provider error", () => {
    expect(validateOAuthCallback(callback({ error: "access_denied" }), stored())).toEqual({
      status: "cancelled", reason: "access_denied",
    })
    expect(validateOAuthCallback(callback({ error: "server_error: client_secret leaked" }), stored())).toEqual({
      status: "cancelled", reason: "authorization_failed",
    })
    expect(normaliseOAuthError("anything else")).toBe("authorization_failed")
  })

  it("refuses a callback with no authorization code", () => {
    expect(validateOAuthCallback(callback({ code: null }), stored())).toEqual({ status: "rejected", reason: "code_missing" })
  })

  it("classifies every provider error onto the fixed terminal set", () => {
    for (const raw of [
      "access_denied",
      "server_error",
      "ya29.a-leaked-token",
      "client_secret=GOCSPX-abcdefghijklmnop",
      '{"error":{"message":"a long provider body"}}',
      "y".repeat(5000),
    ]) {
      const reason = normaliseOAuthError(raw)
      expect(oauthTerminalReasons, raw).toContain(reason)
      expect(raw.startsWith(reason) || reason === "authorization_failed", raw).toBe(true)
    }
  })

  it("recognises only the classifications it defines", () => {
    for (const reason of oauthNormalisedReasons) expect(isOAuthNormalisedReason(reason), reason).toBe(true)
    for (const reason of ["cancelled", "Google said no", "ya29.x", "", null, 7]) {
      expect(isOAuthNormalisedReason(reason), String(reason)).toBe(false)
    }
  })
})
