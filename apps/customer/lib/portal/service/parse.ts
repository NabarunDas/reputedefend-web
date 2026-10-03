/**
 * Strict reader for the customer service and permissions projection.
 * Unexpected keys, enums or shapes fail closed.
 */
import { isPublicCaseReference, SERVICE_TRACKS, type ServiceTrack } from "@/lib/portal/cases/parse"

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const SELECTOR = /^ca-[a-f0-9]{64}$/
const QUOTE_REF = /^QT-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const ORDER_REF = /^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const CURRENCY = /^[A-Z]{3}$/

const QUOTE_STATUSES = ["offered", "accepted", "declined", "expired", "unavailable"] as const
const TAX = ["UNCONFIRMED", "INCLUSIVE", "EXCLUSIVE", "NOT_APPLICABLE"] as const
const PAYMENT_NEXT = ["payment", "setup"] as const
const AGREEMENT_STATUSES = ["review", "accepted", "declined", "revoked", "review_required", "unavailable"] as const
const ACTION_KINDS = ["quote", "service_agreement", "case_permission", "revocation"] as const
const REVOCATION_TARGETS = ["service_agreement", "case_permission"] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]
export type TaxBehaviour = (typeof TAX)[number]
export type PaymentNext = (typeof PAYMENT_NEXT)[number]
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number]
export type ServiceActionKind = (typeof ACTION_KINDS)[number]
export type RevocationTarget = (typeof REVOCATION_TARGETS)[number]

export type ServiceCaseContext = {
  reference: string
  businessName: string
  locationName: string | null
  serviceTrack: ServiceTrack
}

export type ServiceQuote = {
  reference: string
  serviceName: string
  scope: string
  exclusions: string
  successDefinition: string
  standardAmountMinor: number
  discountAmountMinor: number
  quotedAmountMinor: number
  taxAmountMinor: number
  totalAmountMinor: number
  currency: string
  taxBehaviour: TaxBehaviour
  paymentTiming: string
  validUntil: string
  termsReference: string
  status: QuoteStatus
  orderReference: string | null
  acceptedAt: string | null
  paymentNext: PaymentNext | null
  canAccept: boolean
}

export type ServiceAgreement = {
  title: string
  body: string
  scope: string
  versionNumber: number
  status: AgreementStatus
  acceptedAt: string | null
  canAccept: boolean
  canDecline: boolean
}

export type ServiceAction = {
  selector: string
  kind: ServiceActionKind
  target: RevocationTarget | null
}

export type CustomerCaseService = {
  found: true
  case: ServiceCaseContext
  quote: ServiceQuote | null
  serviceAgreement: ServiceAgreement | null
  casePermission: ServiceAgreement | null
  actions: ServiceAction[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function sameKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every(key => present.includes(key))
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > max || trimmed !== value) return null
  return trimmed
}

function prose(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.trim().length < 1) return null
  return value
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && ISO_TIME.test(value) ? value : null
}

function optionalTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null
  return timestamp(value)
}

function minor(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null
}

function parseCase(value: unknown): ServiceCaseContext | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["reference", "businessName", "locationName", "serviceTrack"])) return null
  const reference = text(row.reference, 16)
  const businessName = text(row.businessName, 200)
  const locationName = row.locationName === null ? null : text(row.locationName, 200)
  const serviceTrack = oneOf(row.serviceTrack, SERVICE_TRACKS)
  if (!reference || !isPublicCaseReference(reference) || !businessName || locationName === undefined || !serviceTrack) return null
  return { reference, businessName, locationName, serviceTrack }
}

