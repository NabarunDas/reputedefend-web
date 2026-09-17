import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { authConfig, sessionCookie } from "../auth/config"
import { backend, tokenHash, validToken } from "../auth/backend"
import { privateResponseHeaders } from "../access"
import { isUuid } from "./model"
import { commandArgs, type Operation } from "./validation"
const reply = (message: string, status: number, id?: string) => NextResponse.json({ message, ...(id ? { id } : {}) }, { status, headers: privateResponseHeaders })
const rpcs = { save: "admin_record_save_v1", verify: "admin_contact_verify_v1", membership: "admin_membership_save_v1" } as const
export async function recordCommand(request: NextRequest, operation: Operation) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  if (request.headers.get("origin") !== config.origin || request.nextUrl.origin !== config.origin) return reply("Please reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Please reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  if (!validToken(token)) return reply("Please sign in again.", 401)
  const requestId = request.headers.get("idempotency-key")
  if (!isUuid(requestId)) return reply("Please reload the form and try again.", 400)
  try {
    const reader = request.body?.getReader(), decoder = new TextDecoder()
    let raw = "", size = 0
    if (reader) for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const args = commandArgs(operation, body)
    if (!args) return reply("Please check the fields and include a reason of at least ten characters.", 400)
    const result = await backend().rpc<{ status: string; id?: string }>(rpcs[operation], { ...args, p_token: tokenHash(token), p_request: requestId })
    switch (result.status) {
      case "success": return reply("Saved. The activity history has been updated.", 200, result.id)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply("Sign out and sign in with a new email code, then make this change within five minutes.", 403)
      case "conflict": return reply("This record has changed, or that email is already in use. Reload the record and check it before trying again.", 409)
      case "denied": return reply("Verify a current contact method before confirming business authority. A blank phone number cannot be verified.", 403)
      case "invalid": return reply("Check the record details and try again.", 400)
      default: return reply("We couldn’t confirm the change. Reload the record before trying again.", 503)
    }
  } catch { return reply("We couldn’t confirm the change. Reload the record before trying again.", 503) }
}
