import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"

const findings = ["ABSENT", "PRESENT", "RECURRENCE", "AMBIGUOUS", "UNRELATED"] as const

const reply = (message: string, status = 200) =>
  NextResponse.json({ message }, { status, headers: privateResponseHeaders })

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null
}

export async function recordSuccessObservation(request: NextRequest): Promise<NextResponse> {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  let body: Record<string, unknown>
  try {
    const parsed = await request.json() as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply("Check the fields before saving.", 400)
    body = parsed as Record<string, unknown>
  } catch {
    return reply("Please check the form and try again.", 400)
  }
  const serviceOrderId = typeof body.serviceOrderId === "string" && isUuid(body.serviceOrderId) ? body.serviceOrderId : null
  const targetRef = text(body.targetRef, 1, 200)
  const restrictionRef = text(body.restrictionRef, 1, 200)
  const observerRef = text(body.observerRef, 8, 200)
  const note = text(body.note, 10, 2000)
  const finding = typeof body.finding === "string" && findings.includes(body.finding as typeof findings[number]) ? body.finding : null
  const observedAt = typeof body.observedAt === "string" && !Number.isNaN(Date.parse(body.observedAt)) ? new Date(body.observedAt).toISOString() : null
  if (!serviceOrderId || !targetRef || !restrictionRef || !observerRef || !note || !finding || !observedAt) {
    return reply("Check the fields before saving.", 400)
  }
  if (Date.parse(observedAt) > Date.now()) return reply("An observation cannot be dated in the future.", 400)
  try {
    const result = await backend().rpc<{ status?: string; replay?: boolean }>("admin_record_success_observation_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_payload: { serviceOrderId, targetRef, restrictionRef, observedAt, finding, observerRef, note },
    })
    if (result.status === "reauth_required") return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    if (result.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (result.status === "invalid") return reply("Check the fields before saving.", 400)
    if (result.status === "denied") return reply("That observation does not belong to this success-fee order, so it was not recorded.", 403)
    if (result.status !== "success") return reply("The observation could not be recorded.", 503)
    return reply(result.replay
      ? "This observation was already recorded. It was not recorded again."
      : "The observation is recorded. It does not approve the success fee, create an invoice, or charge a card.")
  } catch {
    return reply("We couldn’t confirm the observation. Reload the page before trying again.", 503)
  }
}
