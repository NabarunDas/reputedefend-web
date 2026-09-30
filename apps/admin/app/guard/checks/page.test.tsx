// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { GuardCheckQueuePage, GuardCheckQueues } from "@/lib/guard/checks-model"

const loadGuardChecks = vi.fn()
vi.mock("@/lib/guard/checks-queries", () => ({
  loadGuardChecks: (...args: unknown[]) => loadGuardChecks(...args),
}))

import GuardChecksPage from "./page"

function emptyPage(overrides: Partial<GuardCheckQueuePage> = {}): GuardCheckQueuePage {
  return { rows: [], hasMore: false, nextCursor: null, after: null, invalidCursor: false, ...overrides }
}

function queues(overrides: Partial<GuardCheckQueues> = {}): GuardCheckQueues {
  return {
    serviceDate: "2026-09-30",
    timezone: "Europe/London",
    scheduleConfigured: false,
    claimedByMe: "11111111-1111-4111-8111-111111111111",
    morning: emptyPage(),
    evening: emptyPage(),
    claimed: emptyPage(),
    retry: emptyPage(),
    missed: emptyPage(),
    completed: emptyPage(),
    ...overrides,
  }
}

describe("guard check queues", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
    loadGuardChecks.mockReset().mockResolvedValue(queues())
  })
  afterEach(() => {
    cleanup()
  })

  it("renders Europe/London queues without inventing window times", async () => {
    render(await GuardChecksPage({ searchParams: Promise.resolve({}) }))
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

  it("exposes bounded pagination when a queue has more than 50 rows", async () => {
    loadGuardChecks.mockResolvedValue(queues({
      missed: emptyPage({
        rows: [{
          id: "55555555-5555-4555-8555-555555555555",
          coverageId: "c",
          locationId: "l",
          coverageBasis: "INCLUDED",
          serviceDate: "2026-09-01",
          windowCode: "MORNING",
          state: "PENDING",
          timezone: "Europe/London",
          locationName: "High Street",
          businessName: "Bakery",
          customerName: "Alex",
          late: false,
          secondsLate: 0,
          attemptCount: 0,
          retryCount: 0,
          version: 1,
          missedAt: "2026-09-01T10:00:01.000Z",
        }],
        hasMore: true,
        nextCursor: "66666666-6666-4666-8666-666666666666",
      }),
    }))
    render(await GuardChecksPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("link", { name: "View more" })).toHaveAttribute(
      "href",
      "/guard/checks?missed=66666666-6666-4666-8666-666666666666",
    )
    expect(screen.queryByRole("link", { name: "First page" })).toBeNull()
  })

  it("uses the queue cursor for the next page and offers a way back", async () => {
    loadGuardChecks.mockResolvedValue(queues({
      missed: emptyPage({
        rows: [{
          id: "77777777-7777-4777-8777-777777777777",
          coverageId: "c",
          locationId: "l",
          coverageBasis: "INCLUDED",
          serviceDate: "2026-09-02",
          windowCode: "EVENING",
          state: "PENDING",
          timezone: "Europe/London",
          locationName: "Side Street",
          businessName: "Bakery",
          customerName: "Alex",
          late: false,
          secondsLate: 0,
          attemptCount: 0,
          retryCount: 0,
          version: 1,
        }],
        hasMore: true,
        nextCursor: "88888888-8888-4888-8888-888888888888",
        after: "66666666-6666-4666-8666-666666666666",
      }),
    }))
    render(await GuardChecksPage({
      searchParams: Promise.resolve({ missed: "66666666-6666-4666-8666-666666666666" }),
    }))
    expect(loadGuardChecks).toHaveBeenCalledWith({ missed: "66666666-6666-4666-8666-666666666666" })
    expect(screen.getByRole("link", { name: "First page" })).toHaveAttribute("href", "/guard/checks")
    expect(screen.getByRole("link", { name: "View more" })).toHaveAttribute(
      "href",
      "/guard/checks?missed=88888888-8888-4888-8888-888888888888",
    )
  })
})
