/**
 * Step 3 reads the issue and prepares one evidence requirement.
 *
 * Suggestions are not requirements. Saving uses the existing evidence-request
 * command. The customer email uses the existing evidence-request template,
 * which names one open request. Nothing here decides that the step is complete.
 */

import { deliveryLabel, type CaseCommunicationRead, type DeliveryStatus } from "../communications/model"
import type { EvidenceRequest } from "../evidence/model"

const caseTypeLabels: Record<string, string> = {
  PROFILE_RECOVERY: "Profile recovery",
  REVIEW_PROTECTION: "Review protection",
  MONITORING: "Monitoring",
}

const options = {
  suspension: {
    title: "Google suspension or rejection notice",
    detail: "The notice Google sent about the suspension or rejection.",
  },
  registration: {
    title: "Business registration or licensing evidence",
    detail: "Registration or a licence for the business. This is not a personal identity document.",
  },
  location: {
    title: "Proof of operating location",
    detail: "A document that shows where the business operates. Do not ask for a personal identity document.",
  },
  contact: {
    title: "Website or business contact details",
    detail: "The business website, phone or email the customer already uses.",
  },
  appeal: {
    title: "Google correspondence or appeal reference",
    detail: "A reply or appeal reference Google has already sent.",
  },
} as const

export type SuggestionKey = keyof typeof options

export type SuggestedDocument = {
  key: SuggestionKey
  title: string
  detail: string
  selected: boolean
}

export type JourneyRequirement = {
  id: string
  title: string
  requestText: string
  status: EvidenceRequest["status"]
  version: number
}

export type JourneyEvidenceMessage = {
  id: string
  version: number
  recipient: string
  subject: string | null
  bodyText: string | null
  lifecycle: string | null
  delivery: string
  contentLocked: boolean
  evidenceRequestId: string | null
  draftedAt: string
}

export type DraftingInputs = {
  customerOriginConfigured: boolean
  uploadLinkConfigured: boolean
  senderConfigured: boolean
}

export type DraftingAvailability = {
  canDraft: boolean
  canReview: boolean
  draftReasons: string[]
  reviewReason: string | null
}

export type JourneyDocuments = {
  caseTypeLabel: string
  businessName: string
  issue: string
  suggestions: SuggestedDocument[]
  requests: JourneyRequirement[]
  history: "ready" | "unavailable" | "incomplete" | "ambiguous"
  verifiedEmail: string | null
  verifiedEmailSuppressed: boolean
  sendDisabledReason: string
  drafting: DraftingAvailability
  currentMessage: JourneyEvidenceMessage | null
  cancelledMessage: boolean
}

type MessageSource = {
  id: string
  version: number
  templateKey: string | null
  recipient: string
  subject: string | null
  bodyText: string | null
  lifecycle: string | null
  deliveryStatus: DeliveryStatus | null
  legacyStatus: string | null
  contentLocked: boolean
  evidenceRequestId: string | null
  draftedAt: string
  supersededBy: string | null
}

export function caseTypeLabel(caseType: string): string {
  return caseTypeLabels[caseType] ?? caseType
}

/**
 * Relevant documents for this issue.
 *
 * The first text match starts selected. A case-type hint stays visible and
 * unselected. Personal identity documents are never suggested.
 */
export function suggestDocuments(input: { caseType: string; issue: string }): SuggestedDocument[] {
  const issue = input.issue
  const suspension = /suspend|rejection|\brejected\b|\bdisabled\b|disappear|removed the (profile|listing)|profile was removed|listing was removed/i.test(issue)
  const registration = /licen[cs]e|regist|companies house/i.test(issue)
  const location = /\b(address|premises|location)\b|operating/i.test(issue)
  const contact = /website|\bphone\b|contact details/i.test(issue)
  const appeal = /appeal|correspondence|reference number/i.test(issue)
  const chosen: Array<{ key: SuggestionKey; selected: boolean }> = []
  if (suspension) chosen.push({ key: "suspension", selected: true })
  else if (input.caseType === "PROFILE_RECOVERY") chosen.push({ key: "suspension", selected: false })
  if (registration) chosen.push({ key: "registration", selected: true })
  if (location) chosen.push({ key: "location", selected: true })
  if (contact || input.caseType === "MONITORING") chosen.push({ key: "contact", selected: contact })
  if (appeal || input.caseType === "REVIEW_PROTECTION") chosen.push({ key: "appeal", selected: appeal })
  let picked = false
  return chosen.map(item => {
    const selected = item.selected && !picked
    if (selected) picked = true
    return { key: item.key, ...options[item.key], selected }
  })
}

