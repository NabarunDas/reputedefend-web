/**
 * Strict reader for the customer message projection.
 * Unexpected keys fail closed so an internal identifier cannot be rendered.
 */

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
export const MESSAGE_SELECTOR = /^(mc|mm)-[a-f0-9]{64}$/

export const MESSAGE_STATES = [
  "Open conversation",
  "Previous conversation",
  "Message from ProfileRelaunch",
] as const

export const MESSAGE_ROLES = ["ProfileRelaunch", "You"] as const

export const DELIVERY_LABELS = [
  "Delivered by email",
  "Accepted by the email provider. Delivery is not confirmed.",
] as const

export type MessageState = (typeof MESSAGE_STATES)[number]
export type MessageRole = (typeof MESSAGE_ROLES)[number]
export type DeliveryLabel = (typeof DELIVERY_LABELS)[number]

const THREAD_REQUIRED = ["selector", "subject", "activityAt", "state", "preview"] as const
const THREAD_OPTIONAL = ["caseReference", "businessName", "locationName"] as const
const ENTRY_REQUIRED = ["role", "at", "body"] as const
const ENTRY_OPTIONAL = ["subject", "delivery"] as const

export type CustomerMessageEntry = {
  role: MessageRole
  at: string
  subject: string | null
  body: string
  delivery: DeliveryLabel | null
}

export type CustomerMessageThread = {
  selector: string
  subject: string
  caseReference: string | null
  businessName: string | null
  locationName: string | null
  activityAt: string
  state: MessageState
  preview: string
}

export type CustomerMessagePage = {
  threads: CustomerMessageThread[]
  complete: boolean
  nextCursor: { activityAt: string; selector: string } | null
}

export type CustomerMessageDetail = CustomerMessageThread & {
  entries: CustomerMessageEntry[]
  complete: boolean
}

export type MessagesQuery = {
  before: string | null
  selector: string | null
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function allowed(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]) {
  const keys = Object.keys(value)
  if (required.some(key => !keys.includes(key))) return false
  return keys.every(key => (required as readonly string[]).includes(key) || (optional as readonly string[]).includes(key))
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? value as T : null
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value : null
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_TIME.test(value) || Number.isNaN(Date.parse(value))) return null
  return value
}

function optionalText(row: Record<string, unknown>, key: string, max: number): string | null | undefined {
  if (!(key in row)) return null
  return text(row[key], max)
}

export function isMessageSelector(value: string): boolean {
  return MESSAGE_SELECTOR.test(value)
}

function parseThread(value: unknown): CustomerMessageThread | null {
  const row = record(value)
  if (!row || !allowed(row, THREAD_REQUIRED, THREAD_OPTIONAL)) return null
  const selector = text(row.selector, 67)
  const subject = text(row.subject, 500)
  const activityAt = timestamp(row.activityAt)
  const state = oneOf(row.state, MESSAGE_STATES)
  const preview = text(row.preview, 180)
  const caseReference = optionalText(row, "caseReference", 40)
  const businessName = optionalText(row, "businessName", 200)
  const locationName = optionalText(row, "locationName", 200)
  if (!selector || !isMessageSelector(selector) || !subject || !activityAt || !state || !preview) return null
  if (caseReference === undefined || businessName === undefined || locationName === undefined) return null
  return { selector, subject, caseReference, businessName, locationName, activityAt, state, preview }
}

function parseEntry(value: unknown): CustomerMessageEntry | null {
  const row = record(value)
  if (!row || !allowed(row, ENTRY_REQUIRED, ENTRY_OPTIONAL)) return null
  const role = oneOf(row.role, MESSAGE_ROLES)
  const at = timestamp(row.at)
  const body = text(row.body, 200000)
  const subject = optionalText(row, "subject", 500)
  if (!role || !at || !body || subject === undefined) return null
  let delivery: DeliveryLabel | null = null
  if ("delivery" in row) {
    delivery = oneOf(row.delivery, DELIVERY_LABELS)
    if (!delivery) return null
  }
  return { role, at, subject, body, delivery }
}

export function parseMessagePage(value: unknown): CustomerMessagePage | null {
  const row = record(value)
  if (!row || !allowed(row, ["threads", "complete"], ["nextCursor"])) return null
  if (typeof row.complete !== "boolean" || !Array.isArray(row.threads) || row.threads.length > 20) return null
  const threads: CustomerMessageThread[] = []
  for (const item of row.threads) {
    const parsed = parseThread(item)
    if (!parsed) return null
    threads.push(parsed)
  }
  if (row.complete) {
    if ("nextCursor" in row) return null
    return { threads, complete: true, nextCursor: null }
  }
  if (threads.length !== 20) return null
  const cursor = record(row.nextCursor)
  if (!cursor || !allowed(cursor, ["activityAt", "selector"], [])) return null
  const activityAt = timestamp(cursor.activityAt)
  const selector = text(cursor.selector, 67)
  if (!activityAt || !selector || !isMessageSelector(selector)) return null
  if (threads[19].activityAt !== activityAt || threads[19].selector !== selector) return null
  return { threads, complete: false, nextCursor: { activityAt, selector } }
}

export function parseMessageDetail(value: unknown): { found: true; thread: CustomerMessageDetail } | { found: false } | null {
  const row = record(value)
  if (!row) return null
  if (row.found === false) {
    if (!allowed(row, ["found"], [])) return null
    return { found: false }
  }
  if (!allowed(row, ["found", "thread"], []) || row.found !== true) return null
  const thread = record(row.thread)
  if (!thread || !allowed(thread, [...THREAD_REQUIRED, "entries", "complete"], THREAD_OPTIONAL)) return null
  if (typeof thread.complete !== "boolean" || !Array.isArray(thread.entries) || thread.entries.length > 50) return null
  const base = parseThread({
    selector: thread.selector,
    subject: thread.subject,
    activityAt: thread.activityAt,
    state: thread.state,
    preview: thread.preview,
    ...("caseReference" in thread ? { caseReference: thread.caseReference } : {}),
    ...("businessName" in thread ? { businessName: thread.businessName } : {}),
    ...("locationName" in thread ? { locationName: thread.locationName } : {}),
  })
  if (!base) return null
  const entries: CustomerMessageEntry[] = []
  for (const item of thread.entries) {
    const parsed = parseEntry(item)
    if (!parsed) return null
    entries.push(parsed)
  }
  if (entries.length === 0) return null
  if (thread.complete && entries.length > 50) return null
  if (!thread.complete && entries.length !== 50) return null
  return { found: true, thread: { ...base, entries, complete: thread.complete } }
}

export function parseMessagesRequest(params: Record<string, string | string[] | undefined>): MessagesQuery | null {
  const beforeRaw = params.before
  const selectorRaw = params.selector
  if (Array.isArray(beforeRaw) || Array.isArray(selectorRaw)) return null
  if ((beforeRaw === undefined) !== (selectorRaw === undefined)) return null
  if (beforeRaw === undefined || selectorRaw === undefined) return { before: null, selector: null }
  if (!ISO_TIME.test(beforeRaw) || Number.isNaN(Date.parse(beforeRaw)) || !isMessageSelector(selectorRaw)) return null
  return { before: beforeRaw, selector: selectorRaw }
}
