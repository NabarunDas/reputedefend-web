import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { communicationsCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const caseId = "55555555-5555-4555-8555-555555555555"

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/operations/communications`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}`, ...headers },
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

describe("communications admin commands", () => {
  it("drafts through the server command and rejects unknown operations", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    const ok = await communicationsCommand(req({
      operation: "draft", templateKey: "EVIDENCE_REQUEST", caseId, evidenceRequestId: key,
    }))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ message: expect.stringMatching(/has not been sent/) })
    expect(mocks.rpc).toHaveBeenCalledWith("admin_communication_command_v1", expect.objectContaining({
      p_operation: "draft",
      p_payload: expect.objectContaining({ customerOrigin: "https://customer.profilerelaunch.com" }),
    }))
    const denied = await communicationsCommand(req({ operation: "send_now", html: "<script>alert(1)</script>" }))
    expect(denied.status).toBe(400)
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/send_now|<script>/)
  })

  it("does not accept a queue payload that tries to change the snapshot", async () => {
    mocks.rpc.mockResolvedValue({ status: "denied" })
    const denied = await communicationsCommand(req({
      operation: "queue", communicationId: key, version: 2, recipient: "other@example.com",
    }))
    expect(denied.status).toBe(403)
    expect(JSON.stringify(await denied.json())).not.toMatch(/RESEND_API_KEY|otp/i)
  })
})
