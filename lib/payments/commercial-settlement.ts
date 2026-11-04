/**
 * Commercial Stripe event classification and settlement verification.
 *
 * A metadata label does not prove ownership. A completed Checkout does not
 * prove payment. This module does not insert commercial_payment_evidence,
 * change a subscription, grant an entitlement, or call Stripe.
 */

export const COMMERCIAL_VERIFICATION_MESSAGE =
  "Your payment is being verified. We'll update your account when confirmation is complete."

export type CommercialRoute = "recovery" | "guard" | "telloya" | "complete" | "unmatched" | "suspicious"

export type SettlementStatus = "verified" | "pending" | "unmatched" | "mismatch" | "unsupported" | "already_processed"

export type SettlementResult = {
  status: SettlementStatus
  route: CommercialRoute
  reason: string
  retryable: boolean
  productCode?: "TELLOYA" | "COMPLETE"
}

export type EvidenceFact = {
  eventId: string
  periodStart: string
  periodEnd: string
}

export type PreparationFacts = {
  productCode: "TELLOYA" | "COMPLETE"
  checkoutSessionId: string
  stripePriceId: string | null
  stripeCustomerId: string | null
  amountMinor: number
  currency: string
  cadence: string
  taxBehaviour: string
  guardQuantity: number
  livemode: boolean
  subscriptionState: string
  stripeSubscriptionId: string | null
  cancelAtPeriodEnd: boolean
  evidence: EvidenceFact[]
}

export type CheckoutFacts = {
  id: string
  mode: string
  status: string
  paymentStatus: string | null
  customerId: string | null
  livemode: boolean
  metadata: Record<string, string>
  subscriptionId?: string | null
}

export type InvoiceFacts = {
  id: string
  status: string
  customerId: string | null
  amountDueMinor: number
  amountPaidMinor: number
  currency: string
  livemode: boolean
  metadata: Record<string, string>
  subscriptionId?: string | null
  priceId?: string | null
  quantity?: number | null
  periodStart?: string | null
  periodEnd?: string | null
  discountMinor?: number | null
  taxMinor?: number | null
  automaticTax?: boolean | null
  trial?: boolean | null
  refunded?: boolean | null
  disputed?: boolean | null
  lineCount?: number | null
  billingReason?: string | null
  subscriptionStatus?: string | null
  cancelAtPeriodEnd?: boolean
}

export type ReceiptFacts = {
  received: boolean
  eventId: string
  eventType: string
  objectId: string
  livemode: boolean
}

const result = (
  status: SettlementStatus,
  route: CommercialRoute,
  reason: string,
  retryable: boolean,
  productCode?: "TELLOYA" | "COMPLETE",
): SettlementResult => ({ status, route, reason, retryable, ...(productCode ? { productCode } : {}) })

export function commercialPaymentVerificationEnabled(env: Record<string, string | undefined> = process.env) {
  return env.CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED === "true"
}

export function claimsCommercial(metadata: Record<string, string> | null | undefined) {
  if (!metadata) return false
  return Boolean(metadata.commercialSubscriptionId || metadata.acceptanceId)
}

export function claimsGuard(metadata: Record<string, string> | null | undefined) {
  if (!metadata) return false
  return Boolean(metadata.guardSubscriptionId || metadata.guardCoverageId)
}

function productRoute(code: "TELLOYA" | "COMPLETE"): CommercialRoute {
  return code === "COMPLETE" ? "complete" : "telloya"
}

function preparationMatchesCheckout(preparation: PreparationFacts, checkout: CheckoutFacts) {
  return preparation.checkoutSessionId === checkout.id
}

function preparationMatchesInvoice(preparation: PreparationFacts, invoice: InvoiceFacts) {
  return Boolean(
    preparation.stripePriceId
    && invoice.priceId
    && preparation.stripePriceId === invoice.priceId
    && preparation.stripeCustomerId
    && invoice.customerId
    && preparation.stripeCustomerId === invoice.customerId,
  )
}

