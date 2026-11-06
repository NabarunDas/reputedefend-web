import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { commercialProviderLane } from "./provider-lane"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"
import { commercialVerifyAgentTestCallEnabled } from "./verify-agent-test-call-flag"
import { retrieveAgentTestCall, type RetrievedAgentCall } from "./agent-test-call-provider"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

const passMessage = "Your AI receptionist has passed its conversation test. We still need to confirm the final telephone connection before your service can go live. Telephone forwarding is not verified, and the receptionist is not live."

const qaKeys = [
  "greeting",
  "languageVoice",
  "callerIdentity",
  "enquiryDetails",
  "callbackWindows",
  "businessHours",
  "escalation",
  "avoidsUnsupportedPromises",
  "conclusion",
] as const

type QaKey = (typeof qaKeys)[number]

type Qa = Record<QaKey, boolean> & { attestation: string; staffConfirmed: true }

type CommandBody = {
  subscriptionId: string
  version: number
  customerId: string
  businessId: string
  onboardingRequestId: string
  onboardingVersion: number
  locationId: string
  preferenceVersion: number
  provisionVersion: number
  configurationVersion: number
  allocationId: string
  allocationVersion: number
  instructionId: string
  instructionVersion: number
  callId: string
  qa: Qa
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed !== value || trimmed.length < minimum || trimmed.length > maximum) return null
  return trimmed
}

function payload(value: unknown): CommandBody | null {
  if (!value || typeof value !== "object") return null
  const body = value as Record<string, unknown>
  if (typeof body.subscriptionId !== "string" || !isUuid(body.subscriptionId)) return null
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  for (const key of ["customerId", "businessId", "onboardingRequestId", "locationId", "allocationId", "instructionId"] as const) {
    if (typeof body[key] !== "string" || !isUuid(body[key])) return null
  }
  for (const key of ["onboardingVersion", "preferenceVersion", "provisionVersion", "configurationVersion", "allocationVersion", "instructionVersion"] as const) {
    if (typeof body[key] !== "number" || !Number.isInteger(body[key]) || body[key] < 1) return null
  }
  const callId = text(body.callId, 8, 128)
  if (!callId || !/^[A-Za-z0-9_-]{8,128}$/.test(callId)) return null
  if (!body.qa || typeof body.qa !== "object") return null
  const qa = body.qa as Record<string, unknown>
  const attestation = text(qa.attestation, 20, 500)
  if (!attestation || qa.staffConfirmed !== true) return null
  const checked = {} as Record<QaKey, boolean>
  for (const key of qaKeys) {
    if (typeof qa[key] !== "boolean") return null
    checked[key] = qa[key]
  }
  return {
    subscriptionId: body.subscriptionId,
    version: body.version,
    customerId: body.customerId as string,
    businessId: body.businessId as string,
    onboardingRequestId: body.onboardingRequestId as string,
    onboardingVersion: body.onboardingVersion as number,
    locationId: body.locationId as string,
    preferenceVersion: body.preferenceVersion as number,
    provisionVersion: body.provisionVersion as number,
    configurationVersion: body.configurationVersion as number,
    allocationId: body.allocationId as string,
    allocationVersion: body.allocationVersion as number,
    instructionId: body.instructionId as string,
    instructionVersion: body.instructionVersion as number,
    callId,
    qa: { ...checked, attestation, staffConfirmed: true },
  }
}

function denied(reason: string | undefined): string {
  if (reason === "preferences") return "Confirm the business preferences for every selected location before verifying the conversation test."
  if (reason === "configuration") return "Record a current AI configuration for this location before verifying the conversation test."
  if (reason === "allocation") return "Record the current telephone allocation before verifying the conversation test."
  if (reason === "environment") return "That provider environment does not match the recorded configuration."
  if (reason === "provider") return "The recorded receptionist does not match the current allocation."
  if (reason === "call") return "That provider call has already been used as evidence for a commercial location."
  if (reason === "setup") return "This location is not ready for a conversation test."
  if (reason === "revoked" || reason === "membership") return "Business authority is not verified, so the conversation test cannot be recorded."
  if (reason === "acceptance") return "The accepted offer does not match this subscription."
  if (reason === "payment") return "This subscription is not a verified paid subscription, so the conversation test cannot be recorded."
  if (reason === "inactive") return "This subscription is not active, so the conversation test cannot be recorded."
  if (reason === "expired") return "This subscription period has ended, so the conversation test cannot be recorded."
  if (reason === "location") return "That location is not one of the selected locations for this subscription."
  if (reason === "quantities") return "The selected locations do not match the accepted plan."
  if (reason === "closed") return "This onboarding request is closed, so the conversation test cannot be recorded."
  if (reason === "customer") return "That subscription does not belong to this customer and business."
  return "The conversation test cannot be recorded for this subscription."
}

