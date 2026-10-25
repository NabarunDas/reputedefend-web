import type { CaseFlowCommunicationFact } from "../case-flow/model"

/** Queued, accepted and delivered stay distinct. A missing row is pending, not delivered. */
export function customerMailStatus(
  communications: CaseFlowCommunicationFact[],
  templateKey: string,
  noun: string,
): string {
  const row = communications
    .filter(item => item.templateKey === templateKey && item.lifecycle !== "CANCELLED")
    .sort((left, right) => left.draftedAt.localeCompare(right.draftedAt))
    .at(-1)
  if (!row) return `No ${noun} has been queued. The notification is pending, and pending is not delivered.`
  if (row.deliveryStatus === "DELIVERED") return `The provider reported delivery of the ${noun}. That is not a download.`
  if (row.deliveryStatus === "PROVIDER_ACCEPTED") return `The email provider accepted the ${noun}. That is not proof the customer received it.`
  if (row.deliveryStatus === "ACCEPTANCE_UNKNOWN") return `Provider acceptance of the ${noun} is unknown, so another copy was not sent.`
  if (row.deliveryStatus === "BOUNCED" || row.deliveryStatus === "FAILED" || row.deliveryStatus === "SUPPRESSED") {
    return `The ${noun} was not delivered. Resume the same communication only when that is safe.`
  }
  if (row.lifecycle === "QUEUED") return `The ${noun} is queued. Queued is not delivered.`
  return `The ${noun} status is not confirmed, so another copy was not sent.`
}
