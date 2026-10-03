import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

import { portalServiceCommand } from "./command"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const token = "c".repeat(64)
const selector = `ca-${"ab".repeat(32)}`

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/portal/service`, {
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

const accept = {
  reference: "PR-26-ABCDEF",
  selector,
  operation: "accept_quote",
  confirmation: { accepted: true },
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("portal service command", () => {
  it("stays closed when the portal gate is off and rejects unexpected keys", async () => {
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect((await portalServiceCommand(req(accept))).status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
    const extra = await portalServiceCommand(req({ ...accept, actionId: "11111111-1111-4111-8111-111111111111" }))
    expect(extra.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("sends the portal hash, public reference, selector and confirmation only", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "success" })
    const response = await portalServiceCommand(req(accept))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "success" })
    expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_service_command_v1", {
      p_token_hash: `hash-${token.slice(0, 8)}`,
      p_request: key,
      p_reference: "PR-26-ABCDEF",
      p_selector: selector,
      p_operation: "accept_quote",
      p_data: { accepted: true },
    })
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/customerId|caseId|quoteId|actionId/)
  })

  it("keeps missing, unsigned, stale, denied and failed outcomes distinct", async () => {
    const missing = await portalServiceCommand(req({ ...accept, reference: "not-a-case" }))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ message: "We couldn't find that case." })

    const unsigned = await portalServiceCommand(req({ ...accept, confirmation: {} }))
    expect(unsigned.status).toBe(400)
    expect(await unsigned.json()).toMatchObject({ message: "Confirm this step before continuing." })

    mocks.rpc.mockResolvedValueOnce({ status: "conflict" })
    const stale = await portalServiceCommand(req(accept))
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ message: "This page is out of date. Refresh it and try again." })

    mocks.rpc.mockResolvedValueOnce({ status: "denied" })
    const denied = await portalServiceCommand(req(accept))
    expect(denied.status).toBe(401)
    expect(await denied.json()).toMatchObject({ message: "This quote is no longer available to accept." })

    mocks.rpc.mockResolvedValueOnce({ status: "unavailable" })
    const gone = await portalServiceCommand(req({ ...accept, operation: "decline_quote", confirmation: { confirmed: true } }))
    expect(gone.status).toBe(401)
    expect(await gone.json()).toMatchObject({ message: "This action is no longer available." })

    mocks.rpc.mockResolvedValueOnce(null)
    expect((await portalServiceCommand(req(accept))).status).toBe(401)

    mocks.rpc.mockRejectedValueOnce(new Error("relation customer_actions does not exist"))
    const failed = await portalServiceCommand(req(accept))
    const body = await failed.json()
    expect(failed.status).toBe(503)
    expect(body.message).toBe("We couldn't complete that step. Please try again shortly.")
    expect(JSON.stringify(body)).not.toMatch(/customer_actions|SQL|supabase|uuid/i)
  })

  it("refuses a foreign origin and an agreement confirmation on a quote accept", async () => {
    const foreign = await portalServiceCommand(req(accept, { origin: "https://evil.example" }))
    expect(foreign.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    const wrong = await portalServiceCommand(req({ ...accept, confirmation: { confirmed: true } }))
    expect(wrong.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
