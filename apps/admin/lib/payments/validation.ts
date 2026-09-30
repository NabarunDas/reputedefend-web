import { isUuid } from "../records/model"
import { paymentOperations, type PaymentOperation } from "./model"

export function isPaymentOperation(value: unknown): value is PaymentOperation {
  return typeof value === "string" && (paymentOperations as readonly string[]).includes(value)
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const next = value.trim()
  return next.length >= min && next.length <= max ? next : null
}

function futureTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  const at = Date.parse(value)
  if (!Number.isFinite(at) || at <= Date.now() || at > Date.now() + 7 * 24 * 3600 * 1000) return null
  return value
}

export function paymentArgs(operation: PaymentOperation, body: Record<string, unknown>) {
  if (!isUuid(body.serviceOrderId) || typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  if (operation === "approve_success_fee") {
    const evidenceNote = text(body.evidenceNote, 10, 2000)
    const approvalReason = text(body.approvalReason, 10, 2000)
    if (!evidenceNote || !approvalReason) return null
    return { serviceOrderId: body.serviceOrderId, version: body.version, evidenceNote, approvalReason }
  }
  if (operation === "revoke_action") {
    const reason = text(body.reason, 10, 2000)
    if (!isUuid(body.actionId) || !reason) return null
    return { serviceOrderId: body.serviceOrderId, version: body.version, actionId: body.actionId, reason }
  }
  const expiresAt = futureTimestamp(body.expiresAt)
  if (!expiresAt) return null
  if (operation === "issue_recovery_action") {
    if (!isUuid(body.obligationId)) return null
    return { serviceOrderId: body.serviceOrderId, version: body.version, obligationId: body.obligationId, expiresAt }
  }
  return { serviceOrderId: body.serviceOrderId, version: body.version, expiresAt }
}
