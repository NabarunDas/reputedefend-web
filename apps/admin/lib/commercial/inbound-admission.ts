import { createHash } from "node:crypto"

import { verifyRetellSignature } from "../../../telloya/lib/voice/signature"

import { inboundAdmissionEnabled } from "./inbound-admission-flag"

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/
const PHONE = /^\+[1-9][0-9]{7,14}$/
const ADMISSION_REF = /^adm_[0-9a-f]{32}$/

/**
 * Retell connects a call when every inbound webhook attempt fails and the
 * number has a default inbound agent. That account setting has not been
 * verified. While this constant stays UNVERIFIED, a signed request is rejected
 * and no minute is reserved. The feature flag does not bypass that gate.
 * An approved response is available only when the caller passes VERIFIED, and
 * then it carries override_agent_id so a default inbound agent is not required.
 *
 * call_id is optional. This code does not treat a preallocated call id as
 * guaranteed provider behaviour. A well-formed value, when present, is stored
 * for correlation. The caller number is not an identity.
 *
 * Response metadata and an in-progress provider stop are unverified against a
 * live Retell call. A later event that matches neither a stored provider call
 * id nor an echoed admission reference stays unbound.
 */
export const inboundFailClosedProviderConfiguration = "UNVERIFIED" as const
export const inboundMetadataPropagation = "UNVERIFIED" as const

export type InboundProviderConfiguration = typeof inboundFailClosedProviderConfiguration | "VERIFIED"

export function inboundLaunchBlockers(): readonly string[] {
  return [
    "default_inbound_agent_fallback_unverified",
    "inbound_metadata_propagation_not_live_verified",
    "call_started_not_bound_to_admission",
    "in_progress_provider_stop_not_proved",
    "inbound_admission_flag_off",
    "usage_events_flag_off",
    "live_provision_still_closed",
  ]
}

export type InboundAdmissionEnvironment = "dev" | "production"
export type InboundCallScope = "customer_phone" | "admin_web_qa"

/** Arguments for public.commercial_usage_reserve_inbound_v1. Commercial terms and caller content are omitted. */
export type InboundReservationPayload = {
  environment: InboundAdmissionEnvironment
  providerCallRef: string | null
  callScope: InboundCallScope
  toNumber: string | null
  now: string
  bodySha256: string
  assertedSubscriptionId: string | null
  assertedBusinessId: string | null
  assertedLocationId: string | null
  quotedAdmissionRef: string | null
}

export type InboundReservationResult = {
  status: string
  reason?: string
  billable?: boolean
  reserveSeconds?: number
  decision?: string
  admissionRef?: string
  agentRef?: string
  providerCallRef?: string | null
}

export type InboundBindPayload = {
  environment: InboundAdmissionEnvironment
  providerCallRef: string
  toNumber: string
  admissionRef: string | null
  now: string
}

export type InboundAdmissionOutcome =
  | "admission_disabled"
  | "rejected_signature"
  | "rejected_payload"
  | "provider_fail_open_unverified"
  | "database_unavailable"
  | "provider_response_invalid"
  | "admitted"
  | "denied"
  | "excluded"
  | "replay"
  | "conflict"

export type InboundApprovalBody = {
  call_inbound: {
    override_agent_id: string
    metadata: { admission_id: string }
  }
}