function recordedMessage(outcome: string | undefined): string {
  if (outcome === "VERIFIED_PASSED") return passMessage
  if (outcome === "VERIFIED_FAILED") return "The conversation test was recorded as failed. The service was not advanced. Telephone forwarding is not verified, and the receptionist is not live."
  if (outcome === "PENDING_VERIFICATION") return "The provider call is not finished, so the conversation test stays pending. The service was not advanced. Telephone forwarding is not verified."
  return "The provider evidence needs another check. A pass was not recorded, and the service was not advanced. Telephone forwarding is not verified."
}

export async function verifyAgentTestCallCommand(request: NextRequest) {
  if (!commercialSetupQueueEnabled() || !commercialVerifyAgentTestCallEnabled()) {
    return reply("Verify AI receptionist test call is not switched on.", 403)
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
    try { body = JSON.parse(raw) } catch { return reply("Check the test reference and staff assessment before recording them.", 400) }
    const command = payload(body)
    if (!command) return reply("Check the test reference and staff assessment before recording them.", 400)
    const lane = commercialProviderLane()
    if (!lane) return reply("The provider lane is not configured for this deployment, so the conversation test cannot be recorded.", 403)
    const retrieval = await retrieveAgentTestCall({ callId: command.callId, lane })
    if (retrieval.availability === "uncertain") {
      return reply("We couldn’t confirm whether the provider call could be read. Try the same action again without changing the assessment.", 503)
    }
    const evidence: RetrievedAgentCall = retrieval.evidence
    const result = await backend().rpc<{
      status: string
      reason?: string
      evidenceOutcome?: string
      evidenceVersion?: number
      providerStatus?: string
      provisionState?: string
      testPassed?: boolean
      forwardingVerified?: boolean
    }>("admin_commercial_verify_agent_test_call_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_payload: {
        customerId: command.customerId,
        businessId: command.businessId,
        onboardingRequestId: command.onboardingRequestId,
        onboardingVersion: command.onboardingVersion,
        locationId: command.locationId,
        preferenceVersion: command.preferenceVersion,
        provisionVersion: command.provisionVersion,
        configurationVersion: command.configurationVersion,
        allocationId: command.allocationId,
        allocationVersion: command.allocationVersion,
        instructionId: command.instructionId,
        instructionVersion: command.instructionVersion,
        evidence,
        qa: command.qa,
      },
    })
    switch (result.status) {
      case "success": {
        if (result.evidenceOutcome !== "VERIFIED_PASSED" && result.evidenceOutcome !== "VERIFIED_FAILED" && result.evidenceOutcome !== "PENDING_VERIFICATION" && result.evidenceOutcome !== "REQUIRES_REVIEW") {
          return reply("We couldn’t record the conversation test. Reload the queue before trying again.", 503)
        }
        const recorded: Record<string, unknown> = { evidenceOutcome: result.evidenceOutcome }
        if (typeof result.evidenceVersion === "number") recorded.evidenceVersion = result.evidenceVersion
        if (typeof result.providerStatus === "string") recorded.providerStatus = result.providerStatus
        if (typeof result.provisionState === "string") recorded.provisionState = result.provisionState
        if (typeof result.testPassed === "boolean") recorded.testPassed = result.testPassed
        if (result.forwardingVerified === false) recorded.forwardingVerified = false
        return NextResponse.json({
          message: recordedMessage(result.evidenceOutcome),
          ...recorded,
        }, { status: 200, headers: privateResponseHeaders })
      }
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "conflict":
        if (result.reason === "version") return reply("These test records have changed. Reload the queue before trying again.", 409)
        return reply("This request was already used with different details. Reload the queue and start again.", 409)
      case "denied": return reply(denied(result.reason), 403)
      case "invalid": return reply("Check the test reference and staff assessment before recording them.", 400)
      default: return reply("We couldn’t record the conversation test. Reload the queue before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t record the conversation test. Reload the queue before trying again.", 503)
  }
}
