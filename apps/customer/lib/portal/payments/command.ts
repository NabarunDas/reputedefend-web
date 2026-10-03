import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig } from "@/lib/config"
import { openCustomerCheckout, settleRecoveryCancel } from "@/lib/action/payment"
import { PaymentsDisabledError } from "../../../../../lib/payments/provider"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { isUuid } from "@/lib/uuid"

const SIGN_IN = "Sign in again to continue."
const MISSING = "We couldn't find that case."
const UNAVAILABLE = "This payment step is no longer available."
const STALE = "This page is out of date. Refresh it and try again."
const CONFIRM = "Confirm this step before continuing."
const RETRY = "We couldn't complete that step. Please try again shortly."
const NOT_READY = "Payments are not available right now. Refresh the page and try again."
const DISABLED = "Secure Stripe Checkout is not available yet."
const CONFIRMING = "We're confirming your payment."
const CONSENT = "Consent recorded. No fee is due today."
const CANNOT_CLOSE = "The previous payment attempt cannot be closed yet."

const SELECTOR = /^ca-[a-f0-9]{64}$/
const OPERATIONS = ["confirm_consent", "start_checkout"] as const
type Operation = (typeof OPERATIONS)[number]

const reply = (message: string, http = 401) =>
  NextResponse.json({ message }, { status: http, headers: privateResponseHeaders })

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
  const config = customerBackendConfig()
  return !!config && request.headers.get("origin") === config.origin && request.nextUrl.origin === config.origin
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  return Object.keys(body).length === allowed.length && allowed.every(key => Object.hasOwn(body, key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

type PaymentResult = {
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
  paymentIntentId?: string
  reused?: boolean
}

function confirmationFor(operation: Operation, value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (operation === "confirm_consent") {
    if (keys.length !== 1 || keys[0] !== "accepted" || (value as { accepted?: unknown }).accepted !== true) return null
    return { accepted: true }
  }
  if (keys.length !== 0) return null
  return { idempotencyKey: key }
}

async function presentCheckout(response: NextResponse) {
  const payload = await response.json().catch(() => null) as { status?: string; checkoutUrl?: string; message?: string } | null
  if (response.status === 503 && payload?.status === "disabled") {
    return NextResponse.json({ status: "disabled", message: DISABLED }, { status: 503, headers: privateResponseHeaders })
  }
  if (payload?.status === "ok" && typeof payload.checkoutUrl === "string" && payload.checkoutUrl.startsWith("https://")) {
    return NextResponse.json(
      { status: "ok", checkoutUrl: payload.checkoutUrl, confirming: true },
      { headers: privateResponseHeaders },
    )
  }
  return reply(RETRY, 503)
}

function mapStatus(status: string, httpStatus: number) {
  if (status === "not_found") return reply(MISSING, 404)
  if (status === "invalid") return reply(CONFIRM, 400)
  if (status === "conflict") return reply(STALE, 409)
  if (status === "denied" || status === "unavailable") return reply(UNAVAILABLE)
  return reply(RETRY, httpStatus)
}

export async function portalPaymentCommand(request: NextRequest) {
  if (!portalAvailable()) return reply(NOT_READY, 404)
  const config = customerBackendConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply(NOT_READY)
  }
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request, 4096)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  if (!onlyKeys(body, ["reference", "selector", "operation", "confirmation"])) return reply(NOT_READY)
  if (typeof body.reference !== "string" || !isPublicCaseReference(body.reference)) return reply(MISSING, 404)
  if (typeof body.selector !== "string" || !SELECTOR.test(body.selector)) return reply(UNAVAILABLE)
  if (typeof body.operation !== "string" || !(OPERATIONS as readonly string[]).includes(body.operation)) return reply(NOT_READY)
  const operation = body.operation as Operation
  const confirmation = confirmationFor(operation, body.confirmation, key)
  if (!confirmation) return reply(CONFIRM, 400)

  const call = (requestId: string) => backend().rpc<PaymentResult>("customer_portal_payment_command_v1", {
    p_token_hash: tokenHash(token),
    p_request: requestId,
    p_reference: body.reference,
    p_selector: body.selector,
    p_operation: operation,
    p_data: confirmation,
  })

  try {
    const result = await call(key)
    if (result == null) return reply(SIGN_IN)
    if (!isRecord(result) || typeof result.status !== "string") return reply(RETRY, 503)
    if (result.status === "needs_cancel") {
      const cancelled = await settleRecoveryCancel(result)
      if (cancelled === "paid") {
        return NextResponse.json({ status: "ok", confirming: true, message: CONFIRMING }, { headers: privateResponseHeaders })
      }
      if (!cancelled) return reply(CANNOT_CLOSE, 409)
      const retry = await call(crypto.randomUUID())
      if (retry == null) return reply(SIGN_IN)
      if (!isRecord(retry) || retry.status !== "success") return mapStatus(String(retry?.status ?? ""), 503)
      return presentCheckout(await openCustomerCheckout(config.origin, retry))
    }
    if (result.status === "success" && operation === "confirm_consent") {
      return NextResponse.json({ status: "ok", message: CONSENT }, { headers: privateResponseHeaders })
    }
    if (result.status === "success") return presentCheckout(await openCustomerCheckout(config.origin, result))
    return mapStatus(result.status, 503)
  } catch (error) {
    if (error instanceof PaymentsDisabledError) {
      return NextResponse.json({ status: "disabled", message: DISABLED }, { status: 503, headers: privateResponseHeaders })
    }
    return reply(RETRY, 503)
  }
}
