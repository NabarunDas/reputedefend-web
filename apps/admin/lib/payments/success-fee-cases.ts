import "server-only"

import { loadCaseFlowsFacts } from "../case-flow/load"
import { CASE_FLOW_BATCH_LIMIT } from "../case-flow/projection"
import { isUuid } from "../records/model"
import type { MoneyOrder } from "./model"
import type { SuccessFeeCaseOutcome } from "./success-fee-offer"

/**
 * Case type and outcome for success-fee orders that might be approved.
 *
 * One batch projection call per fifty cases. A failed read returns null so
 * the page can withhold approval instead of guessing. Orders that are not
 * success fees, or that are already approved, are not looked up.
 */
export async function loadSuccessFeeCaseOutcomes(
  orders: readonly MoneyOrder[],
): Promise<Map<string, SuccessFeeCaseOutcome> | null> {
  const ids = [...new Set(orders.flatMap(order => {
    if (order.paymentModel !== "SUCCESS_FEE" || order.approvalId) return []
    return order.caseId && isUuid(order.caseId) ? [order.caseId] : []
  }))]
  if (ids.length === 0) return new Map()
  const outcomes = new Map<string, SuccessFeeCaseOutcome>()
  try {
    for (let index = 0; index < ids.length; index += CASE_FLOW_BATCH_LIMIT) {
      const facts = await loadCaseFlowsFacts(ids.slice(index, index + CASE_FLOW_BATCH_LIMIT))
      for (const [caseId, row] of facts) outcomes.set(caseId, { caseType: row.caseType, outcome: row.outcome })
    }
  } catch {
    return null
  }
  return outcomes
}
