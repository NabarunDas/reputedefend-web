import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, newToken, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { isGuardOperation, guardArgs } from "./validation"

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

function commandMessage(status: string | undefined, reason?: string): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That Guard record changed. Reload the page and try again."
  if (status === "reauth_required") return "Sign in again within the last five minutes to activate Guard."
  if (status === "invalid") return "Check the fields before saving."
  if (status === "denied" && reason === "paid_not_ready") return "Payment entitlement is present but Guard cannot activate yet. An urgent exception was recorded."
  if (status === "denied") return "That Guard action is not allowed."
  return "The Guard record could not be updated."
}

export async function guardCommand(request: NextRequest): Promise<NextResponse> {
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
    if (typeof operation !== "string" || !isGuardOperation(operation)) return reply("Check the fields before saving.", 400)
    const args = guardArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    const issuesLink = operation === "issue_permission_action"
    if (issuesLink && !config.customerOrigin) return reply("The customer site origin is not configured.", 503)
    const secret = issuesLink ? newToken() : ""
    const version = "version" in args ? args.version : null
    const payload: Record<string, unknown> = { ...args }
    delete payload.version
    if (issuesLink) payload.secretHash = tokenHash(secret)
    const result = await backend().rpc<{
      status?: string; id?: string; version?: number; expiresAt?: string; replay?: boolean
      exceptionId?: string; reason?: string; activatedAt?: string; offerId?: string
    }>("admin_guard_command_v1", {
      p_token: tokenHash(token), p_request: key, p_operation: operation, p_payload: payload, p_version: version,
    })
    if (result.status !== "success") return reply(commandMessage(result.status, result.reason), mapStatus(result.status), {
      ...(result.exceptionId ? { exceptionId: result.exceptionId } : {}),
    })
    const issued = issuesLink && result.replay !== true && result.id && config.customerOrigin
    return reply(
      issued ? "The secure Guard permission action is ready. Copy the customer link now; the secret cannot be shown again."
        : issuesLink ? "This Guard permission action was already created. The secret cannot be shown again."
        : operation === "activate" ? "Guard is active for this location. Twice-daily checks are not generated yet."
        : operation === "create_direct_coverage" ? "Direct Guard coverage was created. Billing stays pending until Step 16."
        : operation === "create_included_offer" ? "The included 30-day Guard offer is recorded. The customer must still accept it."
        : "The Guard record has been updated. This does not take payment or start live monitoring.",
      200,
      issued ? { id: result.id, actionUrl: `${config.customerOrigin}/action/${result.id}#t=${secret}`, expiresAt: result.expiresAt }
        : { id: result.id, version: result.version, exceptionId: result.exceptionId, activatedAt: result.activatedAt, offerId: result.offerId },
    )
  } catch {
    return reply("We couldn’t confirm the Guard change. Reload the page before trying again.", 503)
  }
}
