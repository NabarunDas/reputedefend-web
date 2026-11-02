/**
 * Telloya enquiry types and validation
 * Shared between main app (persistence) and Telloya app (form)
 */

import { canonicalBusinessCountry } from "@shared/countries"

export const TELLOYA_PRODUCTS = ["telloya", "complete", ""] as const
export type TelloyaProduct = (typeof TELLOYA_PRODUCTS)[number]

export const telloyaEnquiryLimits = {
  fullName: 100,
  email: 254,
  businessName: 160,
  country: 80,
  trade: 100,
  locations: 50,
  websiteUrl: 1000,
  phone: 40,
  product: 64,
  missedCallProblem: 5000,
  phoneSetup: 5000,
  contactPreference: 100,
  source: 32,
} as const

export type TelloyaEnquiryInput = {
  // Business details
  businessName: string
  country: string
  trade: string
  locations?: string
  websiteUrl?: string

  // Contact details
  fullName: string
  email: string
  phone: string

  // Product interest
  product: TelloyaProduct

  // Requirements
  missedCallProblem?: string
  phoneSetup?: string
  contactPreference?: string

  // Consent
  privacyAccepted: boolean

  // Technical
  source: "telloya"
}

export type TelloyaEnquiryField = keyof TelloyaEnquiryInput
export type TelloyaEnquiryFieldErrors = Partial<Record<TelloyaEnquiryField, string>>

export type TelloyaEnquiryValidation =
  | { valid: true; data: TelloyaEnquiryInput }
  | { valid: false; error: string; errors?: TelloyaEnquiryFieldErrors }

export type TelloyaEnquiryResult = {
  ok: boolean
  message: string
  simulated?: boolean
  persisted?: boolean
  enquiryRef?: string
  receiptEmailSent?: boolean
  receiptEmailStatus?: "sent" | "unavailable"
}

const PROCESS_ERROR = "Unable to process this enquiry."
const STRING_FIELDS = [
  "fullName",
  "email",
  "businessName",
  "country",
  "trade",
  "locations",
  "websiteUrl",
  "phone",
  "product",
  "missedCallProblem",
  "phoneSetup",
  "contactPreference",
  "source",
] as const
const PHONE_PATTERN = /^[+]?[\d\s().-]{7,}$/
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

export function normalizeTelloyaText(value: string) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim()
}

export function isTelloyaProduct(value: string): value is TelloyaProduct {
  return (TELLOYA_PRODUCTS as readonly string[]).includes(value)
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

function firstError(errors: TelloyaEnquiryFieldErrors, fallback: string) {
  return Object.values(errors)[0] ?? fallback
}

export function validateTelloyaEnquiry(raw: unknown): TelloyaEnquiryValidation {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: PROCESS_ERROR }
  }

  const input = raw as Record<string, unknown>

  // Validate string fields
  for (const key of STRING_FIELDS) {
    if (key in input && input[key] != null && typeof input[key] !== "string") {
      return { valid: false, error: PROCESS_ERROR }
    }
  }

  // Validate boolean fields
  if ("privacyAccepted" in input && input.privacyAccepted != null && typeof input.privacyAccepted !== "boolean" && typeof input.privacyAccepted !== "string") {
    return { valid: false, error: PROCESS_ERROR }
  }

  // Ensure source is telloya
  const source = normalizeTelloyaText(asString(input.source))
  if (source !== "telloya") {
    return { valid: false, error: PROCESS_ERROR }
  }

  const data: TelloyaEnquiryInput = {
    fullName: normalizeTelloyaText(asString(input.fullName)),
    email: normalizeTelloyaText(asString(input.email)),
    businessName: normalizeTelloyaText(asString(input.businessName)),
    country: normalizeTelloyaText(asString(input.country)),
    trade: normalizeTelloyaText(asString(input.trade)),
    locations: input.locations ? normalizeTelloyaText(asString(input.locations)) : undefined,
    websiteUrl: input.websiteUrl ? normalizeTelloyaText(asString(input.websiteUrl)) : undefined,
    phone: normalizeTelloyaText(asString(input.phone)),
    product: normalizeTelloyaText(asString(input.product)) as TelloyaProduct,
    missedCallProblem: input.missedCallProblem ? normalizeTelloyaText(asString(input.missedCallProblem)) : undefined,
    phoneSetup: input.phoneSetup ? normalizeTelloyaText(asString(input.phoneSetup)) : undefined,
    contactPreference: input.contactPreference ? normalizeTelloyaText(asString(input.contactPreference)) : undefined,
    privacyAccepted: asAccepted(input.privacyAccepted),
    source: "telloya",
  }

  const errors = collectTelloyaEnquiryErrors(data)
  if (Object.keys(errors).length) {
    return { valid: false, error: firstError(errors, "Please check the highlighted fields."), errors }
  }

  return { valid: true, data }
}

