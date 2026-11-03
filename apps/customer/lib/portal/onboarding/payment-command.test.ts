import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  priceAmounts: [] as number[],
  priceIds: [] as string[],
  failPrice: false,
}))

vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

vi.mock("../../../../../lib/payments/fake", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/payments/fake")>("../../../../../lib/payments/fake")
  return {
    ...actual,
    createFakePaymentProvider: () => {
      const provider = actual.createFakePaymentProvider()
      const createRecurringPrice = provider.createRecurringPrice.bind(provider)
      provider.createRecurringPrice = async input => {
        mocks.priceAmounts.push(input.amountMinor)
        const created = await createRecurringPrice(input)
        mocks.priceIds.push(created.priceId)
        if (mocks.failPrice) {
          mocks.failPrice = false
          throw new Error("provider timeout")
        }
        return created
      }
      return provider
    },
  }
})

import { portalCommercialPaymentCommand } from "./payment-command"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "c".repeat(64)
const selector = "VC-26-AB2347"
const customerId = "22222222-2222-4222-8222-222222222222"
const subscriptionId = "44444444-4444-4444-8444-444444444444"
const acceptanceId = "55555555-5555-4555-8555-555555555555"
const priceOperationId = "66666666-6666-4666-8666-666666666666"
const checkoutOperationId = "77777777-7777-4777-8777-777777777777"
const priceKey = "88888888-8888-4888-8888-888888888888"
const checkoutKey = "99999999-9999-4999-8999-999999999999"

const prepared = {
  status: "success",
  existing: false,
  providerOperationId: checkoutOperationId,
  priceOperationId,
  idempotencyKey: checkoutKey,
  priceIdempotencyKey: priceKey,
  stripeCustomerId: null,
  stripePriceId: null,
  stripeProductId: null,
  checkoutSessionId: null,
  amountMinor: 8900,
  currency: "GBP",
  cadence: "MONTH",
  customerId,
  commercialSubscriptionId: subscriptionId,
  acceptanceId,
  taxBehaviour: "NOT_APPLICABLE",
  guardQuantity: 2,
  guardChargeMinor: 1998,
  overageOptIn: true,
  overageCapMinor: 2500,
  productName: "Complete",
  providerOperationStatus: "PENDING",
}

function req(body: unknown, url = `${origin}/api/portal/onboarding/payment`, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      origin: new URL(url).origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${portalSessionCookieName()}=${token}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_COMMERCIAL_CHECKOUT_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
  mocks.priceAmounts.length = 0
  mocks.priceIds.length = 0
  mocks.failPrice = false
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "customer_portal_commercial_payment_prepare_v1") return prepared
    if (name === "payment_prepare_customer_v1") {
      return {
        status: "success",
        providerOperationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }
    }
    if (name === "payment_record_customer_map_v1") return { status: "success", stripeCustomerId: "cus_commercialtest1" }
    if (name === "commercial_payment_record_price_v1") return { status: "success" }
    if (name === "commercial_payment_record_checkout_v1") return { status: "success", activated: false }
    return null
  })
})

afterEach(() => vi.unstubAllEnvs())

describe("commercial payment preparation command", () => {
  it("stays closed when checkout is off and does not call the database", async () => {
    vi.stubEnv("CUSTOMER_COMMERCIAL_CHECKOUT_ENABLED", "")
    expect((await portalCommercialPaymentCommand(req({ selector }))).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("accepts only the offer selector from the browser", async () => {
    const extra = await portalCommercialPaymentCommand(req({ selector, amountMinor: 1, customerId }))
    expect(extra.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    const missing = await portalCommercialPaymentCommand(req({}))
    expect(missing.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("opens one local checkout for the accepted amount and does not treat the URL as payment", async () => {
    const response = await portalCommercialPaymentCommand(req({ selector }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(["checkoutUrl", "message", "status"])
    expect(body.status).toBe("ok")
    expect(body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.test\/sub\//)
    expect(body.message).toMatch(/does not record a payment/)
    expect(JSON.stringify(body)).not.toMatch(/cus_|price_|cs_|providerOperationId/)
    expect(mocks.priceAmounts).toEqual([8900])
    expect(mocks.priceIds[0]).toMatch(/^price_[A-Za-z0-9]+$/)
    const names = mocks.rpc.mock.calls.map(call => call[0])
    expect(names).toContain("customer_portal_commercial_payment_prepare_v1")
    expect(names).not.toContain("commercial_payment_evidence")
    const checkout = mocks.rpc.mock.calls.find(call => call[0] === "commercial_payment_record_checkout_v1")
    expect(checkout?.[1]).toMatchObject({ p_operation: checkoutOperationId })
    expect(checkout?.[1].p_session_id).toMatch(/^cs_[A-Za-z0-9]+$/)
  })

  it("reuses the reserved price after a provider timeout and does not activate a succeeded checkout", async () => {
    mocks.failPrice = true
    const failed = await portalCommercialPaymentCommand(req({ selector }))
    expect(failed.status).toBe(503)
    const retried = await portalCommercialPaymentCommand(req({ selector }))
    expect(retried.status).toBe(200)
    expect(mocks.priceAmounts).toEqual([8900, 8900])
    expect(mocks.priceIds[0]).toBe(mocks.priceIds[1])
    expect(mocks.priceAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(17800)

    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_commercial_payment_prepare_v1") {
        return { ...prepared, providerOperationStatus: "SUCCEEDED", stripePriceId: mocks.priceIds[0] }
      }
      return { status: "success", activated: true }
    })
    const before = mocks.priceIds.length
    const confirming = await portalCommercialPaymentCommand(req({ selector }))
    expect(confirming.status).toBe(200)
    const confirmingBody = await confirming.json()
    expect(confirmingBody).toMatchObject({ status: "confirming" })
    expect(JSON.stringify(confirmingBody)).not.toMatch(/checkoutUrl/)
    expect(mocks.priceIds).toHaveLength(before)
    expect(mocks.rpc.mock.calls.filter(call => call[0] === "commercial_payment_record_checkout_v1")).toHaveLength(1)
  })

  it("does not reserve a checkout on a deployed lane when payments are not enabled", async () => {
    const preview = "https://commercial-pay.vercel.app"
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_URL", "commercial-pay.vercel.app")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    const response = await portalCommercialPaymentCommand(req({ selector }, `${preview}/api/portal/onboarding/payment`))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/Payment setup is being prepared/) })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.priceAmounts).toEqual([])
  })
})
