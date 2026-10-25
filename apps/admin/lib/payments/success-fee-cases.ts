import "server-only"

import { cookies } from "next/headers"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
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

/**
 * Orders whose two success observations are far enough apart to bill.
 *
 * A failed or unsigned read returns null so approval stays withheld.
 * At most fifty ids are sent, matching the database function.
 */
export async function loadSuccessVerification(orderIds: readonly string[]): Promise<Set<string> | null> {
  const ids = [...new Set(orderIds.filter(id => isUuid(id)))].slice(0, 50)
  if (ids.length === 0) return new Set()
  try {
    const token = (await cookies()).get(sessionCookie)?.value
    if (!token) return null
    const result = await backend().rpc<{ status?: string; ready?: string[] }>("admin_success_verification_v1", {
      p_token: tokenHash(token),
      p_orders: ids,
    })
    if (result?.status !== "success" || !Array.isArray(result.ready)) return null
    return new Set(result.ready.filter(id => typeof id === "string"))
  } catch {
    return null
  }
}
