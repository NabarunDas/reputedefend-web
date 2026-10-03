import { isUuid } from "../records/model"
import type { MoneyOrder } from "./model"
import { isQualifyingSuccessFeeOutcome } from "./success-fee"

export type SuccessFeeCaseOutcome = {
  caseType: string
  outcome: string | null
}

export type SuccessFeeApprovalOffer =
  | { kind: "hidden" }
  | { kind: "approve" }
  | { kind: "explain"; message: string }

const NOT_DUE = "Success-fee approval is not due yet. Profile Recovery qualifies when the outcome is Restored. Review Protection qualifies when the outcome is Removed. Approval is not payment."
const NEEDS_EVIDENCE = "A qualifying outcome is recorded. Approval still needs accepted evidence for this case, and a saved payment method does not approve the fee."
const UNKNOWN_CASE = "This success-fee order is not linked to a case, so approval is withheld."
const UNKNOWN_OUTCOME = "The case outcome could not be confirmed, so success-fee approval is withheld."

/**
 * Whether the global Money page may offer success-fee approval.
 *
 * Presentation only. `approve_success_fee` still checks the qualifying
 * outcome, the accepted evidence and a fresh sign-in. A missing outcome is
 * withheld rather than treated as eligible.
 */
export function successFeeApprovalOffer(
  order: Pick<MoneyOrder, "paymentModel" | "approvalId" | "caseId" | "acceptedEvidence">,
  outcomes: Map<string, SuccessFeeCaseOutcome> | null,
): SuccessFeeApprovalOffer {
  if (order.paymentModel !== "SUCCESS_FEE" || order.approvalId) return { kind: "hidden" }
  if (!order.caseId || !isUuid(order.caseId)) return { kind: "explain", message: UNKNOWN_CASE }
  if (!outcomes) return { kind: "explain", message: UNKNOWN_OUTCOME }
  const facts = outcomes.get(order.caseId)
  if (!facts) return { kind: "explain", message: UNKNOWN_OUTCOME }
  if (!isQualifyingSuccessFeeOutcome(facts.caseType, facts.outcome)) return { kind: "explain", message: NOT_DUE }
  if (!order.acceptedEvidence?.length) return { kind: "explain", message: NEEDS_EVIDENCE }
  return { kind: "approve" }
}
