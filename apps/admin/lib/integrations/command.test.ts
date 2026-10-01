import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "@/lib/auth/config"
import { issueOAuthState } from "../../../../lib/google-business-profile/oauth"
import type { GoogleLiveStack } from "../../../../lib/google-business-profile/live-stack"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { googleCallbackOutcome, googleCallbackResponse, integrationCommand } from "./command"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const state = issueOAuthState({ now: new Date("2026-02-01T10:00:00.000Z") }).state
const redirectUri = "https://admin.example.com/api/integrations/google/callback"

// Stands in for the token exchange and transport a future activation step
// ships. Supplying it is the only way to open the execution gate, and no
// environment variable can do it.
const implementedStack: GoogleLiveStack = {
  transport: { async get() { return { status: 200, body: {} } } },
  exchange: {
    async exchange() {
      return { accessToken: "", refreshToken: null, grantedScopes: [], expiresAt: "" }
    },
    async revoke() {},
  },
}

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

function callback(query: string, cookie = `${sessionCookie}=${"a".repeat(64)}`) {
  return new NextRequest(`${redirectUri}${query}`, { headers: { cookie } })
}

const liveEnv: Array<[string, string]> = [
  ["GOOGLE_BUSINESS_PROFILE_PROVIDER", "google"],
  ["GOOGLE_BUSINESS_PROFILE_API_ENABLED", "true"],
  ["GOOGLE_BUSINESS_PROFILE_CLIENT_ID", "client-id"],
  ["GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET", "client-secret"],
  ["GOOGLE_BUSINESS_PROFILE_REDIRECT_URI", redirectUri],
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
      }), implementedStack)).status, operation).toBe(400)
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
    expect(await response.json()).toMatchObject({
      blockers: ["oauth_not_configured", "token_key_missing", "connection_not_implemented"],
    })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("validates the state format before anything reaches the database", async () => {
    enableLive()
    const response = await integrationCommand(req({
      provider: "google_business_profile", operation: "cancel_connect", state: "forged",
    }), implementedStack)
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
    }), implementedStack)
    expect(response.status).toBe(200)
    const [, args] = mocks.rpc.mock.calls[0]
    const payload = args.p_payload as Record<string, unknown>
    expect(args.p_operation).toBe("begin_connect")
    expect(payload.stateHash).not.toBe("0".repeat(64))
    expect(payload.stateHash).toMatch(/^[0-9a-f]{64}$/)
    expect(payload.redirectUri).toBe(redirectUri)
    expect(JSON.stringify(payload)).not.toMatch(/ya29\.|authorization-code|evil\.example/)
  })

  it("returns an authorization URL that carries the state but no client secret", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "success" })
    const body = await (await integrationCommand(req({
      provider: "google_business_profile", operation: "begin_connect",
    }), implementedStack)).json()
    const url = new URL(body.authorizationUrl)
    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.authorizationUrl).not.toContain("client-secret")
  })

  it("binds the state to the session without storing the session token", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "success" })
    await integrationCommand(req({ provider: "google_business_profile", operation: "begin_connect" }), implementedStack)
    const payload = mocks.rpc.mock.calls[0][1].p_payload as Record<string, unknown>
    expect(payload.sessionBinding).toMatch(/^[0-9a-f]{64}$/)
    expect(payload.sessionBinding).not.toBe("a".repeat(64))
  })

  it("requires a UUID and a record version before revoking", async () => {
    enableLive()
    expect((await integrationCommand(req({
      provider: "google_business_profile", operation: "revoke_connection", connectionId: "nope", version: 1,
    }), implementedStack)).status).toBe(400)
    expect((await integrationCommand(req({
      provider: "google_business_profile", operation: "revoke_connection", connectionId: key,
    }), implementedStack)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("refuses to forward a response that somehow carried token material", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "success", refreshToken: "1//leak" })
    const response = await integrationCommand(req({ provider: "google_business_profile", operation: "begin_connect" }), implementedStack)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("1//leak")
  })

  it("maps reauth, conflict and denial onto safe messages", async () => {
    enableLive()
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    expect((await integrationCommand(req({ provider: "google_business_profile", operation: "begin_connect" }), implementedStack)).status).toBe(403)
    mocks.rpc.mockResolvedValue({ status: "conflict" })
    expect((await integrationCommand(req({ provider: "google_business_profile", operation: "revoke_connection", connectionId: key, version: 1 }), implementedStack)).status).toBe(409)
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "state_replayed" })
    const replay = await integrationCommand(req({ provider: "google_business_profile", operation: "cancel_connect", state }), implementedStack)
    expect(replay.status).toBe(403)
    expect(await replay.json()).toMatchObject({ message: "That authorization link was already used." })
  })
})

