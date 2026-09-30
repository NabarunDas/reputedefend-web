import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => {
  class Disabled extends Error { name = "PaymentsDisabledError" }
  return {
    rpc: vi.fn(),
    Disabled,
    provider: {
      createCustomer: vi.fn(async () => { throw new Disabled() }),
      createSubscriptionCheckout: vi.fn(async () => { throw new Disabled() }),
      createSetupCheckout: vi.fn(async () => { throw new Disabled() }),
      setCancelAtPeriodEnd: vi.fn(async () => { throw new Disabled() }),
    },
  }
})
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => mocks,
  tokenHash: (value: string) => `hash:${value}`,
  validToken: (value?: string) => !!value && value.length === 64,
}))
vi.mock("../../../../lib/payments", () => ({
  paymentProvider: () => mocks.provider,
}))
vi.mock("../../../../lib/payments/provider", () => ({
  PaymentsDisabledError: mocks.Disabled,
}))

import { POST as guardPost } from "@/app/api/action/guard-subscription/route"
import { sessionCookie } from "@/lib/config"

const origin = "https://customer.profilerelaunch.com"
function req(body: unknown) {
  return new NextRequest(`${origin}/api/action/guard-subscription`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: `${sessionCookie}=${"c".repeat(64)}`,
      "idempotency-key": "33333333-3333-4333-8333-333333333333",
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_AUTH_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("customer Guard subscription HTTP", () => {
  it("fails closed when Stripe is disabled and does not invent a refund", async () => {
    mocks.rpc.mockResolvedValue({
      status: "success",
      providerOperationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      stripePriceId: "price_test",
      customerId: "22222222-2222-4222-8222-222222222222",
      serviceOrderId: "55555555-5555-4555-8555-555555555555",
      guardSubscriptionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mode: "subscription",
    })
    const checkout = await guardPost(req({ operation: "start_checkout" }))
    expect(checkout.status).toBe(503)
    expect(await checkout.json()).toMatchObject({ status: "disabled" })
    mocks.rpc.mockResolvedValue({ status: "success", reviewRequired: true })
    const immediate = await guardPost(req({ operation: "request_immediate_cancellation" }))
    expect(immediate.status).toBe(200)
    expect(JSON.stringify(await immediate.json())).toMatch(/not promised/)
  })
})
