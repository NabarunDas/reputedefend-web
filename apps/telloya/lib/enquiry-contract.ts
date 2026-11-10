/**
 * Shared Telloya enquiry request/response contract
 * Used by both frontend form and backend API
 */

export type TelloyaPlanTier = "basic" | "growth" | "pro" | "custom" | ""

export type VoicePreference = "female" | "male" | "no-preference" | ""
export type SpeakingStyle = "friendly" | "professional" | "calm" | "no-preference" | ""

export type TelloyaEnquiryRequest = {
  // Product selection (legacy compatibility - required for old submissions)
  product: "telloya" | "complete" | ""
  
  // Plan tier selection (optional for backward compatibility with legacy product-only requests)
  planTier?: TelloyaPlanTier
  
  // Relaunch Guard add-on (optional - defaults to false if not provided)
  guardInterested?: boolean
  guardLocationCount?: number
  
  // Custom plan requirements (when planTier === "custom")
  customMonthlyMinutes?: number
  customMonthlyCalls?: number
  customPhoneNumbers?: number
  customLocations?: number
  customLanguages?: string
  customRequirements?: string
  
  // Voice and language preferences (all tiers)
  voicePreference?: VoicePreference
  voiceAccent?: string
  primaryLanguage?: string
  speakingStyle?: SpeakingStyle
  additionalLanguages?: string
  
  // Overage interest
  overageInterested?: boolean
  overageMonthlyCapGbp?: number
  
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
  
  // Additional context
  missedCallProblem?: string
  phoneSetup?: string
  contactPreference?: string
  receptionistQuestions?: string
  
  // Consent
  privacyAccepted: boolean
  
  // Technical
  source: "telloya"
  submissionKey: string
}

export type TelloyaEnquiryResponse = {
  ok: boolean
  message?: string
  enquiryRef?: string
  receiptEmailSent?: boolean
  receiptEmailStatus?: "sent" | "suppressed" | "unavailable"
  /**
   * True only after a newly persisted enquiry with a valid TY reference.
   * Analytics may use this flag. It is not billing authorisation.
   */
  leadConversion?: boolean
  errors?: Record<string, string>
  code?: string
}

export type TelloyaEnquiryFieldErrors = {
  product?: string
  planTier?: string
  guardLocationCount?: string
  customMonthlyMinutes?: string
  customPhoneNumbers?: string
  customLocations?: string
  overageMonthlyCapGbp?: string
  businessName?: string
  country?: string
  trade?: string
  email?: string
  phone?: string
  fullName?: string
  privacyAccepted?: string
}

export interface TelloyaEnquiryCapabilities {
  submissionEnabled: boolean
}

/**
 * Check if online enquiry submission is enabled.
 * Returns false during prelaunch to prevent form submission.
 * 
 * Server-side only - do not call from client components.
 * 
 * @param env - Environment object, defaults to process.env
 */
export function getEnquiryCapabilities(env: Record<string, string | undefined> = process.env): TelloyaEnquiryCapabilities {
  // OFF by default until database persistence is deployed
  const enabled = env.TELLOYA_ENQUIRY_ENABLED?.trim() === "true"
  return { submissionEnabled: enabled }
}
