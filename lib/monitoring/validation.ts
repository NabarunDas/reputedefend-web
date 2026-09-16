import {
  MONITORING_INTAKE_SOURCE,
  MONITORING_LOCATIONS_MAX,
  MONITORING_LOCATIONS_MIN,
} from "@/lib/monitoring/domain"
import type { MonitoringIntakeInput } from "@/lib/monitoring/snapshot"

export const monitoringLimits = {
  fullName: 100,
  email: 254,
  businessName: 160,
  country: 80,
  phone: 40,
  websiteUrl: 1000,
  businessProfileUrl: 1000,
  source: 32,
} as const

export type MonitoringField = keyof MonitoringIntakeInput
export type MonitoringFieldErrors = Partial<Record<MonitoringField, string>>

export type MonitoringValidation =
  | { valid: true; data: MonitoringIntakeInput }
  | { valid: false; error: string; errors?: MonitoringFieldErrors }

export const MONITORING_PROCESS_ERROR = "Unable to process this request."

const STRING_FIELDS = [
  "fullName",
  "email",
  "phone",
  "businessName",
  "country",
  "websiteUrl",
  "businessProfileUrl",
  "source",
  "companyFax",
] as const

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/
const PHONE_PATTERN = /^[+]?[\d\s().-]{7,}$/

export function normalizeMonitoringText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asAccepted(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1"
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
  } catch {
    return false
  }
}

export function parseNumberOfLocations(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return null
    return value
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!/^-?\d+$/.test(trimmed)) return null
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed)) return null
    return parsed
  }
  return null
}

function firstError(errors: MonitoringFieldErrors, fallback: string) {
  return Object.values(errors)[0] ?? fallback
}

export function collectMonitoringErrors(data: MonitoringIntakeInput): MonitoringFieldErrors {
  const errors: MonitoringFieldErrors = {}

  if (!data.fullName) errors.fullName = "Please enter your name."
  else if (data.fullName.length > monitoringLimits.fullName) {
    errors.fullName = `Please keep your name within ${monitoringLimits.fullName} characters.`
  }

  if (!data.email || !EMAIL_PATTERN.test(data.email) || data.email.length > monitoringLimits.email) {
    errors.email = "Please enter a valid email address."
  }

  if (!data.businessName) errors.businessName = "Please enter your business name."
  else if (data.businessName.length > monitoringLimits.businessName) {
    errors.businessName = `Please keep the business name within ${monitoringLimits.businessName} characters.`
  }

  if (!data.country) errors.country = "Please enter the country your business is based in."
  else if (data.country.length > monitoringLimits.country) {
    errors.country = `Please keep the country within ${monitoringLimits.country} characters.`
  }

  if (data.phone) {
    if (data.phone.length > monitoringLimits.phone || !PHONE_PATTERN.test(data.phone)) {
      errors.phone = "Please enter a valid phone number, or leave this field blank."
    }
  }

  if (data.websiteUrl) {
    if (data.websiteUrl.length > monitoringLimits.websiteUrl || !isHttpUrl(data.websiteUrl)) {
      errors.websiteUrl = "Please enter a valid website URL, or leave this field blank."
    }
  }

  if (!data.businessProfileUrl) {
    errors.businessProfileUrl = "Please enter the Google Business Profile URL."
  } else if (
    data.businessProfileUrl.length > monitoringLimits.businessProfileUrl
    || !isHttpUrl(data.businessProfileUrl)
  ) {
    errors.businessProfileUrl = "Please enter a valid Google Business Profile URL."
  }

  if (
    !Number.isInteger(data.numberOfLocations)
    || data.numberOfLocations < MONITORING_LOCATIONS_MIN
    || data.numberOfLocations > MONITORING_LOCATIONS_MAX
  ) {
    errors.numberOfLocations = `Please enter a whole number of locations between ${MONITORING_LOCATIONS_MIN} and ${MONITORING_LOCATIONS_MAX}.`
  }

  if (!data.termsAccepted) {
    errors.termsAccepted = "Please confirm that you are authorised to request this setup."
  }

  return errors
}

export function validateMonitoringRequest(raw: unknown): MonitoringValidation {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: MONITORING_PROCESS_ERROR }
  }

  const input = raw as Record<string, unknown>

  for (const key of STRING_FIELDS) {
    if (key in input && input[key] != null && typeof input[key] !== "string") {
      return { valid: false, error: MONITORING_PROCESS_ERROR }
    }
  }

  if ("termsAccepted" in input && input.termsAccepted != null
    && typeof input.termsAccepted !== "boolean"
    && typeof input.termsAccepted !== "string") {
    return { valid: false, error: MONITORING_PROCESS_ERROR }
  }

  if (normalizeMonitoringText(asString(input.companyFax))) {
    return { valid: false, error: MONITORING_PROCESS_ERROR }
  }

  const source = normalizeMonitoringText(asString(input.source))
  if (source && source !== MONITORING_INTAKE_SOURCE) {
    return { valid: false, error: MONITORING_PROCESS_ERROR }
  }

  const numberOfLocations = parseNumberOfLocations(input.numberOfLocations)
  const data: MonitoringIntakeInput = {
    fullName: normalizeMonitoringText(asString(input.fullName)),
    email: normalizeMonitoringText(asString(input.email)),
    phone: normalizeMonitoringText(asString(input.phone)),
    businessName: normalizeMonitoringText(asString(input.businessName)),
    country: normalizeMonitoringText(asString(input.country)),
    websiteUrl: normalizeMonitoringText(asString(input.websiteUrl)),
    businessProfileUrl: normalizeMonitoringText(asString(input.businessProfileUrl)),
    numberOfLocations: numberOfLocations ?? Number.NaN,
    termsAccepted: asAccepted(input.termsAccepted),
  }

  const errors = collectMonitoringErrors(data)
  if (Object.keys(errors).length) {
    return { valid: false, error: firstError(errors, "Please check the highlighted fields."), errors }
  }

  return { valid: true, data }
}
