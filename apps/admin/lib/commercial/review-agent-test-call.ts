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
import { retrieveAgentTestCall, telloyaVoiceApiKey } from "./agent-test-call-provider"

const endedMessage = "The controlled web call has ended. Telephone forwarding is not verified, and the receptionist is not live."
const openMessage = "The provider still reports this controlled call as active. It is not yet complete. Another call was not started."
const investigateMessage = "This controlled test needs investigation before another call can start. Another call was not started."
const reconcileMessage = "We couldn’t confirm whether the provider ended the web call. Do not start another one. This attempt needs reconciliation."

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json(
  { message, forwardingVerified: false, testPassed: false, ...extra },
  { status, headers: privateResponseHeaders },
)

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

type ReviewBody = {
  action: "read" | "check"
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

type ReadState = {
  status: string
  reason?: string | null
  attemptState?: string | null
  sessionRef?: string | null
  requestId?: string | null
  callId?: string | null
  businessId?: string | null
  locationId?: string | null
}

function payload(value: unknown): ReviewBody | "reference" | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const forbidden = ["providerCallId", "callId", "call_id", "accessToken", "access_token", "iceServers", "ice_servers", "connectionToken", "credential", "agentId", "agentVersion"]
  if (forbidden.some(key => key in body)) return "reference"
  const allowed = new Set<string>(["action", "subscriptionId", "version", "confirmedCharge", ...contextKeys, ...versionKeys])
  if (Object.keys(body).some(key => !allowed.has(key))) return null
  if (body.action !== "read" && body.action !== "check") return null
  if ("confirmedCharge" in body && body.confirmedCharge !== true) return null
  if (typeof body.subscriptionId !== "string" || !isUuid(body.subscriptionId)) return null
  if (typeof body.version !== "number" || !Number.isInteger(body.version) || body.version < 1) return null
  for (const key of contextKeys) {
    if (typeof body[key] !== "string" || !isUuid(body[key])) return null
  }
  for (const key of versionKeys) {
    if (typeof body[key] !== "number" || !Number.isInteger(body[key]) || body[key] < 1) return null
  }
  return {
    action: body.action,
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

function context(command: ReviewBody) {
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
  }
}

function visible(row: ReadState) {
  return {
    status: row.status,
    attemptState: row.attemptState ?? null,
    reason: row.reason ?? null,
    sessionRef: row.sessionRef ?? null,
    requestId: row.requestId ?? null,
    callId: row.callId ?? null,
    businessId: row.businessId ?? null,
    locationId: row.locationId ?? null,
    forwardingVerified: false as const,
    testPassed: false as const,
  }
}

export async function reviewAgentTestCallCommand(request: NextRequest) {
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
    try { body = JSON.parse(raw) } catch { return reply("Check the controlled test before requesting its status.", 400) }
    const command = payload(body)
    if (command === "reference") return reply("A typed call reference is not accepted.", 400)
    if (!command) return reply("Check the controlled test before requesting its status.", 400)
    const lane = commercialProviderLane()
    if (!lane) return reply("The provider lane is not configured for this deployment, so the controlled test status cannot be checked.", 403)
    const session = await sessionFromToken(token)
    if (!session?.userId || !session.createdAt) return reply("Please sign in again.", 401)
    const signedInAt = Date.parse(session.createdAt)
    if (!Number.isFinite(signedInAt) || signedInAt < Date.now() - 30 * 60 * 1000) return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    const args = {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_environment: lane,
      p_payload: context(command),
    }
    const found = await backend().rpc<ReadState>("admin_commercial_read_agent_test_attempt_v1", args)
    if (found.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (found.status === "reauth_required") return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
    if (found.status === "invalid") return reply("Check the controlled test before requesting its status.", 400)
    if (found.status === "conflict") return reply("These test records have changed. Reload the queue before trying again.", 409)
    if (command.action === "read") {
      if (found.status === "none") return reply("There is no active controlled test for this location.", 200, visible(found))
      if (found.status !== "found") return reply("Check the controlled test before requesting its status.", 409)
      return reply(
        found.callId
          ? "An existing controlled test is still open for this location."
          : investigateMessage,
        200,
        visible(found),
      )
    }
    if (found.status === "none") return reply("There is no active controlled test for this location. Another call was not started.", 200, visible(found))
    if (found.status !== "found" || !found.requestId || !isUuid(found.requestId)) {
      return reply(investigateMessage, 409, { status: "reconciliation" })
    }
    if (!found.callId) return reply(investigateMessage, 409, { ...visible(found), status: "reconciliation" })
    if (!telloyaVoiceApiKey(lane)) return reply(reconcileMessage, 503, { ...visible(found), status: "reconciliation" })
    const retrieved = await retrieveAgentTestCall({ callId: found.callId, lane })
    if (retrieved.availability === "retrieved" && retrieved.evidence.callType === "phone_call") {
      return reply("This status check does not apply to a telephone route. Forwarding and live routing were not changed.", 409, { ...visible(found), status: "rejected" })
    }
    if (retrieved.availability === "retrieved" && retrieved.evidence.callType === "web_call" && retrieved.evidence.callStatus === "ended") {
      const settled = await backend().rpc<ReadState>("admin_commercial_settle_agent_test_call_v1", {
        ...args,
        p_request: found.requestId,
        p_payload: {
          outcome: "ended",
          providerCallId: found.callId,
          locationId: command.locationId,
          callType: "web_call",
          callStatus: "ended",
        },
      })
      if (settled.status === "completed") {
        return reply(endedMessage, 200, { ...visible(found), status: "completed", attemptState: "COMPLETED" })
      }
      return reply(reconcileMessage, 409, { ...visible(found), status: "reconciliation" })
    }
    if (retrieved.availability === "retrieved" && retrieved.evidence.callType === "web_call" && (retrieved.evidence.callStatus === "ongoing" || retrieved.evidence.callStatus === "registered")) {
      return reply(openMessage, 200, { ...visible(found), status: "ongoing" })
    }
    return reply(reconcileMessage, 409, { ...visible(found), status: "reconciliation" })
  } catch {
    return reply(reconcileMessage, 503, { status: "reconciliation" })
  }
}
