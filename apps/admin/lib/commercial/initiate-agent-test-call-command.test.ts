import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sessionFromToken: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  sessionFromToken: (token: string | undefined) => mocks.sessionFromToken(token),
}))
import { POST } from "@/app/api/commercial/initiate-agent-test-call/route"
import { resetAgentTestLookups } from "@/lib/commercial/agent-test-call-provider"
import { readFileSync } from "node:fs"

const operator = "11111111-1111-4111-8111-111111111111"

function freshSession(createdAt = new Date().toISOString()) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: operator,
    createdAt,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }
}

function installRpc(options: { session?: unknown; preflight?: unknown; prepare?: unknown; bind?: unknown } = {}) {
  mocks.sessionFromToken.mockResolvedValue(options.session === undefined ? freshSession() : options.session)
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_session_v1") return options.session === undefined ? freshSession() : options.session
    if (name === "admin_commercial_agent_test_preflight_v1") return options.preflight ?? { status: "eligible" }
    if (name === "admin_commercial_prepare_agent_test_call_v1") return options.prepare ?? {
      status: "prepared",
      intentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      sessionRef: "TS-26-ABCDEF01",
      agentRef: "agent-0021",
      agentVersion: 4,
      environment: "dev",
      configurationVersion: 1,
    }
    if (name === "admin_commercial_bind_agent_test_call_v1") return options.bind ?? {
      status: "success",
      callId: "call_created_01",
      sessionRef: "TS-26-ABCDEF01",
      agentRef: "agent-0021",
      agentVersion: 4,
      provisionState: "TEST_REQUIRED",
      forwardingVerified: false,
      testPassed: false,
    }
    throw new Error(name)
  })
}

function prepareCall() {
  return mocks.rpc.mock.calls.filter(call => call[0] === "admin_commercial_prepare_agent_test_call_v1").at(-1)
}

function bindCall() {
  return mocks.rpc.mock.calls.filter(call => call[0] === "admin_commercial_bind_agent_test_call_v1").at(-1)
}

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const body = {
  subscriptionId: "a033a000-0000-4000-8000-000000000031",
  version: 4,
  customerId: "a033a000-0000-4000-8000-0000000000a1",
  businessId: "a033a000-0000-4000-8000-000000000011",
  onboardingRequestId: "a033a000-0000-4000-8000-000000000041",
  onboardingVersion: 2,
  locationId: "a033a000-0000-4000-8000-000000000021",
  preferenceVersion: 1,
  provisionVersion: 3,
  configurationVersion: 1,
  allocationId: "a033a000-0000-4000-8000-000000000071",
  allocationVersion: 1,
  instructionId: "a033a000-0000-4000-8000-000000000081",
  instructionVersion: 1,
}

function providerResponse(patch: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    call_id: "call_created_01",
    access_token: "join-token-value-123456",
    transport: "gateway",
    ice_servers: [{ urls: "turn:example.invalid", username: "turn-user", credential: "turn-secret" }],
    expires_at: Date.parse("2026-11-06T20:00:00.000Z"),
    ...patch,
  }), { status: 201, headers: { "content-type": "application/json" } })
}

