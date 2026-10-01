import { describe, expect, it } from "vitest"
import {
  googleBusinessProfileApiEnabled,
  googleBusinessProfileMode,
  googleLiveAcceptanceEnabled,
  googleLiveReadiness,
  googleOAuthConfig,
  googleTokenEncryptionKey,
  googleTokenKeyVersion,
} from "./config"

const liveEnv = {
  GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
  GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true",
  GOOGLE_BUSINESS_PROFILE_CLIENT_ID: "client-id",
  GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "client-secret",
  GOOGLE_BUSINESS_PROFILE_REDIRECT_URI: "https://admin.example.com/api/integrations/google/callback",
  GOOGLE_BUSINESS_PROFILE_TOKEN_KEY: "0123456789abcdef0123456789abcdef",
}

describe("Google integration configuration gates", () => {
  it("enables the API only for the exact string true", () => {
    expect(googleBusinessProfileApiEnabled({})).toBe(false)
    for (const value of ["", "yes", "1", "TRUE", "True", " true", "true "]) {
      expect(googleBusinessProfileApiEnabled({ GOOGLE_BUSINESS_PROFILE_API_ENABLED: value }), value).toBe(false)
    }
    expect(googleBusinessProfileApiEnabled({ GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true" })).toBe(true)
  })

  it("defaults the provider mode to manual and refuses any unknown mode", () => {
    expect(googleBusinessProfileMode({})).toBe("manual")
    expect(googleBusinessProfileMode({ GOOGLE_BUSINESS_PROFILE_PROVIDER: "google" })).toBe("google")
    for (const value of ["mock", "MOCK", "fake", "test", "Google"]) {
      expect(googleBusinessProfileMode({ GOOGLE_BUSINESS_PROFILE_PROVIDER: value }), value).toBe("manual")
    }
  })

  it("returns OAuth configuration only when every part is present and https", () => {
    expect(googleOAuthConfig({})).toBeNull()
    expect(googleOAuthConfig({ ...liveEnv, GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "" })).toBeNull()
    expect(googleOAuthConfig({ ...liveEnv, GOOGLE_BUSINESS_PROFILE_REDIRECT_URI: "http://admin.example.com/cb" })).toBeNull()
    const config = googleOAuthConfig(liveEnv)
    expect(config?.scopes).toEqual(["https://www.googleapis.com/auth/business.manage"])
  })

  it("requires a long enough token key and defaults the key version", () => {
    expect(googleTokenEncryptionKey({})).toBeNull()
    expect(googleTokenEncryptionKey({ GOOGLE_BUSINESS_PROFILE_TOKEN_KEY: "short" })).toBeNull()
    expect(googleTokenEncryptionKey(liveEnv)).toBe(liveEnv.GOOGLE_BUSINESS_PROFILE_TOKEN_KEY)
    expect(googleTokenKeyVersion({})).toBe("v1")
    expect(googleTokenKeyVersion({ GOOGLE_BUSINESS_PROFILE_TOKEN_KEY_VERSION: "v2" })).toBe("v2")
  })

  it("reports every unmet live condition and only clears when all of them pass", () => {
    expect(googleLiveReadiness({})).toEqual({
      ready: false,
      blockers: ["provider_mode_manual", "api_disabled", "oauth_not_configured", "token_key_missing"],
    })
    expect(googleLiveReadiness({ ...liveEnv, GOOGLE_BUSINESS_PROFILE_API_ENABLED: "yes" })).toEqual({
      ready: false,
      blockers: ["api_disabled"],
    })
    expect(googleLiveReadiness(liveEnv)).toEqual({ ready: true, blockers: [] })
  })

  it("keeps live acceptance behind its own exact flag", () => {
    expect(googleLiveAcceptanceEnabled({})).toBe(false)
    expect(googleLiveAcceptanceEnabled(liveEnv)).toBe(false)
    for (const value of ["yes", "1", "TRUE"]) {
      expect(googleLiveAcceptanceEnabled({ GOOGLE_LIVE_ACCEPTANCE_ENABLED: value }), value).toBe(false)
    }
    expect(googleLiveAcceptanceEnabled({ GOOGLE_LIVE_ACCEPTANCE_ENABLED: "true" })).toBe(true)
  })

  it("defines no NEXT_PUBLIC Google variable", () => {
    const source = Object.keys(liveEnv).concat([
      "GOOGLE_BUSINESS_PROFILE_TOKEN_KEY_VERSION",
      "GOOGLE_LIVE_ACCEPTANCE_ENABLED",
    ])
    expect(source.filter(name => name.startsWith("NEXT_PUBLIC_"))).toEqual([])
  })
})
