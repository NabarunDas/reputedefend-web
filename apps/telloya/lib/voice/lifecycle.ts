import type { CallRecord, ProjectedCall, ResolvedTenant } from "./types"
import { buildLead } from "./lead"
import { ensureNotificationIntent } from "./notify"

const AWAITING = "Awaiting analysis."
const NO_DETAILS = "No caller details were collected."
const FAILED_CALL = "The provider reported a failed call."

function withFacts(record: CallRecord, projected: ProjectedCall): CallRecord {
  return {
    ...record,
    durationSeconds: record.durationSeconds ?? projected.durationSeconds,
    disconnectionReason: record.disconnectionReason ?? projected.disconnectionReason,
    providerError: record.providerError || projected.providerError,
  }
}

function provisional(projected: ProjectedCall, tenant: ResolvedTenant, environment: string, nowIso: string): CallRecord {
  const lead = buildLead({
    environment,
    tenant,
    callId: projected.callId,
    analysis: null,
    providerError: projected.providerError,
    createdAt: nowIso,
    summaryFallback: AWAITING,
  })
  return {
    lead,
    finalised: false,
    finalisedBy: null,
    durationSeconds: projected.durationSeconds,
    disconnectionReason: projected.disconnectionReason,
    providerError: projected.providerError,
    notification: null,
  }
}

function fromAnalysis(current: CallRecord | null, projected: ProjectedCall, tenant: ResolvedTenant, environment: string, nowIso: string): CallRecord {
  const createdAt = current?.lead.createdAt ?? nowIso
  const base = current ? withFacts(current, projected) : provisional(projected, tenant, environment, nowIso)
  const providerError = base.providerError || projected.providerError
  const lead = buildLead({
    environment,
    tenant,
    callId: projected.callId,
    analysis: projected.analysis,
    providerError,
    createdAt,
    summaryFallback: providerError ? FAILED_CALL : NO_DETAILS,
  })
  return {
    ...base,
    lead,
    finalised: true,
    finalisedBy: "analysis",
    providerError,
    notification: current?.notification ?? null,
  }
}

/**
 * Apply one accepted event. Duplicate and conflicting deliveries never reach this function.
 * `call_ended` after analysis cannot replace the finalised summary or status.
 */
export function applyProjectedEvent(
  current: CallRecord | null,
  projected: ProjectedCall,
  tenant: ResolvedTenant,
  environment: string,
  nowIso: string,
): CallRecord | null {
  if (projected.event === "call_started") return current

  if (projected.event === "call_ended") {
    if (!current) return provisional(projected, tenant, environment, nowIso)
    if (current.finalised) return withFacts(current, projected)
    const next = withFacts(current, projected)
    if (next.providerError && next.lead.callStatus !== "failed") {
      return {
        ...next,
        lead: { ...next.lead, callStatus: "failed", incomplete: true },
      }
    }
    return next
  }

  return fromAnalysis(current, projected, tenant, environment, nowIso)
}

/** Explicit worker step. No timer. The wait before this runs is still unapproved. */
export function finaliseWithoutAnalysis(environment: string, record: CallRecord): CallRecord {
  if (record.finalised) return record
  const fallback = record.providerError ? FAILED_CALL : NO_DETAILS
  const summary = record.lead.summary === AWAITING ? fallback : record.lead.summary
  const finalised: CallRecord = {
    ...record,
    finalised: true,
    finalisedBy: "fallback",
    lead: {
      ...record.lead,
      summary,
      callStatus: record.providerError ? "failed" : "incomplete",
      incomplete: true,
    },
  }
  return ensureNotificationIntent(environment, finalised)
}
