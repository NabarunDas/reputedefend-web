import { NextRequest, NextResponse } from "next/server"
import { ACTION_UNAVAILABLE, privateResponseHeaders } from "@/lib/access"
import { backend, newToken, tokenHash, validToken } from "@/lib/backend"
import { cookieOptions, customerConfig, pendingCookie, sessionCookie } from "@/lib/config"
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
  const config = customerConfig()
  return !!config && request.headers.get("origin") === config.origin && request.nextUrl.origin === config.origin
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
  if (!config || !originOk(request)) return reply()
  const pending = request.cookies.get(pendingCookie)?.value
  if (!validToken(pending)) return reply()
  try {
    const started = await backend().rpc<{ status?: string; email?: string; maskedEmail?: string }>("customer_action_begin_otp_v1", { p_pending_hash: tokenHash(pending) })
    if (started.status === "rate_limited") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 429, headers: privateResponseHeaders })
    if (started.status !== "ok" || !started.email || started.email.toLowerCase() === "admin@profilerelaunch.com") return reply()
    const service = backend()
    const created = await service.database.auth.admin.createUser({ email: started.email, email_confirm: false })
    if (created.error && !/already|registered|exists/i.test(created.error.message)) return reply({}, 503)
    const { error } = await service.identity.auth.signInWithOtp({ email: started.email, options: { shouldCreateUser: false } })
    if (error) return reply({}, 503)
    return NextResponse.json({ status: "ok", maskedEmail: started.maskedEmail }, { headers: privateResponseHeaders })
  } catch { return reply() }
}

export async function verifyOtp(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply()
  const pending = request.cookies.get(pendingCookie)?.value
  const body = await readJson(request, 1024)
  if (!validToken(pending) || !body || typeof body.code !== "string" || !/^\d{6}$/.test(body.code) || Object.keys(body).some(key => key !== "code")) return reply()
  try {
    const allowed = await backend().rpc<{ status?: string; email?: string }>("customer_action_attempt_otp_v1", { p_pending_hash: tokenHash(pending) })
    if (allowed.status !== "ok" || !allowed.email) return reply()
    const service = backend()
    const { data, error } = await service.identity.auth.verifyOtp({ email: allowed.email, token: body.code, type: "email" })
    if (error || !data.session || !data.user?.id || data.user.email?.toLowerCase() !== allowed.email || !data.user.email_confirmed_at) return reply()
    await service.revokeProviderSession(data.session.access_token)
    const token = newToken()
    const finished = await service.rpc<{ status?: string }>("customer_action_finish_otp_v1", {
      p_pending_hash: tokenHash(pending), p_session_hash: tokenHash(token), p_auth_user: data.user.id, p_email: allowed.email,
    })
    if (finished.status !== "ok") return reply()
    const session = await service.rpc<Record<string, unknown> | null>("customer_action_session_v1", { p_token_hash: tokenHash(token) })
    const response = NextResponse.json({ status: "ok", session }, { headers: privateResponseHeaders })
    response.cookies.set(sessionCookie, token, { ...cookieOptions, maxAge: 900 })
    response.cookies.set(pendingCookie, "", { ...cookieOptions, maxAge: 0 })
    return response
  } catch { return reply() }
}

export async function command(request: NextRequest) {
  const config = customerConfig()
  if (!config || !originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply()
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  const body = await readJson(request, 2048)
  if (!validToken(token) || !isUuid(key) || !body || typeof body.operation !== "string" || !["accept", "decline", "revoke"].includes(body.operation)) return reply()
  const operation = body.operation
  const data = operation === "accept" ? { accepted: body.accepted === true } : operation === "revoke" ? { confirmed: body.confirmed === true } : {}
  if (operation === "accept" && body.accepted !== true) return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
  try {
    const result = await backend().rpc<{ status?: string }>("customer_action_command_v1", {
      p_token_hash: tokenHash(token), p_request: key, p_operation: operation, p_data: data,
    })
    if (result.status === "invalid") return NextResponse.json({ message: ACTION_UNAVAILABLE }, { status: 400, headers: privateResponseHeaders })
    if (result.status !== "success") return reply()
    return NextResponse.json({ status: "ok", message: "This action is complete." }, { headers: privateResponseHeaders })
  } catch { return reply() }
}
