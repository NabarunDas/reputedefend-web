import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, sessionFromToken, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { commercialProviderLane } from "./provider-lane"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"
import { commercialInitiateAgentTestCallEnabled } from "./initiate-agent-test-call-flag"
import { allowAgentTestCreate, createAgentWebCall, telloyaVoiceApiKey } from "./agent-test-call-provider"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

const contextKeys = [
  "customerId",
  "businessId",
  "onboardingRequestId",
  "locationId",
  "allocationId",
  "instructionId",
] as const

const versionKeys = [
  "onboardingVersion",
  "preferenceVersion",
  "provisionVersion",
  "configurationVersion",
  "allocationVersion",
  "instructionVersion",
] as const

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
}

function payload(value: unknown): CommandBody | "reference" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const forbidden = ["callId", "providerCallId", "accessToken", "access_token", "call_id", "agentId", "agentVersion", "agent_id", "agent_version"]
  if (forbidden.some(key => key in body)) return "reference"
  const allowed = new Set<string>(["subscriptionId", "version", ...contextKeys, ...versionKeys])
  if (Object.keys(body).some(key => !allowed.has(key))) return null
  if (typeof body.subscriptionId !== "string" || !isUuid(body.subscriptionId)) return null
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  for (const key of contextKeys) {
    if (typeof body[key] !== "string" || !isUuid(body[key])) return null
  }
  for (const key of versionKeys) {
    if (typeof body[key] !== "number" || !Number.isInteger(body[key]) || body[key] < 1) return null
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
  }
}

function denied(reason: string | undefined): string {
  if (reason === "revision") return "The recorded receptionist revision cannot open a controlled web call."
  if (reason === "preferences") return "Confirm the business preferences for every selected location before opening a controlled web call."
  if (reason === "configuration") return "Record a current AI configuration for this location before opening a controlled web call."
  if (reason === "allocation") return "Record the current telephone allocation before opening a controlled web call."
  if (reason === "environment") return "That provider environment does not match the recorded configuration."
  if (reason === "intent") return "This action does not match a pre-authorised test session."
  if (reason === "window") return "The pre-authorised test window has closed. Start a new controlled test."
  if (reason === "setup") return "This location is not ready for a controlled web call."
  if (reason === "revoked" || reason === "membership") return "Business authority is not verified, so a controlled web call cannot be opened."
  if (reason === "acceptance") return "The accepted offer does not match this subscription."
  if (reason === "payment") return "This subscription is not a verified paid subscription, so a controlled web call cannot be opened."
  if (reason === "inactive") return "This subscription is not active, so a controlled web call cannot be opened."
  if (reason === "expired") return "This subscription period has ended, so a controlled web call cannot be opened."
  if (reason === "location") return "That location is not one of the selected locations for this subscription."
  if (reason === "quantities") return "The selected locations do not match the accepted plan."
  if (reason === "closed") return "This onboarding request is closed, so a controlled web call cannot be opened."
  if (reason === "customer") return "That subscription does not belong to this customer and business."
  return "A controlled web call cannot be opened for this subscription."
}

function context(command: CommandBody) {
  return {
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
  }
}

type Prepared = {
  status: string
  reason?: string
  intentId?: string
  bindingId?: string
  sessionRef?: string
  callId?: string
  agentRef?: string
  agentVersion?: number
  environment?: string
  configurationVersion?: number
  provisionState?: string
  forwardingVerified?: boolean
  testPassed?: boolean
}

