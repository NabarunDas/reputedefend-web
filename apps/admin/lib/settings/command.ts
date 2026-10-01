import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { commandMessage, isSettingsOperation, payloadLooksSecret, privacyDeletionEnabled } from "./model"
import { neutralizeCsvCell, toCsv } from "../reports/csv"

const json = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

function mapStatus(status?: string) {
  if (status === "unauthorized") return 401
  if (status === "reauth_required" || status === "denied") return 403
  if (status === "conflict") return 409
  if (status === "invalid") return 400
  return 200
}

async function readJson(request: NextRequest, limit = 8192): Promise<{ error: NextResponse } | { body: Record<string, unknown> }> {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return { error: json("That request is too large.", 413) } }
    raw += decoder.decode(value, { stream: true })
  }
  try { return { body: JSON.parse(raw || "{}") as Record<string, unknown> } }
  catch { return { error: json("Please check the form and try again.", 400) } }
}

function sessionOrError(request: NextRequest): { error: NextResponse } | { token: string; key: string } {
  const config = authConfig()
  if (!config) return { error: json("The workspace is unavailable. Please try again shortly.", 503) }
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) {
    return { error: json("Reload this page and try again.", 403) }
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return { error: json("Reload this page and try again.", 415) }
  }
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token) || !token) return { error: json("Please sign in again.", 401) }
  if (!isUuid(key) || !key) return { error: json("Reload the form and try again.", 400) }
  return { token, key }
}

export async function settingsCommand(request: NextRequest): Promise<NextResponse> {
  const gate = sessionOrError(request)
  if ("error" in gate) return gate.error
  const parsed = await readJson(request)
  if ("error" in parsed) return parsed.error
  const body = parsed.body
  const operation = typeof body.operation === "string" ? body.operation : ""
  const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown>
    : null
  const version = body.version == null ? null : Number(body.version)
  if (!isSettingsOperation(operation) || !payload) return json("Check the form and try again.", 400)
  if (payloadLooksSecret(payload)) return json("Check the form. Secrets cannot be stored in settings.", 400)
  if (operation === "execute_deletion" && !privacyDeletionEnabled()) {
    return json(commandMessage("denied", "deletion_disabled"), 403, { status: "denied", reason: "deletion_disabled" })
  }
  const result = await backend().rpc<{ status?: string; reason?: string }>("admin_settings_command_v1", {
    p_token: tokenHash(gate.token),
    p_request: gate.key,
    p_operation: operation,
    p_payload: payload,
    p_version: Number.isInteger(version) ? version : null,
  })
  if (!result || result.status === "unauthorized") return json("Please sign in again.", 401)
  return json(commandMessage(result.status, result.reason), mapStatus(result.status), { status: result.status, reason: result.reason })
}

function flattenExportRows(rows: Record<string, unknown> | undefined) {
  const out: Array<Array<string>> = []
  const customer = rows?.customer && typeof rows.customer === "object" ? rows.customer as Record<string, unknown> : null
  if (customer) out.push(["customer", String(customer.id || ""), neutralizeCsvCell(String(customer.fullName || "")), neutralizeCsvCell(String(customer.email || ""))])
  for (const [group, idKey, labelKey] of [
    ["cases", "id", "publicRef"],
    ["enquiries", "id", "subject"],
    ["communications", "id", "subject"],
    ["paymentReceipts", "id", "currency"],
  ] as const) {
    const list = Array.isArray(rows?.[group]) ? rows[group] as Array<Record<string, unknown>> : []
    for (const item of list) out.push([group, String(item[idKey] || ""), neutralizeCsvCell(String(item[labelKey] || "")), ""])
  }
  return out
}

export async function privacyExportCommand(request: NextRequest): Promise<NextResponse> {
  const gate = sessionOrError(request)
  if ("error" in gate) return gate.error
  const parsed = await readJson(request)
  if ("error" in parsed) return parsed.error
  const privacyRequestId = typeof parsed.body.privacyRequestId === "string" ? parsed.body.privacyRequestId : ""
  const version = parsed.body.version == null ? null : Number(parsed.body.version)
  if (!isUuid(privacyRequestId)) return json("Check the form and try again.", 400)
  const result = await backend().rpc<{
    status?: string
    reason?: string
    rowCount?: number
    rows?: Record<string, unknown>
  }>("admin_privacy_export_v1", {
    p_token: tokenHash(gate.token),
    p_request: gate.key,
    p_privacy_request: privacyRequestId,
    p_version: Number.isInteger(version) ? version : null,
  })
  if (!result || result.status === "unauthorized") return json("Please sign in again.", 401)
  if (result.status !== "success") {
    return json(commandMessage(result.status, result.reason), mapStatus(result.status), { status: result.status, reason: result.reason })
  }
  const csv = toCsv(["group", "id", "label", "extra"], flattenExportRows(result.rows))
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...privateResponseHeaders,
      "cache-control": "no-store",
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"privacy-export.csv\"",
    },
  })
}
