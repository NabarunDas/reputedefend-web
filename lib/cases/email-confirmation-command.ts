import "server-only"
import {
  confirmationAllowlist,
  confirmationCsrfMatches,
  confirmationRuntime,
  emailConfirmationResendContent,
  emailConfirmationStatus,
  emailConfirmationTokenHash,
  isUuid,
  newEmailConfirmationChallengeId,
  planChallengeDelivery,
  presentedConfirmationToken,
} from "@/lib/cases/email-confirmation"
import { formattedFromAddress } from "@/lib/enquiry-config"
import type { EnquiryProvider } from "@/lib/enquiry-provider"
import type { SupabaseServerClient } from "@/lib/supabase/server"

export type ConfirmationView = {
  status: "pending" | "confirmed" | "expired" | "unavailable"
  publicRef: string
  maskedEmail: string
  caseType: string
}

export type ConfirmationOutcome = {
  status: string
  publicRef: string
  maskedEmail: string
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

const hidden: ConfirmationOutcome = { status: "unavailable", publicRef: "", maskedEmail: "" }

export function presentConfirmationRead(value: unknown): ConfirmationView {
  const body = record(value)
  const status = text(body?.status)
  const publicRef = text(body?.publicRef)
  const maskedEmail = text(body?.maskedEmail)
  const caseType = text(body?.caseType)
  if (!publicRef || !maskedEmail) return { status: "unavailable", publicRef: "", maskedEmail: "", caseType: "" }
  if (status === "pending" || status === "confirmed" || status === "expired") {
    return { status, publicRef, maskedEmail, caseType }
  }
  return { status: "unavailable", publicRef, maskedEmail, caseType }
}

export function confirmationCustomerMessage(status: string): string {
  if (status === "confirmed" || status === "already_confirmed" || status === "already_verified") {
    return "Your email address is confirmed. Your assessment is already saved."
  }
  if (status === "expired") {
    return "This confirmation link has expired. You can ask for a new one. Your assessment is already saved."
  }
  if (status === "limited" || status === "cooldown") {
    return "Please wait a little while before trying again. Your assessment is already saved."
  }
  if (status === "sent") {
    return "We have asked our email service to send a new confirmation to the same address. Your assessment is already saved."
  }
  if (status === "withheld" || status === "suppressed") {
    return "A new confirmation email was not sent. Your assessment is already saved. You do not need to submit it again."
  }
  return "This confirmation link cannot be used. Your assessment is already saved. You do not need to submit it again."
}

export async function readEmailConfirmation(
  client: SupabaseServerClient,
  challengeId: string,
): Promise<ConfirmationView> {
  if (!isUuid(challengeId) || !confirmationRuntime()) {
    return { status: "unavailable", publicRef: "", maskedEmail: "", caseType: "" }
  }
  const read = await client.rpc("read_email_confirmation_challenge_v1", { p_challenge: challengeId })
  if (read.error) return { status: "unavailable", publicRef: "", maskedEmail: "", caseType: "" }
  return presentConfirmationRead(read.data)
}

export async function confirmEmailAddress(input: {
  client: SupabaseServerClient
  challengeId: string
  token: string | undefined
  csrfCookie: string | undefined
  csrf: string | undefined
}): Promise<ConfirmationOutcome> {
  const environment = confirmationRuntime()
  const token = presentedConfirmationToken(input.token)
  if (!environment || !isUuid(input.challengeId) || !token) return hidden
  if (!confirmationCsrfMatches(input.csrfCookie, input.csrf)) return { ...hidden, status: "csrf" }
  const confirmed = await input.client.rpc("confirm_email_challenge_v1", {
    p_challenge: input.challengeId,
    p_token_hash: emailConfirmationTokenHash(token),
    p_environment: environment,
  })
  if (confirmed.error) return hidden
  const body = record(confirmed.data)
  return {
    status: emailConfirmationStatus(confirmed.data) ?? "unavailable",
    publicRef: text(body?.publicRef),
    maskedEmail: text(body?.maskedEmail),
  }
}

export async function resendEmailConfirmation(input: {
  client: SupabaseServerClient
  provider: EnquiryProvider | null
  fromEmail: string
  challengeId: string
  token: string | undefined
  csrfCookie: string | undefined
  csrf: string | undefined
}): Promise<ConfirmationOutcome> {
  const environment = confirmationRuntime()
  const token = presentedConfirmationToken(input.token)
  if (!environment || !isUuid(input.challengeId) || !token || !input.provider || !input.fromEmail) return hidden
  if (!confirmationCsrfMatches(input.csrfCookie, input.csrf)) return { ...hidden, status: "csrf" }
  const expected = environment === "preview" ? confirmationAllowlist() : null
  if (environment === "preview" && !expected) return { ...hidden, status: "withheld" }
  const nextId = newEmailConfirmationChallengeId()
  const delivery = planChallengeDelivery(nextId)
  if (!delivery) return hidden
  const prepared = await input.client.rpc("resend_email_confirmation_challenge_v1", {
    p_previous: input.challengeId,
    p_previous_hash: emailConfirmationTokenHash(token),
    p_new: nextId,
    p_new_hash: delivery.tokenHash,
    p_environment: environment,
    p_key_version: delivery.keyVersion,
    p_expected_email: expected,
  })
  if (prepared.error) return hidden
  const body = record(prepared.data)
  const status = emailConfirmationStatus(prepared.data) ?? "unavailable"
  const publicRef = text(body?.publicRef)
  const maskedEmail = text(body?.maskedEmail)
  if (status !== "ready") return { status, publicRef, maskedEmail }
  const email = text(body?.email)
  const content = emailConfirmationResendContent({
    publicRef,
    caseType: text(body?.caseType),
    url: delivery.deliveryUrl,
  })
  if (!email || !content || (expected && email !== expected)) {
    await input.client.rpc("abandon_email_confirmation_resend_v1", { p_new: nextId, p_environment: environment })
    return { ...hidden, status: "withheld", publicRef, maskedEmail }
  }
  let sent = false
  try {
    const result = await input.provider.send({
      kind: "customer-ack",
      from: formattedFromAddress(input.fromEmail),
      to: email,
      replyTo: input.fromEmail,
      subject: content.subject,
      text: content.text,
      html: content.html,
      idempotencyKey: `email-confirmation:${nextId}`,
    })
    sent = result.ok
  } catch {
    sent = false
  }
  if (!sent) {
    await input.client.rpc("abandon_email_confirmation_resend_v1", { p_new: nextId, p_environment: environment })
    return {
      status: "unavailable",
      publicRef,
      maskedEmail,
    }
  }
  return { status: "sent", publicRef, maskedEmail }
}
