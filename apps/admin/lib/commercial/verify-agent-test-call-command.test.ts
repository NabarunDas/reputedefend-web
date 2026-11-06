import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sessionFromToken: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  sessionFromToken: (token: string | undefined) => mocks.sessionFromToken(token),
}))
import { POST } from "@/app/api/commercial/verify-agent-test-call/route"
import { allowAgentTestLookup, resetAgentTestLookups } from "@/lib/commercial/agent-test-call-provider"

const operator = "11111111-1111-4111-8111-111111111111"

function freshSession(createdAt = new Date().toISOString()) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: operator,
    createdAt,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }
}

function installRpc(options: { session?: unknown; preflight?: unknown; verify?: unknown } = {}) {
  mocks.sessionFromToken.mockResolvedValue(options.session === undefined ? freshSession() : options.session)
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_session_v1") return options.session === undefined ? freshSession() : options.session
    if (name === "admin_commercial_agent_test_preflight_v1") return options.preflight ?? { status: "eligible" }
    if (name === "admin_commercial_verify_agent_test_call_v1") return options.verify ?? { status: "success", evidenceOutcome: "REQUIRES_REVIEW", testPassed: false, forwardingVerified: false }
    throw new Error(name)
  })
}

function verifyCall() {
  return mocks.rpc.mock.calls.find(call => call[0] === "admin_commercial_verify_agent_test_call_v1")
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
  callId: "call_direct_01",
  qa: {
    attestation: "I reviewed this controlled agent conversation against the confirmed preferences.",
    avoidsUnsupportedPromises: true,
    businessHours: true,
    callbackWindows: true,
    callerIdentity: true,
    conclusion: true,
    enquiryDetails: true,
    escalation: true,
    greeting: true,
    languageVoice: true,
    staffConfirmed: true,
  },
}

