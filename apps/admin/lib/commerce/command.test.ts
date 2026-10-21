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
// Relative to the run, because the command refuses an expiry in the past and
// a fixed date turns these cases into failures on whichever day it arrives.
const expiresAt = new Date(Date.now() + 86_400_000).toISOString()

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
    mocks.rpc.mockResolvedValue({ status: "success", id: quoteId, expiresAt })
    const ok = await quoteCommand(req("/api/operations/quotes", {
      operation: "create_quote_acceptance_action", quoteId, expiresAt,
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

  it("requires a Guard coverage UUID before sending a QUALIFIED snapshot", async () => {
    const denied = await quoteCommand(req("/api/operations/quotes", {
      operation: "record_qualification",
      serviceCode: "MANAGED_RELAUNCH",
      priceVersionId: quoteId,
      qualificationResult: "QUALIFIED",
      coverageBasis: "PAID",
      coverageStatus: "ACTIVE",
      coverageType: "PAID_GUARD",
      paidVsIncluded: "PAID",
      issuePredatesPaidCoverage: "false",
      locationId: quoteId,
      issueObservedAt: "2026-10-01T12:00:00.000Z",
    }))
    expect(denied.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects a newly created price version whose effective date is not in the future", async () => {
    const denied = await catalogueCommand(req("/api/operations/catalogue", {
      operation: "create_price_version",
      serviceCode: "MANAGED_RELAUNCH",
      displayName: "Managed Relaunch",
      amountMinor: 31900,
      effectiveFrom: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      taxBehaviour: "UNCONFIRMED",
    }))
    expect(denied.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("keeps a binding offer behind the existing eligibility check and the staff session", async () => {
    mocks.rpc.mockResolvedValue({ status: "eligibility_blocked", reason: "commercial_eligibility:establishment" })
    const blocked = await quoteCommand(req("/api/operations/quotes", {
      operation: "offer", quoteId, version: 2, quoteVersionId: quoteId,
    }))
    expect(blocked.status).toBe(409)
    const body = await blocked.json() as { message?: string }
    expect(body.message).toMatch(/purchasing establishment/)
    expect(body.message).toMatch(/country and tax eligibility/)
    expect(body.message).not.toMatch(/United States|US only|country list|restricted countr/i)

    mocks.rpc.mockResolvedValue({ status: "denied" })
    const denied = await quoteCommand(req("/api/operations/quotes", {
      operation: "offer", quoteId, version: 2, quoteVersionId: quoteId,
    }))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ message: "That commercial action is not allowed." })

    mocks.rpc.mockResolvedValue({ status: "unauthorized" })
    const unsigned = await quoteCommand(req("/api/operations/quotes", {
      operation: "offer", quoteId, version: 2, quoteVersionId: quoteId,
    }))
    expect(unsigned.status).toBe(401)
  })

  it("explains a known quote denial and still calls the quote command", async () => {
    const leaked = "Thanks — we'll confirm your quote and payment details shortly. 22222222-2222-4222-8222-222222222222"
    const known: Array<[string, RegExp]> = [
      ["unresolved_establishment", /Record a verified purchasing establishment/],
      ["awaiting_confirmation", /Country and tax eligibility is not confirmed/],
      ["tax_determination_mismatch", /does not match the eligibility determination/],
      ["vat_threshold", /seller turnover check/],
      ["exclusive_adds_tax", /Tax cannot be added on top/],
      ["total_above_gross", /final customer price/],
    ]
    for (const [reason, pattern] of known) {
      mocks.rpc.mockResolvedValueOnce({ status: "denied", reason, message: leaked })
      const denied = await quoteCommand(req("/api/operations/quotes", {
        operation: "offer", quoteId, version: 2, quoteVersionId: quoteId,
      }))
      expect(denied.status).toBe(403)
      const body = await denied.json() as { message?: string }
      expect(body.message).toMatch(pattern)
      expect(body.message).not.toContain(reason)
      expect(body.message).not.toContain("22222222")
      expect(body.message).not.toContain("Thanks")
      expect(JSON.stringify(body)).not.toContain(leaked)
    }
    expect(mocks.rpc).toHaveBeenCalledWith("admin_quote_command_v1", expect.objectContaining({
      p_operation: "offer",
    }))

    mocks.rpc.mockResolvedValueOnce({ status: "eligibility_blocked", reason: "unresolved_establishment", message: leaked })
    const blocked = await quoteCommand(req("/api/operations/quotes", {
      operation: "offer", quoteId, version: 2, quoteVersionId: quoteId,
    }))
    expect(blocked.status).toBe(409)
    const blockedBody = await blocked.json() as { message?: string }
    expect(blockedBody.message).toMatch(/Google listing country is not that record/)
    expect(blockedBody.message).not.toContain(leaked)

    mocks.rpc.mockResolvedValueOnce({ status: "denied", reason: "internal_debug: business 22222222-2222-4222-8222-222222222222", message: leaked })
    const unknown = await quoteCommand(req("/api/operations/quotes", {
      operation: "offer", quoteId, version: 2, quoteVersionId: quoteId,
    }))
    expect(unknown.status).toBe(403)
    const unknownBody = await unknown.json()
    expect(unknownBody).toMatchObject({ message: "That commercial action is not allowed." })
    expect(JSON.stringify(unknownBody)).not.toMatch(/internal_debug|22222222|Thanks/)

    mocks.rpc.mockResolvedValueOnce({ status: "denied", reason: "constructor", message: leaked })
    const inherited = await quoteCommand(req("/api/operations/quotes", {
      operation: "offer", quoteId, version: 2, quoteVersionId: quoteId,
    }))
    expect(inherited.status).toBe(403)
    expect(await inherited.json()).toMatchObject({ message: "That commercial action is not allowed." })

    mocks.rpc.mockResolvedValueOnce({ status: "denied", reason: "unresolved_establishment" })
    const catalogue = await catalogueCommand(req("/api/operations/catalogue", {
      operation: "approve_price_version", priceVersionId: quoteId, version: 1,
    }))
    expect(catalogue.status).toBe(403)
    expect(await catalogue.json()).toMatchObject({ message: "That commercial action is not allowed." })
  })
})
