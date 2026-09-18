import { isUuid } from "../records/model"
import {
  authorizationOperations, managerLevels, managerOperations,
  type AgreementKind, type AuthorizationOperation, type ManagerLevel, type ManagerOperation, isAgreementKind,
} from "./model"

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null
}
function onlyKeys(body: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(body).every(key => allowed.includes(key))
}
function note(value: unknown, min = 10, max = 2000): string | null {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null
}

export type CreateAgreementArgs = { caseId: string; kind: AgreementKind; title: string; bodyText: string; scopeText: string; expiresAt: string }
export type RevokeActionArgs = { caseId: string; actionId: string; reason: string; confirmed: true }
export type CreateRevocationArgs = { caseId: string; authorizationId: string; expiresAt: string }
export type AdminRevokeArgs = { caseId: string; authorizationId: string; reason: string; confirmed: true; recordVersion: number }
export type AuthorizationArgs = CreateAgreementArgs | RevokeActionArgs | CreateRevocationArgs | AdminRevokeArgs
export type ManagerVerifyArgs = { caseId: string; accessLevel: ManagerLevel; evidence: string; confirmed: true }
export type ManagerRevokeArgs = { caseId: string; reason: string; confirmed: true }
export type ManagerArgs = ManagerVerifyArgs | ManagerRevokeArgs

function expiresAt(value: unknown): string | null {
  if (typeof value !== "string") return null
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return null
  const min = Date.now() + 15 * 60 * 1000
  const max = Date.now() + 7 * 24 * 3600 * 1000
  if (at <= min || at > max) return null
  return new Date(at).toISOString()
}

export function authorizationArgs(operation: AuthorizationOperation, raw: unknown): AuthorizationArgs | null {
  const body = asRecord(raw)
  if (!body || body.operation !== operation || !authorizationOperations.includes(operation) || !isUuid(body.caseId)) return null
  if (operation === "create_agreement_action") {
    if (!onlyKeys(body, ["operation", "caseId", "kind", "title", "bodyText", "scopeText", "expiresAt"])) return null
    if (typeof body.kind !== "string" || !isAgreementKind(body.kind)) return null
    const title = note(body.title, 1, 200), bodyText = note(body.bodyText, 20, 50000), scopeText = note(body.scopeText, 10, 5000)
    const expires = expiresAt(body.expiresAt)
    if (!title || !bodyText || !scopeText || !expires) return null
    return { caseId: body.caseId, kind: body.kind, title, bodyText, scopeText, expiresAt: expires }
  }
  if (operation === "revoke_action") {
    if (!onlyKeys(body, ["operation", "caseId", "actionId", "reason", "confirmed"]) || !isUuid(body.actionId) || body.confirmed !== true) return null
    const reason = note(body.reason)
    return reason ? { caseId: body.caseId, actionId: body.actionId, reason, confirmed: true } : null
  }
  if (operation === "create_revocation_action") {
    if (!onlyKeys(body, ["operation", "caseId", "authorizationId", "expiresAt"]) || !isUuid(body.authorizationId)) return null
    const expires = expiresAt(body.expiresAt)
    return expires ? { caseId: body.caseId, authorizationId: body.authorizationId, expiresAt: expires } : null
  }
  if (!onlyKeys(body, ["operation", "caseId", "authorizationId", "reason", "confirmed", "recordVersion"]) || !isUuid(body.authorizationId) || body.confirmed !== true) return null
  if (!Number.isSafeInteger(body.recordVersion) || (body.recordVersion as number) < 1) return null
  const reason = note(body.reason)
  return reason ? { caseId: body.caseId, authorizationId: body.authorizationId, reason, confirmed: true, recordVersion: body.recordVersion as number } : null
}

export function managerArgs(operation: ManagerOperation, raw: unknown): ManagerArgs | null {
  const body = asRecord(raw)
  if (!body || body.operation !== operation || !managerOperations.includes(operation) || !isUuid(body.caseId) || body.confirmed !== true) return null
  if (operation === "verify") {
    if (!onlyKeys(body, ["operation", "caseId", "accessLevel", "evidence", "confirmed"])) return null
    if (typeof body.accessLevel !== "string" || !managerLevels.includes(body.accessLevel as ManagerLevel)) return null
    const evidence = note(body.evidence, 10, 1000)
    return evidence ? { caseId: body.caseId, accessLevel: body.accessLevel as ManagerLevel, evidence, confirmed: true } : null
  }
  if (!onlyKeys(body, ["operation", "caseId", "reason", "confirmed"])) return null
  const reason = note(body.reason)
  return reason ? { caseId: body.caseId, reason, confirmed: true } : null
}
