export type UsageExportRow = {
  callId: string
  durationSeconds: number | null
  product: "telloya" | "guard"
}

export type EntitlementRead =
  | { status: "unreadable" }
  | { status: "missing" }
  | {
      status: "readable"
      includedMinutes: number | null
      overageOptIn: boolean
      monthlyCapGbp: number | null
      authorisationSource: "commercial_offer" | "enquiry_preference"
    }

export type UsageException = {
  callId: string
  kind:
    | "missing_from_leads"
    | "missing_from_provider"
    | "unknown_duration"
    | "invalid_duration"
    | "duplicate_call_id"
    | "guard_ignored"
    | "unresolved_concurrency"
  recordedAsZero: false
  billedSeconds: null
}

export type ChargeDecision = {
  authorised: false
  overageActive: false
  hardCapGuaranteed: false
  unknownTreatedAsZero: false
  stoppedCall: false
  reasons: string[]
  unknownCallIds: string[]
  unresolvedCallIds: string[]
  exceptions: UsageException[]
  knownTelloyaSeconds: number | null
}

export type ReconciliationInput = {
  leadCallIds: readonly string[]
  providerExport: readonly UsageExportRow[]
  entitlement: EntitlementRead
  inProgressCallIds?: readonly string[]
}

function exception(callId: string, kind: UsageException["kind"]): UsageException {
  return { callId, kind, recordedAsZero: false, billedSeconds: null }
}

/** A duration can be summed only when the provider reported a non-negative whole number of seconds. */
export function resolvedDurationSeconds(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null
  return value
}

function durationProblem(value: number | null): "unknown_duration" | "invalid_duration" | null {
  if (value == null) return "unknown_duration"
  if (resolvedDurationSeconds(value) == null) return "invalid_duration"
  return null
}

function sumResolvedTelloyaSeconds(rows: readonly UsageExportRow[]): number | null {
  let total = 0
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.callId)) return null
    seen.add(row.callId)
    const seconds = resolvedDurationSeconds(row.durationSeconds)
    if (seconds == null) return null
    total += seconds
  }
  return total
}

/**
 * Post-call reconciliation only. A completed call is not stopped here,
 * and a charge is never authorised from this function.
 */
export function reconcileUsage(input: ReconciliationInput): ChargeDecision {
  const telloya = input.providerExport.filter((row) => row.product === "telloya")
  const exceptions: UsageException[] = input.providerExport
    .filter((row) => row.product === "guard")
    .map((row) => exception(row.callId, "guard_ignored"))

  const leadIds = new Set(input.leadCallIds)
  const seenCallIds = new Set<string>()
  const duplicateCallIds = new Set<string>()
  for (const row of telloya) {
    if (seenCallIds.has(row.callId)) duplicateCallIds.add(row.callId)
    seenCallIds.add(row.callId)
    if (!leadIds.has(row.callId)) exceptions.push(exception(row.callId, "missing_from_leads"))
    const problem = durationProblem(row.durationSeconds)
    if (problem) exceptions.push(exception(row.callId, problem))
  }
  for (const callId of duplicateCallIds) exceptions.push(exception(callId, "duplicate_call_id"))
  const exportIds = seenCallIds
  for (const callId of input.leadCallIds) {
    if (!exportIds.has(callId)) exceptions.push(exception(callId, "missing_from_provider"))
  }

  const inProgress = [...(input.inProgressCallIds ?? [])]
  for (const callId of inProgress) {
    exceptions.push(exception(callId, "unresolved_concurrency"))
  }

  const unknownCallIds = [...new Set(telloya.flatMap((row) => (durationProblem(row.durationSeconds) ? [row.callId] : [])))]
  const exportWiderThanLeads = telloya.some((row) => !leadIds.has(row.callId))
  const durationsKnown =
    telloya.length > 0 &&
    duplicateCallIds.size === 0 &&
    unknownCallIds.length === 0 &&
    !exportWiderThanLeads &&
    inProgress.length === 0 &&
    input.leadCallIds.every((callId) => exportIds.has(callId))
  const knownTelloyaSeconds = durationsKnown ? sumResolvedTelloyaSeconds(telloya) : null

  const reasons: string[] = []
  if (unknownCallIds.length > 0 || duplicateCallIds.size > 0 || exportWiderThanLeads || input.leadCallIds.some((callId) => !exportIds.has(callId))) {
    reasons.push("unknown_usage")
  }
  if (input.entitlement.status !== "readable") reasons.push("missing_entitlement")
  if (input.entitlement.status === "readable" && input.entitlement.authorisationSource === "enquiry_preference") {
    reasons.push("enquiry_preference")
  }
  if (inProgress.length > 0) reasons.push("unresolved_concurrency")
  reasons.push("overage_not_activated")
  reasons.push("no_hard_cap_from_completed_call")

  return {
    authorised: false,
    overageActive: false,
    hardCapGuaranteed: false,
    unknownTreatedAsZero: false,
    stoppedCall: false,
    reasons,
    unknownCallIds,
    unresolvedCallIds: [...inProgress],
    exceptions,
    knownTelloyaSeconds,
  }
}
