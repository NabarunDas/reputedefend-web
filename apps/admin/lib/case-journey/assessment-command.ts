import "server-only"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "../access"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { requireStaff } from "../require-staff"
import { parseAssessmentCommand, parseCaseAssessment, type CaseAssessmentView } from "./assessment"
import { devCaseJourneyPreviewEnabled } from "./gate"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })
const unavailable = "The decision could not be stored. The reviewed database change may not be applied yet. Reload before trying again."

/** The reviewed assessment read. Missing until that database change is applied. */
export async function loadCaseAssessment(caseId: string): Promise<CaseAssessmentView | null> {
  if (!isUuid(caseId)) return null
  try {
    await requireStaff()
    const token = (await cookies()).get(sessionCookie)?.value
    if (!validToken(token)) return null
    const result = await backend().rpc<unknown>("admin_case_assessment_read_v1", { p_token: tokenHash(token), p_case: caseId })
    return parseCaseAssessment(result)
  } catch {
    return null
  }
}

function successMessage(operation: string | undefined): string {
  if (operation === "submit_review") return "Marked for review. Reviewing it does not complete this step."
  if (operation === "approve") return "Approved. The step is complete only while this approval still matches the evidence and the case has not been reopened."
  return "Saved as a draft. Saving a draft does not complete this step."
}

/** Staff assessment draft, review and approval. DEV/develop only. The actor is the session, never the body. */
export async function assessmentCommand(request: NextRequest) {
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
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 49152) {
        await reader.cancel()
        return reply("That request is too large.", 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const args = parseAssessmentCommand(body)
    if (!args) return reply("Check the assessment before saving.", 400)
    const result = await backend().rpc<{ status?: string; operation?: string }>("admin_case_assessment_command_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_case: args.caseId,
      p_version: args.version,
      p_operation: args.operation,
      p_data: args.data,
    })
    switch (result?.status) {
      case "success": return reply(successMessage(result.operation ?? args.operation), 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "conflict": return reply("This case has changed. Reload it before trying again.", 409)
      case "denied": return reply("This case is closed. Reopen it before recording another assessment.", 403)
      case "prerequisite": return reply("Evidence is not ready for an approved assessment. Accept the files and fulfil the open requests first.", 409)
      case "stale": return reply("The case or the evidence changed after this review. Save a new draft before approving.", 409)
      case "invalid": return reply("The assessment was rejected. Check the pathway and the written fields.", 400)
      default: return reply(unavailable, 503)
    }
  } catch {
    return reply(unavailable, 503)
  }
}
