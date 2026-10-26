import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerConfig, sessionCookie, customerRequestOriginAllowed } from "@/lib/config"
import { isUuid } from "../uuid"
import { paymentProvider, paymentProviderWithLane } from "../../../../lib/payments"
import { CheckoutEmailUnverifiedError, CHECKOUT_EMAIL_UNVERIFIED_MESSAGE, readCheckoutPresentation } from "../../../../lib/payments/checkout-presentation"
import { ensureMappedStripeCustomer } from "../../../../lib/payments/customer-email"
import { declaredLivemodeArgument, declaredLivemodeField, guardExternalPayment } from "../../../../lib/payments/lane-agreement"
import { PaymentsDisabledError } from "../../../../lib/payments/provider"
import { eligibilityEnquiryMessage } from "../../../../lib/commercial/eligibility-message"
import { trustedStripeUrl } from "../../../../lib/payments/stripe-url"

const reply = (extra: Record<string, unknown> = {}, http = 401) =>
  NextResponse.json({ message: ACTION_UNAVAILABLE, ...extra }, { status: http, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit: number) {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
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

export async function paymentCommand(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply()
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  const body = await readJson(request, 2048)
  if (!validToken(token) || !isUuid(key) || !body || typeof body.operation !== "string") return reply()
  if (!["confirm_consent", "start_checkout"].includes(body.operation)) return reply()
  const operation = body.operation
  const data = operation === "confirm_consent"
    ? { accepted: body.accepted === true }
    : { idempotencyKey: isUuid(body.idempotencyKey) ? body.idempotencyKey : key, ...declaredLivemodeField() }
  if (operation === "confirm_consent" && data.accepted !== true) {
    return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
  }
  try {
    if (operation === "start_checkout") {
      await guardExternalPayment((name, args) => backend().rpc(name, args ?? {}))
    }
    const result = await backend().rpc<{
      status?: string
      consentId?: string
      providerOperationId?: string
      idempotencyKey?: string
      attemptId?: string
      amountMinor?: number
      currency?: string
      mode?: string
      customerId?: string
      serviceOrderId?: string
      obligationId?: string
      orderRef?: string
      checkoutSessionId?: string
      paymentIntentId?: string
    }>("customer_payment_command_v1", {
      p_token_hash: tokenHash(token), p_request: key, p_operation: operation, p_data: data,
    })
    if (result.status === "eligibility_blocked") {
      return NextResponse.json({ status: "denied", message: eligibilityEnquiryMessage }, { status: 403, headers: privateResponseHeaders })
    }
    if (result.status === "invalid") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
    if (result.status === "needs_cancel") {
      const cancelled = await settleRecoveryCancel(result)
      if (cancelled === "paid") {
        return NextResponse.json({ status: "ok", confirming: true, message: "We’re confirming your payment." }, { headers: privateResponseHeaders })
      }
      if (!cancelled) return NextResponse.json({ status: "denied", message: "The previous payment attempt cannot be closed yet." }, { status: 409, headers: privateResponseHeaders })
      const retry = await backend().rpc<typeof result>("customer_payment_command_v1", {
        p_token_hash: tokenHash(token), p_request: crypto.randomUUID(), p_operation: operation, p_data: data,
      })
      return await openCustomerCheckout(config.origin, retry)
    }
    if (result.status !== "success") return reply()
    if (operation === "confirm_consent") {
      return NextResponse.json({ status: "ok", consentId: result.consentId, message: "Consent recorded. No fee is due today." }, { headers: privateResponseHeaders })
    }
    return await openCustomerCheckout(config.origin, result)
  } catch (error) {
    if (error instanceof CheckoutEmailUnverifiedError) {
      return NextResponse.json({ status: "disabled", message: CHECKOUT_EMAIL_UNVERIFIED_MESSAGE }, { status: 503, headers: privateResponseHeaders })
    }
    if (error instanceof PaymentsDisabledError) {
      return NextResponse.json({ status: "disabled", message: "Secure Stripe Checkout is not available yet." }, { status: 503, headers: privateResponseHeaders })
    }
    return reply({}, 503)
  }
}

export async function openCustomerCheckout(origin: string, result: {
  status?: string
  providerOperationId?: string
  idempotencyKey?: string
  attemptId?: string
  amountMinor?: number
  mode?: string
  customerId?: string
  serviceOrderId?: string
  obligationId?: string
  orderRef?: string
  checkoutSessionId?: string
}) {
  if (result.status !== "success") return reply()
  const lane = await guardExternalPayment((name, args) => backend().rpc(name, args ?? {}))
  const provider = lane ? paymentProviderWithLane(lane) : paymentProvider()
  if (result.checkoutSessionId) {
    const existing = await provider.retrieveCheckout(result.checkoutSessionId)
    if (existing?.url && existing.status === "open") {
      const trusted = trustedStripeUrl(existing.url, "checkout")
      if (!trusted) throw new PaymentsDisabledError("Stripe Checkout URL was rejected.")
      return NextResponse.json({ status: "ok", checkoutUrl: trusted, mode: existing.mode, confirming: true }, { headers: privateResponseHeaders })
    }
    if (existing && existing.status !== "open") {
      const replaced = await backend().rpc<{
        status?: string
        providerOperationId?: string
        idempotencyKey?: string
        attemptId?: string
      }>("payment_replace_expired_checkout_v1", { p_operation: result.providerOperationId, ...declaredLivemodeArgument() })
      if (replaced.status !== "success" || !replaced.providerOperationId || !replaced.idempotencyKey) return reply()
      result = {
        ...result,
        providerOperationId: replaced.providerOperationId,
        idempotencyKey: replaced.idempotencyKey,
        attemptId: replaced.attemptId,
        checkoutSessionId: undefined,
      }
    }
  }
  const rpc = (name: string, args?: Record<string, unknown>) => backend().rpc(name, args ?? {})
  const mode = result.mode === "setup" ? "setup" : "payment"
  const presentation = await readCheckoutPresentation(rpc, {
    customerId: result.customerId || "",
    serviceOrderId: result.serviceOrderId || "",
    amountMinor: result.amountMinor || 0,
    mode,
  })
  const stripeCustomer = await ensureMappedStripeCustomer({
    rpc,
    customerId: result.customerId || "",
    verifiedEmail: presentation.verifiedEmail,
  })
  const successUrl = `${origin}/pay/return`
  const cancelUrl = `${origin}/pay/return`
  const metadata = {
    customerId: result.customerId || "",
    serviceOrderId: result.serviceOrderId || "",
    obligationId: result.obligationId,
    attemptId: result.attemptId,
    orderRef: result.orderRef,
    providerOperationId: result.providerOperationId,
  }
  const checkout = mode === "setup"
    ? await provider.createSetupCheckout({
      idempotencyKey: result.idempotencyKey || "",
      stripeCustomerId: stripeCustomer,
      successUrl,
      cancelUrl,
      metadata,
    })
    : await provider.createPaymentCheckout({
      idempotencyKey: result.idempotencyKey || "",
      stripeCustomerId: stripeCustomer,
      amountMinor: result.amountMinor || 0,
      currency: "GBP",
      serviceCode: presentation.serviceCode,
      successUrl,
      cancelUrl,
      metadata,
    })
  await backend().rpc("payment_record_provider_refs_v1", {
    p_operation: result.providerOperationId, p_object_id: checkout.id, p_object_type: "checkout.session",
  })
  const trusted = trustedStripeUrl(checkout.url, "checkout")
  if (!trusted) throw new PaymentsDisabledError("Stripe Checkout URL was rejected.")
  return NextResponse.json({ status: "ok", checkoutUrl: trusted, mode: checkout.mode, confirming: true }, { headers: privateResponseHeaders })
}

export async function settleRecoveryCancel(result: {
  paymentIntentId?: string
  providerOperationId?: string
  idempotencyKey?: string
}): Promise<boolean | "paid"> {
  if (!result.paymentIntentId || !result.providerOperationId || !result.idempotencyKey) return false
  const lane = await guardExternalPayment((name, args) => backend().rpc(name, args ?? {}))
  const provider = lane ? paymentProviderWithLane(lane) : paymentProvider()
  const cancelled = await provider.cancelPaymentIntent({
    id: result.paymentIntentId,
    idempotencyKey: result.idempotencyKey,
  })
  if (cancelled.alreadySucceeded) {
    await backend().rpc("payment_record_cancel_v1", {
      p_operation: result.providerOperationId,
      p_payment_intent_id: result.paymentIntentId,
      p_provider_status: "succeeded",
    })
    return "paid"
  }
  if (!cancelled.cancelled) return false
  const recorded = await backend().rpc<{ status?: string }>("payment_record_cancel_v1", {
    p_operation: result.providerOperationId,
    p_payment_intent_id: result.paymentIntentId,
    p_provider_status: cancelled.status,
  })
  return recorded.status === "success"
}
