import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
}))
import { POST } from "@/app/api/portal/onboarding/offer/amendment/route"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "c".repeat(64)
const body = { selector: "VC-26-AB2347", message: "Please change the greeting." }

function req(payload: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/portal/onboarding/offer/amendment`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${portalSessionCookieName()}=${token}`,
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("TELLOYA_ADMIN_JOURNEY_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset().mockResolvedValue({ status: "recorded" })
})
afterEach(() => vi.unstubAllEnvs())

describe("Telloya amendment command", () => {
  it("stays closed when the journey flag is off", async () => {
    vi.stubEnv("TELLOYA_ADMIN_JOURNEY_ENABLED", "")
    expect((await POST(req(body))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("sends the session hash and the opaque offer reference", async () => {
    expect((await POST(req({ ...body, actorId: "11111111-1111-4111-8111-111111111111" }))).status).toBe(200)
    const args = mocks.rpc.mock.calls[0][1]
    expect(mocks.rpc).toHaveBeenCalledWith("telloya_offer_amendment_v1", expect.objectContaining({
      p_selector: "VC-26-AB2347",
      p_message: "Please change the greeting.",
      p_request: key,
    }))
    expect(args.p_token_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(args)).not.toContain("11111111")
  })

  it("rejects a selector that is not an offer reference", async () => {
    expect((await POST(req({ ...body, selector: "<p>TY-26-ABCDEF</p>" }))).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
