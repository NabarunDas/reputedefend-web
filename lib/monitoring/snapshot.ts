import {
  MONITORING_INTAKE_SOURCE,
  type MonitoringIntakeSource,
} from "@/lib/monitoring/domain"

export type MonitoringIntakeSnapshot = {
  fullName: string
  email: string
  phone: string
  businessName: string
  country: string
  websiteUrl: string
  businessProfileUrl: string
  numberOfLocations: number
  termsAccepted: boolean
  source: MonitoringIntakeSource
}

export type MonitoringIntakeInput = {
  fullName: string
  email: string
  phone: string
  businessName: string
  country: string
  websiteUrl: string
  businessProfileUrl: string
  numberOfLocations: number
  termsAccepted: boolean
}

export function buildMonitoringIntakeSnapshot(data: MonitoringIntakeInput): MonitoringIntakeSnapshot {
  return {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    businessName: data.businessName,
    country: data.country,
    websiteUrl: data.websiteUrl,
    businessProfileUrl: data.businessProfileUrl,
    numberOfLocations: data.numberOfLocations,
    termsAccepted: data.termsAccepted,
    source: MONITORING_INTAKE_SOURCE,
  }
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : null
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

/**
 * Reads a persisted monitoring intake snapshot.
 * Returns null when the stored value cannot safely drive later retries.
 */
export function parseMonitoringIntakeSnapshot(value: unknown): MonitoringIntakeSnapshot | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  const fullName = asTrimmedString(raw.fullName)
  const email = asTrimmedString(raw.email)
  const businessName = asTrimmedString(raw.businessName)
  const country = asTrimmedString(raw.country)
  const businessProfileUrl = asTrimmedString(raw.businessProfileUrl)
  const numberOfLocations = asPositiveInteger(raw.numberOfLocations)
  if (!fullName || !email || !businessName || !country || !businessProfileUrl) return null
  if (numberOfLocations == null) return null
  if (raw.source !== MONITORING_INTAKE_SOURCE) return null

  return {
    fullName,
    email,
    phone: asOptionalString(raw.phone),
    businessName,
    country,
    websiteUrl: asOptionalString(raw.websiteUrl),
    businessProfileUrl,
    numberOfLocations,
    termsAccepted: raw.termsAccepted === true,
    source: MONITORING_INTAKE_SOURCE,
  }
}
