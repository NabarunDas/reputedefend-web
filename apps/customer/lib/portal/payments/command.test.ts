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
      syncCustomerEmail: vi.fn(async (): Promise<{ id: string; email: string; livemode: false }> => { throw new Disabled() }),
      createPaymentCheckout: vi.fn(async (_input?: { idempotencyKey?: string; amountMinor?: number; serviceCode?: string }): Promise<{ id: string; url: string; mode: "payment"; amountMinor: number; livemode: false }> => { throw new Disabled() }),
      createSetupCheckout: vi.fn(async () => { throw new Disabled() }),
      retrieveCheckout: vi.fn(async (_id?: string): Promise<Record<string, unknown> | null> => null),
      retrievePaymentIntent: vi.fn(async (_id?: string): Promise<Record<string, unknown> | null> => null),
      expireCheckout: vi.fn(async (_input?: { id: string; idempotencyKey: string }): Promise<Record<string, unknown>> => { throw new Disabled() }),
      cancelPaymentIntent: vi.fn(async () => ({ cancelled: false, alreadySucceeded: false, status: "open" })),
    },
  }
})
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
vi.mock("../../../../../lib/payments", () => ({
  paymentProvider: () => mocks.provider,
  paymentProviderWithLane: () => mocks.provider,
}))
vi.mock("../../../../../lib/payments/provider", () => ({ PaymentsDisabledError: mocks.Disabled }))