export function requirementTitle(items: Array<{ title: string }>): string | null {
  const titles = items.map(item => item.title.trim()).filter(Boolean)
  if (titles.length === 0) return null
  const joined = titles.join("; ")
  if (joined.length > 200) return null
  return joined
}

export function requirementText(items: Array<{ title: string; detail: string }>): string | null {
  const lines = items.map(item => {
    const title = item.title.trim()
    const detail = item.detail.trim()
    if (!title) return ""
    return detail ? `${title} — ${detail}` : title
  }).filter(Boolean)
  if (lines.length === 0) return null
  const text = lines.join("\n")
  if (text.length > 4000) return null
  return text
}

const vagueTitles = new Set([
  "other",
  "other evidence",
  "other document",
  "other documents",
  "evidence",
  "document",
  "documents",
  "doc",
  "docs",
  "n/a",
  "na",
  "none",
  "tbd",
  "misc",
  "miscellaneous",
  "something else",
])

/** A title the customer would see without learning which document to send. */
export function vagueEvidenceTitle(title: string): boolean {
  const parts = title.split(";").map(part => part.trim()).filter(Boolean)
  if (parts.length === 0) return true
  return parts.some(part => {
    const normal = part.toLowerCase().replace(/[.:]+$/g, "").replace(/\s+/g, " ").trim()
    return vagueTitles.has(normal)
  })
}

export function alreadySaved(title: string, requests: Array<{ title: string; status: string }>): boolean {
  const normal = title.trim().toLowerCase()
  return requests.some(request => request.status === "OPEN" && request.title.trim().toLowerCase() === normal)
}

const CUSTOMER_ORIGIN_REASON = "A customer site origin is not configured for this preview, so an evidence-request draft cannot be created."
const UPLOAD_LINK_REASON = "The secure upload link is not configured, so a draft cannot be created."
const SENDER_REASON = "The outbound sender address is not configured, so a draft cannot be marked reviewed."

/** Booleans only. The page must not pass secret values or the origin string. */
export function draftingAvailability(input: DraftingInputs): DraftingAvailability {
  const draftReasons = [
    input.customerOriginConfigured ? null : CUSTOMER_ORIGIN_REASON,
    input.uploadLinkConfigured ? null : UPLOAD_LINK_REASON,
  ].filter((reason): reason is string => !!reason)
  return {
    canDraft: draftReasons.length === 0,
    canReview: input.senderConfigured,
    draftReasons,
    reviewReason: input.senderConfigured ? null : SENDER_REASON,
  }
}

export function buildJourneyDocuments(input: {
  caseType: string
  issue: string
  businessName: string
  requests: EvidenceRequest[]
  history: CaseCommunicationRead | null
  sendDisabledReason: string
  drafting: DraftingInputs
}): JourneyDocuments {
  const requests = input.requests.map(request => ({
    id: request.id,
    title: request.title,
    requestText: request.requestText,
    status: request.status,
    version: request.version,
  }))
  const base = {
    caseTypeLabel: caseTypeLabel(input.caseType),
    businessName: input.businessName,
    issue: input.issue,
    suggestions: suggestDocuments({ caseType: input.caseType, issue: input.issue }),
    requests,
    verifiedEmail: input.history?.verifiedEmail ?? null,
    verifiedEmailSuppressed: input.history?.verifiedEmailSuppressed ?? false,
    sendDisabledReason: input.sendDisabledReason,
    drafting: draftingAvailability(input.drafting),
  }
  if (!input.history) {
    return { ...base, history: "unavailable", currentMessage: null, cancelledMessage: false }
  }
  if (!input.history.complete) {
    return { ...base, history: "incomplete", currentMessage: null, cancelledMessage: false }
  }
  const relevant = input.history.communications.filter(row => row.templateKey === "EVIDENCE_REQUEST")
  if (relevant.length === 0) {
    return { ...base, history: "ready", currentMessage: null, cancelledMessage: false }
  }
  const newest = relevant.reduce((latest, row) => (row.draftedAt > latest.draftedAt ? row : latest))
  if (relevant.filter(row => row.draftedAt === newest.draftedAt).length > 1 || newest.supersededBy) {
    return { ...base, history: "ambiguous", currentMessage: null, cancelledMessage: false }
  }
  return {
    ...base,
    history: "ready",
    currentMessage: newest.lifecycle === "CANCELLED" ? null : toMessage(newest),
    cancelledMessage: newest.lifecycle === "CANCELLED",
  }
}

