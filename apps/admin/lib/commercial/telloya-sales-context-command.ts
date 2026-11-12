import "server-only"
import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import type { OnboardingView } from "./onboarding"
import { telloyaSalesBootstrapAllowed } from "./telloya-sales-context"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

const REASON = "Automatic Telloya sales context after a completed offline demonstration."

function stepKey(enquiryId: string, step: string): string {
  const digest = createHash("sha256").update(`telloya-sales-context:${enquiryId}:${step}`).digest("hex")
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function websiteOf(value: string | undefined): string {
  const raw = (value ?? "").trim()
  if (!raw) return ""
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 2048)
  return `https://${raw}`.slice(0, 2048)
}

export function parseTelloyaSalesContextCommand(body: unknown): { enquiryId: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const enquiryId = (body as { enquiryId?: unknown }).enquiryId
  return isUuid(enquiryId) ? { enquiryId } : null
}

type CommandResult = { status: string; reason?: string; version?: number }

async function runCommercial(
  token: string,
  enquiryId: string,
  step: string,
  operation: string,
  version: number,
  payload: Record<string, unknown>,
): Promise<CommandResult> {
  return backend().rpc<CommandResult>("admin_commercial_command_v1", {
    p_token: tokenHash(token),
    p_request: stepKey(enquiryId, step),
    p_operation: operation,
    p_payload: { enquiryId, reason: REASON, ...payload },
    p_version: version,
  })
}

async function loadOnboarding(token: string, enquiryId: string): Promise<OnboardingView | null> {
  try {
    const result = await backend().rpc<OnboardingView | { missing: true } | null>("admin_commercial_onboarding_v1", {
      p_token: tokenHash(token),
      p_enquiry: enquiryId,
    })
    if (!result || "missing" in result) return null
    return result
  } catch {
    return null
  }
}

async function loadEnquiryHints(token: string, enquiryId: string): Promise<{
  businessName?: string
  websiteUrl?: string
  country?: string
  locationHint?: string
}> {
  try {
    const result = await backend().rpc<{ payload?: Record<string, unknown>; missing?: true } | null>("admin_enquiry_detail_v1", {
      p_token: tokenHash(token),
      p_id: enquiryId,
    })
    if (!result || "missing" in result || !result.payload) return {}
    const payload = result.payload
    return {
      businessName: typeof payload.businessName === "string" ? payload.businessName : undefined,
      websiteUrl: typeof payload.websiteUrl === "string" ? payload.websiteUrl : undefined,
      country: typeof payload.country === "string" ? payload.country : undefined,
      locationHint: typeof payload.locations === "string" ? payload.locations : undefined,
    }
  } catch {
    return {}
  }
}

async function demoCompleted(token: string, enquiryId: string): Promise<boolean> {
  try {
    const result = await backend().rpc<{ status?: string; demo_status?: string } | null>("telloya_admin_demo_v1", {
      p_token: tokenHash(token),
      p_enquiry_id: enquiryId,
    })
    return result?.status === "ready" && result.demo_status === "COMPLETED"
  } catch {
    return false
  }
}

