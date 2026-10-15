import { PAYMENT_PROVIDER_MODES, type PaymentProviderMode } from "./model"

export type PaymentEnv = Record<string, string | undefined>

/** The only value that arms Production live payments. A secret is not enough. */
export const STRIPE_LIVE_ACTIVATION_VALUE = "enabled"

export const DEV_SUPABASE_PROJECT_REF = "rmzozuiamjcclvtgutgd"
export const PROD_SUPABASE_PROJECT_REF = "cxwwekdzkkjjbiyofrov"
export const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
export const PROD_EVIDENCE_BUCKET = "profilerelaunch-evidence-prod-euw2-337909767363"

export type PaymentLane = "local" | "preview" | "production" | "unrecognised"

/**
 * Vercel Preview builds with NODE_ENV=production. The lane is VERCEL_ENV.
 * NODE_ENV=production without VERCEL_ENV is ambiguous and fails closed.
 * Local tests and development have no VERCEL_ENV and are not production.
 */
export function paymentLane(env: PaymentEnv = process.env): PaymentLane {
  const vercel = env.VERCEL_ENV
  if (vercel === "production") return "production"
  if (vercel === "preview" || vercel === "development") return "preview"
  if (vercel) return "unrecognised"
  if (env.NODE_ENV === "production") return "unrecognised"
  return "local"
}

export function resolvePaymentProviderMode(env: PaymentEnv = process.env): PaymentProviderMode {
  const requested = env.PAYMENTS_PROVIDER_MODE
  const lane = paymentLane(env)
  if (lane === "unrecognised") return "disabled"
  if (requested !== "stripe_test" && requested !== "stripe_live") return "disabled"
  if (lane === "production") {
    if (requested !== "stripe_live") return "disabled"
    if (env.STRIPE_LIVE_ACTIVATION !== STRIPE_LIVE_ACTIVATION_VALUE) return "disabled"
    return "stripe_live"
  }
  if (requested !== "stripe_test") return "disabled"
  return "stripe_test"
}

export function isStripeTestSecret(secret: string | null | undefined): secret is string {
  return !!secret && secret.length >= 16 && (secret.startsWith("sk_test_") || secret.startsWith("rk_test_"))
}

export function isStripeLiveSecret(secret: string | null | undefined): secret is string {
  return !!secret && secret.length >= 16 && (secret.startsWith("sk_live_") || secret.startsWith("rk_live_"))
}

export function isStripeWebhookSecret(secret: string | null | undefined): secret is string {
  return !!secret && secret.length >= 16 && secret.startsWith("whsec_")
}

function hostname(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.hostname : null
  } catch {
    return null
  }
}

/**
 * Local tests may omit resource pins. Preview and Production must name the
 * Supabase project and evidence bucket for that lane. A missing or foreign
 * pin disables payments.
 */
export function paymentDataLaneMatches(env: PaymentEnv = process.env): boolean {
  const lane = paymentLane(env)
  if (lane === "local") return true
  if (lane === "unrecognised") return false
  const production = lane === "production"
  const host = hostname(env.SUPABASE_URL)
  if (host !== `${production ? PROD_SUPABASE_PROJECT_REF : DEV_SUPABASE_PROJECT_REF}.supabase.co`) return false
  const bucket = env.AWS_EVIDENCE_BUCKET
  if (bucket !== (production ? PROD_EVIDENCE_BUCKET : DEV_EVIDENCE_BUCKET)) return false
  return true
}

export function stripeSecret(env: PaymentEnv = process.env): string | null {
  const mode = resolvePaymentProviderMode(env)
  const raw = env.STRIPE_SECRET_KEY
  if (mode === "stripe_test" && isStripeTestSecret(raw)) return raw
  if (mode === "stripe_live" && isStripeLiveSecret(raw)) return raw
  return null
}

export function stripeWebhookSecret(env: PaymentEnv = process.env): string | null {
  const raw = env.STRIPE_WEBHOOK_SECRET
  if (!isStripeWebhookSecret(raw)) return null
  return raw
}

export function customerOrigin(env: PaymentEnv = process.env): string | null {
  const raw = env.CUSTOMER_ORIGIN
  if (!raw || !raw.startsWith("https://")) return null
  return raw.replace(/\/$/, "")
}

export function liveSecretRejected(mode: PaymentProviderMode, secret: string | null): boolean {
  if (mode === "stripe_test") return !isStripeTestSecret(secret)
  if (mode === "stripe_live") return !isStripeLiveSecret(secret)
  return false
}

export function expectedLivemode(env: PaymentEnv = process.env): boolean {
  return resolvePaymentProviderMode(env) === "stripe_live"
}

export function paymentsEnabled(env: PaymentEnv = process.env): boolean {
  if (!paymentDataLaneMatches(env)) return false
  const mode = resolvePaymentProviderMode(env)
  if (mode !== "stripe_test" && mode !== "stripe_live") return false
  if (stripeSecret(env) === null) return false
  // Local unit tests use a fake provider and do not need a webhook secret.
  // Deployed Preview and Production cannot take payment without signed reconciliation.
  if (paymentLane(env) !== "local" && stripeWebhookSecret(env) === null) return false
  return true
}

export { PAYMENT_PROVIDER_MODES }