function toMessage(row: MessageSource): JourneyEvidenceMessage {
  return {
    id: row.id,
    version: row.version,
    recipient: row.recipient,
    subject: row.subject,
    bodyText: row.bodyText,
    lifecycle: row.lifecycle,
    delivery: deliveryLabel({ deliveryStatus: row.deliveryStatus, legacyStatus: row.legacyStatus }),
    contentLocked: row.contentLocked,
    evidenceRequestId: row.evidenceRequestId,
    draftedAt: row.draftedAt,
  }
}

export function openRequirements(documents: JourneyDocuments): JourneyRequirement[] {
  return documents.requests.filter(request => request.status === "OPEN")
}

export function messageIsLive(message: JourneyEvidenceMessage | null): boolean {
  return !!message && message.lifecycle !== "CANCELLED"
}

export function requirementCoverage(documents: JourneyDocuments): {
  included: JourneyRequirement | null
  omitted: JourneyRequirement[]
} {
  const open = openRequirements(documents)
  const named = messageIsLive(documents.currentMessage) ? documents.currentMessage?.evidenceRequestId ?? null : null
  if (!named) return { included: null, omitted: open }
  return {
    included: open.find(request => request.id === named) ?? null,
    omitted: open.filter(request => request.id !== named),
  }
}

export type EvidencePreviewBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "link"; url: string }

/** Paragraphs and bullet lines, with the secure upload link once at the end. */
export function evidencePreviewBlocks(body: string | null): EvidencePreviewBlock[] {
  const parts = splitEvidenceMessage(body)
  const blocks: EvidencePreviewBlock[] = []
  for (const chunk of parts.prose.split(/\n{2,}/).map(item => item.trim()).filter(Boolean)) {
    const lines = chunk.split("\n").map(line => line.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every(line => /^[-•]\s+\S/.test(line))) {
      blocks.push({ type: "list", items: lines.map(line => line.replace(/^[-•]\s+/, "")) })
    } else {
      blocks.push({ type: "paragraph", text: chunk })
    }
  }
  if (parts.uploadUrl) blocks.push({ type: "link", url: parts.uploadUrl })
  return blocks
}

const uploadUrlPattern = /https:\/\/[A-Za-z0-9.-]+\/action\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** The editable message is the prose. The upload link stays on its own. */
export function splitEvidenceMessage(body: string | null): { prose: string; uploadUrl: string | null } {
  if (!body) return { prose: "", uploadUrl: null }
  const matches = [...body.matchAll(uploadUrlPattern)]
  const match = matches[0]
  if (!match || matches.length !== 1 || match.index == null) return { prose: body.trim(), uploadUrl: null }
  if (body.slice(match.index + match[0].length).trim() !== "") return { prose: body.trim(), uploadUrl: null }
  return { prose: body.slice(0, match.index).trim(), uploadUrl: match[0] }
}

/**
 * Other open requests stay open. Approval is withheld only when this email
 * is not linked to an open request at all.
 */
export function approvalNotice(documents: JourneyDocuments): { blocked: boolean; text: string | null } {
  const message = documents.currentMessage
  if (!message || message.lifecycle !== "DRAFT") return { blocked: false, text: null }
  const { included, omitted } = requirementCoverage(documents)
  if (!included) {
    return { blocked: true, text: "This email is not linked to an open document request, so it cannot be approved." }
  }
  if (omitted.length === 0) return { blocked: false, text: null }
  const leftOut = omitted.map(request => request.title).join("; ")
  return {
    blocked: false,
    text: `This email covers only “${included.title}”. Still open and not included: ${leftOut}. Approving does not cancel those requests and does not ask the customer for them.`,
  }
}
