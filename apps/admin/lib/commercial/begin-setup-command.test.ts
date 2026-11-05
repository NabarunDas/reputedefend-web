import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/commercial/begin-setup/route"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const body = {
  subscriptionId: "a033a000-0000-4000-8000-000000000031",
  version: 4,
  customerId: "a033a000-0000-4000-8000-0000000000a1",
  businessId: "a033a000-0000-4000-8000-000000000011",
  onboardingRequestId: "a033a000-0000-4000-8000-000000000041",
  onboardingVersion: 2,
  reason: "Begin setup after the verified payment.",
}

function req() {
  return new NextRequest(`${origin}/api/commercial/begin-setup`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "true")
  vi.stubEnv("ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED", "true")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("begin setup command messages", () => {
  it("stays closed while either flag is off and does not call the database", async () => {
    vi.stubEnv("ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED", "")
    const closed = await POST(req())
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({ message: "Begin setup is not switched on." })
    vi.stubEnv("ADMIN_COMMERCIAL_BEGIN_SETUP_ENABLED", "true")
    vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "")
    const queueClosed = await POST(req())
    expect(queueClosed.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["success", undefined, 200, "Setup is in progress. The next step is to confirm business preferences."],
    ["reauth_required", undefined, 403, ADMIN_RECENT_SIGN_IN_MESSAGE],
    ["conflict", "version", 409, "This subscription has changed. Reload the queue before trying again."],
    ["conflict", "provision", 409, "Setup has already started for these locations. Reload the queue before trying again."],
    ["conflict", undefined, 409, "This request was already used with different details. Reload the queue and start again."],
    ["denied", "payment", 403, "This subscription is not a verified paid subscription, so setup cannot start."],
    ["denied", "inactive", 403, "This subscription is not active, so setup cannot start."],
    ["denied", "expired", 403, "This subscription period has ended, so setup cannot start."],
    ["denied", "revoked", 403, "Business authority is not verified, so setup cannot start."],
    ["denied", "acceptance", 403, "The accepted offer does not match this subscription."],
    ["denied", "location", 403, "The selected locations do not belong to this business."],
    ["denied", "quantities", 403, "The selected locations do not match the accepted plan."],
    ["unauthorized", undefined, 401, "Your session has ended. Please sign in again."],
  ])("maps %s %s to a nontechnical message", async (status, reason, code, message) => {
    mocks.rpc.mockResolvedValue({ status, reason })
    const response = await POST(req())
    expect(response.status).toBe(code)
    expect(await response.json()).toEqual({ message })
  })
})
