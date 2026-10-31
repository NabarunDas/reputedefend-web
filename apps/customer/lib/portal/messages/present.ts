/**
 * Customer-facing message titles and case groups.
 * The stored subject is not rewritten. Full subjects stay on the message page.
 */

import { isMessageSelector, type CustomerMessageThread } from "./parse"

const CASE_REF = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const TRAILING_REF = /\s+[—–-]\s+(?:Case\s+)?(?:(?:PR|RV|SO)-[0-9]{2}-[A-HJ-NP-Z2-9]{6})\b/g
const FRIENDLY_TITLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^your\b.*\bsubmission pack is ready\b/i, "Your submission pack is ready"],
  [/^your\b.*\bpreparation is complete\b/i, "Your preparation is complete"],
  [/^payment received\b/i, "Payment received"],
  [/^(?:pay for your|payment requested)\b/i, "Your payment link"],
  [/^your\b.*\bquotation\b/i, "Your quotation is ready"],
  [/^supporting (?:documents|information)\b/i, "Supporting documents requested"],
]

/**
 * Exact customer hosts. A similarly named Vercel hostname is not approved.
 * Production is customer.profilerelaunch.com. DEV develop is the clientcove preview.
 */
const APPROVED_CUSTOMER_HOSTS = new Set([
  "customer.profilerelaunch.com",
  "profilerelaunch-customer-git-develop-clientcove.vercel.app",
])
const ACTION_PATH = /^\/action\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PORTAL_PATH = /^\/portal\/cases\/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}(?:\/payments|\/documents)?$/
const URL_TOKEN = /https:\/\/[^\s<>"'`]+/gi
const PORTAL_CONTEXT = /^[a-f0-9]{32}$/

const RETURN_SEARCH = /^\?before=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})&selector=(?:mc|mm)-[a-f0-9]{64}$/
const RETURN_GROUP = /^(?:case-(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}|case-note-[0-9a-f]{1,8}|other-messages)$/
const RETURN_HREF = /^\/portal\/messages(?:\?before=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})&selector=(?:mc|mm)-[a-f0-9]{64})?#(?:case-(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}|case-note-[0-9a-f]{1,8}|other-messages)$/

export type MessageTextPart = { type: "text"; value: string } | { type: "link"; href: string }

export type CustomerMessageGroup = {
  id: string
  label: string
  businessName: string | null
  threads: CustomerMessageThread[]
  latestActivityAt: string
}

export function messageTitle(subject: string): string {
  const compact = subject.replace(/\s+/g, " ").trim()
  const withoutBrand = compact.replace(/\bProfileRelaunch\b\s*/gi, "")
  const withoutRefs = withoutBrand.replace(TRAILING_REF, "").replace(/\s+[—–-]\s*$/, "").replace(/\s{2,}/g, " ").trim()
  const basis = withoutRefs.length > 0 ? withoutRefs : compact
  for (const [pattern, title] of FRIENDLY_TITLES) {
    if (pattern.test(basis)) return title
  }
  return basis
}

export function messageParagraphs(body: string): string[] {
  const blocks = body.split(/\n{2,}/).map(block => block.trim()).filter(block => block.length > 0)
  return blocks.length > 0 ? blocks : [body]
}

function approvedCustomerHost(hostname: string): boolean {
  return APPROVED_CUSTOMER_HOSTS.has(hostname)
}

/** An exact Production or DEV customer action or portal URL. Anything else stays text. */
export function approvedCustomerMessageUrl(token: string): string | null {
  if (!token.startsWith("https://") || token.includes("\\") || /[\s<>"'`]/.test(token)) return null
  let url: URL
  try {
    url = new URL(token)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null
  if (url.port !== "" || url.search !== "" || url.hash !== "") return null
  if (!approvedCustomerHost(url.hostname)) return null
  if (!ACTION_PATH.test(url.pathname) && !PORTAL_PATH.test(url.pathname)) return null
  const canonical = `https://${url.hostname}${url.pathname}`
  return token === canonical ? canonical : null
}

export function messageTextParts(value: string): MessageTextPart[] {
  const parts: MessageTextPart[] = []
  const pattern = new RegExp(URL_TOKEN.source, "gi")
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    const href = approvedCustomerMessageUrl(match[0])
    if (!href) continue
    if (index > cursor) parts.push({ type: "text", value: value.slice(cursor, index) })
    parts.push({ type: "link", href })
    cursor = index + match[0].length
  }
  if (cursor < value.length || parts.length === 0) parts.push({ type: "text", value: value.slice(cursor) })
  return parts
}

function noteId(value: string): string {
  let hash = 0
  for (const char of value) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0
  return `case-note-${hash.toString(16)}`
}

export function groupCustomerMessages(threads: CustomerMessageThread[]): CustomerMessageGroup[] {
  const order: string[] = []
  const buckets = new Map<string, CustomerMessageThread[]>()
  for (const thread of threads) {
    const key = thread.caseReference ? `case:${thread.caseReference}` : "other"
    const bucket = buckets.get(key)
    if (bucket) bucket.push(thread)
    else {
      buckets.set(key, [thread])
      order.push(key)
    }
  }
  return order.map(key => {
    const items = [...(buckets.get(key) ?? [])].sort((left, right) => (
      left.activityAt < right.activityAt ? 1 : left.activityAt > right.activityAt ? -1 : 0
    ))
    const reference = items[0]?.caseReference ?? null
    const businessName = reference ? items.find(item => item.businessName)?.businessName ?? null : null
    const id = !reference ? "other-messages" : CASE_REF.test(reference) ? `case-${reference}` : noteId(reference)
    return {
      id,
      label: reference ? `Case ${reference}` : "Other messages",
      businessName,
      threads: items,
      latestActivityAt: items[0]?.activityAt ?? "",
    }
  }).sort((left, right) => {
    if (left.latestActivityAt !== right.latestActivityAt) return left.latestActivityAt < right.latestActivityAt ? 1 : -1
    return left.label < right.label ? -1 : left.label > right.label ? 1 : 0
  })
}

export function messageCountLabel(count: number, partial: boolean): string {
  const noun = count === 1 ? "message" : "messages"
  return partial ? `${count} ${noun} on this page` : `${count} ${noun}`
}

export function messagesArePartial(input: { earlier: boolean; complete: boolean }): boolean {
  return input.earlier || !input.complete
}

export function messagesReturnHref(search: string, groupId: string): string | null {
  if (search !== "" && !RETURN_SEARCH.test(search)) return null
  if (!RETURN_GROUP.test(groupId)) return null
  const href = `/portal/messages${search}#${groupId}`
  return RETURN_HREF.test(href) ? href : null
}

export function isMessagesReturnHref(value: string): boolean {
  return RETURN_HREF.test(value)
}

/** Storage for one message under one portal session. A direct link or another account does not match. */
export function messagesReturnStorageKey(portalContext: string, selector: string): string | null {
  if (!PORTAL_CONTEXT.test(portalContext) || !isMessageSelector(selector)) return null
  return `pr-messages-return:${portalContext}:${selector}`
}
