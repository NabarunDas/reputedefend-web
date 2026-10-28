import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { renderPackReady } from "../../../../lib/email/fulfilment"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, customerPortalOrigin, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { confirmedReplyMailbox } from "../communications/brand-email"
import { communicationsSendEnabled, outgoingFromAddress } from "../communications/gate"
import { isUuid } from "../records/model"
import { packArgs, isPackApproveArgs, isPackEmailArgs, isPackItemArgs, isPackMoveArgs, isPackUnpublishArgs } from "./validation"
import { packOperations, type PackOperation } from "./model"
import { PACK_COMMAND_CONFLICT, PACK_COMMAND_UNCERTAIN, packDeniedMessage, packPreflightFailedMessage } from "./publication"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest): Promise<{ body: unknown } | NextResponse> {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 32768) { await reader.cancel(); return reply("That request is too large.", 413) }
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

function commandMessage(operation: PackOperation, status: string | undefined, reason?: string): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return PACK_COMMAND_CONFLICT
  if (status === "denied") return packDeniedMessage(operation, reason)
  if (status === "invalid") return "Check the fields before saving."
  return PACK_COMMAND_UNCERTAIN
}

function safeErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : ""
  return /^[A-Za-z0-9_]+$/.test(name) ? name : "Error"
}

const successMessage: Record<PackOperation, string> = {
  create: "A draft prepared pack has been created.",
  add_item: "The evidence version has been added to the pack.",
  remove_item: "The evidence version has been removed from the pack.",
  move_item: "The pack order has been updated.",
  set_item_role: "The document role has been updated. The pack is still a draft.",
  approve: "The prepared pack has been approved. This does not confirm payment, permission or submission to Google.",
  publish: "The approved pack is now available in the customer portal. This does not submit anything to Google.",
  unpublish: "The pack is no longer published. The customer cannot view these files until it is published again.",
  send_pack_email: "The pack-ready email is queued. Queued is not delivered.",
}

export async function packCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value, key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  let operation: PackOperation | null = null
  let stage: "request" | "mail_context" | "command" = "request"
  try {
    const parsed = await readJson(request)
    if (parsed instanceof NextResponse) return parsed
    const body = parsed.body
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { operation?: unknown }).operation !== "string" || !packOperations.includes((body as { operation: PackOperation }).operation)) {
      return reply("Check the fields before saving.", 400)
    }
    operation = (body as { operation: PackOperation }).operation
    const args = packArgs(operation, body)
    if (!args) return reply("Check the fields before saving.", 400)
    let email: Record<string, unknown> = {}
    if ((operation === "publish" || operation === "send_pack_email") && (operation === "send_pack_email" || communicationsSendEnabled()) && ("packId" in args)) {
      if (operation === "send_pack_email" && !communicationsSendEnabled()) return reply("Outgoing email is switched off. The pack stays available in the portal and no email was queued.", 403)
      stage = "mail_context"
      const context = await backend().rpc<{
        status?: string
        caseRef?: string
        amountMinor?: number
        currency?: string
        serviceCode?: string
        serviceName?: string
      }>("admin_guided_pack_mail_context_v1", {
        p_token: tokenHash(token),
        p_case: args.caseId,
        p_pack: args.packId,
      })
      if (context.status === "applicable" && (operation === "send_pack_email" || communicationsSendEnabled())) {
        const origin = customerPortalOrigin()
        const from = outgoingFromAddress()
        const replyTo = confirmedReplyMailbox()
        if (!replyTo) return reply("The pack notification was not queued. A monitored reply address is not confirmed.", operation === "publish" ? 409 : 409)
        const rendered = origin && from && context.caseRef && context.serviceCode && context.serviceName && context.amountMinor != null && context.currency
          ? renderPackReady({
            serviceCode: context.serviceCode,
            serviceName: context.serviceName,
            caseRef: context.caseRef,
            amountMinor: context.amountMinor,
            currency: context.currency,
            origin,
            replyTo,
          })
          : null
        if (!rendered || !from || !origin) {
          return reply(operation === "publish"
            ? "The pack was not published. The customer email could not be prepared."
            : "The pack notification was not queued. The customer email could not be prepared.", 503)
        }
        email = {
          subject: rendered.subject,
          bodyText: rendered.text,
          bodyHtml: rendered.html,
          fromAddress: from,
          customerOrigin: origin,
          sendEnabled: true,
          replyTo,
        }
      } else if (operation === "send_pack_email") {
        return reply("This pack is not ready for a customer notification. No email was queued.", 409)
      }
    }
    stage = "command"
    const payload = operation === "create" ? {}
      : operation === "send_pack_email" && isPackEmailArgs(args) ? email
      : operation === "publish" && isPackApproveArgs(args) ? { note: args.note, confirmed: true as const, ...email }
      : operation === "approve" && isPackApproveArgs(args) ? { note: args.note, confirmed: true as const }
      : operation === "unpublish" && isPackUnpublishArgs(args) ? { reason: args.reason, confirmed: true as const }
      : operation === "move_item" && isPackMoveArgs(args) ? { versionId: args.versionId, direction: args.direction }
      : isPackItemArgs(args) ? { versionId: args.versionId, ...(args.role ? { role: args.role } : {}) }
      : {}
    const result = await backend().rpc<{ status: string; id?: string; packNumber?: number; packStatus?: string; recordVersion?: number; itemId?: string; reason?: string; packEmail?: string }>("admin_prepared_pack_command_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_case: args.caseId,
      p_pack: "packId" in args ? args.packId : null,
      p_version: "recordVersion" in args ? args.recordVersion : null,
      p_operation: operation,
      p_data: payload,
    })
    if (result.status !== "success") return reply(commandMessage(operation, result.status, result.reason), mapStatus(result.status))
    const message = operation === "send_pack_email" && result.packEmail === "already_queued"
      ? "The pack notification was already queued. Another copy was not sent."
      : successMessage[operation]
    return reply(message, 200, {
      id: result.id, packNumber: result.packNumber, packStatus: result.packStatus, recordVersion: result.recordVersion, itemId: result.itemId,
    })
  } catch (error) {
    const errorName = safeErrorName(error)
    if (stage === "mail_context") {
      console.error(JSON.stringify({
        event: "pack_command_preflight_failed",
        operation,
        correlationId: key,
        stage: "mail_context",
        errorName,
      }))
      return reply(packPreflightFailedMessage(operation), 503, { correlationId: key })
    }
    console.error(JSON.stringify({
      event: "pack_command_uncertain",
      operation,
      correlationId: key,
      stage: "command",
      errorName,
    }))
    return reply(PACK_COMMAND_UNCERTAIN, 503, { correlationId: key })
  }
}
