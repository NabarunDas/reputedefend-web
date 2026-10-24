import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "../access"
import { backend, tokenHash, validToken } from "../auth/backend"
import { adminCommandOriginError } from "../auth/command-origin"
import { authConfig, sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { devCaseJourneyPreviewEnabled } from "./gate"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })
const unavailable = "The accepted order could not be recorded. The reviewed database change may not be applied yet. Reload before trying again."

function commandArgs(raw: unknown): { caseId: string; version: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  if (Object.keys(body).length !== 2 || !isUuid(body.caseId) || !Number.isSafeInteger(body.version) || (body.version as number) < 1) return null
  return { caseId: body.caseId, version: body.version as number }
}

function reasonMessage(reason: string | undefined, status: string | undefined): { message: string; http: number } {
  if (status === "success") {
    return { message: "The accepted service is recorded on the case. The payment stays outstanding until Stripe confirms settlement and a receipt is stored.", http: 200 }
  }
  if (status === "unauthorized") return { message: "Your session has ended. Please sign in again.", http: 401 }
  if (status === "conflict") return { message: "This case has changed. Reload it before trying again.", http: 409 }
  if (reason === "closed") return { message: "This case is closed. Reopen it before continuing.", http: 403 }
  if (reason === "conflicting_track") return { message: "This case already records a different service. It was not overwritten.", http: 409 }
  if (reason === "revoked_authority") return { message: "Business authority is revoked, so the accepted order was not recorded on the case.", http: 403 }
  if (reason === "guard_separate") return { message: "Relaunch Guard does not choose Guided or Managed. The case was not changed.", http: 409 }
  if (reason === "ambiguous_orders") return { message: "More than one service order is on file, so the case was not changed.", http: 409 }
  if (reason === "ambiguous_quotes") return { message: "More than one quote is still open or accepted, so the case was not changed.", http: 409 }
  if (reason === "mismatch" || reason === "not_found") return { message: "The accepted order does not match this case, so the case was not changed.", http: 409 }
  if (reason === "stage_not_reconcilable" || reason === "submissions_recorded") return { message: "The technical stage cannot be moved from here. The case was not changed.", http: 409 }
  if (reason === "missing_assessment") return { message: "An approved assessment is not on file, so the accepted order was not recorded on the case.", http: 409 }
  if (reason === "missing_intake") return { message: "The intake review is not recorded, so the accepted order was not recorded on the case.", http: 409 }
  if (reason === "missing_verification") return { message: "Preliminary screening is not recorded, so the accepted order was not recorded on the case.", http: 409 }
  if (reason === "missing_authority") return { message: "Business authority is not verified, so the accepted order was not recorded on the case.", http: 409 }
  if (reason === "missing_agreement") return { message: "The approved service agreement is not on the accepted order, so the case was not changed.", http: 409 }
  if (reason === "unmatched_payment") return { message: "The payment obligation does not match the accepted order, so the case was not changed.", http: 409 }
  return { message: unavailable, http: 503 }
}

/** Records the accepted service order on the case. DEV/develop only. It does not take a payment. */
export async function reconcileAcceptedServiceCommand(request: NextRequest) {
  if (!devCaseJourneyPreviewEnabled()) return reply("Unavailable.", 404)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originError = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originError) return reply(originError, 403)
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
      if (size > 2048) {
        await reader.cancel()
        return reply("That request is too large.", 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const args = commandArgs(body)
    if (!args) return reply("Reload the page and try again.", 400)
    const result = await backend().rpc<{ status?: string; reason?: string }>("admin_reconcile_accepted_service_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_case: args.caseId,
      p_version: args.version,
    })
    const answered = reasonMessage(result?.reason, result?.status)
    return reply(answered.message, answered.http)
  } catch {
    return reply(unavailable, 503)
  }
}
