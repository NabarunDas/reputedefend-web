// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const loadJobHealth = vi.fn()
vi.mock("@/lib/jobs/queries", () => ({
  loadJobHealth: (...args: unknown[]) => loadJobHealth(...args),
}))

import JobsPage from "./page"

afterEach(() => cleanup())
beforeEach(() => loadJobHealth.mockReset())

describe("operations jobs page", () => {
  it("shows heartbeat, counts and a dead-letter replay control without raw payloads", async () => {
    loadJobHealth.mockResolvedValue({
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
    })
    render(await JobsPage())
    expect(screen.getByRole("heading", { name: "Operational health" })).toBeTruthy()
    expect(screen.getByText("Healthy")).toBeTruthy()
    expect(screen.getByText(/Pending 1/)).toBeTruthy()
    expect(screen.getByText("Dead letter")).toBeTruthy()
    expect(screen.getByText("Queue health probe")).toBeTruthy()
    expect(screen.getByText("Replay job")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/CRON_SECRET|SUPABASE_SECRET|payload|secretHash|otp/i)
  })
})
