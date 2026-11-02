/**
 * Telloya enquiry email delivery
 * Integrates Telloya templates with existing email infrastructure
 */

import "server-only"
import type { EnquiryEmailConfig } from "@/lib/enquiry-config"
import type { EnquiryProvider } from "@/lib/enquiry-provider"
import {
  telloyaCustomerAcknowledgementSubject,
  telloyaCustomerAcknowledgementText,
  telloyaCustomerAcknowledgementHtml,
  telloyaInternalNotificationSubject,
  telloyaInternalNotificationText,
  telloyaInternalNotificationHtml,
} from "@/lib/telloya-enquiry-email"

interface TelloyaEnquiryData {
  fullName: string
  email: string
  phone: string
  businessName: string
  country: string
  trade: string
  locations?: string
  websiteUrl?: string
  product: string
  missedCallProblem?: string
  phoneSetup?: string
  contactPreference?: string
}

export function buildTelloyaInternalMessage(
  data: TelloyaEnquiryData,
  ref: string,
  config: EnquiryEmailConfig,
  submittedAt: Date
): Parameters<EnquiryProvider["send"]>[0] {
  return {
    from: config.fromEmail,
    to: config.toEmail,
    replyTo: config.replyToEmail,
    subject: telloyaInternalNotificationSubject(data, ref),
    text: telloyaInternalNotificationText(data, ref, submittedAt),
    html: telloyaInternalNotificationHtml(data, ref, submittedAt),
  }
}

export function buildTelloyaCustomerAcknowledgement(
  data: TelloyaEnquiryData,
  ref: string,
  config: EnquiryEmailConfig
): Parameters<EnquiryProvider["send"]>[0] {
  return {
    from: config.fromEmail,
    to: data.email,
    replyTo: config.replyToEmail,
    subject: telloyaCustomerAcknowledgementSubject(ref),
    text: telloyaCustomerAcknowledgementText(ref),
    html: telloyaCustomerAcknowledgementHtml(ref),
  }
}