function req(payload: unknown = body, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/commercial/initiate-agent-test-call`, {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "true")
  vi.stubEnv("ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED", "true")
  vi.stubEnv("VERCEL_ENV", "development")
  vi.stubEnv("TELLOYA_RETELL_DEV_API_KEY", "test-key-value")
  mocks.rpc.mockReset()
  resetAgentTestLookups()
  installRpc()
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("start controlled receptionist test", () => {
  it("stays closed while either flag is off and does not call the provider or the database", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED", "")
    const closed = await POST(req())
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({ message: "Start controlled receptionist test is not switched on." })
    vi.stubEnv("ADMIN_COMMERCIAL_INITIATE_AGENT_TEST_CALL_ENABLED", "true")
    vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "")
    const queueClosed = await POST(req())
    expect(queueClosed.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a typed call reference before the provider and the database", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req({ ...body, callId: "call_typed_01" }))
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.message).toContain("cannot be supplied")
    expect(JSON.stringify(json)).not.toContain("call_typed_01")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("checks the recent sign-in before the provider call", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    installRpc({ session: freshSession(new Date(Date.now() - 31 * 60 * 1000).toISOString()) })
    const response = await POST(req())
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(prepareCall()).toBeUndefined()
    expect(mocks.rpc.mock.calls.map(call => call[0])).not.toContain("admin_commercial_agent_test_preflight_v1")
  })

  it("does not open a call when the lane credential is absent", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("TELLOYA_RETELL_DEV_API_KEY", "")
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(prepareCall()).toBeUndefined()
  })

  it("creates a v3 web call from the stored agent version and binds only the returned call id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerResponse())
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toMatchObject({
      callId: "call_created_01",
      agentRef: "agent-0021",
      agentVersion: 4,
      accessToken: "join-token-value-123456",
      transport: "gateway",
      forwardingVerified: false,
      testPassed: false,
    })
    expect(json.message).toContain("Telephone forwarding is not verified")
    expect(JSON.stringify(json)).not.toContain("turn-secret")
    expect(JSON.stringify(json)).not.toContain("ice_servers")
    const called = fetchMock.mock.calls[0]
    expect(String(called[0])).toBe("https://api.retellai.com/v3/create-web-call")
    expect(called[1].method).toBe("POST")
    expect(called[1].headers.authorization).toBe("Bearer test-key-value")
    expect(JSON.parse(called[1].body as string)).toEqual({ agent_id: "agent-0021", agent_version: 4 })
    expect(called[1].body).not.toContain("metadata")
    expect(called[1].body).not.toContain("latest")
    const bound = bindCall()?.[1].p_payload
    expect(bound).toMatchObject({
      providerCallId: "call_created_01",
      reportedAgentId: "agent-0021",
      reportedAgentVersion: 4,
      callType: "web_call",
    })
    expect(bound).not.toHaveProperty("accessToken")
    expect(bound).not.toHaveProperty("access_token")
    expect(JSON.stringify(bound)).not.toContain("join-token-value")
    expect(prepareCall()?.[1].p_payload).not.toHaveProperty("providerCallId")
  })

  it("returns a recorded call without a second provider request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    installRpc({
      prepare: {
        status: "bound",
        callId: "call_created_01",
        sessionRef: "TS-26-ABCDEF01",
        agentRef: "agent-0021",
        agentVersion: 4,
        forwardingVerified: false,
        testPassed: false,
      },
    })
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.callId).toBe("call_created_01")
    expect(json.accessToken).toBeUndefined()
    expect(json.message).toContain("already recorded")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(bindCall()).toBeUndefined()
  })

  it("keeps an uncertain provider response unbound", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")))
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(bindCall()).toBeUndefined()
    for (const status of [408, 429, 503]) {
      resetAgentTestLookups()
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status })))
      const again = await POST(req())
      expect(again.status).toBe(503)
      expect(bindCall()).toBeUndefined()
    }
  })

  it("does not bind a rejected or non-web provider response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 422 })))
    const rejected = await POST(req())
    expect(rejected.status).toBe(502)
    expect(bindCall()).toBeUndefined()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse({ transport: "phone" })))
    const wrongTransport = await POST(req())
    expect(wrongTransport.status).toBe(502)
    expect(bindCall()).toBeUndefined()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse({ agent_id: "agent-other" })))
    const wrongAgent = await POST(req())
    expect(wrongAgent.status).toBe(502)
    expect(bindCall()).toBeUndefined()
  })

  it("does not call the phone-call endpoint or read a client call id", () => {
    const source = readFileSync(new URL("./initiate-agent-test-call.ts", import.meta.url), "utf8")
    const provider = readFileSync(new URL("./agent-test-call-provider.ts", import.meta.url), "utf8")
    expect(source).not.toContain("create-phone-call")
    expect(source).not.toContain("body.callId")
    expect(provider).toContain("https://api.retellai.com/v3/create-web-call")
    expect(provider).not.toContain("create-phone-call")
    expect(provider).not.toContain("/v2/create-web-call")
  })
})
