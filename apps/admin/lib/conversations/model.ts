export const CONVERSATION_STATES = ["UNMATCHED", "OPEN", "CLOSED"] as const
export type ConversationState = (typeof CONVERSATION_STATES)[number]
export const CONVERSATION_FILTERS = ["UNMATCHED", "OPEN", "CLOSED", "NEEDS_ATTENTION"] as const
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number]
export const SENDER_MATCHES = ["NONE", "MATCHES_VERIFIED_CONTACT", "OWNED_ADDRESS", "AUTOMATED"] as const
export type SenderMatch = (typeof SENDER_MATCHES)[number]

export type ConversationRow = {
  id: string
  state: ConversationState
  subject: string | null
  sender: string | null
  receivedAt: string
  caseId: string | null
  caseReference: string | null
  senderMatch: SenderMatch
  hasAttachment: boolean
  assignedAdminId: string | null
  needsAttention: boolean
  version: number
}

export type ConversationList = {
  status?: string
  conversations: ConversationRow[]
}

/**
 * Conversations linked to one case.
 *
 * This is not a filtered copy of the global inbox. `complete` is false when
 * the case has more linked conversations than this read returned.
 */
export type CaseConversationRead = {
  status: "success" | "invalid" | "unavailable"
  complete: boolean
  total: number
  returned: number
  conversations: ConversationRow[]
}

export type ConversationAttachment = {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  scanStatus: string
  validationStatus: string
  available: boolean
  promotionState: string
}

export type ConversationEntry = {
  id: string
  kind: string
  subject?: string | null
  bodyText?: string | null
  sender?: string | null
  senderMatch?: string
  loopClass?: string
  importStatus?: string
  lifecycle?: string | null
  deliveryStatus?: string | null
  recipient?: string | null
  replyToAddress?: string | null
  inReplyTo?: string | null
  receivedAt?: string | null
  createdAt?: string
  version?: number
  attachments?: ConversationAttachment[]
}

export type ConversationDetail = {
  status?: string
  conversation: {
    id: string
    state: ConversationState
    subject: string | null
    caseId: string | null
    caseReference: string | null
    assignedAdminId: string | null
    needsAttention: boolean
    replyAlias: string
    version: number
    recipientSuppressed: boolean
  }
  entries: ConversationEntry[]
}

export function conversationStateLabel(value: string): string {
  if (value === "UNMATCHED") return "Unmatched"
  if (value === "OPEN") return "Open"
  if (value === "CLOSED") return "Closed"
  return value
}

export function senderMatchLabel(value: string): string {
  if (value === "MATCHES_VERIFIED_CONTACT") return "Matches a verified contact — not authentication"
  if (value === "OWNED_ADDRESS") return "ProfileRelaunch-owned sender"
  if (value === "AUTOMATED") return "Automated message"
  return "No trusted sender match"
}

export function attachmentAvailable(row: Pick<ConversationAttachment, "available">): boolean {
  return row.available === true
}
