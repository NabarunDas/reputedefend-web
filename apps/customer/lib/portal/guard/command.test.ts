import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

import { portalGuardCommand } from "./command"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "c".repeat(64)
const selector = `gd-${"ab".repeat(32)}`
const action = `ca-${"cd".repeat(32)}`

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/portal/guard`, {
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

const permission = {
  selector,
  actionSelector: action,
  operation: "accept_permission",
  confirmation: { accepted: true, permissionVersion: "GUARD_PERMISSION_V1" },
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("GUARD_SUBSCRIPTIONS_ENABLED", "")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("portal guard command", () => {
  it("hides the command when the portal gate is off and rejects a forged identifier", async () => {
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect((await portalGuardCommand(req(permission))).status).toBe(404)
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    const customer = await portalGuardCommand(req({ ...permission, customerId: key }))
    const subscription = await portalGuardCommand(req({ ...permission, subscriptionId: key }))
    expect(customer.status).toBe(401)
    expect(subscription.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("records permission, consent and a price response without a provider success", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "success", actionStatus: "COMPLETED", permissionId: key })
    const accepted = await portalGuardCommand(req(permission))
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({
      status: "ok",
      message: "Guard permission is recorded. Monitoring does not start until ProfileRelaunch activates it.",
    })

    mocks.rpc.mockResolvedValueOnce({ status: "success", actionStatus: "DECLINED" })
    const declined = await portalGuardCommand(req({ ...permission, operation: "decline_permission", confirmation: {} }))
    expect(await declined.json()).toEqual({ status: "ok", message: "Guard permission is declined." })

    mocks.rpc.mockResolvedValueOnce({ status: "success", consentId: key, subscriptionId: key })
    const consent = await portalGuardCommand(req({
      ...permission,
      operation: "accept_consent",
      confirmation: { accepted: true, consentVersion: "GUARD_RECURRING_CONSENT_V1" },
    }))
    expect(await consent.json()).toEqual({
      status: "ok",
      message: "Monthly billing consent is recorded. No subscription is active until a confirmed invoice payment.",
    })

    mocks.rpc.mockResolvedValueOnce({
      status: "success",
      stripeSubscriptionId: "sub_secret",
      stripeCustomerId: "cus_secret",
      newStripePriceId: "price_secret",
      providerOperationId: key,
    })
    const price = await portalGuardCommand(req({ ...permission, operation: "accept_price", confirmation: { accepted: true } }))
    const priceBody = await price.json()
    expect(priceBody).toEqual({
      status: "ok",
      message: "Your acceptance is recorded. The current price stays in place until the provider schedule is confirmed.",
    })
    expect(JSON.stringify(priceBody)).not.toMatch(/sub_|cus_|price_|paid|successful/i)

    mocks.rpc.mockResolvedValueOnce({ status: "success", offerStatus: "DECLINED" })
    const priceDeclined = await portalGuardCommand(req({ ...permission, operation: "decline_price", confirmation: {} }))
    expect(await priceDeclined.json()).toEqual({
      status: "ok",
      message: "This price change is declined. The current price stays in place.",
    })
  })

  it("does not report checkout as paid when subscriptions are disabled", async () => {
    mocks.rpc.mockResolvedValue({
      status: "success",
      stripeCustomerId: "cus_secret",
      stripePriceId: "price_secret",
      stripeSubscriptionId: "sub_secret",
      providerOperationId: key,
      idempotencyKey: key,
      customerId: key,
    })
    const response = await portalGuardCommand(req({ ...permission, operation: "start_checkout", confirmation: {} }))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({ message: "Secure Stripe Checkout is not available yet." })
    expect(JSON.stringify(body)).not.toMatch(/paid|successful|sub_|cus_|price_/)
  })

  it("records an immediate cancellation review without promising a refund", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", reviewRequired: true })
    const response = await portalGuardCommand(req({
      ...permission,
      operation: "request_immediate_cancellation",
      confirmation: {},
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      status: "ok",
      message: "Immediate cancellation is with ProfileRelaunch for review. A refund is not promised.",
    })
  })

  it("rejects a stale replay and a signed-out session", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    expect((await portalGuardCommand(req(permission))).status).toBe(409)
    mocks.rpc.mockResolvedValueOnce(null)
    expect((await portalGuardCommand(req(permission))).status).toBe(401)
    const foreign = await portalGuardCommand(req(permission, { origin: "https://evil.example" }))
    expect(foreign.status).toBe(401)
  })
})
