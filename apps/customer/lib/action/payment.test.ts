import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => {
  class Disabled extends Error { name = "PaymentsDisabledError" }
  return { rpc: vi.fn(), Disabled }
})
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => mocks,
  tokenHash: (value: string) => `hash:${value}`,
  validToken: (value?: string) => !!value && value.length === 64,
}))
vi.mock("../../../../lib/payments", () => ({
  paymentProvider: () => ({
    mode: "disabled",
    createCustomer: async () => { throw new mocks.Disabled() },
    createPaymentCheckout: async () => { throw new mocks.Disabled() },
    createSetupCheckout: async () => { throw new mocks.Disabled() },
  }),
}))
vi.mock("../../../../lib/payments/provider", () => ({
  PaymentsDisabledError: mocks.Disabled,
}))

import { paymentCommand } from "./payment"
import { sessionCookie } from "@/lib/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"

function req(body: unknown) {
  return new NextRequest(`${origin}/api/action/payment`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}` },
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

describe("customer payment command", () => {
  it("fails closed when Stripe Checkout is disabled", async () => {
    mocks.rpc.mockResolvedValue({
      status: "success", mode: "payment", amountMinor: 9900, customerId: key, serviceOrderId: key, obligationId: key, idempotencyKey: key,
    })
    const response = await paymentCommand(req({ operation: "start_checkout" }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ status: "disabled" })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/sk_live|client_secret/)
  })

  it("rejects guessed operations", async () => {
    const denied = await paymentCommand(req({ operation: "mark_paid" }))
    expect(denied.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
