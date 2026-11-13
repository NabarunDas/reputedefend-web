import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { telloyaDemoWriteAvailable } from "./telloya-demo-status"
import { reconcileTelloyaSalesContextAfterDemo } from "./telloya-sales-context-command"

const STATUSES = new Set(["NOT_BOOKED", "BOOKED", "COMPLETED"])

const reply = (message: string, status: number) =>
  NextResponse.json({ message }, { status, headers: privateResponseHeaders })

export function telloyaDemoCommandArgs(body: unknown): {
  p_enquiry_id: string
  p_expected_version: number
  p_status: string
  p_at: string | null
  p_timezone: string
  p_note: string
} | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const status = record.status
  const timezone = typeof record.timezone === "string" ? record.timezone : ""
  const note = typeof record.note === "string" ? record.note : ""
  const at = record.at === null || record.at === undefined || record.at === ""
    ? null
    : typeof record.at === "string" && Number.isFinite(Date.parse(record.at)) ? new Date(record.at).toISOString() : undefined
  if (!isUuid(record.enquiryId) || typeof status !== "string" || !STATUSES.has(status)) return null
  if (!Number.isInteger(record.expectedVersion) || (record.expectedVersion as number) < 0) return null
  if (at === undefined || timezone.length > 80 || note.length > 500) return null
  if (status === "BOOKED" && (!at || timezone.trim() === "")) return null
  if (status === "COMPLETED" && !at) return null
  return {
    p_enquiry_id: record.enquiryId,
    p_expected_version: record.expectedVersion as number,
    p_status: status,
    p_at: at,
    p_timezone: timezone,
    p_note: note,
  }
}

export async function telloyaDemoCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  if (!telloyaDemoWriteAvailable()) return reply("Recording stays off. The admin journey flag is not enabled.", 403)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = "", size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const args = telloyaDemoCommandArgs(body)
    if (!args) return reply("Check the demonstration time, time zone and note before saving.", 400)
    const result = await backend().rpc<{ status: string; version?: number }>("telloya_admin_demo_transition_v1", {
      ...args,
      p_token: tokenHash(token),
      p_idempotency_key: key,
    })
    switch (result.status) {
      case "recorded":
      case "replay":
        if (args.p_status === "COMPLETED") {
          const bootstrap = await reconcileTelloyaSalesContextAfterDemo({
            token,
            enquiryId: args.p_enquiry_id,
            idempotencyKey: key,
          })
          if (bootstrap?.exception || bootstrap?.message) {
            return NextResponse.json({
              message: "Saved. The demonstration record has been updated.",
              salesContext: bootstrap,
            }, { status: 200, headers: privateResponseHeaders })
          }
        }
        return reply("Saved. The demonstration record has been updated.", 200)
      case "unauthorized":
        return reply("Your session has ended. Please sign in again.", 401)
      case "stale_version":
        return reply("This demonstration has changed. Reload it before trying again.", 409)
      case "not_telloya":
        return reply("A demonstration can be recorded only for a Telloya enquiry.", 403)
      case "missing_enquiry":
        return reply("This enquiry could not be found. Reload it before trying again.", 404)
      case "invalid_timezone":
        return reply("Choose a recognised time zone before booking the demonstration.", 400)
      case "invalid":
      case "invalid_transition":
        return reply("That demonstration change is not available from the current status.", 400)
      default:
        return reply("This deployment does not have the demonstration record. Nothing was saved.", 503)
    }
  } catch {
    return reply("This deployment does not have the demonstration record. Nothing was saved.", 503)
  }
}
