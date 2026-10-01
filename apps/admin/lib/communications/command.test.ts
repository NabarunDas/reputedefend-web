import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { communicationsCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"
import { deriveCommunicationActionId, prepareCommunicationAccessLink } from "./link"

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
  vi.stubEnv("COMMUNICATIONS_LINK_SECRET", "communication-link-secret-for-tests-32b")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("communications admin commands", () => {
  it.each([
    ["a mistyped case reference", { operation: "draft", caseId: "PR-26-ABC123", templateKey: "CASE_UPDATE" }],
    ["an empty case reference", { operation: "draft", caseId: "", templateKey: "CASE_UPDATE" }],
    ["a mistyped evidence request", { operation: "draft", caseId, templateKey: "EVIDENCE_REQUEST", evidenceRequestId: "req-7" }],
    ["a malformed communication", { operation: "review", communicationId: "not-a-uuid", version: 1 }],
  ])("answers %s as a field problem and never reaches the database", async (_label, body) => {
    const response = await communicationsCommand(req(body))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "Check the fields before saving." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("drafts through the server command and rejects unknown operations", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    const ok = await communicationsCommand(req({
      operation: "draft", templateKey: "EVIDENCE_REQUEST", caseId, evidenceRequestId: key,
    }))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ message: expect.stringMatching(/has not been sent/) })
    const expectedActionId = deriveCommunicationActionId(key)
    const expectedHash = prepareCommunicationAccessLink(expectedActionId, process.env, 1)?.tokenHash
    expect(mocks.rpc).toHaveBeenCalledWith("admin_communication_command_v1", expect.objectContaining({
      p_operation: "draft",
      p_request: key,
      p_payload: expect.objectContaining({
        customerOrigin: "https://customer.profilerelaunch.com",
        actionId: expectedActionId,
        secretHash: expectedHash,
        linkKeyVersion: 1,
      }),
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/#t=/)
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
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(JSON.stringify(await denied.json())).not.toMatch(/RESEND_API_KEY|otp/i)
  })

  it("replays the same idempotency-key into the same secure action identity", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    const body = { operation: "draft", templateKey: "EVIDENCE_REQUEST", caseId, evidenceRequestId: key }
    const first = await communicationsCommand(req(body))
    const second = await communicationsCommand(req(body))
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    const payload1 = mocks.rpc.mock.calls[0][1].p_payload as { actionId: string; secretHash: string; linkKeyVersion: number }
    const payload2 = mocks.rpc.mock.calls[1][1].p_payload as { actionId: string; secretHash: string; linkKeyVersion: number }
    expect(payload1.actionId).toBe(deriveCommunicationActionId(key))
    expect(payload1.actionId).toBe(payload2.actionId)
    expect(payload1.secretHash).toBe(payload2.secretHash)
    expect(payload1.linkKeyVersion).toBe(1)
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/#t=/)
  })

  it("does not let the browser supply a sender address or action identity", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
    const drafted = await communicationsCommand(req({
      operation: "draft", templateKey: "EVIDENCE_REQUEST", caseId, evidenceRequestId: key,
      actionId: "99999999-9999-4999-8999-999999999999", fromAddress: "attacker@example.com",
    }))
    expect(drafted.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1].p_payload).toEqual(expect.objectContaining({
      actionId: deriveCommunicationActionId(key),
    }))
    expect(mocks.rpc.mock.calls[0][1].p_payload).not.toEqual(expect.objectContaining({
      fromAddress: "attacker@example.com",
    }))
    const reviewed = await communicationsCommand(req({
      operation: "review", communicationId: key, version: 1, fromAddress: "attacker@example.com",
    }))
    expect(reviewed.status).toBe(200)
    expect(mocks.rpc.mock.calls[1][1].p_payload).toEqual(expect.objectContaining({
      fromAddress: "ops@example.com",
    }))
  })
})
