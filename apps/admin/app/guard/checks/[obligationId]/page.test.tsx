// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { GuardCheckDetail, GuardCheckObligation } from "@/lib/guard/checks-model"

const loadGuardCheck = vi.fn()
vi.mock("@/lib/guard/checks-queries", () => ({
  loadGuardCheck: (...args: unknown[]) => loadGuardCheck(...args),
}))

import GuardCheckDetailPage from "./page"

const actor = "11111111-1111-4111-8111-111111111111"
const other = "99999999-9999-4999-8999-999999999999"
const obligationId = "55555555-5555-4555-8555-555555555555"

function row(overrides: Partial<GuardCheckObligation> = {}): GuardCheckObligation {
  return {
    id: obligationId,
    coverageId: "c",
    locationId: "l",
    coverageBasis: "INCLUDED",
    coverageState: "ACTIVE",
    serviceDate: "2026-09-30",
    windowCode: "MORNING",
    state: "CLAIMED",
    timezone: "Europe/London",
    locationName: "High Street",
    businessName: "Bakery",
    customerName: "Alex",
    claimedBy: actor,
    claimExpiresAt: "2026-09-30T10:05:00.000Z",
    late: false,
    secondsLate: 0,
    attemptCount: 1,
    retryCount: 0,
    version: 2,
    windowOpen: true,
    upcoming: false,
    ...overrides,
  }
}

function detail(overrides: Partial<GuardCheckDetail> = {}, obligationOverrides: Partial<GuardCheckObligation> = {}): GuardCheckDetail {
  return {
    serviceDate: "2026-09-30",
    timezone: "Europe/London",
    scheduleConfigured: true,
    claimedByMe: actor,
    now: "2026-09-30T09:00:00.000Z",
    obligation: row(obligationOverrides),
    attempts: [],
    observation: null,
    ...overrides,
  }
}

describe("guard check detail work surface", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
    loadGuardCheck.mockReset()
  })
  afterEach(() => {
    cleanup()
  })

  it("shows work forms for the current Admin's live claim and hides cancel on ACTIVE coverage", async () => {
    loadGuardCheck.mockResolvedValue(detail())
    render(await GuardCheckDetailPage({ params: Promise.resolve({ obligationId }) }))
    expect(screen.getByRole("button", { name: "Complete observation" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record failure and retry" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Release claim" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancel check" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Reclaim check" })).toBeNull()
  })

  it("exposes no work mutations for another Admin's live claim", async () => {
    loadGuardCheck.mockResolvedValue(detail({}, { claimedBy: other }))
    render(await GuardCheckDetailPage({ params: Promise.resolve({ obligationId }) }))
    expect(screen.getByText("Claimed by another operator")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Complete observation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record failure and retry" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Release claim" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Cancel check" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Reclaim check" })).toBeNull()
  })

  it("shows Reclaim when the claim has expired", async () => {
    loadGuardCheck.mockResolvedValue(detail({ now: "2026-09-30T10:05:01.000Z" }))
    render(await GuardCheckDetailPage({ params: Promise.resolve({ obligationId }) }))
    expect(screen.getByText("Claim expired")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reclaim check" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Complete observation" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Record failure and retry" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Release claim" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Cancel check" })).toBeNull()
  })
})
