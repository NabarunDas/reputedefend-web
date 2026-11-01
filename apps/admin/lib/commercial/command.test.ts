import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/enquiries/onboarding/route"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const enquiryId = "22222222-2222-4222-8222-222222222222"
const key = "33333333-3333-4333-8333-333333333333"
const body = { operation: "prepare_offer", version: 4, enquiryId, reason: "Checked the enquiry with the caller." }

function req() {
  return new NextRequest(`${origin}/api/enquiries/onboarding`, {
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
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("onboarding command messages", () => {
  it.each([
    ["conflict", "version", 409, "This request has changed. Reload it before trying again."],
    ["conflict", "business", 409, "That business already has an open voice onboarding request. Reload it before trying again."],
    ["conflict", "offer", 409, "That business already has an open commercial offer. Reload it before trying again."],
    ["denied", "frozen", 403, "This offer is already prepared. The customer, business, locations and terms stay as they were."],
    ["denied", "revoked", 403, "Business authority has been withdrawn. Matching does not restore it."],
    ["denied", "membership", 403, "Verified authority needs existing email or phone proof and a recent Admin sign-in. This step does not change authority."],
    ["terms_unconfigured", "quantities", 409, "The selected locations do not match the approved Telloya quantity. Guard is not given that same quantity. No price is offered."],
    ["terms_unconfigured", "components", 409, "This plan does not include the required Telloya or Guard component. No price is offered."],
    ["terms_unconfigured", undefined, 409, "Commercial terms not yet configured. No price is offered."],
  ] as const)("explains %s %s", async (status, reason, code, message) => {
    mocks.rpc.mockResolvedValue({ status, reason })
    const response = await POST(req())
    expect(response.status).toBe(code)
    expect(await response.json()).toEqual({ message })
  })
})
