import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/enquiries/telloya-sales-context/route"
import { sessionCookie } from "@/lib/auth/config"
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

  it("falls back to evidence-safe orchestration when the composite migration is unapplied", async () => {
    mocks.rpc
      .mockRejectedValueOnce(new Error("function telloya_sales_context_command_v1 does not exist"))
      .mockResolvedValueOnce({ status: "ready", demo_status: "COMPLETED" })
      .mockResolvedValueOnce({ payload: { businessName: "Owner Yard", websiteUrl: "", locations: "London", country: "United Kingdom" } })
      .mockResolvedValueOnce({
        supported: true,
        productHint: "TELLOYA",
        step: "classify",
        termsConfigured: false,
        invitationReady: false,
        invitationSent: false,
        emailVerified: false,
        contactVerified: false,
        membership: null,
        outstanding: [],
        nextAction: null,
        request: null,
        customer: null,
        candidates: [],
        businesses: [],
        locations: [],
        history: [],
        approvedPlans: [],
      })
      .mockResolvedValueOnce({ status: "success", version: 1 })
      .mockResolvedValueOnce({
        supported: true,
        productHint: "TELLOYA",
        step: "customer",
        termsConfigured: false,
        invitationReady: false,
        invitationSent: false,
        emailVerified: false,
        contactVerified: false,
        membership: null,
        outstanding: [],
        nextAction: null,
        request: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          product: "TELLOYA",
          state: "RECEIVED",
          version: 1,
          customerId: null,
          businessId: null,
          declineReason: null,
          subscriptionId: null,
        },
        customer: null,
        candidates: [],
        businesses: [],
        locations: [],
        history: [],
        approvedPlans: [],
      })
      .mockResolvedValueOnce({ status: "success", version: 2 })
      .mockResolvedValueOnce({
        supported: true,
        productHint: "TELLOYA",
        step: "business",
        termsConfigured: false,
        invitationReady: false,
        invitationSent: false,
        emailVerified: false,
        contactVerified: false,
        membership: null,
        outstanding: [],
        nextAction: null,
        request: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          product: "TELLOYA",
          state: "MAILBOX_REQUIRED",
          version: 2,
          customerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          businessId: null,
          declineReason: null,
          subscriptionId: null,
        },
        customer: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Alex", emailVerified: false, version: 1 },
        candidates: [],
        businesses: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Different Yard", membership: "pending", membershipVersion: 1 }],
        locations: [],
        history: [],
        approvedPlans: [],
      })

    const result = await reconcileTelloyaSalesContext({ token, enquiryId, idempotencyKey: key })
    expect(result.ok).toBe(true)
    expect(result.exception).toBe("confirm_business_authority")
    const commercial = mocks.rpc.mock.calls.filter(call => call[0] === "admin_commercial_command_v1").map(call => call[1].p_operation)
    expect(commercial).toEqual(["classify", "match_customer"])
    expect(commercial).not.toContain("match_business")
  })

  it("rejects a forged origin on the HTTP command", async () => {
    const response = await POST(req({ enquiryId }, { origin: "https://evil.example" }))
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
