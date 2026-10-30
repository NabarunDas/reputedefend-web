/**
 * Guided Step 7 reads the existing payment and authorisation records.
 *
 * Guided activation is an accepted order whose upfront obligation is PAID
 * and has a receipt. Managed activation is the accepted success-fee order
 * plus the existing authorisation rule. A saved card, a checkout return, an
 * accepted quote and the selected track do not finish the step. This module
 * does not mark a payment settled and does not grant Google access.
 */

import type { CaseAuthorization } from "../authorization/model"
import type { CaseFlowFacts, CaseFlowOrderFact, CaseServiceTrack } from "../case-flow/model"
import { commercialQuotesTied, resolveCaseFlow, summariseCommercial, summarisePayment } from "../case-flow/resolve"
import { formatGbp, paymentModelLabel, serviceLabel, type ServiceOrder } from "../commerce/model"
import { ukDate } from "../admin/activity"
import type { MoneyOrder } from "../payments/model"

export type ActivationOrderLink = {
  linked: boolean
  quoteId: string | null
  quoteOrderId: string | null
  trackOrder: CaseFlowOrderFact | null
  reason: "linked" | "not_accepted" | "missing_order" | "mismatch" | "ambiguous_orders"
}

function nonempty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The accepted quote and the track order are one activation only when the
 * quote names exactly one order and that id is the only Guided upfront or
 * Managed success-fee order. A missing id is not a match.
 */
export function activationOrderLink(facts: CaseFlowFacts, now: string): ActivationOrderLink {
  const commercial = summariseCommercial(facts, now)
  const quoteOrderId = nonempty(commercial.quote?.orderId)
  const model = facts.serviceTrack === "GUIDED" ? "UPFRONT" : facts.serviceTrack === "MANAGED" ? "SUCCESS_FEE" : null
  const trackOrders = model ? facts.payment.orders.filter(order => order.paymentModel === model) : []
  const accepted = facts.commercial.complete
    && !commercialQuotesTied(facts)
    && commercial.state === "ACCEPTED"
    && !!commercial.quote
    && !!model
  if (!accepted || !commercial.quote) {
    return { linked: false, quoteId: commercial.quote?.id ?? null, quoteOrderId, trackOrder: trackOrders[0] ?? null, reason: "not_accepted" }
  }
  if (trackOrders.length > 1) {
    return { linked: false, quoteId: commercial.quote.id, quoteOrderId, trackOrder: null, reason: "ambiguous_orders" }
  }
  const trackOrder = trackOrders[0] ?? null
  if (!quoteOrderId || !trackOrder) {
    return { linked: false, quoteId: commercial.quote.id, quoteOrderId, trackOrder, reason: "missing_order" }
  }
  if (quoteOrderId !== trackOrder.orderId) {
    return { linked: false, quoteId: commercial.quote.id, quoteOrderId, trackOrder, reason: "mismatch" }
  }
  return { linked: true, quoteId: commercial.quote.id, quoteOrderId, trackOrder, reason: "linked" }
}

export type AcceptedServiceProjection = {
  orderId: string
  model: "UPFRONT" | "SUCCESS_FEE"
  aligned: boolean
}

const laterGuidedStages = ["PAYMENT_REQUIRED", "PREPARATION", "READY_TO_SUBMIT", "SUBMITTED", "WAITING_GOOGLE", "OWNER_ACTION", "FURTHER_REVIEW", "OUTCOME_REVIEW", "FINISHED"]
const laterManagedStages = ["AUTHORIZATION_REQUIRED", "PREPARATION", "READY_TO_SUBMIT", "SUBMITTED", "WAITING_GOOGLE", "OWNER_ACTION", "FURTHER_REVIEW", "OUTCOME_REVIEW", "FINISHED"]

/** Whole pounds stay as £99. Any pence uses the existing money format. */
export function acceptedOrderAmountLabel(amountMinor: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor < 0 || amountMinor % 100 !== 0) return formatGbp(amountMinor)
  return `£${amountMinor / 100}`
}

export function trackForServiceCode(code: string): "GUIDED" | "MANAGED" | null {
  if (code === "GUIDED_RELAUNCH" || code === "GUIDED_REVIEW") return "GUIDED"
  if (code === "MANAGED_RELAUNCH" || code === "MANAGED_REVIEW") return "MANAGED"
  return null
}

/**
 * One accepted order can be waiting on a case whose stored track is still
 * undecided. The price is not the service. Alignment is the stored track and
 * a stage that already reached payment or authorisation.
 */
