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

export type SuccessCheck = {
  id: string
  finding: string
  qualifying: boolean
  invalidated: boolean
}

export type SuccessBaseline = {
  baselineId: string
  targetRef: string
  restrictionRef: string
}

export type SuccessPause = "OPEN" | "UPHELD" | "NOT_UPHELD"

export type SuccessVerificationSnapshot = {
  ready: Set<string>
  baselines: Map<string, SuccessBaseline>
  checks: Map<string, SuccessCheck[]>
  pauses: Map<string, SuccessPause>
}

function emptySnapshot(): SuccessVerificationSnapshot {
  return { ready: new Set(), baselines: new Map(), checks: new Map(), pauses: new Map() }
}

function isPause(value: unknown): value is SuccessPause {
  return value === "OPEN" || value === "UPHELD" || value === "NOT_UPHELD"
}

/**
 * Orders whose contracted target has a trustworthy pair at least 48 hours apart.
 *
 * A failed or unsigned read returns null so approval stays withheld.
 * At most fifty ids are sent, matching the database function.
 */
export async function loadSuccessVerification(orderIds: readonly string[]): Promise<SuccessVerificationSnapshot | null> {
  const ids = [...new Set(orderIds.filter(id => isUuid(id)))].slice(0, 50)
  if (ids.length === 0) return emptySnapshot()
  try {
    const token = (await cookies()).get(sessionCookie)?.value
    if (!token) return null
    const result = await backend().rpc<{
      status?: string
      ready?: unknown
      baselines?: unknown
      checks?: unknown
      pauses?: unknown
    }>("admin_success_verification_v1", {
      p_token: tokenHash(token),
      p_orders: ids,
    })
    if (result?.status !== "success" || !Array.isArray(result.ready) || !Array.isArray(result.baselines) || !Array.isArray(result.checks) || !Array.isArray(result.pauses)) {
      return null
    }
    const snapshot = emptySnapshot()
    for (const id of result.ready) if (typeof id === "string" && isUuid(id)) snapshot.ready.add(id)
    for (const row of result.baselines) {
      if (!row || typeof row !== "object") return null
      const item = row as { orderId?: unknown; baselineId?: unknown; targetRef?: unknown; restrictionRef?: unknown }
      if (typeof item.orderId !== "string" || !isUuid(item.orderId) || typeof item.baselineId !== "string" || typeof item.targetRef !== "string" || typeof item.restrictionRef !== "string") {
        return null
      }
      snapshot.baselines.set(item.orderId, { baselineId: item.baselineId, targetRef: item.targetRef, restrictionRef: item.restrictionRef })
    }
    for (const row of result.checks) {
      if (!row || typeof row !== "object") return null
      const item = row as { id?: unknown; orderId?: unknown; finding?: unknown; qualifying?: unknown; invalidated?: unknown }
      if (typeof item.id !== "string" || !isUuid(item.id) || typeof item.orderId !== "string" || typeof item.finding !== "string" || typeof item.qualifying !== "boolean" || typeof item.invalidated !== "boolean") {
        return null
      }
      const list = snapshot.checks.get(item.orderId) ?? []
      list.push({ id: item.id, finding: item.finding, qualifying: item.qualifying, invalidated: item.invalidated })
      snapshot.checks.set(item.orderId, list)
    }
    for (const row of result.pauses) {
      if (!row || typeof row !== "object") return null
      const item = row as { orderId?: unknown; status?: unknown }
      if (typeof item.orderId !== "string" || !isPause(item.status)) return null
      if (!snapshot.pauses.has(item.orderId) || item.status === "OPEN") snapshot.pauses.set(item.orderId, item.status)
    }
    return snapshot
  } catch {
    return null
  }
}
