/**
 * What the workbench asks for, counted at the loader.
 *
 * The scan tests prove the cursor walks correctly. These prove the loader
 * spends that walk the way the page can use: a projection batch per fifty
 * cases when the scan finished, and none at all when it did not, because a
 * ranking the page will not show is not worth five of the heaviest reads
 * this application makes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

const listCases = vi.fn()
const loadCaseFlows = vi.fn()
const loadDashboard = vi.fn()

vi.mock("../cases/queries", () => ({ listCases: (...args: unknown[]) => listCases(...args) }))
vi.mock("../case-flow/load", () => ({ loadCaseFlows: (...args: unknown[]) => loadCaseFlows(...args) }))
vi.mock("../reports/queries", () => ({ loadDashboard: (...args: unknown[]) => loadDashboard(...args) }))

import { dashboard } from "../../app/today/fixtures"
import { loadTodayWork } from "./load"
import { TODAY_CASE_SCAN_LIMIT } from "./scan"
import type { CaseRow } from "../cases/model"

const NOW = new Date("2026-06-01T12:00:00.000Z")

function openCases(count: number): CaseRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${(index + 1).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`,
    reference: `PR-${3000 + index}`,
    type: "PROFILE_RECOVERY",
    stage: "INITIAL_REVIEW",
    track: "UNDECIDED",
    status: "UNDER_REVIEW",
    client: "Alex Mercer",
    business: "Mercer Bakery",
    assigned: true,
    priority: "NORMAL",
    nextAction: "",
    due: null,
    createdAt: new Date(Date.UTC(2026, 5, 1, 12) - index * 60_000).toISOString(),
  } as CaseRow))
}

beforeEach(() => {
  listCases.mockReset()
  loadCaseFlows.mockReset().mockResolvedValue(new Map())
  loadDashboard.mockReset().mockResolvedValue(dashboard())
})

function serve(count: number) {
  const rows = openCases(count)
  listCases.mockImplementation(async (filters: { time: string | null; before: string | null }) => {
    const time = filters.time
    const before = filters.before
    const after = time == null
      ? rows
      : rows.filter(row => row.createdAt < time || (row.createdAt === time && (before == null || row.id < before)))
    return after.slice(0, 51)
  })
}

describe("projection batches on a complete scan", () => {
  it.each([
    [49, 1],
    [50, 1],
    [51, 2],
    [250, 5],
  ])("%i open cases make %i projection batches", async (count, batches) => {
    serve(count)
    const model = await loadTodayWork(NOW)
    expect(loadCaseFlows).toHaveBeenCalledTimes(batches)
    expect(loadCaseFlows.mock.calls.map(call => call[0].length).reduce((sum, size) => sum + size, 0)).toBe(count)
    for (const call of loadCaseFlows.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(50)
      expect(call[1]).toBe(NOW)
    }
    expect(model.caseWork.complete).toBe(true)
    expect(model.caseWork.scannedCaseCount).toBe(count)
    expect(loadDashboard).toHaveBeenCalledTimes(1)
  })
})

describe("an incomplete scan", () => {
  beforeEach(() => serve(TODAY_CASE_SCAN_LIMIT + 1))

  it("makes no projection call, because nothing it returned would be shown", async () => {
    await loadTodayWork(NOW)
    expect(loadCaseFlows).not.toHaveBeenCalled()
    expect(listCases).toHaveBeenCalledTimes(5)
    expect(loadDashboard).toHaveBeenCalledTimes(1)
    expect(loadDashboard).toHaveBeenCalledWith("today", null, null)
  })

  it("still reports how far the scan got, and ranks nothing", async () => {
    const model = await loadTodayWork(NOW)
    expect(model.caseWork.complete).toBe(false)
    expect(model.caseWork.scannedCaseCount).toBe(TODAY_CASE_SCAN_LIMIT)
    expect(model.caseWork.scanLimit).toBe(TODAY_CASE_SCAN_LIMIT)
    expect(model.caseWork.doNext).toEqual([])
    expect(model.caseWork.blocked).toEqual([])
    expect(model.caseWork.counts).toEqual({ doNext: 0, blocked: 0, waiting: 0 })
    expect(model.summary.clear).toBe(false)
  })

  it("still answers for the dashboard, which does not depend on the scan", async () => {
    loadDashboard.mockResolvedValue(dashboard({
      needsAttention: { failedJobs: { count: 2 } },
      monitoringScheduleConfigured: true,
      secondary: { todayWindows: [{ id: "evening", windowCode: "EVENING", state: "PENDING" }] },
    }))
    const model = await loadTodayWork(NOW)
    expect(model.operational.flatMap(group => group.queues).map(queue => queue.key)).toEqual(["failed_jobs"])
    expect(model.guard.windows.map(window => window.id)).toEqual(["evening"])
    expect(model.management.length).toBeGreaterThan(0)
  })
})
