import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { sessionCookie } from "@/lib/auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { settingsCommand } from "./command"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/operations/settings`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "idempotency-key": key, cookie: `${sessionCookie}=${"a".repeat(64)}`, ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("settings command HTTP boundary", () => {
  it("requires session, Origin, JSON and a UUID idempotency key", async () => {
    expect((await settingsCommand(req({ operation: "create_incident", payload: { kind: "OTHER", title: "Mail", summary: "Provider outage" } }, { origin: "https://evil.example" }))).status).toBe(403)
    expect((await settingsCommand(req({ operation: "create_incident", payload: { kind: "OTHER", title: "Mail", summary: "Provider outage" } }, { "content-type": "text/plain" }))).status).toBe(415)
    expect((await settingsCommand(req({ operation: "create_incident", payload: { kind: "OTHER", title: "Mail", summary: "Provider outage" } }, { cookie: "" }))).status).toBe(401)
    expect((await settingsCommand(req({ operation: "create_incident", payload: { kind: "OTHER", title: "Mail", summary: "Provider outage" } }, { "idempotency-key": "not-a-uuid" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects unknown operations, staff-invite commands and secret payloads", async () => {
    expect((await settingsCommand(req({ operation: "invite_staff", payload: { email: "ops@example.com" } }))).status).toBe(400)
    expect((await settingsCommand(req({ operation: "create_setting_draft", payload: { key: "RETENTION", stripeSecret: "sk_live_123" } }))).status).toBe(400)
    expect((await settingsCommand(req({ operation: "create_setting_draft", payload: ["x"] }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("forwards an allowlisted command and maps reauth", async () => {
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    const reauth = await settingsCommand(req({ operation: "approve_setting", payload: { id: key }, version: 1 }))
    expect(reauth.status).toBe(403)
    expect(await reauth.json()).toMatchObject({ message: expect.stringMatching(/five minutes/) })
    mocks.rpc.mockResolvedValue({ status: "success" })
    const ok = await settingsCommand(req({ operation: "create_incident", payload: { kind: "MAIL_FAILURE", title: "Bounce surge", summary: "Provider outage recorded." } }))
    expect(ok.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_settings_command_v1", expect.objectContaining({
      p_operation: "create_incident",
      p_request: key,
    }))
  })
})
