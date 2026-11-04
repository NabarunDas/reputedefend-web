import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isUuid } from "@/lib/uuid"
import { createFakePaymentProvider } from "../../../../../lib/payments/fake"
import { paymentLane, paymentsEnabled } from "../../../../../lib/payments/config"
import { declaredLivemodeArgument, guardExternalPayment } from "../../../../../lib/payments/lane-agreement"
import type { CommercialMetadata, RetrievedCheckout } from "../../../../../lib/payments/model"
import { paymentProviderWithLane } from "../../../../../lib/payments"
import { PaymentsDisabledError, type PaymentProvider } from "../../../../../lib/payments/provider"
import { trustedStripeUrl } from "../../../../../lib/payments/stripe-url"
import { COMMERCIAL_CHECKOUT_SESSION_ID, COMMERCIAL_VERIFICATION_MESSAGE } from "../../../../../lib/payments/commercial-settlement"
import { commercialCheckoutEnabled } from "./flag"
import { OFFER_REF } from "./offer-types"

const SIGN_IN = "Sign in again to continue."
const NOT_READY = "Payment setup is being prepared. Nothing has been paid and the service has not started."
const UNAVAILABLE = "We couldn't start secure payment for this offer just now. Nothing has been paid and the service has not started."
const STALE = "This page is out of date. Refresh it and try again. Nothing has been paid."
const UNSUPPORTED = "This billing arrangement is not ready for secure payment. Nothing has been paid and the service has not started."
const RETURN_NOTE = "Returning from the payment page does not record a payment."
const CONFIRMING = COMMERCIAL_VERIFICATION_MESSAGE
const SESSION_CLOSED = "This payment session can no longer be used. Nothing has been paid and the service has not started."
const SESSION_MISMATCH = "The recorded payment session does not match this offer. Nothing has been paid and the service has not started."

const reply = (message: string, http = 401) =>
  NextResponse.json({ message }, { status: http, headers: privateResponseHeaders })

type Prepared = {
  status?: string
  reason?: string
  existing?: boolean
  providerOperationId?: string
  priceOperationId?: string
  idempotencyKey?: string
  priceIdempotencyKey?: string
  stripeCustomerId?: string | null
  stripePriceId?: string | null
  stripeProductId?: string | null
  checkoutSessionId?: string | null
  amountMinor?: number
  currency?: string
  cadence?: string
  customerId?: string
  commercialSubscriptionId?: string
  acceptanceId?: string
  taxBehaviour?: string
  guardQuantity?: number
  guardChargeMinor?: number
  overageOptIn?: boolean
  overageCapMinor?: number | null
  productName?: string
  providerOperationStatus?: string
}

const PROVIDER_REF = {
  customer: /^cus_[A-Za-z0-9]+$/,
  price: /^price_[A-Za-z0-9]+$/,
  product: /^prod_[A-Za-z0-9]+$/,
  session: COMMERCIAL_CHECKOUT_SESSION_ID,
}

async function readJson(request: NextRequest, limit: number) {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = ""
  let size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return null }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return JSON.parse(raw || "{}") as Record<string, unknown> }
  catch { return null }
}

function originOk(request: NextRequest) {
  return customerRequestOriginAllowed(request.headers.get("origin"), request.nextUrl.origin)
}

type ReservedPreparation = Prepared & {
  providerOperationId: string
  priceOperationId: string
  idempotencyKey: string
  priceIdempotencyKey: string
  customerId: string
  commercialSubscriptionId: string
  acceptanceId: string
  amountMinor: number
  currency: "GBP"
  cadence: "MONTH"
  productName: "Telloya" | "Complete"
  taxBehaviour: "NOT_APPLICABLE"
  guardQuantity: number
  guardChargeMinor: number
  overageOptIn: boolean
}

function preparedOk(value: unknown): value is ReservedPreparation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as Prepared
  if (row.status !== "success") return false
  if (!isUuid(row.providerOperationId) || !isUuid(row.priceOperationId) || !isUuid(row.idempotencyKey)) return false
  if (!isUuid(row.priceIdempotencyKey) || !isUuid(row.customerId) || !isUuid(row.commercialSubscriptionId)) return false
  if (!isUuid(row.acceptanceId)) return false
  if (row.currency !== "GBP" || row.cadence !== "MONTH") return false
  if (row.productName !== "Telloya" && row.productName !== "Complete") return false
  if (row.taxBehaviour !== "NOT_APPLICABLE") return false
  if (!Number.isInteger(row.amountMinor) || (row.amountMinor ?? 0) < 1) return false
  if (!Number.isInteger(row.guardQuantity) || (row.guardQuantity ?? -1) < 0) return false
  if (!Number.isInteger(row.guardChargeMinor) || (row.guardChargeMinor ?? -1) < 0) return false
  if (typeof row.overageOptIn !== "boolean") return false
  if (row.stripeCustomerId != null && !PROVIDER_REF.customer.test(row.stripeCustomerId)) return false
  if (row.stripePriceId != null && !PROVIDER_REF.price.test(row.stripePriceId)) return false
  if (row.stripeProductId != null && !PROVIDER_REF.product.test(row.stripeProductId)) return false
  if (row.checkoutSessionId != null && !PROVIDER_REF.session.test(row.checkoutSessionId)) return false
  return true
}

