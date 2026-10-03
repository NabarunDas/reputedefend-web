/**
 * Whether a recorded case outcome is the one a success fee can be approved against.
 *
 * This mirrors `admin_private.qualifying_success_outcome_v1` for presentation
 * only. `approve_success_fee` checks that function again and denies every
 * other outcome. A true result here is not an approval, a charge, or proof
 * of payment.
 */
export function isQualifyingSuccessFeeOutcome(caseType: string | null | undefined, outcome: string | null | undefined): boolean {
  return (caseType === "PROFILE_RECOVERY" && outcome === "RESTORED")
    || (caseType === "REVIEW_PROTECTION" && outcome === "REMOVED")
}
