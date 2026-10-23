import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash, validToken } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { requireStaff } from "../require-staff"
import { parseQuoteReadiness, unavailableQuoteReadiness, type QuoteReadiness } from "./quote-readiness"

/** Read Step 6 readiness. Any failure is unavailable and reveals nothing. */
export async function loadCaseQuoteReadiness(caseId: string): Promise<QuoteReadiness> {
  if (!isUuid(caseId)) return unavailableQuoteReadiness
  try {
    await requireStaff()
    const token = (await cookies()).get(sessionCookie)?.value
    if (!validToken(token)) return unavailableQuoteReadiness
    const result = await backend().rpc<unknown>("admin_case_quote_readiness_v1", {
      p_token: tokenHash(token),
      p_case: caseId,
    })
    if (result == null) return unavailableQuoteReadiness
    return parseQuoteReadiness(result)
  } catch {
    return unavailableQuoteReadiness
  }
}
