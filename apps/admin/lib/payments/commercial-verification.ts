import type { PaymentProvider } from "../../../../lib/payments/provider"
import {
  assessCommercialSettlement,
  claimsCommercial,
  claimsGuard,
  classifyStripeEvent,
  commercialPaymentVerificationEnabled,
  type CheckoutFacts,
  type InvoiceFacts,
  type PreparationFacts,
  type ReceiptFacts,
  type SettlementResult,
  type SubscriptionFacts,
} from "../../../../lib/payments/commercial-settlement"
import type { JobRpc } from "../jobs/model"

type Snapshot = {
  status?: string
  reason?: string
  eventId?: string
  eventType?: string
  objectId?: string | null
  livemode?: boolean
  productCode?: "TELLOYA" | "COMPLETE"
  checkoutSessionId?: string | null
  stripePriceId?: string | null
  stripeCustomerId?: string | null
  customerId?: string | null
  commercialSubscriptionId?: string | null
  acceptanceId?: string | null
  checkoutOperationId?: string | null
  amountMinor?: number
  currency?: string
  cadence?: string
  taxBehaviour?: string
  guardQuantity?: number
  subscriptionState?: string
  stripeSubscriptionId?: string | null
  cancelAtPeriodEnd?: boolean
  evidence?: PreparationFacts["evidence"]
}

const disabled = (route: SettlementResult["route"], reason: string): SettlementResult => ({
  status: "pending",
  route,
  reason,
  retryable: false,
})

function preparationFrom(snapshot: Snapshot): PreparationFacts | null {
  if (snapshot.status !== "success" || (snapshot.productCode !== "TELLOYA" && snapshot.productCode !== "COMPLETE")) return null
  if (!snapshot.checkoutSessionId || !snapshot.customerId || !snapshot.commercialSubscriptionId) return null
  if (!snapshot.acceptanceId || !snapshot.checkoutOperationId) return null
  return {
    productCode: snapshot.productCode,
    checkoutSessionId: snapshot.checkoutSessionId,
    stripePriceId: snapshot.stripePriceId ?? null,
    stripeCustomerId: snapshot.stripeCustomerId ?? null,
    customerId: snapshot.customerId,
    commercialSubscriptionId: snapshot.commercialSubscriptionId,
    acceptanceId: snapshot.acceptanceId,
    checkoutOperationId: snapshot.checkoutOperationId,
    amountMinor: snapshot.amountMinor ?? 0,
    currency: snapshot.currency || "",
    cadence: snapshot.cadence || "",
    taxBehaviour: snapshot.taxBehaviour || "",
    guardQuantity: snapshot.guardQuantity ?? 0,
    livemode: snapshot.livemode === true,
    subscriptionState: snapshot.subscriptionState || "",
    stripeSubscriptionId: snapshot.stripeSubscriptionId ?? null,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd === true,
    evidence: snapshot.evidence ?? [],
  }
}

function receiptFrom(snapshot: Snapshot, eventType: string, objectId: string): ReceiptFacts {
  return {
    received: snapshot.status === "success" && snapshot.objectId === objectId && snapshot.eventType === eventType,
    eventId: snapshot.eventId || "",
    eventType: snapshot.eventType || "",
    objectId: snapshot.objectId || "",
    livemode: snapshot.livemode === true,
  }
}

export async function observeCommercialCheckout(input: {
  rpc: JobRpc
  provider: Pick<PaymentProvider, "retrieveCheckout">
  eventId: string
  eventType: string
  objectId: string
  env?: Record<string, string | undefined>
}): Promise<{ handled: boolean; result?: SettlementResult }> {
  let checkout
  try {
    checkout = await input.provider.retrieveCheckout(input.objectId)
  } catch {
    return { handled: true, result: { status: "pending", route: "unmatched", reason: "provider_timeout", retryable: true } }
  }
  if (!checkout || checkout.mode !== "subscription") return { handled: false }
  const commercialClaim = claimsCommercial(checkout.metadata)
  const guardClaim = claimsGuard(checkout.metadata)
  if (commercialClaim && guardClaim) return { handled: true, result: { status: "mismatch", route: "suspicious", reason: "conflicting_metadata", retryable: false } }
  if (!commercialPaymentVerificationEnabled(input.env)) {
    if (commercialClaim) return { handled: true, result: disabled("unmatched", "verification_disabled") }
    return { handled: false }
  }
  const receipt = await input.rpc.rpc<Snapshot>("commercial_payment_receipt_v1", { p_event_id: input.eventId })
  const snapshot = await input.rpc.rpc<Snapshot>("commercial_payment_preparation_for_session_v1", { p_session_id: checkout.id })
  const preparation = preparationFrom(snapshot)
  const checkoutFacts: CheckoutFacts = {
    id: checkout.id,
    mode: checkout.mode,
    status: checkout.status,
    paymentStatus: checkout.paymentStatus,
    customerId: checkout.customerId,
    livemode: checkout.livemode,
    metadata: checkout.metadata,
    subscriptionId: checkout.subscriptionId ?? null,
  }
  const classified = classifyStripeEvent({
    eventType: input.eventType,
    checkout: checkoutFacts,
    invoice: null,
    preparation,
    guardLinked: false,
    recoveryLinked: false,
  })
  if (classified.route !== "telloya" && classified.route !== "complete" && classified.route !== "suspicious") {
    return { handled: false }
  }
  return {
    handled: true,
    result: assessCommercialSettlement({
      enabled: true,
      route: classified.route,
      eventType: input.eventType,
      receipt: receiptFrom(receipt, input.eventType, input.objectId),
      preparation,
      checkout: checkoutFacts,
      invoice: null,
      classificationReason: classified.reason,
    }),
  }
}

