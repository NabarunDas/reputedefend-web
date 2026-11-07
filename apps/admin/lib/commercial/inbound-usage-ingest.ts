import { createHash } from "node:crypto"

import { verifyRetellSignature } from "../../../telloya/lib/voice/signature"
import { inboundAdmissionEnabled } from "./inbound-admission-flag"
import { usageEventsEnabled } from "./usage-events-flag"

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/
const PHONE = /^\+[1-9][0-9]{7,14}$/
const ADMISSION_REF = /^adm_[0-9a-f]{32}$/

export type InboundUsageEnvironment = "dev" | "production"
export type InboundUsageEvent = "call_started" | "call_ended" | "call_analyzed"

/**
 * Arguments for public.commercial_usage_ingest_inbound_admission_v1.
 * Tenant identifiers copied from provider metadata are assertions only.
 * The database compares them with the admission and does not bill from them.
 * The raw body, transcript, recording, and access token are not copied.
 */
export type InboundUsageIngestPayload = {
  environment: InboundUsageEnvironment
  eventType: InboundUsageEvent
  providerCallRef: string
  toNumber: string
  admissionRef: string | null
  bodySha256: string
  durationSeconds: number | null
  durationQuality: "confirmed" | "missing" | null
  endedAt: string | null
  assertedSubscriptionId: string | null
  assertedBusinessId: string | null
  assertedLocationId: string | null
  assertedCustomerId: string | null
  callerName: string | null
  callbackNumber: string | null
  serviceRequested: string | null
  callbackWindow: string | null
  summary: string | null
}

export type InboundUsageIngestResult = {
  status: string
  reason?: string
  billable?: boolean
  admissionRef?: string | null
  eventId?: string | null
  reservationId?: string | null
  periodStart?: string | null
  periodEnd?: string | null
}

export type InboundUsageCommandResult =
  | { status: 404; outcome: "closed" }
  | { status: 401; outcome: "rejected_signature" }
  | { status: 422; outcome: "rejected_payload" }
  | { status: 202; outcome: "prepared"; payload: InboundUsageIngestPayload }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function suppliedId(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function durationSeconds(call: Record<string, unknown>): { seconds: number | null; quality: "confirmed" | "missing"; endedAt: string | null } {
  const start = call.start_timestamp
  const end = call.end_timestamp
  if (typeof start !== "number" || typeof end !== "number") return { seconds: null, quality: "missing", endedAt: null }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return { seconds: null, quality: "missing", endedAt: null }
  return { seconds: Math.floor((end - start) / 1000), quality: "confirmed", endedAt: new Date(end).toISOString() }
}

/**
 * Reads one later provider event. This does not call the database and does not
 * decide that the call was admitted.
 */
export function inboundUsageIngestPayload(input: {
  environment: InboundUsageEnvironment
  rawBody: string
}): { payload: InboundUsageIngestPayload } | { error: "rejected_payload" } {
  let parsed: unknown
  try {
    parsed = JSON.parse(input.rawBody)
  } catch {
    return { error: "rejected_payload" }
  }
  if (!isRecord(parsed) || !isRecord(parsed.call)) return { error: "rejected_payload" }
  if (parsed.event !== "call_started" && parsed.event !== "call_ended" && parsed.event !== "call_analyzed") {
    return { error: "rejected_payload" }
  }
  const call = parsed.call
  if (call.call_type != null && call.call_type !== "phone_call") return { error: "rejected_payload" }
  if (typeof call.call_id !== "string" || !CALL_ID.test(call.call_id)) return { error: "rejected_payload" }
  if (typeof call.to_number !== "string" || !PHONE.test(call.to_number)) return { error: "rejected_payload" }
  const metadata = isRecord(call.metadata) ? call.metadata : {}
  const admissionRef = suppliedId(metadata, "admission_id")
  if (admissionRef != null && !ADMISSION_REF.test(admissionRef)) return { error: "rejected_payload" }
  const duration = parsed.event === "call_ended" ? durationSeconds(call) : { seconds: null, quality: null, endedAt: null }
  const analysis = parsed.event === "call_analyzed" && isRecord(call.call_analysis) ? call.call_analysis : {}
  const custom = isRecord(analysis.custom_analysis_data) ? analysis.custom_analysis_data : {}
  const callback = bounded(custom.callback_number, 32)
  return {
    payload: {
      environment: input.environment,
      eventType: parsed.event,
      providerCallRef: call.call_id,
      toNumber: call.to_number,
      admissionRef,
      bodySha256: createHash("sha256").update(input.rawBody, "utf8").digest("hex"),
      durationSeconds: duration.seconds,
      durationQuality: duration.quality,
      endedAt: duration.endedAt,
      assertedSubscriptionId: suppliedId(metadata, "subscription_id"),
      assertedBusinessId: suppliedId(metadata, "business_id"),
      assertedLocationId: suppliedId(metadata, "location_id"),
      assertedCustomerId: suppliedId(metadata, "customer_id"),
      callerName: parsed.event === "call_analyzed" ? bounded(custom.caller_name, 120) : null,
      callbackNumber: parsed.event === "call_analyzed" && callback && /^\+[0-9]{8,15}$/.test(callback) ? callback : null,
      serviceRequested: parsed.event === "call_analyzed" ? bounded(custom.service_requested, 280) : null,
      callbackWindow: parsed.event === "call_analyzed" ? bounded(custom.callback_window, 120) : null,
      summary: parsed.event === "call_analyzed" ? bounded(custom.summary, 600) : null,
    },
  }
}

/**
 * Prepares one atomic ingest. Both Telloya flags must be exactly "true"
 * before the database is called. This function does not mount a webhook.
 */
export async function ingestAdmittedUsage(input: {
  usageFlag: string | undefined
  admissionFlag: string | undefined
  environment: InboundUsageEnvironment
  apiKey: string
  nowMs: number
  rawBody: string
  signatureHeader: string | null
  ingest: (payload: InboundUsageIngestPayload) => Promise<InboundUsageIngestResult>
}): Promise<InboundUsageCommandResult | { status: number; outcome: string; result: InboundUsageIngestResult }> {
  if (!usageEventsEnabled(input.usageFlag) || !inboundAdmissionEnabled(input.admissionFlag)) {
    return { status: 404, outcome: "closed" }
  }
  const verified = verifyRetellSignature({
    rawBody: input.rawBody,
    apiKey: input.apiKey,
    signature: input.signatureHeader,
    nowMs: input.nowMs,
  })
  if (!verified) return { status: 401, outcome: "rejected_signature" }
  const built = inboundUsageIngestPayload({ environment: input.environment, rawBody: input.rawBody })
  if ("error" in built) return { status: 422, outcome: "rejected_payload" }
  const result = await input.ingest(built.payload)
  return { status: result.billable === true ? 202 : 422, outcome: result.status, result }
}
