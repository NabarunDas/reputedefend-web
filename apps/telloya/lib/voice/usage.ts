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
  kind: "missing_from_leads" | "missing_from_provider" | "unknown_duration" | "guard_ignored" | "unresolved_concurrency"
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
  const exportIds = new Set(telloya.map((row) => row.callId))
  for (const row of telloya) {
    if (!leadIds.has(row.callId)) exceptions.push(exception(row.callId, "missing_from_leads"))
    if (row.durationSeconds == null) exceptions.push(exception(row.callId, "unknown_duration"))
  }
  for (const callId of input.leadCallIds) {
    if (!exportIds.has(callId)) exceptions.push(exception(callId, "missing_from_provider"))
  }

  const inProgress = [...(input.inProgressCallIds ?? [])]
  for (const callId of inProgress) {
    exceptions.push(exception(callId, "unresolved_concurrency"))
  }

  const unknownCallIds = telloya.filter((row) => row.durationSeconds == null).map((row) => row.callId)
  const durationsKnown =
    telloya.length > 0 &&
    unknownCallIds.length === 0 &&
    inProgress.length === 0 &&
    input.leadCallIds.every((callId) => exportIds.has(callId))
  const knownTelloyaSeconds = durationsKnown ? telloya.reduce((sum, row) => sum + Number(row.durationSeconds), 0) : null

  const reasons: string[] = []
  if (unknownCallIds.length > 0 || input.leadCallIds.some((callId) => !exportIds.has(callId))) reasons.push("unknown_usage")
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
