import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  tokenHash: (value: string) => `hash:${value}`,
}))

import { guardAlertCommand } from "./alerts-command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const alertId = "55555555-5555-4555-8555-555555555555"

function req(body: unknown) {
  return new NextRequest(`${origin}/api/operations/guard-alerts`, {
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

describe("guard alert commands", () => {
  it("denies mutations when GUARD_ALERTS_ENABLED is unset", async () => {
    expect((await guardAlertCommand(req({
      operation: "acknowledge", alertId, version: 1, severity: "HIGH",
      disposition: "INTERNAL_ONLY", reason: "Internal review only for now.",
    }))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("denies resume when activation remains unset", async () => {
    vi.stubEnv("GUARD_ALERTS_ENABLED", "true")
    expect((await guardAlertCommand(req({
      operation: "resume", alertId, version: 1, reason: "Access and contact were restored.",
    }))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("denies queue when notification or communication gates are unset", async () => {
    vi.stubEnv("GUARD_ALERTS_ENABLED", "true")
    const communicationId = "66666666-6666-4666-8666-666666666666"
    expect((await guardAlertCommand(req({
      operation: "queue_notification", alertId, version: 1, communicationId,
    }))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not expose alert flags to the client bundle", () => {
    const forms = readFileSync(new URL("../../app/guard/alerts/forms.tsx", import.meta.url), "utf8")
    const page = readFileSync(new URL("../../app/guard/alerts/page.tsx", import.meta.url), "utf8")
    const command = readFileSync(new URL("./alerts-command.ts", import.meta.url), "utf8")
    expect(forms + page).not.toMatch(/GUARD_ALERTS_ENABLED|NEXT_PUBLIC_GUARD/)
    expect(command).not.toMatch(/NEXT_PUBLIC_GUARD_ALERTS_ENABLED/)
  })
})
