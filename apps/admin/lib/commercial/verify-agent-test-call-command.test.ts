import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/commercial/verify-agent-test-call/route"

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
    mocks.rpc.mockResolvedValue({ status: "success", evidenceOutcome: "REQUIRES_REVIEW", providerStatus: "unavailable", testPassed: false, forwardingVerified: false })
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.evidenceOutcome).toBe("REQUIRES_REVIEW")
    expect(json.message).not.toContain("has passed its conversation test")
    expect(json.forwardingVerified).toBe(false)
    const payload = mocks.rpc.mock.calls[0][1].p_payload
    expect(payload.evidence.availability).toBe("unavailable")
    expect(payload.evidence.environment).toBe("dev")
    expect(payload).not.toHaveProperty("transcript")
  })

  it("keeps an uncertain provider response out of the database", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")))
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ message: "We couldn’t confirm whether the provider call could be read. Try the same action again without changing the assessment." })
    expect(mocks.rpc).not.toHaveBeenCalled()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })))
    const again = await POST(req())
    expect(again.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
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
    mocks.rpc.mockResolvedValue({
      status: "success",
      evidenceOutcome: "VERIFIED_PASSED",
      evidenceVersion: 1,
      providerStatus: "retrieved",
      provisionState: "AWAITING_CONFIRMATION",
      testPassed: true,
      forwardingVerified: false,
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
    const evidence = mocks.rpc.mock.calls[0][1].p_payload.evidence
    expect(evidence).toMatchObject({
      availability: "retrieved",
      callId: "call_direct_01",
      callType: "web_call",
      callStatus: "ended",
      agentId: "agent-0021",
      agentVersion: "4",
      environment: "dev",
      providerError: false,
      testScope: "AGENT_DIRECT",
    })
    expect(evidence).not.toHaveProperty("transcript")
    expect(evidence).not.toHaveProperty("recording_url")
    expect(evidence).not.toHaveProperty("metadata")
    expect(mocks.rpc.mock.calls[0][1].p_payload.qa.staffConfirmed).toBe(true)
  })

  it("records an unknown call without treating the typed reference as a pass", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })))
    mocks.rpc.mockResolvedValue({ status: "success", evidenceOutcome: "REQUIRES_REVIEW", providerStatus: "not_found", testPassed: false, forwardingVerified: false })
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect((await response.json()).message).not.toContain("has passed its conversation test")
    expect(mocks.rpc.mock.calls[0][1].p_payload.evidence.availability).toBe("not_found")
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
    mocks.rpc.mockResolvedValue({ status: "success", evidenceOutcome: "VERIFIED_FAILED" })
    const response = await POST(req())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: "The conversation test was recorded as failed. The service was not advanced. Telephone forwarding is not verified, and the receptionist is not live.",
      evidenceOutcome: "VERIFIED_FAILED",
    })
  })
})
