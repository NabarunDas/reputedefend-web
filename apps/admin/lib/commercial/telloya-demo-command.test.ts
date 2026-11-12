import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/enquiries/demo/route"
import { sessionCookie } from "@/lib/auth/config"
import { telloyaDemoCommandArgs } from "./telloya-demo-command"

const origin = "https://admin.profilerelaunch.com"
const enquiryId = "22222222-2222-4222-8222-222222222222"
const key = "33333333-3333-4333-8333-333333333333"
const actor = "11111111-1111-4111-8111-111111111111"
const body = {
  enquiryId,
  expectedVersion: 0,
  status: "BOOKED",
  at: "2026-11-20T15:00:00.000Z",
  timezone: "Europe/London",
  note: "Arranged by phone.",
  actorId: actor,
}

function req(payload: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/enquiries/demo`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
      ...headers,
    },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("TELLOYA_ADMIN_JOURNEY_ENABLED", "true")
  mocks.rpc.mockReset().mockResolvedValue({ status: "recorded", version: 1 })
})
afterEach(() => vi.unstubAllEnvs())

describe("Telloya demonstration command", () => {
  it("sends the session hash and never a client-supplied actor", async () => {
    expect((await POST(req(body))).status).toBe(200)
    const args = mocks.rpc.mock.calls[0][1]
    expect(mocks.rpc).toHaveBeenCalledWith("telloya_admin_demo_transition_v1", expect.objectContaining({
      p_enquiry_id: enquiryId,
      p_expected_version: 0,
      p_status: "BOOKED",
      p_idempotency_key: key,
    }))
    expect(args.p_token).toMatch(/^[a-f0-9]{64}$/)
    expect(args.p_token).not.toBe("a".repeat(64))
    expect(args.p_actor_id).toBeUndefined()
    expect(JSON.stringify(args)).not.toContain(actor)
  })

  it("stays closed when the flag is off and does not call the database", async () => {
    vi.stubEnv("TELLOYA_ADMIN_JOURNEY_ENABLED", "false")
    const response = await POST(req(body))
    expect(response.status).toBe(403)
    expect(await response.text()).toContain("flag is not enabled")
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("reports a missing command as closed and hides the provider error", async () => {
    mocks.rpc.mockRejectedValue(new Error("Admin authentication storage unavailable"))
    const response = await POST(req(body))
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(text).toContain("does not have the demonstration record")
    expect(text).not.toContain("unavailable")
  })

  it("rejects a stale write, a forged origin, and a ProfileRelaunch source", async () => {
    mocks.rpc.mockResolvedValueOnce({ status: "stale_version", version: 2 })
    expect((await POST(req(body))).status).toBe(409)
    expect((await POST(req(body, { origin: "https://evil.example" }))).status).toBe(403)
    mocks.rpc.mockResolvedValueOnce({ status: "not_telloya" })
    expect((await POST(req(body))).status).toBe(403)
  })

  it("drops an actor field and rejects an unusable time zone input", () => {
    const args = telloyaDemoCommandArgs(body)
    expect(args).toEqual({
      p_enquiry_id: enquiryId,
      p_expected_version: 0,
      p_status: "BOOKED",
      p_at: "2026-11-20T15:00:00.000Z",
      p_timezone: "Europe/London",
      p_note: "Arranged by phone.",
    })
    expect(telloyaDemoCommandArgs({ ...body, timezone: "" })).toBeNull()
    expect(telloyaDemoCommandArgs({ ...body, status: "COMPLETED", at: null })).toBeNull()
  })

  it("still saves a completed demonstration when sales-context bootstrap is closed", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    mocks.rpc.mockResolvedValueOnce({ status: "recorded", version: 2 })
    const response = await POST(req({
      ...body,
      expectedVersion: 1,
      status: "COMPLETED",
      at: "2026-11-20T16:00:00.000Z",
      note: "Demonstration finished offline.",
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc.mock.calls[0][0]).toBe("telloya_admin_demo_transition_v1")
  })
})
