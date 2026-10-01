import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { googleLiveReadiness } from "../../../../lib/google-business-profile/config"
import { normaliseOAuthError, oauthStatePattern } from "../../../../lib/google-business-profile/oauth"
import { containsTokenMaterial } from "../../../../lib/google-business-profile/token-crypto"
import {
  commandMessage,
  connectDisabledNotice,
  type IntegrationOperation,
  isIntegrationKey,
  isIntegrationOperation,
} from "./model"

const json = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

function mapStatus(status?: string): number {
  if (status === "unauthorized") return 401
  if (status === "reauth_required" || status === "denied") return 403
  if (status === "conflict") return 409
  if (status === "invalid") return 400
  if (status === "success") return 200
  return 503
}

async function readJson(request: NextRequest, limit = 8192): Promise<{ error: NextResponse } | { body: Record<string, unknown> }> {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return { error: json("That request is too large.", 413) } }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return { body: JSON.parse(raw || "{}") as Record<string, unknown> } }
  catch { return { error: json("Please check the form and try again.", 400) } }
}

function sessionOrError(request: NextRequest): { error: NextResponse } | { token: string; key: string } {
  const config = authConfig()
  if (!config) return { error: json("The workspace is unavailable. Please try again shortly.", 503) }
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) {
    return { error: json("Reload this page and try again.", 403) }
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return { error: json("Reload this page and try again.", 415) }
  }
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token) || !token) return { error: json("Please sign in again.", 401) }
  if (!isUuid(key) || !key) return { error: json("Reload the form and try again.", 400) }
  return { token, key }
}

const disabled = (extra: Record<string, unknown> = {}) =>
  json(connectDisabledNotice, 403, { status: "denied", reason: "google_api_disabled", ...extra })

// The payload each operation may carry. Nothing here can hold a code, token or
// secret: the server reads those from its own configuration, never from the
// browser.
function operationPayload(operation: IntegrationOperation, body: Record<string, unknown>): Record<string, unknown> | null {
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : ""
  if (operation === "begin_connect") {
    const customerId = typeof body.customerId === "string" ? body.customerId : null
    if (customerId !== null && !isUuid(customerId)) return null
    return { customerId, reason }
  }
  if (operation === "consume_state" || operation === "cancel_connect") {
    const state = typeof body.state === "string" ? body.state : ""
    if (!oauthStatePattern.test(state)) return null
    return { state, reason }
  }
  if (operation === "record_fault") {
    const code = typeof body.code === "string" ? body.code : ""
    return code ? { code, reason } : null
  }
  const connectionId = typeof body.connectionId === "string" ? body.connectionId : ""
  if (!isUuid(connectionId)) return null
  return { connectionId, reason }
}

export async function integrationCommand(request: NextRequest): Promise<NextResponse> {
  const gate = sessionOrError(request)
  if ("error" in gate) return gate.error
  const parsed = await readJson(request)
  if ("error" in parsed) return parsed.error
  const body = parsed.body
  const operation = body.operation
  if (!isIntegrationOperation(operation) || !isIntegrationKey(body.provider)) {
    return json("Check the form and try again.", 400)
  }
  const payload = operationPayload(operation, body)
  if (!payload) return json("Check the form and try again.", 400)
  // Fail closed. Every live condition must pass before any operation that
  // could lead to a Google request is allowed to reach the database.
  const readiness = googleLiveReadiness()
  if (!readiness.ready) return disabled({ blockers: readiness.blockers })
  const version = body.version == null ? null : Number(body.version)
  try {
    const result = await backend().rpc<{ status?: string; reason?: string } | null>("admin_integration_command_v1", {
      p_token: tokenHash(gate.token),
      p_request: gate.key,
      p_provider: body.provider,
      p_operation: operation,
      p_payload: payload,
      p_version: Number.isInteger(version) ? version : null,
    })
    if (!result || result.status === "unauthorized") return json("Please sign in again.", 401)
    // The RPC never returns token material; this refuses to forward it if a
    // future change ever did.
    if (containsTokenMaterial(result)) return json("The integration could not be updated.", 503)
    return json(commandMessage(result.status, result.reason), mapStatus(result.status), {
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
    })
  } catch {
    return json("The integration could not be updated.", 503)
  }
}

export type CallbackOutcome = {
  status: "disabled" | "cancelled" | "rejected"
  reason: string
  message: string
}

// Handles the OAuth redirect. While live Google integration is disabled this
// never exchanges a code: it reports a safe not-configured state and discards
// everything Google sent.
export function googleCallbackOutcome(url: URL, env = process.env): CallbackOutcome {
  const readiness = googleLiveReadiness(env)
  if (!readiness.ready) {
    return { status: "disabled", reason: "google_api_disabled", message: connectDisabledNotice }
  }
  const error = url.searchParams.get("error")
  if (error) {
    const reason = normaliseOAuthError(error)
    return { status: "cancelled", reason, message: "The Google authorization was not completed." }
  }
  const state = url.searchParams.get("state") ?? ""
  if (!state) return { status: "rejected", reason: "state_missing", message: "That authorization link is not valid." }
  if (!oauthStatePattern.test(state)) {
    return { status: "rejected", reason: "state_malformed", message: "That authorization link is not valid." }
  }
  // Validation past this point needs the stored state row, which only exists
  // once the Step 21 migration is applied and a connection has begun.
  return { status: "rejected", reason: "state_unknown", message: "That authorization link is not valid." }
}

export function googleCallbackResponse(request: NextRequest): NextResponse {
  const outcome = googleCallbackOutcome(new URL(request.url))
  // The query string may carry a code. It is never read, never logged and
  // never echoed back.
  return NextResponse.json(
    { message: outcome.message, status: outcome.status, reason: outcome.reason },
    { status: outcome.status === "disabled" ? 503 : 400, headers: privateResponseHeaders },
  )
}
