import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => {
  class Disabled extends Error { name = "PaymentsDisabledError" }
  return {
    rpc: vi.fn(),
    Disabled,
    provider: {
      mode: "disabled" as string,
      createCustomer: vi.fn(async (): Promise<{ id: string; livemode: false }> => { throw new Disabled() }),
      syncCustomerEmail: vi.fn(async (): Promise<{ id: string; email: string; livemode: false }> => { throw new Disabled() }),
      createPaymentCheckout: vi.fn(async (): Promise<{ id: string; url: string; mode: "payment"; amountMinor: number; livemode: false }> => { throw new Disabled() }),
      createSetupCheckout: vi.fn(async (): Promise<{ id: string; url: string; mode: "setup"; amountMinor: number; livemode: false }> => { throw new Disabled() }),
      retrieveCheckout: vi.fn(async (): Promise<{
        id: string
        mode: "payment" | "setup"
        status: string
        paymentStatus: string | null
        paymentIntentId: string | null
        setupIntentId: string | null
        customerId: string | null
        url: string | null
        metadata: Record<string, string>
        livemode: false
      } | null> => null),
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
  mocks.provider.syncCustomerEmail.mockReset().mockImplementation(async () => { throw new mocks.Disabled() })
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
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_RELAUNCH", amountMinor: 9900, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      if (name === "payment_prepare_customer_v1") return { status: "success", stripeCustomerId: "cus_test" }
      return { status: "success" }
    })
    mocks.provider.syncCustomerEmail.mockResolvedValue({ id: "cus_test", email: "buyer@example.com", livemode: false })
    const response = await paymentCommand(req({ operation: "start_checkout" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "ok", checkoutUrl: "https://checkout.stripe.test/new" })
    expect(mocks.rpc).toHaveBeenCalledWith("payment_replace_expired_checkout_v1", { p_operation: key })
    expect(mocks.provider.createPaymentCheckout).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: replacementKey,
      amountMinor: 9900,
      serviceCode: "GUIDED_RELAUNCH",
    }))
    expect(mocks.rpc).toHaveBeenCalledWith("payment_record_provider_refs_v1", expect.objectContaining({
      p_operation: replacementOp, p_object_id: "cs_new",
    }))
  })

  it("does not return, redirect, or replace an open Checkout session whose URL is untrusted", async () => {
    mocks.provider.mode = "fake"
    mocks.provider.retrieveCheckout.mockResolvedValue({
      id: "cs_evil",
      mode: "payment",
      status: "open",
      paymentStatus: "unpaid",
      paymentIntentId: null,
      setupIntentId: null,
      customerId: "cus_test",
      url: "https://checkout.stripe.com.evil.example/pay",
      metadata: {},
      livemode: false,
    })
    mocks.rpc.mockResolvedValue({
      status: "success", mode: "payment", amountMinor: 9900, customerId: key, serviceOrderId: key,
      obligationId: key, idempotencyKey: key, providerOperationId: key, checkoutSessionId: "cs_evil",
    })
    const response = await paymentCommand(req({ operation: "start_checkout" }))
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
    const body = await response.text()
    expect(body).not.toContain("evil.example")
    expect(body).not.toContain("checkoutUrl")
    expect(body).not.toMatch(/paid|successful/i)
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalledWith("payment_replace_expired_checkout_v1", expect.anything())
  })

  it("does not return a newly created Checkout URL that fails the host check", async () => {
    mocks.provider.mode = "fake"
    mocks.provider.createPaymentCheckout.mockResolvedValue({
      id: "cs_js", url: "javascript:alert(1)", mode: "payment", amountMinor: 9900, livemode: false,
    })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_payment_command_v1") {
        return {
          status: "success", mode: "payment", amountMinor: 9900, customerId: key, serviceOrderId: key,
          obligationId: key, idempotencyKey: key, providerOperationId: key,
        }
      }
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_RELAUNCH", amountMinor: 9900, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      if (name === "payment_prepare_customer_v1") return { status: "success", stripeCustomerId: "cus_test" }
      return { status: "success" }
    })
    mocks.provider.syncCustomerEmail.mockResolvedValue({ id: "cus_test", email: "buyer@example.com", livemode: false })
    const response = await paymentCommand(req({ operation: "start_checkout" }))
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
    const body = await response.text()
    expect(body).not.toContain("javascript:")
    expect(body).not.toContain("checkoutUrl")
    expect(JSON.parse(body)).toMatchObject({ status: "disabled" })
  })

  it("labels Checkout from the accepted order and prefills only the verified email", async () => {
    mocks.provider.mode = "fake"
    mocks.provider.createPaymentCheckout.mockResolvedValue({
      id: "cs_new", url: "https://checkout.stripe.com/c/pay/cs_new", mode: "payment", amountMinor: 5900, livemode: false,
    })
    mocks.provider.syncCustomerEmail.mockResolvedValue({ id: "cus_test", email: "buyer@example.com", livemode: false })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_payment_command_v1") {
        return {
          status: "success", mode: "payment", amountMinor: 5900, customerId: key, serviceOrderId: key,
          obligationId: key, idempotencyKey: key, providerOperationId: key,
        }
      }
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_REVIEW", amountMinor: 5900, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      if (name === "payment_prepare_customer_v1") return { status: "success", stripeCustomerId: "cus_test" }
      return { status: "success" }
    })
    const response = await paymentCommand(req({
      operation: "start_checkout", productName: "ProfileRelaunch service", email: "attacker@example.com", amountMinor: 1,
    }))
    expect(response.status).toBe(200)
    expect(mocks.provider.syncCustomerEmail).toHaveBeenCalledWith(expect.objectContaining({
      stripeCustomerId: "cus_test", customerId: key, email: "buyer@example.com",
    }))
    expect(JSON.stringify(mocks.provider.syncCustomerEmail.mock.calls)).not.toContain("attacker@example.com")
    expect(mocks.provider.createPaymentCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 5900, currency: "GBP", serviceCode: "GUIDED_REVIEW",
    }))
    const checkoutCalls = JSON.stringify(mocks.provider.createPaymentCheckout.mock.calls)
    expect(checkoutCalls).not.toContain("\"email\"")
    expect(checkoutCalls).not.toContain("attacker@example.com")
    expect(checkoutCalls).not.toContain("ProfileRelaunch service")
    expect(mocks.rpc).toHaveBeenCalledWith("payment_checkout_presentation_v1", {
      p_customer: key, p_service_order: key,
    })
  })

  it("fails visibly when the account email is not verified and does not open Checkout", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_payment_command_v1") {
        return {
          status: "success", mode: "payment", amountMinor: 9900, customerId: key, serviceOrderId: key,
          obligationId: key, idempotencyKey: key, providerOperationId: key,
        }
      }
      if (name === "payment_checkout_presentation_v1") return { status: "denied", reason: "email_unverified" }
      return { status: "success" }
    })
    const response = await paymentCommand(req({ operation: "start_checkout", email: "attacker@example.com" }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      status: "disabled",
      message: "Checkout cannot open until the email on this account is verified.",
    })
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
    expect(mocks.provider.createCustomer).not.toHaveBeenCalled()
    expect(mocks.provider.syncCustomerEmail).not.toHaveBeenCalled()
  })

  it("refuses a Checkout whose amount does not match the accepted order", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_payment_command_v1") {
        return {
          status: "success", mode: "payment", amountMinor: 9900, customerId: key, serviceOrderId: key,
          obligationId: key, idempotencyKey: key, providerOperationId: key,
        }
      }
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_RELAUNCH", amountMinor: 100, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      return { status: "success" }
    })
    const response = await paymentCommand(req({ operation: "start_checkout" }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ status: "disabled", message: "Secure Stripe Checkout is not available yet." })
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
  })
})