export type InboundAdmissionResult = {
  httpStatus: 200
  body: { call_inbound: { reject: true } } | InboundApprovalBody
  outcome: InboundAdmissionOutcome
  reason: string | null
  admissionRef: string | null
  /** True only when the database holds one customer-phone minute for this admission. No charge is created. */
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

function suppliedId(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function reject(outcome: InboundAdmissionOutcome, reason: string | null, launchBlocked: boolean, admissionRef: string | null = null): InboundAdmissionResult {
  return {
    httpStatus: 200,
    body: INBOUND_RETELL_REJECT,
    outcome,
    reason,
    admissionRef,
    reservationBillable: false,
    launchBlocked,
    persistedCallerContent: false,
  }
}

function approval(result: InboundReservationResult, outcome: "admitted" | "replay"): InboundAdmissionResult | null {
  if (!result.agentRef || !result.admissionRef || !ADMISSION_REF.test(result.admissionRef)) return null
  return {
    httpStatus: 200,
    body: {
      call_inbound: {
        override_agent_id: result.agentRef,
        metadata: { admission_id: result.admissionRef },
      },
    },
    outcome,
    reason: result.reason ?? null,
    admissionRef: result.admissionRef,
    reservationBillable: true,
    launchBlocked: inboundFailClosedProviderConfiguration === "UNVERIFIED",
    persistedCallerContent: false,
  }
}

/**
 * Reads the inbound webhook. call_id is optional. The caller number, request
 * agent, and any tenant ids are not the admission identity.
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
  const callType = call.call_type ?? "phone_call"
  if (callType !== "phone_call" && callType !== "web_call") return { error: "rejected_payload" }
  let providerCallRef: string | null = null
  if (call.call_id != null) {
    if (typeof call.call_id !== "string" || !CALL_ID.test(call.call_id)) return { error: "rejected_payload" }
    providerCallRef = call.call_id
  }
  const scope: InboundCallScope = callType === "web_call" ? "admin_web_qa" : "customer_phone"
  const toNumber = typeof call.to_number === "string" ? call.to_number : ""
  if (scope === "customer_phone" && !PHONE.test(toNumber)) return { error: "rejected_payload" }
  const metadata = isRecord(call.metadata) ? call.metadata : {}
  const quoted = suppliedId(metadata, "admission_id")
  if (quoted != null && !ADMISSION_REF.test(quoted)) return { error: "rejected_payload" }
  return {
    payload: {
      environment: input.environment,
      providerCallRef,
      callScope: scope,
      toNumber: scope === "customer_phone" ? toNumber : null,
      now: new Date(input.nowMs).toISOString(),
      bodySha256: hashBody(input.rawBody),
      assertedSubscriptionId: suppliedId(metadata, "subscription_id"),
      assertedBusinessId: suppliedId(metadata, "business_id"),
      assertedLocationId: suppliedId(metadata, "location_id"),
      quotedAdmissionRef: quoted,
    },
  }
}

/**
 * Reads a later call_started or call_ended event for correlation.
 * The raw body, transcript, recording, and token are not copied.
 */
export function inboundBindPayload(input: {
  environment: InboundAdmissionEnvironment
  rawBody: string
  nowMs: number
}): { payload: InboundBindPayload } | { error: "correlation_unverified" | "rejected_payload" } {
  let parsed: unknown
  try {
    parsed = JSON.parse(input.rawBody)
  } catch {
    return { error: "rejected_payload" }
  }
  if (!isRecord(parsed) || (parsed.event !== "call_started" && parsed.event !== "call_ended") || !isRecord(parsed.call)) {
    return { error: "rejected_payload" }
  }
  const call = parsed.call
  if (typeof call.call_id !== "string" || !CALL_ID.test(call.call_id)) return { error: "correlation_unverified" }
  const toNumber = typeof call.to_number === "string" ? call.to_number : ""
  if (!PHONE.test(toNumber)) return { error: "correlation_unverified" }
  const metadata = isRecord(call.metadata) ? call.metadata : {}
  const admissionRef = suppliedId(metadata, "admission_id")
  if (admissionRef != null && !ADMISSION_REF.test(admissionRef)) return { error: "rejected_payload" }
  return {
    payload: {
      environment: input.environment,
      providerCallRef: call.call_id,
      toNumber,
      admissionRef,
      now: new Date(input.nowMs).toISOString(),
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
  const launchBlocked = (input.providerConfiguration ?? inboundFailClosedProviderConfiguration) !== "VERIFIED"
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
  if (launchBlocked) return reject("provider_fail_open_unverified", "provider_fail_open_unverified", true)

  let reserved: InboundReservationResult
  try {
    reserved = await input.reserve(built.payload)
  } catch {
    return reject("database_unavailable", "database_unavailable", launchBlocked)
  }

  const openApproval = reserved.billable === true && (reserved.status === "admitted" || (reserved.status === "replay" && reserved.decision === "admitted"))
  if (openApproval) {
    const approved = approval(reserved, reserved.status === "replay" ? "replay" : "admitted")
    if (approved) return { ...approved, launchBlocked }
    return reject("provider_response_invalid", "provider_response_invalid", true, reserved.admissionRef ?? null)
  }
  if (reserved.status === "excluded" || (reserved.status === "replay" && reserved.decision === "excluded")) {
    return reject(reserved.status === "replay" ? "replay" : "excluded", "internal_admin_web_call", launchBlocked, reserved.admissionRef ?? null)
  }
  if (reserved.status === "replay") return reject("replay", reserved.reason ?? "admission_closed", launchBlocked, reserved.admissionRef ?? null)
  if (reserved.status === "conflict") return reject("conflict", "conflict", launchBlocked, reserved.admissionRef ?? null)
  return reject("denied", reserved.reason ?? "denied", launchBlocked, reserved.admissionRef ?? null)
}
