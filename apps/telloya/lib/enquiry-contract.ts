/**
 * Shared Telloya enquiry request/response contract
 * Used by both frontend form and backend API
 */

export type TelloyaEnquiryRequest = {
  // Product selection
  product: "telloya" | "complete" | ""
  
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
  errors?: Record<string, string>
  code?: string
}

export type TelloyaEnquiryFieldErrors = {
  product?: string
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
