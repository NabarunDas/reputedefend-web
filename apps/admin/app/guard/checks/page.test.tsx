// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

vi.mock("@/lib/guard/checks-queries", () => ({
  loadGuardChecks: async () => ({
    serviceDate: "2026-09-30",
    timezone: "Europe/London",
    scheduleConfigured: false,
    claimedByMe: "11111111-1111-4111-8111-111111111111",
    obligations: [],
  }),
}))

import GuardChecksPage from "./page"

describe("guard check queues", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  })
  afterEach(() => {
    cleanup()
  })

  it("renders Europe/London queues without inventing window times", async () => {
    render(await GuardChecksPage())
    expect(screen.getByRole("heading", { name: "Guard checks" })).toBeInTheDocument()
    expect(screen.getByText(/Schedule not configured/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Morning" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Evening" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Claimed by me" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Retry required" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Missed" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Completed today" })).toBeInTheDocument()
    expect(screen.queryByText(/09:00|17:00/)).toBeNull()
    expect(screen.queryByRole("button", { name: /send alert|notify customer/i })).toBeNull()
  })
})
