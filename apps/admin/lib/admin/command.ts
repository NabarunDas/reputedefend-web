import "server-only"
import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { authConfig, sessionCookie } from "../auth/config"
import { backend, tokenHash, validToken } from "../auth/backend"
import { privateResponseHeaders } from "../access"

export const commandReply = (message: string, status = 200) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })
export async function revokeSession(request: NextRequest) {
  const config = authConfig()
  if (!config) return commandReply("The admin workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return commandReply("Please reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return commandReply("Please reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  if (!validToken(token)) return commandReply("Please sign in again.", 401)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = "", size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024) { await reader.cancel(); return commandReply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return commandReply("Please choose a session and try again.", 400) }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("sessionId" in body) || typeof body.sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.sessionId)) return commandReply("Please choose a session and try again.", 400)
    // The database revalidates identity, expiry, freshness and target ownership in the same transaction as the write.
    const result = await backend().rpc<string>("admin_revoke_session_v1", { p_token: tokenHash(token), p_target: body.sessionId, p_request: randomUUID() })
    switch (result) {
      case "success": return commandReply("That session has been signed out.")
      case "unauthorized": return commandReply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return commandReply("For security, sign out and sign in with a new email code, then try again within five minutes.", 403)
      case "denied": return commandReply("Use Sign out to end your current session.", 403)
      case "conflict": return commandReply("That session has already ended or is no longer available. Refresh the page to see the latest list.", 409)
      default: return commandReply("We couldn’t complete that request. Please reload the page.", 503)
    }
  } catch { return commandReply("We couldn’t confirm the change. Refresh the page before trying again.", 503) }
}
