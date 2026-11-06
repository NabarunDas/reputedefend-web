import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { readFileSync } from "node:fs"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sessionFromToken: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  sessionFromToken: (token: string | undefined) => mocks.sessionFromToken(token),
}))
import { POST } from "@/app/api/commercial/review-agent-test-call/route"

const operator = "11111111-1111-4111-8111-111111111111"
const origin = "https://admin.profilerelaunch.com"
const headerKey = "33333333-3333-4333-8333-333333333333"
const storedRequest = "44444444-4444-4444-8444-444444444444"
const callId = "call_created_01"

function freshSession(createdAt = new Date().toISOString()) {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    userId: operator,
    createdAt,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }
}

const body = {
  action: "check",
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

const found = {
  status: "found",
  attemptState: "BOUND",
  sessionRef: "TS-06-AB12CD34",
  requestId: storedRequest,
  callId,
  businessId: body.businessId,
  locationId: body.locationId,
  forwardingVerified: false,
  testPassed: false,
}

function req(payload: unknown = body) {
  return new NextRequest(`${origin}/api/commercial/review-agent-test-call`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": headerKey,
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
  mocks.sessionFromToken.mockResolvedValue(freshSession())
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "admin_commercial_read_agent_test_attempt_v1") return found
    if (name === "admin_commercial_settle_agent_test_call_v1") return { status: "completed", attemptState: "COMPLETED" }
    throw new Error(name)
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("review a controlled receptionist test", () => {
  it("completes the stored attempt only after the provider reports the web call ended", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({
      call_id: callId,
      call_type: "web_call",
      call_status: String(url).includes("ended") ? "ended" : "ended",
    }), { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.status).toBe("completed")
    expect(json.sessionRef).toBe("TS-06-AB12CD34")
    expect(json.message).toContain("has ended")
    expect(JSON.stringify(json)).not.toContain("accessToken")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.retellai.com/v2/get-call/${callId}`)
    expect(fetchMock.mock.calls.map(call => String(call[0])).join(" ")).not.toContain("stop-call")
    expect(fetchMock.mock.calls.map(call => String(call[0])).join(" ")).not.toContain("create-web-call")
    const settled = mocks.rpc.mock.calls.find(call => call[0] === "admin_commercial_settle_agent_test_call_v1")
    expect(settled?.[1].p_request).toBe(storedRequest)
    expect(settled?.[1].p_request).not.toBe(headerKey)
    expect(settled?.[1].p_payload).toMatchObject({ outcome: "ended", providerCallId: callId, callType: "web_call", callStatus: "ended" })
  })

  it("leaves an ongoing provider call active and does not stop it", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      void url
      return new Response(JSON.stringify({
      call_id: callId,
      call_type: "web_call",
      call_status: "ongoing",
    }), { status: 200, headers: { "content-type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.status).toBe("ongoing")
    expect(json.message).toContain("not yet complete")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v2/get-call/")
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_commercial_read_agent_test_attempt_v1"])
  })

  it("does not settle a telephone route from a status check", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      void url
      return new Response(JSON.stringify({
      call_id: callId,
      call_type: "phone_call",
      call_status: "ongoing",
    }), { status: 200, headers: { "content-type": "application/json" } })
    })
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(409)
    expect((await response.json()).message).toContain("telephone route")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v2/get-call/")
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_commercial_read_agent_test_attempt_v1"])
  })

  it("requires investigation when the active attempt has no stored call id", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    mocks.rpc.mockResolvedValue({ ...found, callId: null, attemptState: "REQUIRES_RECONCILIATION", reason: "uncertain" })
    const response = await POST(req())
    expect(response.status).toBe(409)
    const json = await response.json()
    expect(json.status).toBe("reconciliation")
    expect(json.message).toContain("investigation")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a typed call id before the database and the provider", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req({ ...body, providerCallId: callId }))
    expect(response.status).toBe(400)
    expect((await response.json()).message).toContain("typed call reference")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("reads the attempt without calling the provider", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req({ ...body, action: "read" }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.status).toBe("found")
    expect(json.sessionRef).toBe("TS-06-AB12CD34")
    expect(json.callId).toBe(callId)
    expect(JSON.stringify(json)).not.toContain("accessToken")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_commercial_read_agent_test_attempt_v1"])
  })

  it("does not stop or create a call from the status command", () => {
    const source = readFileSync(new URL("./review-agent-test-call.ts", import.meta.url), "utf8")
    expect(source).toContain("retrieveAgentTestCall")
    expect(source).toContain("admin_commercial_settle_agent_test_call_v1")
    expect(source).not.toContain("stopAgentWebCall")
    expect(source).not.toContain("createAgentWebCall")
    expect(source).not.toContain("create-web-call")
    expect(source).not.toContain("create-phone-call")
    expect(source).not.toContain("TELLOYA_RETELL")
  })
})
