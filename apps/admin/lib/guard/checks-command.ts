import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { guardChecksEnabled } from "./gate"
import { isGuardCheckOperation, guardCheckArgs } from "./checks-validation"

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
    default: return 503
  }
}

function commandMessage(status: string | undefined, reason?: string): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That Guard check changed. Reload the page and try again."
  if (status === "denied" && reason === "checks_disabled") return "Guard checks are disabled until the live check gate is enabled."
  if (status === "denied" && reason === "coverage_not_active") return "This coverage is not active, so the check cannot be completed as healthy."
  if (status === "denied" && reason === "already_claimed") return "Another claim already owns this check."
  if (status === "denied" && reason === "incomplete_not_healthy") return "Incomplete observations cannot be recorded as healthy."
  if (status === "denied" && reason === "unavailable_not_healthy") return "An unavailable profile cannot be recorded as healthy."
  if (status === "denied" && reason === "baseline_missing") return "A verified baseline is required before a healthy observation."
  if (status === "denied" && reason === "baseline_location_mismatch") return "The baseline belongs to another location."
  if (status === "denied") return "That Guard check action is not allowed."
  if (status === "invalid") return "Check the fields before saving."
  return "The Guard check could not be updated."
}

export async function guardCheckCommand(request: NextRequest): Promise<NextResponse> {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const parsed = await readJson(request)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    const operation = body && typeof body === "object" && !Array.isArray(body) ? (body as { operation?: unknown }).operation : null
    if (typeof operation !== "string" || !isGuardCheckOperation(operation)) return reply("Check the fields before saving.", 400)
    const args = guardCheckArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    if (!guardChecksEnabled()) {
      return reply("Guard checks are disabled until the live check gate is enabled.", 403, { reason: "checks_disabled" })
    }
    const version = args.version
    const payload: Record<string, unknown> = { ...args }
    delete payload.version
    const result = await backend().rpc<{
      status?: string; id?: string; version?: number; reason?: string; replay?: boolean
      observationId?: string; late?: boolean; secondsLate?: number; handlingSeconds?: number
    }>("admin_guard_check_command_v1", {
      p_token: tokenHash(token), p_request: key, p_operation: operation, p_payload: payload, p_version: version, p_now: null,
    })
    if (result.status !== "success") return reply(commandMessage(result.status, result.reason), mapStatus(result.status), {
      ...(result.reason ? { reason: result.reason } : {}),
    })
    return reply(
      operation === "complete"
        ? result.late ? "The observation is recorded. Late completion remains late." : "The observation is recorded."
        : operation === "claim" ? "You have claimed this check."
        : operation === "fail" ? "The failed attempt is recorded. The same check can be retried."
        : operation === "release" ? "The claim was released."
        : "The Guard check was updated. No customer alert was sent.",
      200,
      { id: result.id, version: result.version, observationId: result.observationId, late: result.late },
    )
  } catch {
    return reply("We couldn’t confirm the Guard check change. Reload the page before trying again.", 503)
  }
}