async function providerForCheckout(): Promise<PaymentProvider> {
  const rpc = (name: string, args?: Record<string, unknown>) => backend().rpc(name, args ?? {})
  if (paymentsEnabled()) {
    const lane = await guardExternalPayment(rpc)
    if (!lane) throw new PaymentsDisabledError(NOT_READY)
    return paymentProviderWithLane(lane)
  }
  if (paymentLane() !== "local") throw new PaymentsDisabledError(NOT_READY)
  return createFakePaymentProvider()
}

async function ensureCustomer(customerId: string, provider: PaymentProvider): Promise<string> {
  const prepared = await backend().rpc<{
    status?: string
    stripeCustomerId?: string
    providerOperationId?: string
    idempotencyKey?: string
  }>("payment_prepare_customer_v1", { p_customer: customerId, ...declaredLivemodeArgument() })
  if (prepared.stripeCustomerId && PROVIDER_REF.customer.test(prepared.stripeCustomerId)) return prepared.stripeCustomerId
  const created = await provider.createCustomer({
    idempotencyKey: prepared.idempotencyKey || "",
    customerId,
  })
  const mapped = await backend().rpc<{ status?: string; stripeCustomerId?: string }>("payment_record_customer_map_v1", {
    p_operation: prepared.providerOperationId,
    p_stripe_customer_id: created.id,
  })
  if (mapped.status !== "success" || !mapped.stripeCustomerId || !PROVIDER_REF.customer.test(mapped.stripeCustomerId)) {
    throw new PaymentsDisabledError("Stripe customer mapping was rejected.")
  }
  return mapped.stripeCustomerId
}

const confirming = () => NextResponse.json({
  status: "confirming",
  message: CONFIRMING,
}, { headers: privateResponseHeaders })

function sessionFactsMatch(session: RetrievedCheckout, prepared: ReservedPreparation, stripeCustomer: string, metadata: CommercialMetadata) {
  const keys = ["acceptanceId", "commercialSubscriptionId", "customerId", "providerOperationId"]
  const recorded = Object.keys(session.metadata).sort()
  if (session.id !== prepared.checkoutSessionId || session.mode !== "subscription") return false
  if (session.customerId !== stripeCustomer) return false
  if ((session.currency || "").toLowerCase() !== "gbp") return false
  if (recorded.length !== keys.length || keys.some(key => session.metadata[key] !== metadata[key as keyof CommercialMetadata])) return false
  if (typeof session.amountMinor !== "number" || session.amountMinor !== prepared.amountMinor) return false
  return true
}

function recordedSessionOutcome(session: RetrievedCheckout) {
  if (session.status === "complete" || session.paymentStatus === "paid" || session.paymentStatus === "processing") return "confirming" as const
  if (session.status === "open" && (session.paymentStatus == null || session.paymentStatus === "unpaid")) return "open" as const
  return "closed" as const
}

/**
 * Opens the reserved commercial Checkout. The amount, price, and customer come
 * from the preparation row. A returned URL is not payment evidence.
 */
