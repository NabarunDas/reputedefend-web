import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  newToken: () => "b".repeat(64),
  tokenHash: (value: string) => `hash:${value}`,
}))

import { catalogueCommand, quoteCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const quoteId = "55555555-5555-4555-8555-555555555555"

function req(path: string, body: unknown) {
  return new NextRequest(`${origin}${path}`, {
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

describe("commercial admin commands", () => {
  it("approves prices through the catalogue RPC and rejects charge operations", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: quoteId, version: 2 })
    const ok = await catalogueCommand(req("/api/operations/catalogue", {
      operation: "approve_price_version", priceVersionId: quoteId, version: 1,
    }))
    expect(ok.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_catalogue_command_v1", expect.objectContaining({
      p_operation: "approve_price_version",
      p_payload: { priceVersionId: quoteId },
      p_version: 1,
    }))
    const denied = await catalogueCommand(req("/api/operations/catalogue", { operation: "charge", priceVersionId: quoteId }))
    expect(denied.status).toBe(400)
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/charge|STRIPE|PaymentIntent/i)
  })

  it("issues a quote acceptance link without persisting the raw secret", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: quoteId, expiresAt: "2026-10-02T00:00:00.000Z" })
    const ok = await quoteCommand(req("/api/operations/quotes", {
      operation: "create_quote_acceptance_action", quoteId, expiresAt: "2026-10-02T00:00:00.000Z",
    }))
    expect(ok.status).toBe(200)
    const body = await ok.json() as { actionUrl?: string }
    expect(body.actionUrl).toContain(`/action/${quoteId}#t=`)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_quote_command_v1", expect.objectContaining({
      p_operation: "create_quote_acceptance_action",
      p_payload: expect.objectContaining({ quoteId, secretHash: "hash:" + "b".repeat(64) }),
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1].p_payload)).not.toContain("#t=")
  })

  it("maps reauth_required for price approval", async () => {
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    const denied = await catalogueCommand(req("/api/operations/catalogue", {
      operation: "approve_price_version", priceVersionId: quoteId, version: 1,
    }))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ message: expect.stringMatching(/five minutes/) })
  })
})
