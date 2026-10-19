/**
 * Guided Step 10 reads the existing outcome and billing records.
 *
 * `record_outcome` stores the outcome and summary on an open case. It does not
 * change status, stage or the closure date, and it does not approve a fee,
 * create an invoice or take a payment. `close` remains the closure command.
 * A stored outcome is authoritative when it is a coherent closed record, or
 * when it already has the pre-closure shape. After a reopen, that shape also
 * needs a later `record_outcome` work event that matches the stored outcome
 * and summary. Approval, an invoice link, a saved card and a checkout return
 * are not payment.
 */

import type { CaseFlowFacts, CaseFlowOrderFact } from "../case-flow/model"
import { commercialQuotesTied } from "../case-flow/resolve"
import { outcomes, type Submission } from "../cases/model"
import { formatGbp, type ServiceOrder } from "../commerce/model"
import { obligationLabel, type MoneyOrder } from "../payments/model"
import { isQualifyingSuccessFeeOutcome } from "../payments/success-fee"
import { activationOrderLink } from "./activation"
import { readStoredOutcome, type OutcomeProofEvent } from "./outcome-proposal"
import { submissionPartyMatches, submissionRecordsDisagree } from "./submission"

export type OutcomeBillingPosition =
  | "none"
  | "incomplete"
  | "disagree"
  | "not_billable"
  | "pending"
  | "approved"
  | "invoiced"
  | "failed"
  | "settled"

export type OutcomeBillingProof = "complete" | "waiting" | "attention" | "unproven"

const headlines: Record<OutcomeBillingPosition, string> = {
  none: "Outcome not recorded",
  incomplete: "Billing records are incomplete",
  disagree: "Billing records disagree",
  not_billable: "Not billable",
  pending: "Pending billing",
  approved: "Approved fee",
  invoiced: "Invoiced",
  failed: "Payment failed",
  settled: "Settled",
}

export type JourneyOutcomeAttempt = {
  id: string
  reference: string
  state: string
  party: string
  submittedAt: string
  evidence: string
  resultNote: string | null
}

export type JourneyOutcomeRequirement = {
  label: string
  state: "Met" | "Not met"
  detail: string
}

export type JourneyOutcomeCommands = {
  approve: boolean
  invoice: boolean
  /** Records the outcome only. It does not close the case or approve a fee. */
  record: boolean
}

export type JourneyOutcomePanel = {
  headline: string
  detail: string
  outcomeLabel: string
  trackLabel: string
  billingLabel: string
  attempts: JourneyOutcomeAttempt[]
  evidence: string[]
  requirements: JourneyOutcomeRequirement[]
  notices: string[]
  who: string
  /** Null withholds every billing command. */
  commands: JourneyOutcomeCommands | null
  order: {
    orderId: string
    version: number
    obligationId: string | null
    evidence: Array<{ id: string; filename: string; versionNumber: number }>
  } | null
}

export type OutcomeBillingJudgement = {
  proof: OutcomeBillingProof
  headline: string
  known: string[]
  missing: string[]
  who: string
}

type RecordedOutcome = {
  submissions: Submission[] | null
  caseTrack: string
  caseOutcome: string | null
  caseStatus: string
  moneyOrders: MoneyOrder[] | null
}

type Projection = {
  position: OutcomeBillingPosition
  proof: OutcomeBillingProof
  incomplete: boolean
  conflict: boolean
  qualifying: boolean
  order: CaseFlowOrderFact | null
  known: string[]
  missing: string[]
  who: string
  notices: string[]
}

function outcomeLabel(value: string | null): string {
  if (!value) return "Not recorded"
  return value in outcomes ? outcomes[value as keyof typeof outcomes] : value
}

function trackLabel(track: string): string {
  if (track === "GUIDED") return "Guided"
  if (track === "MANAGED") return "Managed"
  return "Not chosen"
}

function closedStatus(status: string): boolean {
  return status === "CLOSED" || status === "CANCELLED"
}

function duplicateIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length
}

function sameId(value: string | null | undefined, expected: string | null | undefined): boolean {
  const left = value?.trim() ?? ""
  const right = expected?.trim() ?? ""
  return left.length > 0 && left === right
}

/** Settled Guided billing is the Step 7 accepted-paid order, not the awaiting state. */
function guidedOrderAgrees(order: CaseFlowOrderFact): boolean {
  const paid = order.obligationState === "PAID"
  const receipt = order.receiptRecorded
  if (order.orderState === "ACCEPTED_PAID") return paid && receipt
  if (order.orderState === "ACCEPTED_AWAITING_PAYMENT") return !paid && !receipt
  return false
}

