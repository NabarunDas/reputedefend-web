import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { exportFilename, toCsv } from "./csv"
import { isPreset, isReportKey, parseDateOnly } from "./model"

const json = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit = 8192): Promise<{ error: NextResponse } | { body: Record<string, unknown> }> {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
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

function guard(request: NextRequest): { error: NextResponse } | { token: string; key: string } {
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

export async function reportExportCommand(request: NextRequest): Promise<NextResponse> {
  const session = guard(request)
  if ("error" in session) return session.error
  const parsed = await readJson(request)
  if ("error" in parsed) return parsed.error
  const body = parsed.body!
  const reportKey = String(body.reportKey || "")
  const preset = String(body.preset || "today")
  const startDate = parseDateOnly(typeof body.startDate === "string" ? body.startDate : undefined)
  const endDate = parseDateOnly(typeof body.endDate === "string" ? body.endDate : undefined)
  if (!isReportKey(reportKey) || !isPreset(preset)) return json("That report is not available.", 400)
  const result = await backend().rpc<Record<string, unknown>>("admin_report_export_v1", {
    p_token: tokenHash(session.token!),
    p_request: session.key,
    p_key: reportKey,
    p_preset: preset,
    p_start_date: startDate,
    p_end_date: endDate,
    p_now: null,
  })
  if (!result || result.status === "unauthorized") return json("Please sign in again.", 401)
  if (result.status === "conflict") return json("This export request conflicts with an earlier request.", 409)
  if (result.status === "denied") return json("Narrow the date range. This export exceeds the 5,000-row limit.", 400, { reason: result.reason, count: result.count })
  if (result.status !== "success") return json("Check the report and date range.", 400)
  const rows = (result.rows as Array<Record<string, unknown>>) || []
  const temporalMode = result.temporalMode === "CURRENT" ? "CURRENT" : "PERIOD"
  const meta = temporalMode === "CURRENT"
    ? "# temporalMode=CURRENT\r\n# period=current snapshot (not a selected-period population)\r\n"
    : `# temporalMode=PERIOD\r\n# timezone=Europe/London\r\n`
  const csv = meta + toCsv(
    ["id", "occurredAt", "label", "amountMinor", "currency", "elapsedSeconds"],
    rows.map(row => [row.id, row.occurredAt, row.label, row.amountMinor, row.currency, row.elapsedSeconds]),
    [3, 5],
  )
  return new NextResponse(csv, {
    status: 200,
    headers: {
      ...privateResponseHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(reportKey)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  })
}

export async function savedFilterCommand(request: NextRequest): Promise<NextResponse> {
  const session = guard(request)
  if ("error" in session) return session.error
  const parsed = await readJson(request)
  if ("error" in parsed) return parsed.error
  const body = parsed.body!
  const operation = String(body.operation || "")
  const version = body.version == null ? null : Number(body.version)
  const result = await backend().rpc<{ status?: string; id?: string; version?: number }>("admin_saved_filter_command_v1", {
    p_token: tokenHash(session.token!),
    p_request: session.key,
    p_operation: operation,
    p_payload: body.payload ?? {},
    p_version: version,
  })
  if (!result || result.status === "unauthorized") return json("Please sign in again.", 401)
  if (result.status === "success") return json("Saved filter updated.", 200, { id: result.id, version: result.version })
  if (result.status === "conflict") return json("This saved filter has changed. Reload and try again.", 409)
  if (result.status === "denied") return json("You can only manage your own saved filters.", 403)
  return json("Check the saved filter name and fields.", 400)
}
