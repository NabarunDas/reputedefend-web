import type { ProjectedAnalysis, ProjectedCall, RetellEventName, ValidationIssue } from "./types"
import { RETELL_EVENTS } from "./types"

export type ProjectResult =
  | { ok: true; projected: ProjectedCall; callId: string }
  | { ok: false; issues: ValidationIssue[]; callId: string | null }

const CALL_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const REASON_PATTERN = /^[a-z0-9_]{1,64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function normaliseTelephone(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 40) return null
  let compact = trimmed.replace(/[\s()-]/g, "")
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`
  if (!/^\+\d{8,15}$/.test(compact) || compact.length > 32) return null
  return compact
}

function boundedText(value: unknown, max: number): { value: string | null; rejected: boolean } {
  if (value == null) return { value: null, rejected: false }
  if (typeof value !== "string") return { value: null, rejected: true }
  const trimmed = value.trim()
  if (!trimmed) return { value: null, rejected: false }
  if (trimmed.length > max) return { value: null, rejected: true }
  return { value: trimmed, rejected: false }
}

function readCallId(call: unknown): string | null {
  if (!isRecord(call) || typeof call.call_id !== "string") return null
  if (call.call_id.length > 128) return null
  if (!CALL_ID_PATTERN.test(call.call_id)) return null
  return call.call_id
}

function durationFrom(call: Record<string, unknown>): number | null {
  const start = call.start_timestamp
  const end = call.end_timestamp
  if (typeof start !== "number" || typeof end !== "number") return null
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null
  if (end < start) return null
  return Math.floor((end - start) / 1000)
}

function disconnectionFrom(call: Record<string, unknown>): string | null {
  if (typeof call.disconnection_reason !== "string") return null
  return REASON_PATTERN.test(call.disconnection_reason) ? call.disconnection_reason : null
}

function analysisFrom(call: Record<string, unknown>, event: RetellEventName): ProjectedAnalysis | null {
  if (event !== "call_analyzed") return null
  const raw = call.call_analysis
  const custom = isRecord(raw) && isRecord(raw.custom_analysis_data) ? raw.custom_analysis_data : {}
  return {
    callerName: boundedText(custom.caller_name, 120).value,
    callbackNumber: normaliseTelephone(custom.callback_number),
    serviceRequested: boundedText(custom.service_requested, 280).value,
    jobLocation: boundedText(custom.job_location, 280).value,
    callbackWindow: boundedText(custom.callback_window, 120).value,
  }
}

export function projectRetellEvent(rawBody: string): ProjectResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { ok: false, issues: [{ code: "invalid_json" }], callId: null }
  }
  if (!isRecord(parsed)) return { ok: false, issues: [{ code: "invalid_json" }], callId: null }
  const callId = readCallId(parsed.call)
  const event = parsed.event
  if (!RETELL_EVENTS.includes(event as RetellEventName)) {
    return { ok: false, issues: [{ code: "unsupported_event" }], callId }
  }
  if (!isRecord(parsed.call)) return { ok: false, issues: [{ code: "missing_call" }], callId }
  const call = parsed.call
  if (typeof call.call_id !== "string" || call.call_id.length === 0) {
    return { ok: false, issues: [{ code: "missing_call_id" }], callId: null }
  }
  if (call.call_id.length > 128) return { ok: false, issues: [{ code: "call_id_too_long" }], callId: null }
  if (!callId) return { ok: false, issues: [{ code: "invalid_call_id" }], callId: null }
  if (call.direction !== "inbound") return { ok: false, issues: [{ code: "not_inbound" }], callId }
  const toNumber = normaliseTelephone(call.to_number)
  if (!toNumber) return { ok: false, issues: [{ code: "missing_number" }], callId }
  if (typeof call.agent_id !== "string" || !CALL_ID_PATTERN.test(call.agent_id)) {
    return { ok: false, issues: [{ code: "missing_agent" }], callId }
  }
  const namedEvent = event as RetellEventName
  return {
    ok: true,
    callId,
    projected: {
      event: namedEvent,
      callId,
      agentId: call.agent_id,
      toNumber,
      disconnectionReason: disconnectionFrom(call),
      durationSeconds: durationFrom(call),
      providerError: call.call_status === "error",
      analysis: analysisFrom(call, namedEvent),
    },
  }
}