function qualifyingEvidence(facts: CaseFlowFacts, versionId: string): boolean {
  const version = facts.evidence.versions.find(item => item.versionId === versionId)
  if (!version || version.documentId.trim().length === 0) return false
  return version.uploadStatus === "UPLOADED"
    && version.scanStatus === "NO_THREATS_FOUND"
    && version.validationStatus === "VALID"
    && version.reviewStatus === "ACCEPTED"
}

function projectOutcome(facts: CaseFlowFacts, now: string, events?: readonly OutcomeProofEvent[] | null): Projection {
  const closed = closedStatus(facts.caseStatus)
  const link = activationOrderLink(facts, now)
  const qualifying = isQualifyingSuccessFeeOutcome(facts.caseType, facts.outcome)
  const track = facts.serviceTrack
  const order = link.trackOrder
  const outcomeShape = readStoredOutcome({
    caseType: facts.caseType,
    stage: facts.technicalStage,
    status: facts.caseStatus,
    outcome: facts.outcome,
    summary: facts.outcomeSummary,
    reopened: facts.reopened,
    events,
  })
  const expectedModel = track === "GUIDED" ? "UPFRONT" : track === "MANAGED" ? "SUCCESS_FEE" : null
  const foreign = expectedModel ? facts.payment.orders.some(row => row.paymentModel !== expectedModel) : facts.payment.orders.length > 0
  const incomplete = !facts.commercial.complete || !facts.payment.complete || commercialQuotesTied(facts)
  const setupConflict = track === "MANAGED" && !!order?.setupReady && !order.consentRecorded
  const paidWithoutReceipt = !!order && order.obligationState === "PAID" && !order.receiptRecorded
  const receiptWithoutPaid = !!order && order.receiptRecorded && order.obligationState !== "PAID"
  const wrongGuidedObligation = track === "GUIDED" && !!order && order.obligationKind !== "UPFRONT"
  const wrongManagedObligation = track === "MANAGED" && !!order?.obligationKind && order.obligationKind !== "SUCCESS_FEE"
  const wrongState = !!order && (
    (track === "GUIDED" && !guidedOrderAgrees(order))
    || (track === "MANAGED" && order.orderState !== "ACCEPTED_SUCCESS_FEE")
  )
  const feeOnUnsuccessful = track === "MANAGED" && !!facts.outcome && !qualifying && order?.obligationKind === "SUCCESS_FEE"
  const outcomeConflict = outcomeShape === "conflict"
  const undecidedOutcome = !!facts.outcome && track !== "GUIDED" && track !== "MANAGED"
  const partyConflict = facts.submissions.some(item => !submissionPartyMatches(track, item.actor))
  const badResult = facts.submissions.some(item => item.result !== null && item.result !== "DECIDED" && item.result !== "WITHDRAWN")
  const brokenLink = link.reason === "mismatch" || link.reason === "ambiguous_orders" || duplicateIds(facts.payment.orders.map(row => row.orderId))
  const outcomeWithoutOrder = !!facts.outcome && !link.linked
  const conflict = foreign || setupConflict || paidWithoutReceipt || receiptWithoutPaid || wrongGuidedObligation
    || wrongManagedObligation || wrongState || feeOnUnsuccessful || outcomeConflict
    || undecidedOutcome || partyConflict || badResult || brokenLink || outcomeWithoutOrder

  let position: OutcomeBillingPosition = "none"
  if (conflict) position = "disagree"
  else if (incomplete) position = "incomplete"
  else if (!facts.outcome) position = "none"
  else if (track === "GUIDED") {
    position = order?.orderState === "ACCEPTED_PAID" && order.obligationState === "PAID" && order.receiptRecorded
      ? "settled"
      : order?.obligationState === "FAILED"
        ? "failed"
        : "pending"
  } else if (!qualifying) position = "not_billable"
  else if (order?.obligationState === "PAID" && order.receiptRecorded) position = "settled"
  else if (order?.obligationState === "FAILED") position = "failed"
  else if (order?.obligationKind === "SUCCESS_FEE" && order.obligationState === "DUE") position = "approved"
  else position = "pending"

  const obligationAttention = position === "pending" && !!order && (
    order.obligationState === "VOID" || order.obligationState === "AUTHENTICATION_REQUIRED"
  )
  const proof: OutcomeBillingProof = position === "disagree" || position === "incomplete" || position === "failed" || obligationAttention
    ? "attention"
    : position === "settled" || position === "not_billable"
      ? "complete"
      : position === "pending" || position === "approved"
        ? "waiting"
        : "unproven"

  const known = [
    facts.outcome ? `The case outcome is ${outcomeLabel(facts.outcome)}.` : "No case outcome is recorded.",
    `The selected service track is ${trackLabel(track)}.`,
  ]
  if (facts.reopened && !closed && facts.outcome && outcomeShape === "pre_closure") known.push("This case was reopened. A later record stored this outcome and did not close the case.")
  if (facts.reopened && !closed && facts.outcome && outcomeShape !== "pre_closure") known.push("This case was reopened and still has an outcome. That is not an authoritative pre-closure record.")
  if (facts.reopened && !closed && !facts.outcome) known.push("This case was reopened. The earlier outcome was cleared and does not verify this step.")
  if (facts.reopened && closed) known.push("This case was reopened before the current outcome was recorded.")
  if (outcomeShape === "pre_closure" && !conflict) known.push("The stored outcome is on an open case. Recording it did not close the case.")
  if (position === "disagree") known.push("The outcome and billing records do not agree, so no billing command is offered from here.")
  else if (position === "incomplete") known.push("The quote or payment list is incomplete, so billing cannot be confirmed from here.")
  else if (position === "settled" && track === "GUIDED") known.push("The Guided order is ACCEPTED_PAID, the upfront obligation is PAID, and a receipt is recorded. No second charge is inferred.")
  else if (position === "settled") known.push("The provider has confirmed the success-fee payment. Approval and an invoice link were not that confirmation.")
  else if (position === "not_billable") known.push("This outcome does not qualify for a success fee. An unsuccessful case is not invoiced to finish this step.")
  else if (position === "none") known.push("No case outcome is recorded yet. Recording one does not close the case, approve a success fee, or take a payment.")
  else if (order?.obligationState === "VOID") known.push("The obligation is void. It is not a settled payment, and this step does not collect it.")
  else if (order?.obligationState === "AUTHENTICATION_REQUIRED") known.push("The payment still needs authentication. That is not settlement.")
  else if (track === "GUIDED") known.push("The upfront fee is not settled. This step does not create a second charge.")
  else known.push("A Managed success fee is billed only after documented success. Approval, an invoice link, a saved card and a checkout return are not payment.")

  const missing = position === "disagree" || position === "incomplete"
    ? ["Outcome and billing records that agree."]
    : position === "none"
      ? ["A recorded case outcome. Recording it does not close the case."]
      : position === "settled" || position === "not_billable"
        ? []
        : order?.obligationState === "VOID" || order?.obligationState === "AUTHENTICATION_REQUIRED"
          ? ["A settled obligation. A void obligation or unfinished authentication is not settlement."]
          : track === "GUIDED"
            ? ["An upfront obligation that is PAID, on an ACCEPTED_PAID order, with a receipt. A second charge is not created from this step."]
            : ["Provider-confirmed settlement of a qualifying success fee. An approval or an invoice link is not that settlement."]

  const who = position === "disagree" || position === "incomplete"
    ? "ProfileRelaunch reconciles the outcome and billing records before treating this step as finished."
    : position === "none"
      ? "ProfileRelaunch records the outcome on this step. That record does not close the case or approve a success fee."
      : position === "settled" || position === "not_billable"
        ? "Nothing further is billed on this step. Closure stays on the next step."
        : position === "failed"
          ? "ProfileRelaunch follows the existing payment path. A failed collection is not settlement."
          : order?.obligationState === "VOID"
            ? "ProfileRelaunch reviews the void obligation. It is not a settled payment."
            : order?.obligationState === "AUTHENTICATION_REQUIRED"
              ? "The customer and the payment provider have an unfinished payment."
              : track === "GUIDED"
                ? "The customer still owes the agreed upfront fee. ProfileRelaunch does not raise a second charge from this step."
                : position === "approved"
                  ? "The provider has not confirmed payment. ProfileRelaunch does not treat an approval or an invoice link as settlement."
                  : "ProfileRelaunch approves the success fee only after the qualifying outcome and accepted evidence. Approval does not take payment."

  const notices: string[] = []
  if (facts.reopened && !closed && !facts.outcome) notices.push("This case was reopened. The earlier outcome was cleared and does not verify this step.")
  if (facts.reopened && !closed && facts.outcome && outcomeShape === "pre_closure") notices.push("This case was reopened. A later record stored this outcome and did not close the case.")
  if (facts.reopened && !closed && facts.outcome && outcomeShape !== "pre_closure") notices.push("This case was reopened and still has an outcome. That is not an authoritative pre-closure record.")
  if (outcomeShape === "pre_closure" && !conflict) notices.push("This outcome is already stored on an open case. A different outcome or summary is refused until the case is reopened. This step does not close the case.")
  if (position === "disagree") notices.push("The outcome and billing records do not agree, so no billing command is offered from here.")
  if (position === "incomplete") notices.push("The quote or payment list is incomplete, so no billing command is offered from here.")
  if (track === "GUIDED" && position !== "disagree" && position !== "incomplete") notices.push("No second charge is offered from this step.")
  if (position === "not_billable") notices.push("This outcome is not invoiced. An unsuccessful case is not billed in order to finish this step.")
  if (position === "none") notices.push("Recording the outcome does not close the case, approve a success fee, create an invoice, or take a payment.")
  if (order?.obligationState === "VOID" && position === "pending") notices.push("The obligation is void. It is not settlement.")
  if (order?.obligationState === "AUTHENTICATION_REQUIRED" && position === "pending") notices.push("Authentication is still required. That is not settlement.")

  return { position, proof, incomplete, conflict, qualifying, order, known, missing, who, notices }
}

