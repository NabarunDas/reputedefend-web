export const guardCheckOperations = ["claim", "release", "fail", "complete", "cancel"] as const
export type GuardCheckOperation = (typeof guardCheckOperations)[number]

export const guardCheckClassifications = ["HEALTHY", "CHANGE_DETECTED", "PROFILE_UNAVAILABLE", "INCOMPLETE"] as const
export type GuardCheckClassification = (typeof guardCheckClassifications)[number]
export const guardCheckAvailabilities = ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"] as const
export type GuardCheckAvailability = (typeof guardCheckAvailabilities)[number]

export function guardCheckClassificationAllowed(
  availability: string,
  classification: string,
): boolean {
  if (availability === "AVAILABLE") return classification === "HEALTHY" || classification === "CHANGE_DETECTED" || classification === "INCOMPLETE"
  if (availability === "UNAVAILABLE") return classification === "PROFILE_UNAVAILABLE"
  if (availability === "UNKNOWN") return classification === "INCOMPLETE"
  return false
}

export function classificationsForAvailability(availability: string): GuardCheckClassification[] {
  if (availability === "UNAVAILABLE") return ["PROFILE_UNAVAILABLE"]
  if (availability === "UNKNOWN") return ["INCOMPLETE"]
  return ["HEALTHY", "CHANGE_DETECTED", "INCOMPLETE"]
}

export type GuardCheckObligation = {
  id: string
  coverageId: string
  locationId: string
  customerName?: string | null
  businessName?: string | null
  locationName?: string | null
  coverageBasis: string
  coverageState?: string | null
  serviceDate: string
  windowCode: "MORNING" | "EVENING" | string
  state: string
  timezone: string
  localStart?: string | null
  localEnd?: string | null
  windowStartAt?: string | null
  windowEndAt?: string | null
  windowOpen?: boolean
  upcoming?: boolean
  claimedBy?: string | null
  claimedAt?: string | null
  claimExpiresAt?: string | null
  firstClaimedAt?: string | null
  completedAt?: string | null
  missedAt?: string | null
  late: boolean
  secondsLate: number
  handlingSeconds?: number | null
  queueWaitSeconds?: number | null
  attemptCount: number
  retryCount: number
  version: number
  baselineAvailable?: boolean
  previousObservation?: {
    id: string
    classification: string
    observedAt: string
    displayedBusinessName?: string | null
    reviewCount?: number | null
  } | null
}

export type GuardCheckAttempt = {
  id: string
  attemptNumber: number
  actorId: string
  startedAt: string
  finishedAt?: string | null
  outcome?: string | null
  failureReason?: string
  handlingSeconds?: number | null
  retryable: boolean
}

export type GuardCheckObservation = {
  id: string
  classification: string
  profileAvailability: string
  displayedBusinessName?: string | null
  reviewCount?: number | null
  rating?: number | null
  ratingAvailable?: boolean
  changeCodes?: string[]
  comparisonStatus?: string
  baselineId?: string | null
  observedAt: string
  notes?: string
  attentionCandidate?: boolean
}

export type GuardCheckList = {
  serviceDate: string
  timezone: string
  scheduleConfigured: boolean
  scheduleVersionId?: string | null
  morningLocalStart?: string | null
  morningLocalEnd?: string | null
  eveningLocalStart?: string | null
  eveningLocalEnd?: string | null
  claimedByMe?: string | null
  now?: string | null
  queue?: string | null
  limit?: number
  hasMore?: boolean
  nextCursor?: string | null
  status?: string
  reason?: string
  obligations: GuardCheckObligation[]
}

export type GuardCheckQueuePage = {
  rows: GuardCheckObligation[]
  hasMore: boolean
  nextCursor?: string | null
  after?: string | null
  invalidCursor?: boolean
}

export type GuardCheckQueues = Omit<GuardCheckList, "obligations" | "queue" | "nextCursor" | "hasMore"> & {
  morning: GuardCheckQueuePage
  evening: GuardCheckQueuePage
  claimed: GuardCheckQueuePage
  retry: GuardCheckQueuePage
  missed: GuardCheckQueuePage
  completed: GuardCheckQueuePage
}

export type GuardCheckDetail = Omit<GuardCheckList, "obligations"> & {
  obligation?: GuardCheckObligation
  attempts?: GuardCheckAttempt[]
  observation?: GuardCheckObservation | null
}

