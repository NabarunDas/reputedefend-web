import type { CaseFlowCommunicationFact } from "../case-flow/model"

/** The same labels on every case step. Queued and provider acceptance are not delivery. */
export function customerNotificationLabel(input: {
  lifecycle: string | null
  deliveryStatus: string | null
  stalled?: boolean
} | null): string {
  if (!input || input.lifecycle === "DRAFT" || input.lifecycle === "REVIEWED" || input.lifecycle == null) return "Preparing notification"
  if (input.deliveryStatus === "DELIVERED") return "Delivered"
  if (input.deliveryStatus === "PROVIDER_ACCEPTED") return "Sent to email provider"
  if (input.deliveryStatus === "ACCEPTANCE_UNKNOWN") return "Delivery status needs review"
  if (input.deliveryStatus === "BOUNCED" || input.deliveryStatus === "FAILED" || input.deliveryStatus === "SUPPRESSED" || input.deliveryStatus === "COMPLAINED" || input.deliveryStatus === "TRANSIENT_BOUNCE" || input.deliveryStatus === "UNDETERMINED_BOUNCE") {
    return "Delivery failed"
  }
  if (input.lifecycle === "PROCESSING" || input.lifecycle === "SENDING") return "Sending"
  if (input.stalled) return "Delivery delayed"
  if (input.lifecycle === "QUEUED") return "Queued for sending"
  return "Delivery status needs review"
}

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
  const label = customerNotificationLabel(row ? { lifecycle: row.lifecycle, deliveryStatus: row.deliveryStatus } : null)
  if (!row) return `${label}. No ${noun} has been queued. The notification is pending, and pending is not delivered.`
  if (row.deliveryStatus === "DELIVERED") return `${label}. The provider reported delivery of the ${noun}. That is not a download.`
  if (row.deliveryStatus === "PROVIDER_ACCEPTED") return `${label}. The email provider accepted the ${noun}. That is not proof the customer received it.`
  if (row.deliveryStatus === "ACCEPTANCE_UNKNOWN") return `${label}. Provider acceptance of the ${noun} is unknown, so another copy was not sent.`
  if (row.deliveryStatus === "BOUNCED" || row.deliveryStatus === "FAILED" || row.deliveryStatus === "SUPPRESSED" || row.deliveryStatus === "COMPLAINED" || row.deliveryStatus === "TRANSIENT_BOUNCE" || row.deliveryStatus === "UNDETERMINED_BOUNCE") {
    return `${label}. The ${noun} was not delivered. Resume the same communication only when that is safe.`
  }
  if (row.lifecycle === "QUEUED") return `${label}. The ${noun} is queued. Queued is not delivered.`
  return `${label}. The ${noun} status is not confirmed, so another copy was not sent.`
}
