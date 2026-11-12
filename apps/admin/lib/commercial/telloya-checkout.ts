import type { TelloyaOfferVersion } from "./telloya-offer"

export type TelloyaBillingState = "none" | "verifying" | "initial_paid" | "recurring_paid" | "failed" | "past_due" | "cancel_at_period_end" | "cancelled"

export type TelloyaCheckoutIntent = {
  mode: "subscription"
  interval: "month"
  currency: "GBP"
  amountPence: number
  idempotencyKey: string
  offerVersion: number
}

export type TelloyaBillingRecord = {
  state: TelloyaBillingState
  subscriptionId: string | null
  processedEvents: string[]
  intentKey: string | null
}

export function emptyTelloyaBilling(): TelloyaBillingRecord {
  return { state: "none", subscriptionId: null, processedEvents: [], intentKey: null }
}

export function prepareTelloyaCheckout(offer: TelloyaOfferVersion | undefined, approval: { agreementStatus: string; agreementHash: string | null; taxApproval: string }): { result: string; intent: TelloyaCheckoutIntent | null } {
  if (!offer || offer.fixture || offer.status !== "ACCEPTED" || offer.monthlyTotalPence === null) return { result: "closed", intent: null }
  if (approval.agreementStatus !== "APPROVED" || !approval.agreementHash || approval.taxApproval !== "APPROVED") return { result: "legal_or_tax_unapproved", intent: null }
  if (offer.currency !== "GBP" || offer.cadence !== "MONTH") return { result: "currency_or_cadence_mismatch", intent: null }
  return {
    result: "prepared",
    intent: {
      mode: "subscription",
      interval: "month",
      currency: "GBP",
      amountPence: offer.monthlyTotalPence,
      idempotencyKey: `${offer.planVersionId}:${offer.version}:${offer.termsHash}:checkout`,
      offerVersion: offer.version,
    },
  }
}

export function telloyaCheckoutReturn(): { state: "verifying"; message: string } {
  return { state: "verifying", message: "Payment being verified" }
}

export function applyTelloyaBillingEvent(record: TelloyaBillingRecord, event: {
  id: string
  type: string
  signatureValid: boolean
  livemode: boolean
  amountPence: number | null
  currency: string | null
  subscriptionId: string | null
  expectedAmountPence: number
  billingReason?: string
  cancelAtPeriodEnd?: boolean
}): { result: string; record: TelloyaBillingRecord } {
  if (!event.signatureValid || event.livemode) return { result: "rejected", record }
  if (record.processedEvents.includes(event.id)) return { result: "duplicate", record }
  const nextEvents = [...record.processedEvents, event.id]
  if (event.currency && event.currency !== "GBP") return { result: "currency_mismatch", record: { ...record, processedEvents: nextEvents } }
  if (event.amountPence !== null && event.amountPence !== event.expectedAmountPence && event.type.startsWith("invoice.")) {
    return { result: "amount_mismatch", record: { ...record, processedEvents: nextEvents } }
  }
  if (event.type === "checkout.session.completed") {
    return { result: "verifying", record: { ...record, state: "verifying", processedEvents: nextEvents, subscriptionId: event.subscriptionId } }
  }
  if (event.type === "invoice.paid" && event.billingReason === "subscription_create") {
    return { result: "initial_paid", record: { ...record, state: "initial_paid", processedEvents: nextEvents, subscriptionId: event.subscriptionId ?? record.subscriptionId } }
  }
  if (event.type === "invoice.paid" && event.billingReason === "subscription_cycle") {
    return { result: "recurring_paid", record: { ...record, state: "recurring_paid", processedEvents: nextEvents } }
  }
  if (event.type === "invoice.payment_failed") {
    return { result: "failed", record: { ...record, state: record.state === "initial_paid" || record.state === "recurring_paid" ? "past_due" : "failed", processedEvents: nextEvents } }
  }
  if (event.type === "customer.subscription.updated" && event.cancelAtPeriodEnd) {
    return { result: "cancel_at_period_end", record: { ...record, state: "cancel_at_period_end", processedEvents: nextEvents } }
  }
  if (event.type === "customer.subscription.deleted") {
    return { result: "cancelled", record: { ...record, state: "cancelled", subscriptionId: null, processedEvents: nextEvents } }
  }
  return { result: "ignored", record: { ...record, processedEvents: nextEvents } }
}

export function startTelloyaCheckout(record: TelloyaBillingRecord, intent: TelloyaCheckoutIntent): { result: string; record: TelloyaBillingRecord } {
  if (record.subscriptionId && record.state !== "cancelled" && record.state !== "failed") return { result: "duplicate_checkout", record }
  if (record.intentKey === intent.idempotencyKey) return { result: "duplicate", record }
  return { result: "started", record: { ...record, intentKey: intent.idempotencyKey, state: record.state === "none" ? "verifying" : record.state } }
}
