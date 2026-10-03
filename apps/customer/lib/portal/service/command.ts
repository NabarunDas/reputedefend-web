import { NextRequest, NextResponse } from "next/server"
import { privateResponseHeaders } from "@/lib/access"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { customerBackendConfig } from "@/lib/config"
import { portalAvailable, portalSessionCookieName } from "@/lib/portal/config"
import { isPublicCaseReference } from "@/lib/portal/cases/parse"
import { isUuid } from "@/lib/uuid"

const SIGN_IN = "Sign in again to continue."
const MISSING = "We couldn't find that case."
const UNAVAILABLE = "This action is no longer available."
const QUOTE_UNAVAILABLE = "This quote is no longer available to accept."
const STALE = "This page is out of date. Refresh it and try again."
const CONFIRM = "Confirm this step before continuing."
const RETRY = "We couldn't complete that step. Please try again shortly."
const NOT_READY = "Service details are not available right now. Refresh the page and try again."

const SELECTOR = /^ca-[a-f0-9]{64}$/
const OPERATIONS = ["accept_quote", "decline_quote", "accept_agreement", "decline_agreement", "revoke_authorization"] as const

type Operation = (typeof OPERATIONS)[number]

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
  const config = customerBackendConfig()
  return !!config && request.headers.get("origin") === config.origin && request.nextUrl.origin === config.origin
}

function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  return Object.keys(body).length === allowed.length && allowed.every(key => Object.hasOwn(body, key))
}

function confirmationFor(operation: Operation, value: unknown): Record<string, boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const keys = Object.keys(value)
  if (operation === "accept_quote" || operation === "accept_agreement") {
    if (keys.length !== 1 || keys[0] !== "accepted" || (value as { accepted?: unknown }).accepted !== true) return null
    return { accepted: true }
  }
  if (keys.length !== 1 || keys[0] !== "confirmed" || (value as { confirmed?: unknown }).confirmed !== true) return null
  return { confirmed: true }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export async function portalServiceCommand(request: NextRequest) {
  if (!portalAvailable()) return reply(NOT_READY, 404)
  if (!originOk(request) || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return reply(NOT_READY)
  }
  const token = request.cookies.get(portalSessionCookieName())?.value
  const key = request.headers.get("idempotency-key")
  const body = await readJson(request, 4096)
  if (!validToken(token) || !isUuid(key) || !body) return reply(SIGN_IN)
  if (!onlyKeys(body, ["reference", "selector", "operation", "confirmation"])) return reply(NOT_READY)
  if (typeof body.reference !== "string" || !isPublicCaseReference(body.reference)) return reply(MISSING, 404)
  if (typeof body.selector !== "string" || !SELECTOR.test(body.selector)) return reply(UNAVAILABLE)
  if (typeof body.operation !== "string" || !(OPERATIONS as readonly string[]).includes(body.operation)) return reply(NOT_READY)
  const operation = body.operation as Operation
  const confirmation = confirmationFor(operation, body.confirmation)
  if (!confirmation) return reply(CONFIRM, 400)

  try {
    const result = await backend().rpc<unknown>("customer_portal_service_command_v1", {
      p_token_hash: tokenHash(token),
      p_request: key,
      p_reference: body.reference,
      p_selector: body.selector,
      p_operation: operation,
      p_data: confirmation,
    })
    if (result == null) return reply(SIGN_IN)
    if (!isRecord(result) || typeof result.status !== "string") return reply(RETRY, 503)
    if (result.status === "success") return NextResponse.json({ status: "success" }, { headers: privateResponseHeaders })
    if (result.status === "not_found") return reply(MISSING, 404)
    if (result.status === "invalid") return reply(CONFIRM, 400)
    if (result.status === "conflict") return reply(STALE, 409)
    if (result.status === "denied" && operation === "accept_quote") return reply(QUOTE_UNAVAILABLE)
    if (result.status === "unavailable" || result.status === "denied") return reply(UNAVAILABLE)
    return reply(RETRY, 503)
  } catch {
    return reply(RETRY, 503)
  }
}
