/**
 * The reads behind the workbench, kept apart from the reasoning.
 *
 * Three existing sources answer the whole page: the dashboard projection for
 * everything that is not a case, the Cases list for which cases are open, and
 * the UX-3 batch projection for what each of those cases needs. Nothing new is
 * queried and nothing is queried per case.
 *
 * The one thing this module is strict about is time. Every case is resolved
 * against the same instant, because "overdue" compared against five slightly
 * different clocks is not an ordering anybody can reason about, and the whole
 * point of Today is comparing cases with each other.
 */

import "server-only"

import { loadCaseFlows } from "../case-flow/load"
import { listCases } from "../cases/queries"
import { loadDashboard } from "../reports/queries"
import { buildTodayWorkModel, type DashboardFacts, type TodayWorkModel } from "./model"
import { TODAY_CASE_SCAN_LIMIT, caseFlowChunks, scanOpenCases } from "./scan"
import type { CaseFlowModel } from "../case-flow/model"

/**
 * Today always asks for the current operational position.
 *
 * Reports owns historical periods. A querystring on this page cannot move the
 * work out from under the operator, so an old bookmarked custom range simply
 * has no effect here rather than producing an error.
 */
export async function loadTodayWork(now: Date = new Date()): Promise<TodayWorkModel> {
  const [dashboard, scan] = await Promise.all([
    loadDashboard("today", null, null) as Promise<DashboardFacts>,
    scanOpenCases(cursor =>
      listCases({ q: "", filter: "open", time: cursor?.time ?? null, before: cursor?.before ?? null }),
    ),
  ])

  // An incomplete scan is not ranked, so projecting those cases would be five
  // heavy reads whose answers the page is obliged to throw away. The rows
  // stay, so the page can still say how far the scan got.
  const flows = new Map<string, CaseFlowModel>()
  if (scan.complete) {
    const batches = await Promise.all(caseFlowChunks(scan.rows).map(chunk => loadCaseFlows(chunk, now)))
    for (const batch of batches) for (const [caseId, flow] of batch) flows.set(caseId, flow)
  }

  return buildTodayWorkModel({
    now,
    dashboard,
    rows: scan.rows,
    flows,
    complete: scan.complete,
    scanLimit: TODAY_CASE_SCAN_LIMIT,
  })
}
