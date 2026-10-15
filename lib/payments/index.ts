import { paymentsEnabled, type PaymentEnv } from "./config"
import { createFakePaymentProvider } from "./fake"
import { databaseLaneAgrees, type DatabasePaymentLane } from "./lane-agreement"
import { disabledPaymentProvider, PaymentsDisabledError, type PaymentProvider } from "./provider"
import { createStripePaymentProvider } from "./stripe"

export {
  SUCCESS_FEE_CONSENT_TEXT, SUCCESS_FEE_CONSENT_VERSION, STRIPE_SDK_API_VERSION, STRIPE_SDK_VERSION,
  GUARD_RECURRING_CONSENT_TEXT, GUARD_RECURRING_CONSENT_VERSION, GUARD_CANCELLATION_TERMS_VERSION,
  GUARD_PRICE_CHANGE_NOTICE_VERSION,
} from "./model"
export { createFakePaymentProvider as mapWithFake } from "./fake"
export { PaymentsDisabledError, LiveStripeKeyError, type PaymentProvider } from "./provider"
export { createFakePaymentProvider } from "./fake"
export { createStripePaymentProvider } from "./stripe"
export {
  resolvePaymentProviderMode, paymentsEnabled, stripeSecret, stripeWebhookSecret, customerOrigin,
  isStripeTestSecret, isStripeLiveSecret, isStripeWebhookSecret, liveSecretRejected, paymentLane,
  paymentDataLaneMatches, expectedLivemode, STRIPE_LIVE_ACTIVATION_VALUE,
} from "./config"

export function paymentProvider(
  env: PaymentEnv = process.env,
  options?: { fake?: boolean; databaseLane?: DatabasePaymentLane | null },
): PaymentProvider {
  if (options?.fake) return createFakePaymentProvider()
  if (!paymentsEnabled(env)) return disabledPaymentProvider()
  if (!databaseLaneAgrees(env, options?.databaseLane ?? null)) return disabledPaymentProvider()
  try {
    return createStripePaymentProvider(env, options?.databaseLane)
  } catch (error) {
    if (error instanceof PaymentsDisabledError) return disabledPaymentProvider()
    throw error
  }
}

/** Uses the process environment. Callers that hold a different env pass it to paymentProvider. */
export function paymentProviderWithLane(lane: DatabasePaymentLane): PaymentProvider {
  const env = process.env
  return paymentProvider(env, { databaseLane: lane })
}
