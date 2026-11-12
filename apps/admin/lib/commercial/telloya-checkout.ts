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

const verifiedInvoice = Symbol("telloya-verified-invoice")

export type StoredTelloyaSubscription = {
  amountMinor: number
  currency: "GBP"
  stripeSubscriptionId: string
}

export type VerifiedTelloyaEvent = {
  readonly [verifiedInvoice]: true
  id: string
  type: string
  livemode: boolean
  amountPence: number | null
  currency: string | null
  stripeSubscriptionId: string | null
  billingReason: string | null
}

type ProviderEvent = {
  id?: unknown
  type?: unknown
  livemode?: unknown
  data?: { object?: Record<string, unknown> }
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

export function verifyTelloyaProviderEvent(
  raw: string,
  signature: string,
  secret: string,
  construct: (raw: string, signature: string, secret: string) => ProviderEvent,
): VerifiedTelloyaEvent {
  const event = construct(raw, signature, secret)
  const object = event.data?.object ?? {}
  const amount = integer(object.amount_paid) ?? integer(object.amount_due)
  if (typeof event.id !== "string" || typeof event.type !== "string" || raw.length === 0 || signature.length === 0 || secret.length === 0) {
    throw new Error("unverified")
  }
  return {
    [verifiedInvoice]: true,
    id: event.id,
    type: event.type,
    livemode: event.livemode === true,
    amountPence: amount,
    currency: typeof object.currency === "string" ? object.currency.toUpperCase() : null,
    stripeSubscriptionId: typeof object.subscription === "string" ? object.subscription : null,
    billingReason: typeof object.billing_reason === "string" ? object.billing_reason : null,
  }
}

export function classifyStoredTelloyaInvoice(stored: StoredTelloyaSubscription, event: VerifiedTelloyaEvent): string {
  if (event[verifiedInvoice] !== true) return "unverified"
  if (event.livemode) return "livemode_rejected"
  if (event.type !== "invoice.paid") return "not_invoice"
  if (event.currency !== stored.currency) return "currency_mismatch"
  if (event.stripeSubscriptionId !== stored.stripeSubscriptionId) return "identity_mismatch"
  if (event.amountPence !== stored.amountMinor) return "amount_mismatch"
  if (event.billingReason !== "subscription_create" && event.billingReason !== "subscription_cycle") return "ignored"
  return event.billingReason === "subscription_create" ? "matches_initial_invoice" : "matches_renewal_invoice"
}

export function startTelloyaCheckout(record: TelloyaBillingRecord, intent: TelloyaCheckoutIntent): { result: string; record: TelloyaBillingRecord } {
  void intent
  return { result: "not_created", record }
}