export function classifyStripeEvent(input: {
  eventType: string
  checkout: CheckoutFacts | null
  invoice: InvoiceFacts | null
  preparation: PreparationFacts | null
  guardLinked: boolean
  recoveryLinked: boolean
}): { route: CommercialRoute; reason: string } {
  const metadata = input.checkout?.metadata || input.invoice?.metadata || {}
  if (claimsCommercial(metadata) && claimsGuard(metadata)) {
    return { route: "suspicious", reason: "conflicting_metadata" }
  }
  if (input.preparation && input.checkout && preparationMatchesCheckout(input.preparation, input.checkout)) {
    return { route: productRoute(input.preparation.productCode), reason: "preparation" }
  }
  if (input.preparation && input.invoice && preparationMatchesInvoice(input.preparation, input.invoice)) {
    return { route: productRoute(input.preparation.productCode), reason: "preparation" }
  }
  if (claimsCommercial(metadata)) {
    return { route: "suspicious", reason: "metadata_without_preparation" }
  }
  if (input.guardLinked || (input.checkout?.mode === "subscription" && claimsGuard(input.checkout.metadata))) {
    return { route: "guard", reason: "guard_record" }
  }
  if (input.invoice && (input.guardLinked || claimsGuard(input.invoice.metadata))) {
    return { route: "guard", reason: "guard_record" }
  }
  if (input.eventType.startsWith("payment_intent.") || input.checkout?.mode === "payment" || input.recoveryLinked) {
    return { route: "recovery", reason: "recovery_record" }
  }
  if (input.checkout?.mode === "subscription" || input.eventType.startsWith("invoice.")) {
    return { route: "unmatched", reason: "unknown_subscription" }
  }
  return { route: "unmatched", reason: "unknown_event" }
}

