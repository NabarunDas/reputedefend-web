/**
 * Strict readers for billing documents.
 * A payload with an unexpected key, a provider identifier, or an unpaid
 * receipt shape is rejected. The renderer never sees it.
 */
import { isPublicCaseReference } from "@/lib/portal/cases/parse"

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const ORDER_REF = /^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const INVOICE_REF = /^IN-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const QUOTE_REF = /^QT-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const GUARD_REF = /^RG-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const CREDIT_REF = /^CN-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const GUARD_SELECTOR = /^(rg|cn|sc)-[a-f0-9]{64}$/
const CURRENCY = /^[A-Z]{3}$/
const TAX = ["INCLUSIVE", "EXCLUSIVE", "NOT_APPLICABLE"] as const
const MODELS = ["UPFRONT", "SUCCESS_FEE", "RECURRING_MONTHLY"] as const
const GUARD_KINDS = ["receipt", "credit_note"] as const

export type BillingTax = (typeof TAX)[number]
export type BillingModel = (typeof MODELS)[number]

type PartyFields = {
  billToName: string
  billToEmail: string | null
  billToCountry: string | null
  contactName: string | null
  sellerVatRegistered: boolean
  sellerVatNumber: string | null
  sellerLegalName: string
  sellerTradingName: string
  sellerAddress: string
  sellerEmail: string | null
  sellerRegistrationNumber: string | null
  sellerPlaceOfRegistration: string | null
  billToCaptured: boolean
}

type PriceFields = {
  standardAmountMinor: number | null
  discountAmountMinor: number | null
  quotedSubtotalMinor: number | null
}

export type InvoiceDocumentDownload = PartyFields & PriceFields & {
  invoiceRef: string
  reference: string
  orderRef: string
  serviceName: string
  amountMinor: number
  currency: string
  taxBehaviour: BillingTax
  taxAmountMinor: number
  issuedAt: string
}

export type QuotationDocumentDownload = PartyFields & {
  quoteRef: string
  reference: string
  orderRef: string | null
  serviceName: string
  currency: string
  taxBehaviour: BillingTax
  taxAmountMinor: number
  totalMinor: number
  standardAmountMinor: number
  discountAmountMinor: number
  quotedSubtotalMinor: number
  paymentModel: BillingModel
  issuedAt: string
  validUntil: string | null
}

export type GuardDocumentDownload = PartyFields & {
  kind: "receipt" | "credit_note"
  reference: string
  serviceName: string
  amountMinor: number
  currency: string
  issuedAt: string
  periodStart: string | null
  periodEnd: string | null
  relatedReference: string | null
  orderRef: string
  coveredLocation: string | null
  paymentSettled: boolean
}

export type GuardDocumentSummary = {
  kind: "receipt" | "credit_note"
  selector: string
  reference: string
  amountMinor: number
  currency: string
  issuedAt: string
  periodStart: string | null
  periodEnd: string | null
  relatedReference: string | null
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
  if (trimmed.length < 1 || trimmed.length > max) return null
  return trimmed
}

function timestamp(value: unknown): string | null {
  return typeof value === "string" && ISO_TIME.test(value) ? value : null
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

function currency(value: unknown): string | null {
  return typeof value === "string" && CURRENCY.test(value) ? value : null
}

function optionalEmail(value: unknown): string | null | undefined {
  if (value === null) return null
  const body = text(value, 200)
  if (!body || !/^[^\s@]+@[^\s@]+$/.test(body)) return undefined
  return body
}

function optionalCountry(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) ? value : undefined
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null
  return text(value, max) ?? undefined
}

function optionalMinor(value: unknown): number | null | undefined {
  if (value === null) return null
  const amount = minor(value)
  return amount === null ? undefined : amount
}

function optionalVatNumber(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === "string" && /^[A-Z0-9]{8,20}$/.test(value) ? value : undefined
}

function optionalTime(value: unknown): string | null | undefined {
  if (value === null) return null
  return timestamp(value) ?? undefined
}

function party(row: Record<string, unknown>): PartyFields | null {
  const billToName = text(row.billToName, 200)
  const billToEmail = optionalEmail(row.billToEmail)
  const billToCountry = optionalCountry(row.billToCountry)
  const contactName = optionalText(row.contactName, 200)
  const sellerVatRegistered = flag(row.sellerVatRegistered)
  const sellerVatNumber = optionalVatNumber(row.sellerVatNumber)
  const sellerLegalName = text(row.sellerLegalName, 200)
  const sellerTradingName = text(row.sellerTradingName, 200)
  const sellerAddress = text(row.sellerAddress, 500)
  const sellerEmail = optionalEmail(row.sellerEmail)
  const sellerRegistrationNumber = optionalText(row.sellerRegistrationNumber, 40)
  const sellerPlaceOfRegistration = optionalText(row.sellerPlaceOfRegistration, 80)
  const billToCaptured = flag(row.billToCaptured)
  if (!billToName || billToEmail === undefined || billToCountry === undefined || contactName === undefined
    || sellerVatRegistered === null || sellerVatNumber === undefined || !sellerLegalName || !sellerTradingName
    || !sellerAddress || sellerEmail === undefined || sellerRegistrationNumber === undefined
    || sellerPlaceOfRegistration === undefined || billToCaptured === null) return null
  return {
    billToName, billToEmail, billToCountry, contactName, sellerVatRegistered, sellerVatNumber,
    sellerLegalName, sellerTradingName, sellerAddress, sellerEmail, sellerRegistrationNumber,
    sellerPlaceOfRegistration, billToCaptured,
  }
}