export async function openCommercialCheckout(origin: string, prepared: Prepared, provider: PaymentProvider) {
  if (!preparedOk(prepared)) throw new PaymentsDisabledError(UNAVAILABLE)
  if (prepared.providerOperationStatus === "SUCCEEDED") return confirming()
  const metadata: CommercialMetadata = {
    customerId: prepared.customerId,
    commercialSubscriptionId: prepared.commercialSubscriptionId,
    acceptanceId: prepared.acceptanceId,
    providerOperationId: prepared.providerOperationId,
  }
  const stripeCustomer = prepared.stripeCustomerId || await ensureCustomer(prepared.customerId, provider)
  if (prepared.checkoutSessionId) {
    const found = await provider.retrieveCheckout(prepared.checkoutSessionId)
    const live = provider.mode === "stripe_live"
    if (!found || found.livemode !== live || !sessionFactsMatch(found, prepared, stripeCustomer, metadata)) {
      return reply(SESSION_MISMATCH, 409)
    }
    const outcome = recordedSessionOutcome(found)
    if (outcome === "confirming") return confirming()
    if (outcome !== "open") return reply(SESSION_CLOSED, 409)
    const trusted = trustedStripeUrl(found.url, "checkout")
    if (!trusted) throw new PaymentsDisabledError("Stripe Checkout URL was rejected.")
    return NextResponse.json({
      status: "ok",
      checkoutUrl: trusted,
      message: `Continue to secure payment. ${RETURN_NOTE} Nothing has been paid and the service has not started.`,
    }, { headers: privateResponseHeaders })
  }
  let stripePriceId = prepared.stripePriceId
  if (!stripePriceId) {
    const price = await provider.createRecurringPrice({
      idempotencyKey: prepared.priceIdempotencyKey,
      amountMinor: prepared.amountMinor,
      currency: "GBP",
      priceVersionId: prepared.acceptanceId,
      providerOperationId: prepared.priceOperationId,
      commercial: {
        productName: prepared.productName,
        customerId: prepared.customerId,
        commercialSubscriptionId: prepared.commercialSubscriptionId,
        acceptanceId: prepared.acceptanceId,
        taxBehaviour: "NOT_APPLICABLE",
      },
    })
    if (price.amountMinor !== prepared.amountMinor || !PROVIDER_REF.price.test(price.priceId) || !PROVIDER_REF.product.test(price.productId)) {
      throw new PaymentsDisabledError("Stripe Price does not match the approved commercial amount.")
    }
    const recorded = await backend().rpc<{ status?: string }>("commercial_payment_record_price_v1", {
      p_operation: prepared.priceOperationId,
      p_price_id: price.priceId,
      p_product_id: price.productId,
    })
    if (recorded.status !== "success") throw new PaymentsDisabledError(UNAVAILABLE)
    stripePriceId = price.priceId
  }
  const checkout = await provider.createSubscriptionCheckout({
    idempotencyKey: prepared.idempotencyKey,
    stripeCustomerId: stripeCustomer,
    stripePriceId,
    successUrl: `${origin}/pay/return`,
    cancelUrl: `${origin}/pay/return`,
    metadata,
  })
  if (checkout.amountMinor !== 0 || checkout.livemode !== (provider.mode === "stripe_live")) {
    throw new PaymentsDisabledError(UNAVAILABLE)
  }
  const recorded = await backend().rpc<{ status?: string; activated?: boolean }>("commercial_payment_record_checkout_v1", {
    p_operation: prepared.providerOperationId,
    p_session_id: checkout.id,
  })
  if (recorded.status !== "success" || recorded.activated === true) throw new PaymentsDisabledError(UNAVAILABLE)
  const trusted = trustedStripeUrl(checkout.url, "checkout")
  if (!trusted) throw new PaymentsDisabledError("Stripe Checkout URL was rejected.")
  return NextResponse.json({
    status: "ok",
    checkoutUrl: trusted,
    message: `Continue to secure payment. ${RETURN_NOTE} Nothing has been paid and the service has not started.`,
  }, { headers: privateResponseHeaders })
}

export async function portalCommercialPaymentCommand(request: NextRequest) {
  if (!portalAvailable()) return reply(NOT_READY, 404)
  if (!commercialCheckoutEnabled()) return reply(NOT_READY, 404)
  if (!originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply(NOT_READY)
  }
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request, 1024)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  if (Object.keys(body).length !== 1 || !Object.hasOwn(body, "selector")) return reply(NOT_READY)
  if (typeof body.selector !== "string" || !OFFER_REF.test(body.selector)) return reply(UNAVAILABLE, 404)
  try {
    if (paymentsEnabled()) await guardExternalPayment((name, args) => backend().rpc(name, args ?? {}))
    else if (paymentLane() !== "local") return reply(NOT_READY, 200)
    const prepared = await backend().rpc<Prepared | null>("customer_portal_commercial_payment_prepare_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_selector: body.selector,
      ...declaredLivemodeArgument(),
    })
    if (prepared == null) return reply(SIGN_IN)
    if (prepared.status === "invalid") return reply(NOT_READY, 400)
    if (prepared.status === "unsupported") return reply(UNSUPPORTED, 409)
    if (prepared.status === "lane_mismatch") return reply(NOT_READY, 503)
    if (prepared.status === "conflict") return reply(STALE, 409)
    if (prepared.status === "unavailable") return reply(UNAVAILABLE, 409)
    if (prepared.status !== "success") return reply(UNAVAILABLE, 503)
    const provider = await providerForCheckout()
    return await openCommercialCheckout(request.nextUrl.origin, prepared, provider)
  } catch (error) {
    if (error instanceof PaymentsDisabledError) return reply(error.message || NOT_READY, 503)
    return reply(UNAVAILABLE, 503)
  }
}
