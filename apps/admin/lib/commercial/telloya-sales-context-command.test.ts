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

const emptyOnboarding = {
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
  it("accepts only a Telloya enquiry id", () => {
    expect(parseTelloyaSalesContextCommand({ enquiryId })).toEqual({ enquiryId })
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

  it("reconciles a completed demo with no onboarding request without inventing a location", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ status: "ready", demo_status: "COMPLETED" })
      .mockResolvedValueOnce({ payload: { businessName: "Owner Yard", websiteUrl: "https://example.com", country: "United Kingdom", locations: "London" } })
      .mockResolvedValueOnce(emptyOnboarding)
      .mockResolvedValueOnce({ status: "success", version: 1 })
      .mockResolvedValueOnce({
        ...emptyOnboarding,
        step: "customer",
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
      })
      .mockResolvedValueOnce({ status: "success", version: 2 })
      .mockResolvedValueOnce({
        ...emptyOnboarding,
        step: "business",
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
      })
      .mockResolvedValueOnce({ status: "success", version: 3 })
      .mockResolvedValueOnce({
        ...emptyOnboarding,
        step: "locations",
        membership: "pending",
        request: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          product: "TELLOYA",
          state: "MAILBOX_REQUIRED",
          version: 3,
          customerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          businessId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          declineReason: null,
          subscriptionId: null,
        },
        locations: [],
      })

    const result = await reconcileTelloyaSalesContext({ token, enquiryId })
    expect(result.ok).toBe(true)
    expect(result.exception).toBe("confirm_operating_location")
    const operations = mocks.rpc.mock.calls
      .filter(call => call[0] === "admin_commercial_command_v1")
      .map(call => call[1].p_operation)
    expect(operations).toEqual(["classify", "match_customer", "match_business"])
    expect(operations).not.toContain("select_locations")
    expect(operations).not.toContain("prepare_offer")
  })

  it("fails closed on ambiguous customers and does not create duplicates", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ status: "ready", demo_status: "COMPLETED" })
      .mockResolvedValueOnce({ payload: {} })
      .mockResolvedValueOnce({
        ...emptyOnboarding,
        step: "customer",
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
        candidates: [
          { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "One", emailVerified: true },
          { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Two", emailVerified: false },
        ],
      })
    const result = await reconcileTelloyaSalesContext({ token, enquiryId })
    expect(result.ok).toBe(false)
    expect(result.exception).toBe("resolve_customer")
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_commercial_command_v1")).toBe(false)
  })

  it("rejects a forged origin on the HTTP command", async () => {
    const response = await POST(req({ enquiryId }, { origin: "https://evil.example" }))
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
