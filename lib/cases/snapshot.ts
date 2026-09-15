import {
  isCaseService,
  isEnquirySource,
  type EnquiryInput,
} from "@/lib/enquiry"

export type IntakeSnapshot = {
  service: EnquiryInput["service"]
  fullName: string
  email: string
  businessName: string
  country: string
  phone: string
  websiteUrl: string
  businessProfileUrl: string
  reviewUrl: string
  details: string
  informationAccurate: boolean
  privacyAccepted: boolean
  source: EnquiryInput["source"]
}

export function buildIntakeSnapshot(data: EnquiryInput): IntakeSnapshot {
  return {
    service: data.service,
    fullName: data.fullName,
    email: data.email,
    businessName: data.businessName,
    country: data.country,
    phone: data.phone,
    websiteUrl: data.websiteUrl,
    businessProfileUrl: data.businessProfileUrl,
    reviewUrl: data.reviewUrl,
    details: data.details,
    informationAccurate: data.informationAccurate,
    privacyAccepted: data.privacyAccepted,
    source: data.source,
  }
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : null
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : ""
}

/**
 * Reads a persisted intake snapshot. Returns null when the stored value
 * cannot safely drive transactional email.
 */
export function parseIntakeSnapshot(value: unknown): IntakeSnapshot | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  const service = asTrimmedString(raw.service)
  const fullName = asTrimmedString(raw.fullName)
  const email = asTrimmedString(raw.email)
  const businessName = asTrimmedString(raw.businessName)
  const country = asTrimmedString(raw.country)
  const details = asTrimmedString(raw.details)
  if (!service || !fullName || !email || !businessName || !country || !details) return null
  if (!isCaseService(service)) return null

  const sourceRaw = asTrimmedString(raw.source)
  const source = sourceRaw && isEnquirySource(sourceRaw) ? sourceRaw : "get-help"

  return {
    service,
    fullName,
    email,
    businessName,
    country,
    phone: asOptionalString(raw.phone),
    websiteUrl: asOptionalString(raw.websiteUrl),
    businessProfileUrl: asOptionalString(raw.businessProfileUrl),
    reviewUrl: asOptionalString(raw.reviewUrl),
    details,
    informationAccurate: raw.informationAccurate === true,
    privacyAccepted: raw.privacyAccepted === true,
    source,
  }
}

export function enquiryInputFromSnapshot(snapshot: IntakeSnapshot): EnquiryInput {
  return {
    ...snapshot,
    subject: "",
  }
}