export async function reconcileTelloyaSalesContext(input: {
  token: string
  enquiryId: string
  businessName?: string
  websiteUrl?: string
  country?: string
  locationHint?: string
}): Promise<{ ok: boolean; status: number; message: string; exception?: string }> {
  if (!telloyaSalesBootstrapAllowed()) {
    return { ok: false, status: 403, message: "Telloya sales-context bootstrap stays closed outside Preview with the journey flag enabled." }
  }
  if (!(await demoCompleted(input.token, input.enquiryId))) {
    return { ok: false, status: 409, message: "Complete the offline demonstration before preparing the offer workspace." }
  }

  const hints = await loadEnquiryHints(input.token, input.enquiryId)
  const businessName = (input.businessName || hints.businessName || "Telloya business").trim().slice(0, 200) || "Telloya business"
  const websiteUrl = websiteOf(input.websiteUrl || hints.websiteUrl)
  const country = (input.country || hints.country || "United Kingdom").trim().slice(0, 100) || "United Kingdom"

  let view = await loadOnboarding(input.token, input.enquiryId)
  if (!view?.supported) {
    return { ok: false, status: 503, message: "Commercial onboarding is unavailable on this deployment." }
  }

  if (!view.request) {
    const classified = await runCommercial(input.token, input.enquiryId, "classify", "classify", 0, { product: "TELLOYA" })
    if (classified.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
    if (classified.status === "unauthorized") return { ok: false, status: 401, message: "Your session has ended. Please sign in again." }
    if (classified.status !== "success") {
      return { ok: false, status: 409, message: "Telloya onboarding could not be opened for this enquiry." }
    }
    view = await loadOnboarding(input.token, input.enquiryId)
    if (!view?.supported || !view.request) {
      return { ok: false, status: 503, message: "Telloya onboarding could not be reloaded after classify." }
    }
  }

  if (view.request.product !== "TELLOYA") {
    return { ok: false, status: 403, message: "This enquiry already has a non-Telloya onboarding request.", exception: "resolve_customer" }
  }

  if (view.step === "customer") {
    if (view.candidates.length > 1) {
      return { ok: false, status: 409, message: "More than one customer matches this enquiry. Resolve the customer before continuing.", exception: "resolve_customer" }
    }
    const version = view.request.version
    const payload = view.candidates.length === 1
      ? { customerId: view.candidates[0].id }
      : { create: true }
    const matched = await runCommercial(input.token, input.enquiryId, "match_customer", "match_customer", version, payload)
    if (matched.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
    if (matched.status === "unauthorized") return { ok: false, status: 401, message: "Your session has ended. Please sign in again." }
    if (matched.status !== "success") {
      return { ok: false, status: 409, message: "The customer record could not be linked automatically.", exception: "resolve_customer" }
    }
    view = await loadOnboarding(input.token, input.enquiryId)
    if (!view?.supported || !view.request) {
      return { ok: false, status: 503, message: "Telloya onboarding could not be reloaded after customer match." }
    }
  }

  if (view.step === "business") {
    const usable = view.businesses.filter(item => item.membership !== "revoked")
    const revokedOnly = view.businesses.length > 0 && usable.length === 0
    if (revokedOnly) {
      return { ok: false, status: 409, message: "Business authority has been withdrawn. Matching does not restore it.", exception: "revoked_membership" }
    }
    if (usable.length > 1) {
      return { ok: false, status: 409, message: "More than one business could apply. Resolve the business before continuing.", exception: "resolve_business" }
    }
    const version = view.request.version
    const payload = usable.length === 1
      ? { businessId: usable[0].id, membership: usable[0].membership === "verified" ? "verified" : "pending" }
      : {
          create: true,
          name: businessName,
          website: websiteUrl,
          membership: "pending",
        }
    const matched = await runCommercial(input.token, input.enquiryId, "match_business", "match_business", version, payload)
    if (matched.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
    if (matched.status === "unauthorized") return { ok: false, status: 401, message: "Your session has ended. Please sign in again." }
    if (matched.status === "denied" && matched.reason === "revoked") {
      return { ok: false, status: 409, message: "Business authority has been withdrawn. Matching does not restore it.", exception: "revoked_membership" }
    }
    if (matched.status !== "success") {
      return { ok: false, status: 409, message: "The business record could not be linked automatically.", exception: "resolve_business" }
    }
    view = await loadOnboarding(input.token, input.enquiryId)
    if (!view?.supported || !view.request) {
      return { ok: false, status: 503, message: "Telloya onboarding could not be reloaded after business match." }
    }
  }

  if (view.step === "locations") {
    const selected = view.locations.filter(item => item.selected)
    if (selected.length === 1) {
      return { ok: true, status: 200, message: "Telloya offer workspace is ready for review. No offer email was sent." }
    }
    if (view.locations.length === 1) {
      const located = await runCommercial(input.token, input.enquiryId, "select_locations", "select_locations", view.request.version, {
        locationIds: [view.locations[0].id],
      })
      if (located.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
      if (located.status === "unauthorized") return { ok: false, status: 401, message: "Your session has ended. Please sign in again." }
      if (located.status !== "success") {
        return { ok: false, status: 409, message: "The operating location could not be confirmed automatically.", exception: "confirm_operating_location" }
      }
      return { ok: true, status: 200, message: "Telloya offer workspace is ready for review. No offer email was sent." }
    }
    // Do not invent a verified location from enquiry text. Leave an inline exception for Admin.
    void country
    return {
      ok: true,
      status: 200,
      message: "Telloya offer workspace is ready for review. Confirm the operating location before a sendable offer.",
      exception: "confirm_operating_location",
    }
  }

  return { ok: true, status: 200, message: "Telloya offer workspace is ready for review. No offer email was sent." }
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
    })
    return reply(result.message, result.status, result.exception ? { exception: result.exception } : {})
  } catch {
    return reply("We couldn’t prepare the offer workspace. Reload the enquiry before trying again.", 503)
  }
}

/** Used after a successful COMPLETED demo transition in the same request. Never blocks demo recording. */
export async function reconcileTelloyaSalesContextAfterDemo(input: {
  token: string
  enquiryId: string
}): Promise<void> {
  if (!telloyaSalesBootstrapAllowed()) return
  await reconcileTelloyaSalesContext({
    token: input.token,
    enquiryId: input.enquiryId,
  }).catch(() => undefined)
}
