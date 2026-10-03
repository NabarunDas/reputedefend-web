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
      cancelPaymentIntent: vi.fn(async () => ({ cancelled: false, alreadySucceeded: false, status: "open" })),
    },
  }
})
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
vi.mock("../../../../../lib/payments", () => ({ paymentProvider: () => mocks.provider }))
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
  mocks.provider.cancelPaymentIntent.mockReset().mockResolvedValue({ cancelled: false, alreadySucceeded: false, status: "open" })
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