export function acceptedServiceProjection(facts: CaseFlowFacts, now: string): AcceptedServiceProjection | null {
  if (!facts.commercial.complete || !facts.payment.complete || commercialQuotesTied(facts)) return null
  const commercial = summariseCommercial(facts, now)
  if (commercial.state !== "ACCEPTED" || !commercial.quote) return null
  const orderId = nonempty(commercial.quote.orderId)
  if (!orderId || facts.payment.orders.length !== 1) return null
  const order = facts.payment.orders[0]
  if (order.orderId !== orderId) return null
  const upfront = order.paymentModel === "UPFRONT"
    && order.orderState === "ACCEPTED_AWAITING_PAYMENT"
    && order.obligationKind === "UPFRONT"
    && (order.obligationState === "DUE" || order.obligationState === "COLLECTING")
    && !order.receiptRecorded
  const managed = order.paymentModel === "SUCCESS_FEE"
    && order.orderState === "ACCEPTED_SUCCESS_FEE"
    && order.obligationState !== "PAID"
    && order.obligationState !== "FAILED"
    && !order.receiptRecorded
  if (!upfront && !managed) return null
  const model = upfront ? "UPFRONT" as const : "SUCCESS_FEE" as const
  const track = model === "UPFRONT" ? "GUIDED" : "MANAGED"
  const aligned = facts.serviceTrack === track && (model === "UPFRONT" ? laterGuidedStages : laterManagedStages).includes(facts.technicalStage)
  return { orderId, model, aligned }
}

export function acceptedOrderOutstandingLabel(input: { serviceCode: string; amountMinor: number; paymentModel: string }): string | null {
  const track = trackForServiceCode(input.serviceCode)
  if (track === "GUIDED" && input.paymentModel === "UPFRONT") {
    return `${serviceLabel(input.serviceCode)} — accepted; ${acceptedOrderAmountLabel(input.amountMinor)} payment outstanding`
  }
  if (track === "MANAGED" && input.paymentModel === "SUCCESS_FEE") {
    return `${serviceLabel(input.serviceCode)} — accepted; no upfront payment`
  }
  return null
}

export function activationLinkProblem(link: ActivationOrderLink, track: CaseServiceTrack): string | null {
  if (link.linked || link.reason === "not_accepted") return null
  if (link.reason === "ambiguous_orders") {
    const kind = track === "MANAGED" ? "success-fee" : "upfront"
    return `More than one ${kind} order is on file, so the accepted quote is not matched to a single order. These records disagree.`
  }
  if (link.reason === "missing_order") {
    return "The accepted quote has no order, or the service order for this track is missing. These records disagree."
  }
  return "The accepted quote and the service order do not refer to the same order. These records disagree."
}

export const ACTIVATION_ORDER_DISAGREE_WHO =
  "ProfileRelaunch reconciles the quote and the service order before activation. A payment on a different order is not activation."

function sameId(value: string | null | undefined, expected: string | null | undefined): boolean {
  return !!nonempty(value) && nonempty(value) === nonempty(expected)
}

/**
 * A payment link needs the quote, the loaded order and the money row to name
 * the same Guided order, case and customer. A missing field is not agreement.
 * Returns a notice when the link must be withheld, or null when it may be issued.
 */
function paymentLinkProblem(
  facts: CaseFlowFacts,
  link: ActivationOrderLink,
  moneyOrder: MoneyOrder | null,
  loadedOrder: ServiceOrder | null,
  orderDetailMissing: boolean,
): string | null {
  if (!link.linked || !link.quoteOrderId || !link.quoteId) return null
  if (orderDetailMissing || !loadedOrder) {
    return "The service order detail is missing, so it is not proof that this payment belongs to the accepted quote. No payment link is issued from here."
  }
  const orderAgrees = loadedOrder.id === link.quoteOrderId
    && loadedOrder.quoteId === link.quoteId
    && loadedOrder.paymentModel === "UPFRONT"
    && sameId(loadedOrder.caseId, facts.caseId)
  if (!orderAgrees) {
    return "The service order detail does not match the accepted quote, this case, or the Guided payment model. These records disagree, so no payment link is issued from here."
  }
  const moneyAgrees = !!moneyOrder
    && moneyOrder.orderId === link.quoteOrderId
    && moneyOrder.paymentModel === "UPFRONT"
    && sameId(moneyOrder.caseId, facts.caseId)
    && sameId(moneyOrder.customerId, facts.customerId)
  if (!moneyAgrees) {
    return "The money record does not match the accepted quote's order, this case, or this customer. These records disagree, so no payment link is issued from here."
  }
  return null
}

