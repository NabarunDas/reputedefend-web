/**
 * Telloya enquiry types and validation
 * Shared between main app (persistence) and Telloya app (form)
 */

import { canonicalBusinessCountry } from "@shared/countries"

export const TELLOYA_PRODUCTS = ["telloya", "complete", ""] as const
export type TelloyaProduct = (typeof TELLOYA_PRODUCTS)[number]

export const TELLOYA_PLAN_TIERS = ["basic", "growth", "pro", "custom", ""] as const
export type TelloyaPlanTier = (typeof TELLOYA_PLAN_TIERS)[number]

export const VOICE_PREFERENCES = ["female", "male", "no-preference", ""] as const
export type VoicePreference = (typeof VOICE_PREFERENCES)[number]

export const SPEAKING_STYLES = ["friendly", "professional", "calm", "no-preference", ""] as const
export type SpeakingStyle = (typeof SPEAKING_STYLES)[number]

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
  planTier: 64,
  customLanguages: 500,
  customRequirements: 2000,
  voiceAccent: 100,
  primaryLanguage: 100,
  additionalLanguages: 500,
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

  // Product interest (legacy compatibility)
  product: TelloyaProduct
  
  // Plan tier selection (required unless legacy product is provided)
  planTier?: TelloyaPlanTier
  
  // Relaunch Guard add-on
  guardInterested?: boolean
  guardLocationCount?: number
  
  // Custom plan requirements
  customMonthlyMinutes?: number
  customMonthlyCalls?: number
  customPhoneNumbers?: number
  customLocations?: number
  customLanguages?: string
  customRequirements?: string
  
  // Voice and language preferences
  voicePreference?: VoicePreference
  voiceAccent?: string
  primaryLanguage?: string
  speakingStyle?: SpeakingStyle
  additionalLanguages?: string
  
  // Overage interest
  overageInterested?: boolean
  overageMonthlyCapGbp?: number

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
  receiptEmailStatus?: "sent" | "suppressed" | "unavailable"
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
  "planTier",
  "customLanguages",
  "customRequirements",
  "voicePreference",
  "voiceAccent",
  "primaryLanguage",
  "speakingStyle",
  "additionalLanguages",
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
  return value === true
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) return value
  return undefined
}

function asPositiveNumber(value: unknown): number | undefined {
  // Only accept actual numbers, reject strings to avoid silent parsing
  if (typeof value === "number" && value > 0 && Number.isFinite(value)) return value
  return undefined
}

