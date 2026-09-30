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
    : { idempotencyKey: isUuid(body.idempotencyKey) ? body.idempotencyKey : key }
  if (operation === "confirm_consent" && data.accepted !== true) {
    return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
  }
  try {
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
    }>("customer_payment_command_v1", {
      p_token_hash: tokenHash(token), p_request: key, p_operation: operation, p_data: data,
    })
    if (result.status === "invalid") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
    if (result.status !== "success") return reply()
    if (operation === "confirm_consent") {
      return NextResponse.json({ status: "ok", consentId: result.consentId, message: "Consent recorded. No fee is due today." }, { headers: privateResponseHeaders })
    }
    const provider = paymentProvider()
    const stripeCustomer = await ensureCustomer(result.customerId || "")
    const successUrl = `${config.origin}/pay/return`
    const cancelUrl = `${config.origin}/pay/return`
    const checkout = result.mode === "setup"
      ? await provider.createSetupCheckout({
        idempotencyKey: result.idempotencyKey || key,
        stripeCustomerId: stripeCustomer,
        successUrl,
        cancelUrl,
        metadata: { customerId: result.customerId || "", serviceOrderId: result.serviceOrderId || "", orderRef: result.orderRef },
      })
      : await provider.createPaymentCheckout({
        idempotencyKey: result.idempotencyKey || key,
        stripeCustomerId: stripeCustomer,
        amountMinor: result.amountMinor || 0,
        currency: "GBP",
        successUrl,
        cancelUrl,
        metadata: {
          customerId: result.customerId || "",
          serviceOrderId: result.serviceOrderId || "",
          obligationId: result.obligationId,
          attemptId: result.attemptId,
          orderRef: result.orderRef,
        },
      })
    await backend().rpc("payment_record_provider_refs_v1", {
      p_operation: result.providerOperationId, p_object_id: checkout.id, p_object_type: "checkout.session",
    })
    return NextResponse.json({ status: "ok", checkoutUrl: checkout.url, mode: checkout.mode, confirming: true }, { headers: privateResponseHeaders })
  } catch (error) {
    if (error instanceof PaymentsDisabledError) {
      return NextResponse.json({ status: "disabled", message: "Secure Stripe Checkout is not available yet." }, { status: 503, headers: privateResponseHeaders })
    }
    return reply({}, 503)
  }
}

async function ensureCustomer(customerId: string): Promise<string> {
  const provider = paymentProvider()
  const created = await provider.createCustomer({ idempotencyKey: `customer:${customerId}`, customerId })
  const mapped = await backend().rpc<{ status?: string; stripeCustomerId?: string }>("payment_ensure_customer_map_v1", {
    p_customer: customerId, p_stripe_customer_id: created.id,
  })
  return mapped.stripeCustomerId || created.id
}
