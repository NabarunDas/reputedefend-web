import { isUuid } from "../records/model"
import { guardAlertOperations, type GuardAlertOperation } from "./alerts-model"

export function isGuardAlertOperation(value: unknown): value is GuardAlertOperation {
  return typeof value === "string" && (guardAlertOperations as readonly string[]).includes(value)
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  return next.length >= min && next.length <= max ? next : null
}

export function guardAlertArgs(operation: GuardAlertOperation, body: Record<string, unknown>) {
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  if (operation === "acknowledge_service_action" || operation === "resolve_service_action") {
    const reason = text(body.reason, 10, 500)
    if (!isUuid(body.serviceActionId) || !reason) return null
    return { serviceActionId: body.serviceActionId, version: body.version, reason }
  }
  if (!isUuid(body.alertId)) return null
  if (operation === "acknowledge") {
    const reason = text(body.reason, 10, 500)
    const severity = body.severity
    const disposition = body.disposition
    if (!reason) return null
    if (severity !== "LOW" && severity !== "MEDIUM" && severity !== "HIGH" && severity !== "CRITICAL") return null
    if (disposition !== "CONFIRMED_CUSTOMER_ISSUE" && disposition !== "INTERNAL_ONLY" && disposition !== "FALSE_POSITIVE") return null
    return { alertId: body.alertId, version: body.version, severity, disposition, reason }
  }
  if (operation === "dismiss" || operation === "resolve" || operation === "pause_for_recovery" || operation === "resume" || operation === "escalate" || operation === "correct_severity") {
    const reason = text(body.reason, 10, 500)
    if (!reason) return null
    if (operation === "escalate" || operation === "correct_severity") {
      if (body.severity !== "LOW" && body.severity !== "MEDIUM" && body.severity !== "HIGH" && body.severity !== "CRITICAL") return null
      return { alertId: body.alertId, version: body.version, severity: body.severity, reason }
    }
    if (operation === "pause_for_recovery") {
      if (!isUuid(body.serviceActionId)) return null
      return { alertId: body.alertId, version: body.version, serviceActionId: body.serviceActionId, reason }
    }
    return { alertId: body.alertId, version: body.version, reason }
  }
  if (operation === "prepare_notification") {
    const fact = text(body.fact, 10, 400)
    const effect = text(body.effect, 10, 400)
    const nextStep = text(body.nextStep, 10, 400)
    const kind = body.notificationKind ?? "INITIAL"
    if (!fact || !effect || !nextStep) return null
    if (kind !== "INITIAL" && kind !== "FOLLOW_UP" && kind !== "RESOLUTION") return null
    if ((kind === "FOLLOW_UP" || kind === "RESOLUTION") && !text(body.reason, 10, 500)) return null
    return {
      alertId: body.alertId, version: body.version, fact, effect, nextStep, notificationKind: kind,
      ...(typeof body.reason === "string" ? { reason: body.reason.trim() } : {}),
    }
  }
  if (operation === "approve_notification" || operation === "queue_notification") {
    if (!isUuid(body.communicationId)) return null
    return { alertId: body.alertId, version: body.version, communicationId: body.communicationId }
  }
  if (operation === "create_intervention_case") {
    if (body.caseType !== "PROFILE_RECOVERY" && body.caseType !== "REVIEW_PROTECTION") return null
    return { alertId: body.alertId, version: body.version, caseType: body.caseType }
  }
  if (operation === "link_existing_case") {
    if (!isUuid(body.caseId)) return null
    return { alertId: body.alertId, version: body.version, caseId: body.caseId }
  }
  return null
}
