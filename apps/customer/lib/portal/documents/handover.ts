import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerRequestOriginAllowed } from "@/lib/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isUuid } from "@/lib/uuid"

const SIGN_IN = "Sign in again to continue."
const UNAVAILABLE = "This pack is no longer available. Refresh the page and try again."
const RETRY = "We couldn't save that. Please try again shortly."
const CHECK = "Check the details and try again."
const SAVED_CORRECTION = "We've received your correction request. ProfileRelaunch will review the pack. This does not submit anything to Google."
const SAVED_REPORT = "We've recorded that you submitted this pack to Google. This is your report. It is not a decision from Google."
const SAVED_OUTCOME = "We've recorded your report of Google's decision. This is your report. It is not an independently verified Google decision."
const OUTCOMES = new Set(["STILL_WAITING", "REINSTATED", "NOT_REINSTATED", "MORE_INFORMATION", "OTHER"])
const EVIDENCE_SELECTOR = /^er-[1-9][0-9]{0,3}$/

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

const reply = (message: string, http = 401) =>
  NextResponse.json({ message }, { status: http, headers: privateResponseHeaders })

async function readJson(request: NextRequest) {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = ""
  let size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 8192) { await reader.cancel(); return null }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return JSON.parse(raw || "{}") as Record<string, unknown> }
  catch { return null }
}

function note(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length >= 10 && trimmed.length <= 2000 ? trimmed : null
}

export async function portalGuidedHandover(request: NextRequest) {
  if (!portalAvailable()) return reply(UNAVAILABLE, 404)
  if (!customerRequestOriginAllowed(request.headers.get("origin"), request.nextUrl.origin)) return reply(UNAVAILABLE)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply(UNAVAILABLE)
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  const operation = body.operation
  if (operation !== "request_correction" && operation !== "report_submission" && operation !== "report_outcome") return reply(CHECK, 400)
  if (typeof body.reference !== "string" || !isPublicCaseReference(body.reference)) return reply(UNAVAILABLE, 404)
  const written = note(body.note)
  if (!written) return reply(CHECK, 400)
  const data: Record<string, string> = { note: written }
  if (operation === "report_submission" || operation === "report_outcome") {
    const dayKey = operation === "report_submission" ? "submittedOn" : "decidedOn"
    if (typeof body[dayKey] !== "string" || !DAY.test(body[dayKey])) return reply(CHECK, 400)
    data[dayKey] = body[dayKey]
    if (operation === "report_outcome") {
      if (typeof body.outcome !== "string" || !OUTCOMES.has(body.outcome)) return reply(CHECK, 400)
      data.outcome = body.outcome
      if ("evidenceSelector" in body && body.evidenceSelector != null && body.evidenceSelector !== "") {
        if (typeof body.evidenceSelector !== "string" || !EVIDENCE_SELECTOR.test(body.evidenceSelector)) return reply(CHECK, 400)
        data.evidenceSelector = body.evidenceSelector
      }
    }
    if ("googleReference" in body && body.googleReference != null && body.googleReference !== "") {
      if (typeof body.googleReference !== "string") return reply(CHECK, 400)
      const reference = body.googleReference.trim()
      if (!reference || !REFERENCE.test(reference) || reference.toLowerCase().includes("http")) return reply(CHECK, 400)
      data.googleReference = reference
    }
  } else if ("googleReference" in body || "submittedOn" in body || "decidedOn" in body || "outcome" in body || "evidenceSelector" in body) {
    return reply(CHECK, 400)
  }
  try {
    const result = await backend().rpc<{ status?: string; reason?: string } | null>("customer_portal_guided_handover_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_reference: body.reference,
      p_operation: operation,
      p_data: data,
    })
    if (result == null) return reply(SIGN_IN)
    if (result.status === "success") {
      const message = operation === "request_correction" ? SAVED_CORRECTION : operation === "report_outcome" ? SAVED_OUTCOME : SAVED_REPORT
      return reply(message, 200)
    }
    if (result.status === "denied" && result.reason === "submission") {
      return reply("Record that you submitted this pack to Google before reporting a decision.", 409)
    }
    if (result.status === "conflict") {
      return reply(operation === "request_correction"
        ? "A correction request is already open for this pack."
        : "That report is already on this case.", 409)
    }
    if (result.status === "invalid") return reply(CHECK, 400)
    return reply(UNAVAILABLE, 403)
  } catch {
    return reply(RETRY, 503)
  }
}
