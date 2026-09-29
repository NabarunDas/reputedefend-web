import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { jobsCommand } from "./command"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const jobId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/operations/jobs`, {
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

describe("jobs admin commands", () => {
  it("queues a health probe and does not accept arbitrary job types", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    const ok = await jobsCommand(req({ operation: "enqueue_probe" }))
    expect(ok.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("admin_enqueue_job_probe_v1", expect.objectContaining({ p_request: key }))
    const denied = await jobsCommand(req({ operation: "enqueue", jobType: "SEND_EMAIL", payload: { to: "alex@example.com" } }))
    expect(denied.status).toBe(400)
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/SEND_EMAIL|alex@example.com/)
  })

  it("maps replay reauth and denied outcomes without leaking secrets", async () => {
    mocks.rpc.mockResolvedValue({ status: "reauth_required" })
    const reauth = await jobsCommand(req({
      operation: "replay", jobId, version: 3, reason: "Need to retry the health probe after a worker fault.", confirmed: true,
    }))
    expect(reauth.status).toBe(403)
    expect(await reauth.json()).toMatchObject({ message: expect.stringMatching(/five minutes/) })
    mocks.rpc.mockResolvedValue({ status: "denied" })
    const denied = await jobsCommand(req({
      operation: "replay", jobId, version: 3, reason: "Need to retry the health probe after a worker fault.", confirmed: true,
    }))
    expect(denied.status).toBe(403)
    expect(JSON.stringify(await denied.json())).not.toMatch(/CRON_SECRET|payload|otp/i)
  })
})
