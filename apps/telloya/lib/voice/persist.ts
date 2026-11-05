import { acceptVoiceWebhook, hashRawBody, type AcceptResult } from "./accept"
import { verifyRetellSignature } from "./signature"
import { projectRetellEvent } from "./validate"
import type {
  CallRecord,
  EventReceipt,
  NumberMapRow,
  StoredCall,
  VoiceEnvironment,
  VoiceLogOutcome,
  VoiceState,
} from "./types"

/**
 * Local database adapter. Signature checks and event projection stay in
 * TypeScript. PostgreSQL chooses the tenant from the number binding and
 * stores the receipt, lead, and notification intent together.
 * This module does not read process configuration, send mail, or expose a route.
 */

export type VoiceDb = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>
}

export type PersistInput = {
  enabledFlag: string | undefined
  environment: VoiceEnvironment
  apiKey: string
  nowMs: number
  nowIso: string
  rawBody: string
  signatureHeader: string | null
}

const SQL_OUTCOMES = new Set<VoiceLogOutcome>(["accepted", "duplicate", "conflict", "unknown_tenant"])

function jsonValue<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T
  return value as T
}

function text(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null
  return value
}

function snapshotState(snapshot: Record<string, unknown>): { maps: NumberMapRow[]; state: VoiceState } {
  const bindings = Array.isArray(snapshot.bindings) ? snapshot.bindings : []
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts : []
  const maps: NumberMapRow[] = bindings.flatMap((row) => {
    if (row == null || typeof row !== "object") return []
    const binding = row as Record<string, unknown>
    const environment = binding.environment === "production" ? "production" : binding.environment === "dev" ? "dev" : null
    if (environment == null || typeof binding.inboundToNumber !== "string" || typeof binding.agentId !== "string") return []
    if (typeof binding.businessId !== "string" || typeof binding.locationId !== "string" || typeof binding.active !== "boolean") return []
    return [{
      inboundToNumber: binding.inboundToNumber,
      agentId: binding.agentId,
      businessId: binding.businessId,
      locationId: binding.locationId,
      environment,
      active: binding.active,
    }]
  })
  const storedReceipts: EventReceipt[] = receipts.flatMap((row) => {
    if (row == null || typeof row !== "object") return []
    const receipt = row as Record<string, unknown>
    const environment = receipt.environment === "production" ? "production" : receipt.environment === "dev" ? "dev" : null
    if (environment == null || typeof receipt.event !== "string" || typeof receipt.callId !== "string" || typeof receipt.rawBodyHash !== "string") return []
    const conflicts = Array.isArray(receipt.conflicts) ? receipt.conflicts.filter((hash): hash is string => typeof hash === "string") : []
    return [{ environment, event: receipt.event as EventReceipt["event"], callId: receipt.callId, rawBodyHash: receipt.rawBodyHash, conflicts }]
  })
  const calls: StoredCall[] = []
  if (snapshot.lead != null && typeof snapshot.lead === "object") {
    const stored = snapshot.lead as Record<string, unknown>
    const lead = stored.lead
    const environment = stored.environment === "production" ? "production" : stored.environment === "dev" ? "dev" : null
    if (environment != null && lead != null && typeof lead === "object") {
      const record = lead as CallRecord["lead"]
      const notification = stored.notification
      calls.push({
        environment,
        record: {
          lead: {
            ...record,
            createdAt: typeof record.createdAt === "string" ? record.createdAt : String(record.createdAt),
          },
          finalised: stored.finalised === true,
          finalisedBy: stored.finalisedBy === "analysis" || stored.finalisedBy === "fallback" ? stored.finalisedBy : null,
          durationSeconds: typeof stored.durationSeconds === "number" ? stored.durationSeconds : null,
          disconnectionReason: text(stored.disconnectionReason),
          providerError: stored.providerError === true,
          notification: notification != null && typeof notification === "object"
            ? notification as CallRecord["notification"]
            : null,
        },
      })
    }
  }
  return { maps, state: { receipts: storedReceipts, calls } }
}

function commitPayload(input: PersistInput, hash: string, projected: { event: string; callId: string; toNumber: string; agentId: string }, record: CallRecord | undefined) {
  const payload: Record<string, unknown> = {
    environment: input.environment,
    event: projected.event,
    callId: projected.callId,
    bodySha256: hash,
    toNumber: projected.toNumber,
    agentId: projected.agentId,
  }
  if (!record || projected.event === "call_started") return payload
  payload.durationSeconds = record.durationSeconds
  payload.disconnectionReason = record.disconnectionReason
  payload.providerError = record.providerError
  payload.callerName = record.lead.callerName
  payload.callbackNumber = record.lead.callbackNumber
  payload.serviceRequested = record.lead.serviceRequested
  payload.jobLocation = record.lead.jobLocation
  payload.callbackWindow = record.lead.callbackWindow
  payload.summary = record.lead.summary
  payload.incomplete = record.lead.incomplete
  payload.callStatus = record.lead.callStatus
  payload.finalised = record.finalised
  payload.finalisedBy = record.finalisedBy
  payload.createdAt = record.lead.createdAt
  payload.notificationStatus = record.finalised && record.notification == null ? "pending" : record.notification?.status ?? null
  return payload
}

export async function persistVoiceEvent(db: VoiceDb, input: PersistInput): Promise<AcceptResult> {
  const verified = verifyRetellSignature({
    rawBody: input.rawBody,
    apiKey: input.apiKey,
    signature: input.signatureHeader,
    nowMs: input.nowMs,
  })
  const projectedEarly = verified ? projectRetellEvent(input.rawBody) : null
  const callId = projectedEarly?.callId ?? ""
  const loaded = input.enabledFlag === "true" && verified && projectedEarly?.ok
    ? await db.query("select public.telloya_voice_lane_snapshot_v1($1, $2) as snapshot", [input.environment, callId])
    : null
  const snapshot = loaded ? jsonValue<Record<string, unknown>>(loaded.rows[0]?.snapshot ?? {}) : {}
  const { maps, state } = snapshotState(snapshot)
  const accepted = acceptVoiceWebhook({
    state,
    enabledFlag: input.enabledFlag,
    environment: input.environment,
    apiKey: input.apiKey,
    nowMs: input.nowMs,
    nowIso: input.nowIso,
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    maps,
  })
  if (accepted.status !== 204 || accepted.log.outcome === "rejected_schema" || !projectedEarly?.ok) return accepted

  const record = accepted.state.calls.find((call) => call.environment === input.environment && call.record.lead.providerCallRef === projectedEarly.callId)?.record
  const payload = commitPayload(input, hashRawBody(input.rawBody), projectedEarly.projected, record)
  const committed = await db.query("select public.telloya_voice_commit_event_v1($1::jsonb) as result", [JSON.stringify(payload)])
  const result = jsonValue<{ outcome?: string }>(committed.rows[0]?.result ?? {})
  const outcome = SQL_OUTCOMES.has(result.outcome as VoiceLogOutcome) ? result.outcome as VoiceLogOutcome : accepted.log.outcome
  const notificationStatus = outcome === "accepted" && payload.notificationStatus === "pending"
    ? "pending"
    : accepted.log.notificationStatus
  return {
    ...accepted,
    log: { ...accepted.log, outcome, notificationStatus },
  }
}
