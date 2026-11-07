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

function installRpc(options: { session?: unknown; preflight?: unknown; prepare?: unknown; claim?: unknown; record?: unknown; bind?: unknown } = {}) {
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
    if (name === "admin_commercial_claim_agent_test_creation_v1") return options.claim ?? {
      status: "claimed",
      attemptState: "CREATION_IN_PROGRESS",
      agentRef: "agent-0021",
      agentVersion: 4,
    }
    if (name === "admin_commercial_record_agent_test_creation_v1") return options.record ?? {
      status: "recorded",
      attemptState: "PROVIDER_CREATED",
    }
    if (name === "admin_commercial_bind_agent_test_call_v1") return options.bind ?? {
      status: "success",
      callId: "call_created_01",
      sessionRef: "TS-26-ABCDEF01",
      agentRef: "agent-0021",
      agentVersion: 4,
      accessToken: "stored-token-should-not-leak",
      iceServers: [{ urls: "stun:stored.invalid", credential: "stored-ice" }],
      maxDurationSeconds: 600,
      providerConfirmedAgent: false,
      providerConfirmedVersion: false,
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

function claimCall() {
  return mocks.rpc.mock.calls.filter(call => call[0] === "admin_commercial_claim_agent_test_creation_v1")
}

function recordCall() {
  return mocks.rpc.mock.calls.filter(call => call[0] === "admin_commercial_record_agent_test_creation_v1").at(-1)
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
  confirmedCharge: true,
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

function durationResponse(patch: Record<string, unknown> = {}, status = 200) {
  return new Response(JSON.stringify({
    agent_id: "agent-0021",
    version: 4,
    max_call_duration_ms: 300_000,
    ...patch,
  }), { status, headers: { "content-type": "application/json" } })
}

function fetchWithDuration(create: () => Response | Promise<Response>) {
  return vi.fn(async (url: string, _init: RequestInit) => {
    void _init
    if (String(url).includes("/get-agent/")) return durationResponse()
    return create()
  })
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

  it("requires an explicit charge confirmation before any database or provider call", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const { confirmedCharge, ...unconfirmed } = body
    void confirmedCharge
    const response = await POST(req(unconfirmed))
    expect(response.status).toBe(400)
    expect((await response.json()).message).toContain("provider charge")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("creates a v3 web call once from the stored agent version and returns connection fields only after binding", async () => {
    const fetchMock = fetchWithDuration(() => providerResponse())
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
      iceServers: [{ urls: "turn:example.invalid", username: "turn-user", credential: "turn-secret" }],
      maxDurationSeconds: 600,
      providerConfirmedAgent: false,
      providerConfirmedVersion: false,
      forwardingVerified: false,
      testPassed: false,
    })
    expect(json.message).toContain("Telephone forwarding is not verified")
    expect(JSON.stringify(json)).not.toContain("stored-token-should-not-leak")
    expect(JSON.stringify(json)).not.toContain("stored-ice")
    expect(JSON.stringify(json)).not.toContain("ice_servers")
    const durationCall = fetchMock.mock.calls.find(call => String(call[0]).includes("/get-agent/"))
    const called = fetchMock.mock.calls.find(call => String(call[0]).includes("/v3/create-web-call"))
    expect(String(durationCall?.[0])).toBe("https://api.retellai.com/get-agent/agent-0021?version=4")
    expect(String(durationCall?.[0])).not.toContain("latest")
    expect(fetchMock.mock.calls.findIndex(call => String(call[0]).includes("/get-agent/"))).toBeLessThan(
      fetchMock.mock.calls.findIndex(call => String(call[0]).includes("/v3/create-web-call")),
    )
    if (!called) throw new Error("create was not called")
    expect(String(called[0])).toBe("https://api.retellai.com/v3/create-web-call")
    expect(called[1].method).toBe("POST")
    const headers = new Headers(called[1].headers)
    expect(headers.get("authorization")).toBe("Bearer test-key-value")
    expect(JSON.parse(String(called[1].body))).toEqual({ agent_id: "agent-0021", agent_version: 4 })
    expect(String(called[1].body)).not.toContain("metadata")
    expect(String(called[1].body)).not.toContain("latest")
    expect(claimCall()).toHaveLength(1)
    expect(mocks.rpc.mock.calls.findIndex(call => call[0] === "admin_commercial_claim_agent_test_creation_v1")).toBeLessThan(
      mocks.rpc.mock.calls.length,
    )
    const recorded = recordCall()?.[1].p_payload
    expect(recorded).toMatchObject({
      outcome: "created",
      providerCallId: "call_created_01",
      transport: "gateway",
      echoedAgentId: null,
      echoedAgentVersion: null,
    })
    expect(recorded).not.toHaveProperty("connectionToken")
    expect(recorded).not.toHaveProperty("iceServers")
    expect(recorded).not.toHaveProperty("accessToken")
    expect(JSON.stringify(recorded)).not.toContain("join-token-value")
    expect(JSON.stringify(recorded)).not.toContain("turn-secret")
    const bound = bindCall()?.[1].p_payload
    expect(bound).toMatchObject({ confirmedCharge: true, locationId: body.locationId })
    expect(bound).not.toHaveProperty("providerCallId")
    expect(bound).not.toHaveProperty("accessToken")
    expect(bound).not.toHaveProperty("connectionToken")
    expect(JSON.stringify(bound)).not.toContain("join-token-value")
    expect(prepareCall()?.[1].p_payload).toMatchObject({ confirmedCharge: true })
    expect(prepareCall()?.[1].p_payload).not.toHaveProperty("providerCallId")
  })

  it("returns reconciliation without a second provider request when the browser response was lost", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    installRpc({
      prepare: {
        status: "bound",
        callId: "call_created_01",
        sessionRef: "TS-26-ABCDEF01",
        agentRef: "agent-0021",
        agentVersion: 4,
        accessToken: "join-token-value-123456",
        transport: "gateway",
        iceServers: [{ urls: "stun:example.invalid", credential: "turn-secret" }],
        expiresAt: "2026-11-06T20:00:00.000Z",
        maxDurationSeconds: 600,
        providerConfirmedAgent: false,
        providerConfirmedVersion: false,
        forwardingVerified: false,
        testPassed: false,
      },
    })
    const response = await POST(req())
    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json.status).toBe("reconciliation")
    expect(json.callId).toBe("call_created_01")
    expect(json.accessToken).toBeUndefined()
    expect(json.iceServers).toBeUndefined()
    expect(JSON.stringify(json)).not.toContain("join-token-value")
    expect(JSON.stringify(json)).not.toContain("turn-secret")
    expect(json.message).toContain("cannot be issued again")
    expect(json.message).toContain("Do not start another provider call")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(bindCall()).toBeUndefined()
    expect(claimCall()).toHaveLength(0)
  })

  it("does not create another provider call after an uncertain response for the same idempotency key", async () => {
    let fetches = 0
    let phase = "prepared"
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_commercial_agent_test_preflight_v1") return { status: "eligible" }
      if (name === "admin_commercial_prepare_agent_test_call_v1") {
        return phase === "prepared"
          ? { status: "prepared", agentRef: "agent-0021", agentVersion: 4 }
          : { status: "reconciliation", attemptState: "REQUIRES_RECONCILIATION" }
      }
      if (name === "admin_commercial_claim_agent_test_creation_v1") return { status: "claimed", agentRef: "agent-0021", agentVersion: 4 }
      if (name === "admin_commercial_record_agent_test_creation_v1") {
        phase = "reconciliation"
        return { status: "recorded", attemptState: "REQUIRES_RECONCILIATION" }
      }
      throw new Error(name)
    })
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/get-agent/")) return durationResponse()
      fetches += 1
      throw new Error("network")
    }))
    const first = await POST(req())
    expect(first.status).toBe(503)
    const firstBody = await first.json()
    expect(firstBody.message).toContain("Do not start another one")
    expect(firstBody.message).not.toContain("Try the same action again")
    const second = await POST(req())
    expect(second.status).toBe(409)
    expect(fetches).toBe(1)
    expect(bindCall()).toBeUndefined()
    for (const status of [408, 429, 503]) {
      phase = "prepared"
      fetches = 0
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (String(url).includes("/get-agent/")) return durationResponse()
        fetches += 1
        return new Response("busy", { status })
      }))
      const again = await POST(req())
      expect(again.status).toBe(503)
      phase = "reconciliation"
      const replay = await POST(req())
      expect(replay.status).toBe(409)
      expect(fetches).toBe(1)
    }
  })

  it("records a definitive provider rejection without binding and blocks a second key while another attempt is active", async () => {
    const fetchMock = fetchWithDuration(() => new Response("no", { status: 422 }))
    vi.stubGlobal("fetch", fetchMock)
    const rejected = await POST(req())
    expect(rejected.status).toBe(502)
    expect(recordCall()?.[1].p_payload).toEqual({ outcome: "rejected" })
    expect(bindCall()).toBeUndefined()
    installRpc({ prepare: { status: "conflict", reason: "active" } })
    const otherKey = "44444444-4444-4444-8444-444444444444"
    const second = await POST(new NextRequest(req().url, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        "idempotency-key": otherKey,
        cookie: `${sessionCookie}=${"a".repeat(64)}`,
      },
      body: JSON.stringify(body),
    }))
    expect(second.status).toBe(409)
    expect((await second.json()).message).toContain("already has a controlled test")
    expect(fetchMock.mock.calls.filter(call => String(call[0]).includes("/v3/create-web-call"))).toHaveLength(1)
  })

  it("keeps an incomplete provider payload for reconciliation and does not bind a mismatched echoed agent", async () => {
    vi.stubGlobal("fetch", fetchWithDuration(() => providerResponse({ transport: "phone" })))
    const wrongTransport = await POST(req())
    expect(wrongTransport.status).toBe(503)
    expect(recordCall()?.[1].p_payload).toMatchObject({ outcome: "uncertain", providerCallId: "call_created_01" })
    expect(bindCall()).toBeUndefined()
    installRpc({ bind: { status: "denied", reason: "agent", providerConfirmedAgent: false } })
    vi.stubGlobal("fetch", fetchWithDuration(() => providerResponse({ agent_id: "agent-0099" })))
    const wrongAgent = await POST(req())
    expect(wrongAgent.status).toBe(403)
    expect((await wrongAgent.json()).message).toContain("Do not start another one")
    expect(recordCall()?.[1].p_payload).toMatchObject({ outcome: "created", echoedAgentId: "agent-0099" })
    expect(bindCall()).toBeTruthy()
  })

  it("does not call the phone-call endpoint or read a client call id", () => {
    const source = readFileSync(new URL("./initiate-agent-test-call.ts", import.meta.url), "utf8")
    const provider = readFileSync(new URL("./agent-test-call-provider.ts", import.meta.url), "utf8")
    expect(source).not.toContain("create-phone-call")
    expect(source).not.toContain("body.callId")
    expect(source).not.toContain("allowAgentTestCreate")
    expect(source).not.toContain("Try the same action again")
    expect(provider).toContain("https://api.retellai.com/v3/create-web-call")
    expect(provider).not.toContain("create-phone-call")
    expect(provider).not.toContain("/v2/create-web-call")
    expect(provider).not.toContain("allowAgentTestCreate")
    expect(provider).not.toContain("const creates")
    expect(provider).toContain("https://api.retellai.com/v2/stop-call/")
    expect(provider).toContain("https://api.retellai.com/get-agent/")
    expect(provider).toContain("max_call_duration_ms")
    expect(provider).not.toContain("update-agent")
    expect(provider).not.toContain("create-agent")
    expect(source).toContain("readDevAgentCallDuration")
    expect(source).not.toContain("connectionToken")
  })

  it("blocks a dev web call when the exact agent version has no 5-minute provider duration limit", async () => {
    const cases = [
      durationResponse({ max_call_duration_ms: undefined }),
      durationResponse({ max_call_duration_ms: 3_600_000 }),
      durationResponse({ version: 5 }),
      durationResponse({ agent_id: "agent-0099" }),
      durationResponse({}, 404),
      durationResponse({}, 503),
    ]
    for (const agent of cases) {
      const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
        void _init
        if (String(url).includes("/get-agent/")) return agent
        return providerResponse()
      })
      vi.stubGlobal("fetch", fetchMock)
      installRpc()
      const response = await POST(req())
      expect(response.status).toBe(502)
      expect((await response.json()).message).toContain("No web call was opened.")
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/v3/create-web-call"))).toBe(false)
      expect(recordCall()?.[1].p_payload).toEqual({ outcome: "rejected" })
      expect(bindCall()).toBeUndefined()
    }
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      void url
      void _init
      throw new Error("network")
    })
    vi.stubGlobal("fetch", fetchMock)
    installRpc()
    const unread = await POST(req())
    expect(unread.status).toBe(502)
    expect((await unread.json()).message).toContain("could not be read")
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/v3/create-web-call"))).toBe(false)
    expect(recordCall()?.[1].p_payload).toEqual({ outcome: "rejected" })
  })

  it("does not read the dev duration limit on the production lane", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("TELLOYA_RETELL_PRODUCTION_API_KEY", "live-key-value")
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      void url
      void _init
      return providerResponse()
    })
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual(["https://api.retellai.com/v3/create-web-call"])
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBe("Bearer live-key-value")
  })
})
