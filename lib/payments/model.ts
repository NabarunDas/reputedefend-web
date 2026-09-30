export const PAYMENT_PROVIDER_MODES = ["disabled", "stripe_test"] as const
export type PaymentProviderMode = (typeof PAYMENT_PROVIDER_MODES)[number]

export const STRIPE_SDK_VERSION = "22.6.2"
export const STRIPE_SDK_API_VERSION = "2026-08-26.dahlia"

export const SUCCESS_FEE_CONSENT_VERSION = "SUCCESS_FEE_CONSENT_V1"
export const SUCCESS_FEE_CONSENT_TEXT =
  "No service fee is charged today. The agreed success fee may be charged later only after the defined successful outcome has occurred and ProfileRelaunch has approved billing. The amount is the immutable accepted quote amount. The payment method may be used off-session for that specific agreed success fee. The issuing bank may later require additional authentication."

export type CheckoutMode = "payment" | "setup"

export type PaymentMetadata = {
  customerId: string
  serviceOrderId: string
  obligationId?: string
  attemptId?: string
  orderRef?: string
  providerOperationId?: string
}

export type CreateCheckoutInput = {
  idempotencyKey: string
  stripeCustomerId: string
  amountMinor: number
  currency: "GBP"
  successUrl: string
  cancelUrl: string
  metadata: PaymentMetadata
}

export type CreateSetupInput = {
  idempotencyKey: string
  stripeCustomerId: string
  successUrl: string
  cancelUrl: string
  metadata: PaymentMetadata
}

export type CreateOffSessionInput = {
  idempotencyKey: string
  stripeCustomerId: string
  paymentMethodId: string
  amountMinor: number
  currency: "GBP"
  metadata: PaymentMetadata
}

export type ProviderCheckout = {
  id: string
  url: string
  mode: CheckoutMode
  amountMinor: number
  livemode: false
}

export type ProviderPaymentIntent = {
  id?: string
  status: string
  amountMinor: number
  requiresAction: boolean
  livemode: false
  classification: "succeeded" | "requires_action" | "declined" | "retryable"
  retryable: boolean
  failureCode?: string | null
  failureCategory?: string | null
}

export type RetrievedCheckout = {
  id: string
  mode: CheckoutMode
  status: string
  paymentStatus: string | null
  paymentIntentId: string | null
  setupIntentId: string | null
  customerId: string | null
  url: string | null
  livemode: false
}

export type RetrievedPaymentIntent = {
  id: string
  status: string
  customerId: string | null
  amountMinor: number
  chargeId: string | null
  receiptUrl: string | null
  lastErrorCode: string | null
  metadata: Record<string, string>
  livemode: false
}

export type RetrievedSetupIntent = {
  id: string
  status: string
  usage: string | null
  customerId: string | null
  paymentMethodId: string | null
  metadata: Record<string, string>
  livemode: false
}

export type CancelPaymentResult = {
  ok: boolean
  id: string
  status: string
  alreadySucceeded: boolean
  cancelled: boolean
}

export type ProviderCustomer = {
  id: string
  livemode: false
}

export type SafePaymentMethod = {
  id: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  fingerprint: string | null
}

export type MappedProviderEvent = {
  eventId: string
  type: string
  objectId: string
  objectType: string
  outcome: "succeeded" | "failed" | "requires_action" | "setup_succeeded" | "setup_failed" | "ignored" | "correlated"
  paymentMethod?: SafePaymentMethod
  stripeCustomerId?: string
  chargeId?: string | null
  receiptUrl?: string | null
  failureCategory?: string | null
  failureCode?: string | null
}

export type BoundedProviderEvent = {
  id: string
  type: string
  data?: { object?: Record<string, unknown> }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asId(value: unknown): string | undefined {
  if (typeof value === "string") return value
  const rec = asRecord(value)
  return typeof rec.id === "string" ? rec.id : undefined
}

export function mapBoundedProviderEvent(event: BoundedProviderEvent): MappedProviderEvent {
  const object = asRecord(event.data?.object)
  const paymentMethod = object.payment_method
  const latestCharge = object.latest_charge
  const lastError = asRecord(object.last_payment_error)
  const card = asRecord(asRecord(paymentMethod).card)
  const mapped: MappedProviderEvent = {
    eventId: event.id,
    type: event.type,
    objectId: typeof object.id === "string" ? object.id : "",
    objectType: event.type.startsWith("payment_intent.") ? "payment_intent" : event.type.startsWith("setup_intent.") ? "setup_intent" : "checkout.session",
    outcome: "ignored",
    stripeCustomerId: asId(object.customer),
  }
  if (event.type === "checkout.session.completed") {
    mapped.outcome = "correlated"
  } else if (event.type === "payment_intent.succeeded") {
    mapped.outcome = "succeeded"
    mapped.chargeId = asId(latestCharge) ?? null
    mapped.receiptUrl = typeof asRecord(latestCharge).receipt_url === "string" ? asRecord(latestCharge).receipt_url as string : null
  } else if (event.type === "payment_intent.requires_action") {
    mapped.outcome = "requires_action"
  } else if (event.type === "payment_intent.payment_failed" || event.type === "checkout.session.expired") {
    mapped.outcome = "failed"
    mapped.failureCategory = "DECLINED"
    mapped.failureCode = typeof lastError.code === "string" ? lastError.code : event.type
  } else if (event.type === "setup_intent.succeeded") {
    mapped.outcome = "setup_succeeded"
    const pm = paymentMethod
    if (pm && typeof pm === "object") {
      mapped.paymentMethod = {
        id: asId(pm) || "",
        brand: typeof card.brand === "string" ? card.brand : null,
        last4: typeof card.last4 === "string" ? card.last4 : null,
        expMonth: typeof card.exp_month === "number" ? card.exp_month : null,
        expYear: typeof card.exp_year === "number" ? card.exp_year : null,
        fingerprint: typeof card.fingerprint === "string" ? card.fingerprint : null,
      }
    } else if (typeof pm === "string" && pm.startsWith("pm_")) {
      mapped.paymentMethod = { id: pm, brand: null, last4: null, expMonth: null, expYear: null, fingerprint: null }
    }
  } else if (event.type === "setup_intent.setup_failed" || event.type === "setup_intent.canceled") {
    mapped.outcome = "setup_failed"
  }
  return mapped
}

export function paymentMetadata(input: PaymentMetadata): Record<string, string> {
  const out: Record<string, string> = {
    customerId: input.customerId,
    serviceOrderId: input.serviceOrderId,
  }
  if (input.obligationId) out.obligationId = input.obligationId
  if (input.attemptId) out.attemptId = input.attemptId
  if (input.orderRef) out.orderRef = input.orderRef
  if (input.providerOperationId) out.providerOperationId = input.providerOperationId
  return out
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function assertSafeMetadata(meta: Record<string, string>) {
  for (const [key, value] of Object.entries(meta)) {
    if (!["customerId", "serviceOrderId", "obligationId", "attemptId", "orderRef", "providerOperationId"].includes(key)) {
      throw new Error("Stripe metadata contains a disallowed key")
    }
    if (key === "orderRef") {
      if (!/^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/.test(value)) throw new Error("Stripe metadata orderRef is invalid")
    } else if (!isUuid(value)) {
      throw new Error("Stripe metadata must use opaque internal identifiers")
    }
  }
}