export async function observeCommercialInvoice(input: {
  rpc: JobRpc
  provider: Pick<PaymentProvider, "retrieveRecurringInvoice" | "retrieveCheckout" | "retrieveSubscription">
  eventId: string
  eventType: string
  objectId: string
}): Promise<SettlementResult> {
  let invoice
  try {
    invoice = await input.provider.retrieveRecurringInvoice(input.objectId)
  } catch {
    return { ...disabled("unmatched", "provider_timeout"), retryable: true }
  }
  if (!invoice) return { status: "pending", route: "unmatched", reason: "provider_timeout", retryable: true }
  const receipt = await input.rpc.rpc<Snapshot>("commercial_payment_receipt_v1", { p_event_id: input.eventId })
  const snapshot = invoice.priceId && invoice.customerId
    ? await input.rpc.rpc<Snapshot>("commercial_payment_preparation_for_price_v1", {
      p_price_id: invoice.priceId,
      p_stripe_customer_id: invoice.customerId,
    })
    : { status: "unmatched" }
  const preparation = preparationFrom(snapshot)
  let checkout = null
  if (preparation?.checkoutSessionId) {
    try {
      checkout = await input.provider.retrieveCheckout(preparation.checkoutSessionId)
    } catch {
      return { ...disabled(preparation.productCode === "COMPLETE" ? "complete" : "telloya", "provider_timeout"), retryable: true }
    }
  }
  let subscriptionFacts: SubscriptionFacts | null = null
  if (invoice.subscriptionId) {
    try {
      const subscription = await input.provider.retrieveSubscription(invoice.subscriptionId)
      if (!subscription) {
        subscriptionFacts = null
      } else {
        subscriptionFacts = {
          id: subscription.id,
          customerId: subscription.customerId,
          priceId: subscription.priceId,
          quantity: subscription.quantity,
          livemode: subscription.livemode,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
          scheduleId: subscription.scheduleId,
          metadata: subscription.metadata ?? {},
        }
      }
    } catch {
      return { ...disabled(preparation?.productCode === "COMPLETE" ? "complete" : "telloya", "provider_timeout"), retryable: true }
    }
  }
  const invoiceFacts: InvoiceFacts = {
    id: invoice.id,
    status: invoice.status,
    customerId: invoice.customerId,
    amountDueMinor: invoice.amountDueMinor,
    amountPaidMinor: invoice.amountPaidMinor,
    currency: invoice.currency,
    livemode: invoice.livemode,
    metadata: invoice.metadata,
    subscriptionId: invoice.subscriptionId ?? null,
    priceId: invoice.priceId ?? null,
    quantity: invoice.quantity ?? null,
    periodStart: invoice.periodStart ?? null,
    periodEnd: invoice.periodEnd ?? null,
    discountMinor: invoice.discountMinor ?? null,
    taxMinor: invoice.taxMinor ?? null,
    automaticTax: invoice.automaticTax ?? null,
    trial: subscriptionFacts?.status === "trialing" ? true : invoice.trial ?? null,
    refunded: invoice.refunded ?? null,
    disputed: invoice.disputed ?? null,
    lineCount: invoice.lineCount ?? null,
    billingReason: invoice.billingReason ?? null,
    subscriptionStatus: subscriptionFacts?.status ?? null,
    cancelAtPeriodEnd: subscriptionFacts?.cancelAtPeriodEnd === true,
  }
  const checkoutFacts: CheckoutFacts | null = checkout ? {
    id: checkout.id,
    mode: checkout.mode,
    status: checkout.status,
    paymentStatus: checkout.paymentStatus,
    customerId: checkout.customerId,
    livemode: checkout.livemode,
    metadata: checkout.metadata,
    subscriptionId: checkout.subscriptionId ?? null,
  } : null
  const classified = classifyStripeEvent({
    eventType: input.eventType,
    checkout: checkoutFacts,
    invoice: invoiceFacts,
    preparation,
    guardLinked: (claimsGuard(invoice.metadata) || claimsGuard(subscriptionFacts?.metadata)) && !preparation,
    recoveryLinked: false,
  })
  if (classified.route === "guard" || classified.route === "recovery") {
    return { status: "pending", route: classified.route, reason: classified.reason, retryable: false }
  }
  return assessCommercialSettlement({
    enabled: true,
    route: classified.route,
    eventType: input.eventType,
    receipt: receiptFrom(receipt, input.eventType, input.objectId),
    preparation,
    checkout: checkoutFacts,
    invoice: invoiceFacts,
    subscription: subscriptionFacts,
    classificationReason: classified.reason,
  })
}

