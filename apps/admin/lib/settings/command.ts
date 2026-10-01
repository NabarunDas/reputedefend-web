import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { commandMessage, isSettingsOperation, payloadLooksSecret } from "./model"

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

export async function settingsCommand(request: NextRequest): Promise<NextResponse> {
  const config = authConfig()
  if (!config) return json("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) {
    return json("Reload this page and try again.", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return json("Reload this page and try again.", 415)
  }
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token) || !token) return json("Please sign in again.", 401)
  if (!isUuid(key) || !key) return json("Reload the form and try again.", 400)
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
  const result = await backend().rpc<{ status?: string; reason?: string }>("admin_settings_command_v1", {
    p_token: tokenHash(token),
    p_request: key,
    p_operation: operation,
    p_payload: payload,
    p_version: Number.isInteger(version) ? version : null,
  })
  if (!result || result.status === "unauthorized") return json("Please sign in again.", 401)
  return json(commandMessage(result.status, result.reason), mapStatus(result.status), { status: result.status, reason: result.reason })
}
