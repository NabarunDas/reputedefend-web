import { PAYMENT_PROVIDER_MODES, type PaymentProviderMode } from "./model"

export type PaymentEnv = Record<string, string | undefined>

export function resolvePaymentProviderMode(env: PaymentEnv = process.env): PaymentProviderMode {
  const requested = env.PAYMENTS_PROVIDER_MODE
  if (requested === "stripe_test") return "stripe_test"
  if (requested && !(PAYMENT_PROVIDER_MODES as readonly string[]).includes(requested)) return "disabled"
  return "disabled"
}

export function isStripeTestSecret(secret: string | null | undefined): secret is string {
  return !!secret && secret.length >= 16 && (secret.startsWith("sk_test_") || secret.startsWith("rk_test_"))
}

export function stripeSecret(env: PaymentEnv = process.env): string | null {
  const raw = env.STRIPE_SECRET_KEY
  if (!isStripeTestSecret(raw)) return null
  return raw
}

export function stripeWebhookSecret(env: PaymentEnv = process.env): string | null {
  const raw = env.STRIPE_WEBHOOK_SECRET
  if (!raw || raw.length < 16) return null
  return raw
}

export function customerOrigin(env: PaymentEnv = process.env): string | null {
  const raw = env.CUSTOMER_ORIGIN
  if (!raw || !raw.startsWith("https://")) return null
  return raw.replace(/\/$/, "")
}

export function liveSecretRejected(mode: PaymentProviderMode, secret: string | null): boolean {
  if (mode !== "stripe_test") return false
  if (!secret) return true
  return !isStripeTestSecret(secret)
}

export function paymentsEnabled(env: PaymentEnv = process.env): boolean {
  const mode = resolvePaymentProviderMode(env)
  const secret = env.STRIPE_SECRET_KEY ?? null
  if (mode !== "stripe_test") return false
  if (liveSecretRejected(mode, secret) || !isStripeTestSecret(secret)) return false
  return true
}
