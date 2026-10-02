/**
 * Reading every open case the workbench is allowed to reason about.
 *
 * Today orders cases against each other, which only means anything if it has
 * looked at all of them. Resolving the first page and calling it "what to do
 * next" would be worse than useless: a Safety case sitting on page three
 * would be invisible precisely when it mattered. So the scan walks the
 * existing cursor pagination to a hard bound, and when the bound is not
 * enough it says so rather than ranking a sample.
 *
 * The bound is what keeps the page honest about cost too. Two hundred and
 * fifty cases is five list reads and five projection reads; there is no
 * per-case call anywhere in here.
 */

import { CASE_PAGE_SIZE, casePage, type CaseCursor } from "../cases/pagination"
import { CASE_FLOW_BATCH_LIMIT } from "../case-flow/projection"
import type { CaseRow } from "../cases/model"

/**
 * The most open cases Today will prioritise. Five pages of the existing
 * fifty-row list, which is also five batches of the fifty-case projection.
 */
export const TODAY_CASE_SCAN_LIMIT = 250

export type CaseScan = {
  rows: CaseRow[]
  /**
   * False when the scan stopped at the bound with cases still unread, which
   * means nothing here may be presented as the full picture.
   */
  complete: boolean
}

/** One page of open cases, oldest-first cursor or null for the first page. */
export type CasePageReader = (cursor: CaseCursor | null) => Promise<CaseRow[]>

/**
 * Walks pages until the list runs out or the bound is reached.
 *
 * Keyset pagination on `(created_at, id)` cannot repeat a row, so a repeat
 * means the cursor did not advance and the pages can no longer be trusted to
 * cover the population. That is a broken contract rather than a busy day, and
 * it stops the scan outright instead of quietly producing a work list with a
 * case counted twice and another never read.
 */
export async function scanOpenCases(read: CasePageReader, limit = TODAY_CASE_SCAN_LIMIT): Promise<CaseScan> {
  const rows: CaseRow[] = []
  const seen = new Set<string>()
  let cursor: CaseCursor | null = null

  while (rows.length < limit) {
    const page = casePage(await read(cursor))
    for (const row of page.rows) {
      if (seen.has(row.id)) throw new Error("The case list repeated a case, so the scan cannot be trusted")
      seen.add(row.id)
      rows.push(row)
    }
    if (!page.next) return { rows, complete: true }
    cursor = page.next
  }

  return { rows, complete: false }
}

/**
 * Identifiers in batches the projection will accept.
 *
 * UX-3 caps `admin_case_flow_facts_v1` at fifty per call and that cap is in
 * an applied migration. Today chunks to it rather than asking for more.
 */
export function caseFlowChunks(rows: readonly CaseRow[], size = CASE_FLOW_BATCH_LIMIT): string[][] {
  const chunks: string[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size).map(row => row.id))
  }
  return chunks
}

/** Reads expected for a scan of this many cases, for the cost documentation. */
export function expectedReads(caseCount: number) {
  return {
    caseList: Math.max(1, Math.ceil(caseCount / CASE_PAGE_SIZE)),
    caseFlowBatches: Math.ceil(caseCount / CASE_FLOW_BATCH_LIMIT),
    dashboard: 1,
  }
}
