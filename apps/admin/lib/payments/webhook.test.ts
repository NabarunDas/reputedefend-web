import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), construct: vi.fn() }))
vi.mock("@/lib/auth/backend", () => ({ backend: () => mocks }))
vi.mock("../../../../lib/payments/stripe", () => ({
  constructStripeEvent: (...args: unknown[]) => mocks.construct(...args),
}))

import { handleStripeWebhook } from "./webhook"

const origin = "https://admin.profilerelaunch.com"

function req(raw: string, signature = "t=1,v1=sig") {
  return new NextRequest(`${origin}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: raw,
  })
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.construct.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("stripe webhook", () => {
  it("fails closed without a webhook secret and never parses before verification", async () => {
    const denied = await handleStripeWebhook(req("{\"id\":\"evt\"}"), "")
    expect(denied.status).toBe(503)
    expect(mocks.construct).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("verifies the raw body and enqueues one event receipt", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_secret_value")
    mocks.construct.mockReturnValue({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1" } } })
    mocks.rpc.mockResolvedValue({ status: "success", duplicate: false })
    const raw = "{\"id\":\"evt_1\",\"type\":\"checkout.session.completed\"}"
    const ok = await handleStripeWebhook(req(raw, "t=1,v1=good"))
    expect(ok.status).toBe(200)
    expect(mocks.construct).toHaveBeenCalledWith(raw, "t=1,v1=good", "whsec_test_secret_value")
    expect(mocks.rpc).toHaveBeenCalledWith("payment_receive_stripe_event_v1", {
      p_event_id: "evt_1", p_type: "checkout.session.completed", p_object_id: "cs_1",
    })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/sk_live|whsec_|client_secret/)
  })
})