function moneyAgrees(order: CaseFlowOrderFact, money: MoneyOrder, facts: CaseFlowFacts): boolean {
  return money.orderId === order.orderId
    && money.paymentModel === order.paymentModel
    && money.orderState === order.orderState
    && (money.obligationKind ?? null) === (order.obligationKind ?? null)
    && (money.obligationState ?? null) === (order.obligationState ?? null)
    && money.setupReady === order.setupReady
    && !!money.consentId === order.consentRecorded
    && !!money.receiptId === order.receiptRecorded
    && sameId(money.caseId, facts.caseId)
    && sameId(money.customerId, facts.customerId)
}

/**
 * Approval and a hosted invoice need the accepted quote, the track order, the
 * money row and the loaded order to name the same case and customer.
 */
function billingIdentity(input: {
  facts: CaseFlowFacts
  now: string
  caseMoney: MoneyOrder[]
  paired: MoneyOrder | null
  order: ServiceOrder | null
  orderDetailMissing: boolean
}): boolean {
  const link = activationOrderLink(input.facts, input.now)
  if (input.facts.serviceTrack !== "MANAGED" || !input.paired || !link.linked || !link.quoteId || !link.quoteOrderId) return false
  if (input.orderDetailMissing || !input.order) return false
  const matches = input.caseMoney.filter(row => row.orderId === link.quoteOrderId)
  if (matches.length !== 1) return false
  const money = matches[0]
  const orderAgrees = input.order.id === link.quoteOrderId
    && input.order.quoteId === link.quoteId
    && input.order.paymentModel === "SUCCESS_FEE"
    && input.order.state === money.orderState
    && sameId(input.order.caseId, input.facts.caseId)
  const moneyMatches = money.orderId === link.quoteOrderId
    && money.paymentModel === "SUCCESS_FEE"
    && sameId(money.caseId, input.facts.caseId)
    && sameId(money.customerId, input.facts.customerId)
  return orderAgrees && moneyMatches
}

