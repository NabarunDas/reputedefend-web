import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { commercialBeginSetupEnabled } from "./begin-setup-flag"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

type BeginPayload = {
  customerId: string
  businessId: string
  onboardingRequestId: string
  onboardingVersion: number
  reason: string
}

function payload(value: unknown): { subscriptionId: string; version: number; payload: BeginPayload } | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>
  if (typeof body.subscriptionId !== "string" || !isUuid(body.subscriptionId)) return null
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  if (typeof body.customerId !== "string" || !isUuid(body.customerId)) return null
  if (typeof body.businessId !== "string" || !isUuid(body.businessId)) return null
  if (typeof body.onboardingRequestId !== "string" || !isUuid(body.onboardingRequestId)) return null
  if (typeof body.onboardingVersion !== "number" || !Number.isInteger(body.onboardingVersion) || body.onboardingVersion < 1) return null
  if (typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.trim().length > 1000) return null
  return {
    subscriptionId: body.subscriptionId,
    version: body.version,
    payload: {
      customerId: body.customerId,
      businessId: body.businessId,
      onboardingRequestId: body.onboardingRequestId,
      onboardingVersion: body.onboardingVersion,
      reason: body.reason.trim(),
    },
  }
}

function denied(reason: string | undefined): string {
  if (reason === "revoked" || reason === "membership") return "Business authority is not verified, so setup cannot start."
  if (reason === "acceptance") return "The accepted offer does not match this subscription."
  if (reason === "payment") return "This subscription is not a verified paid subscription, so setup cannot start."
  if (reason === "inactive") return "This subscription is not active, so setup cannot start."
  if (reason === "expired") return "This subscription period has ended, so setup cannot start."
  if (reason === "location") return "The selected locations do not belong to this business."
  if (reason === "quantities") return "The selected locations do not match the accepted plan."
  if (reason === "closed") return "This onboarding request is closed, so setup cannot start."
  if (reason === "lifecycle") return "This onboarding request is not ready to move into setup."
  if (reason === "customer") return "That subscription does not belong to this customer and business."
  return "Setup cannot start for this subscription."
}

export async function beginSetupCommand(request: NextRequest) {
  if (!commercialSetupQueueEnabled() || !commercialBeginSetupEnabled()) {
    return reply("Begin setup is not switched on.", 403)
  }
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
    try { body = JSON.parse(raw) } catch { return reply("Please check the subscription and try again.", 400) }
    const command = payload(body)
    if (!command) return reply("Check the subscription before starting setup.", 400)
    const result = await backend().rpc<{ status: string; reason?: string }>("admin_commercial_begin_setup_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_payload: command.payload,
    })
    switch (result.status) {
      case "success": return reply("Setup is in progress. The next step is to confirm business preferences.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "conflict":
        if (result.reason === "version") return reply("This subscription has changed. Reload the queue before trying again.", 409)
        if (result.reason === "provision") return reply("Setup has already started for these locations. Reload the queue before trying again.", 409)
        return reply("This request was already used with different details. Reload the queue and start again.", 409)
      case "denied": return reply(denied(result.reason), 403)
      case "invalid": return reply("Check the subscription before starting setup.", 400)
      default: return reply("We couldn’t start setup. Reload the queue before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t start setup. Reload the queue before trying again.", 503)
  }
}
