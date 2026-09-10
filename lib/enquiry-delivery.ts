import {
  formattedFromAddress,
  readEnquiryEmailConfig,
  runtimeAllowsSimulation,
  runtimeMayUseLiveProvider,
  type EnquiryEmailConfig,
} from "@/lib/enquiry-config"
import {
  customerAcknowledgementHtml,
  customerAcknowledgementSubject,
  customerAcknowledgementText,
  enquiryEmailHtml,
  enquiryEmailSubject,
  enquiryEmailText,
} from "@/lib/enquiry-email"
import type { EnquiryInput, EnquiryResult } from "@/lib/enquiry"
import type { EnquiryEmailMessage, EnquiryProvider } from "@/lib/enquiry-provider"
import { createResendEnquiryProvider } from "@/lib/providers/resend-enquiry-provider"

export const ENQUIRY_UNAVAILABLE = "Enquiries are temporarily unavailable. Please try again shortly."
export const ENQUIRY_SIMULATED_MESSAGE = "Development enquiry recorded. In production, this will only confirm after delivery."

export type DeliverEnquiryOptions = {
  provider?: EnquiryProvider
  config?: EnquiryEmailConfig
  now?: Date
  nodeEnv?: string
}

function replyToAddresses(customerEmail: string, extraReplyTo?: string) {
  if (extraReplyTo && extraReplyTo.toLowerCase() !== customerEmail.toLowerCase()) {
    return [customerEmail, extraReplyTo]
  }
  return customerEmail
}

export function buildInternalEnquiryMessage(
  data: EnquiryInput,
  config: Pick<EnquiryEmailConfig, "fromEmail" | "toEmail" | "extraReplyTo">,
  submittedAt: Date,
): EnquiryEmailMessage {
  return {
    kind: "internal",
    from: formattedFromAddress(config.fromEmail),
    to: config.toEmail,
    replyTo: replyToAddresses(data.email, config.extraReplyTo),
    subject: enquiryEmailSubject(data),
    text: enquiryEmailText(data, submittedAt),
    html: enquiryEmailHtml(data, submittedAt),
  }
}

export function buildCustomerAcknowledgementMessage(
  data: EnquiryInput,
  config: Pick<EnquiryEmailConfig, "fromEmail">,
): EnquiryEmailMessage {
  return {
    kind: "customer-ack",
    from: formattedFromAddress(config.fromEmail),
    to: data.email,
    replyTo: config.fromEmail,
    subject: customerAcknowledgementSubject(),
    text: customerAcknowledgementText(),
    html: customerAcknowledgementHtml(),
  }
}

function liveProvider(config: EnquiryEmailConfig, nodeEnv: string | undefined, injected?: EnquiryProvider) {
  if (injected) return injected
  if (!runtimeMayUseLiveProvider(nodeEnv) || !config.ready) return undefined
  return createResendEnquiryProvider(config.apiKey)
}

export async function deliverEnquiry(
  data: EnquiryInput,
  options: DeliverEnquiryOptions = {},
): Promise<EnquiryResult> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  const config = options.config ?? readEnquiryEmailConfig()
  const provider = liveProvider(config, nodeEnv, options.provider)
  const submittedAt = options.now ?? new Date()

  if (!provider || !config.ready) {
    if (runtimeAllowsSimulation(nodeEnv)) {
      return { ok: true, simulated: true, message: ENQUIRY_SIMULATED_MESSAGE }
    }
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  const internal = buildInternalEnquiryMessage(data, config, submittedAt)

  try {
    const result = await provider.send(internal)
    if (!result.ok) {
      console.error("[enquiry] internal delivery failed", { source: data.source, reason: result.reason })
      return { ok: false, message: ENQUIRY_UNAVAILABLE }
    }
  } catch {
    console.error("[enquiry] internal delivery threw", { source: data.source })
    return { ok: false, message: ENQUIRY_UNAVAILABLE }
  }

  if (config.sendCustomerAck) {
    try {
      const ack = await provider.send(buildCustomerAcknowledgementMessage(data, config))
      if (!ack.ok) {
        console.error("[enquiry] customer acknowledgement was not sent", { source: data.source })
      }
    } catch {
      console.error("[enquiry] customer acknowledgement threw", { source: data.source })
    }
  }

  return { ok: true, message: "Your enquiry has been received." }
}