export async function initiateAgentTestCallCommand(request: NextRequest) {
  if (!commercialSetupQueueEnabled() || !commercialInitiateAgentTestCallEnabled()) {
    return reply("Start controlled receptionist test is not switched on.", 403)
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
      if (size > 8192) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Check the location before opening a controlled web call.", 400) }
    const command = payload(body)
    if (command === "reference") return reply("A provider call reference cannot be supplied. The server records the reference from the provider response.", 400)
    if (!command) return reply("Check the location before opening a controlled web call.", 400)
    const lane = commercialProviderLane()
    if (!lane) return reply("The provider lane is not configured for this deployment, so a controlled web call cannot be opened.", 403)
    const session = await sessionFromToken(token)
    if (!session?.userId || !session.createdAt) return reply("Please sign in again.", 401)
    const signedInAt = Date.parse(session.createdAt)
    if (!Number.isFinite(signedInAt) || signedInAt < Date.now() - 30 * 60 * 1000) return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    const preflight = await backend().rpc<{ status: string; reason?: string }>("admin_commercial_agent_test_preflight_v1", {
      p_token: tokenHash(token),
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_customer: command.customerId,
      p_business: command.businessId,
      p_location: command.locationId,
      p_environment: lane,
      p_onboarding: command.onboardingRequestId,
      p_onboarding_version: command.onboardingVersion,
      p_preference_version: command.preferenceVersion,
      p_configuration_version: command.configurationVersion,
      p_allocation: command.allocationId,
      p_allocation_version: command.allocationVersion,
      p_instruction: command.instructionId,
      p_instruction_version: command.instructionVersion,
      p_provision_version: command.provisionVersion,
    })
    if (preflight.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (preflight.status === "reauth_required") return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    if (preflight.status === "conflict") return reply("These test records have changed. Reload the queue before trying again.", 409)
    if (preflight.status === "denied") return reply(denied(preflight.reason), 403)
    if (preflight.status !== "eligible") return reply("A controlled web call cannot be opened for this subscription.", 403)
    if (!telloyaVoiceApiKey(lane)) return reply("The provider credential for this lane is not configured, so a controlled web call was not opened.", 503)
    if (!allowAgentTestCreate(session.userId)) return reply("Too many provider calls. Wait a moment and try again.", 429)
    const prepared = await backend().rpc<Prepared>("admin_commercial_prepare_agent_test_call_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_environment: lane,
      p_payload: context(command),
    })
    if (prepared.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (prepared.status === "reauth_required") return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    if (prepared.status === "invalid") return reply("Check the location before opening a controlled web call.", 400)
    if (prepared.status === "conflict") return reply("These test records have changed. Reload the queue before trying again.", 409)
    if (prepared.status === "denied") return reply(denied(prepared.reason), 403)
    if (prepared.status === "bound") {
      return NextResponse.json({
        message: "The controlled web call is already recorded for this action. A new join token is not issued. Telephone forwarding is not verified, and the receptionist is not live.",
        callId: prepared.callId,
        sessionRef: prepared.sessionRef,
        agentRef: prepared.agentRef,
        agentVersion: prepared.agentVersion,
        forwardingVerified: false,
        testPassed: false,
      }, { headers: privateResponseHeaders })
    }
    if (prepared.status !== "prepared" || !prepared.agentRef || typeof prepared.agentVersion !== "number") {
      return reply("A controlled web call cannot be opened for this subscription.", 403)
    }
    const created = await createAgentWebCall({ agentId: prepared.agentRef, agentVersion: prepared.agentVersion, lane })
    if (created.availability === "uncertain") {
      return reply("We couldn’t confirm whether the provider opened the web call. Try the same action again.", 503)
    }
    if (created.availability !== "created") {
      return reply("The provider did not open a controlled web call. Nothing was recorded. Try again with a new action.", 502)
    }
    const bound = await backend().rpc<Prepared>("admin_commercial_bind_agent_test_call_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_environment: lane,
      p_payload: {
        ...context(command),
        providerCallId: created.callId,
        reportedAgentId: prepared.agentRef,
        reportedAgentVersion: prepared.agentVersion,
        callType: "web_call",
      },
    })
    if (bound.status === "success") {
      return NextResponse.json({
        message: "A controlled web call is open for this location. Telephone forwarding is not verified, and the receptionist is not live.",
        callId: bound.callId,
        sessionRef: bound.sessionRef,
        agentRef: bound.agentRef,
        agentVersion: bound.agentVersion,
        accessToken: created.accessToken,
        transport: created.transport,
        expiresAt: created.expiresAt,
        provisionState: bound.provisionState,
        forwardingVerified: false,
        testPassed: false,
      }, { headers: privateResponseHeaders })
    }
    if (bound.status === "conflict") return reply("The provider call could not be bound to this test session. It was not recorded as this location’s controlled test.", 409)
    if (bound.status === "denied") return reply(denied(bound.reason), 403)
    return reply("The provider call could not be bound to this test session. It was not recorded as this location’s controlled test.", 502)
  } catch {
    return reply("A controlled web call cannot be opened for this subscription.", 500)
  }
}
