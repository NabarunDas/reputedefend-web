import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { conversationsCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const conversationId = "77777777-7777-4777-8777-777777777777"

function req(body: unknown) {
  return new NextRequest(`${origin}/api/operations/conversations`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}` },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("INBOUND_MAIL_DOMAIN", "reply.profilerelaunch.com")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("conversation admin commands", () => {
  it.each([
    ["a mistyped case reference", { operation: "link_case", conversationId, version: 2, caseId: "PR-26-ABC123" }],
    ["an empty case reference", { operation: "link_case", conversationId, version: 2, caseId: "" }],
    ["a malformed conversation", { operation: "close", conversationId: "not-a-uuid", version: 2 }],
    ["a malformed attachment", { operation: "promote_attachment", conversationId, version: 2, attachmentId: "42" }],
  ])("answers %s as a field problem and never reaches the database", async (_label, body) => {
    const response = await conversationsCommand(req(body))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "Check the fields before saving." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("injects the inbound domain for replies and strips browser threading fields", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    const response = await conversationsCommand(req({
      operation: "draft_reply",
      conversationId,
      version: 2,
      bodyText: "Thanks, we will review this today.",
      inboundDomain: "evil.example",
      replyTo: "spoof@example.com",
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_conversation_command_v1", expect.objectContaining({
      p_operation: "draft_reply",
      p_payload: expect.objectContaining({
        inboundDomain: "reply.profilerelaunch.com",
        bodyText: "Thanks, we will review this today.",
      }),
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1].p_payload)).not.toMatch(/evil\.example|spoof@example.com/)
  })

  it("rejects unknown operations", async () => {
    const denied = await conversationsCommand(req({ operation: "verify_sender", conversationId, version: 1 }))
    expect(denied.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
