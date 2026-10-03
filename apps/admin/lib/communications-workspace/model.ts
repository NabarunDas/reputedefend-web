/**
 * The case Communications workspace, as a reading of facts already decided.
 *
 * Contact state comes from `evidenceContactState`. The next action comes from
 * `resolveCaseFlow`. Delivery labels come from `deliveryLabel`. This module
 * only decides which of those facts to show, and which existing command is
 * the one CaseFlow has already named. It does not decide that a message was
 * delivered, that a sender is authenticated, or that an attachment is evidence.
 *
 * The database commands remain authoritative. A true flag here is permission
 * to show a control, not proof that the command will accept the call.
 */

import { evidenceContactState, type EvidenceRequestState } from "../case-flow/evidence"
import { evidenceRequestStateLabel } from "../evidence/workspace"
import type { CaseFlowCommunicationFact, CaseNextAction } from "../case-flow/model"
import { caseDestination, isInternalPath, recordDestination } from "../case-flow/destinations"
import { deliveryLabel, lifecycleLabel, templateLabel, type CaseCommunicationRead, type CaseCommunicationRow, type DeliveryStatus } from "../communications/model"
import { conversationStateLabel, senderMatchLabel, type CaseConversationRead, type ConversationDetail, type ConversationRow } from "../conversations/model"
import { isUuid } from "../records/model"

const situationLabels = {
  NOT_PREPARED: "Message not prepared",
  DRAFTED: "Draft waiting for review",
  REVIEWED: "Reviewed and ready to queue",
  QUEUED: "Waiting for email provider",
  ACCEPTANCE_UNKNOWN: "Provider acceptance unknown — reconciliation required",
  PROVIDER_ACCEPTED: "Accepted by provider — delivery not confirmed",
  DELIVERED: "Delivered to customer",
  FAILED: "Delivery failed — contact recovery required",
  CANCELLED: "The evidence-request message was cancelled",
} as const

const permanentFailure = new Set<DeliveryStatus>(["BOUNCED", "COMPLAINED", "SUPPRESSED", "FAILED"])

const recoveryLimitation = "Creating a contact-recovery task does not change the customer email, does not finish recovery, and does not check whether an equivalent task is already open. The existing command has no way to recognise an open equivalent task."

export type CommunicationMoment = { label: string; at: string }

export type CommunicationCard = {
  id: string
  version: number
  purpose: string
  recipient: string
  subject: string | null
  bodyText: string | null
  lifecycle: string
  delivery: string
  deliveryClarification: string | null
  role: "current" | "superseded" | "earlier"
  moments: CommunicationMoment[]
  events: CaseCommunicationRow["events"]
  eventsTruncated: boolean
  providerMessageId: string | null
  lastError: string | null
  canReplace: boolean
}

export type EvidenceRequestChoice = {
  id: string
  label: string
}

export type CommunicationsCommands = {
  draftEvidenceRequest: boolean
  reviewEvidenceRequest: boolean
  queueEvidenceRequest: boolean
  reconcileAcceptance: boolean
  replaceDraft: boolean
}

export type CommunicationsCaseAction =
  | { kind: "none" }
  | { kind: "here"; label: string; description: string; withheld: string | null }
  | { kind: "elsewhere"; label: string; description: string; href: string | null; destinationLabel: string | null }

export type SelectedConversation =
  | { kind: "none" }
  | { kind: "foreign" }
  | { kind: "unavailable" }
  | { kind: "disagree" }
  | { kind: "open"; detail: ConversationDetail }

export type CommunicationsWorkspaceModel = {
  notices: string[]
  situation: string
  situationNote: string | null
  caseAction: CommunicationsCaseAction
  commands: CommunicationsCommands
  sendBlocked: boolean
  sendBlockedReason: string
  waitingNote: string | null
  recovery: {
    show: boolean
    recipient: string | null
    reason: string | null
    verifiedEmail: string | null
    verifiedEmailSuppressed: boolean
    clientHref: string | null
    limitation: string
    replacementNote: string | null
  } | null
  evidenceRequests: EvidenceRequestChoice[]
  caseUpdateAllowed: boolean
  communications: CommunicationCard[]
  currentCommunicationId: string | null
  conversations: Array<ConversationRow & { href: string; stateLabel: string; senderLabel: string }>
  conversationsIncomplete: boolean
  selected: SelectedConversation
  liveMailEnabled: boolean
}

