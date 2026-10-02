import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  newToken: () => "b".repeat(64),
  tokenHash: (value: string) => `hash:${value}`,
}))

import { paymentCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const orderId = "55555555-5555-4555-8555-555555555555"
// Relative to the run, because the command refuses an expiry in the past and
// a fixed date turns these cases into failures on whichever day it arrives.
const expiresAt = new Date(Date.now() + 86_400_000).toISOString()

function req(body: unknown) {
  return new NextRequest(`${origin}/api/operations/payments`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}` },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("CUSTOMER_ORIGIN", "https://customer.profilerelaunch.com")
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("admin payment commands", () => {
  it("issues a Guided payment action without persisting the raw secret", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: orderId, expiresAt })
    const ok = await paymentCommand(req({
      operation: "issue_guided_payment_action", serviceOrderId: orderId, version: 1, expiresAt,
    }))
    expect(ok.status).toBe(200)
    const body = await ok.json() as { actionUrl?: string }
    expect(body.actionUrl).toContain(`/action/${orderId}#t=`)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_payment_command_v1", expect.objectContaining({
      p_operation: "issue_guided_payment_action",
      p_payload: expect.objectContaining({ serviceOrderId: orderId, secretHash: "hash:" + "b".repeat(64) }),
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1].p_payload)).not.toMatch(/sk_live|client_secret|#t=/)
  })

  it("rejects mark paid and charge shortcuts", async () => {
    const denied = await paymentCommand(req({ operation: "mark_paid", serviceOrderId: orderId, version: 1 }))
    expect(denied.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects success-fee approval without outcome evidence", async () => {
    const denied = await paymentCommand(req({
      operation: "approve_success_fee", serviceOrderId: orderId, version: 1,
      evidenceNote: "Screenshot of the Google outcome page.", approvalReason: "Matches the accepted success definition.",
    }))
    expect(denied.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects invoice fallback without an obligation and maps reauth", async () => {
    const denied = await paymentCommand(req({
      operation: "issue_invoice_fallback", serviceOrderId: orderId, version: 1, expiresAt,
    }))
    expect(denied.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    const reauth = await paymentCommand(req({
      operation: "issue_invoice_fallback", serviceOrderId: orderId, version: 1, obligationId: orderId, expiresAt,
    }))
    expect(reauth.status).toBe(403)
    expect(await reauth.json()).toMatchObject({ message: expect.stringMatching(/five minutes/) })
  })

  it("maps reauth_required for success-fee approval", async () => {
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    const denied = await paymentCommand(req({
      operation: "approve_success_fee", serviceOrderId: orderId, version: 1,
      evidenceNote: "Screenshot of the Google outcome page.", approvalReason: "Matches the accepted success definition.",
      outcomeEvidenceVersionId: "99999999-9999-4999-8999-999999999999",
    }))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ message: expect.stringMatching(/five minutes/) })
  })
})