export function windowLabel(code: string): string {
  if (code === "MORNING") return "Morning"
  if (code === "EVENING") return "Evening"
  return code
}

export function obligationStateLabel(state: string): string {
  if (state === "PENDING") return "Pending"
  if (state === "CLAIMED") return "Claimed"
  if (state === "COMPLETED") return "Completed"
  if (state === "CANCELLED") return "Cancelled"
  return state
}

export function londonDateTime(value?: string | null): string {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value))
}

export function localWindowLabel(start?: string | null, end?: string | null, configured = true): string {
  if (!configured || !start || !end) return "Schedule not configured"
  return `${String(start).slice(0, 5)}–${String(end).slice(0, 5)} Europe/London`
}

export function claimIsActive(obligation: GuardCheckObligation, now?: string | null): boolean {
  if (obligation.state !== "CLAIMED" || !obligation.claimedBy || !obligation.claimExpiresAt) return false
  if (!now) return true
  return new Date(obligation.claimExpiresAt).getTime() > new Date(now).getTime()
}

export function canCancelCheck(obligation: GuardCheckObligation): boolean {
  if (obligation.state !== "PENDING" && obligation.state !== "CLAIMED") return false
  return Boolean(obligation.coverageState && obligation.coverageState !== "ACTIVE")
}

export function claimedWorkSurface(
  obligation: GuardCheckObligation,
  actor?: string | null,
  now?: string | null,
): "mine" | "other" | "expired" | "none" {
  if (obligation.state !== "CLAIMED") return "none"
  if (!claimIsActive(obligation, now)) return "expired"
  if (obligation.claimedBy === actor) return "mine"
  return "other"
}

export function queueFor(obligation: GuardCheckObligation, actor?: string | null, now?: string | null): string[] {
  const queues: string[] = []
  if (obligation.windowCode === "MORNING" && obligation.state !== "COMPLETED" && obligation.state !== "CANCELLED") queues.push("morning")
  if (obligation.windowCode === "EVENING" && obligation.state !== "COMPLETED" && obligation.state !== "CANCELLED") queues.push("evening")
  if (claimIsActive(obligation, now) && obligation.claimedBy === actor) queues.push("claimed")
  if (obligation.retryCount > 0 && obligation.state === "PENDING") queues.push("retry")
  if (obligation.missedAt && obligation.state !== "COMPLETED" && obligation.state !== "CANCELLED") queues.push("missed")
  if (obligation.state === "COMPLETED") queues.push("completed")
  return queues
}

export function obligationQueueLabel(obligation: GuardCheckObligation): string {
  if (obligation.upcoming || obligation.windowOpen === false) return "Upcoming"
  return obligationStateLabel(obligation.state)
}

export const guardCheckQueueParams = {
  morning: "MORNING",
  evening: "EVENING",
  claimed: "CLAIMED_BY_ME",
  retry: "RETRY_REQUIRED",
  missed: "MISSED",
  completed: "COMPLETED_TODAY",
} as const

export type GuardCheckQueueParam = keyof typeof guardCheckQueueParams

function firstQueryValue(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value
  return text && text.trim() ? text.trim() : null
}

export function parseCheckQueueCursors(
  params: Record<string, string | string[] | undefined>,
  isUuid: (value: string) => boolean,
): Record<GuardCheckQueueParam, { after: string | null; invalid: boolean }> {
  const read = (key: GuardCheckQueueParam) => {
    const text = firstQueryValue(params[key])
    if (!text) return { after: null, invalid: false }
    if (!isUuid(text)) return { after: null, invalid: true }
    return { after: text, invalid: false }
  }
  return {
    morning: read("morning"),
    evening: read("evening"),
    claimed: read("claimed"),
    retry: read("retry"),
    missed: read("missed"),
    completed: read("completed"),
  }
}

export function guardCheckQueueHref(
  current: Record<string, string | null | undefined>,
  key: GuardCheckQueueParam,
  cursor?: string | null,
): string {
  const next = new URLSearchParams()
  for (const [name, value] of Object.entries(current)) {
    if (name === key || !value) continue
    next.set(name, value)
  }
  if (cursor) next.set(key, cursor)
  const query = next.toString()
  return query ? `/guard/checks?${query}` : "/guard/checks"
}
