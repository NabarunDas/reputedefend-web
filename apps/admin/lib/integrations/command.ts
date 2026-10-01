import "server-only"
import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import {
  type GoogleBusinessProfileEnv,
  googleLiveReadiness,
  googleOAuthConfig,
} from "../../../../lib/google-business-profile/config"
import {
  type BrowserIntegrationOperation,
  commandMessage,
  connectDisabledNotice,
  isBrowserIntegrationOperation,
  isIntegrationKey,
} from "./model"
import {
  authorizationUrl,
  hashOAuthState,
  issueOAuthState,
  normaliseOAuthError,
  oauthStatePattern,
} from "../../../../lib/google-business-profile/oauth"
import { containsTokenMaterial } from "../../../../lib/google-business-profile/token-crypto"

const json = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

function mapStatus(status?: string): number {
  if (status === "unauthorized") return 401
  if (status === "reauth_required" || status === "denied" || status === "rejected") return 403
  if (status === "conflict") return 409
  if (status === "invalid") return 400
  if (status === "success" || status === "accepted" || status === "cancelled") return 200
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

// Binds a connect attempt to the session that started it without storing the
// session token. The hash is one-way and is all the callback needs to compare.
function sessionBinding(token: string): string {
  return createHash("sha256").update(`oauth-binding:${token}`).digest("hex")
}

type BuiltCommand = { payload: Record<string, unknown>; state?: string }

// Builds the RPC payload entirely from server-side material. Nothing a browser
// sends can become a state, a redirect URI, an expiry or a token.
function buildCommand(
  operation: BrowserIntegrationOperation,
  body: Record<string, unknown>,
  token: string,
  redirectUri: string,
): BuiltCommand | null {
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : ""
  if (operation === "begin_connect") {
    const issued = issueOAuthState({ now: new Date() })
    const target = (name: string) => (isUuid(body[name]) ? (body[name] as string) : null)
    return {
      state: issued.state,
      payload: {
        stateHash: issued.stateHash,
        sessionBinding: sessionBinding(token),
        redirectUri,
        expiresAt: issued.expiresAt,
        customerId: target("customerId"),
        businessId: target("businessId"),
        locationId: target("locationId"),
      },
    }
  }
  if (operation === "cancel_connect") {
    const state = typeof body.state === "string" ? body.state : ""
    if (!oauthStatePattern.test(state)) return null
    return { payload: { stateHash: hashOAuthState(state), reason: reason || "cancelled" } }
  }
  const id = typeof body.connectionId === "string" ? body.connectionId : ""
  const version = Number(body.version)
  if (!isUuid(id) || !Number.isInteger(version) || version < 1) return null
  return { payload: { id, version, reason } }
}

export async function integrationCommand(request: NextRequest): Promise<NextResponse> {
  const gate = sessionOrError(request)
  if ("error" in gate) return gate.error
  const parsed = await readJson(request)
  if ("error" in parsed) return parsed.error
  const body = parsed.body
  const operation = body.operation
  if (!isBrowserIntegrationOperation(operation) || !isIntegrationKey(body.provider)) {
    return json("Check the form and try again.", 400)
  }
  // Fail closed. Every live condition must pass before an operation that could
  // lead to a Google request is allowed to reach the database.
  const readiness = googleLiveReadiness()
  const oauth = googleOAuthConfig()
  if (!readiness.ready || !oauth) return disabled({ blockers: readiness.blockers })
  const built = buildCommand(operation, body, gate.token, oauth.redirectUri)
  if (!built) return json("Check the form and try again.", 400)
  try {
    const result = await backend().rpc<{ status?: string; reason?: string } | null>("admin_integration_command_v1", {
      p_token: tokenHash(gate.token),
      p_request: gate.key,
      p_operation: operation,
      p_payload: built.payload,
    })
    if (!result || result.status === "unauthorized") return json("Please sign in again.", 401)
    // The RPC never returns token material; this refuses to forward it if a
    // future change ever did.
    if (containsTokenMaterial(result)) return json("The integration could not be updated.", 503)
    return json(commandMessage(result.status, result.reason), mapStatus(result.status), {
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
      // The authorization URL is only ever built here, after the state row was
      // recorded, and carries no client secret.
      ...(built.state && result.status === "success"
        ? { authorizationUrl: authorizationUrl(oauth, built.state) }
        : {}),
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

// Decides what the OAuth redirect may do before any database or network work.
// While live Google integration is disabled this never exchanges a code.
export function googleCallbackOutcome(
  url: URL,
  env: GoogleBusinessProfileEnv = process.env,
): CallbackOutcome | { status: "proceed"; stateHash: string } {
  const readiness = googleLiveReadiness(env)
  if (!readiness.ready) {
    return { status: "disabled", reason: "google_api_disabled", message: connectDisabledNotice }
  }
  const error = url.searchParams.get("error")
  if (error) {
    return { status: "cancelled", reason: normaliseOAuthError(error), message: "The Google authorization was not completed." }
  }
  const state = url.searchParams.get("state") ?? ""
  if (!state) return { status: "rejected", reason: "state_missing", message: "That authorization link is not valid." }
  if (!oauthStatePattern.test(state)) {
    return { status: "rejected", reason: "state_malformed", message: "That authorization link is not valid." }
  }
  if (!url.searchParams.get("code")) {
    return { status: "rejected", reason: "code_missing", message: "That authorization link is not valid." }
  }
  // Only now may the stored state be consumed, which is where single use,
  // expiry, session binding and redirect matching are enforced.
  return { status: "proceed", stateHash: hashOAuthState(state) }
}

export async function googleCallbackResponse(request: NextRequest): Promise<NextResponse> {
  const outcome = googleCallbackOutcome(new URL(request.url))
  if (outcome.status === "proceed") {
    const token = request.cookies.get(sessionCookie)?.value
    const oauth = googleOAuthConfig()
    if (!validToken(token) || !token || !oauth) {
      return json("That authorization link is not valid.", 403, { status: "rejected", reason: "context_mismatch" })
    }
    try {
      const result = await backend().rpc<{ status?: string; reason?: string } | null>("admin_integration_command_v1", {
        p_token: tokenHash(token),
        p_request: crypto.randomUUID(),
        p_operation: "consume_state",
        p_payload: {
          stateHash: outcome.stateHash,
          sessionBinding: sessionBinding(token),
          redirectUri: oauth.redirectUri,
        },
      })
      // A token exchange would happen here once an exchange implementation
      // exists. There is none in this step, so an accepted state still ends in
      // a not-configured answer rather than a Google request.
      return json(commandMessage(result?.status, result?.reason), mapStatus(result?.status), {
        status: result?.status ?? "rejected",
        ...(result?.reason ? { reason: result.reason } : {}),
      })
    } catch {
      return json("That authorization link is not valid.", 503, { status: "rejected" })
    }
  }
  // The query string may carry a code. It is never read, never logged and
  // never echoed back.
  return json(outcome.message, outcome.status === "disabled" ? 503 : 400, {
    status: outcome.status,
    reason: outcome.reason,
  })
}
