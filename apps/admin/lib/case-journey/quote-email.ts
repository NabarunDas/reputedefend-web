/**
 * Step 6 reads quotation delivery from the case communication history.
 * A link, a queue row, provider acceptance and inbox delivery stay separate.
 * An incomplete or ambiguous history is not treated as "not sent".
 */

import type { CaseCommunicationRead, CaseCommunicationRow, DeliveryStatus } from "../communications/model"

export type QuoteEmailPhase = "unavailable" | "none" | "queued" | "submitted" | "delivered" | "attention"

export type QuoteEmailView = {
  phase: QuoteEmailPhase
  communicationId: string | null
  /** DEV may process this exact queued row. Production workers are left alone. */
  canProcessPending: boolean
}

export const emptyQuoteEmail: QuoteEmailView = {
  phase: "none",
  communicationId: null,
  canProcessPending: false,
}

const unavailableQuoteEmail: QuoteEmailView = {
  phase: "unavailable",
  communicationId: null,
  canProcessPending: false,
}

const actionInBody = /\/action\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

function actionIds(row: Pick<CaseCommunicationRow, "bodyText" | "bodyHtml">): string[] | null {
  if (row.bodyText == null && row.bodyHtml == null) return null
  const found = new Set<string>()
  for (const source of [row.bodyText, row.bodyHtml]) {
    if (!source) continue
    for (const match of source.matchAll(actionInBody)) found.add(match[1].toLowerCase())
  }
  return [...found]
}

function currentQuoteEmails(read: CaseCommunicationRead): CaseCommunicationRow[] {
  return read.communications.filter(row =>
    row.templateKey === "QUOTE_OFFER"
    && row.lifecycle !== "CANCELLED"
    && !row.supersededBy)
}

function inFlight(row: CaseCommunicationRow): boolean {
  if (row.lifecycle === "QUEUED" && (row.deliveryStatus === "NONE" || row.deliveryStatus == null || row.deliveryStatus === "ACCEPTANCE_UNKNOWN")) {
    return true
  }
  return row.deliveryStatus === "ACCEPTANCE_UNKNOWN"
}

function phaseFor(row: CaseCommunicationRow, devSend: boolean): QuoteEmailView {
  const delivery: DeliveryStatus | null = row.deliveryStatus
  if (delivery === "DELIVERED") {
    return { phase: "delivered", communicationId: row.id, canProcessPending: false }
  }
  if (delivery === "PROVIDER_ACCEPTED") {
    return { phase: "submitted", communicationId: row.id, canProcessPending: false }
  }
  if (delivery === "ACCEPTANCE_UNKNOWN" || row.firstProviderAttemptAt) {
    return { phase: "attention", communicationId: row.id, canProcessPending: false }
  }
  if (row.lifecycle === "QUEUED" && (delivery === "NONE" || delivery == null)) {
    return {
      phase: "queued",
      communicationId: row.id,
      canProcessPending: devSend && !row.firstProviderAttemptAt,
    }
  }
  return { phase: "attention", communicationId: row.id, canProcessPending: false }
}

/**
 * Bind QUOTE_OFFER history to the current open acceptance action.
 * Provider acceptance is not delivery. A prior provider attempt is not retried.
 */
export function projectQuoteEmail(
  read: CaseCommunicationRead | null,
  actionId: string | null,
  options: { devSend?: boolean } = {},
): QuoteEmailView {
  if (!read || read.status !== "success" || read.complete !== true) return unavailableQuoteEmail
  const devSend = options.devSend === true
  const rows = currentQuoteEmails(read)
  const wanted = actionId?.toLowerCase() ?? null

  if (!wanted) {
    return rows.some(inFlight) ? { phase: "attention", communicationId: null, canProcessPending: false } : emptyQuoteEmail
  }

  const matched: CaseCommunicationRow[] = []
  for (const row of rows) {
    const ids = actionIds(row)
    if (ids === null) return unavailableQuoteEmail
    if (ids.length !== 1) return unavailableQuoteEmail
    if (ids[0] === wanted) matched.push(row)
  }
  if (matched.length === 0) return emptyQuoteEmail
  if (matched.length > 1) return unavailableQuoteEmail
  return phaseFor(matched[0], devSend)
}