function prices(row: Record<string, unknown>): PriceFields | null {
  const standardAmountMinor = optionalMinor(row.standardAmountMinor)
  const discountAmountMinor = optionalMinor(row.discountAmountMinor)
  const quotedSubtotalMinor = optionalMinor(row.quotedSubtotalMinor)
  if (standardAmountMinor === undefined || discountAmountMinor === undefined || quotedSubtotalMinor === undefined) return null
  const group = [standardAmountMinor, discountAmountMinor, quotedSubtotalMinor]
  if (!(group.every(item => item === null) || group.every(item => typeof item === "number"))) return null
  return { standardAmountMinor, discountAmountMinor, quotedSubtotalMinor }
}

const INVOICE_KEYS = [
  "status", "invoiceRef", "reference", "orderRef", "serviceName", "amountMinor", "currency",
  "taxBehaviour", "taxAmountMinor", "issuedAt", "billToName", "billToEmail", "billToCountry",
  "contactName", "standardAmountMinor", "discountAmountMinor", "quotedSubtotalMinor",
  "sellerVatRegistered", "sellerVatNumber",
  "sellerLegalName", "sellerTradingName", "sellerAddress", "sellerEmail",
  "sellerRegistrationNumber", "sellerPlaceOfRegistration", "billToCaptured",
] as const

export function parseInvoiceDocument(value: unknown): InvoiceDocumentDownload | "not_found" | "collection_paused" | null {
  const row = record(value)
  if (!row) return null
  if (sameKeys(row, ["status"]) && row.status === "not_found") return "not_found"
  if (sameKeys(row, ["status"]) && row.status === "collection_paused") return "collection_paused"
  if (!sameKeys(row, INVOICE_KEYS) || row.status !== "ok") return null
  const invoiceRef = text(row.invoiceRef, 16)
  const reference = text(row.reference, 16)
  const orderRef = text(row.orderRef, 16)
  const serviceName = text(row.serviceName, 200)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const issuedAt = timestamp(row.issuedAt)
  const who = party(row)
  const price = prices(row)
  if (!invoiceRef || !INVOICE_REF.test(invoiceRef) || !reference || !isPublicCaseReference(reference)
    || !orderRef || !ORDER_REF.test(orderRef) || !serviceName || amountMinor === null || !unit
    || !taxBehaviour || taxAmountMinor === null || !issuedAt || !who || !price) return null
  return { invoiceRef, reference, orderRef, serviceName, amountMinor, currency: unit, taxBehaviour, taxAmountMinor, issuedAt, ...who, ...price }
}

const QUOTATION_KEYS = [
  "status", "quoteRef", "reference", "orderRef", "serviceName", "currency", "taxBehaviour",
  "taxAmountMinor", "totalMinor", "standardAmountMinor", "discountAmountMinor", "quotedSubtotalMinor",
  "paymentModel", "issuedAt", "validUntil", "billToName", "billToEmail", "billToCountry",
  "contactName", "sellerVatRegistered", "sellerVatNumber",
  "sellerLegalName", "sellerTradingName", "sellerAddress", "sellerEmail",
  "sellerRegistrationNumber", "sellerPlaceOfRegistration", "billToCaptured",
] as const

export function parseQuotationDocument(value: unknown): QuotationDocumentDownload | "not_found" | null {
  const row = record(value)
  if (!row) return null
  if (sameKeys(row, ["status"]) && row.status === "not_found") return "not_found"
  if (!sameKeys(row, QUOTATION_KEYS) || row.status !== "ok") return null
  const quoteRef = text(row.quoteRef, 16)
  const reference = text(row.reference, 16)
  const orderRef = row.orderRef === null ? null : text(row.orderRef, 16)
  const serviceName = text(row.serviceName, 200)
  const unit = currency(row.currency)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const totalMinor = minor(row.totalMinor)
  const standardAmountMinor = minor(row.standardAmountMinor)
  const discountAmountMinor = minor(row.discountAmountMinor)
  const quotedSubtotalMinor = minor(row.quotedSubtotalMinor)
  const paymentModel = oneOf(row.paymentModel, MODELS)
  const issuedAt = timestamp(row.issuedAt)
  const validUntil = optionalTime(row.validUntil)
  const who = party(row)
  if (!quoteRef || !QUOTE_REF.test(quoteRef) || !reference || !isPublicCaseReference(reference)
    || orderRef === undefined || (orderRef !== null && !ORDER_REF.test(orderRef)) || !serviceName || !unit
    || !taxBehaviour || taxAmountMinor === null || totalMinor === null || standardAmountMinor === null
    || discountAmountMinor === null || quotedSubtotalMinor === null || !paymentModel || !issuedAt
    || validUntil === undefined || !who) return null
  return {
    quoteRef, reference, orderRef, serviceName, currency: unit, taxBehaviour, taxAmountMinor, totalMinor,
    standardAmountMinor, discountAmountMinor, quotedSubtotalMinor, paymentModel, issuedAt, validUntil, ...who,
  }
}