export type JourneyActivationOrder = {
  orderId: string
  reference: string
  amountLabel: string | null
  paymentModel: string
  orderState: string
  obligationState: string | null
}

export type JourneyActivationRequirement = {
  label: string
  state: "Met" | "Not met" | "Not required"
  detail: string
}

export type JourneyActivationContinue = {
  label: string
  headline: string
}

export type JourneyActivationPanel = {
  track: CaseServiceTrack
  headline: string
  detail: string
  trackNote: string
  order: JourneyActivationOrder | null
  requirements: JourneyActivationRequirement[]
  notices: string[]
  who: string
  issueUpfront: { serviceOrderId: string; version: number } | null
  /**
   * Reuses one open Guided payment action to queue the missing payment-request email.
   * It is not the recommendation to issue a new payment action.
   */
  paymentRequest: { serviceOrderId: string; version: number } | null
  /** The payment email status is relevant, even when the send button is withheld. */
  paymentRequestStatus: boolean
  /** Confirms the accepted order. It does not issue a payment link. */
  continueToPayment: JourneyActivationContinue | null
  /** The accepted order, shown separately from the stored track until Continue succeeds. */
  projectedOrderLabel: string | null
  authorization: CaseAuthorization | null
}

function requirement(label: string, met: boolean, detail: string): JourneyActivationRequirement {
  return { label, state: met ? "Met" : "Not met", detail }
}

