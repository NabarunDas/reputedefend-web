import { type ProviderMode, providerModes } from "./capability"

export type GoogleBusinessProfileEnv = Record<string, string | undefined>

// Live Google API access is an external dependency and stays off until the
// value is exactly "true". Unset, "yes", "1" and "TRUE" all remain disabled.
export function googleBusinessProfileApiEnabled(env: GoogleBusinessProfileEnv = process.env): boolean {
  return env.GOOGLE_BUSINESS_PROFILE_API_ENABLED === "true"
}

// Only the two production modes can ever be named. Any other value, including
// "mock", falls back to manual rather than failing open.
export function googleBusinessProfileMode(env: GoogleBusinessProfileEnv = process.env): ProviderMode {
  const value = env.GOOGLE_BUSINESS_PROFILE_PROVIDER
  return (providerModes as readonly string[]).includes(value ?? "") ? (value as ProviderMode) : "manual"
}

export type GoogleOAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

const requiredScopes = ["https://www.googleapis.com/auth/business.manage"]

function trimmed(value: string | undefined): string {
  return (value ?? "").trim()
}

// Returns the server-side OAuth configuration only when every part is present.
// Callers receive null rather than a partially populated object.
export function googleOAuthConfig(env: GoogleBusinessProfileEnv = process.env): GoogleOAuthConfig | null {
  const clientId = trimmed(env.GOOGLE_BUSINESS_PROFILE_CLIENT_ID)
  const clientSecret = trimmed(env.GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET)
  const redirectUri = trimmed(env.GOOGLE_BUSINESS_PROFILE_REDIRECT_URI)
  if (!clientId || !clientSecret || !redirectUri) return null
  if (!redirectUri.startsWith("https://")) return null
  return { clientId, clientSecret, redirectUri, scopes: [...requiredScopes] }
}

// Token ciphertext is useless without this key, which never reaches the
// database and is never returned through an RPC.
export function googleTokenEncryptionKey(env: GoogleBusinessProfileEnv = process.env): string | null {
  const key = trimmed(env.GOOGLE_BUSINESS_PROFILE_TOKEN_KEY)
  return key.length >= 32 ? key : null
}

export function googleTokenKeyVersion(env: GoogleBusinessProfileEnv = process.env): string {
  return trimmed(env.GOOGLE_BUSINESS_PROFILE_TOKEN_KEY_VERSION) || "v1"
}

// Live acceptance tests talk to the real Google API, so they need their own
// opt-in and must never be enabled by the ordinary API gate.
export function googleLiveAcceptanceEnabled(env: GoogleBusinessProfileEnv = process.env): boolean {
  return env.GOOGLE_LIVE_ACCEPTANCE_ENABLED === "true"
}

export type LiveConfiguration = {
  // True when configuration alone is complete. Configuration being complete is
  // necessary but never sufficient: an executable connection also needs code
  // that this module cannot see. See live-stack.ts.
  configured: boolean
  // Ordered list of unmet conditions. Safe to show an Admin.
  blockers: string[]
}

// The configuration half of live access. Nothing here asserts that a live
// connection can actually be executed, only that the operator supplied every
// value one would need.
export function googleLiveConfiguration(env: GoogleBusinessProfileEnv = process.env): LiveConfiguration {
  const blockers: string[] = []
  if (googleBusinessProfileMode(env) !== "google") blockers.push("provider_mode_manual")
  if (!googleBusinessProfileApiEnabled(env)) blockers.push("api_disabled")
  if (!googleOAuthConfig(env)) blockers.push("oauth_not_configured")
  if (!googleTokenEncryptionKey(env)) blockers.push("token_key_missing")
  return { configured: blockers.length === 0, blockers }
}
