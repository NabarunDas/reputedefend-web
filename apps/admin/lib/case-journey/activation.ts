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
import type { CaseFlowFacts, CaseServiceTrack } from "../case-flow/model"
import { commercialQuotesTied, resolveCaseFlow, summariseCommercial, summarisePayment } from "../case-flow/resolve"
import { formatGbp, paymentModelLabel, type ServiceOrder } from "../commerce/model"
import { ukDate } from "../admin/activity"
import type { MoneyOrder } from "../payments/model"

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
}): JourneyActivationPanel {
  const facts = input.facts
  const payment = summarisePayment(facts)
  const commercial = summariseCommercial(facts, input.now)
  const flow = resolveCaseFlow(facts, input.now)
  const notices: string[] = []
  const orderId = commercial.quote?.orderId ?? payment.upfrontOrder?.orderId ?? payment.successFeeOrder?.orderId ?? null
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
    paymentModel: paymentModelLabel(loadedOrder?.paymentModel || moneyOrder?.paymentModel || flowOrder?.paymentModel || ""),
    orderState: flowOrder?.orderState || loadedOrder?.state || moneyOrder?.orderState || "Unknown",
    obligationState: flowOrder?.obligationState ?? moneyOrder?.obligationState ?? null,
  } : null

  const acceptedQuote = listsComplete && !tied && commercial.state === "ACCEPTED"
  const guidedSettled = acceptedQuote
    && !!payment.upfrontOrder
    && payment.upfrontOrder.orderState === "ACCEPTED_PAID"
    && payment.upfrontPaid
    && payment.upfrontOrder.receiptRecorded
    && !input.recordsConflict
  const managedReady = facts.serviceTrack === "MANAGED"
    && acceptedQuote
    && !!payment.successFeeOrder
    && payment.successFeeOrder.orderState === "ACCEPTED_SUCCESS_FEE"
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
      requirement("Accepted success-fee order", !!payment.successFeeOrder && payment.successFeeOrder.orderState === "ACCEPTED_SUCCESS_FEE", "The order exists only after the customer accepts the quote."),
      requirement("Service agreement", facts.authorization.serviceAgreementAccepted, "The customer accepts the existing agreement. This step does not change its wording."),
      requirement("Business authority", facts.authorization.businessAuthorityVerified, "Verified membership of the business. Email control is not authority."),
      requirement("Case-management permission", facts.authorization.caseManagementPermissionActive, "An active permission. A revoked permission is not still valid."),
      requirement("Google manager access", facts.authorization.managerAccessVerified, "Recorded through the existing manager-access command. Choosing Managed does not grant it."),
      requirement("Database authorisation readiness", facts.authorization.authorizationReady, "The existing authorisation rule, not a checkbox on this page."),
      { label: "Saved card", state: "Not required" as const, detail: "A saved payment method is not activation and is not collected here." },
    ]
    : facts.serviceTrack === "GUIDED"
      ? [
        requirement("Accepted quote", acceptedQuote, "One accepted quote on a complete list. The quote alone is not activation."),
        requirement("Accepted paid order", payment.upfrontOrder?.orderState === "ACCEPTED_PAID", "The service order state has to be the accepted paid order."),
        requirement("Upfront obligation PAID", payment.upfrontPaid, "Returning from Checkout is not payment."),
        requirement("Receipt recorded", !!payment.upfrontOrder?.receiptRecorded && payment.upfrontPaid, "A paid mark without a receipt is not settlement."),
      ]
      : []

  const canIssue = flow.primaryAction?.id === "START_UPFRONT_PAYMENT" && flow.primaryAction.state === "ACTION_REQUIRED"
  const issueUpfront = canIssue && facts.serviceTrack === "GUIDED" && listsComplete && !tied && !input.recordsConflict && !input.orderDetailMissing && !moneyDisagrees && moneyOrder
    ? { serviceOrderId: moneyOrder.orderId, version: moneyOrder.version }
    : null

  const headline = facts.serviceTrack === "UNDECIDED"
    ? "Service track not chosen"
    : !listsComplete || tied || moneyDisagrees
      ? "Activation records incomplete"
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

  const who = facts.serviceTrack === "GUIDED"
    ? guidedSettled
      ? "The upfront payment is settled."
      : "The customer pays the upfront fee. ProfileRelaunch does not mark the obligation paid from this step."
    : facts.serviceTrack === "MANAGED"
      ? managedReady
        ? "Managed activation is recorded from authority and Google access, not from a saved card."
        : "ProfileRelaunch verifies authority and Google access. The customer accepts the agreement and the case permission."
      : "ProfileRelaunch and the customer still have to choose the service."

  return {
    track: facts.serviceTrack,
    headline,
    detail,
    trackNote,
    order,
    requirements,
    notices,
    who,
    issueUpfront,
    authorization: facts.serviceTrack === "MANAGED" ? input.authorization : null,
  }
}
