export const guardAlertOperations = [
  "acknowledge", "dismiss", "escalate", "correct_severity", "resolve", "review_new_evidence",
  "prepare_notification", "approve_notification", "queue_notification",
  "create_intervention_case", "link_existing_case", "pause_for_recovery", "resume",
  "acknowledge_service_action", "resolve_service_action",
] as const
export type GuardAlertOperation = (typeof guardAlertOperations)[number]

export const guardAlertStates = ["NEW", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"] as const
export const guardAlertSeverities = ["UNASSESSED", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const
export const guardAlertDispositions = ["PENDING_REVIEW", "CONFIRMED_CUSTOMER_ISSUE", "INTERNAL_ONLY", "FALSE_POSITIVE"] as const
export const guardAlertQueueParams = {
  newReview: "NEW_REVIEW",
  acknowledged: "ACKNOWLEDGED",
  highCritical: "HIGH_CRITICAL",
  needsReview: "NEEDS_REVIEW",
  contact: "CONTACT_RECOVERY",
  access: "ACCESS_RECOVERY",
  resolved: "RESOLVED_RECENT",
} as const
export type GuardAlertQueueParam = keyof typeof guardAlertQueueParams

export type GuardAlertRow = {
  id: string
  coverageId?: string
  customerName?: string | null
  businessName?: string | null
  locationName?: string | null
  coverageBasis?: string | null
  coverageState?: string | null
  state: string
  severity: string
  reviewDisposition?: string
  issueCodes?: string[]
  needsReview?: boolean
  acknowledgedAt?: string | null
  acknowledgedBy?: string | null
  firstObservedAt?: string
  latestObservedAt?: string
  notificationStatus?: string | null
  contactBlocked?: boolean
  accessBlocked?: boolean
  openServiceActionKind?: string | null
  linkedCaseRef?: string | null
  kind?: string
  reasonCode?: string
  openedAt?: string
  alertId?: string | null
  version: number
}

export type GuardAlertQueuePage = {
  rows: GuardAlertRow[]
  hasMore: boolean
  nextCursor: string | null
  after: string | null
  invalidCursor: boolean
}

export type GuardAlertList = {
  status?: string
  reason?: string
  alerts?: GuardAlertRow[]
  hasMore?: boolean
  nextCursor?: string | null
}

export type GuardAlertDetail = {
  status?: string
  enabled: boolean
  alert: GuardAlertRow & {
    reviewDisposition?: string
    customerName?: string
    businessName?: string
    locationName?: string
    coverageBasis?: string
    coverageState?: string
    linkedCaseRef?: string | null
  }
  permittedActions?: Record<string, boolean>
  coverage?: { state?: string; activatedAt?: string; resumeReady?: boolean }
  notifications?: Array<{
    id: string
    communicationId: string
    kind: string
    lifecycle: string
    deliveryStatus: string
    subject: string
  }>
  serviceActions?: Array<{
    id: string
    kind: string
    state: string
    reasonCode: string
    details: string
    version: number
  }>
  observations?: Array<{
    id: string
    classification: string
    issueCodes: string[]
    observedAt: string
    attached: boolean
  }>
  recentCoverageObservations?: Array<{
    id: string
    classification: string
    issueCodes: string[]
    observedAt: string
    attentionCandidate?: boolean
  }>
  events?: Array<{ event: string; reason: string; createdAt: string }>
  discount?: Record<string, { eligible?: boolean; reason?: string }>
  contact?: { emailVerified?: boolean; phoneVerified?: boolean }
  access?: { verified?: boolean }
}

export function alertStateLabel(state: string): string {
  if (state === "NEW") return "New review"
  if (state === "ACKNOWLEDGED") return "Acknowledged"
  if (state === "RESOLVED") return "Resolved"
  if (state === "DISMISSED") return "Dismissed"
  return state
}

export function alertSeverityLabel(severity: string): string {
  if (severity === "UNASSESSED") return "Unassessed"
  if (severity === "LOW") return "Low"
  if (severity === "MEDIUM") return "Medium"
  if (severity === "HIGH") return "High"
  if (severity === "CRITICAL") return "Critical"
  return severity
}

export function deliveryStatusLabel(status?: string | null, lifecycle?: string | null): string {
  if (status === "DELIVERED") return "Delivered"
  if (status === "PROVIDER_ACCEPTED") return "Provider accepted"
  if (status === "BOUNCED") return "Bounced"
  if (status === "COMPLAINED") return "Complained"
  if (status === "SUPPRESSED") return "Suppressed"
  if (status === "FAILED") return "Failed"
  if (lifecycle === "QUEUED") return "Queued"
  if (lifecycle === "REVIEWED") return "Reviewed"
  if (lifecycle === "DRAFT") return "Draft"
  return "Not sent"
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value
  return text && text.trim() ? text.trim() : null
}

export function parseAlertQueueCursors(
  params: Record<string, string | string[] | undefined>,
  isUuid: (value: string) => boolean,
): Record<GuardAlertQueueParam, { after: string | null; invalid: boolean }> {
  const read = (key: GuardAlertQueueParam) => {
    const text = firstQueryValue(params[key])
    if (!text) return { after: null, invalid: false }
    if (!isUuid(text)) return { after: null, invalid: true }
    return { after: text, invalid: false }
  }
  return {
    newReview: read("newReview"),
    acknowledged: read("acknowledged"),
    highCritical: read("highCritical"),
    needsReview: read("needsReview"),
    contact: read("contact"),
    access: read("access"),
    resolved: read("resolved"),
  }
}

export function guardAlertQueueHref(
  current: Record<string, string | null | undefined>,
  key: GuardAlertQueueParam,
  cursor?: string | null,
): string {
  const next = new URLSearchParams()
  for (const [name, value] of Object.entries(current)) {
    if (name === key || !value) continue
    next.set(name, value)
  }
  if (cursor) next.set(key, cursor)
  const query = next.toString()
  return query ? `/guard/alerts?${query}` : "/guard/alerts"
}

export function canEscalate(severity: string, state: string): boolean {
  return state === "ACKNOWLEDGED" && severity !== "CRITICAL" && severity !== "UNASSESSED"
}
