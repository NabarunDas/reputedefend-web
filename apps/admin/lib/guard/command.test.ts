import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  newToken: () => "b".repeat(64),
  tokenHash: (value: string) => `hash:${value}`,
}))

import { guardCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const coverageId = "55555555-5555-4555-8555-555555555555"

function req(body: unknown) {
  return new NextRequest(`${origin}/api/operations/guard`, {
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

describe("guard admin commands", () => {
  it("issues a Guard permission link without persisting the raw secret", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: coverageId, expiresAt: "2026-10-02T00:00:00.000Z" })
    const ok = await guardCommand(req({
      operation: "issue_permission_action", coverageId, expiresAt: "2026-10-02T00:00:00.000Z",
    }))
    expect(ok.status).toBe(200)
    const body = await ok.json() as { actionUrl?: string }
    expect(body.actionUrl).toContain(`/action/${coverageId}#t=`)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_guard_command_v1", expect.objectContaining({
      p_operation: "issue_permission_action",
      p_payload: expect.objectContaining({ coverageId, secretHash: "hash:" + "b".repeat(64) }),
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1].p_payload)).not.toContain("#t=")
  })

  it("rejects mark-paid and coverage state selection", async () => {
    const paid = await guardCommand(req({ operation: "mark_paid", coverageId, version: 1 }))
    expect(paid.status).toBe(400)
    const state = await guardCommand(req({ operation: "set_state", coverageId, version: 1, state: "ACTIVE" }))
    expect(state.status).toBe(400)
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/mark_paid|set_state|CURRENT|STRIPE/i)
  })

  it("maps paid-not-ready activation to an exception message", async () => {
    mocks.rpc.mockResolvedValue({ status: "denied", reason: "paid_not_ready", exceptionId: coverageId })
    const denied = await guardCommand(req({ operation: "activate", coverageId, version: 2 }))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({
      message: expect.stringMatching(/urgent exception/i),
      exceptionId: coverageId,
    })
  })

  it("maps reauth_required for activation", async () => {
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    const denied = await guardCommand(req({ operation: "activate", coverageId, version: 1 }))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ message: expect.stringMatching(/five minutes/) })
  })
})