import { portalPaymentCommand } from "./command"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "c".repeat(64)
const selector = `ca-${"ab".repeat(32)}`
const secret = "https://pay.stripe.com/secret"
const providerId = "pi_secretintent"

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/portal/payments`, {
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

const checkout = {
  reference: "PR-26-ABCDEF",
  selector,
  operation: "start_checkout",
  confirmation: {},
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
  mocks.provider.createPaymentCheckout.mockReset().mockImplementation(async () => { throw new mocks.Disabled() })
  mocks.provider.syncCustomerEmail.mockReset().mockImplementation(async () => { throw new mocks.Disabled() })
  mocks.provider.cancelPaymentIntent.mockReset().mockResolvedValue({ cancelled: false, alreadySucceeded: false, status: "open" })
  mocks.provider.retrieveCheckout.mockReset().mockResolvedValue(null)
  mocks.provider.retrievePaymentIntent.mockReset().mockResolvedValue(null)
  mocks.provider.expireCheckout.mockReset().mockImplementation(async () => { throw new mocks.Disabled() })
})
afterEach(() => vi.unstubAllEnvs())

describe("portal payment command", () => {
  it("hides the command when the portal gate is off and rejects a forged customer id", async () => {
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect((await portalPaymentCommand(req(checkout))).status).toBe(404)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    const extra = await portalPaymentCommand(req({ ...checkout, customerId: key }))
    expect(extra.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not report a payment as successful when checkout is disabled", async () => {
    mocks.rpc.mockResolvedValue({
      status: "success",
      mode: "payment",
      amountMinor: 9900,
      customerId: key,
      providerOperationId: key,
      idempotencyKey: key,
      paymentIntentId: providerId,
      checkoutSessionId: "cs_secret",
    })
    const response = await portalPaymentCommand(req(checkout))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({ status: "disabled", message: "Secure Stripe Checkout is not available yet." })
    expect(JSON.stringify(body)).not.toMatch(/paid|successful|cs_secret|pi_secret|customerId/i)
  })

  it("records consent without returning an internal id or a paid result", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", consentId: key, consentVersion: "SUCCESS_FEE_CONSENT_V1" })
    const response = await portalPaymentCommand(req({
      ...checkout,
      operation: "confirm_consent",
      confirmation: { accepted: true },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok", message: "Consent recorded. No fee is due today." })
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
  })

  it("does not return an untrusted portal Checkout URL or mark the payment successful", async () => {
    mocks.provider.createPaymentCheckout.mockResolvedValue({
      id: "cs_evil",
      url: "https://checkout.stripe.com.evil.example/pay",
      mode: "payment",
      amountMinor: 9900,
      livemode: false,
    })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_payment_command_v1") {
        return {
          status: "success",
          mode: "payment",
          amountMinor: 9900,
          customerId: key,
          providerOperationId: key,
          idempotencyKey: key,
          serviceOrderId: key,
          obligationId: key,
        }
      }
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_RELAUNCH", amountMinor: 9900, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      if (name === "payment_prepare_customer_v1") return { stripeCustomerId: "cus_test" }
      return { status: "success" }
    })
    mocks.provider.syncCustomerEmail.mockResolvedValue({ id: "cus_test", email: "buyer@example.com", livemode: false })
    const response = await portalPaymentCommand(req(checkout))
    expect(response.status).toBe(503)
    expect(response.headers.get("location")).toBeNull()
    const text = await response.text()
    expect(text).not.toContain("evil.example")
    expect(text).not.toContain("checkoutUrl")
    expect(text).not.toMatch(/paid|successful/i)
    expect(mocks.provider.createPaymentCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 9900,
      serviceCode: "GUIDED_RELAUNCH",
    }))
  })

  it("rejects a browser service name before any payment command", async () => {
    const extra = await portalPaymentCommand(req({ ...checkout, productName: "ProfileRelaunch service", email: "attacker@example.com" }))
    expect(extra.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
  })

  it("shows that Checkout cannot open until the account email is verified", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_payment_command_v1") {
        return {
          status: "success", mode: "payment", amountMinor: 9900, customerId: key,
          providerOperationId: key, idempotencyKey: key, serviceOrderId: key, obligationId: key,
        }
      }
      if (name === "payment_checkout_presentation_v1") return { status: "denied", reason: "email_unverified" }
      return { status: "success" }
    })
    const response = await portalPaymentCommand(req(checkout))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      status: "disabled",
      message: "Checkout cannot open until the email on this account is verified.",
    })
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
  })

  it("rejects mark_paid, a stale replay and a signed-out session", async () => {
    expect((await portalPaymentCommand(req({ ...checkout, operation: "mark_paid" }))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    expect((await portalPaymentCommand(req(checkout))).status).toBe(409)
    mocks.rpc.mockResolvedValueOnce(null)
    expect((await portalPaymentCommand(req(checkout))).status).toBe(401)
    const foreign = await portalPaymentCommand(req(checkout, { origin: "https://evil.example" }))
    expect(foreign.status).toBe(401)
  })

  it("keeps a recovery confirmation from claiming the payment succeeded", async () => {
    mocks.rpc.mockResolvedValue({ status: "needs_cancel", paymentIntentId: providerId, providerOperationId: key, idempotencyKey: key })
    mocks.provider.cancelPaymentIntent.mockResolvedValue({ cancelled: false, alreadySucceeded: true, status: "succeeded" })
    mocks.rpc.mockResolvedValueOnce({ status: "needs_cancel", paymentIntentId: providerId, providerOperationId: key, idempotencyKey: key })
    const response = await portalPaymentCommand(req(checkout))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ status: "ok", confirming: true, message: "We're confirming your payment." })
    expect(JSON.stringify(body)).not.toMatch(/successful|paymentIntent|pi_secret/)
  })
})

const operationId = "44444444-4444-4444-8444-444444444444"
const successorId = "55555555-5555-4555-8555-555555555555"
const successorKey = "66666666-6666-4666-8666-666666666666"
const otherKey = "77777777-7777-4777-8777-777777777777"
const freshUrl = "https://checkout.stripe.com/c/pay/cs_fresh"

function openSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_old",
    mode: "payment",
    status: "open",
    paymentStatus: "unpaid",
    paymentIntentId: null,
    setupIntentId: null,
    customerId: "cus_test",
    url: "https://checkout.stripe.com/c/pay/cs_old",
    metadata: {
      customerId: key,
      serviceOrderId: key,
      obligationId: key,
      providerOperationId: operationId,
    },
    livemode: false,
    amountMinor: 9900,
    currency: "gbp",
    ...overrides,
  }
}

function recordedAttempt() {
  return {
    status: "recorded",
    providerOperationId: operationId,
    idempotencyKey: operationId,
    attemptId: key,
    amountMinor: 9900,
    currency: "GBP",
    mode: "payment",
    customerId: key,
    serviceOrderId: key,
    obligationId: key,
    orderRef: "SO-26-ABCDEF",
    checkoutSessionId: "cs_old",
  }
}

function successor() {
  return {
    status: "success",
    providerOperationId: successorId,
    idempotencyKey: successorKey,
    attemptId: key,
    amountMinor: 9900,
    currency: "GBP",
    mode: "payment",
    customerId: key,
    serviceOrderId: key,
    obligationId: key,
    orderRef: "SO-26-ABCDEF",
  }
}

const refresh = { ...checkout, operation: "refresh_checkout" }

describe("explicit checkout refresh", () => {
  function wire(attempt: () => unknown = recordedAttempt) {
    mocks.provider.mode = "fake"
    mocks.provider.retrieveCheckout.mockResolvedValue(openSession())
    mocks.provider.expireCheckout.mockResolvedValue({ id: "cs_old", status: "expired", paymentStatus: "unpaid", livemode: false })
    mocks.provider.createPaymentCheckout.mockResolvedValue({
      id: "cs_fresh", url: freshUrl, mode: "payment", amountMinor: 9900, livemode: false,
    })
    mocks.provider.syncCustomerEmail.mockResolvedValue({ id: "cus_test", email: "buyer@example.com", livemode: false })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_checkout_attempt_v1") return attempt()
      if (name === "customer_portal_checkout_refresh_v1") return successor()
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_RELAUNCH", amountMinor: 9900, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      if (name === "payment_prepare_customer_v1") return { stripeCustomerId: "cus_test" }
      return { status: "success" }
    })
  }

  it("expires the owned unpaid session and opens one branded Checkout for the same order", async () => {
    wire()
    const response = await portalPaymentCommand(req(refresh))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok", checkoutUrl: freshUrl, confirming: true })
    expect(mocks.provider.expireCheckout).toHaveBeenCalledWith({ id: "cs_old", idempotencyKey: operationId })
    expect(mocks.provider.createPaymentCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 9900,
      serviceCode: "GUIDED_RELAUNCH",
      idempotencyKey: successorKey,
    }))
    expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_checkout_refresh_v1", expect.objectContaining({
      p_operation: operationId,
      p_request: key,
    }))
    const refreshArgs = JSON.stringify(mocks.rpc.mock.calls.find(call => call[0] === "customer_portal_checkout_refresh_v1"))
    expect(refreshArgs).not.toContain("cs_old")
    expect(JSON.stringify(mocks.provider.createPaymentCheckout.mock.calls)).not.toContain("buyer@example.com")
    expect(JSON.stringify(mocks.provider.syncCustomerEmail.mock.calls)).toContain("buyer@example.com")
  })

  it("keeps Pay on the open session and does not expire it", async () => {
    mocks.provider.retrieveCheckout.mockResolvedValue(openSession())
    mocks.rpc.mockResolvedValue({
      status: "success", mode: "payment", amountMinor: 9900, customerId: key, serviceOrderId: key,
      obligationId: key, providerOperationId: operationId, idempotencyKey: operationId, checkoutSessionId: "cs_old",
    })
    const response = await portalPaymentCommand(req(checkout))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ checkoutUrl: "https://checkout.stripe.com/c/pay/cs_old" })
    expect(mocks.provider.expireCheckout).not.toHaveBeenCalled()
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalledWith("customer_portal_checkout_refresh_v1", expect.anything())
  })

  it("rejects a browser session id or service name before closing anything", async () => {
    const extra = await portalPaymentCommand(req({ ...refresh, checkoutSessionId: "cs_browser", productName: "ProfileRelaunch service" }))
    expect(extra.status).toBe(401)
    const nested = await portalPaymentCommand(req({ ...refresh, confirmation: { checkoutSessionId: "cs_browser" } }))
    expect(nested.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.provider.expireCheckout).not.toHaveBeenCalled()
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
  })

  it("does not expire or replace a paid, processing, mismatched, live, or stale session", async () => {
    const cases = [
      openSession({ status: "complete", paymentStatus: "paid" }),
      openSession({ paymentIntentId: "pi_processing" }),
      openSession({ metadata: { customerId: otherKey, serviceOrderId: key, obligationId: key, providerOperationId: operationId } }),
      openSession({ livemode: true }),
      openSession({ amountMinor: 100 }),
    ]
    for (const session of cases) {
      mocks.rpc.mockReset()
      mocks.provider.expireCheckout.mockClear()
      mocks.provider.createPaymentCheckout.mockClear()
      wire()
      mocks.provider.retrieveCheckout.mockResolvedValue(session)
      if (session.paymentIntentId === "pi_processing") {
        mocks.provider.retrievePaymentIntent.mockResolvedValue({ status: "processing" })
      }
      const response = await portalPaymentCommand(req(refresh))
      const body = await response.json()
      expect(mocks.provider.expireCheckout).not.toHaveBeenCalled()
      expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
      expect(mocks.rpc).not.toHaveBeenCalledWith("customer_portal_checkout_refresh_v1", expect.anything())
      expect(JSON.stringify(body)).not.toMatch(/cs_|pi_|buyer@|successful/)
      if (session.paymentStatus === "paid" || session.paymentIntentId === "pi_processing") {
        expect(body).toEqual({ status: "ok", confirming: true, message: "We're confirming your payment." })
      } else {
        expect(response.status).toBe(409)
        expect(body.message).toBe("We couldn't close the old payment page. No payment has been taken. Please try again shortly.")
      }
    }
  })

  it("stops when expiry races with a completed payment and does not open a second session", async () => {
    wire()
    let reads = 0
    mocks.provider.retrieveCheckout.mockImplementation(async () => {
      reads += 1
      return reads === 1 ? openSession() : openSession({ status: "complete", paymentStatus: "paid" })
    })
    mocks.provider.expireCheckout.mockRejectedValue(new Error("session is no longer open"))
    const response = await portalPaymentCommand(req(refresh))
    expect(await response.json()).toEqual({ status: "ok", confirming: true, message: "We're confirming your payment." })
    expect(mocks.provider.createPaymentCheckout).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalledWith("customer_portal_checkout_refresh_v1", expect.anything())
  })

  it("replaces an already expired unpaid session without calling expire again", async () => {
    wire()
    mocks.provider.retrieveCheckout.mockResolvedValue(openSession({ status: "expired", url: null }))
    const response = await portalPaymentCommand(req(refresh))
    expect(response.status).toBe(200)
    expect(mocks.provider.expireCheckout).not.toHaveBeenCalled()
    expect(mocks.provider.createPaymentCheckout).toHaveBeenCalledTimes(1)
  })

  it("uses one successor when two refreshes overlap, and a repeated key does not expire the new session", async () => {
    wire()
    let attempts = 0
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "customer_portal_checkout_attempt_v1") {
        attempts += 1
        if (attempts > 2) {
          return { ...successor(), checkoutSessionId: "cs_fresh" }
        }
        return recordedAttempt()
      }
      if (name === "customer_portal_checkout_refresh_v1") return successor()
      if (name === "payment_checkout_presentation_v1") {
        return { status: "success", serviceCode: "GUIDED_RELAUNCH", amountMinor: 9900, currency: "GBP", verifiedEmail: "buyer@example.com" }
      }
      if (name === "payment_prepare_customer_v1") return { stripeCustomerId: "cus_test" }
      return { status: "success" }
    })
    mocks.provider.retrieveCheckout.mockImplementation(async (id?: string) => (
      id === "cs_fresh"
        ? openSession({ id, url: freshUrl })
        : openSession()
    ))
    const secondKey = "88888888-8888-4888-8888-888888888888"
    const [first, second] = await Promise.all([
      portalPaymentCommand(req(refresh)),
      portalPaymentCommand(req(refresh, { "idempotency-key": secondKey })),
    ])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const createdKeys = mocks.provider.createPaymentCheckout.mock.calls.map(call => call[0]?.idempotencyKey)
    expect(new Set(createdKeys)).toEqual(new Set([successorKey]))
    const expired = mocks.provider.expireCheckout.mock.calls.length
    const replay = await portalPaymentCommand(req(refresh))
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ checkoutUrl: freshUrl })
    expect(mocks.provider.expireCheckout).toHaveBeenCalledTimes(expired)
    expect(mocks.provider.createPaymentCheckout.mock.calls.length).toBe(createdKeys.length)
  })
})
