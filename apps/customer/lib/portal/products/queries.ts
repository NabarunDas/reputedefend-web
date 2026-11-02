import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "@/lib/backend"
import { portalSessionCookieName } from "../config"
import type { CommercialProjection, CommercialStatus } from "./present"

const STATUSES = new Set<CommercialStatus>([
  "not_subscribed",
  "pending",
  "pilot",
  "setup",
  "ready_for_provider",
  "active",
  "suspended",
  "expired",
  "cancelled",
  "unavailable",
])

const UNAVAILABLE: CommercialProjection = {
  reads: { telloya: "unavailable", guard: "unavailable" },
  businesses: [],
}

async function portalToken(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(portalSessionCookieName())?.value
  return validToken(token) ? token : null
}

function status(value: unknown): CommercialStatus | null {
  return typeof value === "string" && STATUSES.has(value as CommercialStatus) ? value as CommercialStatus : null
}

function text(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= 300 ? trimmed : null
}

/**
 * Keeps the portal projection to display fields. A secret, amount, or raw
 * provider reference makes the read unavailable instead of being shown.
 */
export function parseCommercialProducts(value: unknown): CommercialProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const serialised = JSON.stringify(record)
  if (/cus_|sub_|si_|amount_minor|provider_binding|provider_test|provider_event|stripe/i.test(serialised)) return null
  const reads = record.reads
  if (!reads || typeof reads !== "object" || Array.isArray(reads)) return null
  const readRecord = reads as Record<string, unknown>
  if ((readRecord.telloya !== "ok" && readRecord.telloya !== "unavailable")
    || (readRecord.guard !== "ok" && readRecord.guard !== "unavailable")) return null
  if (!Array.isArray(record.businesses)) return null
  const businesses = []
  for (const entry of record.businesses) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null
    const business = entry as Record<string, unknown>
    const businessName = text(business.businessName)
    const telloya = section(business.telloya, false)
    const guard = section(business.guard, true)
    if (!businessName || !telloya || !guard) return null
    businesses.push({ businessName, telloya, guard })
  }
  return {
    reads: { telloya: readRecord.telloya, guard: readRecord.guard },
    businesses,
  }
}

function section(value: unknown, guard: false): { status: CommercialStatus; locations: Array<{ locationName: string; status: CommercialStatus; nextStep: string | null }> } | null
function section(value: unknown, guard: true): { status: CommercialStatus; locations: Array<{ locationName: string; status: CommercialStatus; monitoringRecorded: boolean; allocation: "preview" | "reserved" | null; nextStep: string | null }> } | null
function section(value: unknown, guard: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const sectionStatus = status(record.status)
  if (!sectionStatus || !Array.isArray(record.locations)) return null
  const locations = []
  for (const entry of record.locations) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null
    const location = entry as Record<string, unknown>
    const locationName = text(location.locationName)
    const locationStatus = status(location.status)
    const nextStep = text(location.nextStep)
    if (!locationName || !locationStatus || (location.nextStep != null && !nextStep)) return null
    if (!guard) {
      locations.push({ locationName, status: locationStatus, nextStep })
      continue
    }
    if (typeof location.monitoringRecorded !== "boolean") return null
    const allocation = location.allocation == null
      ? null
      : location.allocation === "preview" || location.allocation === "reserved"
        ? location.allocation
        : undefined
    if (allocation === undefined) return null
    locations.push({
      locationName,
      status: locationStatus,
      monitoringRecorded: location.monitoringRecorded,
      allocation,
      nextStep,
    })
  }
  return { status: sectionStatus, locations }
}

/**
 * Session-scoped commercial projection. The token hash is the only argument.
 * A thrown or unreadable payload is unavailable, which is not a purchase result.
 * Null is an invalid session.
 */
export async function loadCommercialProducts(): Promise<CommercialProjection | "unauthenticated"> {
  const token = await portalToken()
  if (!token) return "unauthenticated"
  try {
    const row = await backend().rpc<unknown>("customer_portal_products_v1", { p_token_hash: tokenHash(token) })
    if (row == null) return "unauthenticated"
    return parseCommercialProducts(row) ?? UNAVAILABLE
  } catch {
    return UNAVAILABLE
  }
}
