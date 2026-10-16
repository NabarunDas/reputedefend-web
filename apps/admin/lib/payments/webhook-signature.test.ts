/**
 * Real Stripe HMAC verification. The settlement suite does not sign payloads.
 * PAY-ENV-03 remains the connected sandbox delivery proof.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import Stripe from "stripe"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", () => ({ backend: () => mocks }))

import { handleStripeWebhook } from "./webhook"

const secret = "whsec_test_secret_value"
const origin = "https://admin.profilerelaunch.com"

function payload(livemode: boolean) {
  return JSON.stringify({
    id: "evt_realsignature",
    object: "event",
    type: "checkout.session.completed",
    livemode,
    data: { object: { id: "cs_realsignature", object: "checkout.session" } },
  })
}

function request(raw: string, signature: string) {
  return new NextRequest(`${origin}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: raw,
  })
}

async function signatureFor(raw: string) {
  return Stripe.webhooks.generateTestHeaderStringAsync({ payload: raw, secret })
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ status: "success", duplicate: false })
  vi.stubEnv("PAYMENTS_PROVIDER_MODE", "stripe_test")
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholdernotarealkey")
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret)
})
afterEach(() => vi.unstubAllEnvs())

describe("stripe webhook signature", () => {
  it("accepts a Stripe-generated signature and stores one receipt", async () => {
    const raw = payload(false)
    const response = await handleStripeWebhook(request(raw, await signatureFor(raw)))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ status: "success", duplicate: false })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith("payment_receive_stripe_event_v1", {
      p_event_id: "evt_realsignature",
      p_type: "checkout.session.completed",
      p_object_id: "cs_realsignature",
      p_livemode: false,
    })
  })

  it("rejects a body that no longer matches the signature before any database write", async () => {
    const raw = payload(false)
    const signature = await signatureFor(raw)
    const response = await handleStripeWebhook(request(raw.replace("cs_realsignature", "cs_tamperedbody"), signature))
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ status: "unauthorized" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a correctly signed live event before any database write", async () => {
    const raw = payload(true)
    const response = await handleStripeWebhook(request(raw, await signatureFor(raw)))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ status: "livemode_mismatch" })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
