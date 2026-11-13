import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/enquiries/telloya-sales-context/route"
import { sessionCookie } from "@/lib/auth/config"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "@/lib/admin/reauth-copy"
import { parseTelloyaSalesContextCommand, reconcileTelloyaSalesContext } from "./telloya-sales-context-command"

const origin = "https://admin.profilerelaunch.com"
const enquiryId = "21affacc-2e97-4b9a-992d-9f0644ab7115"
const key = "33333333-3333-4333-8333-333333333333"
const token = "a".repeat(64)

function req(payload: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/enquiries/telloya-sales-context`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${token}`,
      ...headers,
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
  vi.stubEnv("TELLOYA_ADMIN_JOURNEY_ENABLED", "true")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("parseTelloyaSalesContextCommand", () => {
  it("accepts bootstrap and confirmation operations", () => {
    expect(parseTelloyaSalesContextCommand({ enquiryId })).toEqual({ enquiryId, operation: "bootstrap", businessId: undefined, locationId: undefined, locationName: undefined, country: undefined })
    expect(parseTelloyaSalesContextCommand({ enquiryId, operation: "confirm_business", businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })?.operation).toBe("confirm_business")
    expect(parseTelloyaSalesContextCommand({ enquiryId: "not-a-uuid" })).toBeNull()
  })
})

describe("Telloya sales-context command", () => {
  it("stays closed outside Preview with the journey flag", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const response = await POST(req({ enquiryId }))
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("calls the composite sales-context command for bootstrap", async () => {
    mocks.rpc.mockResolvedValueOnce({
      status: "success",
      exception: "confirm_operating_location",
      message: "Confirm the operating location. Enquiry location text is not a verified service address.",
    })
    const result = await reconcileTelloyaSalesContext({ token, enquiryId, idempotencyKey: key })
    expect(result.ok).toBe(true)
    expect(result.exception).toBe("confirm_operating_location")
    expect(mocks.rpc).toHaveBeenCalledWith("telloya_sales_context_command_v1", expect.objectContaining({
      p_operation: "bootstrap",
      p_request: key,
    }))
  })

  it.each([
    ["missing function", new Error("function telloya_sales_context_command_v1 does not exist")],
    ["network timeout", new Error("Admin authentication storage unavailable")],
    ["PostgREST database error", new Error("Admin authentication storage unavailable")],
    ["lost RPC response", new Error("Admin authentication storage unavailable")],
  ])("fails closed on %s without legacy commercial writes", async (_label, error) => {
    mocks.rpc.mockRejectedValueOnce(error)
    const result = await reconcileTelloyaSalesContext({ token, enquiryId, idempotencyKey: key })
    expect(result).toEqual({
      ok: false,
      status: 503,
      message: "Telloya sales-context is unavailable on this deployment until the source-only composite is applied. The offer workspace stays read-only.",
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith("telloya_sales_context_command_v1", expect.any(Object))
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_commercial_command_v1")).toBe(false)
  })

  it("maps reauth_required from the composite without commercial fallback writes", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "reauth_required" })
    const result = await reconcileTelloyaSalesContext({ token, enquiryId, idempotencyKey: key })
    expect(result).toEqual({ ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE })
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["telloya_sales_context_command_v1"])
  })

  it("rejects a forged origin on the HTTP command", async () => {
    const response = await POST(req({ enquiryId }, { origin: "https://evil.example" }))
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
