import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, newToken, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { authorizationArgs, managerArgs } from "./validation"
import { authorizationOperations, managerOperations, LOST_LINK_NOTE, type AuthorizationOperation, type ManagerOperation } from "./model"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit = 65536): Promise<{ body: unknown } | NextResponse> {
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
    case "reauth_required": return 403
    default: return 503
  }
}

function commandMessage(status: string | undefined): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That record is not available. Reload the case before trying again."
  if (status === "denied") return "That action is not allowed until the required authority checks are current."
  if (status === "invalid") return "Check the fields before saving."
  if (status === "reauth_required") return "Sign in again within the last five minutes to continue."
  return "The authorisation record could not be updated."
}

function actionLink(id: string, secret: string): string | null {
  const origin = authConfig()?.customerOrigin
  return origin ? `${origin}/action/${id}#t=${secret}` : `/action/${id}#t=${secret}`
}

export async function authorizationCommand(request: NextRequest) {
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
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { operation?: unknown }).operation !== "string"
      || !authorizationOperations.includes((body as { operation: AuthorizationOperation }).operation)) {
      return reply("Check the fields before saving.", 400)
    }
    const operation = (body as { operation: AuthorizationOperation }).operation
    const args = authorizationArgs(operation, body)
    if (!args) return reply("Check the fields before saving.", 400)
    const secret = newToken()
    const payload = operation === "create_agreement_action" && "bodyText" in args ? {
      kind: args.kind, title: args.title, bodyText: args.bodyText, scopeText: args.scopeText, expiresAt: args.expiresAt, secretHash: tokenHash(secret),
    } : operation === "revoke_action" && "actionId" in args && "reason" in args && !("authorizationId" in args) ? {
      actionId: args.actionId, reason: args.reason, confirmed: true,
    } : operation === "create_revocation_action" && "authorizationId" in args && "expiresAt" in args ? {
      authorizationId: args.authorizationId, expiresAt: args.expiresAt, secretHash: tokenHash(secret),
    } : "authorizationId" in args && "recordVersion" in args ? {
      authorizationId: args.authorizationId, reason: args.reason, confirmed: true, recordVersion: args.recordVersion,
    } : {}
    const result = await backend().rpc<{
      status: string; id?: string; replay?: boolean; expiresAt?: string; agreementVersionId?: string
      versionNumber?: number; actionStatus?: string; authorizationStatus?: string; recordVersion?: number
    }>("admin_authorization_command_v1", {
      p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_operation: operation, p_data: payload,
    })
    if (result.status !== "success") return reply(commandMessage(result.status), mapStatus(result.status))
    const issued = (operation === "create_agreement_action" || operation === "create_revocation_action") && result.replay !== true && result.id
    return reply(
      issued ? `The secure customer action is ready. ${LOST_LINK_NOTE}` : operation === "create_agreement_action" || operation === "create_revocation_action"
        ? "This action was already created. The secret cannot be shown again. Revoke it and create a new action if the link was lost."
        : "The authorisation record has been updated. This does not change the case stage or take payment.",
      200,
      issued ? { id: result.id, actionUrl: actionLink(result.id!, secret), expiresAt: result.expiresAt, versionNumber: result.versionNumber } : { id: result.id, actionStatus: result.actionStatus, authorizationStatus: result.authorizationStatus, recordVersion: result.recordVersion },
    )
  } catch {
    return reply("We couldn’t confirm the change. Reload the case before trying again.", 503)
  }
}

export async function managerAccessCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const parsed = await readJson(request, 4096)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { operation?: unknown }).operation !== "string"
      || !managerOperations.includes((body as { operation: ManagerOperation }).operation)) {
      return reply("Check the fields before saving.", 400)
    }
    const operation = (body as { operation: ManagerOperation }).operation
    const args = managerArgs(operation, body)
    if (!args) return reply("Check the fields before saving.", 400)
    const payload = operation === "verify" && "accessLevel" in args
      ? { accessLevel: args.accessLevel, evidence: args.evidence, confirmed: true }
      : { reason: "reason" in args ? args.reason : "", confirmed: true }
    const result = await backend().rpc<{ status: string; id?: string; managerStatus?: string; recordVersion?: number }>("admin_manager_access_command_v1", {
      p_token: tokenHash(token), p_request: key, p_case: args.caseId, p_operation: operation, p_data: payload,
    })
    if (result.status !== "success") return reply(commandMessage(result.status), mapStatus(result.status))
    return reply(
      operation === "verify"
        ? "Google Manager access is recorded as verified. This is not customer permission, payment or a workflow transition."
        : "Google Manager access has been revoked. Managed readiness now requires a new verification.",
      200,
      { id: result.id, managerStatus: result.managerStatus, recordVersion: result.recordVersion },
    )
  } catch {
    return reply("We couldn’t confirm the change. Reload the case before trying again.", 503)
  }
}
