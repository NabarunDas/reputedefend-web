import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, privateResponseHeaders } from "@/lib/access"
import { backend, newToken, tokenHash, validToken } from "@/lib/backend"
import { cookieOptions, customerConfig, pendingCookie, sessionCookie, customerRequestOriginAllowed } from "@/lib/config"
import { validCustomerOtp } from "@/lib/otp"
import { CUSTOMER_ADMIN_EMAIL, ensureCustomerAuthIdentity } from "./identity"
import { isUuid } from "../uuid"

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

function jsonRequest(request: NextRequest) {
  return request.headers.get("content-type")?.split(";")[0] === "application/json"
}

function exactKeys(body: Record<string, unknown>, allowed: string[]) {
  const keys = Object.keys(body)
  return keys.length === allowed.length && allowed.every(key => keys.includes(key))
}

export async function exchange(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply()
  const body = await readJson(request, 2048)
  if (!body || !isUuid(body.actionId) || typeof body.secret !== "string" || !validToken(body.secret) || Object.keys(body).some(key => !["actionId", "secret"].includes(key))) {
    return reply()
  }
  try {
    const pending = newToken()
    const result = await backend().rpc<{ status?: string; maskedEmail?: string; kind?: string }>("customer_action_exchange_v1", {
      p_action: body.actionId, p_secret_hash: tokenHash(body.secret), p_pending_hash: tokenHash(pending),
    })
    if (result.status !== "ok") return reply()
    const response = NextResponse.json({ status: "ok", maskedEmail: result.maskedEmail, kind: result.kind }, { headers: privateResponseHeaders })
    response.cookies.set(pendingCookie, pending, { ...cookieOptions, maxAge: 600 })
    response.cookies.set(sessionCookie, "", { ...cookieOptions, maxAge: 0 })
    return response
  } catch { return reply() }
}

export async function sendOtp(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || !jsonRequest(request)) return reply()
  const body = await readJson(request, 256)
  if (!body || !exactKeys(body, [])) return reply()
  const pending = request.cookies.get(pendingCookie)?.value
  if (!validToken(pending)) return reply()
  try {
    const started = await backend().rpc<{ status?: string; email?: string; maskedEmail?: string }>("customer_action_begin_otp_v1", { p_pending_hash: tokenHash(pending) })
    if (started.status === "rate_limited") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 429, headers: privateResponseHeaders })
    if (started.status !== "ok" || !started.email || started.email.toLowerCase() === CUSTOMER_ADMIN_EMAIL) return reply()
    const service = backend()
    if (!await ensureCustomerAuthIdentity(service.database.auth.admin, started.email)) return reply({}, 503)
    const { error } = await service.identity.auth.signInWithOtp({ email: started.email, options: { shouldCreateUser: false } })
    if (error) return reply({}, 503)
    const confirmed = await service.rpc<{ status?: string }>("customer_action_confirm_otp_sent_v1", { p_pending_hash: tokenHash(pending) })
    if (confirmed.status !== "ok") return reply()
    return NextResponse.json({ status: "ok", maskedEmail: started.maskedEmail }, { headers: privateResponseHeaders })
  } catch { return reply() }
}

export async function verifyOtp(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || !jsonRequest(request)) return reply()
  const pending = request.cookies.get(pendingCookie)?.value
  const body = await readJson(request, 1024)
  if (!validToken(pending) || !body || !exactKeys(body, ["code"]) || !validCustomerOtp(body.code)) return reply()
  try {
    const allowed = await backend().rpc<{ status?: string; email?: string }>("customer_action_attempt_otp_v1", { p_pending_hash: tokenHash(pending) })
    if (allowed.status !== "ok" || !allowed.email) return reply()
    const service = backend()
    const { data, error } = await service.identity.auth.verifyOtp({ email: allowed.email, token: body.code, type: "email" })
    if (error || !data.session || !data.user?.id || data.user.email?.toLowerCase() !== allowed.email || !data.user.email_confirmed_at) return reply()
    const revoked = await service.revokeProviderSession(data.session.access_token)
    if (!revoked || revoked.error) return reply()
    const token = newToken()
    const finished = await service.rpc<{ status?: string }>("customer_action_finish_otp_v1", {
      p_pending_hash: tokenHash(pending), p_session_hash: tokenHash(token), p_auth_user: data.user.id, p_email: allowed.email,
    })
    if (finished.status !== "ok") return reply()
    const session = await service.rpc<Record<string, unknown> | null>("customer_action_session_v1", { p_token_hash: tokenHash(token) })
    if (!session) {
      const failed = reply()
      failed.cookies.set(pendingCookie, "", { ...cookieOptions, maxAge: 0 })
      return failed
    }
    const response = NextResponse.json({ status: "ok", session }, { headers: privateResponseHeaders })
    response.cookies.set(sessionCookie, token, { ...cookieOptions, maxAge: 900 })
    response.cookies.set(pendingCookie, "", { ...cookieOptions, maxAge: 0 })
    return response
  } catch { return reply() }
}