function attemptState(result: string | null): string {
  if (result === null) return "Submitted, awaiting Google's decision"
  if (result === "DECIDED") return "Decision recorded"
  if (result === "WITHDRAWN") return "Withdrawn"
  return "Result not recognised"
}

function partyLabel(actor: string): string {
  if (actor === "CUSTOMER") return "the customer"
  if (actor === "ADMIN") return "ProfileRelaunch"
  return "an unrecognised party"
}

/** An open case with no stored outcome can record one. Billing stays separate. */
function canRecordOutcome(facts: CaseFlowFacts, position: OutcomeBillingPosition): boolean {
  if (position === "disagree" || position === "incomplete") return false
  if (facts.outcome) return false
  if (facts.caseStatus === "CLOSED" || facts.caseStatus === "CANCELLED") return false
  if (facts.technicalStage === "FINISHED") return false
  if (facts.caseType !== "PROFILE_RECOVERY" && facts.caseType !== "REVIEW_PROTECTION") return false
  return readStoredOutcome({
    caseType: facts.caseType,
    stage: facts.technicalStage,
    status: facts.caseStatus,
    outcome: facts.outcome,
    summary: facts.outcomeSummary,
    reopened: facts.reopened,
  }) === "absent"
}

export function judgeOutcomeBilling(facts: CaseFlowFacts, now: string, events?: readonly OutcomeProofEvent[] | null): OutcomeBillingJudgement {
  const projected = projectOutcome(facts, now, events)
  return {
    proof: projected.proof,
    headline: headlines[projected.position],
    known: projected.known,
    missing: projected.missing,
    who: projected.who,
  }
}

