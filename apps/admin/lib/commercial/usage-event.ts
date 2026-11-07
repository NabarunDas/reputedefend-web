import { createHash } from "node:crypto"

import { verifyRetellSignature } from "../../../telloya/lib/voice/signature"
import { usageEventsEnabled } from "./usage-events-flag"

const CALL_ID = /^[A-Za-z0-9_-]{1,128}$/
const PHONE = /^\+[0-9]{8,15}$/

export type UsageEventEnvironment = "dev" | "production"
export type UsageCallScope = "customer_phone" | "admin_web_qa"

export type NumberBinding = {
  environment: UsageEventEnvironment
  businessId: string
  locationId: string
  subscriptionId: string
  inboundToNumber: string
}

export type StructuredLeadSummary = {
  callerName: string | null
  callbackNumber: string | null
  serviceRequested: string | null
  callbackWindow: string | null
  summary: string | null
}

export type UsageEventCommand = {
  environment: UsageEventEnvironment
  providerCallRef: string
  scope: UsageCallScope
  businessId: string | null
  locationId: string | null
  subscriptionId: string | null
  durationSeconds: number | null
  durationQuality: "confirmed" | "missing"
  endedAtMs: number | null
  bodySha256: string
  summary: StructuredLeadSummary | null
  droppedContent: readonly ["transcript", "recording", "access_token"]
}

export type UsageEventResult =
  | { status: 404; outcome: "closed" }
  | { status: 401; outcome: "rejected_signature" }
  | { status: 422; outcome: "rejected_payload" | "unbound_number" | "cross_tenant" }
  | { status: 202; outcome: "accepted" | "replay" | "out_of_order"; command: UsageEventCommand }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function bounded(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function hashBody(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex")
}

function durationSeconds(call: Record<string, unknown>): { seconds: number | null; quality: "confirmed" | "missing"; endedAtMs: number | null } {
  const start = call.start_timestamp
  const end = call.end_timestamp
  if (typeof start !== "number" || typeof end !== "number") return { seconds: null, quality: "missing", endedAtMs: null }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return { seconds: null, quality: "missing", endedAtMs: null }
  return { seconds: Math.floor((end - start) / 1000), quality: "confirmed", endedAtMs: end }
}

function summaryFrom(call: Record<string, unknown>, event: string): StructuredLeadSummary | null {
  if (event !== "call_analyzed") return null
  const analysis = isRecord(call.call_analysis) ? call.call_analysis : {}
  const custom = isRecord(analysis.custom_analysis_data) ? analysis.custom_analysis_data : {}
  const callback = bounded(custom.callback_number, 32)
  return {
    callerName: bounded(custom.caller_name, 120),
    callbackNumber: callback && PHONE.test(callback) ? callback : null,
    serviceRequested: bounded(custom.service_requested, 280),
    callbackWindow: bounded(custom.callback_window, 120),
    summary: bounded(custom.summary, 600),
  }
}

export function processUsageEvent(input: {
  enabledFlag: string | undefined
  environment: UsageEventEnvironment
  apiKey: string
  nowMs: number
  rawBody: string
  signatureHeader: string | null
  bindingForNumber: (toNumber: string) => NumberBinding | null
  seenBodySha256?: ReadonlySet<string>
  priorEventTypes?: readonly string[]
}): UsageEventResult {
  if (!usageEventsEnabled(input.enabledFlag)) return { status: 404, outcome: "closed" }
  const verified = verifyRetellSignature({
    rawBody: input.rawBody,
    apiKey: input.apiKey,
    signature: input.signatureHeader,
    nowMs: input.nowMs,
  })
  if (!verified) return { status: 401, outcome: "rejected_signature" }

  let parsed: unknown
  try {
    parsed = JSON.parse(input.rawBody)
  } catch {
    return { status: 422, outcome: "rejected_payload" }
  }
  if (!isRecord(parsed) || !isRecord(parsed.call)) return { status: 422, outcome: "rejected_payload" }
  const event = parsed.event
  if (event !== "call_started" && event !== "call_ended" && event !== "call_analyzed") {
    return { status: 422, outcome: "rejected_payload" }
  }
  const call = parsed.call
  if (typeof call.call_id !== "string" || !CALL_ID.test(call.call_id)) return { status: 422, outcome: "rejected_payload" }
  const scope: UsageCallScope = call.call_type === "web_call" ? "admin_web_qa" : "customer_phone"
  const suppliedSubscription = isRecord(call.metadata) ? call.metadata.subscription_id : undefined
  const toNumber = typeof call.to_number === "string" ? call.to_number : ""
  const binding = scope === "customer_phone" ? input.bindingForNumber(toNumber) : null
  if (scope === "customer_phone" && (binding == null || binding.environment !== input.environment || !PHONE.test(toNumber))) {
    return { status: 422, outcome: "unbound_number" }
  }
  if (scope === "customer_phone" && binding && suppliedSubscription != null && suppliedSubscription !== binding.subscriptionId) {
    return { status: 422, outcome: "cross_tenant" }
  }

  const duration = event === "call_ended" ? durationSeconds(call) : { seconds: null, quality: "missing" as const, endedAtMs: null }
  const bodySha256 = hashBody(input.rawBody)
  const command: UsageEventCommand = {
    environment: input.environment,
    providerCallRef: call.call_id,
    scope,
    businessId: binding?.businessId ?? null,
    locationId: binding?.locationId ?? null,
    subscriptionId: binding?.subscriptionId ?? null,
    durationSeconds: duration.seconds,
    durationQuality: duration.quality,
    endedAtMs: duration.endedAtMs,
    bodySha256,
    summary: summaryFrom(call, event),
    droppedContent: ["transcript", "recording", "access_token"],
  }
  if (input.seenBodySha256?.has(bodySha256)) return { status: 202, outcome: "replay", command }
  const prior = input.priorEventTypes ?? []
  if (event === "call_ended" && !prior.includes("call_started")) {
    return { status: 202, outcome: "out_of_order", command }
  }
  return { status: 202, outcome: "accepted", command }
}
