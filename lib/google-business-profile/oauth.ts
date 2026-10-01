import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import type { GoogleOAuthConfig } from "./config"

// 32 random bytes rendered base64url. Anything else is rejected before a
// database lookup happens.
export const oauthStateLength = 43
export const oauthStatePattern = /^[A-Za-z0-9_-]{43}$/
export const defaultStateTtlSeconds = 600

export type OAuthStateIssue = {
  // Sent to Google in the authorization URL. Never persisted.
  state: string
  // Persisted instead of the state itself, so a database reader cannot replay.
  stateHash: string
  expiresAt: string
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex")
}

export function issueOAuthState(input: {
  now: Date
  ttlSeconds?: number
  random?: (size: number) => Buffer
}): OAuthStateIssue {
  const random = input.random ?? randomBytes
  const state = random(32).toString("base64url")
  const ttl = input.ttlSeconds ?? defaultStateTtlSeconds
  return {
    state,
    stateHash: hashOAuthState(state),
    expiresAt: new Date(input.now.getTime() + ttl * 1000).toISOString(),
  }
}

export function authorizationUrl(config: GoogleOAuthConfig, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", config.scopes.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent")
  url.searchParams.set("include_granted_scopes", "false")
  return url.toString()
}

export type StoredOAuthState = {
  stateHash: string
  actorId: string
  // Hash of the session that began the connect, so a different session cannot
  // complete someone else's authorization.
  sessionBinding: string
  redirectUri: string
  expiresAt: string
  consumedAt: string | null
}

export type OAuthCallbackInput = {
  state?: string | null
  code?: string | null
  error?: string | null
  actorId: string
  sessionBinding: string
  redirectUri: string
  now: Date
}

export const oauthRejectionReasons = [
  "state_missing",
  "state_malformed",
  "state_unknown",
  "state_expired",
  "state_replayed",
  "context_mismatch",
  "redirect_mismatch",
  "code_missing",
] as const

export type OAuthRejectionReason = (typeof oauthRejectionReasons)[number]

export type OAuthCallbackOutcome =
  | { status: "cancelled"; reason: string }
  | { status: "rejected"; reason: OAuthRejectionReason }
  | { status: "accepted"; stateHash: string }

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

// Google only ever sends a small set of error codes on cancellation. Anything
// else is still treated as a cancellation rather than echoed back.
export function normaliseOAuthError(value: string): string {
  return value === "access_denied" ? "access_denied" : "authorization_failed"
}

// Pure callback validation. The caller supplies the stored row; this decides
// whether a token exchange may be attempted at all.
export function validateOAuthCallback(
  input: OAuthCallbackInput,
  stored: StoredOAuthState | null,
): OAuthCallbackOutcome {
  if (input.error) return { status: "cancelled", reason: normaliseOAuthError(input.error) }
  const state = input.state ?? ""
  if (!state) return { status: "rejected", reason: "state_missing" }
  if (!oauthStatePattern.test(state)) return { status: "rejected", reason: "state_malformed" }
  if (!stored) return { status: "rejected", reason: "state_unknown" }
  if (!sameSecret(hashOAuthState(state), stored.stateHash)) return { status: "rejected", reason: "state_unknown" }
  if (stored.consumedAt) return { status: "rejected", reason: "state_replayed" }
  if (Date.parse(stored.expiresAt) <= input.now.getTime()) return { status: "rejected", reason: "state_expired" }
  if (stored.actorId !== input.actorId) return { status: "rejected", reason: "context_mismatch" }
  if (!sameSecret(stored.sessionBinding, input.sessionBinding)) return { status: "rejected", reason: "context_mismatch" }
  // The redirect must match the one the authorization began with, exactly.
  if (stored.redirectUri !== input.redirectUri) return { status: "rejected", reason: "redirect_mismatch" }
  if (!input.code) return { status: "rejected", reason: "code_missing" }
  return { status: "accepted", stateHash: stored.stateHash }
}

export type ExchangedTokens = {
  accessToken: string
  refreshToken: string | null
  grantedScopes: string[]
  expiresAt: string
}

// Token exchange and revocation are abstracted so the live HTTP calls can be
// supplied later. No production implementation exists in this step.
export type GoogleTokenExchange = {
  exchange(input: { code: string; redirectUri: string }): Promise<ExchangedTokens>
  revoke(input: { refreshToken: string }): Promise<void>
}