export function collectTelloyaEnquiryErrors(data: TelloyaEnquiryInput): TelloyaEnquiryFieldErrors {
  const errors: TelloyaEnquiryFieldErrors = {}

  // Full name validation
  if (!data.fullName) {
    errors.fullName = "Please enter your name."
  } else if (data.fullName.length > telloyaEnquiryLimits.fullName) {
    errors.fullName = `Please keep your name within ${telloyaEnquiryLimits.fullName} characters.`
  }

  // Email validation
  if (!data.email || !EMAIL_PATTERN.test(data.email) || data.email.length > telloyaEnquiryLimits.email) {
    errors.email = "Please enter a valid email address."
  }

  // Business name validation
  if (!data.businessName) {
    errors.businessName = "Please enter your business name."
  } else if (data.businessName.length > telloyaEnquiryLimits.businessName) {
    errors.businessName = `Please keep the business name within ${telloyaEnquiryLimits.businessName} characters.`
  }

  // Country validation
  const countryCode = canonicalBusinessCountry(data.country)
  if (!countryCode) {
    errors.country = "Please choose the country where your business is located."
  } else {
    data.country = countryCode
  }

  // Trade validation
  if (!data.trade) {
    errors.trade = "Please tell us what your business does."
  } else if (data.trade.length > telloyaEnquiryLimits.trade) {
    errors.trade = `Please keep the trade within ${telloyaEnquiryLimits.trade} characters.`
  }

  // Locations validation (optional)
  if (data.locations && data.locations.length > telloyaEnquiryLimits.locations) {
    errors.locations = `Please keep locations within ${telloyaEnquiryLimits.locations} characters.`
  }

  // Website URL validation (optional)
  if (data.websiteUrl) {
    if (data.websiteUrl.length > telloyaEnquiryLimits.websiteUrl || !isHttpUrl(data.websiteUrl)) {
      errors.websiteUrl = "Please enter a valid website URL, or leave this field blank."
    }
  }

  // Phone validation (required for Telloya)
  if (!data.phone) {
    errors.phone = "Please enter your phone number."
  } else if (data.phone.length > telloyaEnquiryLimits.phone || !PHONE_PATTERN.test(data.phone)) {
    errors.phone = "Please enter a valid phone number."
  }

  // Product validation
  if (!data.product || !isTelloyaProduct(data.product)) {
    errors.product = "Please select a product."
  }

  // Missed call problem (optional)
  if (data.missedCallProblem && data.missedCallProblem.length > telloyaEnquiryLimits.missedCallProblem) {
    errors.missedCallProblem = `Please keep your answer within ${telloyaEnquiryLimits.missedCallProblem} characters.`
  }

  // Phone setup (optional)
  if (data.phoneSetup && data.phoneSetup.length > telloyaEnquiryLimits.phoneSetup) {
    errors.phoneSetup = `Please keep your answer within ${telloyaEnquiryLimits.phoneSetup} characters.`
  }

  // Contact preference (optional)
  if (data.contactPreference && data.contactPreference.length > telloyaEnquiryLimits.contactPreference) {
    errors.contactPreference = `Please keep your preference within ${telloyaEnquiryLimits.contactPreference} characters.`
  }

  // Privacy acceptance
  if (!data.privacyAccepted) {
    errors.privacyAccepted = "Please confirm that you have read the privacy notice."
  }

  return errors
}

/**
 * Convert Telloya enquiry to database payload format
 * This is what gets stored in the enquiries.payload JSONB column
 */
export function telloyaEnquiryToPayload(data: TelloyaEnquiryInput) {
  // Combine missedCallProblem, phoneSetup, and contactPreference into a structured details field
  const detailsParts: string[] = []
  
  if (data.missedCallProblem) {
    detailsParts.push(`Missed call requirements:\n${data.missedCallProblem}`)
  }
  
  if (data.phoneSetup) {
    detailsParts.push(`Phone setup:\n${data.phoneSetup}`)
  }
  
  if (data.contactPreference) {
    detailsParts.push(`Contact preference:\n${data.contactPreference}`)
  }
  
  const details = detailsParts.join("\n\n") || "No additional details provided."

  return {
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    businessName: data.businessName,
    country: data.country,
    trade: data.trade,
    locations: data.locations || "",
    websiteUrl: data.websiteUrl || "",
    product: data.product,
    missedCallProblem: data.missedCallProblem || "",
    phoneSetup: data.phoneSetup || "",
    contactPreference: data.contactPreference || "",
    details,
    privacyAccepted: data.privacyAccepted,
    source: "telloya",
  }
}
