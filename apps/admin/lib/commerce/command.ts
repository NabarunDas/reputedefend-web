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
    case "eligibility_blocked": return 409
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

const ELIGIBILITY_BLOCKED = "This quote cannot be issued yet. The purchasing establishment and the country and tax eligibility checks have not cleared a binding paid quote."

/** Staff next steps for reason codes the quote command already returns. Unknown text is never shown. */
const quoteDenialByReason: Record<string, string> = {
  unresolved_establishment: "This quote cannot be offered yet. Record a verified purchasing establishment on the business record. The Google listing country is not that record.",
  conflicting_establishment: "This quote cannot be offered yet. More than one current verified purchasing establishment is on the business record. Review that record before offering.",
  awaiting_confirmation: "This quote cannot be offered yet. Country and tax eligibility is not confirmed for this payer. The offer stays closed until that check clears.",
  tax_determination_mismatch: "This quote cannot be offered yet. The quote tax record does not match the eligibility determination. Do not offer until they agree.",
  vat_threshold: "This quote cannot be offered yet. The seller turnover check has not cleared a binding quote.",
  tax_unconfirmed: "This quote cannot be offered yet. Set the draft tax record before offering. An unconfirmed tax record still blocks an offer.",
  sanctions_blocked: "This quote cannot be offered yet. The purchasing establishment is in a place the commercial check does not allow. Review the business record before offering.",
  subdivision_required: "This quote cannot be offered yet. The purchasing establishment needs a recorded state or province before country and tax eligibility can clear.",
  blocked: "This quote cannot be offered yet. Country and tax eligibility is blocked for this payer. The offer stays closed.",
  expired: "This quote cannot be offered yet. The country and tax eligibility decision has expired. The offer stays closed until a current decision is recorded.",
  review_due: "This quote cannot be offered yet. The country and tax eligibility decision is due for review. The offer stays closed until that review is recorded.",
  stripe_not_ready: "This quote cannot be offered yet. The payment flow for this payer is not ready. The offer stays closed.",
  currency_not_contract: "This quote cannot be offered yet. The quote currency is not the contract currency. The offer stays closed.",
  unknown_service: "This quote cannot be offered yet. The service on this quote is not one the commercial check recognises.",
  pending_review: "This quote cannot be offered yet. The commercial record still needs review before a binding action.",
  exclusive_adds_tax: "This quote cannot be offered yet. The quoted total is the final customer price. Tax cannot be added on top.",
  total_above_gross: "This quote cannot be offered yet. The quoted total is the final customer price. Tax cannot be added on top.",
  tax_not_zero: "This quote cannot be offered yet. The quoted total is the final customer price. Tax cannot be added on top.",
  inclusive_breakdown: "This quote cannot be offered yet. The quoted total is the final customer price. Tax cannot be added on top.",
  unsupported_tax: "This quote cannot be offered yet. The quoted total is the final customer price. Tax cannot be added on top.",
}

/** A known quote denial, or null when the status or reason must stay on the generic path. */
export function quoteDenialMessage(status: string | undefined, reason: unknown): string | null {
  if (status !== "denied" && status !== "eligibility_blocked") return null
  if (typeof reason !== "string") return null
  const message = quoteDenialByReason[reason]
  return typeof message === "string" ? message : null
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
      status?: string; reason?: unknown; id?: string; version?: number; quoteVersionId?: string; expiresAt?: string; publicRef?: string; replay?: boolean
    }>("admin_quote_command_v1", {
      p_token: tokenHash(gated.token), p_request: gated.key, p_operation: operation, p_payload: payload, p_version: version,
    })
    const denial = quoteDenialMessage(result.status, result.reason)
    if (result.status === "eligibility_blocked") return reply(denial ?? ELIGIBILITY_BLOCKED, 409)
    if (result.status !== "success") return reply(denial ?? commandMessage(result.status), mapStatus(result.status))
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
