import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { confirmedReplyMailbox } from "../communications/brand-email"
import { devCaseJourneyPreviewEnabled } from "./gate"
import { evidenceWording } from "./wording-text"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

function mapStatus(status: string | undefined): number {
  switch (status) {
    case "success": return 200
    case "unauthorized": return 401
    case "conflict": return 409
    case "denied": return 403
    case "invalid": return 400
    default: return 503
  }
}

/**
 * Saves staff wording on an unlocked evidence-request draft.
 * DEV/develop preview only. The recipient, sender and upload link stay on the server.
 */
export async function journeyWordingCommand(request: NextRequest) {
  if (!devCaseJourneyPreviewEnabled()) return reply("Unavailable.", 404)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const requestOrigin = request.nextUrl.origin
  if (request.headers.get("origin") !== requestOrigin || !config.allowedOrigins.includes(requestOrigin)) {
    return reply("Reload this page and try again.", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw || "{}") } catch { return reply("Please check the form and try again.", 400) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Check the fields before saving.", 400)
    const record = body as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length !== 4 || !["communicationId", "version", "subject", "message"].every(name => Object.hasOwn(record, name))) {
      return reply("Check the fields before saving.", 400)
    }
    if (!isUuid(record.communicationId) || typeof record.version !== "number" || !Number.isInteger(record.version) || record.version < 1) {
      return reply("Check the fields before saving.", 400)
    }
    if (typeof record.subject !== "string" || typeof record.message !== "string") return reply("Check the fields before saving.", 400)
    const wording = evidenceWording(record.subject, record.message)
    if (!wording) return reply("Use plain wording. Leave out links, and keep the upload link unchanged.", 400)
    const result = await backend().rpc<{ status?: string; id?: string; version?: number }>("admin_communication_revise_evidence_draft_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_communication: record.communicationId,
      p_version: record.version,
      p_subject: wording.subject,
      p_body: wording.message,
      p_reply_to: confirmedReplyMailbox() ?? "",
    })
    if (result?.status === "success") {
      return reply("The wording was saved. The email has not been sent.", 200, { id: result.id, version: result.version })
    }
    if (result?.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (result?.status === "conflict") return reply("That email changed. Reload the page and try again.", 409)
    if (result?.status === "denied") return reply("That draft cannot be changed.", 403)
    if (result?.status === "invalid") return reply("Use plain wording. Leave out links, and keep the upload link unchanged.", 400)
    return reply("The wording could not be saved.", mapStatus(result?.status))
  } catch {
    return reply("The wording could not be saved. Reload the page before trying again.", 503)
  }
}
