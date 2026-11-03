import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

import { portalCommercialOfferCommand } from "./offer-command"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "c".repeat(64)

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/portal/onboarding/offer`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${portalSessionCookieName()}=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const accept = {
  selector: "VC-26-AB2347",
  offerVersion: 2,
  priceMinor: 4900,
  taxBehaviour: "NOT_APPLICABLE",
  taxMinor: null,
  cadence: "MONTH",
  agreementRef: "TELLOYA-TERMS-1",
  agreementAccepted: true,
  recurringConsent: true,
  confirmations: { business_authority: true },
  conditions: {
    tier: "Growth",
    includedMinutes: 300,
    minutesRollover: false,
    baseAmountMinor: 4900,
    guardIncluded: false,
    guardUnitMinor: null,
    guardQuantity: 0,
    overagePermitted: true,
    overageRateMinor: 25,
    overageOptIn: false,
    overageCapMinor: null,
  },
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_COMMERCIAL_OFFER_ACCEPT_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("commercial offer acceptance command", () => {
  it("stays closed when acceptance is off and does not call the database", async () => {
    vi.stubEnv("CUSTOMER_COMMERCIAL_OFFER_ACCEPT_ENABLED", "")
    expect((await portalCommercialOfferCommand(req(accept))).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("sends the session hash, selector and explicit consent only", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "success", existing: false, offerRef: accept.selector })
    const response = await portalCommercialOfferCommand(req(accept))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "success" })
    expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_commercial_offer_command_v1", {
      p_token_hash: `hash-${token.slice(0, 8)}`,
      p_request: key,
      p_selector: accept.selector,
      p_data: {
        offerVersion: 2,
        priceMinor: 4900,
        taxBehaviour: "NOT_APPLICABLE",
        taxMinor: null,
        cadence: "MONTH",
        agreementRef: "TELLOYA-TERMS-1",
        agreementAccepted: true,
        recurringConsent: true,
        confirmations: { business_authority: true },
        conditions: accept.conditions,
      },
    })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/customerId|businessId|subscriptionId|agreementHash/)
  })

  it("requires agreement and recurring consent, and keeps failed outcomes distinct", async () => {
    const unchecked = await portalCommercialOfferCommand(req({ ...accept, agreementAccepted: false }))
    expect(unchecked.status).toBe(400)
    const missingConsent = await portalCommercialOfferCommand(req({ ...accept, recurringConsent: false }))
    expect(missingConsent.status).toBe(400)
    const inventedCap = await portalCommercialOfferCommand(req({
      ...accept,
      conditions: { ...accept.conditions, overageOptIn: true, overageCapMinor: null },
    }))
    expect(inventedCap.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValueOnce(null)
    expect((await portalCommercialOfferCommand(req(accept))).status).toBe(401)
    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    expect((await portalCommercialOfferCommand(req(accept))).status).toBe(409)
    mocks.rpc.mockResolvedValueOnce({ status: "withdrawn", offerRef: accept.selector })
    const withdrawn = await portalCommercialOfferCommand(req(accept))
    expect(withdrawn.status).toBe(409)
    expect(await withdrawn.json()).toEqual({ message: "This offer has been withdrawn. It cannot be accepted." })
    mocks.rpc.mockRejectedValueOnce(new Error("missing function"))
    const missing = await portalCommercialOfferCommand(req(accept))
    expect(missing.status).toBe(503)
    expect(JSON.stringify(await missing.json())).not.toMatch(/no offer/i)
  })
})
