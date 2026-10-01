import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { reportExportCommand, savedFilterCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"

function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}${path}`, {
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

describe("report export command", () => {
  it("requires session, Origin, JSON and a UUID idempotency key", async () => {
    expect((await reportExportCommand(req("/api/operations/reports/export", { reportKey: "open_cases" }, { origin: "https://evil.example" }))).status).toBe(403)
    expect((await reportExportCommand(req("/api/operations/reports/export", { reportKey: "open_cases" }, { "content-type": "text/plain" }))).status).toBe(415)
    expect((await reportExportCommand(req("/api/operations/reports/export", { reportKey: "open_cases" }, { cookie: "" }))).status).toBe(401)
    expect((await reportExportCommand(req("/api/operations/reports/export", { reportKey: "open_cases" }, { "idempotency-key": "not-a-uuid" }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("returns neutralized CSV with safe headers and rejects unknown keys", async () => {
    mocks.rpc.mockResolvedValue({
      status: "success",
      rows: [{ id: "1", occurredAt: "2026-03-29T00:00:00Z", label: "=HYPERLINK(1)", amountMinor: 100, currency: "GBP", elapsedSeconds: null }],
    })
    const ok = await reportExportCommand(req("/api/operations/reports/export", { reportKey: "collected_gross", preset: "today" }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-type")).toBe("text/csv; charset=utf-8")
    expect(ok.headers.get("cache-control")).toMatch(/no-store/)
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff")
    expect(ok.headers.get("content-disposition")).toMatch(/admin-collected_gross-/)
    expect(await ok.text()).toContain("'=HYPERLINK(1)")
    const denied = await reportExportCommand(req("/api/operations/reports/export", { reportKey: "all_customers" }))
    expect(denied.status).toBe(400)
  })
})

describe("saved filter command", () => {
  it("rejects missing session and forwards a valid create", async () => {
    expect((await savedFilterCommand(req("/api/operations/reports/filters", { operation: "create" }, { cookie: "" }))).status).toBe(401)
    mocks.rpc.mockResolvedValue({ status: "success", id: key, version: 1 })
    const ok = await savedFilterCommand(req("/api/operations/reports/filters", {
      operation: "create", payload: { module: "REPORTS", name: "Today", filter: { preset: "today" } },
    }))
    expect(ok.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_saved_filter_command_v1", expect.objectContaining({
      p_operation: "create",
      p_request: key,
    }))
  })
})
