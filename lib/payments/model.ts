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
  id: string
  status: string
  amountMinor: number
  requiresAction: boolean
  livemode: false
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
  outcome: "succeeded" | "failed" | "requires_action" | "setup_succeeded" | "setup_failed" | "ignored"
  paymentMethod?: SafePaymentMethod
  stripeCustomerId?: string
  chargeId?: string | null
  receiptUrl?: string | null
  failureCategory?: string | null
  failureCode?: string | null
}

export function paymentMetadata(input: PaymentMetadata): Record<string, string> {
  const out: Record<string, string> = {
    customerId: input.customerId,
    serviceOrderId: input.serviceOrderId,
  }
  if (input.obligationId) out.obligationId = input.obligationId
  if (input.attemptId) out.attemptId = input.attemptId
  if (input.orderRef) out.orderRef = input.orderRef
  return out
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function assertSafeMetadata(meta: Record<string, string>) {
  for (const [key, value] of Object.entries(meta)) {
    if (!["customerId", "serviceOrderId", "obligationId", "attemptId", "orderRef"].includes(key)) {
      throw new Error("Stripe metadata contains a disallowed key")
    }
    if (key === "orderRef") {
      if (!/^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/.test(value)) throw new Error("Stripe metadata orderRef is invalid")
    } else if (!isUuid(value)) {
      throw new Error("Stripe metadata must use opaque internal identifiers")
    }
  }
}
