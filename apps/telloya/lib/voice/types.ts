/**
 * Synthetic Retell voice contracts.
 * These types follow the published webhook envelope. They are not a live client.
 */

export const RETELL_SIGNATURE_HEADER = "x-retell-signature"

export const RETELL_EVENTS = ["call_started", "call_ended", "call_analyzed"] as const

export type RetellEventName = (typeof RETELL_EVENTS)[number]

export type VoiceEnvironment = "dev" | "production"

export type CallStatus = "completed" | "incomplete" | "failed" | "rejected"

export const MINIMAL_LEAD_FIELDS = [
  "tenantBusinessId",
  "tenantLocationId",
  "providerCallRef",
  "callbackNumber",
  "callerName",
  "serviceRequested",
  "jobLocation",
  "callbackWindow",
  "summary",
  "incomplete",
  "callStatus",
  "createdAt",
] as const

export type MinimalLead = {
  tenantBusinessId: string
  tenantLocationId: string
  providerCallRef: string
  callbackNumber: string | null
  callerName: string | null
  serviceRequested: string | null
  jobLocation: string | null
  callbackWindow: string | null
  summary: string
  incomplete: boolean
  callStatus: CallStatus
  createdAt: string
}

export type NotificationStatus = "pending" | "failed" | "skipped"

export type NotificationIntent = {
  leadId: string
  idempotencyKey: string
  status: NotificationStatus
}

export type ProjectedAnalysis = {
  callerName: string | null
  callbackNumber: string | null
  serviceRequested: string | null
  jobLocation: string | null
  callbackWindow: string | null
}

/** Fields copied out of a verified Retell body. Transcripts and recording URLs are not here. */
export type ProjectedCall = {
  event: RetellEventName
  callId: string
  agentId: string
  toNumber: string
  disconnectionReason: string | null
  durationSeconds: number | null
  providerError: boolean
  analysis: ProjectedAnalysis | null
}

export type ValidationIssueCode =
  | "invalid_json"
  | "unsupported_event"
  | "missing_call"
  | "missing_call_id"
  | "call_id_too_long"
  | "invalid_call_id"
  | "not_inbound"
  | "missing_number"
  | "missing_agent"
  | "invalid_field"

export type ValidationIssue = {
  code: ValidationIssueCode
  field?: "caller_name" | "callback_number" | "service_requested" | "job_location" | "callback_window"
}

export type NumberMapRow = {
  inboundToNumber: string
  agentId: string
  businessId: string
  locationId: string
  environment: VoiceEnvironment
  active: boolean
}

export type TenantFailure =
  | "missing_identity"
  | "unknown"
  | "ambiguous"
  | "agent_mismatch"
  | "inactive"
  | "environment_mismatch"

export type ResolvedTenant = {
  businessId: string
  locationId: string
}

export type EventReceipt = {
  environment: VoiceEnvironment
  event: RetellEventName
  callId: string
  rawBodyHash: string
  conflicts: string[]
}

export type CallRecord = {
  lead: MinimalLead
  finalised: boolean
  finalisedBy: "analysis" | "fallback" | null
  durationSeconds: number | null
  disconnectionReason: string | null
  providerError: boolean
  notification: NotificationIntent | null
}

export type StoredCall = {
  environment: VoiceEnvironment
  record: CallRecord
}

export type VoiceState = {
  receipts: EventReceipt[]
  calls: StoredCall[]
}

export const EMPTY_VOICE_STATE: VoiceState = { receipts: [], calls: [] }

export type VoiceLogOutcome =
  | "closed"
  | "rejected_signature"
  | "rejected_schema"
  | "unknown_tenant"
  | "duplicate"
  | "conflict"
  | "accepted"

export type VoiceLogEntry = {
  event: RetellEventName | null
  callId: string | null
  outcome: VoiceLogOutcome
  notificationStatus: "none" | NotificationStatus
}
