const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

export type EnquiryEmailConfig = {
  apiKey: string
  fromEmail: string
  toEmail: string
  extraReplyTo?: string
  sendCustomerAck: boolean
  ready: boolean
}

export function readEnquiryEmailConfig(
  env: Record<string, string | undefined> = process.env,
): EnquiryEmailConfig {
  const apiKey = trimEnv(env.RESEND_API_KEY)
  const fromEmail = trimEnv(env.ENQUIRY_FROM_EMAIL)
  const toEmail = trimEnv(env.ENQUIRY_TO_EMAIL)
  const extraReplyTo = trimEnv(env.ENQUIRY_REPLY_TO_EMAIL)
  const sendCustomerAck = env.ENQUIRY_SEND_CUSTOMER_ACK === "true"

  const ready = Boolean(
    apiKey
    && EMAIL_PATTERN.test(fromEmail)
    && EMAIL_PATTERN.test(toEmail)
    && fromEmail.length <= 254
    && toEmail.length <= 254,
  )

  return {
    apiKey,
    fromEmail,
    toEmail,
    extraReplyTo: extraReplyTo && EMAIL_PATTERN.test(extraReplyTo) ? extraReplyTo : undefined,
    sendCustomerAck,
    ready,
  }
}

export function formattedFromAddress(fromEmail: string) {
  if (fromEmail.includes("<")) return fromEmail
  return `ReputeDefend <${fromEmail}>`
}

export function runtimeAllowsSimulation(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv !== "production" && nodeEnv !== "test"
}

export function runtimeMayUseLiveProvider(nodeEnv: string | undefined = process.env.NODE_ENV) {
  return nodeEnv !== "test"
}
