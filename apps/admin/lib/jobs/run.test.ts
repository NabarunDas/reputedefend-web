import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), run: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
vi.mock("./worker", () => ({ runJobWorker: (...args: unknown[]) => mocks.run(...args) }))

import { runScheduledJobs } from "./run"

const origin = "https://admin.profilerelaunch.com"
const secret = "c".repeat(32)

function req(headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/internal/jobs/run`, { headers })
}

beforeEach(() => {
  mocks.rpc.mockReset()
  mocks.run.mockReset()
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

describe("scheduled job route", () => {
  it("fails closed when CRON_SECRET is missing and does not call the worker", async () => {
    const response = await runScheduledJobs(req({ authorization: `Bearer ${secret}` }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: "disabled", message: "Job worker is not configured." })
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("returns 401 for a wrong bearer token and does not touch jobs", async () => {
    vi.stubEnv("CRON_SECRET", secret)
    vi.stubEnv("JOB_WORKER_ENABLED", "true")
    vi.stubEnv("VERCEL_ENV", "production")
    const response = await runScheduledJobs(req({ authorization: "Bearer wrong-secret-value-here-32ch" }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ status: "unauthorized" })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("returns a disabled summary in Preview and does not process production jobs", async () => {
    vi.stubEnv("CRON_SECRET", secret)
    vi.stubEnv("JOB_WORKER_ENABLED", "true")
    vi.stubEnv("JOB_PROVIDER_MODE", "production")
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
    vi.stubEnv("ADMIN_ORIGIN", origin)
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_SECRET_KEY", "test")
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
    const response = await runScheduledJobs(req({ authorization: `Bearer ${secret}` }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "disabled", promoted: 0, claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 })
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("returns only safe counts when the production worker runs", async () => {
    vi.stubEnv("CRON_SECRET", secret)
    vi.stubEnv("JOB_WORKER_ENABLED", "true")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
    vi.stubEnv("ADMIN_ORIGIN", origin)
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_SECRET_KEY", "test")
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
    mocks.run.mockResolvedValue({ status: "success", counts: { promoted: 1, claimed: 1, succeeded: 1, retried: 0, deadLettered: 0 } })
    const response = await runScheduledJobs(req({ authorization: `Bearer ${secret}` }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ status: "success", promoted: 1, claimed: 1, succeeded: 1, retried: 0, deadLettered: 0 })
    expect(JSON.stringify(body)).not.toMatch(/payload|CRON_SECRET|idempotencyKey|secret/i)
  })
})
