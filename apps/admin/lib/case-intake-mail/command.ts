import "server-only"
import { getVercelOidcToken } from "@vercel/oidc"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { devCaseJourneyPreviewEnabled } from "../case-journey/gate"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })
const PUBLIC_REF_PATTERN = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const DEVELOP_ADMIN_BRANCH = /^profilerelaunch-admin-git-develop-([a-z0-9-]+)\.vercel\.app$/
const TRUSTED_OIDC_HEADER = "x-vercel-trusted-oidc-idp-token"
const DOWNSTREAM_BODY_LIMIT = 16_384
const SESSION_MESSAGE = "Please sign in again."
const PROTECTION_MESSAGE = "The marketing preview refused the server connection. Your Admin session is still signed in."
const REFUSED_MESSAGE = "The marketing preview did not accept the server connection. Your Admin session is still signed in."
const OIDC_MESSAGE = "The marketing preview connection is not ready. Your Admin session is still signed in."

/**
 * A Vercel Authentication denial is a different 401 from the staff route.
 * The staff route answers `{ ok: false }` only. Deployment Protection adds
 * `protection.vercel_auth_enabled` and does not reach the application.
 */
export function marketingIntakeUnauthorized(payload: unknown): "session" | "protection" | "refused" {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "refused"
  const body = payload as Record<string, unknown>
  const protection = body.protection
  if (protection && typeof protection === "object" && !Array.isArray(protection)) {
    const gate = protection as Record<string, unknown>
    if (gate.vercel_auth_enabled === true || gate.password_enabled === true) return "protection"
  }
  if (body.message === "Protected by Vercel Authentication") return "protection"
  const errorCode = body.error && typeof body.error === "object" && !Array.isArray(body.error)
    ? (body.error as Record<string, unknown>).code
    : body.code
  if (errorCode === "TRUSTED_SOURCES_ENVIRONMENT_MISMATCH") return "protection"
  if (body.ok === false && Object.keys(body).every((key) => key === "ok")) return "session"
  return "refused"
}

/** Short-lived Vercel OIDC token for Trusted Sources. Never the Admin session. */
async function trustedPreviewToken(): Promise<string | null> {
  try {
    const value = await getVercelOidcToken()
    if (typeof value !== "string") return null
    const token = value.trim()
    if (token.length < 20 || token.length > DOWNSTREAM_BODY_LIMIT) return null
    if (!/^[\w.-]+$/.test(token) || !token.includes(".")) return null
    return token
  } catch {
    return null
  }
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let size = 0
  let raw = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > DOWNSTREAM_BODY_LIMIT) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** Marketing develop Preview that belongs to the same team as this Admin branch. Fail closed for every other host. */
export function marketingDevelopOrigin(branchHost: string | undefined): string | null {
  const match = DEVELOP_ADMIN_BRANCH.exec(branchHost ?? "")
  const team = match?.[1]
  if (!team || team.startsWith("-") || team.endsWith("-")) return null
  return `https://reputedefend-web-git-develop-${team}.vercel.app`
}

function retryArgs(raw: unknown): { caseId: string; publicRef: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  const keys = Object.keys(body)
  if (keys.length !== 2 || !Object.hasOwn(body, "caseId") || !Object.hasOwn(body, "publicRef")) return null
  if (!isUuid(body.caseId) || typeof body.publicRef !== "string" || !PUBLIC_REF_PATTERN.test(body.publicRef)) return null
  return { caseId: body.caseId, publicRef: body.publicRef }
}

/**
 * Staff replay for one existing DEV case. The browser session stays on Admin.
 * Marketing performs the send after it verifies the same session. The body
 * cannot name a recipient or a marketing URL. The server call also carries
 * the short-lived Vercel OIDC token in the Trusted Sources header. That
 * token is not the Admin session and is never written into the response.
 */
export async function intakeMailRetryCommand(request: NextRequest) {
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
  if (!validToken(token)) return reply(SESSION_MESSAGE, 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  const marketing = marketingDevelopOrigin(process.env.VERCEL_BRANCH_URL)
  if (!marketing) return reply("The workspace is unavailable. Please try again shortly.", 503)
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
    try { body = JSON.parse(raw) } catch { return reply("Please check the case and try again.", 400) }
    const args = retryArgs(body)
    if (!args) return reply("Check the case reference and try again.", 400)
    let session: { userId?: unknown } | null = null
    try {
      session = await backend().rpc<{ userId?: unknown } | null>("admin_session_v1", { p_token: tokenHash(token) })
    } catch {
      session = null
    }
    if (!session || typeof session.userId !== "string") return reply(SESSION_MESSAGE, 401)
    const oidcToken = await trustedPreviewToken()
    if (!oidcToken || oidcToken === token) return reply(OIDC_MESSAGE, 503)
    const response = await fetch(`${marketing}/api/staff/case-intake-mail`, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "idempotency-key": key,
        [TRUSTED_OIDC_HEADER]: oidcToken,
      },
      body: JSON.stringify(args),
    })
    if (response.status >= 300 && response.status < 400) return reply(PROTECTION_MESSAGE, 503)
    const payload = await readLimitedJson(response)
    const receiptEmailStatus = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { receiptEmailStatus?: unknown }).receiptEmailStatus
      : undefined
    if (response.ok && (receiptEmailStatus === "sent" || receiptEmailStatus === "unavailable" || receiptEmailStatus === "suppressed")) {
      const message = receiptEmailStatus === "sent"
        ? "The stored messages were accepted by the email provider."
        : "The stored messages were not accepted. A second send was not started."
      return NextResponse.json({ message, receiptEmailStatus }, { status: 200, headers: privateResponseHeaders })
    }
    if (response.status === 401 || response.status === 403) {
      const denial = marketingIntakeUnauthorized(payload)
      if (denial === "session") return reply(SESSION_MESSAGE, 401)
      return reply(denial === "protection" ? PROTECTION_MESSAGE : REFUSED_MESSAGE, 503)
    }
    if (response.status === 404) return reply("Unavailable.", 404)
    return reply("The stored messages could not be sent. Reload before trying again.", 503)
  } catch {
    return reply("The stored messages could not be sent. Reload before trying again.", 503)
  }
}