export function presentJourneyOutcome(input: {
  facts: CaseFlowFacts
  now: string
  recorded: RecordedOutcome
  order?: ServiceOrder | null
  orderDetailMissing?: boolean
  /** Case-detail work events. Required to accept an outcome after reopen. */
  events?: readonly OutcomeProofEvent[] | null
}): { disagreed: boolean; panel: JourneyOutcomePanel } {
  const projected = projectOutcome(input.facts, input.now, input.events)
  const recorded = input.recorded
  const caseMoney = recorded.moneyOrders?.filter(row => row.caseId === input.facts.caseId) ?? []
  const projectedIds = input.facts.payment.orders.map(row => row.orderId)
  const sameOrders = !!recorded.moneyOrders
    && !duplicateIds(caseMoney.map(row => row.orderId))
    && caseMoney.length === projectedIds.length
    && projectedIds.every(id => caseMoney.some(row => row.orderId === id))
  const paired = projected.order ? caseMoney.find(row => row.orderId === projected.order?.orderId) ?? null : null
  const fieldsAgree = !projected.order || (!!paired && moneyAgrees(projected.order, paired, input.facts))
  const listedEvidence = paired?.acceptedEvidence ?? []
  const evidenceAgrees = !paired || listedEvidence.every(item => qualifyingEvidence(input.facts, item.id))
  const recordAgrees = recorded.submissions !== null
    && recorded.moneyOrders !== null
    && recorded.caseTrack === input.facts.serviceTrack
    && (recorded.caseOutcome ?? null) === (input.facts.outcome ?? null)
    && recorded.caseStatus === input.facts.caseStatus
    && !submissionRecordsDisagree(input.facts, recorded.submissions, recorded.caseTrack)
    && sameOrders
    && fieldsAgree
    && evidenceAgrees
  const recordIncomplete = recorded.submissions === null || recorded.moneyOrders === null
  const recordConflict = !recordIncomplete && !recordAgrees

  let position = projected.position
  if (recordConflict || projected.conflict) position = "disagree"
  else if (recordIncomplete || projected.incomplete) position = "incomplete"
  else if (position === "approved" && (paired?.invoiceStatus === "ISSUED" || paired?.invoiceStatus === "PAID")) position = paired?.invoiceStatus === "PAID" && !paired.receiptId ? "disagree" : "invoiced"
  else if (position === "pending" && paired?.invoiceStatus === "ISSUED") position = "invoiced"
  else if (paired?.invoiceStatus === "PAID" && position !== "settled") position = "disagree"

  const blocked = position === "disagree" || position === "incomplete"
  const canBill = !blocked && input.facts.serviceTrack === "MANAGED" && projected.qualifying && !!paired
  const evidenceReady = listedEvidence.length > 0 && listedEvidence.every(item => qualifyingEvidence(input.facts, item.id))
  const identityOk = billingIdentity({
    facts: input.facts,
    now: input.now,
    caseMoney,
    paired,
    order: input.order ?? null,
    orderDetailMissing: input.orderDetailMissing === true,
  })
  const approveRequested = !!canBill
    && position === "pending"
    && !paired?.approvalId
    && !paired?.obligationId
    && paired?.setupReady === true
    && !!paired?.consentId
    && evidenceReady
  const invoiceRequested = !!canBill
    && !!paired?.approvalId
    && !!paired?.obligationId
    && !!paired.obligationState
    && !["PAID", "VOID"].includes(paired.obligationState)
    && paired.invoiceStatus !== "ISSUED"
    && paired.invoiceStatus !== "PAID"
    && !paired.receiptId
    && input.facts.capabilities.paymentsEnabled
  const identityBlocks = (approveRequested || invoiceRequested) && !identityOk
  if (identityBlocks && (position === "pending" || position === "approved")) position = "disagree"
  const approve = approveRequested && identityOk && position === "pending"
  const invoice = invoiceRequested && identityOk && position !== "disagree" && position !== "incomplete"
  const record = canRecordOutcome(input.facts, position)
  const notices = [...projected.notices]
  if (recordConflict) notices.push("The loaded case, submission or money records do not match this projection, so no billing command is offered from here.")
  if (recordIncomplete) notices.push("The submission or money records could not be loaded, so no billing command is offered from here.")
  if (identityBlocks && (position === "disagree" || position === "failed")) {
    notices.push("The accepted quote, the service order and the money record do not name the same case and customer, so no billing command is offered from here.")
  }
  if (canBill && !!paired?.approvalId && !paired.receiptId && !input.facts.capabilities.paymentsEnabled && paired.obligationState !== "PAID") {
    notices.push("A TEST-MODE hosted invoice is not offered because payment collection is not enabled. This step does not create one.")
  }
  if (paired?.invoiceStatus === "DRAFT" && position !== "disagree") notices.push("A draft invoice is not an issued invoice and it is not payment.")
  if (position === "invoiced") notices.push("An issued invoice is not payment. Returning from the invoice page does not settle it.")
  if (position === "settled") notices.push("Settlement is the provider receipt. An approval, an invoice link, a saved card and a checkout return are not that receipt.")
  const offeredEvidence = evidenceReady ? listedEvidence : []
  const commandOrder = paired && (approve || invoice)
    ? { orderId: paired.orderId, version: paired.version, obligationId: paired.obligationId, evidence: offeredEvidence }
    : null

  const attempts = (recorded.submissions ?? []).map(row => ({
    id: row.id,
    reference: row.reference,
    state: attemptState(row.result),
    party: partyLabel(row.actor),
    submittedAt: row.submittedAt,
    evidence: row.evidence,
    resultNote: row.resultNote,
  }))
  const decisionMet = attempts.length > 0 && attempts.every(row => row.state === "Decision recorded" || row.state === "Withdrawn")
  const billingLabel = paired
    ? `${obligationLabel(paired.obligationState)}${paired.receiptId ? ", receipt recorded" : ""}${paired.invoiceStatus ? `, invoice ${paired.invoiceStatus}` : ""}. ${formatGbp(paired.amountMinor)} ${paired.currency}.`
    : projected.order
      ? `${obligationLabel(projected.order.obligationState)}${projected.order.receiptRecorded ? ", receipt recorded" : ""}.`
      : "No service order is linked."

  return {
    disagreed: position === "disagree" || position === "incomplete",
    panel: {
      headline: headlines[position],
      detail: "Agreement PS-2026-10-14.2 invoices a Managed success fee only after documented success. It does not charge a card automatically and it does not collect that fee in advance. This step does not close the case.",
      outcomeLabel: outcomeLabel(input.facts.outcome),
      trackLabel: trackLabel(input.facts.serviceTrack),
      billingLabel,
      attempts,
      evidence: listedEvidence.map(item => `${item.filename} · v${item.versionNumber}`),
      requirements: [
        {
          label: "Google decision or withdrawal",
          state: decisionMet ? "Met" : "Not met",
          detail: decisionMet
            ? "Every recorded attempt has a decision or a withdrawal."
            : "A Google decision or withdrawal is shown from the submission record. An open attempt is not a verified outcome.",
        },
        {
          label: "Case outcome",
          state: input.facts.outcome && position !== "disagree" && position !== "incomplete" ? "Met" : "Not met",
          detail: "The stored outcome is the one written with the case. This step does not invent one and does not close the case to create one.",
        },
        {
          label: "Billing position",
          state: position === "settled" || position === "not_billable" ? "Met" : "Not met",
          detail: input.facts.serviceTrack === "GUIDED"
            ? "Guided billing is an ACCEPTED_PAID order, a PAID upfront obligation, and a receipt. A second charge is not created."
            : "Managed billing is provider-confirmed settlement after a qualifying outcome, or no fee when the outcome does not qualify.",
        },
      ],
      notices,
      who: position === "disagree" || position === "incomplete"
        ? "ProfileRelaunch reconciles the outcome and billing records before treating this step as finished."
        : position === "invoiced"
          ? "The provider has not confirmed payment. ProfileRelaunch does not treat an invoice link as settlement."
          : projected.who,
      commands: commandOrder || record ? { approve, invoice, record } : null,
      order: commandOrder,
    },
  }
}