function parseQuote(value: unknown): ServiceQuote | null | undefined {
  if (value === null) return null
  const row = record(value)
  if (!row || !sameKeys(row, [
    "reference", "serviceName", "scope", "exclusions", "successDefinition",
    "standardAmountMinor", "discountAmountMinor", "quotedAmountMinor", "taxAmountMinor", "totalAmountMinor",
    "currency", "taxBehaviour", "paymentTiming", "validUntil", "termsReference", "status",
    "orderReference", "acceptedAt", "paymentNext", "canAccept",
  ])) return undefined
  const reference = text(row.reference, 16)
  const serviceName = text(row.serviceName, 200)
  const scope = prose(row.scope, 5000)
  const exclusions = prose(row.exclusions, 5000)
  const successDefinition = prose(row.successDefinition, 5000)
  const standardAmountMinor = minor(row.standardAmountMinor)
  const discountAmountMinor = minor(row.discountAmountMinor)
  const quotedAmountMinor = minor(row.quotedAmountMinor)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const totalAmountMinor = minor(row.totalAmountMinor)
  const currency = text(row.currency, 3)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const paymentTiming = prose(row.paymentTiming, 2000)
  const validUntil = timestamp(row.validUntil)
  const termsReference = prose(row.termsReference, 1000)
  const status = oneOf(row.status, QUOTE_STATUSES)
  const orderReference = row.orderReference === null ? null : text(row.orderReference, 16)
  const acceptedAt = optionalTimestamp(row.acceptedAt)
  const paymentNext = row.paymentNext === null ? null : oneOf(row.paymentNext, PAYMENT_NEXT)
  const canAccept = flag(row.canAccept)
  if (!reference || !QUOTE_REF.test(reference) || !serviceName || !scope || !exclusions || !successDefinition) return undefined
  if (standardAmountMinor === null || discountAmountMinor === null || quotedAmountMinor === null || taxAmountMinor === null || totalAmountMinor === null) return undefined
  if (!currency || !CURRENCY.test(currency) || !taxBehaviour || !paymentTiming || !validUntil || !termsReference || !status) return undefined
  if (orderReference === undefined || (orderReference !== null && !ORDER_REF.test(orderReference))) return undefined
  if (acceptedAt === undefined || paymentNext === undefined || canAccept === null) return undefined
  return {
    reference, serviceName, scope, exclusions, successDefinition,
    standardAmountMinor, discountAmountMinor, quotedAmountMinor, taxAmountMinor, totalAmountMinor,
    currency, taxBehaviour, paymentTiming, validUntil, termsReference, status,
    orderReference, acceptedAt, paymentNext, canAccept,
  }
}

function parseAgreement(value: unknown): ServiceAgreement | null | undefined {
  if (value === null) return null
  const row = record(value)
  if (!row || !sameKeys(row, ["title", "body", "scope", "versionNumber", "status", "acceptedAt", "canAccept", "canDecline"])) return undefined
  const title = text(row.title, 200)
  const body = prose(row.body, 50000)
  const scope = prose(row.scope, 5000)
  const versionNumber = typeof row.versionNumber === "number" && Number.isSafeInteger(row.versionNumber) && row.versionNumber > 0 ? row.versionNumber : null
  const status = oneOf(row.status, AGREEMENT_STATUSES)
  const acceptedAt = optionalTimestamp(row.acceptedAt)
  const canAccept = flag(row.canAccept)
  const canDecline = flag(row.canDecline)
  if (!title || !body || !scope || versionNumber === null || !status || acceptedAt === undefined || canAccept === null || canDecline === null) return undefined
  return { title, body, scope, versionNumber, status, acceptedAt, canAccept, canDecline }
}

function parseAction(value: unknown): ServiceAction | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["selector", "kind", "target"])) return null
  const selector = text(row.selector, 67)
  const kind = oneOf(row.kind, ACTION_KINDS)
  const target = row.target === null ? null : oneOf(row.target, REVOCATION_TARGETS)
  if (!selector || !SELECTOR.test(selector) || !kind || target === undefined) return null
  if (kind === "revocation" && target === null) return null
  if (kind !== "revocation" && target !== null) return null
  return { selector, kind, target }
}

export function parseCaseService(value: unknown): CustomerCaseService | "not_found" | null {
  const row = record(value)
  if (!row || !("found" in row) || row.found !== true && row.found !== false) return null
  if (row.found === false) return sameKeys(row, ["found"]) ? "not_found" : null
  if (!sameKeys(row, ["found", "case", "quote", "serviceAgreement", "casePermission", "actions"])) return null
  const item = parseCase(row.case)
  const quote = parseQuote(row.quote)
  const serviceAgreement = parseAgreement(row.serviceAgreement)
  const casePermission = parseAgreement(row.casePermission)
  if (!item || quote === undefined || serviceAgreement === undefined || casePermission === undefined || !Array.isArray(row.actions)) return null
  const actions: ServiceAction[] = []
  for (const action of row.actions) {
    const parsed = parseAction(action)
    if (!parsed) return null
    actions.push(parsed)
  }
  return { found: true, case: item, quote, serviceAgreement, casePermission, actions }
}
