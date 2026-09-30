import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { communicationsSendEnabled, sendDisabledReason } from "../communications/gate"
import { mailFromAddress } from "../communications/mail"
import { guardActivationEnabled, guardAlertNotificationsEnabled, guardAlertsEnabled } from "./gate"
import { isGuardAlertOperation, guardAlertArgs } from "./alerts-validation"

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

function commandMessage(status: string | undefined, reason?: string, operation?: string): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That Guard alert changed. Reload the page and try again."
  if (status === "denied" && reason === "alerts_disabled") return "Guard alerts are not enabled."
  if (status === "denied" && reason === "notifications_disabled") return "Guard alert notifications are not enabled."
  if (status === "denied" && reason === "activation_disabled") return "Guard reactivation remains disabled."
  if (status === "denied" && reason === "incomplete_only") return "Incomplete capture cannot be treated as a customer issue until later valid evidence exists."
  if (status === "denied" && reason === "needs_review") return "Review the newly attached evidence before taking that customer-facing action."
  if (status === "denied" && reason === "case_not_usable") return "That case is closed, cancelled, or not a usable intervention case."
  if (status === "denied" && reason === "stale_service_action") return "That recovery action no longer matches the current missing contact or access."
  if (status === "denied" && reason === "access_still_missing") return "Access recovery cannot be resolved while Manager or Owner access is still missing."
  if (status === "denied" && reason === "contact_still_missing") return "Contact recovery cannot be resolved while no verified email or phone exists."
  if (status === "denied" && reason === "not_confirmed_customer_issue") return "Only a confirmed customer issue can notify, create a case, or qualify for discount review."
  if (status === "denied" && reason === "recipient_changed") return "The current verified email no longer matches this draft. Prepare a new notification."
  if (status === "denied" && reason === "recipient_suppressed") return "That recipient is suppressed. Do not queue another email."
  if (status === "denied" && reason === "resume_not_ready") return "Coverage cannot resume until access, contact and readiness are restored."
  if (status === "denied" && reason === "recovery_pause_not_justified") return "Coverage can only be paused for recovery when contact or access is missing."
  if (status === "denied" && reason === "case_scope_mismatch") return "That case belongs to another customer or location."
  if (status === "denied" && reason === "escalation_not_upward") return "Severity can only escalate upward."
  if (status === "denied" && reason === "terminal") return "That alert is already closed."
  if (status === "denied") return "That Guard alert action is not allowed."
  if (status === "invalid" && reason === "unresolved_placeholders") return "Unresolved placeholders cannot be reviewed."
  if (status === "invalid") return "Check the fields before saving."
  if (operation === "review_new_evidence") return "The new evidence was reviewed. Original acknowledgement was not rewritten."
  if (operation === "acknowledge") return "The alert was acknowledged. No customer email was sent."
  if (operation === "dismiss") return "The alert was dismissed. No customer email or case was created."
  if (operation === "resolve") return "The alert was resolved. Recovery actions remain separate."
  if (operation === "prepare_notification") return "The notification was prepared. It has not been sent."
  if (operation === "approve_notification") return "The notification was reviewed. It has not been queued."
  if (operation === "queue_notification") return "The notification was queued for the existing email worker."
  if (operation === "create_intervention_case") return "The intervention case was created. No charge or quote was authorised."
  if (operation === "link_existing_case") return "The existing case was linked."
  if (operation === "pause_for_recovery") return "Coverage was paused for recovery. Activation and billing clocks were not rewritten."
  if (operation === "resume") return "Coverage was resumed. The original activation clock was preserved."
  return "The Guard alert was updated."
}

export async function guardAlertCommand(request: NextRequest): Promise<NextResponse> {
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
    if (typeof operation !== "string" || !isGuardAlertOperation(operation)) return reply("Check the fields before saving.", 400)
    const args = guardAlertArgs(operation, body as Record<string, unknown>)
    if (!args) return reply("Check the fields before saving.", 400)
    if (!guardAlertsEnabled()) {
      return reply("Guard alerts are not enabled.", 403, { reason: "alerts_disabled" })
    }
    if (operation === "resume" && !guardActivationEnabled()) {
      return reply("Guard reactivation remains disabled.", 403, { reason: "activation_disabled" })
    }
    if (operation === "queue_notification") {
      if (!guardAlertNotificationsEnabled()) return reply("Guard alert notifications are not enabled.", 403, { reason: "notifications_disabled" })
      if (!communicationsSendEnabled()) return reply(sendDisabledReason(), 403, { reason: "communications_disabled" })
    }
    const version = args.version
    const payload: Record<string, unknown> = { ...args }
    delete payload.version
    if (operation === "approve_notification") {
      const from = mailFromAddress()
      if (!from) return reply("The outbound sender address is not configured.", 503)
      payload.fromAddress = from
    }
    if (operation === "queue_notification") {
      payload.sendEnabled = true
      payload.notificationsEnabled = true
    }
    const result = await backend().rpc<{
      status?: string; id?: string; version?: number; reason?: string; replay?: boolean
      communicationId?: string; caseId?: string
    }>("admin_guard_alert_command_v1", {
      p_token: tokenHash(token), p_request: key, p_operation: operation, p_payload: payload, p_version: version,
    })
    if (result.status !== "success") return reply(commandMessage(result.status, result.reason, operation), mapStatus(result.status), {
      ...(result.reason ? { reason: result.reason } : {}),
    })
    return reply(commandMessage("success", undefined, operation), 200, {
      id: result.id, version: result.version, communicationId: result.communicationId, caseId: result.caseId,
    })
  } catch {
    return reply("We couldn’t confirm the Guard alert change. Reload the page before trying again.", 503)
  }
}
