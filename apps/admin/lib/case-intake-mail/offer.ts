/**
 * Whether the two stored initial case emails can be retried.
 * This matches the claim rules: a row already accepted, in flight, or left
 * unknown is not offered again. Later communications are ignored.
 */

const ATTEMPT_LIMIT = 3

export type StoredIntakeMail = {
  communicationType: string
  recipient: string
  status: string | null
  providerMessageId: string | null
  metadata: unknown
}

export type IntakeMailRetryDestination = {
  role: "Customer acknowledgement" | "Internal notification"
  recipient: string
  willSend: boolean
}

export type IntakeMailRetryOffer = {
  destinations: [IntakeMailRetryDestination, IntakeMailRetryDestination]
}

export function isIntakeMailPublicRef(value: string) {
  return /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/.test(value)
}

function metadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function held(row: StoredIntakeMail) {
  if (row.status === "SENT") return false
  if (typeof row.providerMessageId === "string" && row.providerMessageId.length > 0) return false
  const meta = metadata(row.metadata)
  const state = meta.intakeState
  const claim = typeof meta.intakeClaim === "string" && meta.intakeClaim.length > 0
  return state === "sending" || state === "unknown" || state === "accepted" || claim
}

function claimable(row: StoredIntakeMail) {
  if (row.status !== "PENDING" && row.status !== "FAILED") return false
  if (typeof row.providerMessageId === "string" && row.providerMessageId.length > 0) return false
  if (held(row)) return false
  const attempts = metadata(row.metadata).intakeAttempts
  const count = typeof attempts === "number" && Number.isInteger(attempts) && attempts > 0 ? attempts : 0
  return count < ATTEMPT_LIMIT
}

function visibleRecipient(value: string) {
  const recipient = value.trim()
  if (recipient.length < 3 || recipient.length > 254) return null
  if (/\s/.test(recipient) || !recipient.includes("@")) return null
  return recipient
}

export function intakeMailRetryOffer(rows: StoredIntakeMail[]): IntakeMailRetryOffer | null {
  const customer = rows.filter(row => row.communicationType === "CASE_RECEIVED_CUSTOMER")
  const internal = rows.filter(row => row.communicationType === "CASE_RECEIVED_INTERNAL")
  if (customer.length !== 1 || internal.length !== 1) return null
  const customerRow = customer[0]
  const internalRow = internal[0]
  if (!customerRow || !internalRow) return null
  if (held(customerRow) || held(internalRow)) return null
  const customerRecipient = visibleRecipient(customerRow.recipient)
  const internalRecipient = visibleRecipient(internalRow.recipient)
  if (!customerRecipient || !internalRecipient) return null
  const customerSend = claimable(customerRow)
  const internalSend = claimable(internalRow)
  if (!customerSend && !internalSend) return null
  return {
    destinations: [
      { role: "Customer acknowledgement", recipient: customerRecipient, willSend: customerSend },
      { role: "Internal notification", recipient: internalRecipient, willSend: internalSend },
    ],
  }
}
