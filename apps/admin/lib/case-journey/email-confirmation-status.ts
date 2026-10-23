import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"

export type EmailConfirmationJourneyStatus = {
  state: "pending" | "verified" | "none"
  provenance: "initial_receipt" | "recovery" | "none"
  recovery: "send" | "resend" | "unavailable"
  label: string
  nextGeneration: number
}

function knownStatus(value: EmailConfirmationJourneyStatus | null): value is EmailConfirmationJourneyStatus {
  if (!value) return false
  if (value.state !== "pending" && value.state !== "verified" && value.state !== "none") return false
  if (value.provenance !== "initial_receipt" && value.provenance !== "recovery" && value.provenance !== "none") return false
  if (value.recovery !== "send" && value.recovery !== "resend" && value.recovery !== "unavailable") return false
  if (value.state === "pending" && value.provenance === "none") return false
  if (value.state === "pending" && value.recovery === "send") return false
  if (typeof value.label !== "string" || typeof value.nextGeneration !== "number") return false
  return true
}

/** Staff read of confirmation delivery. A failure leaves the journey unverified. */
export async function loadEmailConfirmationStatus(caseId: string): Promise<EmailConfirmationJourneyStatus | null> {
  try {
    if (!authConfig()) return null
    const token = (await cookies()).get(sessionCookie)?.value
    if (!validToken(token)) return null
    const result = await backend().rpc<EmailConfirmationJourneyStatus | null>("admin_email_confirmation_status_v1", {
      p_token: tokenHash(token),
      p_case: caseId,
    })
    return knownStatus(result) ? result : null
  } catch {
    return null
  }
}
