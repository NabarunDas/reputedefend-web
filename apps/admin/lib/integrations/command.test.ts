import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "@/lib/auth/config"
import { issueOAuthState } from "../../../../lib/google-business-profile/oauth"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { googleCallbackOutcome, integrationCommand } from "./command"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const state = issueOAuthState({ now: new Date("2026-02-01T10:00:00.000Z") }).state

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/operations/integrations`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const liveEnv: Array<[string, string]> = [
  ["GOOGLE_BUSINESS_PROFILE_PROVIDER", "google"],
  ["GOOGLE_BUSINESS_PROFILE_API_ENABLED", "true"],
  ["GOOGLE_BUSINESS_PROFILE_CLIENT_ID", "client-id"],
  ["GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET", "client-secret"],
  ["GOOGLE_BUSINESS_PROFILE_REDIRECT_URI", "https://admin.example.com/api/integrations/google/callback"],
  ["GOOGLE_BUSINESS_PROFILE_TOKEN_KEY", "0123456789abcdef0123456789abcdef"],
]

function enableLive() {
  for (const [name, value] of liveEnv) vi.stubEnv(name, value)
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("integration command HTTP boundary", () => {
  it("requires session, Origin, JSON and a UUID idempotency key", async () => {
    const body = { provider: "google_business_profile", operation: "begin_connect", reason: "setup" }
    expect((await integrationCommand(req(body, { origin: "https://evil.example" }))).status).toBe(403)
    expect((await integrationCommand(req(body, { "content-type": "text/plain" }))).status).toBe(415)
    expect((await integrationCommand(req(body, { cookie: "" }))).status).toBe(401)
    expect((await integrationCommand(req(body, { "idempotency-key": "nope" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects unknown providers and operations", async () => {
    expect((await integrationCommand(req({ provider: "facebook", operation: "begin_connect" }))).status).toBe(400)
    expect((await integrationCommand(req({ provider: "google_business_profile", operation: "exchange_token" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("never lets a browser consume a state or store a connection", async () => {
    enableLive()
    for (const operation of ["consume_state", "store_connection", "record_fault"]) {
      expect((await integrationCommand(req({
        provider: "google_business_profile", operation, state, connectionId: key, version: 1,
      }))).status, operation).toBe(400)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("refuses every operation while the Google API gate is disabled", async () => {
    for (const operation of ["begin_connect", "cancel_connect", "revoke_connection", "disconnect_connection"]) {
      const response = await integrationCommand(req({
        provider: "google_business_profile",
        operation,
        state,
        connectionId: key,
        version: 1,
        reason: "setup",
      }))
      expect(response.status, operation).toBe(403)
      expect(await response.json(), operation).toMatchObject({
        status: "denied",
        reason: "google_api_disabled",
        message: "Google Business Profile connection is not enabled yet.",
      })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("stays disabled when only some live conditions are met", async () => {
    vi.stubEnv("GOOGLE_BUSINESS_PROFILE_PROVIDER", "google")
    vi.stubEnv("GOOGLE_BUSINESS_PROFILE_API_ENABLED", "true")
    const response = await integrationCommand(req({ provider: "google_business_profile", operation: "begin_connect" }))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ blockers: ["oauth_not_configured", "token_key_missing"] })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("validates the state format before anything reaches the database", async () => {
    enableLive()
    const response = await integrationCommand(req({
      provider: "google_business_profile", operation: "cancel_connect", state: "forged",
    }))
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("generates the OAuth state server-side and ignores anything the browser sent", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "success" })
    const response = await integrationCommand(req({
      provider: "google_business_profile",
      operation: "begin_connect",
      reason: "operator requested",
      stateHash: "0".repeat(64),
      redirectUri: "https://evil.example/steal",
      expiresAt: "2099-01-01T00:00:00.000Z",
      accessToken: "ya29.should-be-ignored",
      code: "authorization-code",
    }))
    expect(response.status).toBe(200)
    const [, args] = mocks.rpc.mock.calls[0]
    const payload = args.p_payload as Record<string, unknown>
    expect(args.p_operation).toBe("begin_connect")
    expect(payload.stateHash).not.toBe("0".repeat(64))
    expect(payload.stateHash).toMatch(/^[0-9a-f]{64}$/)
    expect(payload.redirectUri).toBe("https://admin.example.com/api/integrations/google/callback")
    expect(JSON.stringify(payload)).not.toMatch(/ya29\.|authorization-code|evil\.example/)
  })

  it("returns an authorization URL that carries the state but no client secret", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "success" })
    const body = await (await integrationCommand(req({
      provider: "google_business_profile", operation: "begin_connect",
    }))).json()
    const url = new URL(body.authorizationUrl)
    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.authorizationUrl).not.toContain("client-secret")
  })

  it("binds the state to the session without storing the session token", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "success" })
    await integrationCommand(req({ provider: "google_business_profile", operation: "begin_connect" }))
    const payload = mocks.rpc.mock.calls[0][1].p_payload as Record<string, unknown>
    expect(payload.sessionBinding).toMatch(/^[0-9a-f]{64}$/)
    expect(payload.sessionBinding).not.toBe("a".repeat(64))
  })

  it("requires a UUID and a record version before revoking", async () => {
    enableLive()
    expect((await integrationCommand(req({
      provider: "google_business_profile", operation: "revoke_connection", connectionId: "nope", version: 1,
    }))).status).toBe(400)
    expect((await integrationCommand(req({
      provider: "google_business_profile", operation: "revoke_connection", connectionId: key,
    }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("refuses to forward a response that somehow carried token material", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "success", refreshToken: "1//leak" })
    const response = await integrationCommand(req({ provider: "google_business_profile", operation: "begin_connect" }))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("1//leak")
  })

  it("maps reauth, conflict and denial onto safe messages", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    expect((await integrationCommand(req({ provider: "google_business_profile", operation: "begin_connect" }))).status).toBe(403)
    mocks.rpc.mockResolvedValue({ status: "conflict" })
    expect((await integrationCommand(req({ provider: "google_business_profile", operation: "revoke_connection", connectionId: key, version: 1 }))).status).toBe(409)
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "state_replayed" })
    const replay = await integrationCommand(req({ provider: "google_business_profile", operation: "cancel_connect", state }))
    expect(replay.status).toBe(403)
    expect(await replay.json()).toMatchObject({ message: "That authorization link was already used." })
  })
})

describe("OAuth callback", () => {
  const callbackUrl = (query: string) => new URL(`https://admin.example.com/api/integrations/google/callback${query}`)

  it("never exchanges a code while live integration is disabled", () => {
    const outcome = googleCallbackOutcome(callbackUrl(`?code=secret-code&state=${state}`), {})
    expect(outcome).toEqual({
      status: "disabled",
      reason: "google_api_disabled",
      message: "Google Business Profile connection is not enabled yet.",
    })
    expect(JSON.stringify(outcome)).not.toContain("secret-code")
  })

  it("rejects a missing, malformed or codeless callback once live conditions are met", () => {
    const env = Object.fromEntries(liveEnv)
    expect(googleCallbackOutcome(callbackUrl("?code=abc"), env)).toMatchObject({ reason: "state_missing" })
    expect(googleCallbackOutcome(callbackUrl("?code=abc&state=short"), env)).toMatchObject({ reason: "state_malformed" })
    expect(googleCallbackOutcome(callbackUrl(`?state=${state}`), env)).toMatchObject({ reason: "code_missing" })
  })

  it("only proceeds to state consumption with a well-formed state and code", () => {
    const env = Object.fromEntries(liveEnv)
    const outcome = googleCallbackOutcome(callbackUrl(`?code=abc&state=${state}`), env)
    expect(outcome.status).toBe("proceed")
    // The caller receives the hash, never the state Google sent back.
    expect(JSON.stringify(outcome)).not.toContain(state)
  })

  it("treats a denial as a cancellation without echoing the provider error", () => {
    const env = Object.fromEntries(liveEnv)
    expect(googleCallbackOutcome(callbackUrl("?error=access_denied"), env)).toMatchObject({
      status: "cancelled", reason: "access_denied",
    })
    const odd = googleCallbackOutcome(callbackUrl("?error=client_secret%20leaked"), env)
    expect(odd).toMatchObject({ reason: "authorization_failed" })
    expect(JSON.stringify(odd)).not.toContain("client_secret")
  })
})
