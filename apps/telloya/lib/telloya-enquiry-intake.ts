/**
 * Telloya enquiry intake - bridges Telloya types with existing enquiry infrastructure
 * Reuses all persistence, delivery orchestration, and status tracking from lib/enquiries/intake.ts
 */

import "server-only"
import { persistGeneralEnquiry, type CustomEmailBuilder, type GeneralIntakeOptions } from "@shared/enquiries/intake"
import { formattedFromAddress, type EnquiryEmailConfig } from "@shared/enquiry-config"
import type { EnquiryEmailMessage } from "@shared/enquiry-provider"
import { 
  type TelloyaEnquiryInput, 
  type TelloyaEnquiryResult,
  telloyaEnquiryToPayload 
} from "@/lib/telloya-enquiry"
import {
  telloyaCustomerAcknowledgementSubject,
  telloyaCustomerAcknowledgementText,
  telloyaCustomerAcknowledgementHtml,
  telloyaInternalNotificationSubject,
  telloyaInternalNotificationText,
  telloyaInternalNotificationHtml,
} from "@/lib/telloya-enquiry-email"
import type { EnquiryInput } from "@shared/enquiry"

// Type for the Telloya payload that includes extra fields beyond EnquiryInput
type TelloyaPayload = EnquiryInput & {
  trade: string
  locations: string
  product: string
  missedCallProblem: string
  phoneSetup: string
  contactPreference: string
  // Phase 05A-02 fields
  planTier?: string
  guardInterested: boolean
  guardLocationCount?: number
  customMonthlyMinutes?: number
  customMonthlyCalls?: number
  customPhoneNumbers?: number
  customLocations?: number
  customLanguages?: string
  customRequirements?: string
  voicePreference?: string
  voiceAccent?: string
  primaryLanguage?: string
  speakingStyle?: string
  additionalLanguages?: string
  overageInterested: boolean
  overageMonthlyCapGbp?: number
  receptionistQuestions?: string
  requestIntent?: "personalised-demo"
}

// Telloya-specific email builders that integrate with the shared infrastructure
const telloyaEmailBuilder: CustomEmailBuilder = {
  buildInternal: (data: EnquiryInput, config: EnquiryEmailConfig, submittedAt: Date, ref?: string): EnquiryEmailMessage => {
    if (!ref) throw new Error("Telloya enquiry must have a reference")
    
    // Cast to TelloyaPayload since we know this came from telloyaEnquiryToPayload()
    const payload = data as unknown as TelloyaPayload
    
    // Extract Telloya data for the email template (all fields including Phase 05A-02)
    const telloyaData = {
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      businessName: payload.businessName,
      country: payload.country,
      trade: payload.trade,
      locations: payload.locations,
      websiteUrl: payload.websiteUrl,
      product: payload.product,
      missedCallProblem: payload.missedCallProblem,
      phoneSetup: payload.phoneSetup,
      contactPreference: payload.contactPreference,
      // Phase 05A-02 fields
      planTier: payload.planTier,
      guardInterested: payload.guardInterested,
      guardLocationCount: payload.guardLocationCount,
      customMonthlyMinutes: payload.customMonthlyMinutes,
      customMonthlyCalls: payload.customMonthlyCalls,
      customPhoneNumbers: payload.customPhoneNumbers,
      customLocations: payload.customLocations,
      customLanguages: payload.customLanguages,
      customRequirements: payload.customRequirements,
      voicePreference: payload.voicePreference,
      voiceAccent: payload.voiceAccent,
      primaryLanguage: payload.primaryLanguage,
      speakingStyle: payload.speakingStyle,
      additionalLanguages: payload.additionalLanguages,
      overageInterested: payload.overageInterested,
      overageMonthlyCapGbp: payload.overageMonthlyCapGbp,
      receptionistQuestions: payload.receptionistQuestions,
      requestIntent: payload.requestIntent,
    }

    return {
      kind: "internal",
      from: formattedFromAddress(config.fromEmail),
      to: config.toEmail,
      replyTo: [data.email, config.extraReplyTo].filter(Boolean) as string[],
      subject: telloyaInternalNotificationSubject(telloyaData, ref),
      text: telloyaInternalNotificationText(telloyaData, ref, submittedAt),
      html: telloyaInternalNotificationHtml(telloyaData, ref, submittedAt),
    }
  },
  
  buildCustomerAck: (data: EnquiryInput, config: EnquiryEmailConfig, ref?: string): EnquiryEmailMessage => {
    if (!ref) throw new Error("Telloya enquiry must have a reference")
    const requestIntent = (data as unknown as TelloyaPayload).requestIntent
    
    return {
      kind: "customer-ack",
      from: formattedFromAddress(config.fromEmail),
      to: data.email,
      replyTo: config.fromEmail,
      subject: telloyaCustomerAcknowledgementSubject(ref),
      text: telloyaCustomerAcknowledgementText(ref, requestIntent),
      html: telloyaCustomerAcknowledgementHtml(ref, requestIntent),
    }
  },
}

/**
 * Persist a Telloya enquiry using the existing general enquiry infrastructure
 * 
 * This function:
 * 1. Converts Telloya-specific fields to the database payload format
 * 2. Persists to the enquiries table with TY reference generation
 * 3. Sends Telloya-branded emails using shared delivery infrastructure
 * 4. Returns the TY reference to display to the customer
 * 
 * All orchestration (provider, status tracking, idempotency) is shared with ProfileRelaunch.
 * Only the email content is brand-specific.
 * 
 * @param data Validated Telloya enquiry input
 * @param key Submission key for idempotency (must be a valid UUID)
 * @returns Result with TY reference
 */
export async function persistTelloyaEnquiry(
  data: TelloyaEnquiryInput,
  key: string,
  overrides: Pick<GeneralIntakeOptions, "create" | "finish" | "provider" | "config" | "nodeEnv"> = {},
): Promise<TelloyaEnquiryResult> {
  // Convert Telloya fields to database payload format
  const payload = telloyaEnquiryToPayload(data)

  let newlyCreated = false

  // Use existing enquiry persistence infrastructure with Telloya-specific settings
  const result = await persistGeneralEnquiry(payload as unknown as EnquiryInput, key, {
    ...overrides,
    customEmailBuilder: telloyaEmailBuilder,
    // Enable customer acknowledgement for Telloya (source-specific policy)
    sendCustomerAck: true,
    onReceipt(receipt) {
      newlyCreated = receipt.status === "created"
    },
  })

  const reference = result.enquiryRef
  const validReference = typeof reference === "string" && /^TY-\d\d-[A-HJ-NP-Z2-9]{6}$/.test(reference)
  const leadConversion = Boolean(
    result.ok
    && result.persisted
    && !result.simulated
    && newlyCreated
    && validReference,
  )

  // Return result in Telloya format. leadConversion never carries the reference.
  return {
    ok: result.ok,
    message: result.message,
    simulated: result.simulated,
    persisted: result.persisted,
    enquiryRef: result.enquiryRef,
    receiptEmailSent: result.receiptEmailSent,
    receiptEmailStatus: result.receiptEmailStatus,
    leadConversion,
  }
}