// Findings A to D. The gate the review asked for is a code fact, so the whole
// point is that configuration cannot reach past it.
describe("Step 21 keeps the connection flow unexecutable", () => {
  it("refuses begin_connect with every Google environment variable set", async () => {
    enableLive()
    const response = await integrationCommand(req({
      provider: "google_business_profile", operation: "begin_connect", customerId: key,
    }))
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body).toMatchObject({
      status: "denied",
      reason: "google_api_disabled",
      message: "Google Business Profile connection is not enabled yet.",
    })
    // C: no authorization URL anywhere in the answer.
    expect(body.authorizationUrl).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain("accounts.google.com")
    // D: nothing reached the database, so no state row could be created.
    expect(mocks.rpc).not.toHaveBeenCalled()
    // The blocker names the real reason rather than a missing setting.
    expect(body.blockers).toEqual(["connection_not_implemented"])
  })

  it("refuses every browser operation by direct POST, not only in the UI", async () => {
    enableLive()
    for (const operation of ["begin_connect", "cancel_connect", "revoke_connection", "disconnect_connection"]) {
      const response = await integrationCommand(req({
        provider: "google_business_profile", operation, state, connectionId: key, version: 1,
      }))
      expect(response.status, operation).toBe(403)
      expect((await response.json()).blockers, operation).toContain("connection_not_implemented")
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("refuses the callback route itself while nothing can be exchanged", async () => {
    enableLive()
    const response = await googleCallbackResponse(callback(`?code=4/0Asecret-authorization-code&state=${state}`))
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(text).toContain("Google Business Profile connection is not enabled yet.")
    expect(text).not.toContain("secret-authorization-code")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe("OAuth callback planning", () => {
  const callbackUrl = (query: string) => new URL(`${redirectUri}${query}`)
  const env = Object.fromEntries(liveEnv)

  it("never exchanges a code while the connection flow is unimplemented", () => {
    const outcome = googleCallbackOutcome(callbackUrl(`?code=secret-code&state=${state}`), {})
    expect(outcome).toEqual({
      status: "disabled",
      reason: "google_api_disabled",
      message: "Google Business Profile connection is not enabled yet.",
    })
    expect(JSON.stringify(outcome)).not.toContain("secret-code")
  })

  it("refuses a missing or malformed state without touching the database", () => {
    expect(googleCallbackOutcome(callbackUrl("?code=abc"), env, implementedStack))
      .toMatchObject({ status: "rejected", reason: "state_missing" })
    expect(googleCallbackOutcome(callbackUrl("?code=abc&state=short"), env, implementedStack))
      .toMatchObject({ status: "rejected", reason: "state_malformed" })
    // An error with no identifiable attempt is refused the same way, because
    // there is no trustworthy row to consume.
    expect(googleCallbackOutcome(callbackUrl("?error=access_denied"), env, implementedStack))
      .toMatchObject({ status: "rejected", reason: "state_missing" })
  })

  it("sends every terminal outcome carrying a valid state on to be consumed", () => {
    for (const [query, terminalReason] of [
      [`?code=abc&state=${state}`, null],
      [`?state=${state}`, "code_missing"],
      [`?state=${state}&error=access_denied`, "access_denied"],
      [`?state=${state}&error=server_error`, "authorization_failed"],
    ] as const) {
      const outcome = googleCallbackOutcome(callbackUrl(query), env, implementedStack)
      expect(outcome, query).toMatchObject({ status: "consume", terminalReason })
      // The caller receives the hash, never the state Google sent back.
      expect(JSON.stringify(outcome), query).not.toContain(state)
    }
  })

  it("collapses any provider error onto a fixed classification", () => {
    for (const raw of [
      "client_secret GOCSPX-abcdefghijklmnop",
      "ya29.a-leaked-access-token",
      "x".repeat(4000),
      '{"error":{"message":"the refresh token 1//0gLongLookingRefreshValue failed"}}',
    ]) {
      const outcome = googleCallbackOutcome(
        callbackUrl(`?state=${state}&error=${encodeURIComponent(raw)}`), env, implementedStack,
      )
      expect(outcome, raw).toMatchObject({ status: "consume", terminalReason: "authorization_failed" })
      const dump = JSON.stringify(outcome)
      expect(dump, raw).not.toMatch(/ya29\.|1\/\/|GOCSPX-|client_secret|xxxx/)
    }
  })
})

// Finding 2 tested against the route itself rather than the pure validator.
describe("OAuth callback consumption", () => {
  function payloadOf(call: number) {
    return mocks.rpc.mock.calls[call][1].p_payload as Record<string, unknown>
  }

  beforeEach(() => enableLive())

  it("consumes the attempt on denial, on a missing code and on success alike", async () => {
    for (const [query, reason, status] of [
      [`?state=${state}&error=access_denied`, "access_denied", "cancelled"],
      [`?state=${state}`, "code_missing", "cancelled"],
      [`?state=${state}&code=abc`, null, "accepted"],
    ] as const) {
      mocks.rpc.mockReset()
      mocks.rpc.mockResolvedValue({ status, reason: reason ?? undefined })
      const response = await googleCallbackResponse(callback(query), implementedStack)
      expect(response.status, query).toBe(200)
      expect(mocks.rpc, query).toHaveBeenCalledTimes(1)
      const payload = payloadOf(0)
      expect(payload.reason, query).toBe(reason)
      expect(payload.stateHash, query).toMatch(/^[0-9a-f]{64}$/)
      expect(payload.redirectUri, query).toBe(redirectUri)
      expect(payload.sessionBinding, query).toMatch(/^[0-9a-f]{64}$/)
      expect(mocks.rpc.mock.calls[0][1].p_operation, query).toBe("consume_state")
    }
  })

  it("reports a replayed callback as already used and asks the database again", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "cancelled", reason: "access_denied" })
    mocks.rpc.mockResolvedValueOnce({ status: "rejected", reason: "state_replayed" })
    const first = await googleCallbackResponse(callback(`?state=${state}&error=access_denied`), implementedStack)
    expect(first.status).toBe(200)
    const second = await googleCallbackResponse(callback(`?state=${state}&error=access_denied`), implementedStack)
    expect(second.status).toBe(403)
    expect(await second.json()).toMatchObject({
      status: "rejected", reason: "state_replayed", message: "That authorization link was already used.",
    })
  })

  it("refuses the callback without a session rather than consuming by guess", async () => {
    const response = await googleCallbackResponse(callback(`?state=${state}&code=abc`, ""), implementedStack)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ status: "rejected", reason: "context_mismatch" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("sends each session's own binding so the database can tell them apart", async () => {
    mocks.rpc.mockResolvedValue({ status: "rejected", reason: "context_mismatch" })
    const query = `?state=${state}&error=access_denied`
    const other = await googleCallbackResponse(
      callback(query, `${sessionCookie}=${"b".repeat(64)}`), implementedStack,
    )
    expect(other.status).toBe(403)
    expect(await other.json()).toMatchObject({
      status: "rejected", reason: "context_mismatch",
      message: "That authorization did not start in this session.",
    })
    await googleCallbackResponse(callback(query), implementedStack)
    expect(payloadOf(1).sessionBinding).not.toBe(payloadOf(0).sessionBinding)
  })

  it("never forwards a reason the server did not define", async () => {
    mocks.rpc.mockResolvedValue({ status: "rejected", reason: "ya29.leaked-provider-detail" })
    const response = await googleCallbackResponse(callback(`?state=${state}&error=access_denied`), implementedStack)
    const body = await response.text()
    expect(body).not.toContain("ya29.")
    expect(JSON.parse(body).reason).toBeUndefined()
  })
})

// Finding H. Nothing a browser writes may become a persisted reason.
describe("cancellation reasons are server-defined", () => {
  beforeEach(() => enableLive())

  it("sends the one fixed reason whatever the browser asked for", async () => {
    mocks.rpc.mockResolvedValue({ status: "cancelled", reason: "cancelled_by_admin" })
    for (const reason of [
      "ya29.an-access-token",
      "1//0gARefreshTokenLookingValue",
      "authorization-code",
      "client_secret=GOCSPX-abcdefghijklmnop",
      "z".repeat(5000),
    ]) {
      mocks.rpc.mockClear()
      const response = await integrationCommand(req({
        provider: "google_business_profile", operation: "cancel_connect", state, reason,
      }), implementedStack)
      expect(response.status, reason).toBe(200)
      const payload = mocks.rpc.mock.calls[0][1].p_payload as Record<string, unknown>
      expect(payload.reason, reason).toBe("cancelled_by_admin")
      expect(JSON.stringify(payload), reason).not.toMatch(/ya29\.|1\/\/|authorization-code|GOCSPX-|zzzz/)
      expect(await response.text(), reason).not.toMatch(/ya29\.|GOCSPX-|zzzz/)
    }
  })

  it("drops a browser reason from a revoke payload entirely", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    await integrationCommand(req({
      provider: "google_business_profile", operation: "revoke_connection",
      connectionId: key, version: 1, reason: "ya29.leaked",
    }), implementedStack)
    const payload = mocks.rpc.mock.calls[0][1].p_payload as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(["id", "version"])
  })
})
