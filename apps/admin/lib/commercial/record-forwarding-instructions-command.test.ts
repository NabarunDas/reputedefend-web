import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/commercial/record-forwarding-instructions/route"
import { commercialProviderLane } from "./provider-lane"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const notice = "Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection."
const instructionText = `1. Keep +441632960441 for the customer’s telephone provider. This is the number calls can be sent to once the receptionist is approved. 2. The exact menu names vary by telephone provider. These notes prepare the later connection and do not change the telephone line. 3. ${notice}`
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
  allocationId: "a033a000-0000-4000-8000-000000000071",
  allocationVersion: 1,
  instructionVersion: 0,
  instruction: {
    environment: "dev",
    forwardingMode: "UNANSWERED_BUSY_UNREACHABLE",
    carrierKnown: false,
    carrierName: null,
    customerTelephone: null,
    instructionRevision: "guide-0001",
    instructionText,
    attestation: "The operator prepared these forwarding notes from the recorded allocation.",
    staffConfirmed: true,
    status: "SHARED",
  },
}

function req(payload: unknown = body, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/commercial/record-forwarding-instructions`, {
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
  vi.stubEnv("ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED", "true")
  vi.stubEnv("VERCEL_ENV", "development")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("record forwarding instructions command messages", () => {
  it("stays closed while either flag is off and does not call the database", async () => {
    vi.stubEnv("ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED", "")
    const closed = await POST(req())
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({ message: "Record forwarding instructions is not switched on." })
    vi.stubEnv("ADMIN_COMMERCIAL_RECORD_FORWARDING_INSTRUCTIONS_ENABLED", "true")
    vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "")
    const queueClosed = await POST(req())
    expect(queueClosed.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects instructions that omit the safety sentence or the staff confirmation", async () => {
    const missing = await POST(req({ ...body, instruction: { ...body.instruction, staffConfirmed: false } }))
    expect(missing.status).toBe(400)
    const shortened = await POST(req({ ...body, instruction: { ...body.instruction, instructionText: notice } }))
    expect(shortened.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["success", undefined, 200, "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live."],
    ["reauth_required", undefined, 403, ADMIN_RECENT_SIGN_IN_MESSAGE],
    ["conflict", "version", 409, "These forwarding instructions have changed. Reload the queue before trying again."],
    ["conflict", undefined, 409, "This request was already used with different details. Reload the queue and start again."],
    ["denied", "allocation", 403, "Record the current telephone allocation for this location before sharing forwarding instructions."],
    ["denied", "provider", 403, "The instructions must name the assigned telephone number and must not include provider or internal references."],
    ["denied", "preferences", 403, "Confirm the business preferences for every selected location before recording forwarding instructions."],
    ["denied", "payment", 403, "This subscription is not a verified paid subscription, so forwarding instructions cannot be recorded."],
    ["denied", "expired", 403, "This subscription period has ended, so forwarding instructions cannot be recorded."],
    ["denied", "revoked", 403, "Business authority is not verified, so forwarding instructions cannot be recorded."],
    ["unauthorized", undefined, 401, "Your session has ended. Please sign in again."],
    ["invalid", undefined, 400, "Check the forwarding instructions and staff attestation before recording them."],
  ])("maps %s %s to a nontechnical message", async (status, reason, code, message) => {
    mocks.rpc.mockResolvedValue({ status, reason })
    const response = await POST(req())
    expect(response.status).toBe(code)
    expect(await response.json()).toEqual({ message })
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("saves a draft without saying the customer can see it", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    const response = await POST(req({ ...body, instruction: { ...body.instruction, status: "DRAFT" } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: "The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled." })
  })

  it("keeps recording closed when the server lane is absent", async () => {
    delete process.env.VERCEL_ENV
    expect(commercialProviderLane()).toBeNull()
    const response = await POST(req())
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("records the server lane and rejects a browser environment that differs", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    await POST(req())
    expect(mocks.rpc.mock.calls[0][1].p_payload.instruction.environment).toBe("dev")
    const rejected = await POST(req({ ...body, instruction: { ...body.instruction, environment: "production" } }))
    expect(rejected.status).toBe(400)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
