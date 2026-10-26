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
const NEEDS_EVIDENCE = "A qualifying outcome is recorded. Approval still needs accepted evidence for this case. A saved payment method does not approve the fee."
const UNKNOWN_CASE = "This success-fee order is not linked to a case, so approval is withheld."
const UNKNOWN_OUTCOME = "The case outcome could not be confirmed, so success-fee approval is withheld."
const NEEDS_VERIFICATION = "Two recorded observations of the same profile or review must be at least 48 hours apart, and the original issue must not be known to have returned between them. One attachment is not that verification. A saved card is not required and nothing is charged automatically."

/**
 * Whether the global Money page may offer success-fee approval.
 *
 * A linked success-fee order, no existing approval, a qualifying outcome,
 * the two-observation verification, and accepted evidence. A saved card is
 * not a prerequisite. `approve_success_fee` checks the rules again.
 * Approval is not a charge.
 */
export function successFeeApprovalOffer(
  order: Pick<MoneyOrder, "paymentModel" | "approvalId" | "caseId" | "acceptedEvidence">,
  outcomes: Map<string, SuccessFeeCaseOutcome> | null,
  verificationReady: boolean,
): SuccessFeeApprovalOffer {
  if (order.paymentModel !== "SUCCESS_FEE" || order.approvalId) return { kind: "hidden" }
  if (!order.caseId || !isUuid(order.caseId)) return { kind: "explain", message: UNKNOWN_CASE }
  if (!outcomes) return { kind: "explain", message: UNKNOWN_OUTCOME }
  const facts = outcomes.get(order.caseId)
  if (!facts) return { kind: "explain", message: UNKNOWN_OUTCOME }
  if (!isQualifyingSuccessFeeOutcome(facts.caseType, facts.outcome)) return { kind: "explain", message: NOT_DUE }
  if (!verificationReady) return { kind: "explain", message: NEEDS_VERIFICATION }
  if (!order.acceptedEvidence?.length) return { kind: "explain", message: NEEDS_EVIDENCE }
  return { kind: "approve" }
}
