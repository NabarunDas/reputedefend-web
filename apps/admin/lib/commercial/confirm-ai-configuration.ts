import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { commercialConfirmAiConfigurationEnabled } from "./confirm-ai-configuration-flag"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

type ProviderEvidence = {
  provider: "telloya_voice"
  environment: "dev" | "production"
  agentRef: string
  revision: string
  chosenVoice: string
  chosenLanguage: string
  attestation: string
  staffConfirmed: true
}

type ConfigurationPayload = {
  customerId: string
  businessId: string
  onboardingRequestId: string
  onboardingVersion: number
  locationId: string
  preferenceVersion: number
  provisionVersion: number
  configurationVersion: number
  provider: ProviderEvidence
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed !== value || trimmed.length < minimum || trimmed.length > maximum) return null
  return trimmed
}

function payload(value: unknown): { subscriptionId: string; version: number; payload: ConfigurationPayload } | null {
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
  if (typeof body.configurationVersion !== "number" || !Number.isInteger(body.configurationVersion) || body.configurationVersion < 0) return null
  if (!body.provider || typeof body.provider !== "object") return null
  const provider = body.provider as Record<string, unknown>
  if (provider.provider !== "telloya_voice") return null
  if (provider.environment !== "dev" && provider.environment !== "production") return null
  if (provider.staffConfirmed !== true) return null
  const agentRef = text(provider.agentRef, 8, 128)
  const revision = text(provider.revision, 4, 128)
  const chosenVoice = text(provider.chosenVoice, 1, 80)
  const chosenLanguage = text(provider.chosenLanguage, 1, 40)
  const attestation = text(provider.attestation, 20, 500)
  if (!agentRef || !/^[A-Za-z0-9_-]{8,128}$/.test(agentRef) || !revision || !chosenVoice || !chosenLanguage || !attestation) return null
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
      provider: {
        provider: "telloya_voice",
        environment: provider.environment,
        agentRef,
        revision,
        chosenVoice,
        chosenLanguage,
        attestation,
        staffConfirmed: true,
      },
    },
  }
}

function denied(reason: string | undefined): string {
  if (reason === "preferences") return "Confirm the business preferences for every selected location before recording an AI configuration."
  if (reason === "provider") return "That provider reference is already recorded for a different location or business."
  if (reason === "environment") return "That provider reference belongs to a different environment."
  if (reason === "setup") return "This location is not ready for an AI configuration record."
  if (reason === "revoked" || reason === "membership") return "Business authority is not verified, so the AI configuration cannot be recorded."
  if (reason === "acceptance") return "The accepted offer does not match this subscription."
  if (reason === "payment") return "This subscription is not a verified paid subscription, so the AI configuration cannot be recorded."
  if (reason === "inactive") return "This subscription is not active, so the AI configuration cannot be recorded."
  if (reason === "expired") return "This subscription period has ended, so the AI configuration cannot be recorded."
  if (reason === "location") return "That location is not one of the selected locations for this subscription."
  if (reason === "quantities") return "The selected locations do not match the accepted plan."
  if (reason === "closed") return "This onboarding request is closed, so the AI configuration cannot be recorded."
  if (reason === "customer") return "That subscription does not belong to this customer and business."
  if (reason === "live") return "This location is already live, so the AI configuration cannot be changed here."
  return "The AI configuration cannot be recorded for this subscription."
}

export async function confirmAiConfigurationCommand(request: NextRequest) {
  if (!commercialSetupQueueEnabled() || !commercialConfirmAiConfigurationEnabled()) {
    return reply("Confirm AI configuration is not switched on.", 403)
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
    try { body = JSON.parse(raw) } catch { return reply("Check the provider evidence before recording the configuration.", 400) }
    const command = payload(body)
    if (!command) return reply("Check the provider evidence before recording the configuration.", 400)
    const result = await backend().rpc<{ status: string; reason?: string }>("admin_commercial_confirm_ai_configuration_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_payload: command.payload,
    })
    switch (result.status) {
      case "success": return reply("The AI configuration is recorded for this location. Testing is still required. The receptionist is not live.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "conflict":
        if (result.reason === "version") return reply("This configuration has changed. Reload the queue before trying again.", 409)
        return reply("This request was already used with different details. Reload the queue and start again.", 409)
      case "denied": return reply(denied(result.reason), 403)
      case "invalid": return reply("Check the provider evidence before recording the configuration.", 400)
      default: return reply("We couldn’t record the AI configuration. Reload the queue before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t record the AI configuration. Reload the queue before trying again.", 503)
  }
}