function asPositiveInteger(value: unknown): number | undefined {
  // Only accept actual numbers, reject strings to avoid silent parsing
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  return undefined
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

  // Validate boolean fields - API must receive strict boolean, not string
  if ("privacyAccepted" in input && typeof input.privacyAccepted !== "boolean") {
    return { valid: false, error: PROCESS_ERROR }
  }
  if ("guardInterested" in input && input.guardInterested != null && typeof input.guardInterested !== "boolean") {
    return { valid: false, error: PROCESS_ERROR }
  }
  if ("overageInterested" in input && input.overageInterested != null && typeof input.overageInterested !== "boolean") {
    return { valid: false, error: PROCESS_ERROR }
  }

  // Validate numeric fields - must be actual numbers, not strings
  const numericFields = ["guardLocationCount", "customMonthlyMinutes", "customMonthlyCalls", "customPhoneNumbers", "customLocations", "overageMonthlyCapGbp"] as const
  for (const key of numericFields) {
    if (key in input && input[key] != null && typeof input[key] !== "number") {
      return { valid: false, error: PROCESS_ERROR }
    }
  }

  // Validate enum fields
  if ("planTier" in input && input.planTier != null) {
    const planTier = asString(input.planTier)
    if (planTier && !(TELLOYA_PLAN_TIERS as readonly string[]).includes(planTier)) {
      return { valid: false, error: PROCESS_ERROR }
    }
  }
  if ("voicePreference" in input && input.voicePreference != null) {
    const voicePreference = asString(input.voicePreference)
    if (voicePreference && !(VOICE_PREFERENCES as readonly string[]).includes(voicePreference)) {
      return { valid: false, error: PROCESS_ERROR }
    }
  }
  if ("speakingStyle" in input && input.speakingStyle != null) {
    const speakingStyle = asString(input.speakingStyle)
    if (speakingStyle && !(SPEAKING_STYLES as readonly string[]).includes(speakingStyle)) {
      return { valid: false, error: PROCESS_ERROR }
    }
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
    planTier: input.planTier ? (normalizeTelloyaText(asString(input.planTier)) as TelloyaPlanTier) : undefined,
    guardInterested: asBoolean(input.guardInterested),
    guardLocationCount: asPositiveInteger(input.guardLocationCount),
    customMonthlyMinutes: asPositiveInteger(input.customMonthlyMinutes),
    customMonthlyCalls: asPositiveInteger(input.customMonthlyCalls),
    customPhoneNumbers: asPositiveInteger(input.customPhoneNumbers),
    customLocations: asPositiveInteger(input.customLocations),
    customLanguages: input.customLanguages ? normalizeTelloyaText(asString(input.customLanguages)) : undefined,
    customRequirements: input.customRequirements ? normalizeTelloyaText(asString(input.customRequirements)) : undefined,
    voicePreference: input.voicePreference ? normalizeTelloyaText(asString(input.voicePreference)) as VoicePreference : undefined,
    voiceAccent: input.voiceAccent ? normalizeTelloyaText(asString(input.voiceAccent)) : undefined,
    primaryLanguage: input.primaryLanguage ? normalizeTelloyaText(asString(input.primaryLanguage)) : undefined,
    speakingStyle: input.speakingStyle ? normalizeTelloyaText(asString(input.speakingStyle)) as SpeakingStyle : undefined,
    additionalLanguages: input.additionalLanguages ? normalizeTelloyaText(asString(input.additionalLanguages)) : undefined,
    overageInterested: asBoolean(input.overageInterested),
    overageMonthlyCapGbp: asPositiveNumber(input.overageMonthlyCapGbp),
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

  // Product validation (legacy - required unless planTier is set)
  if (!data.planTier && (!data.product || !isTelloyaProduct(data.product))) {
    errors.product = "Please select a product."
  }

  // Plan tier validation (required unless legacy product is set)
  if (!data.product && !data.planTier) {
    errors.planTier = "Please select a plan."
  } else if (data.planTier && !(TELLOYA_PLAN_TIERS as readonly string[]).includes(data.planTier)) {
    errors.planTier = "Please select a valid plan."
  }

  // Guard add-on validation
  if (data.guardInterested === true) {
    if (!data.guardLocationCount || data.guardLocationCount < 1) {
      errors.guardLocationCount = "Please specify how many locations need Guard protection."
    }
  }

  // Custom plan validation - all required if planTier is custom
  if (data.planTier === "custom") {
    if (!data.customMonthlyMinutes || data.customMonthlyMinutes < 1) {
      errors.customMonthlyMinutes = "Please specify the monthly minutes you need."
    }
    if (!data.customMonthlyCalls || data.customMonthlyCalls < 1) {
      errors.customMonthlyCalls = "Please specify the monthly calls you expect."
    }
    if (!data.customPhoneNumbers || data.customPhoneNumbers < 1) {
      errors.customPhoneNumbers = "Please specify how many phone numbers you need."
    }
    if (!data.customLocations || data.customLocations < 1) {
      errors.customLocations = "Please specify how many locations you operate."
    }
  }

  // Custom languages validation (optional, character limit)
  if (data.customLanguages && data.customLanguages.length > telloyaEnquiryLimits.customLanguages) {
    errors.customLanguages = `Please keep languages within ${telloyaEnquiryLimits.customLanguages} characters.`
  }

  // Custom requirements validation (optional, character limit)
  if (data.customRequirements && data.customRequirements.length > telloyaEnquiryLimits.customRequirements) {
    errors.customRequirements = `Please keep requirements within ${telloyaEnquiryLimits.customRequirements} characters.`
  }

  // Voice preferences validation (all optional, check limits)
  if (data.voicePreference && !(VOICE_PREFERENCES as readonly string[]).includes(data.voicePreference)) {
    errors.voicePreference = "Please select a valid voice preference."
  }
  
  if (data.voiceAccent && data.voiceAccent.length > telloyaEnquiryLimits.voiceAccent) {
    errors.voiceAccent = `Please keep voice accent within ${telloyaEnquiryLimits.voiceAccent} characters.`
  }

  if (data.primaryLanguage && data.primaryLanguage.length > telloyaEnquiryLimits.primaryLanguage) {
    errors.primaryLanguage = `Please keep primary language within ${telloyaEnquiryLimits.primaryLanguage} characters.`
  }

  if (data.speakingStyle && !(SPEAKING_STYLES as readonly string[]).includes(data.speakingStyle)) {
    errors.speakingStyle = "Please select a valid speaking style."
  }

  if (data.additionalLanguages && data.additionalLanguages.length > telloyaEnquiryLimits.additionalLanguages) {
    errors.additionalLanguages = `Please keep additional languages within ${telloyaEnquiryLimits.additionalLanguages} characters.`
  }

  // Overage validation
  if (data.overageInterested === true && data.overageMonthlyCapGbp) {
    if (data.overageMonthlyCapGbp < 1) {
      errors.overageMonthlyCapGbp = "Monthly cap must be at least £1."
    }
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
  // Combine all requirements and preferences into a structured details field
  const detailsParts: string[] = []
  
  if (data.planTier) {
    detailsParts.push(`Plan tier: ${data.planTier}`)
  }
  
  if (data.guardInterested) {
    detailsParts.push(`Guard interested: Yes (${data.guardLocationCount || 0} locations)`)
  }
  
  if (data.planTier === "custom") {
    const customParts: string[] = []
    if (data.customMonthlyMinutes) customParts.push(`Minutes: ${data.customMonthlyMinutes}/month`)
    if (data.customMonthlyCalls) customParts.push(`Calls: ${data.customMonthlyCalls}/month`)
    if (data.customPhoneNumbers) customParts.push(`Phone numbers: ${data.customPhoneNumbers}`)
    if (data.customLocations) customParts.push(`Locations: ${data.customLocations}`)
    if (data.customLanguages) customParts.push(`Languages: ${data.customLanguages}`)
    if (customParts.length) {
      detailsParts.push(`Custom requirements:\n${customParts.join("\n")}`)
    }
    if (data.customRequirements) {
      detailsParts.push(`Additional requirements:\n${data.customRequirements}`)
    }
  }
  
  if (data.voicePreference || data.voiceAccent || data.primaryLanguage || data.speakingStyle || data.additionalLanguages) {
    const voiceParts: string[] = []
    if (data.voicePreference) voiceParts.push(`Voice: ${data.voicePreference}`)
    if (data.voiceAccent) voiceParts.push(`Accent: ${data.voiceAccent}`)
    if (data.primaryLanguage) voiceParts.push(`Primary language: ${data.primaryLanguage}`)
    if (data.speakingStyle) voiceParts.push(`Speaking style: ${data.speakingStyle}`)
    if (data.additionalLanguages) voiceParts.push(`Additional languages: ${data.additionalLanguages}`)
    detailsParts.push(`Voice preferences:\n${voiceParts.join("\n")}`)
  }
  
  if (data.overageInterested) {
    const overageCap = data.overageMonthlyCapGbp ? ` (cap: £${data.overageMonthlyCapGbp}/month)` : ""
    detailsParts.push(`Overage interested: Yes${overageCap}`)
  }
  
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
    planTier: data.planTier || "",
    guardInterested: data.guardInterested || false,
    guardLocationCount: data.guardLocationCount || 0,
    customMonthlyMinutes: data.customMonthlyMinutes || 0,
    customMonthlyCalls: data.customMonthlyCalls || 0,
    customPhoneNumbers: data.customPhoneNumbers || 0,
    customLocations: data.customLocations || 0,
    customLanguages: data.customLanguages || "",
    customRequirements: data.customRequirements || "",
    voicePreference: data.voicePreference || "",
    voiceAccent: data.voiceAccent || "",
    primaryLanguage: data.primaryLanguage || "",
    speakingStyle: data.speakingStyle || "",
    additionalLanguages: data.additionalLanguages || "",
    overageInterested: data.overageInterested || false,
    overageMonthlyCapGbp: data.overageMonthlyCapGbp || 0,
    missedCallProblem: data.missedCallProblem || "",
    phoneSetup: data.phoneSetup || "",
    contactPreference: data.contactPreference || "",
    details,
    privacyAccepted: data.privacyAccepted,
    source: "telloya",
  }
}
