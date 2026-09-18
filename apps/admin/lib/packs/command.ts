import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { packArgs, isPackApproveArgs, isPackMoveArgs } from "./validation"
import { packOperations, type PackOperation } from "./model"

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

function commandMessage(status: string | undefined, fallback: string): string {
  if (status === "unauthorized") return "Your session has ended. Please sign in again."
  if (status === "conflict") return "That pack is not available. Reload the case before trying again."
  if (status === "denied") return "That action is not allowed for this pack."
  if (status === "invalid") return "Check the fields before saving."
  return fallback
}

const successMessage: Record<PackOperation, string> = {
  create: "A draft prepared pack has been created.",
  add_item: "The evidence version has been added to the pack.",
  remove_item: "The evidence version has been removed from the pack.",
  move_item: "The pack order has been updated.",
  approve: "The prepared pack has been approved. This does not confirm payment, permission or submission to Google.",
}

export async function packCommand(request: NextRequest) {
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
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { operation?: unknown }).operation !== "string" || !packOperations.includes((body as { operation: PackOperation }).operation)) {
      return reply("Check the fields before saving.", 400)
    }
    const operation = (body as { operation: PackOperation }).operation
    const args = packArgs(operation, body)
    if (!args) return reply("Check the fields before saving.", 400)
    const payload = operation === "create" ? {}
      : operation === "approve" && isPackApproveArgs(args) ? { note: args.note, confirmed: true as const }
      : operation === "move_item" && isPackMoveArgs(args) ? { versionId: args.versionId, direction: args.direction }
      : "versionId" in args ? { versionId: args.versionId }
      : {}
    const result = await backend().rpc<{ status: string; id?: string; packNumber?: number; packStatus?: string; recordVersion?: number; itemId?: string }>("admin_prepared_pack_command_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_case: args.caseId,
      p_pack: "packId" in args ? args.packId : null,
      p_version: "recordVersion" in args ? args.recordVersion : null,
      p_operation: operation,
      p_data: payload,
    })
    if (result.status !== "success") return reply(commandMessage(result.status, "The prepared pack could not be updated."), mapStatus(result.status))
    return reply(successMessage[operation], 200, {
      id: result.id, packNumber: result.packNumber, packStatus: result.packStatus, recordVersion: result.recordVersion, itemId: result.itemId,
    })
  } catch {
    return reply("We couldn’t confirm the change. Reload the case before trying again.", 503)
  }
}
