/**
 * The one place that knows how a page of cases ends.
 *
 * `admin_case_list_v1` orders by `(created_at, id)` descending and returns
 * fifty-one rows. The fifty-first is never shown: it exists only as evidence
 * that another page is there, and the cursor for that page is the identifier
 * and creation time of the fiftieth. Getting that off by one either hides a
 * case or shows it twice, so the queue and the Today scan read it from here
 * rather than each counting rows for themselves.
 */

import type { CaseRow } from "./model"

/** Rows shown per page. The list RPC reads one more than this. */
export const CASE_PAGE_SIZE = 50

/**
 * The two query parameters that locate the next page, named as the URL and
 * the RPC name them so neither end has to translate.
 */
export type CaseCursor = { time: string; before: string }

export type CasePage = {
  rows: CaseRow[]
  /** Where the next page starts, or null when this was the last one. */
  next: CaseCursor | null
}

export function casePage(fetched: readonly CaseRow[]): CasePage {
  const rows = fetched.slice(0, CASE_PAGE_SIZE)
  const last = rows.at(-1)
  if (fetched.length <= CASE_PAGE_SIZE || !last) return { rows, next: null }
  return { rows, next: { time: last.createdAt, before: last.id } }
}
