import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, newToken, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { LOST_PAYMENT_LINK_NOTE } from "./model"
import { isPaymentOperation, paymentArgs } from "./validation"

const reply = (message: string, status = 200, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit = 16384): Promise<{ body: unknown } | NextResponse> {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return reply("That request is too large.", 413) }
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
    case "reauth_required": return 403
    default: return 503
  }
}

function commandMessage(status: string | undefined): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That payment record changed. Reload the page and try again."
  if (status === "denied") return "That payment action is not allowed."
  if (status === "invalid") return "Check the fields before saving."
  if (status === "reauth_required") return "Sign in again within the last five minutes to approve a success fee."
  return "The payment record could not be updated."
}

export async function paymentCommand(request: NextRequest): Promise<NextResponse> {
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
    const operation = body && typeof body === "object" && !Array.isArray(body) ? (body as { operation?: unknown }).operation : null
    if (typeof operation !== "string" || !isPaymentOperation(operation)) return reply("Check the fields before saving.", 400)
    const args = paymentArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    const issuesLink = operation.startsWith("issue_")
    if (issuesLink && !config.customerOrigin) return reply("The customer site origin is not configured.", 503)
    const secret = issuesLink ? newToken() : ""
    const version = args.version
    const payload: Record<string, unknown> = { ...args }
    delete payload.version
    if (issuesLink) payload.secretHash = tokenHash(secret)
    const result = await backend().rpc<{ status?: string; id?: string; obligationId?: string; expiresAt?: string; replay?: boolean }>("admin_payment_command_v1", {
      p_token: tokenHash(token), p_request: key, p_operation: operation, p_payload: payload, p_version: version,
    })
    if (result.status !== "success") return reply(commandMessage(result.status), mapStatus(result.status))
    const issued = issuesLink && result.replay !== true && result.id && config.customerOrigin
    return reply(
      issued ? `The secure customer payment action is ready. ${LOST_PAYMENT_LINK_NOTE}`
        : issuesLink ? "This payment action was already created. The secret cannot be shown again."
        : operation === "approve_success_fee" ? "The success fee is approved. Collection, if ready, is queued. This did not charge a card from this page."
        : "The payment record has been updated.",
      200,
      issued ? { id: result.id, actionUrl: `${config.customerOrigin}/action/${result.id}#t=${secret}`, expiresAt: result.expiresAt, obligationId: result.obligationId }
        : { id: result.id, obligationId: result.obligationId },
    )
  } catch {
    return reply("We couldn’t confirm the payment change. Reload the page before trying again.", 503)
  }
}
