/**
 * Customer-facing payment wording. Amounts are formatted from stored minor
 * units. This module does not decide eligibility or change a payment.
 */
import { serviceLabel } from "@/lib/portal/cases/model"
import { formatMoney } from "../../../../../lib/money"
import { customerFacingTaxNote } from "../../../../../lib/pricing"
import type { ObligationState, PaymentAction, PaymentCase, PaymentObligation, PaymentOrder, PaymentTax } from "./parse"

export function moneyLabel(minor: number, currency: string): string {
  return formatMoney(minor, currency)
}

export function taxNote(behaviour: PaymentTax): string {
  return customerFacingTaxNote(behaviour)
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

function upfrontPayLabel(order: PaymentOrder): string {
  if (order.currency !== "GBP" || order.paymentModel !== "UPFRONT") return "Continue to secure checkout"
  if (!Number.isInteger(order.amountMinor) || order.amountMinor < 1 || order.amountMinor > 100_000_000) {
    return "Continue to secure checkout"
  }
  const pounds = Math.floor(order.amountMinor / 100)
  const pence = String(order.amountMinor % 100).padStart(2, "0")
  return `Pay £${pounds}.${pence} securely`
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
      label: obligation.state === "COLLECTING" ? "Continue secure checkout" : upfrontPayLabel(order),
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

export function trackLabel(track: Parameters<typeof serviceLabel>[0]): string | null {
  return serviceLabel(track)
}

const OPEN_STATES = new Set<ObligationState>(["DUE", "COLLECTING", "AUTHENTICATION_REQUIRED", "FAILED"])
const SEVERAL_ORDERS = "More than one service order is recorded. View Payments for this case for details."
const FINALISING = "Payment confirmation is being finalised. See Payments for this case."

function openUpfront(order: PaymentOrder): PaymentObligation | null {
  return order.obligations.find(obligation => obligation.kind === "upfront" && OPEN_STATES.has(obligation.state)) ?? null
}

function issuedSuccessFee(order: PaymentOrder): PaymentObligation | null {
  return order.obligations.find(obligation =>
    obligation.kind === "success_fee" &&
    obligation.invoice?.status === "ISSUED" &&
    OPEN_STATES.has(obligation.state),
  ) ?? null
}

function dueNow(order: PaymentOrder): PaymentObligation | null {
  return openUpfront(order) ?? issuedSuccessFee(order)
}

function sameMoney(
  left: { amountMinor: number; currency: string; taxBehaviour: PaymentOrder["taxBehaviour"]; taxAmountMinor: number },
  right: { amountMinor: number; currency: string; taxBehaviour: PaymentOrder["taxBehaviour"]; taxAmountMinor: number },
): boolean {
  return left.amountMinor === right.amountMinor
    && left.currency === right.currency
    && left.taxBehaviour === right.taxBehaviour
    && left.taxAmountMinor === right.taxAmountMinor
}

/** One PAID obligation and one receipt, agreeing with each other and the order. */
function consistentReceipt(order: PaymentOrder): PaymentOrder["receipts"][number] | null {
  if (order.receipts.length !== 1) return null
  const paid = order.obligations.filter(obligation => obligation.state === "PAID")
  if (paid.length !== 1 || order.obligations.some(obligation => obligation.state === "VOID")) return null
  const receipt = order.receipts[0]
  if (!sameMoney(receipt, paid[0]) || !sameMoney(receipt, order)) return null
  return receipt
}

function confirmationIncomplete(order: PaymentOrder): boolean {
  const signal = order.receipts.length > 0 || order.obligations.some(obligation => obligation.state === "PAID")
  return signal && !consistentReceipt(order)
}

function voidedOnly(order: PaymentOrder): boolean {
  return order.receipts.length === 0
    && order.obligations.length > 0
    && order.obligations.every(obligation => obligation.state === "VOID")
    && !dueNow(order)
}

function openPaymentSentence(obligation: PaymentObligation): string {
  const amount = moneyLabel(obligation.amountMinor, obligation.currency)
  if (obligation.state === "DUE") return `Payment due ${amount}`
  return `${obligationHeadline(obligation.kind, obligation.state)} ${amount}`
}

function paidAmount(orders: PaymentOrder[]): { amountMinor: number; currency: string } | null {
  const receipts = orders.flatMap(order => order.receipts)
  return receipts.length === 1 ? receipts[0] : null
}

/**
 * Read-only summary of recorded orders. Order array order is not meaningful.
 * Paid is shown only when one receipt matches one PAID obligation and the order.
 * This does not infer a catalogue product from case status, and it does not
 * start or repeat a charge.
 */
export function presentCaseCommerce(item: PaymentCase): { purchasedService: string | null; payment: string | null } {
  if (item.orders.length === 0) return { purchasedService: null, payment: null }
  if (item.orders.some(confirmationIncomplete)) {
    return {
      purchasedService: item.orders.length === 1 ? item.orders[0].serviceName : null,
      payment: FINALISING,
    }
  }
  const paid = item.orders.filter(order => consistentReceipt(order))
  const due = item.orders.filter(order => !consistentReceipt(order) && dueNow(order))
  if (due.length > 1 || (due.length === 1 && paid.length > 0)) {
    return { purchasedService: null, payment: SEVERAL_ORDERS }
  }
  if (due.length === 1 && paid.length === 0) {
    const obligation = dueNow(due[0])
    return {
      purchasedService: due[0].serviceName,
      payment: obligation ? openPaymentSentence(obligation) : "Payment due",
    }
  }
  if (paid.length > 0) {
    const names = new Set(paid.map(order => order.serviceName))
    const amount = names.size === 1 ? paidAmount(paid) : null
    if (names.size !== 1 || !amount) return { purchasedService: null, payment: SEVERAL_ORDERS }
    return {
      purchasedService: [...names][0],
      payment: `Paid ${moneyLabel(amount.amountMinor, amount.currency)}`,
    }
  }
  if (item.orders.length === 1 && item.orders[0].paymentModel === "SUCCESS_FEE" && !voidedOnly(item.orders[0])) {
    return {
      purchasedService: item.orders[0].serviceName,
      payment: "The success fee is charged only after a documented result",
    }
  }
  if (item.orders.every(voidedOnly)) return { purchasedService: null, payment: "This payment was voided." }
  if (item.orders.length === 1) return { purchasedService: item.orders[0].serviceName, payment: null }
  return { purchasedService: null, payment: SEVERAL_ORDERS }
}
