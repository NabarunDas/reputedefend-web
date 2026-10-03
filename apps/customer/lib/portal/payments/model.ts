/**
 * Customer-facing payment wording. Amounts are formatted from stored minor
 * units. This module does not decide eligibility or change a payment.
 */
import { formatPortalDate, serviceLabel } from "@/lib/portal/cases/model"
import { formatMoney } from "../../../../../lib/money"
import type { ObligationState, PaymentAction, PaymentObligation, PaymentOrder, PaymentTax } from "./parse"

export function moneyLabel(minor: number, currency: string): string {
  return formatMoney(minor, currency)
}

export function taxNote(behaviour: PaymentTax): string {
  if (behaviour === "INCLUSIVE") return "Tax is included in this amount."
  if (behaviour === "EXCLUSIVE") return "Tax is shown separately."
  return "Tax does not apply."
}

export function obligationHeadline(kind: PaymentObligation["kind"], state: ObligationState): string {
  if (state === "DUE") return kind === "success_fee" ? "Success fee required" : "Payment required"
  if (state === "COLLECTING") return "Payment pending"
  if (state === "AUTHENTICATION_REQUIRED") return "Authentication required"
  if (state === "FAILED") return "Payment was not completed"
  if (state === "PAID") return "Paid"
  return "Void"
}

export function obligationDetail(state: ObligationState): string {
  if (state === "DUE") return "The amount shown is the amount recorded for this order."
  if (state === "COLLECTING") return "We're confirming this payment. It is not marked paid."
  if (state === "AUTHENTICATION_REQUIRED") return "Your bank needs you to confirm this payment. This is not paid yet."
  if (state === "FAILED") return "The last attempt did not complete. You can try again when secure checkout is available."
  if (state === "PAID") return "This payment has been recorded."
  return "This payment was voided."
}

export function checkoutControl(
  order: PaymentOrder,
  actions: PaymentAction[],
  obligation: PaymentObligation,
): { selector: string; label: string } | null {
  if (obligation.state === "PAID" || obligation.state === "VOID") return null
  const guided = actions.find(item => item.kind === "guided_payment" && item.orderRef === order.orderRef)
  const recovery = actions.find(item => item.kind === "recovery" && item.orderRef === order.orderRef)
  if (obligation.state === "AUTHENTICATION_REQUIRED") {
    return recovery ? { selector: recovery.selector, label: "Continue authentication" } : null
  }
  if (obligation.state === "FAILED") {
    if (recovery) return { selector: recovery.selector, label: "Try authentication again" }
    if (guided && obligation.kind === "upfront") return { selector: guided.selector, label: "Try secure checkout again" }
    return null
  }
  if ((obligation.state === "DUE" || obligation.state === "COLLECTING") && guided && obligation.kind === "upfront") {
    return {
      selector: guided.selector,
      label: obligation.state === "COLLECTING" ? "Continue secure checkout" : "Continue to secure checkout",
    }
  }
  return null
}

export function invoiceSentence(status: "ISSUED" | "PAID" | "VOID", hostedAvailable: boolean): string {
  if (status === "PAID") return "This invoice is paid."
  if (status === "VOID") return "This invoice is void."
  if (hostedAvailable) return "An invoice has been issued."
  return "The hosted invoice link is not available yet."
}

export function methodSentence(saved: boolean): string {
  return saved
    ? "A payment method is saved for this managed service."
    : "A payment method is not saved yet."
}

export function paidOn(iso: string): string {
  return `Paid ${formatPortalDate(iso)}`
}

export function trackLabel(track: Parameters<typeof serviceLabel>[0]): string | null {
  return serviceLabel(track)
}