export function buildJourneyActivationPanel(input: {
  facts: CaseFlowFacts
  now: string
  order: ServiceOrder | null
  orderDetailMissing: boolean
  moneyOrders: MoneyOrder[]
  authorization: CaseAuthorization | null
  recordsConflict: boolean
  /** Outgoing mail is enabled, a sender is configured, and a monitored Reply-To is confirmed. */
  mailReady?: boolean
}): JourneyActivationPanel {
  const facts = input.facts
  const payment = summarisePayment(facts)
  const commercial = summariseCommercial(facts, input.now)
  const flow = resolveCaseFlow(facts, input.now)
  const link = activationOrderLink(facts, input.now)
  const notices: string[] = []
  const orderId = link.quoteOrderId
  const moneyMatches = orderId ? input.moneyOrders.filter(row => row.orderId === orderId) : []
  const moneyOrder = moneyMatches.length === 1 ? moneyMatches[0] : null
  const loadedOrder = input.order && orderId && input.order.id === orderId ? input.order : null
  const flowOrder = payment.upfrontOrder ?? payment.successFeeOrder
  const listsComplete = facts.commercial.complete && facts.payment.complete
  const tied = commercialQuotesTied(facts)

  if (!facts.commercial.complete || !facts.payment.complete) {
    notices.push("The quote or payment list may be incomplete, so no activation action is offered from this step.")
  }
  if (tied) notices.push("More than one quote shares the same relevance, so none supplies the order for activation.")
  if (input.orderDetailMissing || (orderId && input.order && input.order.id !== orderId)) {
    notices.push("The service order named for this case could not be loaded, so a payment link is not issued from here.")
  }
  if (moneyMatches.length > 1) notices.push("More than one money record matches this order, so no payment link is issued from here.")
  const moneyDisagrees = !!moneyOrder && !!flowOrder && (moneyOrder.orderState !== flowOrder.orderState || (moneyOrder.obligationState ?? null) !== (flowOrder.obligationState ?? null))
  if (moneyDisagrees) notices.push("The money record and the case projection do not show the same order state, so no payment link is issued from here.")
  const linkProblem = listsComplete && !tied && commercial.state === "ACCEPTED"
    ? activationLinkProblem(link, facts.serviceTrack)
    : null
  if (linkProblem) notices.push(linkProblem)
  if (input.recordsConflict) notices.push("The customer, business or authority records disagree, so this step does not start a payment or treat authorisation as activation.")
  if (facts.serviceTrack === "GUIDED" && !facts.capabilities.paymentsEnabled && payment.upfrontState !== "PAID") {
    notices.push("Payment collection is switched off in this deployment. This step does not start a customer payment.")
  }
  if (facts.serviceTrack === "MANAGED") {
    notices.push("A saved card is not required. This step does not issue a payment-method setup link and does not collect a success fee.")
  }
  const expired = facts.customerActions.filter(action => action.status === "OPEN" && action.expiresAt <= input.now)
  if (expired.length > 0) {
    notices.push("An open authorisation or payment link has expired. An expired link is not activation, and the secret cannot be shown again.")
  }

  const order: JourneyActivationOrder | null = orderId ? {
    orderId,
    reference: loadedOrder?.publicRef || moneyOrder?.orderRef || orderId,
    amountLabel: loadedOrder ? `${formatGbp(loadedOrder.amountMinor)} ${loadedOrder.currency}` : moneyOrder ? `${formatGbp(moneyOrder.amountMinor)} ${moneyOrder.currency}` : null,
    paymentModel: paymentModelLabel(loadedOrder?.paymentModel || moneyOrder?.paymentModel || (link.linked ? flowOrder?.paymentModel : "") || ""),
    orderState: (link.linked ? flowOrder?.orderState : null) || loadedOrder?.state || moneyOrder?.orderState || "Unknown",
    obligationState: (link.linked ? flowOrder?.obligationState : null) ?? moneyOrder?.obligationState ?? null,
  } : null

  const acceptedQuote = link.linked
  const guidedOrder = link.trackOrder
  const guidedSettled = acceptedQuote
    && guidedOrder?.paymentModel === "UPFRONT"
    && guidedOrder.orderState === "ACCEPTED_AWAITING_PAYMENT"
    && guidedOrder.obligationKind === "UPFRONT"
    && payment.upfrontPaid
    && guidedOrder.receiptRecorded
    && !input.recordsConflict
  const managedReady = facts.serviceTrack === "MANAGED"
    && acceptedQuote
    && link.trackOrder?.orderState === "ACCEPTED_SUCCESS_FEE"
    && facts.authorization.authorizationReady
    && facts.authorization.businessAuthorityVerified
    && facts.authorization.serviceAgreementAccepted
    && facts.authorization.caseManagementPermissionActive
    && facts.authorization.managerAccessVerified
    && facts.authorization.reviewRequired.length === 0
    && facts.authorization.membershipStatus !== "revoked"
    && !input.recordsConflict

  const requirements = facts.serviceTrack === "MANAGED"
    ? [
      requirement("Accepted success-fee order", link.linked && link.trackOrder?.orderState === "ACCEPTED_SUCCESS_FEE", "The order named by the accepted quote. A different order on the case is not this acceptance."),
      requirement("Service agreement", facts.authorization.serviceAgreementAccepted, "The customer accepts the existing agreement. This step does not change its wording."),
      requirement("Business authority", facts.authorization.businessAuthorityVerified, "Verified membership of the business. Email control is not authority."),
      requirement("Case-management permission", facts.authorization.caseManagementPermissionActive, "An active permission. A revoked permission is not still valid."),
      requirement("Google manager access", facts.authorization.managerAccessVerified, "Recorded through the existing manager-access command. Choosing Managed does not grant it."),
      requirement("Database authorisation readiness", facts.authorization.authorizationReady, "The existing authorisation rule, not a checkbox on this page."),
      { label: "Saved card", state: "Not required" as const, detail: "A saved payment method is not activation and is not collected here." },
    ]
    : facts.serviceTrack === "GUIDED"
      ? [
        requirement("Accepted quote", acceptedQuote, linkProblem ? "The accepted quote does not name the service order for this track." : "One accepted quote on a complete list. The quote alone is not activation."),
        requirement("Accepted upfront order", link.linked && link.trackOrder?.orderState === "ACCEPTED_AWAITING_PAYMENT" && link.trackOrder.paymentModel === "UPFRONT", "The service order named by the accepted quote stays ACCEPTED_AWAITING_PAYMENT. Settlement is the paid obligation and the receipt."),
        requirement("Upfront obligation PAID", link.linked && payment.upfrontPaid, "Returning from Checkout is not payment."),
        requirement("Receipt recorded", link.linked && !!link.trackOrder?.receiptRecorded && payment.upfrontPaid, "A paid mark without a receipt is not settlement."),
      ]
      : []

  const openGuidedPayments = facts.customerActions.filter(action =>
    action.kind === "GUIDED_PAYMENT" && action.status === "OPEN" && action.expiresAt > input.now)
  const expiredGuidedPayments = facts.customerActions.filter(action =>
    action.kind === "GUIDED_PAYMENT" && action.status === "OPEN" && action.expiresAt <= input.now)
  const canIssue = flow.primaryAction?.id === "START_UPFRONT_PAYMENT" && flow.primaryAction.state === "ACTION_REQUIRED"
  const missingPaymentAction = openGuidedPayments.length === 0 && expiredGuidedPayments.length === 0 && facts.capabilities.paymentsEnabled
  const identityCandidate = facts.serviceTrack === "GUIDED" && listsComplete && !tied && !linkProblem && !input.recordsConflict && !moneyDisagrees
    && (canIssue || openGuidedPayments.length > 0 || expiredGuidedPayments.length > 0 || missingPaymentAction)
  const identityProblem = identityCandidate
    ? paymentLinkProblem(facts, link, moneyOrder, loadedOrder, input.orderDetailMissing)
    : null
  if (identityProblem) notices.push(identityProblem)
  const issueUpfront = canIssue && facts.serviceTrack === "GUIDED" && listsComplete && !tied && !linkProblem && !input.recordsConflict && !input.orderDetailMissing && !moneyDisagrees && !identityProblem && moneyOrder && link.quoteOrderId
    ? { serviceOrderId: link.quoteOrderId, version: moneyOrder.version }
    : null
  const obligationDue = !!moneyOrder
    && moneyOrder.obligationKind === "UPFRONT"
    && moneyOrder.obligationState === "DUE"
    && !moneyOrder.receiptId
    && link.trackOrder?.paymentModel === "UPFRONT"
    && link.trackOrder.orderState === "ACCEPTED_AWAITING_PAYMENT"
    && !payment.upfrontPaid
  const trustReady = facts.authorization.customerEmailVerified && facts.authorization.businessAuthorityVerified
  const paymentRequestBase = facts.serviceTrack === "GUIDED"
    && listsComplete && !tied && !linkProblem && !input.recordsConflict && !input.orderDetailMissing && !moneyDisagrees
    && !identityProblem && obligationDue && trustReady && !!link.quoteOrderId && !!moneyOrder
    && expiredGuidedPayments.length === 0 && openGuidedPayments.length <= 1
    && (openGuidedPayments.length === 1 || missingPaymentAction)
  if (paymentRequestBase && !input.mailReady) {
    notices.push("Outgoing mail or the monitored Reply-To is not confirmed, so the payment-request email is not queued from here.")
  }
  if (obligationDue && !identityProblem && expiredGuidedPayments.length > 0 && openGuidedPayments.length === 0) {
    notices.push("The open payment action has expired, so this step does not send the payment-request email or create a replacement link.")
  }
  if (openGuidedPayments.length > 1 && obligationDue) {
    notices.push("More than one payment action is open, so no payment-request email is queued from here.")
  }
  const paymentRequest = paymentRequestBase && input.mailReady && link.quoteOrderId && moneyOrder
    ? { serviceOrderId: link.quoteOrderId, version: moneyOrder.version }
    : null

  const headline = facts.serviceTrack === "UNDECIDED"
    ? "Service track not chosen"
    : !listsComplete || tied
      ? "Activation records incomplete"
      : linkProblem || moneyDisagrees
        ? linkProblem ? "Activation records disagree" : "Activation records incomplete"
      : facts.serviceTrack === "GUIDED"
        ? guidedSettled
          ? "Guided payment settled"
          : payment.upfrontFailed || payment.upfrontAuthenticationRequired
            ? "Guided payment needs attention"
            : payment.upfrontState === "VOID"
              ? "Guided obligation void"
              : payment.upfrontCollecting || payment.upfrontState === "DUE"
                ? "Guided payment outstanding"
                : "Guided activation not recorded"
        : managedReady
          ? "Managed authorisation recorded"
          : facts.authorization.reviewRequired.length > 0 || facts.authorization.membershipStatus === "revoked"
            ? "Managed authorisation needs attention"
            : "Managed activation not recorded"

  const detail = facts.serviceTrack === "GUIDED"
    ? "Guided activation is the settled upfront payment. It is not the selected track, the accepted quote, or a return from Checkout."
    : facts.serviceTrack === "MANAGED"
      ? "Managed activation is the accepted success-fee order together with the agreement, authority, permission, Google manager access and the database authorisation rule. Nothing is collected now."
      : "Neither the Guided payment nor the Managed authorisation applies until a service track is chosen."

  const trackNote = facts.serviceTrack === "GUIDED"
    ? `The selected service track is Guided.${loadedOrder?.acceptedAt ? ` The order was accepted ${ukDate(loadedOrder.acceptedAt)}.` : ""} The selected track alone is not activation.`
    : facts.serviceTrack === "MANAGED"
      ? "The selected service track is Managed. Choosing Managed does not grant Google access, and a saved card is not the customer's agreement to start work."
      : "No service track is chosen. A recommended pathway does not select it."

  const who = linkProblem
    ? ACTIVATION_ORDER_DISAGREE_WHO
    : facts.serviceTrack === "GUIDED"
    ? guidedSettled
      ? "The upfront payment is settled."
      : "The customer pays the upfront fee. ProfileRelaunch does not mark the obligation paid from this step."
    : facts.serviceTrack === "MANAGED"
      ? managedReady
        ? "Managed activation is recorded from authority and Google access, not from a saved card."
        : "ProfileRelaunch verifies authority and Google access. The customer accepts the agreement and the case permission."
      : "ProfileRelaunch and the customer still have to choose the service."

  const projection = acceptedServiceProjection(facts, input.now)
  const projectedTrack = projection?.model === "UPFRONT" ? "GUIDED" : projection?.model === "SUCCESS_FEE" ? "MANAGED" : null
  const codeTrack = loadedOrder ? trackForServiceCode(loadedOrder.serviceCode) : null
  const projectedLabel = loadedOrder ? acceptedOrderOutstandingLabel(loadedOrder) : null
  const moneyAgreesWithOrder = !!projection && !!moneyOrder && !!loadedOrder
    && moneyOrder.orderId === projection.orderId
    && moneyOrder.paymentModel === projection.model
    && moneyOrder.serviceCode === loadedOrder.serviceCode
    && moneyOrder.amountMinor === loadedOrder.amountMinor
    && moneyOrder.currency === "GBP"
    && loadedOrder.currency === "GBP"
    && sameId(moneyOrder.caseId, facts.caseId)
    && sameId(moneyOrder.customerId, facts.customerId)
    && sameId(loadedOrder.caseId, facts.caseId)
  const trackConflict = (facts.serviceTrack === "GUIDED" || facts.serviceTrack === "MANAGED") && !!codeTrack && codeTrack !== facts.serviceTrack
  const continueToPayment = projection && !projection.aligned && projectedLabel && codeTrack === projectedTrack && moneyAgreesWithOrder
    && !trackConflict && !input.recordsConflict && listsComplete && !tied && !linkProblem && !moneyDisagrees && !issueUpfront
    ? {
      label: projection.model === "UPFRONT" ? "Continue to Guided Payment" : "Continue to Managed authorisation",
      headline: projectedLabel,
    }
    : null
  if (trackConflict) {
    notices.push("The stored service track does not match the accepted order. This step does not overwrite it and does not start a payment.")
  }
  const shownRequirements = continueToPayment
    ? projection?.model === "UPFRONT"
      ? [
        requirement("Accepted order", true, `${loadedOrder ? serviceLabel(loadedOrder.serviceCode) : "The service"} is already accepted. Continue does not ask for that choice again.`),
        requirement("Stored service track", facts.serviceTrack === "GUIDED", "The case record changes only when Continue succeeds."),
        requirement("Upfront obligation PAID", false, "Stripe settlement and a receipt mark the payment complete. This step does not."),
      ]
      : [
        requirement("Accepted success-fee order", true, "The customer has already accepted Managed. Continue does not ask for that choice again."),
        requirement("Stored service track", facts.serviceTrack === "MANAGED", "The case record changes only when Continue succeeds."),
        requirement("Upfront payment", false, "Managed has no upfront fee. Continue does not collect one."),
      ]
    : requirements

  return {
    track: facts.serviceTrack,
    headline: continueToPayment?.headline ?? headline,
    detail: continueToPayment
      ? projection?.model === "UPFRONT"
        ? "The accepted order is not yet the stored service track. Continue records it and opens the existing secure payment action. It does not send email, open Stripe, or mark the obligation paid."
        : "The accepted order is not yet the stored service track. Continue records Managed authorisation as the next stage. It does not collect an upfront fee."
      : detail,
    trackNote: continueToPayment
      ? `The stored service track is ${facts.serviceTrack === "UNDECIDED" ? "not chosen" : facts.serviceTrack === "GUIDED" ? "Guided" : "Managed"}. The accepted order is shown separately until Continue succeeds.`
      : trackNote,
    order,
    requirements: shownRequirements,
    notices,
    who: continueToPayment
      ? "ProfileRelaunch confirms the accepted order. The customer has already chosen the service."
      : who,
    issueUpfront,
    paymentRequest,
    paymentRequestStatus: paymentRequestBase,
    continueToPayment,
    projectedOrderLabel: continueToPayment?.headline ?? null,
    authorization: facts.serviceTrack === "MANAGED" ? input.authorization : null,
  }
}
