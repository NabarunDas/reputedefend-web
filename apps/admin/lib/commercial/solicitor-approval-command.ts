import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash } from "../../../../lib/commercial/paid-service-agreement"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

/** Owner-attested evidence is only persisted through the existing authenticated, audited database RPC. */
export async function solicitorApprovalCommand(request: NextRequest): Promise<NextResponse> {
  const config = authConfig()
  if (!config) return reply("Admin authentication is unavailable.", 503)
  // Do not accept an unauthenticated call, cross-origin POST or arbitrary Preview custom origin.
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) {
    return reply("Reload this Admin page and try again.", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply("Invalid request type.", 415)
  }
  const token = request.cookies.get(sessionCookie)?.value
  const requestId = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Sign in to the Admin portal first.", 401)
  if (!isUuid(requestId)) return reply("Reload this form and try again.", 400)

  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 2048) { await reader.cancel(); return reply("Request too large.", 413) }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  let body: unknown
  try { body = JSON.parse(raw) } catch { return reply("Invalid request.", 400) }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Invalid request.", 400)
  const fields = body as Record<string, unknown>
  const evidence = typeof fields.evidence === "string" ? fields.evidence.trim() : ""
  if (fields.confirmed !== true || fields.version !== PAID_SERVICE_AGREEMENT_VERSION
    || fields.contentHash !== paidServiceAgreementContentHash
    || evidence.length < 20 || evidence.length > 500
    || /[\u0000-\u001f\u007f]/.test(evidence)) {
    return reply("Confirm the exact agreement and provide its genuine solicitor approval reference.", 400)
  }
  try {
    const result = await backend().rpc<{ status?: string; version?: string; hash?: string; operative?: boolean }>(
      "admin_confirm_paid_service_agreement_v1",
      { p_token: tokenHash(token), p_request: requestId, p_evidence: evidence },
    )
    if (result.status === "unauthorised") return reply("Admin session not authorised.", 401)
    if (result.status === "invalid") return reply("Approval evidence was not accepted.", 400)
    if (result.status === "conflict") return reply("Approval request differs from an earlier request.", 409)
    if (result.status === "unknown_version") return reply("Agreement catalogue version is unavailable.", 409)
    if (!["confirmed", "replay", "already_confirmed"].includes(result.status || "")
      || result.version !== PAID_SERVICE_AGREEMENT_VERSION
      || result.hash !== paidServiceAgreementContentHash
      || result.operative !== true) {
      return reply("Agreement approval could not be verified. No payment activation was requested.", 503)
    }
    return reply("The agreement approval is recorded against the exact version and hash. No payments were enabled.", 200, {
      version: result.version, contentHash: result.hash, operative: result.operative,
    })
  } catch {
    return reply("Could not confirm the approval. Check the Admin status before retrying.", 503)
  }
}
