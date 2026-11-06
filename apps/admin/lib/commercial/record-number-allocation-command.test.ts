import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/commercial/record-number-allocation/route"
import { commercialProviderLane } from "./provider-lane"

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
  provisionVersion: 2,
  configurationVersion: 1,
  allocationVersion: 0,
  provider: {
    provider: "telloya_voice",
    environment: "dev",
    agentRef: "agent-high-01",
    revision: "rev-0004",
    e164: "+441632960441",
    allocationRef: "evidence-high-01",
    attestation: "The operator recorded this assigned number from the provider allocation.",
    staffConfirmed: true,
  },
}

function req(payload: unknown = body, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/commercial/record-number-allocation`, {
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
  vi.stubEnv("ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED", "true")
  vi.stubEnv("VERCEL_ENV", "development")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("record number allocation command messages", () => {
  it("stays closed while either flag is off and does not call the database", async () => {
    vi.stubEnv("ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED", "")
    const closed = await POST(req())
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({ message: "Record number allocation is not switched on." })
    vi.stubEnv("ADMIN_COMMERCIAL_RECORD_NUMBER_ALLOCATION_ENABLED", "true")
    vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "")
    const queueClosed = await POST(req())
    expect(queueClosed.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a number or attestation that is not explicit provider evidence", async () => {
    const missing = await POST(req({ ...body, provider: { ...body.provider, staffConfirmed: false } }))
    expect(missing.status).toBe(400)
    expect(await missing.json()).toEqual({ message: "Check the telephone number and provider evidence before recording the allocation." })
    const number = await POST(req({ ...body, provider: { ...body.provider, e164: "01632960441" } }))
    expect(number.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["success", undefined, 200, "The telephone number is recorded for this location. It is not active. Forwarding and testing are still required."],
    ["reauth_required", undefined, 403, ADMIN_RECENT_SIGN_IN_MESSAGE],
    ["conflict", "version", 409, "This allocation has changed. Reload the queue before trying again."],
    ["conflict", undefined, 409, "This request was already used with different details. Reload the queue and start again."],
    ["denied", "configuration", 403, "Record a current AI configuration for this location before recording a telephone number."],
    ["denied", "number", 403, "That telephone number is already recorded for a different location or business."],
    ["denied", "routing", 403, "That provider agent already has an active telephone binding, so this number cannot be recorded as pending."],
    ["denied", "environment", 403, "That provider environment does not match the recorded configuration."],
    ["denied", "payment", 403, "This subscription is not a verified paid subscription, so the telephone number cannot be recorded."],
    ["denied", "inactive", 403, "This subscription is not active, so the telephone number cannot be recorded."],
    ["denied", "expired", 403, "This subscription period has ended, so the telephone number cannot be recorded."],
    ["denied", "revoked", 403, "Business authority is not verified, so the telephone number cannot be recorded."],
    ["unauthorized", undefined, 401, "Your session has ended. Please sign in again."],
    ["invalid", undefined, 400, "Check the telephone number and provider evidence before recording the allocation."],
  ])("maps %s %s to a nontechnical message", async (status, reason, code, message) => {
    mocks.rpc.mockResolvedValue({ status, reason })
    const response = await POST(req())
    expect(response.status).toBe(code)
    expect(await response.json()).toEqual({ message })
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("keeps recording closed when the server lane is absent", async () => {
    delete process.env.VERCEL_ENV
    expect(commercialProviderLane()).toBeNull()
    const response = await POST(req())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: "The provider lane is not configured for this deployment, so the telephone number cannot be recorded." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("records the server lane and rejects a browser environment that differs", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    await POST(req())
    expect(mocks.rpc.mock.calls[0][1].p_payload.provider.environment).toBe("dev")
    const rejected = await POST(req({ ...body, provider: { ...body.provider, environment: "production" } }))
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual({ message: "That provider environment does not match this deployment, so the telephone number cannot be recorded." })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it("records production evidence only when the server lane is production", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    mocks.rpc.mockResolvedValue({ status: "success" })
    const response = await POST(req({ ...body, provider: { ...body.provider, environment: "production" } }))
    expect(response.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1].p_payload.provider.environment).toBe("production")
  })

  it.each(["", "staging"])("keeps recording closed when the server lane is %s", async value => {
    vi.stubEnv("VERCEL_ENV", value)
    expect(commercialProviderLane()).toBeNull()
    const response = await POST(req())
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
