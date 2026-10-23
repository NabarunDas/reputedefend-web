import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { mailFromAddress, resolveMailProvider } from "../communications/mail"
import { devCaseJourneyPreviewEnabled } from "./gate"
import { runStaffEmailResend, STAFF_RESEND_NOT_SENT } from "./email-confirmation-resend"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

/** Exceptional confirmation resend. The session is the actor. The address is not verified. */
export async function staffEmailConfirmationCommand(request: NextRequest) {
  if (!devCaseJourneyPreviewEnabled()) return reply("Unavailable.", 404)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const requestOrigin = request.nextUrl.origin
  if (request.headers.get("origin") !== requestOrigin || !config.allowedOrigins.includes(requestOrigin)) {
    return reply("Reload this page and try again.", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  if (!validToken(token)) return reply("Please sign in again.", 401)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) {
        await reader.cancel()
        return reply("That request is too large.", 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Please check the form and try again.", 400)
    const fields = body as Record<string, unknown>
    if (Object.keys(fields).length !== 1 || !isUuid(fields.caseId)) return reply("Please check the form and try again.", 400)
    const provider = resolveMailProvider()
    const result = await runStaffEmailResend({
      database: backend(),
      tokenHash: tokenHash(token),
      caseId: fields.caseId,
      provider: provider === "disabled" ? null : provider,
      fromEmail: mailFromAddress(),
    })
    return reply(result.message, result.sent ? 200 : 400)
  } catch {
    return reply(STAFF_RESEND_NOT_SENT, 503)
  }
}
