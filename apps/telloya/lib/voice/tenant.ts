import type { NumberMapRow, ResolvedTenant, TenantFailure, VoiceEnvironment } from "./types"
import { normaliseTelephone } from "./validate"

export type TenantQuery = {
  maps: readonly NumberMapRow[]
  environment: VoiceEnvironment
  toNumber: string
  agentId: string
}

export type TenantResult = { ok: true; tenant: ResolvedTenant } | { ok: false; reason: TenantFailure }

/**
 * Resolve a called number and agent inside one environment.
 * Caller metadata is not an input. DEV and production rows never match each other.
 */
export function resolveTenant(query: TenantQuery): TenantResult {
  const toNumber = normaliseTelephone(query.toNumber)
  if (!toNumber || !query.agentId) return { ok: false, reason: "missing_identity" }

  const inEnvironment = query.maps.filter((row) => row.environment === query.environment)
  const otherEnvironment = query.maps.some(
    (row) => row.environment !== query.environment && normaliseTelephone(row.inboundToNumber) === toNumber && row.agentId === query.agentId,
  )
  const activeMatches = inEnvironment.filter((row) => row.active && normaliseTelephone(row.inboundToNumber) === toNumber)
  if (activeMatches.length === 0) {
    const inactive = inEnvironment.some((row) => !row.active && normaliseTelephone(row.inboundToNumber) === toNumber)
    if (inactive) return { ok: false, reason: "inactive" }
    if (otherEnvironment) return { ok: false, reason: "environment_mismatch" }
    return { ok: false, reason: "unknown" }
  }
  if (activeMatches.length !== 1) return { ok: false, reason: "ambiguous" }

  const match = activeMatches[0]
  if (match.agentId !== query.agentId) return { ok: false, reason: "agent_mismatch" }

  const agentElsewhere = inEnvironment.some(
    (row) => row.active && row.agentId === query.agentId && row.locationId !== match.locationId,
  )
  if (agentElsewhere) return { ok: false, reason: "ambiguous" }

  return { ok: true, tenant: { businessId: match.businessId, locationId: match.locationId } }
}
