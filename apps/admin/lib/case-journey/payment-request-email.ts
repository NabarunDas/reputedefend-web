/**
 * Step 7 reads the payment-request email from case communication history.
 * Queued, accepted by the provider, and delivered stay separate from payment.
 * An incomplete history is not treated as "not sent".
 */

import { deliveryLabel, type CaseCommunicationRead, type CaseCommunicationRow, type DeliveryStatus } from "../communications/model"

export type PaymentRequestPhase = "unavailable" | "none" | "queued" | "submitted" | "delivered" | "attention"

export type PaymentRequestEmailView = {
  phase: PaymentRequestPhase
  communicationId: string | null
  detail: string
  /** DEV may process this exact queued row. A prior provider attempt is not retried. */
  canProcessPending: boolean
}

export const emptyPaymentRequestEmail: PaymentRequestEmailView = {
  phase: "none",
  communicationId: null,
  detail: "No payment-request email has been queued.",
  canProcessPending: false,
}

const unavailablePaymentRequestEmail: PaymentRequestEmailView = {
  phase: "unavailable",
  communicationId: null,
  detail: "The payment email history could not be confirmed.",
  canProcessPending: false,
}

const caseRefPattern = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/

function occurrences(source: string, needle: string): number {
  if (!needle) return 0
  return source.split(needle).length - 1
}

function currentRows(read: CaseCommunicationRead): CaseCommunicationRow[] {
  return read.communications.filter(row =>
    row.templateKey === "GUIDED_PAYMENT_REQUEST"
    && row.lifecycle !== "CANCELLED"
    && !row.supersededBy)
}

/** One portal payments link, and no bearer secret. */
function confirmsPortal(row: CaseCommunicationRow, caseRef: string): boolean | null {
  if (row.bodyText == null || row.bodyHtml == null) return null
  const needle = `/portal/cases/${caseRef}/payments`
  const text = row.bodyText
  const html = row.bodyHtml
  if (text.includes("#t=") || html.includes("#t=") || text.includes("/action/") || html.includes("/action/")) return false
  return occurrences(text, needle) === 1 && occurrences(html, needle) === 1
}

function phaseFor(row: CaseCommunicationRow, devSend: boolean): PaymentRequestEmailView {
  const delivery: DeliveryStatus | null = row.deliveryStatus
  const labelled = deliveryLabel({ deliveryStatus: delivery, legacyStatus: row.legacyStatus })
  if (delivery === "DELIVERED") {
    return {
      phase: "delivered",
      communicationId: row.id,
      detail: "The payment-request email was delivered. Delivery is not payment.",
      canProcessPending: false,
    }
  }
  if (delivery === "PROVIDER_ACCEPTED") {
    return {
      phase: "submitted",
      communicationId: row.id,
      detail: "The email provider accepted the payment-request email. Accepted by the provider is not delivered, and the payment is not complete.",
      canProcessPending: false,
    }
  }
  if (delivery === "ACCEPTANCE_UNKNOWN" || row.firstProviderAttemptAt) {
    return {
      phase: "attention",
      communicationId: row.id,
      detail: "Provider acceptance is unknown, so the payment-request email was not sent again.",
      canProcessPending: false,
    }
  }
  if (delivery === "BOUNCED" || delivery === "TRANSIENT_BOUNCE" || delivery === "UNDETERMINED_BOUNCE" || delivery === "COMPLAINED" || delivery === "SUPPRESSED" || delivery === "FAILED") {
    return {
      phase: "attention",
      communicationId: row.id,
      detail: `${labelled}. The payment-request email was not sent again.`,
      canProcessPending: false,
    }
  }
  if (row.lifecycle === "QUEUED" && (delivery === "NONE" || delivery == null)) {
    return {
      phase: "queued",
      communicationId: row.id,
      detail: "The payment-request email is queued. The email provider has not accepted it, and queued is not delivered.",
      canProcessPending: devSend && !row.firstProviderAttemptAt,
    }
  }
  return {
    phase: "attention",
    communicationId: row.id,
    detail: `${labelled}. The payment-request email was not sent again.`,
    canProcessPending: false,
  }
}

/**
 * One non-cancelled payment-request email for this case.
 * The button address is the case Payments page. A bearer link is not a payment request.
 */
export function projectPaymentRequestEmail(
  read: CaseCommunicationRead | null,
  caseRef: string | null,
  options: { devSend?: boolean } = {},
): PaymentRequestEmailView {
  if (!read || read.status !== "success" || read.complete !== true) return unavailablePaymentRequestEmail
  if (!caseRef || !caseRefPattern.test(caseRef)) return unavailablePaymentRequestEmail
  const rows = currentRows(read)
  if (rows.length === 0) return emptyPaymentRequestEmail
  const matched: CaseCommunicationRow[] = []
  for (const row of rows) {
    const portal = confirmsPortal(row, caseRef)
    if (portal === null) return unavailablePaymentRequestEmail
    if (portal) matched.push(row)
  }
  if (matched.length === 0) return { ...unavailablePaymentRequestEmail, detail: "A stored payment email does not use the case payments page, so its status is not shown as sent." }
  if (matched.length > 1) return { ...unavailablePaymentRequestEmail, detail: "More than one payment-request email is on file, so another one was not prepared." }
  return phaseFor(matched[0], options.devSend === true)
}

export function offerPaymentRequestSend(view: PaymentRequestEmailView): boolean {
  return view.phase === "none" || view.phase === "unavailable" || view.canProcessPending
}
