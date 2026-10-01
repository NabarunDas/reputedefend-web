export const TEMPLATE_KEYS = ["EVIDENCE_REQUEST", "CASE_UPDATE", "CONVERSATION_REPLY", "GUARD_ALERT"] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]
export const LIFECYCLES = ["DRAFT", "REVIEWED", "QUEUED", "CANCELLED"] as const
export type CommunicationLifecycle = (typeof LIFECYCLES)[number]
export const DELIVERY_STATUSES = [
  "NONE", "ACCEPTANCE_UNKNOWN", "PROVIDER_ACCEPTED", "DELIVERED",
  "BOUNCED", "TRANSIENT_BOUNCE", "UNDETERMINED_BOUNCE", "COMPLAINED", "SUPPRESSED", "FAILED",
] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export type CommunicationEvent = {
  eventType: string
  occurredAt: string
  summary: string
  providerMessageId: string | null
}

export type CommunicationRow = {
  id: string
  caseId: string | null
  caseReference: string | null
  communicationType: string
  templateKey: string | null
  templateVersion: number | null
  lifecycle: CommunicationLifecycle | null
  deliveryStatus: DeliveryStatus | null
  legacyStatus: string | null
  recipient: string
  subject: string | null
  bodyText: string | null
  provider: string | null
  providerMessageId: string | null
  lastError: string | null
  contentLocked: boolean
  contentVersion: number
  version: number
  draftedAt: string
  reviewedAt: string | null
  queuedAt: string | null
  firstProviderAttemptAt: string | null
  providerAcceptedAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  cancelledAt: string | null
  supersededBy: string | null
  events: CommunicationEvent[]
}

export type CommunicationList = {
  communications: CommunicationRow[]
  templates: Array<{ templateKey: string; version: number; name: string }>
}

export function lifecycleLabel(value: string | null): string {
  if (value === "DRAFT") return "Draft"
  if (value === "REVIEWED") return "Reviewed"
  if (value === "QUEUED") return "Queued"
  if (value === "CANCELLED") return "Cancelled"
  return "Legacy intake"
}

export function deliveryLabel(row: Pick<CommunicationRow, "deliveryStatus" | "legacyStatus">): string {
  if (row.deliveryStatus === "DELIVERED") return "Delivered"
  if (row.deliveryStatus === "ACCEPTANCE_UNKNOWN") return "Provider acceptance unknown — check the email provider"
  if (row.deliveryStatus === "PROVIDER_ACCEPTED") return "Accepted by email provider"
  if (row.deliveryStatus === "BOUNCED") return "Permanently bounced"
  if (row.deliveryStatus === "TRANSIENT_BOUNCE") return "Temporarily bounced"
  if (row.deliveryStatus === "UNDETERMINED_BOUNCE") return "Bounce classification unknown"
  if (row.deliveryStatus === "COMPLAINED") return "Complained"
  if (row.deliveryStatus === "SUPPRESSED") return "Suppressed"
  if (row.deliveryStatus === "FAILED") return "Failed"
  if (row.deliveryStatus === "NONE") return "Not sent"
  if (row.legacyStatus === "SENT") return "Accepted by email provider (legacy)"
  if (row.legacyStatus === "FAILED") return "Failed (legacy)"
  if (row.legacyStatus === "PENDING") return "Pending (legacy)"
  return "Unknown"
}

export function templateLabel(key: string | null): string {
  if (key === "EVIDENCE_REQUEST") return "Evidence request"
  if (key === "CASE_UPDATE") return "Case update"
  if (key === "CONVERSATION_REPLY") return "Conversation reply"
  if (key === "GUARD_ALERT") return "Guard alert"
  return key || "Intake"
}