function req(payload: unknown = body, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/commercial/verify-agent-test-call`, {
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
  vi.stubEnv("ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED", "true")
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

describe("verify AI receptionist test call command", () => {
  it("stays closed while either flag is off and does not call the provider or the database", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED", "")
    const closed = await POST(req())
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({ message: "Verify AI receptionist test call is not switched on." })
    vi.stubEnv("ADMIN_COMMERCIAL_VERIFY_AGENT_TEST_CALL_ENABLED", "true")
    vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "")
    const queueClosed = await POST(req())
    expect(queueClosed.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not record a pass when the provider cannot be read", async () => {
    vi.stubEnv("TELLOYA_RETELL_DEV_API_KEY", "")
    installRpc({ verify: { status: "success", evidenceOutcome: "REQUIRES_REVIEW", providerStatus: "unavailable", testPassed: false, forwardingVerified: false } })
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.evidenceOutcome).toBe("REQUIRES_REVIEW")
    expect(json.message).not.toContain("has passed its conversation test")
    expect(json.forwardingVerified).toBe(false)
    const payload = verifyCall()?.[1].p_payload
    expect(payload.evidence.availability).toBe("unavailable")
    expect(payload.evidence.environment).toBe("dev")
    expect(payload).not.toHaveProperty("transcript")
  })

  it("keeps an uncertain provider response out of the database", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")))
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ message: "We couldn’t confirm whether the provider call could be read. Try the same action again without changing the assessment." })
    expect(verifyCall()).toBeUndefined()
    for (const status of [408, 429, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status })))
      const again = await POST(req())
      expect(again.status).toBe(503)
      expect(verifyCall()).toBeUndefined()
    }
  })

  it("reads the provider call and drops recordings and transcripts before recording", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      call_id: "call_direct_01",
      call_type: "web_call",
      call_status: "ended",
      agent_id: "agent-0021",
      agent_version: 4,
      start_timestamp: Date.parse("2026-11-06T12:00:00.000Z"),
      end_timestamp: Date.parse("2026-11-06T12:01:00.000Z"),
      disconnection_reason: "user_hangup",
      transcript: "full transcript",
      recording_url: "https://example.invalid/recording",
      metadata: { customerId: "cus_secret" },
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    installRpc({
      verify: {
        status: "success",
        evidenceOutcome: "VERIFIED_PASSED",
        evidenceVersion: 1,
        providerStatus: "retrieved",
        provisionState: "AWAITING_CONFIRMATION",
        testPassed: true,
        forwardingVerified: false,
      },
    })
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.message).toContain("Your AI receptionist has passed its conversation test.")
    expect(json.message).toContain("Telephone forwarding is not verified")
    expect(json.testPassed).toBe(true)
    expect(json.forwardingVerified).toBe(false)
    expect(JSON.stringify(json)).not.toContain("full transcript")
    expect(JSON.stringify(json)).not.toContain("recording")
    const called = fetchMock.mock.calls[0]
    expect(String(called[0])).toBe("https://api.retellai.com/v2/get-call/call_direct_01")
    expect(called[1].method).toBe("GET")
    expect(called[1].headers.authorization).toBe("Bearer test-key-value")
    expect(called[1].signal).toBeInstanceOf(AbortSignal)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const evidence = verifyCall()?.[1].p_payload.evidence
    expect(evidence).toMatchObject({
      availability: "retrieved",
      callId: "call_direct_01",
      callType: "web_call",
      callStatus: "ended",
      agentId: "agent-0021",
      agentVersion: 4,
      agentVersionQuality: "present",
      environment: "dev",
      providerError: false,
      testScope: "AGENT_DIRECT",
    })
    expect(evidence).not.toHaveProperty("transcript")
    expect(evidence).not.toHaveProperty("recording_url")
    expect(evidence).not.toHaveProperty("metadata")
    expect(verifyCall()?.[1].p_payload.qa.staffConfirmed).toBe(true)
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_private.commercial_agent_test_trust_call_v1")).toBe(false)
  })

  it("records an unknown call without treating the typed reference as a pass", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })))
    installRpc({ verify: { status: "success", evidenceOutcome: "REQUIRES_REVIEW", providerStatus: "not_found", testPassed: false, forwardingVerified: false } })
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect((await response.json()).message).not.toContain("has passed its conversation test")
    expect(verifyCall()?.[1].p_payload.evidence.availability).toBe("not_found")
  })

  it("rejects a missing staff confirmation before calling the provider", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req({ ...body, qa: { ...body.qa, staffConfirmed: false } }))
    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("returns only the message when the database omits the recorded fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      call_id: "call_direct_01",
      call_type: "web_call",
      call_status: "ended",
      agent_id: "agent-0021",
    }), { status: 200 })))
    installRpc({ verify: { status: "success", evidenceOutcome: "VERIFIED_FAILED" } })
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: "The conversation test was recorded as failed. The service was not advanced. Telephone forwarding is not verified, and the receptionist is not live.",
      evidenceOutcome: "VERIFIED_FAILED",
    })
    expect(verifyCall()?.[1].p_payload.evidence.agentVersionQuality).toBe("missing")
  })

  it("does not call the provider for an invalid admin cookie", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(new NextRequest(`${origin}/api/commercial/verify-agent-test-call`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=not-a-session` },
      body: JSON.stringify(body),
    }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ message: "Please sign in again." })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not call the provider when the admin session is missing", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    installRpc({ session: null })
    const response = await POST(req())
    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(verifyCall()).toBeUndefined()
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_commercial_agent_test_preflight_v1")).toBe(false)
  })

  it("does not call the provider when the recent sign-in has expired", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    installRpc({ session: freshSession(new Date(Date.now() - 31 * 60 * 1000).toISOString()) })
    const response = await POST(req())
    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json.message).not.toContain("call_direct_01")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(verifyCall()).toBeUndefined()
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_commercial_agent_test_preflight_v1")).toBe(false)
  })

  it("does not call the provider for another business, subscription, or location", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    for (const reason of ["customer", "subscription", "location"]) {
      installRpc({ preflight: { status: "denied", reason } })
      const response = await POST(req())
      expect(response.status).toBe(403)
      expect(JSON.stringify(await response.json())).not.toContain("call_direct_01")
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(verifyCall()).toBeUndefined()
  })

  it("stops further provider lookups after the operator limit", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    for (let attempt = 0; attempt < 6; attempt += 1) expect(allowAgentTestLookup(operator)).toBe(true)
    const response = await POST(req())
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ message: "Too many provider lookups. Wait a moment and try again." })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(verifyCall()).toBeUndefined()
  })

  it("keeps a provider timeout retryable and does not record it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")))
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(verifyCall()).toBeUndefined()
  })
})