function periodOverlap(leftStart: string, leftEnd: string, evidence: EvidenceFact[], eventId: string) {
  const start = Date.parse(leftStart)
  const end = Date.parse(leftEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "invalid" as const
  for (const row of evidence) {
    if (row.eventId === eventId) return "same_event" as const
    const rowStart = Date.parse(row.periodStart)
    const rowEnd = Date.parse(row.periodEnd)
    if (Number.isFinite(rowStart) && Number.isFinite(rowEnd) && start < rowEnd && rowStart < end) return "overlap" as const
  }
  return "clear" as const
}

export function assessCommercialSettlement(input: {
  enabled: boolean
  route: CommercialRoute
  eventType: string
  receipt: ReceiptFacts
  preparation: PreparationFacts | null
  checkout: CheckoutFacts | null
  invoice: InvoiceFacts | null
  classificationReason?: string
}): SettlementResult {
  const route = input.route
  if (route === "suspicious") {
    const reason = input.classificationReason === "metadata_without_preparation" ? "metadata_without_preparation" : "conflicting_metadata"
    return result("mismatch", route, reason, false)
  }
  if (route !== "telloya" && route !== "complete") return result("unmatched", route, "not_commercial", false)
  const productCode = route === "complete" ? "COMPLETE" : "TELLOYA"
  if (!input.enabled) return result("pending", route, "verification_disabled", false, productCode)
  if (!input.receipt.received) return result("unmatched", route, "not_received", false, productCode)
  if (input.receipt.eventType !== input.eventType) return result("mismatch", route, "receipt_type", false, productCode)
  const preparation = input.preparation
  if (!preparation) return result("unmatched", route, "preparation", false, productCode)
  if (preparation.livemode !== input.receipt.livemode) return result("mismatch", route, "livemode", false, productCode)
  if (preparation.taxBehaviour !== "NOT_APPLICABLE") return result("unsupported", route, "tax", false, productCode)
  if (preparation.cadence !== "MONTH" || preparation.currency !== "GBP") return result("unsupported", route, "billing_arrangement", false, productCode)
  if (preparation.amountMinor <= 0) return result("mismatch", route, "amount_zero", false, productCode)
  if (productCode === "TELLOYA" && preparation.guardQuantity !== 0) return result("mismatch", route, "guard_quantity", false, productCode)
  if (productCode === "COMPLETE" && preparation.guardQuantity < 0) return result("mismatch", route, "guard_quantity", false, productCode)
  if (["CANCELED", "ENDED", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"].includes(preparation.subscriptionState) || preparation.cancelAtPeriodEnd) {
    return result("mismatch", route, "cancellation", false, productCode)
  }
  if (preparation.subscriptionState === "ACTIVE") return result("mismatch", route, "prior_settlement", false, productCode)
  if (preparation.subscriptionState !== "PAYMENT_PENDING") return result("mismatch", route, "subscription_state", false, productCode)
  if (input.eventType.startsWith("checkout.session.")) {
    const checkout = input.checkout
    if (!checkout || checkout.id !== input.receipt.objectId || checkout.id !== preparation.checkoutSessionId) {
      return result("unmatched", route, "session", false, productCode)
    }
    if (checkout.livemode !== preparation.livemode) return result("mismatch", route, "livemode", false, productCode)
    if (checkout.customerId !== preparation.stripeCustomerId) return result("mismatch", route, "customer", false, productCode)
    if (checkout.status === "expired") return result("mismatch", route, "session_closed", false, productCode)
    if (input.eventType === "checkout.session.async_payment_failed" || checkout.status === "canceled") {
      return result("mismatch", route, "payment_failed", false, productCode)
    }
    if (checkout.paymentStatus === "processing" || (input.eventType === "checkout.session.async_payment_succeeded" && checkout.paymentStatus !== "paid")) {
      return result("pending", route, "async_pending", true, productCode)
    }
    return result("pending", route, "checkout_not_payment", false, productCode)
  }
  if (!input.eventType.startsWith("invoice.")) return result("unsupported", route, "event_type", false, productCode)
  const invoice = input.invoice
  const checkout = input.checkout
  if (!invoice || invoice.id !== input.receipt.objectId) return result("unmatched", route, "invoice", true, productCode)
  if (!checkout || checkout.id !== preparation.checkoutSessionId) return result("unmatched", route, "session", false, productCode)
  if (invoice.livemode !== preparation.livemode || checkout.livemode !== preparation.livemode) {
    return result("mismatch", route, "livemode", false, productCode)
  }
  if (invoice.customerId !== preparation.stripeCustomerId || checkout.customerId !== preparation.stripeCustomerId) {
    return result("mismatch", route, "customer", false, productCode)
  }
  if (!invoice.priceId || invoice.priceId !== preparation.stripePriceId) return result("mismatch", route, "price", false, productCode)
  if (!invoice.subscriptionId || !checkout.subscriptionId || invoice.subscriptionId !== checkout.subscriptionId) {
    return result("mismatch", route, "subscription", false, productCode)
  }
  if (preparation.stripeSubscriptionId && preparation.stripeSubscriptionId !== invoice.subscriptionId) {
    return result("mismatch", route, "subscription", false, productCode)
  }
  if (invoice.quantity !== 1) return result("unsupported", route, "quantity", false, productCode)
  if ((invoice.currency || "").toLowerCase() !== "gbp") return result("mismatch", route, "currency", false, productCode)
  if (invoice.cancelAtPeriodEnd || ["canceled", "incomplete_expired", "unpaid"].includes(invoice.subscriptionStatus || "")) {
    return result("mismatch", route, "cancellation", false, productCode)
  }
  if (input.eventType === "invoice.payment_failed" || invoice.status === "uncollectible" || invoice.status === "void" || invoice.subscriptionStatus === "past_due") {
    return result("mismatch", route, "payment_failed", false, productCode)
  }
  if (invoice.trial === true || invoice.subscriptionStatus === "trialing") return result("unsupported", route, "trial", false, productCode)
  if (invoice.automaticTax === true || (invoice.taxMinor != null && invoice.taxMinor > 0)) return result("unsupported", route, "tax", false, productCode)
  if (invoice.discountMinor != null && invoice.discountMinor > 0) return result("unsupported", route, "discount", false, productCode)
  if (invoice.refunded === true) return result("mismatch", route, "refund", false, productCode)
  if (invoice.disputed === true) return result("mismatch", route, "dispute", false, productCode)
  if (
    invoice.trial == null
    || invoice.discountMinor == null
    || invoice.refunded == null
    || invoice.disputed == null
    || invoice.automaticTax == null
    || invoice.taxMinor == null
    || invoice.lineCount == null
    || !invoice.billingReason
  ) {
    return result("pending", route, "provider_incomplete", true, productCode)
  }
  if (invoice.billingReason !== "subscription_create") return result("unsupported", route, "billing_arrangement", false, productCode)
  if (invoice.lineCount !== 1) return result("unsupported", route, "quantity", false, productCode)
  const paid = invoice.status === "paid" && input.eventType === "invoice.paid"
  if (!paid || invoice.subscriptionStatus === "incomplete" || invoice.subscriptionStatus === "past_due") {
    return result("pending", route, invoice.status === "open" ? "async_pending" : "invoice_unpaid", true, productCode)
  }
  if (invoice.amountPaidMinor <= 0 || invoice.amountDueMinor <= 0) return result("mismatch", route, "amount_zero", false, productCode)
  if (invoice.amountPaidMinor !== preparation.amountMinor || invoice.amountDueMinor !== preparation.amountMinor) {
    return result("mismatch", route, "amount", false, productCode)
  }
  if (!invoice.periodStart || !invoice.periodEnd) return result("mismatch", route, "period", false, productCode)
  const overlap = periodOverlap(invoice.periodStart, invoice.periodEnd, preparation.evidence, input.receipt.eventId)
  if (overlap === "invalid") return result("mismatch", route, "period", false, productCode)
  if (overlap === "same_event") return result("already_processed", route, "duplicate_evidence", false, productCode)
  if (overlap === "overlap") return result("mismatch", route, "prior_settlement", false, productCode)
  if (invoice.subscriptionStatus !== "active") return result("pending", route, "subscription_pending", true, productCode)
  return result("verified", route, "paid_invoice", false, productCode)
}