const GUARD_KEYS = [
  "status", "kind", "reference", "serviceName", "amountMinor", "currency", "issuedAt",
  "periodStart", "periodEnd", "relatedReference", "orderRef", "coveredLocation",
  "billToName", "billToEmail", "billToCountry", "contactName", "sellerVatRegistered", "sellerVatNumber",
  "sellerLegalName", "sellerTradingName", "sellerAddress", "sellerEmail",
  "sellerRegistrationNumber", "sellerPlaceOfRegistration", "billToCaptured", "paymentSettled",
] as const

export function parseGuardDocument(value: unknown): GuardDocumentDownload | "not_found" | null {
  const row = record(value)
  if (!row) return null
  if (sameKeys(row, ["status"]) && row.status === "not_found") return "not_found"
  if (!sameKeys(row, GUARD_KEYS) || row.status !== "ok") return null
  const kind = oneOf(row.kind, GUARD_KINDS)
  const reference = text(row.reference, 16)
  const serviceName = text(row.serviceName, 200)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const issuedAt = timestamp(row.issuedAt)
  const periodStart = optionalTime(row.periodStart)
  const periodEnd = optionalTime(row.periodEnd)
  const relatedReference = row.relatedReference === null ? null : text(row.relatedReference, 16)
  const orderRef = text(row.orderRef, 16)
  const coveredLocation = optionalText(row.coveredLocation, 200)
  const paymentSettled = flag(row.paymentSettled)
  const who = party(row)
  const referenceOk = kind === "receipt" ? !!reference && GUARD_REF.test(reference) : !!reference && CREDIT_REF.test(reference)
  const relatedOk = relatedReference === null || (relatedReference !== undefined && GUARD_REF.test(relatedReference))
  const periodOk = (periodStart === null && periodEnd === null) || (typeof periodStart === "string" && typeof periodEnd === "string")
  if (!kind || !reference || !referenceOk || !serviceName || amountMinor === null || !unit || !issuedAt
    || periodStart === undefined || periodEnd === undefined || !periodOk || relatedReference === undefined || !relatedOk
    || !orderRef || !ORDER_REF.test(orderRef) || coveredLocation === undefined || paymentSettled === null || !who) return null
  return {
    kind, reference, serviceName, amountMinor, currency: unit, issuedAt, periodStart, periodEnd,
    relatedReference, orderRef, coveredLocation, paymentSettled, ...who,
  }
}

const SUMMARY_KEYS = [
  "kind", "selector", "reference", "amountMinor", "currency", "issuedAt",
  "periodStart", "periodEnd", "relatedReference",
] as const

function parseSummary(value: unknown): GuardDocumentSummary | null {
  const row = record(value)
  if (!row || !sameKeys(row, SUMMARY_KEYS)) return null
  const kind = oneOf(row.kind, GUARD_KINDS)
  const selector = text(row.selector, 80)
  const reference = text(row.reference, 16)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const issuedAt = timestamp(row.issuedAt)
  const periodStart = optionalTime(row.periodStart)
  const periodEnd = optionalTime(row.periodEnd)
  const relatedReference = row.relatedReference === null ? null : text(row.relatedReference, 16)
  const referenceOk = kind === "receipt" ? !!reference && GUARD_REF.test(reference) : !!reference && CREDIT_REF.test(reference)
  const relatedOk = relatedReference === null || (relatedReference !== undefined && GUARD_REF.test(relatedReference))
  if (!kind || !reference || !selector || !GUARD_SELECTOR.test(selector) || !referenceOk || amountMinor === null || !unit || !issuedAt
    || periodStart === undefined || periodEnd === undefined || relatedReference === undefined || !relatedOk) return null
  if (kind === "receipt" && !selector.startsWith("rg-")) return null
  if (kind === "credit_note" && selector.startsWith("rg-")) return null
  return { kind, selector, reference, amountMinor, currency: unit, issuedAt, periodStart, periodEnd, relatedReference }
}

export function parseGuardDocuments(value: unknown): { documents: GuardDocumentSummary[] } | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["documents"]) || !Array.isArray(row.documents)) return null
  const documents: GuardDocumentSummary[] = []
  for (const item of row.documents) {
    const parsed = parseSummary(item)
    if (!parsed) return null
    documents.push(parsed)
  }
  return { documents }
}
