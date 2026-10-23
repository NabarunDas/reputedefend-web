import "server-only"
import {
  emailConfirmationAllowed,
  confirmationRuntime,
  emailConfirmationResendContent,
  emailConfirmationStatus,
  newEmailConfirmationChallengeId,
  planChallengeDelivery,
} from "../../../../lib/cases/email-confirmation"
import type { OutgoingMailProvider } from "../communications/mail"

export const STAFF_RESEND_NOT_SENT = "Nothing was sent, and the address was not marked verified."
export const STAFF_SEND_SENT = "The provider accepted a confirmation email. The address was not marked verified."
export const STAFF_RESEND_SENT = "The provider accepted a separate recovery email. The address was not marked verified."
export const STAFF_RESEND_VERIFIED = "This address is already verified. Nothing was sent."
export const STAFF_RECORD_FAILED = "The provider accepted the email, but the confirmation record was not saved. The address was not marked verified."

type Database = {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/**
 * Exceptional staff recovery. It never records contact verification, and it
 * sends only when this lane and the provider are actually open.
 */
export async function runStaffEmailResend(input: {
  database: Database
  tokenHash: string
  caseId: string
  provider: OutgoingMailProvider | null
  fromEmail: string | null
}): Promise<{ message: string; sent: boolean }> {
  const environment = confirmationRuntime()
  if (!environment || !input.provider || !input.fromEmail) return { message: STAFF_RESEND_NOT_SENT, sent: false }

  const status = await input.database.rpc<{
    state?: string
    recovery?: string
    nextGeneration?: number
  } | null>("admin_email_confirmation_status_v1", {
    p_token: input.tokenHash,
    p_case: input.caseId,
  })
  const generation = status?.nextGeneration
  if (!status || status.state === "verified" || status.recovery === "unavailable" || typeof generation !== "number" || generation < 1 || generation > 8) {
    return { message: status?.state === "verified" ? STAFF_RESEND_VERIFIED : STAFF_RESEND_NOT_SENT, sent: false }
  }
  const recovery = status.recovery === "send" || status.recovery === "resend"
    ? status.recovery
    : generation === 1 ? "send" : "resend"

  const challengeId = newEmailConfirmationChallengeId()
  const delivery = planChallengeDelivery(challengeId)
  if (!delivery) return { message: STAFF_RESEND_NOT_SENT, sent: false }
  const prepared = await input.database.rpc<Record<string, unknown> | null>("admin_prepare_email_confirmation_resend_v1", {
    p_token: input.tokenHash,
    p_case: input.caseId,
    p_challenge: challengeId,
    p_token_hash: delivery.tokenHash,
    p_environment: environment,
    p_key_version: delivery.keyVersion,
    p_generation: generation,
  })
  const preparedStatus = emailConfirmationStatus(prepared)
  const publicRef = text(prepared?.publicRef)
  if (preparedStatus !== "ready") {
    return {
      message: preparedStatus === "already_verified" ? STAFF_RESEND_VERIFIED : STAFF_RESEND_NOT_SENT,
      sent: false,
    }
  }
  const email = text(prepared?.email)
  const content = emailConfirmationResendContent({
    publicRef,
    caseType: text(prepared?.caseType),
    url: delivery.deliveryUrl,
  })
  if (!email || !emailConfirmationAllowed(email) || !content) {
    await input.database.rpc("abandon_email_confirmation_resend_v1", { p_new: challengeId, p_environment: environment })
    return { message: STAFF_RESEND_NOT_SENT, sent: false }
  }
  let sent = false
  try {
    const result = await input.provider.send({
      idempotencyKey: `email-confirmation:${challengeId}`,
      from: input.fromEmail,
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    })
    sent = result.ok
  } catch {
    sent = false
  }
  if (!sent) {
    await input.database.rpc("abandon_email_confirmation_resend_v1", { p_new: challengeId, p_environment: environment })
    return { message: STAFF_RESEND_NOT_SENT, sent: false }
  }
  const recorded = await input.database.rpc<{ status?: string } | null>("record_email_confirmation_delivery_v1", {
    p_challenge: challengeId,
    p_environment: environment,
    p_outcome: "accepted",
  })
  if (recorded?.status !== "accepted") return { message: STAFF_RECORD_FAILED, sent: false }
  return { message: recovery === "send" ? STAFF_SEND_SENT : STAFF_RESEND_SENT, sent: true }
}
