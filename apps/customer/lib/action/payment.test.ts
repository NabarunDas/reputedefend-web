import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => {
  class Disabled extends Error { name = "PaymentsDisabledError" }
  return {
    rpc: vi.fn(),
    Disabled,
    provider: {
      mode: "disabled" as string,
      createCustomer: vi.fn(async () => { throw new Disabled() }),
      createPaymentCheckout: vi.fn(async () => { throw new Disabled() }),
      createSetupCheckout: vi.fn(async () => { throw new Disabled() }),
      retrieveCheckout: vi.fn(async () => null),
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

import { paymentCommand } from "./payment"
import { sessionCookie } from "@/lib/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const replacementKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const replacementOp = "99999999-9999-4999-8999-999999999999"

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
  mocks.provider.mode = "disabled"
  mocks.provider.createCustomer.mockReset().mockImplementation(async () => { throw new mocks.Disabled() })
  mocks.provider.createPaymentCheckout.mockReset().mockImplementation(async () => { throw new mocks.Disabled() })
  mocks.provider.createSetupCheckout.mockReset().mockImplementation(async () => { throw new mocks.Disabled() })
  mocks.provider.retrieveCheckout.mockReset().mockResolvedValue(null)
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

  it("replaces an expired Checkout with a new provider operation and idempotency key", async () => {
    mocks.provider.mode = "fake"
    mocks.provider.retrieveCheckout.mockResolvedValue({
      id: "cs_old",
      mode: "payment",
      status: "expired",
      paymentStatus: "unpaid",
      paymentIntentId: "pi_old",
      setupIntentId: null,
      customerId: "cus_test",
      url: null,
      metadata: {},
      livemode: false,
    })
    mocks.provider.createPaymentCheckout.mockResolvedValue({
      id: "cs_new", url: "https://checkout.stripe.test/new", mode: "payment", amountMinor: 9900, livemode: false,
    })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_payment_command_v1") {
        return {
          status: "success", mode: "payment", amountMinor: 9900, customerId: key, serviceOrderId: key,
          obligationId: key, idempotencyKey: key, providerOperationId: key, checkoutSessionId: "cs_old",
        }
      }
      if (name === "payment_replace_expired_checkout_v1") {
        return { status: "success", providerOperationId: replacementOp, idempotencyKey: replacementKey, attemptId: key }
      }
      if (name === "payment_prepare_customer_v1") return { status: "success", stripeCustomerId: "cus_test" }
      return { status: "success" }
    })
    const response = await paymentCommand(req({ operation: "start_checkout" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "ok", checkoutUrl: "https://checkout.stripe.test/new" })
    expect(mocks.rpc).toHaveBeenCalledWith("payment_replace_expired_checkout_v1", { p_operation: key })
    expect(mocks.provider.createPaymentCheckout).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: replacementKey,
    }))
    expect(mocks.rpc).toHaveBeenCalledWith("payment_record_provider_refs_v1", expect.objectContaining({
      p_operation: replacementOp, p_object_id: "cs_new",
    }))
  })
})
