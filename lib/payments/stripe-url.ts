/**
 * Exact-host allowlist for Stripe Checkout and hosted invoices.
 *
 * Hosts match in full. A suffix, lookalike, credential, port, or non-HTTPS
 * scheme never qualifies. Sandbox and live Checkout both use the real Stripe
 * hosts. The fixed fake-provider hosts are only for local tests, never for a
 * Vercel Preview or Production bundle. NODE_ENV=production on Preview does
 * not admit those fake hosts and does not reject a real sandbox URL.
 */

export type StripeUrlKind = "checkout" | "invoice"

type StripeUrlEnv = {
  NODE_ENV?: string
  VERCEL_ENV?: string
}

const MAX_LENGTH = 2000

const LIVE_HOST = {
  checkout: "checkout.stripe.com",
  invoice: "invoice.stripe.com",
} as const

const TEST_HOST = {
  checkout: "checkout.stripe.test",
  invoice: "invoice.stripe.test",
} as const

const CONTROL = /[\u0000-\u001F\u007F]/
const BAD_PERCENT = /%(?![0-9A-Fa-f]{2})/
const ENCODED_CONTROL = /%(?:0[0-9A-Fa-f]|1[0-9A-Fa-f]|7[Ff])/

export function trustedStripeUrl(
  value: unknown,
  kind: StripeUrlKind,
  env: StripeUrlEnv = process.env,
): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null
  if (CONTROL.test(value) || /\s/.test(value) || value.includes("\\")) return null
  if (BAD_PERCENT.test(value) || ENCODED_CONTROL.test(value)) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:") return null
  if (parsed.username !== "" || parsed.password !== "") return null
  if (parsed.port !== "") return null
  // The direct NODE_ENV read is what a production browser bundle inlines.
  // Any VERCEL_ENV, including preview, is a deployed lane and rejects fake hosts.
  const deployed = !!env.VERCEL_ENV
  const productionNode = env.NODE_ENV === "production" || process.env.NODE_ENV === "production"
  const hosts: readonly string[] = deployed || productionNode
    ? [LIVE_HOST[kind]]
    : [LIVE_HOST[kind], TEST_HOST[kind]]
  if (!hosts.includes(parsed.hostname)) return null
  return parsed.href
}

/** Assign only a trusted Checkout URL. Returns false without navigating. */
export function assignTrustedStripeCheckout(value: unknown): boolean {
  const trusted = trustedStripeUrl(value, "checkout")
  if (!trusted || typeof window === "undefined") return false
  window.location.assign(trusted)
  return true
}

/** Drop an untrusted hosted-invoice URL before a customer session is returned. */
export function stripUntrustedHostedInvoice<T>(session: T): T {
  if (!session || typeof session !== "object") return session
  const record = session as { payment?: unknown }
  const payment = record.payment
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) return session
  if (!Object.prototype.hasOwnProperty.call(payment, "hostedInvoiceUrl")) return session
  const current = (payment as { hostedInvoiceUrl?: unknown }).hostedInvoiceUrl
  if (current == null) return session
  const trusted = trustedStripeUrl(current, "invoice")
  if (trusted === current) return session
  return {
    ...(session as Record<string, unknown>),
    payment: { ...(payment as Record<string, unknown>), hostedInvoiceUrl: trusted },
  } as T
}
