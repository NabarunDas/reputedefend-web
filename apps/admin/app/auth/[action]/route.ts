import { NextRequest, NextResponse } from "next/server"
import { ADMIN_EMAIL, authConfig, challengeCookie, cookieOptions, sessionCookie } from "@/lib/auth/config"
import { backend, newToken, tokenHash, validToken } from "@/lib/auth/backend"
import { privateResponseHeaders } from "@/lib/access"

export const runtime = "nodejs"
const reply = (message: string, status = 200) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params
  if (!["send", "verify", "logout", "logout-all"].includes(action)) return reply("Page not found.", 404)
  const config = authConfig()
  if (!config) return reply("Sign-in is not available. Please check the admin setup.", 503)
  // Exact configured origin; never trust forwarded host headers or user-supplied redirects.
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Please reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Please reload this page and try again.", 415)
  try {
    // Bounded streamed read, including requests that omit Content-Length.
    let raw = ""
    const reader = request.body?.getReader()
    if (reader) {
      const decoder = new TextDecoder()
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 1024) { await reader.cancel(); return reply("That request is too large.", 413) }
        raw += decoder.decode(value, { stream: true })
      }
      raw += decoder.decode()
    }
    let body: { code?: unknown }
    try { body = JSON.parse(raw || "{}") } catch { return reply("Please check the code and try again.", 400) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Please check the code and try again.", 400)
    const service = backend()
    if (action === "send") {
      const challenge = newToken()
      const allowed = await service.rpc<string | null>("admin_begin_otp_v1", { p_hash: tokenHash(challenge) })
      if (!allowed) return reply("We can’t send another code yet. Wait a minute and try again. If this continues, check the admin setup.", 429)
      const { error } = await service.identity.auth.signInWithOtp({ email: ADMIN_EMAIL, options: { shouldCreateUser: false } })
      if (error) return reply("We couldn’t send your code. Wait a minute and try again.", 503)
      const response = reply("Your code has been sent. Check the admin inbox and enter the six-digit code below.")
      response.cookies.set(challengeCookie, challenge, { ...cookieOptions, maxAge: 600 })
      return response
    }
    if (action === "verify") {
      const challenge = request.cookies.get(challengeCookie)?.value
      if (!validToken(challenge) || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) return reply("Enter the six-digit code from your latest email.", 400)
      const uid = await service.rpc<string | null>("admin_attempt_otp_v1", { p_hash: tokenHash(challenge) })
      if (!uid) return reply("This code request has expired or reached its attempt limit. Request a new code.", 429)
      const { data, error } = await service.identity.auth.verifyOtp({ email: ADMIN_EMAIL, token: body.code, type: "email" })
      if (error || !data.session || !data.user) return reply("That code didn’t work. Check your latest email and try again.", 401)
      // The provider tokens never leave this server or enter our database.
      const revoked = await service.revokeProviderSession(data.session.access_token)
      if (revoked.error) return reply("We couldn’t complete sign-in. Please request a new code.", 503)
      if (data.user.id !== uid || data.user.email?.toLowerCase() !== ADMIN_EMAIL || !data.user.email_confirmed_at) return reply("This account cannot access the admin workspace.", 403)
      const token = newToken()
      const success = await service.rpc<boolean>("admin_finish_otp_v1", { p_challenge: tokenHash(challenge), p_token: tokenHash(token), p_user: uid })
      if (!success) return reply("This code request has expired. Please request a new code.", 401)
      const response = reply("You’re signed in.")
      response.cookies.set(sessionCookie, token, { ...cookieOptions, maxAge: 43200 })
      response.cookies.set(challengeCookie, "", { ...cookieOptions, maxAge: 0 })
      return response
    }
    const token = request.cookies.get(sessionCookie)?.value
    if (validToken(token)) {
      const revoked = await service.rpc<boolean>("admin_revoke_sessions_v1", { p_token: tokenHash(token), p_all: action === "logout-all" })
      if (action === "logout-all" && !revoked) return reply("Your session has expired. Sign in again to sign out all devices.", 401)
    } else if (action === "logout-all") return reply("Please sign in again.", 401)
    const response = reply("You’re signed out.")
    response.cookies.set(sessionCookie, "", { ...cookieOptions, maxAge: 0 })
    response.cookies.set(challengeCookie, "", { ...cookieOptions, maxAge: 0 })
    return response
  } catch {
    // No raw provider errors, tokens, codes or request bodies in responses/logs.
    return reply("We couldn’t complete that request. Please try again shortly.", 503)
  }
}
