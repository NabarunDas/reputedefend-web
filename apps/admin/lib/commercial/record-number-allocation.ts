import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { commercialProviderLane } from "./provider-lane"
import { commercialRecordNumberAllocationEnabled } from "./record-number-allocation-flag"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

type AllocationEvidence = {
  provider: "telloya_voice"
  environment: "dev" | "production"
  agentRef: string
  revision: string
  e164: string
  allocationRef: string
  attestation: string
  staffConfirmed: true
}

type AllocationPayload = {
  customerId: string
  businessId: string
  onboardingRequestId: string
  onboardingVersion: number
  locationId: string
  preferenceVersion: number
  provisionVersion: number
  configurationVersion: number
  allocationVersion: number
  provider: AllocationEvidence
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed !== value || trimmed.length < minimum || trimmed.length > maximum) return null
  return trimmed
}

function payload(value: unknown): { subscriptionId: string; version: number; payload: AllocationPayload } | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>
  if (typeof body.subscriptionId !== "string" || !isUuid(body.subscriptionId)) return null
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  if (typeof body.customerId !== "string" || !isUuid(body.customerId)) return null
  if (typeof body.businessId !== "string" || !isUuid(body.businessId)) return null
  if (typeof body.onboardingRequestId !== "string" || !isUuid(body.onboardingRequestId)) return null
  if (typeof body.onboardingVersion !== "number" || !Number.isInteger(body.onboardingVersion) || body.onboardingVersion < 1) return null
  if (typeof body.locationId !== "string" || !isUuid(body.locationId)) return null
  if (typeof body.preferenceVersion !== "number" || !Number.isInteger(body.preferenceVersion) || body.preferenceVersion < 1) return null
  if (typeof body.provisionVersion !== "number" || !Number.isInteger(body.provisionVersion) || body.provisionVersion < 1) return null
  if (typeof body.configurationVersion !== "number" || !Number.isInteger(body.configurationVersion) || body.configurationVersion < 1) return null
  if (typeof body.allocationVersion !== "number" || !Number.isInteger(body.allocationVersion) || body.allocationVersion < 0) return null
  if (!body.provider || typeof body.provider !== "object") return null
  const provider = body.provider as Record<string, unknown>
  if (provider.provider !== "telloya_voice") return null
  if (provider.environment !== "dev" && provider.environment !== "production") return null
  if (provider.staffConfirmed !== true) return null
  const agentRef = text(provider.agentRef, 8, 128)
  const revision = text(provider.revision, 4, 128)
  const e164 = text(provider.e164, 9, 16)
  const allocationRef = text(provider.allocationRef, 8, 128)
  const attestation = text(provider.attestation, 20, 500)
  if (!agentRef || !/^[A-Za-z0-9_-]{8,128}$/.test(agentRef) || !revision || !e164 || !/^\+[1-9][0-9]{7,14}$/.test(e164)) return null
  if (!allocationRef || !/^[A-Za-z0-9_.:-]{8,128}$/.test(allocationRef) || !attestation) return null
  return {
    subscriptionId: body.subscriptionId,
    version: body.version,
    payload: {
      customerId: body.customerId,
      businessId: body.businessId,
      onboardingRequestId: body.onboardingRequestId,
      onboardingVersion: body.onboardingVersion,
      locationId: body.locationId,
      preferenceVersion: body.preferenceVersion,
      provisionVersion: body.provisionVersion,
      configurationVersion: body.configurationVersion,
      allocationVersion: body.allocationVersion,
      provider: {
        provider: "telloya_voice",
        environment: provider.environment,
        agentRef,
        revision,
        e164,
        allocationRef,
        attestation,
        staffConfirmed: true,
      },
    },
  }
}

function denied(reason: string | undefined): string {
  if (reason === "preferences") return "Confirm the business preferences for every selected location before recording a telephone number."
  if (reason === "configuration") return "Record a current AI configuration for this location before recording a telephone number."
  if (reason === "number") return "That telephone number is already recorded for a different location or business."
  if (reason === "provider") return "That provider agent does not match the latest configuration for this location."
  if (reason === "routing") return "That provider agent already has an active telephone binding, so this number cannot be recorded as pending."
  if (reason === "environment") return "That provider environment does not match the recorded configuration."
  if (reason === "setup") return "This location is not ready for a telephone number record."
  if (reason === "revoked" || reason === "membership") return "Business authority is not verified, so the telephone number cannot be recorded."
  if (reason === "acceptance") return "The accepted offer does not match this subscription."
  if (reason === "payment") return "This subscription is not a verified paid subscription, so the telephone number cannot be recorded."
  if (reason === "inactive") return "This subscription is not active, so the telephone number cannot be recorded."
  if (reason === "expired") return "This subscription period has ended, so the telephone number cannot be recorded."
  if (reason === "location") return "That location is not one of the selected locations for this subscription."
  if (reason === "quantities") return "The selected locations do not match the accepted plan."
  if (reason === "closed") return "This onboarding request is closed, so the telephone number cannot be recorded."
  if (reason === "customer") return "That subscription does not belong to this customer and business."
  if (reason === "live") return "This location is already live, so the telephone number cannot be changed here."
  return "The telephone number cannot be recorded for this subscription."
}

export async function recordNumberAllocationCommand(request: NextRequest) {
  if (!commercialSetupQueueEnabled() || !commercialRecordNumberAllocationEnabled()) {
    return reply("Record number allocation is not switched on.", 403)
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
    try { body = JSON.parse(raw) } catch { return reply("Check the telephone number and provider evidence before recording the allocation.", 400) }
    const command = payload(body)
    if (!command) return reply("Check the telephone number and provider evidence before recording the allocation.", 400)
    const lane = commercialProviderLane()
    if (!lane) return reply("The provider lane is not configured for this deployment, so the telephone number cannot be recorded.", 403)
    if (command.payload.provider.environment !== lane) return reply("That provider environment does not match this deployment, so the telephone number cannot be recorded.", 400)
    const result = await backend().rpc<{ status: string; reason?: string }>("admin_commercial_record_number_allocation_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_payload: { ...command.payload, provider: { ...command.payload.provider, environment: lane } },
    })
    switch (result.status) {
      case "success": return reply("The telephone number is recorded for this location. It is not active. Forwarding and testing are still required.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "conflict":
        if (result.reason === "version") return reply("This allocation has changed. Reload the queue before trying again.", 409)
        return reply("This request was already used with different details. Reload the queue and start again.", 409)
      case "denied": return reply(denied(result.reason), 403)
      case "invalid": return reply("Check the telephone number and provider evidence before recording the allocation.", 400)
      default: return reply("We couldn’t record the telephone number. Reload the queue before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t record the telephone number. Reload the queue before trying again.", 503)
  }
}
