import { PAID_SERVICE_AGREEMENT_VERSION, paidServiceAgreementContentHash } from "../../../../lib/commercial/paid-service-agreement"

/** External evidence reference. It is not the predictable solicitor statement. */
export const PAID_SERVICE_APPROVAL_EVIDENCE =
  "Solicitor file COM-13B-REVIEW-2026-10-15 exact hash confirmation."

export const PAID_SERVICE_APPROVAL_REQUEST = "c13b0000-0000-4000-8000-00000000c013"

/**
 * The three acknowledgements the acceptance core requires.
 * Guided quotations send no fee acknowledgement. Managed and Guard send only their own.
 */
export function paidQuoteCommand(input: {
  quoteVersionId: string
  serviceCode: string
  locationId?: string
  amountMinor?: number
}) {
  const managed = input.serviceCode === "MANAGED_RELAUNCH" || input.serviceCode === "MANAGED_REVIEW"
  const guard = input.serviceCode === "RELAUNCH_GUARD"
  return {
    accepted: true as const,
    quoteVersionId: input.quoteVersionId,
    businessPurpose: { accepted: true as const },
    terms: {
      accepted: true as const,
      version: PAID_SERVICE_AGREEMENT_VERSION,
      hash: paidServiceAgreementContentHash,
    },
    feeBasis: managed
      ? { accepted: true as const, kind: "MANAGED_CONTINGENT_SUCCESS_FEE_V1" }
      : guard
        ? {
          accepted: true as const,
          kind: "GUARD_RECURRING_CONSENT_V1",
          locationId: input.locationId,
          amountMinor: input.amountMinor ?? 999,
        }
        : null,
  }
}
