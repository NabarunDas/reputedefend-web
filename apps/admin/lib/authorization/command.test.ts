import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks, newToken: () => "b".repeat(64), tokenHash: (value: string) => `hash-${value.slice(0, 8)}` }))
import { POST as authzPost } from "@/app/api/authorization/command/route"
import { POST as managerPost } from "@/app/api/manager-access/command/route"
import { authorizationCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"
import { authorizationArgs } from "./validation"

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
})
afterEach(() => vi.unstubAllEnvs())

describe("authorization commands", () => {
  it("rejects unauthenticated, wrong origin and invented legal-free payloads", async () => {
    expect((await authzPost(req(createBody, { cookie: "" }))).status).toBe(401)
    expect((await authzPost(req(createBody, { origin: "https://evil.example" }))).status).toBe(403)
    expect(authorizationArgs("create_agreement_action", { ...createBody, expiresAt: new Date(Date.now() + 8 * 24 * 3600 * 1000).toISOString() })).toBeNull()
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
      operation: "verify", caseId, accessLevel: "MANAGER", evidence: "Seen in Google Business Manager on a live screen share.", confirmed: true,
    }, {}, `${origin}/api/manager-access/command`))
    expect(denied.status).toBe(403)
    expect(await denied.text()).not.toMatch(/#[tT]=|password/)
  })
})
