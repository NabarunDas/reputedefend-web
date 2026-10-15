// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const loadJobHealth = vi.fn()
vi.mock("@/lib/jobs/queries", () => ({
  loadJobHealth: (...args: unknown[]) => loadJobHealth(...args),
}))

import JobsPage from "./page"

const preview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "develop",
  SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
  AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
  PAYMENTS_PROVIDER_MODE: "stripe_test",
  STRIPE_SECRET_KEY: "sk_test_placeholdernotarealkey",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret_value",
  DEV_STRIPE_ONE_SHOT_ENABLED: "true",
  STRIPE_LIVE_ACTIVATION: "",
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})
beforeEach(() => loadJobHealth.mockReset())

function health() {
  return {
    heartbeat: {
      status: "HEALTHY",
      workerName: "admin-jobs",
      environment: "production",
      lastStartedAt: "2026-09-29T12:00:00.000Z",
      lastCompletedAt: "2026-09-29T12:00:05.000Z",
      lastSuccessAt: "2026-09-29T12:00:05.000Z",
      lastError: null,
      deploymentId: "dpl_test",
      updatedAt: "2026-09-29T12:00:05.000Z",
      expectedIntervalSeconds: 86400,
      lateAfterSeconds: 93600,
    },
    counts: { pending: 1, running: 0, retry: 0, succeeded: 2, deadLetter: 1 },
    jobs: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      jobType: "SYSTEM_HEALTH_PROBE",
      status: "DEAD_LETTER",
      scheduledAt: "2026-09-29T11:50:00.000Z",
      attempts: 5,
      maxAttempts: 5,
      lastError: "Unknown job type",
      deadLetteredAt: "2026-09-29T11:55:00.000Z",
      completedAt: null,
      replayCount: 0,
      version: 6,
      summary: "System health probe",
    }],
  }
}

describe("operations jobs page", () => {
  it("shows heartbeat, counts and a dead-letter replay control without raw payloads", async () => {
    loadJobHealth.mockResolvedValue(health())
    render(await JobsPage())
    expect(screen.getByRole("heading", { name: "Operational health" })).toBeTruthy()
    expect(screen.getByText("Healthy")).toBeTruthy()
    expect(screen.getByText(/Pending 1/)).toBeTruthy()
    expect(screen.getByText("Dead letter")).toBeTruthy()
    expect(screen.getByText("Expected worker cadence: Daily")).toBeTruthy()
    expect(screen.getByText(/daily Hobby-compatible execution/)).toBeTruthy()
    expect(screen.getByText("Queue health probe")).toBeTruthy()
    expect(screen.getByText("Replay job")).toBeTruthy()
    expect(screen.queryByText("Process one DEV Stripe event")).toBeNull()
    expect(screen.getByText(/does not send customer email, call Google or process a Stripe event/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/CRON_SECRET|SUPABASE_SECRET|payload|secretHash|otp/i)
  })

  it("shows the DEV Stripe action only when the same server gate is open", async () => {
    loadJobHealth.mockResolvedValue(health())
    for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
    render(await JobsPage())
    expect(screen.getByText("Process one DEV Stripe event")).toBeTruthy()
    expect(screen.getByText(/The control below processes one selected test-mode Stripe event/)).toBeTruthy()
    cleanup()

    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("SUPABASE_URL", "https://cxwwekdzkkjjbiyofrov.supabase.co")
    vi.stubEnv("AWS_EVIDENCE_BUCKET", "profilerelaunch-evidence-prod-euw2-337909767363")
    vi.stubEnv("PAYMENTS_PROVIDER_MODE", "stripe_live")
    vi.stubEnv("STRIPE_LIVE_ACTIVATION", "enabled")
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_placeholdernotarealkey")
    render(await JobsPage())
    expect(screen.queryByText("Process one DEV Stripe event")).toBeNull()
    expect(screen.getByText(/does not send customer email, call Google or process a Stripe event/)).toBeTruthy()
    cleanup()

    for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main")
    render(await JobsPage())
    expect(screen.queryByText("Process one DEV Stripe event")).toBeNull()
    cleanup()

    for (const [name, value] of Object.entries(preview)) vi.stubEnv(name, value)
    vi.stubEnv("DEV_STRIPE_ONE_SHOT_ENABLED", "")
    render(await JobsPage())
    expect(screen.queryByText("Process one DEV Stripe event")).toBeNull()
    expect(document.body.textContent).not.toMatch(/CRON_SECRET|SUPABASE_SECRET|payload|secretHash|otp/i)
  })
})