export async function command(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || !jsonRequest(request)) return reply()
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  const body = await readJson(request, 2048)
  if (!validToken(token) || !isUuid(key) || !body || typeof body.operation !== "string" || !["accept", "decline", "revoke"].includes(body.operation)) return reply()
  const operation = body.operation
  const acceptKeys = ["operation", "accepted", "permissionVersion", "consentVersion"]
  if (operation === "accept") {
    const keys = Object.keys(body)
    if (body.accepted !== true || !keys.includes("operation") || !keys.includes("accepted") || keys.some(key => !acceptKeys.includes(key))) {
      return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
    }
  }
  if (operation === "decline" && !exactKeys(body, ["operation"])) return reply()
  if (operation === "revoke" && (!exactKeys(body, ["operation", "confirmed"]) || body.confirmed !== true)) {
    return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
  }
  const data = operation === "accept"
    ? {
      accepted: true,
      ...(typeof body.permissionVersion === "string" ? { permissionVersion: body.permissionVersion } : {}),
      ...(typeof body.consentVersion === "string" ? { consentVersion: body.consentVersion } : {}),
    }
    : operation === "revoke" ? { confirmed: true } : {}
  try {
    const result = await backend().rpc<{
      status?: string
      providerOperationId?: string
      idempotencyKey?: string
      stripeSubscriptionId?: string
      subscriptionItemId?: string
      newStripePriceId?: string
      oldStripePriceId?: string
      periodEnd?: string
      cancelAtPeriodEnd?: boolean
      unapplied?: boolean
      providerOperationStatus?: string
      stripeCustomerId?: string
      scheduleId?: string
    }>("customer_action_command_v1", {
      p_token_hash: tokenHash(token), p_request: key, p_operation: operation, p_data: data,
    })
    if (result.status === "invalid") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
    if (result.status !== "success") return reply()
    if (operation === "accept" && result.providerOperationId && result.stripeSubscriptionId && result.newStripePriceId && !result.unapplied) {
      const { guardSubscriptionsEnabled } = await import("../../../../lib/guard-billing/config")
      if (guardSubscriptionsEnabled() && result.subscriptionItemId && result.oldStripePriceId && result.periodEnd
        && result.providerOperationStatus !== "SUCCEEDED") {
        const { paymentProvider } = await import("../../../../lib/payments")
        const periodEnd = Math.floor(Date.parse(result.periodEnd) / 1000)
        if (Number.isFinite(periodEnd)) {
          const provider = paymentProvider()
          const current = await provider.retrieveSubscription(result.stripeSubscriptionId)
          if (current?.scheduleId) {
            await backend().rpc("guard_record_price_schedule_v1", {
              p_operation: result.providerOperationId,
              p_schedule_id: current.scheduleId,
              p_subscription_item_id: result.subscriptionItemId,
            })
          } else {
            const schedule = await provider.createSubscriptionSchedule({
              idempotencyKey: result.idempotencyKey || key,
              subscriptionId: result.stripeSubscriptionId,
              subscriptionItemId: result.subscriptionItemId,
              currentPriceId: result.oldStripePriceId,
              nextPriceId: result.newStripePriceId,
              periodEnd,
              customerId: result.stripeCustomerId,
            })
            await backend().rpc("guard_record_price_schedule_v1", {
              p_operation: result.providerOperationId,
              p_schedule_id: schedule.id,
              p_subscription_item_id: result.subscriptionItemId,
            })
          }
        }
      }
    }
    return NextResponse.json({ status: "ok", message: "This action is complete." }, { headers: privateResponseHeaders })
  } catch { return reply() }
}
