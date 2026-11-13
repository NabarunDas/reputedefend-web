import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { telloyaSalesBootstrapAllowed } from "./telloya-sales-context"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

const OPERATIONS = new Set(["bootstrap", "confirm_business", "confirm_location", "create_location"])

export type TelloyaSalesContextOperation = "bootstrap" | "confirm_business" | "confirm_location" | "create_location"

const UNAVAILABLE =
  "Telloya sales-context is unavailable on this deployment until the source-only composite is applied. The offer workspace stays read-only."

export function parseTelloyaSalesContextCommand(body: unknown): {
  enquiryId: string
  operation: TelloyaSalesContextOperation
  businessId?: string
  locationId?: string
  locationName?: string
  country?: string
} | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  const enquiryId = record.enquiryId
  const operation = typeof record.operation === "string" ? record.operation : "bootstrap"
  if (!isUuid(enquiryId) || !OPERATIONS.has(operation)) return null
  if (operation === "confirm_business" && !isUuid(record.businessId)) return null
  if (operation === "confirm_location" && !isUuid(record.locationId)) return null
  if (operation === "create_location") {
    if (record.locationName !== undefined && (typeof record.locationName !== "string" || record.locationName.length > 200)) return null
    if (record.country !== undefined && (typeof record.country !== "string" || record.country.length > 100)) return null
  }
  return {
    enquiryId,
    operation: operation as TelloyaSalesContextOperation,
    businessId: isUuid(record.businessId) ? record.businessId : undefined,
    locationId: isUuid(record.locationId) ? record.locationId : undefined,
    locationName: typeof record.locationName === "string" ? record.locationName : undefined,
    country: typeof record.country === "string" ? record.country : undefined,
  }
}

type CommandResult = {
  status: string
  reason?: string
  exception?: string
  message?: string
  version?: number
}

function mapResult(result: CommandResult): { ok: boolean; status: number; message: string; exception?: string } {
  if (result.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
  if (result.status === "unauthorized") return { ok: false, status: 401, message: "Your session has ended. Please sign in again." }
  if (result.status === "success") {
    return {
      ok: true,
      status: 200,
      message: result.message || "Telloya offer workspace is ready for review. No offer email was sent.",
      exception: result.exception,
    }
  }
  if (result.status === "denied" && result.reason === "demonstration_not_completed") {
    return { ok: false, status: 409, message: "Complete the offline demonstration before preparing the offer workspace." }
  }
  if (result.status === "denied" && result.reason === "not_telloya") {
    return { ok: false, status: 403, message: "A Telloya sales context can be prepared only for a Telloya enquiry." }
  }
  if (result.exception === "revoked_membership" || result.reason === "revoked") {
    return { ok: false, status: 409, message: "Business authority has been withdrawn. Matching does not restore it.", exception: "revoked_membership" }
  }
  if (result.exception) {
    return {
      ok: false,
      status: 409,
      message: result.message || "Resolve the highlighted exception before continuing.",
      exception: result.exception,
    }
  }
  if (result.status === "invalid") return { ok: false, status: 400, message: "Check the enquiry before preparing the offer workspace." }
  if (result.status === "conflict") {
    return {
      ok: false,
      status: 409,
      message: result.message || "Telloya sales context could not be prepared safely. Reload the enquiry before trying again.",
      exception: result.exception,
    }
  }
  return { ok: false, status: 503, message: "We couldn’t prepare the offer workspace. Reload the enquiry before trying again." }
}

export async function reconcileTelloyaSalesContext(input: {
  token: string
  enquiryId: string
  operation?: TelloyaSalesContextOperation
  businessId?: string
  locationId?: string
  locationName?: string
  country?: string
  idempotencyKey: string
}): Promise<{ ok: boolean; status: number; message: string; exception?: string }> {
  if (!telloyaSalesBootstrapAllowed()) {
    return { ok: false, status: 403, message: "Telloya sales-context bootstrap stays closed outside Preview with the journey flag enabled." }
  }
  const operation = input.operation ?? "bootstrap"
  try {
    const result = await backend().rpc<CommandResult>("telloya_sales_context_command_v1", {
      p_token: tokenHash(input.token),
      p_request: input.idempotencyKey,
      p_operation: operation,
      p_payload: {
        enquiryId: input.enquiryId,
        ...(input.businessId ? { businessId: input.businessId } : {}),
        ...(input.locationId ? { locationId: input.locationId } : {}),
        ...(input.locationName ? { locationName: input.locationName } : {}),
        ...(input.country ? { country: input.country } : {}),
      },
    })
    return mapResult(result)
  } catch {
    // Fail closed. Never fall back to multi-step commercial writes: network,
    // auth, SQL and unknown commit outcomes all look like the same storage error.
    return { ok: false, status: 503, message: UNAVAILABLE }
  }
}

export async function telloyaSalesContextCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  if (!telloyaSalesBootstrapAllowed()) {
    return reply("Telloya sales-context bootstrap stays closed outside Preview with the journey flag enabled.", 403)
  }
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
    const parsed = parseTelloyaSalesContextCommand(body)
    if (!parsed) return reply("Check the enquiry before preparing the offer workspace.", 400)
    const result = await reconcileTelloyaSalesContext({
      token,
      enquiryId: parsed.enquiryId,
      operation: parsed.operation,
      businessId: parsed.businessId,
      locationId: parsed.locationId,
      locationName: parsed.locationName,
      country: parsed.country,
      idempotencyKey: key,
    })
    return reply(result.message, result.status, result.exception ? { exception: result.exception } : {})
  } catch {
    return reply("We couldn’t prepare the offer workspace. Reload the enquiry before trying again.", 503)
  }
}

/** Used after a successful COMPLETED demo transition. Never blocks demo recording. */
export async function reconcileTelloyaSalesContextAfterDemo(input: {
  token: string
  enquiryId: string
  idempotencyKey: string
}): Promise<{ exception?: string; message?: string } | null> {
  if (!telloyaSalesBootstrapAllowed()) return null
  try {
    const result = await reconcileTelloyaSalesContext({
      token: input.token,
      enquiryId: input.enquiryId,
      operation: "bootstrap",
      idempotencyKey: input.idempotencyKey,
    })
    return { exception: result.exception, message: result.message }
  } catch {
    return { message: "Telloya sales-context bootstrap could not finish. Open the enquiry to retry." }
  }
}
