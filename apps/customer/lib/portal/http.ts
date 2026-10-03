import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, newToken, tokenHash, validToken } from "@/lib/backend"
import { CUSTOMER_ADMIN_EMAIL, ensureCustomerAuthIdentity } from "@/lib/action/identity"
import { customerConfig } from "@/lib/config"
import {
  PORTAL_EMAIL_INVALID,
  PORTAL_LOGIN_MESSAGE,
  PORTAL_UNAVAILABLE,
  PORTAL_VERIFY_ERROR,
  normalizePortalEmail,
} from "./email"
import {
  PORTAL_PENDING_SECONDS,
  PORTAL_SESSION_SECONDS,
  portalAvailable,
  portalCookieOptions,
  portalPendingCookieName,
  portalSessionCookieName,
} from "./config"

const refused = (http = 401) =>
  NextResponse.json({ message: PORTAL_UNAVAILABLE }, { status: http, headers: privateResponseHeaders })

const loginAccepted = () =>
  NextResponse.json({ message: PORTAL_LOGIN_MESSAGE }, { status: 200, headers: privateResponseHeaders })

const verifyDenied = () =>
  NextResponse.json({ message: PORTAL_VERIFY_ERROR }, { status: 401, headers: privateResponseHeaders })

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

function jsonRequest(request: NextRequest) {
  return request.headers.get("content-type")?.split(";")[0] === "application/json"
}

function exactKeys(body: Record<string, unknown>, allowed: string[]) {
  const keys = Object.keys(body)
  return keys.length === allowed.length && allowed.every(key => keys.includes(key))
}

function withPending(response: NextResponse, pending: string) {
  response.cookies.set(portalPendingCookieName(), pending, { ...portalCookieOptions(), maxAge: PORTAL_PENDING_SECONDS })
  return response
}

function clearPortalCookies(response: NextResponse) {
  const options = portalCookieOptions()
  response.cookies.set(portalSessionCookieName(), "", { ...options, maxAge: 0 })
  response.cookies.set(portalPendingCookieName(), "", { ...options, maxAge: 0 })
  return response
}

type LoginStart = { status?: string; email?: string; customerId?: string }

async function sendTrustedOtp(email: string, pendingHash: string) {
  if (!email || email.toLowerCase() === CUSTOMER_ADMIN_EMAIL) return
  const service = backend()
  if (!await ensureCustomerAuthIdentity(service.database.auth.admin, email)) return
  const { error } = await service.identity.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (error) return
  await service.rpc("customer_portal_confirm_otp_sent_v1", { p_pending_hash: pendingHash })
}

export async function startLogin(request: NextRequest) {
  if (!portalAvailable()) return refused(404)
  if (!originOk(request) || !jsonRequest(request)) return refused()
  const body = await readJson(request, 2048)
  if (!body || !exactKeys(body, ["email"])) return refused()
  const email = normalizePortalEmail(body.email)
  if (!email) return NextResponse.json({ message: PORTAL_EMAIL_INVALID }, { status: 400, headers: privateResponseHeaders })
  const pending = newToken()
  const response = withPending(loginAccepted(), pending)
  try {
    const started = await backend().rpc<LoginStart>("customer_portal_begin_login_v1", {
      p_email: email, p_pending_hash: tokenHash(pending),
    })
    if (started.status === "ok" && started.email) await sendTrustedOtp(started.email, tokenHash(pending))
  } catch { /* The generic response is already enumeration-safe. */ }
  return response
}

export async function resendLogin(request: NextRequest) {
  if (!portalAvailable()) return refused(404)
  if (!originOk(request) || !jsonRequest(request)) return refused()
  const body = await readJson(request, 256)
  if (!body || !exactKeys(body, [])) return refused()
  const pending = request.cookies.get(portalPendingCookieName())?.value
  if (!validToken(pending)) return loginAccepted()
  try {
    const started = await backend().rpc<LoginStart>("customer_portal_begin_resend_v1", { p_pending_hash: tokenHash(pending) })
    if (started.status === "ok" && started.email) await sendTrustedOtp(started.email, tokenHash(pending))
  } catch { /* Same browser response either way. */ }
  return loginAccepted()
}

export async function verifyLogin(request: NextRequest) {
  if (!portalAvailable()) return refused(404)
  if (!originOk(request) || !jsonRequest(request)) return refused()
  const pending = request.cookies.get(portalPendingCookieName())?.value
  const body = await readJson(request, 1024)
  if (!validToken(pending) || !body || !exactKeys(body, ["code"]) || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
    return verifyDenied()
  }
  try {
    const allowed = await backend().rpc<LoginStart>("customer_portal_attempt_otp_v1", { p_pending_hash: tokenHash(pending) })
    if (allowed.status !== "ok" || !allowed.email || allowed.email.toLowerCase() === CUSTOMER_ADMIN_EMAIL) return verifyDenied()
    const service = backend()
    const { data, error } = await service.identity.auth.verifyOtp({ email: allowed.email, token: body.code, type: "email" })
    const user = data?.user
    const authEmail = user?.email
    if (error || !data?.session?.access_token || !user?.id || !authEmail || authEmail.toLowerCase() !== allowed.email || !user.email_confirmed_at) {
      return verifyDenied()
    }
    await service.revokeProviderSession(data.session.access_token)
    const token = newToken()
    if (token === pending) return verifyDenied()
    const finished = await service.rpc<{ status?: string }>("customer_portal_finish_otp_v1", {
      p_pending_hash: tokenHash(pending),
      p_session_hash: tokenHash(token),
      p_auth_user: user.id,
      p_email: authEmail.toLowerCase(),
    })
    if (finished.status !== "ok") return verifyDenied()
    const session = await service.rpc<Record<string, unknown> | null>("customer_portal_session_v1", { p_token_hash: tokenHash(token) })
    if (!session) return verifyDenied()
    const response = NextResponse.json({ status: "ok" }, { headers: privateResponseHeaders })
    response.cookies.set(portalSessionCookieName(), token, { ...portalCookieOptions(), maxAge: PORTAL_SESSION_SECONDS })
    response.cookies.set(portalPendingCookieName(), "", { ...portalCookieOptions(), maxAge: 0 })
    return response
  } catch { return verifyDenied() }
}

export async function signOutPortal(request: NextRequest) {
  if (!originOk(request) || !jsonRequest(request)) return refused()
  const body = await readJson(request, 256)
  if (!body || !exactKeys(body, [])) return refused()
  const token = request.cookies.get(portalSessionCookieName())?.value
  if (customerConfig() && validToken(token)) {
    try { await backend().rpc("customer_portal_sign_out_v1", { p_token_hash: tokenHash(token) }) }
    catch { /* Clearing the cookie is still required. */ }
  }
  return clearPortalCookies(NextResponse.json({ status: "ok" }, { headers: privateResponseHeaders }))
}
