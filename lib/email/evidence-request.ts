import { brandName, brandSiteUrl } from "../brand"
import {
  customerEmailSecurityNote,
  renderCustomerEmail,
  trustedActionUrl,
  type CustomerEmailBlock,
} from "./customer-message"
import { monitoredReplyMailbox } from "./reply-mailbox"

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

const actionUrlInText = /https:\/\/[A-Za-z0-9.-]+\/action\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export const evidenceRequestSubject = "Supporting documents for your ProfileRelaunch enquiry — {case_ref}"

export function evidenceDocumentItems(title: string): string[] | null {
  const items = title.split("; ").map(item => item.trim()).filter(Boolean)
  if (items.length === 0 || items.length > 20) return null
  if (items.some(item => vagueTitles.has(item.toLowerCase()) || item.length > 200 || /[<>]/.test(item))) return null
  return items
}

export function splitTrailingActionUrl(body: string | null): { prose: string; uploadUrl: string | null } {
  if (!body) return { prose: "", uploadUrl: null }
  const matches = [...body.matchAll(actionUrlInText)]
  const match = matches[0]
  if (!match || matches.length !== 1 || match.index == null) return { prose: body.trim(), uploadUrl: null }
  if (body.slice(match.index + match[0].length).trim() !== "") return { prose: body.trim(), uploadUrl: null }
  if (!trustedActionUrl(match[0])) return { prose: body.trim(), uploadUrl: null }
  return { prose: body.slice(0, match.index).trim(), uploadUrl: match[0] }
}

function replyParagraph(replyTo: string | null | undefined): string {
  if (replyTo && monitoredReplyMailbox({ COMMUNICATIONS_REPLY_TO_EMAIL: replyTo })) {
    return "If you're unsure what to provide or have any questions, simply reply to this email. We're happy to help."
  }
  return "If you're unsure what to provide, you can contact our team through the ProfileRelaunch website."
}

export function composeEvidenceRequestEmail(input: {
  caseRef: string
  documents: string[]
  uploadUrl: string
  replyTo?: string | null
}): { subject: string; html: string; text: string } | null {
  const caseRef = input.caseRef.trim()
  if (!caseRef || caseRef.length > 40 || /[\s<>]/.test(caseRef)) return null
  if (input.documents.length === 0 || input.documents.some(item => vagueTitles.has(item.trim().toLowerCase()))) return null
  if (!trustedActionUrl(input.uploadUrl) || input.uploadUrl.includes("#t=")) return null
  const items = evidenceDocumentItems(input.documents.join("; "))
  if (!items || items.join("\n") !== input.documents.map(item => item.trim()).join("\n")) return null
  const blocks: CustomerEmailBlock[] = [
    { type: "paragraph", text: "Hello," },
    { type: "paragraph", text: `Thank you for contacting ${brandName}.` },
    { type: "paragraph", text: "We're reviewing your Google Business Profile enquiry. To help us understand the issue and advise you on the next steps, could you please provide the following information?" },
    { type: "list", title: "Documents requested", items },
    { type: "paragraph", text: "Please use the secure button below to upload your documents." },
    { type: "button", label: "Upload your documents securely", url: input.uploadUrl },
    { type: "paragraph", text: replyParagraph(input.replyTo) },
    { type: "paragraph", text: "Kind regards," },
    { type: "paragraph", text: `${brandName} Support Team` },
  ]
  const rendered = renderCustomerEmail({
    title: "Supporting documents",
    blocks,
    caseRef,
  })
  if (!rendered) return null
  return {
    subject: evidenceRequestSubject.replaceAll("{case_ref}", caseRef),
    html: rendered.html,
    text: rendered.text,
  }
}

/**
 * Brands the saved plain-text draft. A paragraph that is the saved requirement
 * title becomes a real list. The trailing action URL becomes the button.
 * Vague titles are left out of the customer rendering.
 */
export function brandStoredEvidenceEmail(input: {
  subject: string
  body: string
  documentTitle?: string | null
  replyTo?: string | null
}): { html: string; text: string; documents: string[] } | null {
  if (input.body.includes("#t=")) return null
  const parts = splitTrailingActionUrl(input.body)
  const documents = input.documentTitle ? evidenceDocumentItems(input.documentTitle) : null
  const blocks: CustomerEmailBlock[] = []
  for (const paragraph of parts.prose.split(/\n{2,}/).map(item => item.trim()).filter(Boolean)) {
    if (isLayoutFooter(paragraph)) continue
    if (input.documentTitle && paragraph === input.documentTitle.trim()) {
      if (!documents) continue
      blocks.push({ type: "list", title: "Documents requested", items: documents })
      continue
    }
    const listed = bulletList(paragraph)
    if (listed) {
      if (listed.items.some(item => vagueTitles.has(item.toLowerCase()))) return null
      blocks.push({ type: "list", title: listed.title, items: listed.items })
      continue
    }
    blocks.push({ type: "paragraph", text: paragraph })
  }
  if (parts.uploadUrl) {
    blocks.push({ type: "button", label: "Upload your documents securely", url: parts.uploadUrl })
  }
  if (input.replyTo && monitoredReplyMailbox({ COMMUNICATIONS_REPLY_TO_EMAIL: input.replyTo })) {
    const already = blocks.some(block => block.type === "paragraph" && /\breply\b/i.test(block.text))
    if (!already) {
      blocks.push({ type: "paragraph", text: replyParagraph(input.replyTo) })
    }
  }
  const caseRef = input.subject.match(/\b[A-Z]{2,}-[A-Z0-9-]{2,}\b/)?.[0] ?? null
  const rendered = renderCustomerEmail({
    title: input.subject.trim() || "ProfileRelaunch",
    blocks,
    caseRef,
  })
  if (!rendered) return null
  return { ...rendered, documents: documents ?? [] }
}

function isLayoutFooter(paragraph: string): boolean {
  const text = paragraph.trim()
  return text === customerEmailSecurityNote
    || text === brandSiteUrl
    || /^Case reference:\s+\S/.test(text)
}

function bulletList(paragraph: string): { title?: string; items: string[] } | null {
  const lines = paragraph.split("\n").map(line => line.trim()).filter(Boolean)
  const items = lines.filter(line => /^[-•]\s+\S/.test(line)).map(line => line.replace(/^[-•]\s+/, "").trim())
  const headings = lines.filter(line => !/^[-•]\s+\S/.test(line))
  if (items.length === 0 || headings.length > 1) return null
  if (headings.length === 1 && headings[0] !== "Documents requested") return null
  return { title: headings[0], items }
}

export const evidenceRequestWebsite = brandSiteUrl
