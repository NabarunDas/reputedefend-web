import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { parseOnboardingCommand } from "./onboarding"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

export async function onboardingCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 32768) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const command = parseOnboardingCommand(body)
    if (!command) return reply("Check the selected customer, business, locations and note before saving.", 400)
    const result = await backend().rpc<{ status: string; reason?: string }>("admin_commercial_command_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_operation: command.operation,
      p_payload: command.payload,
      p_version: command.version,
    })
    switch (result.status) {
      case "success": return reply("Saved. The onboarding history has been updated.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "terms_unconfigured":
        if (result.reason === "quantities") return reply("The selected locations do not match the approved Telloya quantity. Guard is not given that same quantity. No price is offered.", 409)
        if (result.reason === "components") return reply("This plan does not include the required Telloya or Guard component. No price is offered.", 409)
        return reply("Commercial terms not yet configured. No price is offered.", 409)
      case "conflict":
        if (result.reason === "business") return reply("That business already has an open voice onboarding request. Reload it before trying again.", 409)
        if (result.reason === "offer") return reply("That business already has an open commercial offer. Reload it before trying again.", 409)
        if (result.reason === "product") return reply("This enquiry already has an open onboarding request for a different product.", 409)
        return reply("This request has changed. Reload it before trying again.", 409)
      case "denied":
        if (result.reason === "frozen") return reply("This offer is already prepared. The customer, business, locations and terms stay as they were.", 403)
        if (result.reason === "revoked") return reply("Business authority has been withdrawn. Matching does not restore it.", 403)
        if (result.reason === "membership") return reply("Verified authority needs existing email or phone proof and a recent Admin sign-in. This step does not change authority.", 403)
        if (result.reason === "offer_state") return reply("This offer is no longer a prepared offer, so it cannot be declined from this screen.", 403)
        return reply("That customer, business or location is not part of this request, or the request is not open.", 403)
      case "invalid": return reply("Check the selected records and the note before saving.", 400)
      default: return reply("We couldn’t confirm the change. Reload the enquiry before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t confirm the change. Reload the enquiry before trying again.", 503)
  }
}
