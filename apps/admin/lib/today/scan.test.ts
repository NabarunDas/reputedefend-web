/**
 * Reading every open case, or admitting that it could not be done.
 *
 * The scan is the part of the workbench that can be wrong without looking
 * wrong. A page that quietly skips a case still renders; a page that reads
 * one twice still renders; a page that ranks the first fifty and calls them
 * "today's work" renders best of all. So these tests count what was read,
 * check that every open case appears exactly once, and check that passing
 * the bound produces an incomplete answer rather than a confident partial
 * one.
 *
 * The reader is a function, so none of this needs a database or a mocked
 * module: the cursor contract is the thing under test, and that is pure.
 */

import { describe, expect, it, vi } from "vitest"
import { CASE_PAGE_SIZE, casePage } from "../cases/pagination"
import { CASE_FLOW_BATCH_LIMIT } from "../case-flow/projection"
import { TODAY_CASE_SCAN_LIMIT, caseFlowChunks, expectedReads, scanOpenCases } from "./scan"
import type { CaseCursor } from "../cases/pagination"
import type { CaseRow } from "../cases/model"

/**
 * Cases as the list returns them: newest first, each one a moment older than
 * the one before, so the keyset cursor has something real to walk.
 */
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

/**
 * The database, as far as the scan can tell: `admin_case_list_v1` ordered by
 * `(created_at, id)` descending, fifty-one rows at a time, cursor-filtered
 * exactly as the SQL filters it.
 */
function listing(all: CaseRow[]) {
  const calls: Array<CaseCursor | null> = []
  const read = async (cursor: CaseCursor | null) => {
    calls.push(cursor)
    const after = cursor
      ? all.filter(row => row.createdAt < cursor.time || (row.createdAt === cursor.time && row.id < cursor.before))
      : all
    return after.slice(0, CASE_PAGE_SIZE + 1)
  }
  return { read, calls }
}

describe("walking the case list", () => {
  it("reads nothing beyond the first page when there are no open cases", async () => {
    const list = listing([])
    const scan = await scanOpenCases(list.read)
    expect(scan).toEqual({ rows: [], complete: true })
    expect(list.calls).toEqual([null])
  })

  it("stops after one page when one page holds them all", async () => {
    const list = listing(openCases(12))
    const scan = await scanOpenCases(list.read)
    expect(scan.rows).toHaveLength(12)
    expect(scan.complete).toBe(true)
    expect(list.calls).toEqual([null])
  })

  it("treats exactly a full page as the last page, because there is no fifty-first row", async () => {
    const list = listing(openCases(CASE_PAGE_SIZE))
    const scan = await scanOpenCases(list.read)
    expect(scan.rows).toHaveLength(CASE_PAGE_SIZE)
    expect(scan.complete).toBe(true)
    expect(list.calls).toHaveLength(1)
  })

  it("follows the cursor to a second page and keeps the fifty-first case", async () => {
    const all = openCases(CASE_PAGE_SIZE + 1)
    const list = listing(all)
    const scan = await scanOpenCases(list.read)
    expect(scan.rows.map(row => row.id)).toEqual(all.map(row => row.id))
    expect(scan.complete).toBe(true)
    // The cursor is the fiftieth row, which is the one the queue pages on.
    expect(list.calls[1]).toEqual({ time: all[49].createdAt, before: all[49].id })
  })

  it("walks several pages without losing or repeating a case", async () => {
    const all = openCases(137)
    const list = listing(all)
    const scan = await scanOpenCases(list.read)
    expect(scan.complete).toBe(true)
    expect(scan.rows.map(row => row.id)).toEqual(all.map(row => row.id))
    expect(new Set(scan.rows.map(row => row.id)).size).toBe(137)
    expect(list.calls).toHaveLength(3)
  })

  it("advances the cursor to the last row of each page it read", async () => {
    const all = openCases(137)
    const list = listing(all)
    await scanOpenCases(list.read)
    expect(list.calls).toEqual([
      null,
      { time: all[49].createdAt, before: all[49].id },
      { time: all[99].createdAt, before: all[99].id },
    ])
  })

  it("uses the same page rule as the Cases queue rather than its own", async () => {
    // Both read the fifty-first row as evidence of another page and neither
    // shows it. If that ever diverges, a case falls down the gap.
    const all = openCases(CASE_PAGE_SIZE + 1)
    expect(casePage(all).rows).toHaveLength(CASE_PAGE_SIZE)
    expect(casePage(all).next).toEqual({ time: all[49].createdAt, before: all[49].id })
  })

  it("refuses to carry on if the list repeats a case, rather than counting it twice", async () => {
    const repeated = openCases(CASE_PAGE_SIZE + 1)
    const read = vi.fn(async () => repeated.slice(0, CASE_PAGE_SIZE + 1))
    await expect(scanOpenCases(read)).rejects.toThrow(/repeated a case/)
  })
})