export type CommercialSettlementFacts =
  | {
    ok: true
    priceId: string
    stripeCustomerId: string
    facts: Record<string, string | number | boolean | null>
  }
  | { ok: false; reason: "provider_timeout" | "provider_incomplete" }

/** Fresh provider evidence for the settlement command. This object never carries a verified flag. */
export async function retrieveCommercialSettlementFacts(input: {
  rpc: JobRpc
  provider: Pick<PaymentProvider, "retrieveRecurringInvoice" | "retrieveCheckout" | "retrieveSubscription">
  eventId: string
  invoiceId: string
}): Promise<CommercialSettlementFacts> {
  let invoice
  try {
    invoice = await input.provider.retrieveRecurringInvoice(input.invoiceId)
  } catch {
    return { ok: false, reason: "provider_timeout" }
  }
  if (!invoice?.priceId || !invoice.customerId || !invoice.subscriptionId) {
    return { ok: false, reason: "provider_incomplete" }
  }
  const snapshot = await input.rpc.rpc<Snapshot>("commercial_payment_preparation_for_price_v1", {
    p_price_id: invoice.priceId,
    p_stripe_customer_id: invoice.customerId,
  })
  const preparation = preparationFrom(snapshot)
  if (!preparation?.checkoutSessionId) return { ok: false, reason: "provider_incomplete" }
  let checkout
  let subscription
  try {
    checkout = await input.provider.retrieveCheckout(preparation.checkoutSessionId)
    subscription = await input.provider.retrieveSubscription(invoice.subscriptionId)
  } catch {
    return { ok: false, reason: "provider_timeout" }
  }
  if (!checkout || !subscription) return { ok: false, reason: "provider_incomplete" }
  return {
    ok: true,
    priceId: invoice.priceId,
    stripeCustomerId: invoice.customerId,
    facts: {
      eventId: input.eventId,
      invoiceId: invoice.id,
      checkoutSessionId: checkout.id,
      stripeCustomerId: invoice.customerId,
      stripeSubscriptionId: invoice.subscriptionId,
      checkoutSubscriptionId: checkout.subscriptionId ?? null,
      stripePriceId: invoice.priceId,
      currency: invoice.currency,
      invoiceStatus: invoice.status,
      amountDueMinor: invoice.amountDueMinor,
      amountPaidMinor: invoice.amountPaidMinor,
      quantity: invoice.quantity ?? null,
      lineCount: invoice.lineCount ?? null,
      discountMinor: invoice.discountMinor ?? null,
      taxMinor: invoice.taxMinor ?? null,
      periodStart: invoice.periodStart ?? null,
      periodEnd: invoice.periodEnd ?? null,
      billingReason: invoice.billingReason ?? null,
      livemode: invoice.livemode,
      automaticTax: invoice.automaticTax ?? null,
      trial: subscription.status === "trialing" ? true : invoice.trial ?? null,
      refunded: invoice.refunded ?? null,
      disputed: invoice.disputed ?? null,
      subscriptionStatus: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
      schedulePresent: Boolean(subscription.scheduleId),
      subscriptionLivemode: subscription.livemode,
      subscriptionCustomerId: subscription.customerId,
      subscriptionPriceId: subscription.priceId,
      subscriptionQuantity: subscription.quantity,
      subscriptionPeriodStart: subscription.currentPeriodStart,
      subscriptionPeriodEnd: subscription.currentPeriodEnd,
    },
  }
}
