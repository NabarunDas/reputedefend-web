export const guardCheckOperations = ["claim", "release", "fail", "complete", "cancel"] as const
export type GuardCheckOperation = (typeof guardCheckOperations)[number]

export const guardCheckClassifications = ["HEALTHY", "CHANGE_DETECTED", "PROFILE_UNAVAILABLE", "INCOMPLETE"] as const
export type GuardCheckClassification = (typeof guardCheckClassifications)[number]

export type GuardCheckObligation = {
  id: string
  coverageId: string
  locationId: string
  customerName?: string | null
  businessName?: string | null
  locationName?: string | null
  coverageBasis: string
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
  obligations: GuardCheckObligation[]
}

export type GuardCheckQueues = Omit<GuardCheckList, "obligations" | "queue" | "nextCursor"> & {
  morning: GuardCheckObligation[]
  evening: GuardCheckObligation[]
  claimed: GuardCheckObligation[]
  retry: GuardCheckObligation[]
  missed: GuardCheckObligation[]
  completed: GuardCheckObligation[]
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