describe("the scan bound", () => {
  it("is two hundred and fifty, which is five pages of each existing read", () => {
    expect(TODAY_CASE_SCAN_LIMIT).toBe(250)
    expect(TODAY_CASE_SCAN_LIMIT / CASE_PAGE_SIZE).toBe(5)
    expect(TODAY_CASE_SCAN_LIMIT / CASE_FLOW_BATCH_LIMIT).toBe(5)
  })

  it("reads exactly the bound and still reports a complete picture", async () => {
    const list = listing(openCases(TODAY_CASE_SCAN_LIMIT))
    const scan = await scanOpenCases(list.read)
    expect(scan.rows).toHaveLength(TODAY_CASE_SCAN_LIMIT)
    expect(scan.complete).toBe(true)
    expect(list.calls).toHaveLength(5)
  })

  it("reports an incomplete picture the moment there is one case too many", async () => {
    const list = listing(openCases(TODAY_CASE_SCAN_LIMIT + 1))
    const scan = await scanOpenCases(list.read)
    expect(scan.complete).toBe(false)
    expect(scan.rows).toHaveLength(TODAY_CASE_SCAN_LIMIT)
  })

  it("does not keep reading pages after the bound", async () => {
    const list = listing(openCases(1000))
    const scan = await scanOpenCases(list.read)
    expect(list.calls).toHaveLength(5)
    expect(scan.complete).toBe(false)
  })
})

describe("chunking for the projection", () => {
  it("asks for no more than the fifty the applied UX-3 projection accepts", () => {
    const chunks = caseFlowChunks(openCases(TODAY_CASE_SCAN_LIMIT))
    expect(chunks).toHaveLength(5)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CASE_FLOW_BATCH_LIMIT)
  })

  it("covers every scanned case exactly once, in order", () => {
    const rows = openCases(137)
    const ids = caseFlowChunks(rows).flat()
    expect(ids).toEqual(rows.map(row => row.id))
    expect(new Set(ids).size).toBe(137)
  })

  it("asks for nothing when nothing was scanned", () => {
    expect(caseFlowChunks([])).toEqual([])
  })
})

describe("what the page costs", () => {
  it("is one list read and one projection read per fifty cases, plus one dashboard", () => {
    expect(expectedReads(0)).toEqual({ caseList: 1, caseFlowBatches: 0, dashboard: 1 })
    expect(expectedReads(1)).toEqual({ caseList: 1, caseFlowBatches: 1, dashboard: 1 })
    expect(expectedReads(50)).toEqual({ caseList: 1, caseFlowBatches: 1, dashboard: 1 })
    expect(expectedReads(51)).toEqual({ caseList: 2, caseFlowBatches: 2, dashboard: 1 })
    expect(expectedReads(250)).toEqual({ caseList: 5, caseFlowBatches: 5, dashboard: 1 })
  })

  it("stops projecting once the scan cannot finish, and still reads only five list pages", () => {
    expect(expectedReads(251)).toEqual({ caseList: 5, caseFlowBatches: 0, dashboard: 1 })
    expect(expectedReads(1000)).toEqual({ caseList: 5, caseFlowBatches: 0, dashboard: 1 })
  })

  it("never grows with the number of cases the way a per-case read would", () => {
    expect(expectedReads(250).caseFlowBatches).toBeLessThan(250)
  })
})
