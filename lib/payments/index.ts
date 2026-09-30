import { liveSecretRejected, paymentsEnabled, resolvePaymentProviderMode, stripeSecret, type PaymentEnv } from "./config"
import { createFakePaymentProvider } from "./fake"
import { disabledPaymentProvider, type PaymentProvider } from "./provider"
import { createStripePaymentProvider } from "./stripe"

export { SUCCESS_FEE_CONSENT_TEXT, SUCCESS_FEE_CONSENT_VERSION, STRIPE_SDK_API_VERSION, STRIPE_SDK_VERSION } from "./model"
export { createFakePaymentProvider as mapWithFake } from "./fake"
export { PaymentsDisabledError, type PaymentProvider } from "./provider"
export { createFakePaymentProvider } from "./fake"
export { createStripePaymentProvider } from "./stripe"
export { resolvePaymentProviderMode, paymentsEnabled, stripeSecret, stripeWebhookSecret, customerOrigin } from "./config"

export function paymentProvider(env: PaymentEnv = process.env, options?: { fake?: boolean }): PaymentProvider {
  if (options?.fake) return createFakePaymentProvider()
  const mode = resolvePaymentProviderMode(env)
  const secret = stripeSecret(env)
  if (mode !== "stripe_test" || !paymentsEnabled(env) || liveSecretRejected(mode, secret)) {
    return disabledPaymentProvider()
  }
  return createStripePaymentProvider(env)
}
