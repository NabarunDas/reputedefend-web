import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"

const reply = (message: string, status = 200, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

async function readJson(request: NextRequest): Promise<{ body: unknown } | NextResponse> {
  const reader = request.body?.getReader(), decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 8192) { await reader.cancel(); return reply("That request is too large.", 413) }
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
    case "reauth_required": return 403
    case "invalid": return 400
    default: return 503
  }
}

export async function jobsCommand(request: NextRequest) {
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
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as { operation?: unknown }).operation !== "string") {
      return reply("Check the fields before saving.", 400)
    }
    const operation = (body as { operation: string }).operation
    if (operation === "enqueue_probe") {
      const result = await backend().rpc<{ status?: string }>("admin_enqueue_job_probe_v1", {
        p_token: tokenHash(token), p_request: key,
      })
      if (result?.status === "success") return reply("A system health probe has been queued.", 200)
      return reply(result?.status === "unauthorized" ? "Your session has ended. Please sign in again." : "We couldn’t queue that probe.", mapStatus(result?.status))
    }
    if (operation === "replay") {
      const jobId = (body as { jobId?: unknown }).jobId
      const reason = (body as { reason?: unknown }).reason
      const confirmed = (body as { confirmed?: unknown }).confirmed
      const version = (body as { version?: unknown }).version
      if (!isUuid(jobId) || typeof reason !== "string" || reason.trim().length < 10 || reason.trim().length > 2000 || confirmed !== true || typeof version !== "number" || !Number.isInteger(version) || version < 1) {
        return reply("Check the fields before saving.", 400)
      }
      const result = await backend().rpc<{ status?: string }>("admin_job_replay_v1", {
        p_token: tokenHash(token), p_request: key, p_job: jobId, p_reason: reason.trim(), p_confirmed: true, p_version: version,
      })
      if (result?.status === "success") return reply("That dead-lettered job has been queued again.", 200)
      if (result?.status === "reauth_required") return reply("Sign out and sign in with a new email code, then replay within five minutes.", 403)
      if (result?.status === "denied") return reply("Only dead-lettered jobs can be replayed.", 403)
      if (result?.status === "conflict") return reply("That job changed. Reload the page and try again.", 409)
      return reply(result?.status === "unauthorized" ? "Your session has ended. Please sign in again." : "We couldn’t replay that job.", mapStatus(result?.status))
    }
    return reply("Check the fields before saving.", 400)
  } catch {
    return reply("We couldn’t confirm the change. Reload the page before trying again.", 503)
  }
}
