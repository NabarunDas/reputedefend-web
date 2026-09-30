import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerConfig, sessionCookie } from "@/lib/config"
import { isUuid } from "../uuid"
import { paymentProvider } from "../../../../lib/payments"
import { PaymentsDisabledError } from "../../../../lib/payments/provider"

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
  const config = customerConfig()
  return !!config && request.headers.get("origin") === config.origin && request.nextUrl.origin === config.origin
}

export async function guardSubscriptionCommand(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply()
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  const body = await readJson(request, 2048)
  if (!validToken(token) || !isUuid(key) || !body || typeof body.operation !== "string") return reply()
  const operations = [
    "start_checkout", "start_recovery", "request_period_end_cancellation",
    "undo_period_end_cancellation", "request_immediate_cancellation",
  ]
  if (!operations.includes(body.operation)) return reply()
  const operation = body.operation
  const data = { idempotencyKey: isUuid(body.idempotencyKey) ? body.idempotencyKey : key }
  try {
    const result = await backend().rpc<{
      status?: string
      providerOperationId?: string
      idempotencyKey?: string
      stripeCustomerId?: string
      stripePriceId?: string
      stripeSubscriptionId?: string
      amountMinor?: number
      customerId?: string
      serviceOrderId?: string
      guardCoverageId?: string
      guardSubscriptionId?: string
      priceVersionId?: string
      continuationId?: string
      mode?: string
      reviewRequired?: boolean
    }>("customer_guard_subscription_command_v1", {
      p_token_hash: tokenHash(token), p_request: key, p_operation: operation, p_data: data,
    })
    if (result.status === "invalid") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
    if (result.status === "denied") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 403, headers: privateResponseHeaders })
    if (result.status !== "success") return reply()
    if (operation === "request_immediate_cancellation") {
      return NextResponse.json({
        status: "ok",
        reviewRequired: true,
        message: "Immediate cancellation is with Finance for review. A refund is not promised until an approved amount is confirmed by Stripe.",
      }, { headers: privateResponseHeaders })
    }
    if (operation === "request_period_end_cancellation" || operation === "undo_period_end_cancellation") {
      return await applyCancellation(result, operation === "request_period_end_cancellation")
    }
    return await beginCheckout(config.origin, result)
  } catch (error) {
    if (error instanceof PaymentsDisabledError) {
      return NextResponse.json({ status: "disabled", message: "Secure Stripe Checkout is not available yet." }, { status: 503, headers: privateResponseHeaders })
    }
    return reply({}, 503)
  }
}

async function applyCancellation(result: {
  providerOperationId?: string
  idempotencyKey?: string
  stripeSubscriptionId?: string
}, cancel: boolean) {
  if (!result.stripeSubscriptionId || !result.idempotencyKey || !result.providerOperationId) {
    return NextResponse.json({ status: "ok", message: "The request is recorded. Provider cancellation stays pending while Stripe is disabled." }, { headers: privateResponseHeaders })
  }
  const provider = paymentProvider()
  const updated = await provider.setCancelAtPeriodEnd({
    id: result.stripeSubscriptionId,
    idempotencyKey: result.idempotencyKey,
    cancel,
  })
  await backend().rpc("guard_record_provider_refs_v1", {
    p_operation: result.providerOperationId, p_object_id: updated.id, p_object_type: "subscription", p_status: updated.status,
  })
  return NextResponse.json({
    status: "ok",
    message: cancel
      ? "Cancellation is scheduled at period end. Already-paid service continues until paid-through."
      : "The scheduled cancellation was reversed for this location only.",
  }, { headers: privateResponseHeaders })
}

async function beginCheckout(origin: string, result: {
  providerOperationId?: string
  idempotencyKey?: string
  stripeCustomerId?: string
  stripePriceId?: string
  stripeSubscriptionId?: string
  customerId?: string
  serviceOrderId?: string
  guardCoverageId?: string
  guardSubscriptionId?: string
  priceVersionId?: string
  continuationId?: string
  mode?: string
}) {
  const provider = paymentProvider()
  const stripeCustomer = result.stripeCustomerId || await ensureCustomer(result.customerId || "")
  const successUrl = `${origin}/pay/return`
  const cancelUrl = `${origin}/pay/return`
  const metadata = {
    customerId: result.customerId || "",
    serviceOrderId: result.serviceOrderId || "",
    guardSubscriptionId: result.guardSubscriptionId || "",
    priceVersionId: result.priceVersionId,
    guardCoverageId: result.guardCoverageId,
    continuationId: result.continuationId,
    providerOperationId: result.providerOperationId,
  }
  const checkout = result.mode === "setup"
    ? await provider.createSetupCheckout({
      idempotencyKey: result.idempotencyKey || "",
      stripeCustomerId: stripeCustomer,
      successUrl,
      cancelUrl,
      metadata: {
        customerId: metadata.customerId,
        serviceOrderId: metadata.serviceOrderId,
        providerOperationId: metadata.providerOperationId,
      },
    })
    : await provider.createSubscriptionCheckout({
      idempotencyKey: result.idempotencyKey || "",
      stripeCustomerId: stripeCustomer,
      stripePriceId: result.stripePriceId || "",
      successUrl,
      cancelUrl,
      metadata,
    })
  await backend().rpc("guard_record_provider_refs_v1", {
    p_operation: result.providerOperationId, p_object_id: checkout.id, p_object_type: "checkout.session",
  })
  return NextResponse.json({
    status: "ok",
    checkoutUrl: checkout.url,
    mode: checkout.mode,
    confirming: true,
    message: "Returning from Stripe does not start Guard billing. A confirmed invoice payment is required.",
  }, { headers: privateResponseHeaders })
}

async function ensureCustomer(customerId: string): Promise<string> {
  const prepared = await backend().rpc<{
    status?: string
    stripeCustomerId?: string
    providerOperationId?: string
    idempotencyKey?: string
  }>("payment_prepare_customer_v1", { p_customer: customerId })
  if (prepared.stripeCustomerId) return prepared.stripeCustomerId
  const created = await paymentProvider().createCustomer({
    idempotencyKey: prepared.idempotencyKey || "",
    customerId,
  })
  const mapped = await backend().rpc<{ status?: string; stripeCustomerId?: string }>("payment_record_customer_map_v1", {
    p_operation: prepared.providerOperationId, p_stripe_customer_id: created.id,
  })
  if (mapped.status !== "success" || !mapped.stripeCustomerId) throw new PaymentsDisabledError("Stripe customer mapping was rejected.")
  return mapped.stripeCustomerId
}
