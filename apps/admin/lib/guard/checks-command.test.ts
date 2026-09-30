import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
  tokenHash: (value: string) => `hash:${value}`,
}))

import { guardCheckCommand } from "./checks-command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const obligationId = "55555555-5555-4555-8555-555555555555"

function req(body: unknown) {
  return new NextRequest(`${origin}/api/operations/guard-checks`, {
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

describe("guard check commands", () => {
  it("denies mutations when GUARD_CHECKS_ENABLED is unset, false, or malformed", async () => {
    const body = { operation: "claim", obligationId, version: 1 }
    expect((await guardCheckCommand(req(body))).status).toBe(403)
    vi.stubEnv("GUARD_CHECKS_ENABLED", "false")
    expect((await guardCheckCommand(req(body))).status).toBe(403)
    vi.stubEnv("GUARD_CHECKS_ENABLED", "yes")
    expect((await guardCheckCommand(req(body))).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("reaches the database only when GUARD_CHECKS_ENABLED is true", async () => {
    vi.stubEnv("GUARD_CHECKS_ENABLED", "true")
    mocks.rpc.mockResolvedValue({ status: "success", id: obligationId, version: 2 })
    const response = await guardCheckCommand(req({ operation: "claim", obligationId, version: 1 }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_guard_check_command_v1", expect.objectContaining({
      p_operation: "claim", p_version: 1,
    }))
  })

  it("rejects unavailable or unknown CHANGE_DETECTED before the database", async () => {
    vi.stubEnv("GUARD_CHECKS_ENABLED", "true")
    const unavailable = await guardCheckCommand(req({
      operation: "complete",
      obligationId,
      version: 1,
      classification: "CHANGE_DETECTED",
      profileAvailability: "UNAVAILABLE",
      locationIdentified: true,
    }))
    const unknown = await guardCheckCommand(req({
      operation: "complete",
      obligationId,
      version: 1,
      classification: "CHANGE_DETECTED",
      profileAvailability: "UNKNOWN",
      locationIdentified: false,
    }))
    expect(unavailable.status).toBe(400)
    expect(unknown.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects rating_available=false with a numeric rating", async () => {
    vi.stubEnv("GUARD_CHECKS_ENABLED", "true")
    const response = await guardCheckCommand(req({
      operation: "complete",
      obligationId,
      version: 1,
      classification: "INCOMPLETE",
      profileAvailability: "UNKNOWN",
      locationIdentified: false,
      ratingAvailable: false,
      rating: 4.2,
    }))
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not expose the check flag to the client bundle", () => {
    const forms = readFileSync(new URL("../../app/guard/checks/forms.tsx", import.meta.url), "utf8")
    const page = readFileSync(new URL("../../app/guard/checks/page.tsx", import.meta.url), "utf8")
    const command = readFileSync(new URL("./checks-command.ts", import.meta.url), "utf8")
    expect(forms + page).not.toMatch(/GUARD_CHECKS_ENABLED|NEXT_PUBLIC_GUARD/)
    expect(command).not.toMatch(/NEXT_PUBLIC_GUARD_CHECKS_ENABLED/)
    expect(command).toMatch(/guardChecksEnabled/)
  })
})
