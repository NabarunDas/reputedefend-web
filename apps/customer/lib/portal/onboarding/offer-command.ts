import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerRequestOriginAllowed } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isUuid } from "@/lib/uuid"
import { commercialOfferAcceptEnabled } from "./flag"
import { OFFER_REF } from "./offer-types"

const SIGN_IN = "Sign in again to continue."
const NOT_READY = "Service details are not available right now. Refresh the page and try again."
const CONFIRM = "Confirm the agreement before continuing."
const STALE = "This page is out of date. Refresh it and try again. The offer has not been accepted."
const UNAVAILABLE = "We couldn't record acceptance for this offer just now. This does not say that there is no offer."
const RETRY = "We couldn't complete that step. Please try again shortly."
const CLOSED = "Acceptance is not available."
const OUTCOMES: Record<string, string> = {
  withdrawn: "This offer has been withdrawn. It cannot be accepted.",
  expired: "This offer has expired. It cannot be accepted.",
  superseded: "This offer has been replaced. It cannot be accepted.",
  changed: "This offer has changed. Refresh the page before doing anything else. It has not been accepted.",
  terms_pending: "The agreement for this offer is not available yet. It cannot be accepted.",
}

const KEYS = [
  "selector",
  "offerVersion",
  "priceMinor",
  "taxBehaviour",
  "taxMinor",
  "cadence",
  "agreementRef",
  "agreementAccepted",
  "recurringConsent",
  "confirmations",
] as const

const reply = (message: string, http = 401) =>
  NextResponse.json({ message }, { status: http, headers: privateResponseHeaders })

async function readJson(request: NextRequest, limit: number) {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let raw = ""
  let size = 0
  if (reader) for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); return null }
    raw += decoder.decode(value, { stream: true })
  }
  raw += decoder.decode()
  try { return JSON.parse(raw || "{}") as Record<string, unknown> }
  catch { return null }
}

function originOk(request: NextRequest) {
  return customerRequestOriginAllowed(request.headers.get("origin"), request.nextUrl.origin)
}

function integer(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return null
  return value
}

function confirmations(value: unknown): Record<string, true> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const keys = Object.keys(row)
  if (keys.length > 12) return null
  const clean: Record<string, true> = {}
  for (const key of keys) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key) || row[key] !== true) return null
    clean[key] = true
  }
  return clean
}

export async function portalCommercialOfferCommand(request: NextRequest) {
  if (!portalAvailable()) return reply(NOT_READY, 404)
  if (!commercialOfferAcceptEnabled()) return reply(CLOSED, 404)
  if (!originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply(NOT_READY)
  }
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request, 8192)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  if (Object.keys(body).length !== KEYS.length || KEYS.some(name => !Object.hasOwn(body, name))) return reply(NOT_READY)
  if (typeof body.selector !== "string" || !OFFER_REF.test(body.selector)) return reply(UNAVAILABLE, 404)
  const offerVersion = integer(body.offerVersion, 1, 1_000_000)
  const priceMinor = integer(body.priceMinor, 1, 100_000_000)
  const taxMinor = body.taxMinor == null ? null : integer(body.taxMinor, 0, 100_000_000)
  if (offerVersion == null || priceMinor == null || (body.taxMinor != null && taxMinor == null)) return reply(CONFIRM, 400)
  if (body.taxBehaviour !== "NOT_APPLICABLE" && body.taxBehaviour !== "INCLUSIVE" && body.taxBehaviour !== "EXCLUSIVE") return reply(CONFIRM, 400)
  if (body.cadence !== "MONTH" && body.cadence !== "YEAR" && body.cadence !== "ONCE") return reply(CONFIRM, 400)
  if (typeof body.agreementRef !== "string" || body.agreementRef.trim().length < 1 || body.agreementRef.length > 200) return reply(CONFIRM, 400)
  if (body.agreementAccepted !== true || typeof body.recurringConsent !== "boolean") return reply(CONFIRM, 400)
  const checked = confirmations(body.confirmations)
  if (!checked) return reply(CONFIRM, 400)
  if ((body.cadence === "MONTH" || body.cadence === "YEAR") && body.recurringConsent !== true) return reply(CONFIRM, 400)
  if (body.cadence === "ONCE" && body.recurringConsent) return reply(CONFIRM, 400)

  try {
    const result = await backend().rpc<unknown>("customer_portal_commercial_offer_command_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_selector: body.selector,
      p_data: {
        offerVersion,
        priceMinor,
        taxBehaviour: body.taxBehaviour,
        taxMinor,
        cadence: body.cadence,
        agreementRef: body.agreementRef,
        agreementAccepted: true,
        recurringConsent: body.recurringConsent,
        confirmations: checked,
      },
    })
    if (result == null) return reply(SIGN_IN)
    if (!result || typeof result !== "object" || Array.isArray(result)) return reply(RETRY, 503)
    const status = (result as { status?: unknown }).status
    if (status === "success") return NextResponse.json({ status: "success" }, { headers: privateResponseHeaders })
    if (status === "invalid") return reply(CONFIRM, 400)
    if (status === "conflict") return reply(STALE, 409)
    if (typeof status === "string" && OUTCOMES[status]) return reply(OUTCOMES[status], 409)
    if (status === "unavailable") return reply(UNAVAILABLE, 409)
    return reply(RETRY, 503)
  } catch {
    return reply(RETRY, 503)
  }
}
