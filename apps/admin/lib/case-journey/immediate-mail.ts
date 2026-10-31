import "server-only"
import {
  centralDispatchLaneOpen,
  dispatchCaseRetryMail,
  dispatchCompletionMail,
  dispatchPublishedPackMail,
} from "../communications/central-dispatch"
import { getPreparedPackCase } from "../packs/queries"

/**
 * Recovers customer mail the Admin lane already queued for this case.
 * The sweep worker is not started. A closed lane returns without a claim.
 * Opening the case is the retry when an immediate send did not finish.
 */
export async function recoverPublishedCustomerMail(caseId: string): Promise<void> {
  if (!centralDispatchLaneOpen()) return
  try {
    const packs = await getPreparedPackCase(caseId)
    const current = packs.packs
      .filter(pack => pack.status === "APPROVED" && pack.published === true)
      .sort((left, right) => right.packNumber - left.packNumber)[0]
    if (current) await dispatchPublishedPackMail(current.id)
    await dispatchCompletionMail(caseId)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const status = await dispatchCaseRetryMail(caseId)
      if (status !== "accepted") break
    }
  } catch {
    // Recovery is optional. The page still shows the stored delivery status.
  }
}
