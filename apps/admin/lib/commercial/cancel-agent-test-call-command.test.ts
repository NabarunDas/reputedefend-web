import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sessionFromToken: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  sessionFromToken: (token: string | undefined) => mocks.sessionFromToken(token),
}))
import { POST } from "@/app/api/commercial/cancel-agent-test-call/route"
import { readFileSync } from "node:fs"

const operator = "11111111-1111-4111-8111-111111111111"
const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
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
  providerCallId: callId,
}

function installRpc(authorize: Record<string, unknown>) {
  mocks.sessionFromToken.mockResolvedValue(freshSession())
  mocks.rpc.mockImplementation(async (name: string, args: { p_payload?: Record<string, unknown> }) => {
    if (name === "admin_commercial_authorize_agent_test_cancel_v1") return authorize
    if (name === "admin_commercial_settle_agent_test_call_v1") {
      return { status: args.p_payload?.outcome === "uncertain" ? "reconciliation" : "completed", attemptState: args.p_payload?.outcome === "uncertain" ? "REQUIRES_RECONCILIATION" : "COMPLETED" }
    }
    throw new Error(name)
  })
}

function req(payload: unknown = body, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/commercial/cancel-agent-test-call`, {
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

function providerGet(patch: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    call_id: callId,
    call_type: "web_call",
    call_status: "ongoing",
    ...patch,
  }), { status: 200, headers: { "content-type": "application/json" } })
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
  installRpc({ status: "authorized", callId, attemptState: "BOUND", environment: "dev" })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("cancel a controlled receptionist test", () => {
  it("stops only the matching web call and completes the attempt from the provider response", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url)
      if (target.endsWith(`/v2/get-call/${callId}`)) return providerGet()
      if (target.endsWith(`/v2/stop-call/${callId}`) && init?.method === "POST") return new Response(null, { status: 204 })
      return new Response("no", { status: 404 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.status).toBe("completed")
    expect(json.message).toContain("has ended")
    expect(JSON.stringify(json)).not.toContain("accessToken")
    expect(JSON.stringify(json)).not.toContain("join-token")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toBe(`https://api.retellai.com/v2/stop-call/${callId}`)
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ authorization: "Bearer test-key-value" })
    const settled = mocks.rpc.mock.calls.find(call => call[0] === "admin_commercial_settle_agent_test_call_v1")
    expect(settled?.[1].p_payload).toMatchObject({ outcome: "cancelled", providerCallId: callId, callType: "web_call", locationId: body.locationId })
    expect(JSON.stringify(settled?.[1].p_payload)).not.toContain("accessToken")
  })

  it("rejects an unrelated call id before any provider request", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    installRpc({ status: "denied", reason: "call" })
    const response = await POST(req({ ...body, providerCallId: "call_other_01" }))
    expect(response.status).toBe(409)
    expect((await response.json()).message).toContain("not the controlled test")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_commercial_authorize_agent_test_cancel_v1"])
  })

  it("requires reconciliation when provider cancellation times out and does not open another call", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/v2/get-call/")) return providerGet()
      throw new Error("timeout")
    })
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(503)
    const json = await response.json()
    expect(json.status).toBe("reconciliation")
    expect(json.message).toContain("Do not start another one")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain("/v2/stop-call/")
    expect(mocks.rpc.mock.calls.filter(call => call[0] === "admin_commercial_settle_agent_test_call_v1")).toHaveLength(1)
    expect(mocks.rpc.mock.calls.find(call => call[0] === "admin_commercial_settle_agent_test_call_v1")?.[1].p_payload.outcome).toBe("uncertain")
    expect(fetchMock.mock.calls.map(call => String(call[0])).join(" ")).not.toContain("create-web-call")
    expect(fetchMock.mock.calls.map(call => String(call[0])).join(" ")).not.toContain("create-phone-call")
  })

  it("does not stop a telephone route", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      void url
      return providerGet({ call_type: "phone_call", call_status: "ongoing" })
    })
    vi.stubGlobal("fetch", fetchMock)
    const response = await POST(req())
    expect(response.status).toBe(409)
    expect((await response.json()).message).toContain("telephone route")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v2/get-call/")
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["admin_commercial_authorize_agent_test_cancel_v1"])
  })

  it("does not call the provider for a stale session", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    mocks.sessionFromToken.mockResolvedValue(freshSession(new Date(Date.now() - 31 * 60 * 1000).toISOString()))
    const response = await POST(req())
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("keeps cancellation on the server and away from a phone-call endpoint", () => {
    const source = readFileSync(new URL("./cancel-agent-test-call.ts", import.meta.url), "utf8")
    const browser = readFileSync(new URL("./controlled-web-call.ts", import.meta.url), "utf8")
    const view = readFileSync(new URL("../../app/commercial/setup/setup-queue-view.tsx", import.meta.url), "utf8")
    expect(source).toContain("stopAgentWebCall")
    expect(source).not.toContain("create-phone-call")
    expect(source).not.toContain("create-web-call")
    expect(browser).toContain("cancelEndpoint")
    expect(browser).not.toContain("status: 204")
    expect(browser).not.toContain("TELLOYA_RETELL")
    expect(view).toContain("/api/commercial/cancel-agent-test-call")
  })
})
