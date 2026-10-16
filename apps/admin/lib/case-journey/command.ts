import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { devCaseJourneyPreviewEnabled } from "./gate"
import { intakeDecisionArgs, verificationDecisionArgs } from "./decisions"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

function decisionArgs(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  const keys = Object.keys(body)
  if (keys.length !== 4 || !["caseId", "version", "kind", "data"].every(key => Object.hasOwn(body, key))) return null
  if (!isUuid(body.caseId) || !Number.isSafeInteger(body.version) || (body.version as number) < 1) return null
  if (body.kind === "intake") {
    const data = intakeDecisionArgs(body.data)
    return data ? { caseId: body.caseId, version: body.version as number, kind: "intake" as const, data } : null
  }
  if (body.kind === "verification") {
    const data = verificationDecisionArgs(body.data)
    return data ? { caseId: body.caseId, version: body.version as number, kind: "verification" as const, data } : null
  }
  return null
}

/** Staff intake review and business screening. DEV/develop only. The actor is the session, never the body. */
export async function journeyDecisionCommand(request: NextRequest) {
  if (!devCaseJourneyPreviewEnabled()) return reply("Unavailable.", 404)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) {
        await reader.cancel()
        return reply("That request is too large.", 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const args = decisionArgs(body)
    if (!args) return reply("Check the outcome, the reason and the note before saving.", 400)
    const result = await backend().rpc<{ status?: string }>("admin_case_journey_decision_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_case: args.caseId,
      p_version: args.version,
      p_kind: args.kind,
      p_data: args.data,
    })
    switch (result?.status) {
      case "success": return reply("Saved. The case history now includes this staff decision.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "conflict": return reply("This case has changed. Reload it before trying again.", 409)
      case "denied": return reply("This case is closed. Reopen it before recording another review.", 403)
      case "invalid": return reply("The decision was rejected. Check the outcome and the recorded reason.", 400)
      default: return reply("The decision could not be stored. The reviewed database change may not be applied yet. Reload before trying again.", 503)
    }
  } catch {
    return reply("The decision could not be stored. The reviewed database change may not be applied yet. Reload before trying again.", 503)
  }
}
