import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), newToken: vi.fn(() => "b".repeat(64)) }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  newToken: () => mocks.newToken(),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))
import { POST as authzPost } from "@/app/api/authorization/command/route"
import { POST as managerPost } from "@/app/api/manager-access/command/route"
import { authorizationCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"
import { authorizationArgs, managerArgs } from "./validation"

const origin = "https://admin.profilerelaunch.com"
const caseId = "55555555-5555-4555-8555-555555555555"
const key = "33333333-3333-4333-8333-333333333333"
const createBody = {
  operation: "create_agreement_action" as const, caseId, kind: "SERVICE_AGREEMENT",
  title: "Managed recovery service agreement",
  bodyText: "This is the owner-approved service wording for this exact case snapshot.",
  scopeText: "Restore the listed Google Business Profile for this case only.",
  expiresAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
}

function req(body: unknown = createBody, headers: Record<string, string> = {}, url = `${origin}/api/authorization/command`) {
  return new NextRequest(url, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
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
  mocks.newToken.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe("authorization commands", () => {
  it("rejects unauthenticated, wrong origin and invented legal-free payloads", async () => {
    expect((await authzPost(req(createBody, { cookie: "" }))).status).toBe(401)
    expect((await authzPost(req(createBody, { origin: "https://evil.example" }))).status).toBe(403)
    expect(authorizationArgs("create_agreement_action", { ...createBody, expiresAt: new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString() })).toBeNull()
    expect(managerArgs("verify", { operation: "verify", caseId, accessLevel: "MANAGER", evidence: "Seen in Google Business Manager on a live screen share.", confirmed: true })).toBeNull()
    expect(managerArgs("revoke", { operation: "revoke", caseId, reason: "Access removed after a live Google check.", confirmed: true })).toBeNull()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("returns the action URL once and never sends a customer-accepted shortcut", async () => {
    mocks.rpc.mockResolvedValue({ status: "success", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", replay: false, expiresAt: createBody.expiresAt })
    const response = await authorizationCommand(req())
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.actionUrl).toMatch(/^https:\/\/customer\.profilerelaunch\.com\/action\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa#t=/)
    expect(JSON.stringify(payload)).not.toMatch(/Customer accepted|password|otp/i)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_authorization_command_v1", expect.objectContaining({
      p_operation: "create_agreement_action",
      p_data: expect.objectContaining({ secretHash: expect.stringMatching(/^hash-/) }),
    }))
    mocks.rpc.mockResolvedValue({ status: "success", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", replay: true })
    const replay = await (await authorizationCommand(req())).json()
    expect(replay.actionUrl).toBeUndefined()
    expect(replay.message).toMatch(/cannot be shown again/)
  })
  it("ignores a customer action cookie", async () => {
    expect((await authzPost(req(createBody, { cookie: `pr-action-dev=${"a".repeat(64)}` }))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("maps reauth and does not log secrets", async () => {
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    const denied = await managerPost(req({
      operation: "verify", caseId, accessLevel: "MANAGER", evidence: "Seen in Google Business Manager on a live screen share.", confirmed: true, recordVersion: 0,
    }, {}, `${origin}/api/manager-access/command`))
    expect(denied.status).toBe(403)
    expect(await denied.text()).not.toMatch(/#[tT]=|password/)
  })
  it("fails closed when CUSTOMER_ORIGIN is missing or malformed and does not issue a secret", async () => {
    vi.stubEnv("CUSTOMER_ORIGIN", "")
    expect((await authorizationCommand(req())).status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.newToken).not.toHaveBeenCalled()
    vi.stubEnv("CUSTOMER_ORIGIN", "https://customer.profilerelaunch.com/extra")
    expect((await authorizationCommand(req())).status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.newToken).not.toHaveBeenCalled()
    vi.stubEnv("CUSTOMER_ORIGIN", "not-a-url")
    expect((await authorizationCommand(req({
      operation: "create_revocation_action", caseId,
      authorizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expiresAt: createBody.expiresAt,
    }))).status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.newToken).not.toHaveBeenCalled()
  })
  it("still allows Admin revoke and open-action revoke without CUSTOMER_ORIGIN", async () => {
    vi.stubEnv("CUSTOMER_ORIGIN", "")
    mocks.rpc.mockResolvedValue({ status: "success", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", authorizationStatus: "REVOKED", recordVersion: 2 })
    const response = await authorizationCommand(req({
      operation: "admin_revoke_authorization", caseId,
      authorizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reason: "Customer asked for an emergency stop after a live call.",
      confirmed: true, recordVersion: 1,
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_authorization_command_v1", expect.objectContaining({ p_operation: "admin_revoke_authorization" }))
    expect(mocks.newToken).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ status: "success", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", actionStatus: "REVOKED" })
    const revoked = await authorizationCommand(req({
      operation: "revoke_action", caseId, actionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reason: "Operator withdrew this unused action after a live check.", confirmed: true,
    }))
    expect(revoked.status).toBe(200)
    expect(mocks.newToken).not.toHaveBeenCalled()
  })
  it("issues a case-access link once and rejects invented email or case fields", async () => {
    expect(authorizationArgs("create_case_access_action", {
      operation: "create_case_access_action", caseId, expiresAt: createBody.expiresAt, email: "attacker@example.com",
    })).toBeNull()
    mocks.rpc.mockResolvedValue({ status: "success", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", replay: false, expiresAt: createBody.expiresAt })
    const response = await authorizationCommand(req({
      operation: "create_case_access_action", caseId, expiresAt: createBody.expiresAt,
    }))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.actionUrl).toMatch(/^https:\/\/customer\.profilerelaunch\.com\/action\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa#t=/)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_authorization_command_v1", expect.objectContaining({
      p_operation: "create_case_access_action",
      p_data: expect.objectContaining({ secretHash: expect.stringMatching(/^hash-/), expiresAt: createBody.expiresAt }),
    }))
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1].p_data)).not.toMatch(/email|caseId/)
  })
})
