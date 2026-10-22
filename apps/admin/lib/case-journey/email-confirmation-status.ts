import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"

export type EmailConfirmationJourneyStatus = {
  state: "pending" | "verified" | "none"
  label: string
  nextGeneration: number
}

/** Staff read of the receipt challenge. A failure leaves the journey unverified. */
export async function loadEmailConfirmationStatus(caseId: string): Promise<EmailConfirmationJourneyStatus | null> {
  try {
    if (!authConfig()) return null
    const token = (await cookies()).get(sessionCookie)?.value
    if (!validToken(token)) return null
    const result = await backend().rpc<EmailConfirmationJourneyStatus | null>("admin_email_confirmation_status_v1", {
      p_token: tokenHash(token),
      p_case: caseId,
    })
    if (!result || (result.state !== "pending" && result.state !== "verified" && result.state !== "none")) return null
    return result
  } catch {
    return null
  }
}
