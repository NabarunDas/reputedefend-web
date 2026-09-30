import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, newToken, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { LOST_QUOTE_LINK_NOTE } from "./model"
import { catalogueArgs, isCatalogueOperation, isQuoteOperation, quoteArgs } from "./validation"

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
  if (status === "conflict") return "That commercial record changed. Reload the page and try again."
  if (status === "denied") return "That commercial action is not allowed."
  if (status === "invalid") return "Check the fields before saving."
  if (status === "reauth_required") return "Sign in again within the last five minutes to approve a price."
  return "The commercial record could not be updated."
}

async function guard(request: NextRequest) {
  const config = authConfig()
  if (!config) return { error: reply("The workspace is unavailable. Please try again shortly.", 503) }
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return { error: reply("Reload this page and try again.", 403) }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return { error: reply("Reload this page and try again.", 415) }
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  if (!validToken(token)) return { error: reply("Please sign in again.", 401) }
  if (!isUuid(key)) return { error: reply("Reload the form and try again.", 400) }
  return { config, token, key }
}

export async function catalogueCommand(request: NextRequest): Promise<NextResponse> {
  const gated = await guard(request)
  if ("error" in gated && gated.error) return gated.error
  try {
    const parsed = await readJson(request)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    const operation = body && typeof body === "object" && !Array.isArray(body) ? (body as { operation?: unknown }).operation : null
    if (typeof operation !== "string" || !isCatalogueOperation(operation)) {
      return reply("Check the fields before saving.", 400)
    }
    const args = catalogueArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    const version = "version" in args ? args.version : null
    const payload = { ...args }
    delete (payload as { version?: number }).version
    const result = await backend().rpc<{ status?: string; id?: string; version?: number }>("admin_catalogue_command_v1", {
      p_token: tokenHash(gated.token), p_request: gated.key, p_operation: operation, p_payload: payload, p_version: version,
    })
    if (result.status !== "success") return reply(commandMessage(result.status), mapStatus(result.status))
    return reply(
      operation === "approve_price_version" ? "The price version is approved. Existing quotes are unchanged."
        : operation === "retire_price_version" ? "The price version is retired. Existing quotes and orders are unchanged."
        : "A draft price version was created. It is not current until approved.",
      200, { id: result.id, version: result.version },
    )
  } catch {
    return reply("We couldn’t confirm the catalogue change. Reload the page before trying again.", 503)
  }
}

export async function quoteCommand(request: NextRequest): Promise<NextResponse> {
  const gated = await guard(request)
  if ("error" in gated && gated.error) return gated.error
  try {
    const parsed = await readJson(request)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    const operation = body && typeof body === "object" && !Array.isArray(body) ? (body as { operation?: unknown }).operation : null
    if (typeof operation !== "string" || !isQuoteOperation(operation)) {
      return reply("Check the fields before saving.", 400)
    }
    const args = quoteArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    const issuesLink = operation === "create_quote_acceptance_action"
    if (issuesLink && !gated.config.customerOrigin) return reply("The customer site origin is not configured.", 503)
    const secret = issuesLink ? newToken() : ""
    const version = "version" in args ? args.version : null
    const payload: Record<string, unknown> = { ...args }
    delete payload.version
    if (issuesLink) payload.secretHash = tokenHash(secret)
    const result = await backend().rpc<{
      status?: string; id?: string; version?: number; quoteVersionId?: string; expiresAt?: string; publicRef?: string; replay?: boolean
    }>("admin_quote_command_v1", {
      p_token: tokenHash(gated.token), p_request: gated.key, p_operation: operation, p_payload: payload, p_version: version,
    })
    if (result.status !== "success") return reply(commandMessage(result.status), mapStatus(result.status))
    const issued = issuesLink && result.replay !== true && result.id && gated.config.customerOrigin
    return reply(
      issued ? `The secure customer quote action is ready. ${LOST_QUOTE_LINK_NOTE}`
        : issuesLink ? "This quote action was already created. The secret cannot be shown again."
        : operation === "offer" ? "The quote version is offered. It cannot be edited in place."
        : "The quote record has been updated. This does not take payment.",
      200,
      issued ? { id: result.id, actionUrl: `${gated.config.customerOrigin}/action/${result.id}#t=${secret}`, expiresAt: result.expiresAt, quoteVersionId: result.quoteVersionId }
        : { id: result.id, version: result.version, quoteVersionId: result.quoteVersionId, publicRef: result.publicRef },
    )
  } catch {
    return reply("We couldn’t confirm the quote change. Reload the page before trying again.", 503)
  }
}