export function honestDeliveryLabel(row: Pick<CaseCommunicationRow, "deliveryStatus" | "legacyStatus">): string {
  if (row.deliveryStatus === "PROVIDER_ACCEPTED" || row.legacyStatus === "SENT") {
    return "Accepted by email provider — delivery not yet confirmed"
  }
  return deliveryLabel(row)
}

function journey(action: CaseNextAction | null, id: string): boolean {
  return action?.id === id && action.state === "ACTION_REQUIRED"
}

function presentCaseAction(action: CaseNextAction | null, withheld: string | null): CommunicationsCaseAction {
  if (!action) return { kind: "none" }
  if (action.destination?.kind === "CASE_COMMUNICATIONS") {
    return { kind: "here", label: action.label, description: action.description, withheld }
  }
  const href = action.destination && isInternalPath(action.destination.href) ? action.destination.href : null
  return {
    kind: "elsewhere",
    label: action.label,
    description: action.description,
    href,
    destinationLabel: href ? action.destination?.label ?? null : null,
  }
}

function moments(row: CaseCommunicationRow): CommunicationMoment[] {
  const pairs: Array<[string, string | null]> = [
    ["Drafted", row.draftedAt],
    ["Reviewed", row.reviewedAt],
    ["Queued", row.queuedAt],
    ["Provider accepted", row.providerAcceptedAt],
    ["Delivered", row.deliveredAt],
    ["Failed", row.failedAt],
    ["Cancelled", row.cancelledAt],
  ]
  return pairs.flatMap(([label, at]) => (at ? [{ label, at }] : []))
}

function contradicts(row: CaseCommunicationRow): boolean {
  const types = new Set(row.events.map(event => event.eventType))
  if (row.deliveryStatus === "DELIVERED" && (types.has("BOUNCED") || types.has("COMPLAINED") || types.has("SUPPRESSED"))) return true
  if (row.deliveryStatus === "PROVIDER_ACCEPTED" && types.has("DELIVERED")) return true
  if ((row.deliveryStatus === "NONE" || row.deliveryStatus === null) && (types.has("DELIVERED") || types.has("PROVIDER_ACCEPTED"))) return true
  if (row.deliveryStatus === "ACCEPTANCE_UNKNOWN" && (types.has("DELIVERED") || types.has("PROVIDER_ACCEPTED"))) return true
  return false
}

function asFact(row: CaseCommunicationRow): CaseFlowCommunicationFact {
  return {
    id: row.id,
    templateKey: row.templateKey,
    lifecycle: row.lifecycle,
    deliveryStatus: row.deliveryStatus,
    legacyStatus: row.legacyStatus,
    draftedAt: row.draftedAt,
  }
}

/**
 * The evidence-request message CaseFlow would read, taken from a complete
 * case history. Two messages drafted at the same instant, or a newest message
 * that says it was superseded, are not a current message.
 */
function currentEvidenceMessage(rows: CaseCommunicationRow[]): { row: CaseCommunicationRow | null; ambiguous: boolean; superseded: boolean } {
  const relevant = rows.filter(row => row.templateKey === "EVIDENCE_REQUEST")
  if (relevant.length === 0) return { row: null, ambiguous: false, superseded: false }
  const newest = relevant.reduce((latest, row) => (row.draftedAt > latest.draftedAt ? row : latest))
  const tied = relevant.filter(row => row.draftedAt === newest.draftedAt)
  if (tied.length > 1) return { row: null, ambiguous: true, superseded: false }
  if (newest.supersededBy) return { row: null, ambiguous: false, superseded: true }
  return { row: newest, ambiguous: false, superseded: false }
}

