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
const SETUP_CONFLICT = "A payment method is saved without later-charge consent, so success-fee approval is withheld."
const SETUP_INCOMPLETE = "Payment-method setup is not complete, so success-fee approval is not offered."
const CONSENT_WITHOUT_METHOD = "Later-charge consent is recorded, but there is no usable payment method yet, so success-fee approval is not offered."

/**
 * Whether the global Money page may offer success-fee approval.
 *
 * The same presentation prerequisites as the case Commercial workspace:
 * a linked success-fee order, a usable payment method, later-charge consent,
 * no setup conflict, no existing approval, a qualifying outcome, and accepted
 * evidence. `approve_success_fee` checks the rules again. Approval is not a charge.
 */
export function successFeeApprovalOffer(
  order: Pick<MoneyOrder, "paymentModel" | "approvalId" | "caseId" | "acceptedEvidence" | "setupReady" | "consentId">,
  outcomes: Map<string, SuccessFeeCaseOutcome> | null,
): SuccessFeeApprovalOffer {
  if (order.paymentModel !== "SUCCESS_FEE" || order.approvalId) return { kind: "hidden" }
  if (!order.caseId || !isUuid(order.caseId)) return { kind: "explain", message: UNKNOWN_CASE }
  if (!outcomes) return { kind: "explain", message: UNKNOWN_OUTCOME }
  const facts = outcomes.get(order.caseId)
  if (!facts) return { kind: "explain", message: UNKNOWN_OUTCOME }
  if (!isQualifyingSuccessFeeOutcome(facts.caseType, facts.outcome)) return { kind: "explain", message: NOT_DUE }
  const consent = !!order.consentId
  if (order.setupReady && !consent) return { kind: "explain", message: SETUP_CONFLICT }
  if (!order.setupReady) return { kind: "explain", message: consent ? CONSENT_WITHOUT_METHOD : SETUP_INCOMPLETE }
  if (!order.acceptedEvidence?.length) return { kind: "explain", message: NEEDS_EVIDENCE }
  return { kind: "approve" }
}
