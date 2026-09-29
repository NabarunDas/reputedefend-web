import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { inboundMailDomain } from "./gate"

const reply = (message: string, status = 200, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest): Promise<{ body: unknown } | NextResponse> {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 16384) { await reader.cancel(); return reply("That request is too large.", 413) }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return { body: JSON.parse(raw || "{}") } } catch { return reply("Please check the form and try again.", 400) }
}

const operations = [
  "link_case", "unlink_case", "assign", "unassign", "close", "reopen", "attention",
  "phone_note", "contact_recovery", "draft_reply", "promote_attachment",
] as const

const messages: Record<string, string> = {
  link_case: "The conversation was linked to the case. The sender is not verified by that action.",
  unlink_case: "The conversation was unlinked. The original messages are still here.",
  assign: "The conversation was assigned.",
  unassign: "The conversation was unassigned.",
  close: "The conversation was closed.",
  reopen: "The conversation was reopened.",
  attention: "The conversation attention flag was updated.",
  phone_note: "The phone note was recorded and cannot be edited.",
  contact_recovery: "A contact recovery task was created. The customer email was not changed.",
  draft_reply: "A conversation reply was drafted. It has not been sent.",
  promote_attachment: "The attachment was recorded for evidence follow-up. It is not accepted evidence.",
}

export async function conversationsCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const parsed = await readJson(request)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { operation?: unknown }).operation !== "string") {
      return reply("Check the fields before saving.", 400)
    }
    const operation = (body as { operation: string }).operation
    if (!(operations as readonly string[]).includes(operation)) return reply("Check the fields before saving.", 400)
    const payload: Record<string, unknown> = { ...(body as Record<string, unknown>) }
    delete payload.operation
    delete payload.version
    delete payload.inboundDomain
    delete payload.replyTo
    delete payload.inReplyTo
    delete payload.referencesHeader
    if (operation === "draft_reply") {
      const domain = inboundMailDomain()
      if (!domain) return reply("The inbound mail subdomain is not configured.", 503)
      payload.inboundDomain = domain
    }
    const version = (body as { version?: unknown }).version
    if (operation !== "phone_note" && (typeof version !== "number" || !Number.isInteger(version) || version < 1)) {
      return reply("Check the fields before saving.", 400)
    }
    const result = await backend().rpc<{ status?: string }>("admin_conversation_command_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_operation: operation,
      p_payload: payload,
      p_version: typeof version === "number" ? version : null,
    })
    if (result?.status === "success") return reply(messages[operation], 200)
    if (result?.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (result?.status === "conflict") return reply("That conversation changed. Reload the page and try again.", 409)
    if (result?.status === "denied") return reply("That conversation cannot be changed that way.", 403)
    return reply("We couldn’t save that conversation.", result?.status === "invalid" ? 400 : 503)
  } catch {
    return reply("We couldn’t confirm the change. Reload the page before trying again.", 503)
  }
}
