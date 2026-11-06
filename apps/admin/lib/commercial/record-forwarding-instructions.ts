import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { commercialProviderLane } from "./provider-lane"
import { commercialRecordForwardingInstructionsEnabled } from "./record-forwarding-instructions-flag"
import { commercialSetupQueueEnabled } from "./setup-queue-flag"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

export const FORWARDING_SAFETY_NOTICE = "Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection."

const modes = ["UNANSWERED", "BUSY", "UNREACHABLE", "UNANSWERED_BUSY_UNREACHABLE"] as const

type ForwardingInstruction = {
  environment: "dev" | "production"
  forwardingMode: (typeof modes)[number]
  carrierKnown: boolean
  carrierName: string | null
  customerTelephone: string | null
  instructionRevision: string
  instructionText: string
  attestation: string
  staffConfirmed: true
  status: "DRAFT" | "SHARED"
}

type ForwardingPayload = {
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
  instructionVersion: number
  instruction: ForwardingInstruction
}

function text(value: unknown, minimum: number, maximum: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed !== value || trimmed.length < minimum || trimmed.length > maximum) return null
  return trimmed
}

function payload(value: unknown): { subscriptionId: string; version: number; payload: ForwardingPayload } | null {
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
  if (typeof body.allocationId !== "string" || !isUuid(body.allocationId)) return null
  if (typeof body.allocationVersion !== "number" || !Number.isInteger(body.allocationVersion) || body.allocationVersion < 1) return null
  if (typeof body.instructionVersion !== "number" || !Number.isInteger(body.instructionVersion) || body.instructionVersion < 0) return null
  if (!body.instruction || typeof body.instruction !== "object") return null
  const instruction = body.instruction as Record<string, unknown>
  if (instruction.environment !== "dev" && instruction.environment !== "production") return null
  if (!modes.includes(instruction.forwardingMode as (typeof modes)[number])) return null
  if (instruction.status !== "DRAFT" && instruction.status !== "SHARED") return null
  if (instruction.staffConfirmed !== true || typeof instruction.carrierKnown !== "boolean") return null
  const carrierName = instruction.carrierKnown ? text(instruction.carrierName, 2, 80) : instruction.carrierName === null ? null : undefined
  if (carrierName === undefined) return null
  const customerTelephone = instruction.customerTelephone === null
    ? null
    : text(instruction.customerTelephone, 9, 16)
  if (instruction.customerTelephone !== null && (!customerTelephone || !/^\+[1-9][0-9]{7,14}$/.test(customerTelephone))) return null
  const instructionRevision = text(instruction.instructionRevision, 4, 64)
  const instructionText = text(instruction.instructionText, 160, 2000)
  const attestation = text(instruction.attestation, 20, 500)
  if (!instructionRevision || !instructionText || !instructionText.includes(FORWARDING_SAFETY_NOTICE) || !attestation) return null
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
      allocationId: body.allocationId,
      allocationVersion: body.allocationVersion,
      instructionVersion: body.instructionVersion,
      instruction: {
        environment: instruction.environment,
        forwardingMode: instruction.forwardingMode as (typeof modes)[number],
        carrierKnown: instruction.carrierKnown,
        carrierName,
        customerTelephone,
        instructionRevision,
        instructionText,
        attestation,
        staffConfirmed: true,
        status: instruction.status,
      },
    },
  }
}

function denied(reason: string | undefined): string {
  if (reason === "preferences") return "Confirm the business preferences for every selected location before recording forwarding instructions."
  if (reason === "configuration") return "Record a current AI configuration for this location before recording forwarding instructions."
  if (reason === "allocation") return "Record the current telephone allocation for this location before sharing forwarding instructions."
  if (reason === "provider") return "The instructions must name the assigned telephone number and must not include provider or internal references."
  if (reason === "environment") return "That provider environment does not match the recorded allocation."
  if (reason === "setup") return "This location is not ready for forwarding instructions."
  if (reason === "revoked" || reason === "membership") return "Business authority is not verified, so forwarding instructions cannot be recorded."
  if (reason === "acceptance") return "The accepted offer does not match this subscription."
  if (reason === "payment") return "This subscription is not a verified paid subscription, so forwarding instructions cannot be recorded."
  if (reason === "inactive") return "This subscription is not active, so forwarding instructions cannot be recorded."
  if (reason === "expired") return "This subscription period has ended, so forwarding instructions cannot be recorded."
  if (reason === "location") return "That location is not one of the selected locations for this subscription."
  if (reason === "quantities") return "The selected locations do not match the accepted plan."
  if (reason === "closed") return "This onboarding request is closed, so forwarding instructions cannot be recorded."
  if (reason === "customer") return "That subscription does not belong to this customer and business."
  if (reason === "live") return "This location is already live, so forwarding instructions cannot be changed here."
  return "Forwarding instructions cannot be recorded for this subscription."
}

export async function recordForwardingInstructionsCommand(request: NextRequest) {
  if (!commercialSetupQueueEnabled() || !commercialRecordForwardingInstructionsEnabled()) {
    return reply("Record forwarding instructions is not switched on.", 403)
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
    try { body = JSON.parse(raw) } catch { return reply("Check the forwarding instructions and staff attestation before recording them.", 400) }
    const command = payload(body)
    if (!command) return reply("Check the forwarding instructions and staff attestation before recording them.", 400)
    const lane = commercialProviderLane()
    if (!lane) return reply("The provider lane is not configured for this deployment, so forwarding instructions cannot be recorded.", 403)
    if (command.payload.instruction.environment !== lane) return reply("That provider environment does not match this deployment, so forwarding instructions cannot be recorded.", 400)
    const result = await backend().rpc<{ status: string; reason?: string; instructionVersion?: number; sharingStatus?: string; allocationVersion?: number; provisionState?: string; forwardingInstructed?: boolean }>("admin_commercial_record_forwarding_instructions_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_subscription: command.subscriptionId,
      p_version: command.version,
      p_payload: { ...command.payload, instruction: { ...command.payload.instruction, environment: lane } },
    })
    switch (result.status) {
      case "success": {
        const recorded: Record<string, unknown> = {}
        if (typeof result.instructionVersion === "number") recorded.instructionVersion = result.instructionVersion
        if (typeof result.allocationVersion === "number") recorded.allocationVersion = result.allocationVersion
        if (result.sharingStatus === "DRAFT" || result.sharingStatus === "SHARED") recorded.sharingStatus = result.sharingStatus
        if (typeof result.provisionState === "string") recorded.provisionState = result.provisionState
        if (typeof result.forwardingInstructed === "boolean") recorded.forwardingInstructed = result.forwardingInstructed
        return NextResponse.json({
          message: command.payload.instruction.status === "SHARED"
            ? "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live."
            : "The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled.",
          ...recorded,
        }, { status: 200, headers: privateResponseHeaders })
      }
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "reauth_required": return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
      case "conflict":
        if (result.reason === "version") return reply("These forwarding instructions have changed. Reload the queue before trying again.", 409)
        return reply("This request was already used with different details. Reload the queue and start again.", 409)
      case "denied": return reply(denied(result.reason), 403)
      case "invalid": return reply("Check the forwarding instructions and staff attestation before recording them.", 400)
      default: return reply("We couldn’t record the forwarding instructions. Reload the queue before trying again.", 503)
    }
  } catch {
    return reply("We couldn’t record the forwarding instructions. Reload the queue before trying again.", 503)
  }
}