function card(row: CaseCommunicationRow, role: CommunicationCard["role"]): CommunicationCard {
  const delivery = honestDeliveryLabel(row)
  return {
    id: row.id,
    version: row.version,
    purpose: templateLabel(row.templateKey),
    recipient: row.recipient,
    subject: row.subject,
    bodyText: row.bodyText,
    lifecycle: lifecycleLabel(row.lifecycle),
    delivery,
    deliveryClarification: row.deliveryStatus === "PROVIDER_ACCEPTED" || row.legacyStatus === "SENT"
      ? "Accepted by the email provider is not delivery, and it does not mean the customer was contacted."
      : null,
    role,
    moments: moments(row),
    events: row.events,
    eventsTruncated: row.eventsTruncated,
    providerMessageId: row.providerMessageId,
    lastError: row.lastError,
    canReplace: row.canReplace,
  }
}

export function buildCommunicationsWorkspaceModel(input: {
  caseId: string
  caseStatus: string
  customerId: string | null
  primaryAction: CaseNextAction | null
  flowCommunications: CaseFlowCommunicationFact[]
  history: CaseCommunicationRead | null
  conversations: CaseConversationRead | null
  evidenceRequests: Array<{ id: string; title: string; state: EvidenceRequestState }>
  selectedConversationId: string | null
  selectedConversation: ConversationDetail | null
  liveMailEnabled: boolean
}): CommunicationsWorkspaceModel {
  const notices: string[] = []
  const closed = input.caseStatus === "CLOSED" || input.caseStatus === "CANCELLED"
  const contact = evidenceContactState(input.flowCommunications)
  const historyMissing = !input.history
  const historyIncomplete = !!input.history && !input.history.complete
  const ownRows = (input.history?.communications ?? []).filter(row => {
    if (row.caseId === input.caseId) return true
    notices.push("Communication records disagree: a communication in this read belongs to another case.")
    return false
  })
  const foreignCommunication = (input.history?.communications.length ?? 0) > ownRows.length
  const eventConflict = ownRows.some(contradicts)
  if (ownRows.some(row => row.eventsTruncated)) {
    notices.push("Older delivery events exist for at least one communication and are not shown. That row's event history is incomplete.")
  }
  if (eventConflict) {
    notices.push("Communication records disagree: a delivery event does not match the recorded delivery state.")
  }

  const current = historyMissing || historyIncomplete || foreignCommunication || eventConflict
    ? { row: null, ambiguous: false, superseded: false }
    : currentEvidenceMessage(ownRows)
  if (current.ambiguous) {
    notices.push("Communication records disagree: more than one evidence-request message claims to be the current one.")
  }
  if (current.superseded) {
    notices.push("Communication records disagree: the newest evidence-request message says it was superseded, and the replacement is not the current row.")
  }
  const loadedContact = current.row ? evidenceContactState([asFact(current.row)]) : null
  const contactDisagrees = !!current.row && loadedContact !== contact
  if (!historyMissing && !historyIncomplete && !foreignCommunication && !eventConflict && !current.ambiguous && !current.superseded) {
    if (contact !== "NOT_PREPARED" && !current.row) {
      notices.push("Communication records disagree: CaseFlow has an evidence-request message that this case history does not contain.")
    } else if (contactDisagrees) {
      notices.push("Communication records disagree: the case history and the CaseFlow contact reading do not describe the same message.")
    }
  }
  const disagree = notices.some(notice => notice.startsWith("Communication records disagree"))
  const historyBlocked = closed || historyMissing || historyIncomplete || disagree
  const rowActionsBlocked = historyBlocked || !current.row

  if (historyMissing) {
    notices.unshift("The case communication history could not be loaded. That is not the same as no message having been prepared.")
  } else if (historyIncomplete) {
    notices.unshift("Older communications exist and are not shown. This page is not the full history, so it does not choose a current message from the rows below.")
  }

  const openRequests = input.evidenceRequests.filter(request =>
    request.state === "OPEN_NOT_STARTED" || request.state === "OPEN_IN_PROGRESS" || request.state === "OPEN_SATISFIED")
  const evidenceRequests = openRequests
    .filter(request => isUuid(request.id) && request.title.trim().length > 0)
    .map(request => ({ id: request.id, label: `${request.title} — ${evidenceRequestStateLabel(request.state)}` }))

  const withheldBecause = historyMissing || historyIncomplete
    ? "The control for that action is withheld until the full case history is available."
    : disagree
      ? "The control for that action is withheld because the communication records disagree."
      : null

  const draftEvidenceRequest = !historyBlocked && !current.row && journey(input.primaryAction, "PREPARE_EVIDENCE_REQUEST_MESSAGE") && evidenceRequests.length > 0
  if (!closed && !historyMissing && !historyIncomplete && !disagree && journey(input.primaryAction, "PREPARE_EVIDENCE_REQUEST_MESSAGE") && evidenceRequests.length === 0) {
    notices.push("CaseFlow asked for an evidence-request message, but this case has no open evidence request to attach it to.")
  }

  const reviewEvidenceRequest = !rowActionsBlocked && journey(input.primaryAction, "REVIEW_EVIDENCE_REQUEST_MESSAGE") && current.row?.lifecycle === "DRAFT"
  const queueEvidenceRequest = !rowActionsBlocked
    && journey(input.primaryAction, "SEND_EVIDENCE_REQUEST")
    && input.liveMailEnabled
    && current.row?.lifecycle === "REVIEWED"
    && current.row.deliveryStatus !== "SUPPRESSED"
  const sendBlocked = input.primaryAction?.id === "SEND_EVIDENCE_REQUEST" && input.primaryAction.state === "BLOCKED"
  const reconcileAcceptance = !rowActionsBlocked
    && journey(input.primaryAction, "RECONCILE_EMAIL_DELIVERY")
    && current.row?.deliveryStatus === "ACCEPTANCE_UNKNOWN"
  const replaceDraft = !rowActionsBlocked
    && journey(input.primaryAction, "RECOVER_CUSTOMER_CONTACT")
    && current.row?.canReplace === true
    && permanentFailure.has(current.row.deliveryStatus as DeliveryStatus)

  const recovering = !closed && (contact === "FAILED" || journey(input.primaryAction, "RECOVER_CUSTOMER_CONTACT"))
  const clientHref = recordDestination("CLIENT_RECORD", input.customerId)?.href ?? null
  const recovery = recovering && current.row ? {
    show: true,
    recipient: current.row.recipient,
    reason: current.row.lastError || honestDeliveryLabel(current.row),
    verifiedEmail: input.history?.verifiedEmail ?? null,
    verifiedEmailSuppressed: input.history?.verifiedEmailSuppressed ?? false,
    clientHref,
    limitation: recoveryLimitation,
    replacementNote: replaceDraft
      ? "A replacement can be drafted to the verified address now on the client record. That draft has not been sent. The original recipient snapshot stays on the failed message."
      : "A replacement draft is not available. It becomes possible only when the client record has a different verified, usable email that is not suppressed. The failed address cannot simply be retried, and this page cannot change the customer email.",
  } : recovering ? {
    show: true,
    recipient: null,
    reason: null,
    verifiedEmail: input.history?.verifiedEmail ?? null,
    verifiedEmailSuppressed: input.history?.verifiedEmailSuppressed ?? false,
    clientHref,
    limitation: recoveryLimitation,
    replacementNote: historyMissing || historyIncomplete || disagree
      ? "The failed message cannot be identified from this history, so a replacement draft is not offered."
      : "A replacement draft is not available until the failed message and a different verified address are both on record.",
  } : null

  const waitingNote = input.primaryAction?.id === "WAIT_FOR_EMAIL_DELIVERY"
    ? contact === "PROVIDER_ACCEPTED"
      ? "The email provider accepted the message. Delivery is not confirmed, and another send is not offered."
      : "The message is queued with the email provider. Delivery has not been reported, and another send is not offered."
    : input.primaryAction?.id === "RECONCILE_EMAIL_DELIVERY"
      ? "Provider acceptance is unknown. Record the provider message id only if the provider accepted the email. This page cannot mark the message delivered, and it does not send again. A second provider call after the idempotency window could duplicate the message, so a blind resend is not available."
      : null

  const conversationRows = input.conversations?.conversations ?? []
  const foreignConversations = conversationRows.some(row => row.caseId !== input.caseId)
  if (foreignConversations) {
    notices.push("Communication records disagree: a conversation in the case read belongs to another case.")
  }
  const conversationsIncomplete = !!input.conversations && !input.conversations.complete
  if (!input.conversations) {
    notices.push("The case conversation list could not be loaded. That is not the same as this case having no conversations.")
  } else if (conversationsIncomplete) {
    notices.push("Older case conversations exist and are not shown. The rows below are not the full conversation history.")
  }
  const workspaceHref = caseDestination("CASE_COMMUNICATIONS", input.caseId)?.href ?? null
  const visibleConversations = conversationRows
    .filter(row => row.caseId === input.caseId && isUuid(row.id))
    .map(row => {
      const href = workspaceHref && isInternalPath(`${workspaceHref}?conversation=${row.id}`)
        ? `${workspaceHref}?conversation=${row.id}`
        : workspaceHref
      return {
        ...row,
        href: href ?? "/conversations",
        stateLabel: conversationStateLabel(row.state),
        senderLabel: senderMatchLabel(row.senderMatch),
      }
    })

  const selectedId = input.selectedConversationId && isUuid(input.selectedConversationId) ? input.selectedConversationId : null
  let selected: SelectedConversation = { kind: "none" }
  if (selectedId) {
    const detail = input.selectedConversation
    if (!detail) selected = { kind: "unavailable" }
    else if (detail.conversation.caseId !== input.caseId) selected = { kind: "foreign" }
    else if (input.conversations?.complete && !visibleConversations.some(row => row.id === detail.conversation.id)) selected = { kind: "disagree" }
    else selected = { kind: "open", detail }
  }
  if (selected.kind === "disagree") {
    notices.push("Communication records disagree: the selected conversation is not in this case's conversation list.")
  }

  const situation = historyMissing
    ? "The communication history could not be loaded."
    : historyIncomplete
      ? "The communication history is incomplete."
      : disagree
        ? "The communication records disagree."
        : situationLabels[contact]
  const situationNote = contact === "PROVIDER_ACCEPTED" && !historyMissing && !historyIncomplete && !disagree
    ? "Accepted by the email provider is not delivery, and the customer has not been contacted."
    : contact === "DELIVERED" && !historyMissing && !historyIncomplete && !disagree
      ? "Delivery is confirmed. Provider acceptance on its own would not have been enough."
      : null

  const currentId = current.row?.id ?? null
  const communications = ownRows.map(row => card(
    row,
    row.supersededBy ? "superseded" : row.id === currentId ? "current" : "earlier",
  ))

  const caseUpdateAllowed = !closed && !disagree && !historyMissing

  return {
    notices,
    situation,
    situationNote,
    caseAction: presentCaseAction(input.primaryAction, (draftEvidenceRequest || reviewEvidenceRequest || queueEvidenceRequest || reconcileAcceptance || replaceDraft) ? null : withheldBecause),
    commands: {
      draftEvidenceRequest,
      reviewEvidenceRequest,
      queueEvidenceRequest,
      reconcileAcceptance,
      replaceDraft,
    },
    sendBlocked: sendBlocked && !queueEvidenceRequest,
    sendBlockedReason: "Queueing is closed until live customer mail is enabled. The reviewed draft is kept. This page does not turn sending on.",
    waitingNote,
    recovery,
    evidenceRequests: draftEvidenceRequest ? evidenceRequests : [],
    caseUpdateAllowed,
    communications,
    currentCommunicationId: currentId,
    conversations: visibleConversations,
    conversationsIncomplete,
    selected,
    liveMailEnabled: input.liveMailEnabled,
  }
}

export function caseCommunicationsHref(caseId: string): string | null {
  return caseDestination("CASE_COMMUNICATIONS", caseId)?.href ?? null
}

export { recoveryLimitation, senderMatchLabel }
