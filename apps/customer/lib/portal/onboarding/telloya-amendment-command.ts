import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isUuid } from "@/lib/uuid"
import { telloyaAmendmentEnabled } from "./flag"
import { OFFER_REF } from "./offer-types"

const reply = (message: string, http = 400) =>
  NextResponse.json({ message }, { status: http, headers: privateResponseHeaders })

export async function telloyaAmendmentCommand(request: NextRequest) {
  if (!portalAvailable()) return reply("Service details are not available right now. Refresh the page and try again.", 404)
  if (!telloyaAmendmentEnabled()) return reply("A change request is not available.", 403)
  if (!customerRequestOriginAllowed(request.headers.get("origin"), request.nextUrl.origin)) return reply("Reload this page and try again.", 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Sign in again to continue.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = "", size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 4096) { await reader.cancel(); return reply("That request is too large.", 413) }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) as Record<string, unknown> } catch { return reply("Please check the request and try again.") }
  if (typeof body.selector !== "string" || !OFFER_REF.test(body.selector)) return reply("This offer could not be found.", 404)
  if (typeof body.message !== "string" || body.message.trim().length < 1 || body.message.trim().length > 1000) {
    return reply("Describe the change in 1,000 characters or fewer.")
  }
  try {
    const result = await backend().rpc<{ status?: string } | null>("telloya_offer_amendment_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_selector: body.selector,
      p_message: body.message.trim(),
    })
    if (result === null) return reply("Sign in again to continue.", 401)
    if (result.status === "recorded" || result.status === "replay") return reply("Your change request has been recorded. The offer you were sent is unchanged.", 200)
    if (result.status === "offer_not_open") return reply("This offer is no longer open for a change request.", 409)
    if (result.status === "conflict") return reply("Reload the page before sending that request again.", 409)
    return reply("A change request is not available on this deployment.", 503)
  } catch {
    return reply("A change request is not available on this deployment.", 503)
  }
}
