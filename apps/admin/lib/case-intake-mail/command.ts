import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { devCaseJourneyPreviewEnabled } from "../case-journey/gate"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })
const PUBLIC_REF_PATTERN = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const DEVELOP_ADMIN_BRANCH = /^profilerelaunch-admin-git-develop-([a-z0-9-]+)\.vercel\.app$/

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
 * cannot name a recipient or a marketing URL.
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
  if (!validToken(token)) return reply("Please sign in again.", 401)
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
    if (!session || typeof session.userId !== "string") return reply("Please sign in again.", 401)
    const response = await fetch(`${marketing}/api/staff/case-intake-mail`, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "idempotency-key": key,
      },
      body: JSON.stringify(args),
    })
    if (response.status >= 300 && response.status < 400) {
      return reply("The stored messages could not be sent. Reload before trying again.", 503)
    }
    const payload = await response.json().catch(() => null) as { receiptEmailStatus?: unknown } | null
    const receiptEmailStatus = payload?.receiptEmailStatus
    if (response.ok && (receiptEmailStatus === "sent" || receiptEmailStatus === "unavailable" || receiptEmailStatus === "suppressed")) {
      const message = receiptEmailStatus === "sent"
        ? "The stored messages were accepted by the email provider."
        : "The stored messages were not accepted. A second send was not started."
      return NextResponse.json({ message, receiptEmailStatus }, { status: 200, headers: privateResponseHeaders })
    }
    if (response.status === 401) return reply("Please sign in again.", 401)
    if (response.status === 404) return reply("Unavailable.", 404)
    return reply("The stored messages could not be sent. Reload before trying again.", 503)
  } catch {
    return reply("The stored messages could not be sent. Reload before trying again.", 503)
  }
}
