import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { communicationsSendEnabled, sendDisabledReason } from "./gate"
import { prepareCommunicationAccessLink } from "./link"

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

const messages: Record<string, string> = {
  draft: "The communication was drafted. It has not been sent.",
  review: "The communication was marked reviewed.",
  queue: "The communication was queued for the durable email worker.",
  cancel: "The communication was cancelled.",
  resend_draft: "A replacement communication was drafted for the newly verified address.",
}

export async function communicationsCommand(request: NextRequest) {
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
    if (!["draft", "review", "queue", "cancel", "resend_draft"].includes(operation)) return reply("Check the fields before saving.", 400)
    const payload: Record<string, unknown> = { ...(body as Record<string, unknown>) }
    delete payload.operation
    delete payload.version
    if (operation === "draft" || operation === "resend_draft") {
      payload.customerOrigin = config.customerOrigin
      if (operation === "draft" && payload.templateKey === "EVIDENCE_REQUEST" && !config.customerOrigin) {
        return reply("The customer site origin is not configured.", 503)
      }
      if (payload.templateKey === "EVIDENCE_REQUEST" || operation === "resend_draft") {
        const actionId = crypto.randomUUID()
        const prepared = prepareCommunicationAccessLink(actionId)
        if (payload.templateKey === "EVIDENCE_REQUEST" && !prepared) {
          return reply("The secure upload link secret is not configured.", 503)
        }
        if (prepared) {
          payload.actionId = actionId
          payload.secretHash = prepared.tokenHash
        }
      }
    }
    if (operation === "queue") {
      if (!communicationsSendEnabled()) return reply(sendDisabledReason(), 403)
      payload.sendEnabled = true
    }
    const version = (body as { version?: unknown }).version
    if (["review", "queue", "cancel"].includes(operation) && (typeof version !== "number" || !Number.isInteger(version) || version < 1)) {
      return reply("Check the fields before saving.", 400)
    }
    const result = await backend().rpc<{ status?: string }>("admin_communication_command_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_operation: operation,
      p_payload: payload,
      p_version: typeof version === "number" ? version : null,
    })
    if (result?.status === "success") return reply(messages[operation], 200)
    if (result?.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (result?.status === "conflict") return reply("That communication changed. Reload the page and try again.", 409)
    if (result?.status === "denied") return reply("That communication cannot be changed that way.", 403)
    return reply("We couldn’t save that communication.", mapStatus(result?.status))
  } catch {
    return reply("We couldn’t confirm the change. Reload the page before trying again.", 503)
  }
}
