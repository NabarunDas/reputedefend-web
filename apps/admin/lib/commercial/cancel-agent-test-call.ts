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
import { retrieveAgentTestCall, stopAgentWebCall, telloyaVoiceApiKey } from "./agent-test-call-provider"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json(
  { message, forwardingVerified: false, testPassed: false, ...extra },
  { status, headers: privateResponseHeaders },
)

const callIdPattern = /^[A-Za-z0-9_-]{8,128}$/

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

type CancelBody = {
  subscriptionId: string
  version: number
  providerCallId: string
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
  confirmedCharge: true
}

function payload(value: unknown): CancelBody | "reference" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const forbidden = ["accessToken", "access_token", "iceServers", "ice_servers", "connectionToken", "credential", "call_id", "agentId", "agentVersion"]
  if (forbidden.some(key => key in body)) return "reference"
  const allowed = new Set<string>(["subscriptionId", "version", "providerCallId", "confirmedCharge", ...contextKeys, ...versionKeys])
  if (Object.keys(body).some(key => !allowed.has(key))) return null
  if (body.confirmedCharge !== true) return null
  if (typeof body.providerCallId !== "string" || !callIdPattern.test(body.providerCallId)) return "reference"
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
    providerCallId: body.providerCallId,
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
    confirmedCharge: true,
  }
}

function context(command: CancelBody) {
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
    confirmedCharge: true,
    providerCallId: command.providerCallId,
  }
}

type CancelState = {
  status: string
  reason?: string
  callId?: string
  attemptState?: string
  completionBasis?: string
}

export async function cancelAgentTestCallCommand(request: NextRequest) {
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
    try { body = JSON.parse(raw) } catch { return reply("Check the controlled test before ending it.", 400) }
    const command = payload(body)
    if (command === "reference") return reply("That call reference is not the controlled test recorded for this action.", 400)
    if (!command) return reply("Check the controlled test before ending it.", 400)
    const lane = commercialProviderLane()
    if (!lane) return reply("The provider lane is not configured for this deployment, so the controlled web call cannot be ended.", 403)
    const session = await sessionFromToken(token)
    if (!session?.userId || !session.createdAt) return reply("Please sign in again.", 401)
    const signedInAt = Date.parse(session.createdAt)
    if (!Number.isFinite(signedInAt) || signedInAt < Date.now() - 30 * 60 * 1000) return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    if (!telloyaVoiceApiKey(lane)) return reply("The provider credential for this lane is not configured, so the controlled web call was not ended.", 503)
    const args = {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_environment: lane,
      p_payload: context(command),
    }
    const settle = (outcome: string, evidence: { callType?: string | null; callStatus?: string | null }) => backend().rpc<CancelState>("admin_commercial_settle_agent_test_call_v1", {
      ...args,
      p_payload: {
        outcome,
        providerCallId: command.providerCallId,
        locationId: command.locationId,
        callType: evidence.callType ?? null,
        callStatus: evidence.callStatus ?? null,
      },
    })
    const authorized = await backend().rpc<CancelState>("admin_commercial_authorize_agent_test_cancel_v1", args)
    if (authorized.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (authorized.status === "reauth_required") return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    if (authorized.status === "invalid") return reply("Check the controlled test before ending it.", 400)
    if (authorized.status === "conflict") return reply("These test records have changed. Reload the queue before trying again.", 409)
    if (authorized.status === "denied" && authorized.reason === "call") {
      return reply("That call reference is not the controlled test recorded for this action.", 409)
    }
    if (authorized.status === "denied") return reply("This controlled test cannot be ended from this action.", 403)
    if (authorized.status === "completed") {
      return reply("The controlled web call has ended. Telephone forwarding is not verified, and the receptionist is not live.", 200, { status: "completed" })
    }
    if (authorized.status === "pending") {
      return reply("The controlled test is still being recorded. Do not start another one.", 409, { status: "pending" })
    }
    if (authorized.status === "stopping") {
      return reply("A cancellation for this controlled test is already in progress. Do not start another one.", 409, { status: "stopping" })
    }
    if (authorized.callId !== command.providerCallId) {
      return reply("That call reference is not the controlled test recorded for this action.", 409)
    }
    const found = await retrieveAgentTestCall({ callId: command.providerCallId, lane })
    if (found.availability === "retrieved" && found.evidence.callType === "phone_call") {
      return reply("This cancellation does not apply to a telephone route. Forwarding and live routing were not changed.", 409, { status: "rejected" })
    }
    if (found.availability === "retrieved" && found.evidence.callType === "web_call" && found.evidence.callStatus === "ended") {
      const settled = await settle("ended", { callType: "web_call", callStatus: "ended" })
      if (settled.status === "completed") {
        return reply("The controlled web call has ended. Telephone forwarding is not verified, and the receptionist is not live.", 200, { status: "completed" })
      }
      return reply("We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation.", 409, { status: "reconciliation" })
    }
    if (authorized.status === "reconciliation" || found.availability === "not_found" || found.availability === "unavailable" || found.availability === "incomplete") {
      return reply("We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation.", 409, { status: "reconciliation" })
    }
    if (authorized.status !== "authorized") {
      return reply("This controlled test cannot be ended from this action.", 403)
    }
    if (found.availability === "retrieved" && found.evidence.callType !== "web_call" && found.evidence.callType !== null) {
      return reply("We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation.", 409, { status: "reconciliation" })
    }
    const stopped = await stopAgentWebCall({ callId: command.providerCallId, lane })
    if (stopped.availability === "uncertain") {
      await settle("uncertain", { callType: "web_call", callStatus: found.availability === "retrieved" ? found.evidence.callStatus : null })
      return reply("We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation.", 503, { status: "reconciliation" })
    }
    if (stopped.availability === "rejected") {
      await settle("release", { callType: "web_call", callStatus: found.availability === "retrieved" ? found.evidence.callStatus : null })
      return reply("The provider did not end the controlled web call. The attempt is still open. Do not start another one.", 502, { status: "rejected" })
    }
    const settled = await settle("cancelled", { callType: "web_call", callStatus: "ended" })
    if (settled.status !== "completed") {
      return reply("We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation.", 409, { status: "reconciliation" })
    }
    return reply("The controlled web call has ended. Telephone forwarding is not verified, and the receptionist is not live.", 200, { status: "completed" })
  } catch {
    return reply("We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation.", 503, { status: "reconciliation" })
  }
}
