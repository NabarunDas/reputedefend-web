import { createHash } from "node:crypto"

import { verifyRetellSignature } from "../../../telloya/lib/voice/signature"

import { inboundAdmissionEnabled } from "./inbound-admission-flag"

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/
const PHONE = /^\+[1-9][0-9]{7,14}$/

/**
 * Retell connects a call when every inbound webhook attempt fails and the
 * number has a default inbound agent. That configuration has not been verified
 * for this account, so it remains a launch blocker.
 */
export const inboundFailClosedProviderConfiguration = "UNVERIFIED" as const

export type InboundProviderConfiguration = typeof inboundFailClosedProviderConfiguration | "VERIFIED"

export function inboundLaunchBlockers(): readonly string[] {
  return [
    "default_inbound_agent_fallback_unverified",
    "in_progress_provider_stop_not_proved",
    "inbound_admission_flag_off",
    "usage_events_flag_off",
    "live_provision_still_closed",
  ]
}

export type InboundAdmissionEnvironment = "dev" | "production"
export type InboundCallScope = "customer_phone" | "admin_web_qa"

/** Arguments for public.commercial_usage_reserve_inbound_v1. Commercial terms are omitted. */
export type InboundReservationPayload = {
  environment: InboundAdmissionEnvironment
  providerCallRef: string
  callScope: InboundCallScope
  toNumber: string | null
  now: string
  bodySha256: string
  subscriptionId: string | null
  businessId: string | null
  locationId: string | null
}

export type InboundReservationResult = {
  status: string
  reason?: string
  billable?: boolean
  reserveSeconds?: number
  decision?: string
}

export type InboundAdmissionOutcome =
  | "admission_disabled"
  | "rejected_signature"
  | "rejected_payload"
  | "provider_fail_open_unverified"
  | "database_unavailable"
  | "admitted"
  | "denied"
  | "excluded"
  | "replay"
  | "conflict"

export type InboundAdmissionResult = {
  httpStatus: 200
  body: { call_inbound: { reject: true } } | { call_inbound: Record<string, never> }
  outcome: InboundAdmissionOutcome
  reason: string | null
  /** True only when the database recorded a customer-phone reservation. No charge is created. */
  reservationBillable: boolean
  launchBlocked: boolean
  persistedCallerContent: false
}

export const INBOUND_RETELL_REJECT = { call_inbound: { reject: true } } as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex")
}

function reject(outcome: InboundAdmissionOutcome, reason: string | null, launchBlocked: boolean): InboundAdmissionResult {
  return {
    httpStatus: 200,
    body: INBOUND_RETELL_REJECT,
    outcome,
    reason,
    reservationBillable: false,
    launchBlocked,
    persistedCallerContent: false,
  }
}

/**
 * Builds the reservation command from the signed body.
 * Included minutes, overage consent, rate, and cap are not copied from the webhook.
 */
export function inboundReservationPayload(input: {
  environment: InboundAdmissionEnvironment
  rawBody: string
  nowMs: number
}): { payload: InboundReservationPayload } | { error: "rejected_payload" } {
  let parsed: unknown
  try {
    parsed = JSON.parse(input.rawBody)
  } catch {
    return { error: "rejected_payload" }
  }
  if (!isRecord(parsed) || parsed.event !== "call_inbound" || !isRecord(parsed.call_inbound)) {
    return { error: "rejected_payload" }
  }
  const call = parsed.call_inbound
  const callId = typeof call.call_id === "string" ? call.call_id : ""
  if (!CALL_ID.test(callId)) return { error: "rejected_payload" }
  const callType = call.call_type ?? "phone_call"
  if (callType !== "phone_call" && callType !== "web_call") return { error: "rejected_payload" }
  const scope: InboundCallScope = callType === "web_call" ? "admin_web_qa" : "customer_phone"
  const toNumber = typeof call.to_number === "string" ? call.to_number : ""
  if (scope === "customer_phone" && !PHONE.test(toNumber)) return { error: "rejected_payload" }
  const metadata = isRecord(call.metadata) ? call.metadata : {}
  const supplied = (key: string): string | null => {
    const value = metadata[key]
    return typeof value === "string" && value.length > 0 ? value : null
  }
  return {
    payload: {
      environment: input.environment,
      providerCallRef: callId,
      callScope: scope,
      toNumber: scope === "customer_phone" ? toNumber : null,
      now: new Date(input.nowMs).toISOString(),
      bodySha256: hashBody(input.rawBody),
      subscriptionId: supplied("subscription_id"),
      businessId: supplied("business_id"),
      locationId: supplied("location_id"),
    },
  }
}

export async function admitInboundCall(input: {
  enabledFlag: string | undefined
  environment: InboundAdmissionEnvironment
  apiKey: string
  nowMs: number
  rawBody: string
  signatureHeader: string | null
  providerConfiguration?: InboundProviderConfiguration
  reserve: (payload: InboundReservationPayload) => Promise<InboundReservationResult>
}): Promise<InboundAdmissionResult> {
  const providerConfiguration = input.providerConfiguration ?? inboundFailClosedProviderConfiguration
  const launchBlocked = providerConfiguration !== "VERIFIED"
  if (!inboundAdmissionEnabled(input.enabledFlag)) {
    return reject("admission_disabled", "admission_disabled", true)
  }
  const verified = verifyRetellSignature({
    rawBody: input.rawBody,
    apiKey: input.apiKey,
    signature: input.signatureHeader,
    nowMs: input.nowMs,
  })
  if (!verified) return reject("rejected_signature", "rejected_signature", launchBlocked)

  const built = inboundReservationPayload({
    environment: input.environment,
    rawBody: input.rawBody,
    nowMs: input.nowMs,
  })
  if ("error" in built) return reject("rejected_payload", "rejected_payload", launchBlocked)

  if (launchBlocked) {
    return reject("provider_fail_open_unverified", "provider_fail_open_unverified", true)
  }

  let reserved: InboundReservationResult
  try {
    reserved = await input.reserve(built.payload)
  } catch {
    return reject("database_unavailable", "database_unavailable", false)
  }

  if (reserved.status === "admitted" && reserved.billable === true) {
    return {
      httpStatus: 200,
      body: { call_inbound: {} },
      outcome: "admitted",
      reason: reserved.reason ?? null,
      reservationBillable: true,
      launchBlocked: false,
      persistedCallerContent: false,
    }
  }
  if (reserved.status === "excluded" || (reserved.status === "replay" && reserved.decision === "excluded")) {
    return reject(reserved.status === "replay" ? "replay" : "excluded", "internal_admin_web_call", false)
  }
  if (reserved.status === "replay") return reject("replay", reserved.reason ?? "replay", false)
  if (reserved.status === "conflict") return reject("conflict", "conflict", false)
  return reject("denied", reserved.reason ?? "denied", false)
}
