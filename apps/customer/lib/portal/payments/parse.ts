/**
 * Strict reader for the customer payments projection.
 * Unexpected keys, enums or shapes fail closed. Provider identifiers are not
 * accepted, so a leaked field cannot be rendered.
 */
import { isPublicCaseReference, SERVICE_TRACKS, type ServiceTrack } from "@/lib/portal/cases/parse"

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const ACTION_SELECTOR = /^ca-[a-f0-9]{64}$/
const RECEIPT_SELECTOR = /^rc-[a-f0-9]{64}$/
const ORDER_REF = /^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const RECEIPT_REF = /^RC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const CURRENCY = /^[A-Z]{3}$/

const TAX = ["INCLUSIVE", "EXCLUSIVE", "NOT_APPLICABLE"] as const
const MODELS = ["UPFRONT", "SUCCESS_FEE", "RECURRING_MONTHLY"] as const
const OBLIGATION_KINDS = ["upfront", "success_fee"] as const
const OBLIGATION_STATES = ["DUE", "COLLECTING", "AUTHENTICATION_REQUIRED", "FAILED", "PAID", "VOID"] as const
const INVOICE_STATUSES = ["ISSUED", "PAID", "VOID"] as const
const ACTION_KINDS = ["guided_payment", "managed_setup", "recovery", "invoice"] as const

export type PaymentTax = (typeof TAX)[number]
export type PaymentModel = (typeof MODELS)[number]
export type ObligationKind = (typeof OBLIGATION_KINDS)[number]
export type ObligationState = (typeof OBLIGATION_STATES)[number]
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]
export type PaymentActionKind = (typeof ACTION_KINDS)[number]

export type PaymentInvoice = {
  status: InvoiceStatus
  hostedAvailable: boolean
}

export type PaymentObligation = {
  kind: ObligationKind
  state: ObligationState
  amountMinor: number
  currency: string
  taxBehaviour: PaymentTax
  taxAmountMinor: number
  invoice: PaymentInvoice | null
}

export type PaymentReceipt = {
  selector: string
  amountMinor: number
  currency: string
  taxBehaviour: PaymentTax
  taxAmountMinor: number
  paidAt: string
}

export type PaymentConsent = {
  recorded: boolean
  text: string | null
}

export type PaymentOrder = {
  orderRef: string
  serviceName: string
  amountMinor: number
  currency: string
  taxBehaviour: PaymentTax
  taxAmountMinor: number
  paymentModel: PaymentModel
  paymentMethodSaved: boolean
  consent: PaymentConsent | null
  consentOfferText: string | null
  obligations: PaymentObligation[]
  receipts: PaymentReceipt[]
}

export type PaymentAction = {
  selector: string
  kind: PaymentActionKind
  orderRef: string
}

export type PaymentCase = {
  reference: string
  businessName: string
  locationName: string | null
  serviceTrack: ServiceTrack
  orders: PaymentOrder[]
  actions: PaymentAction[]
}

export type CustomerPayments = { cases: PaymentCase[] }
export type CustomerCasePayments = { found: true; case: PaymentCase }

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

function parseInvoice(value: unknown): PaymentInvoice | null | undefined {
  if (value === null) return null
  const row = record(value)
  if (!row || !sameKeys(row, ["status", "hostedAvailable"])) return undefined
  const status = oneOf(row.status, INVOICE_STATUSES)
  const hostedAvailable = flag(row.hostedAvailable)
  if (!status || hostedAvailable === null) return undefined
  return { status, hostedAvailable }
}

function parseObligation(value: unknown): PaymentObligation | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["kind", "state", "amountMinor", "currency", "taxBehaviour", "taxAmountMinor", "invoice"])) return null
  const kind = oneOf(row.kind, OBLIGATION_KINDS)
  const state = oneOf(row.state, OBLIGATION_STATES)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const invoice = parseInvoice(row.invoice)
  if (!kind || !state || amountMinor === null || !unit || !taxBehaviour || taxAmountMinor === null || invoice === undefined) return null
  return { kind, state, amountMinor, currency: unit, taxBehaviour, taxAmountMinor, invoice }
}

function parseReceipt(value: unknown): PaymentReceipt | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["selector", "amountMinor", "currency", "taxBehaviour", "taxAmountMinor", "paidAt"])) return null
  const selector = text(row.selector, 80)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const paidAt = timestamp(row.paidAt)
  if (!selector || !RECEIPT_SELECTOR.test(selector) || amountMinor === null || !unit || !taxBehaviour || taxAmountMinor === null || !paidAt) return null
  return { selector, amountMinor, currency: unit, taxBehaviour, taxAmountMinor, paidAt }
}

function parseConsent(value: unknown): PaymentConsent | null | undefined {
  if (value === null) return null
  const row = record(value)
  if (!row || !sameKeys(row, ["recorded", "text"])) return undefined
  const recorded = flag(row.recorded)
  if (recorded === null) return undefined
  if (row.text === null) {
    if (recorded) return undefined
    return { recorded, text: null }
  }
  const body = prose(row.text, 5000)
  if (!body) return undefined
  return { recorded, text: body }
}

function parseOrder(value: unknown): PaymentOrder | null {
  const row = record(value)
  if (!row || !sameKeys(row, [
    "orderRef", "serviceName", "amountMinor", "currency", "taxBehaviour", "taxAmountMinor",
    "paymentModel", "paymentMethodSaved", "consent", "consentOfferText", "obligations", "receipts",
  ])) return null
  const orderRef = text(row.orderRef, 16)
  const serviceName = text(row.serviceName, 200)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const paymentModel = oneOf(row.paymentModel, MODELS)
  const paymentMethodSaved = flag(row.paymentMethodSaved)
  const consent = parseConsent(row.consent)
  const consentOfferText = row.consentOfferText === null ? null : prose(row.consentOfferText, 5000)
  if (!orderRef || !ORDER_REF.test(orderRef) || !serviceName || amountMinor === null || !unit || !taxBehaviour
    || taxAmountMinor === null || !paymentModel || paymentMethodSaved === null || consent === undefined
    || consentOfferText === undefined || !Array.isArray(row.obligations) || !Array.isArray(row.receipts)) return null
  const obligations = row.obligations.map(parseObligation)
  const receipts = row.receipts.map(parseReceipt)
  if (obligations.some(item => !item) || receipts.some(item => !item)) return null
  return {
    orderRef,
    serviceName,
    amountMinor,
    currency: unit,
    taxBehaviour,
    taxAmountMinor,
    paymentModel,
    paymentMethodSaved,
    consent,
    consentOfferText,
    obligations: obligations as PaymentObligation[],
    receipts: receipts as PaymentReceipt[],
  }
}

function parseAction(value: unknown): PaymentAction | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["selector", "kind", "orderRef"])) return null
  const selector = text(row.selector, 80)
  const kind = oneOf(row.kind, ACTION_KINDS)
  const orderRef = text(row.orderRef, 16)
  if (!selector || !ACTION_SELECTOR.test(selector) || !kind || !orderRef || !ORDER_REF.test(orderRef)) return null
  return { selector, kind, orderRef }
}

export function parsePaymentCase(value: unknown): PaymentCase | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["reference", "businessName", "locationName", "serviceTrack", "orders", "actions"])) return null
  const reference = text(row.reference, 16)
  const businessName = text(row.businessName, 200)
  const locationName = row.locationName === null ? null : text(row.locationName, 200)
  const serviceTrack = oneOf(row.serviceTrack, SERVICE_TRACKS)
  if (!reference || !isPublicCaseReference(reference) || !businessName || locationName === undefined || !serviceTrack
    || !Array.isArray(row.orders) || !Array.isArray(row.actions)) return null
  const orders = row.orders.map(parseOrder)
  const actions = row.actions.map(parseAction)
  if (orders.some(item => !item) || actions.some(item => !item)) return null
  return {
    reference,
    businessName,
    locationName,
    serviceTrack,
    orders: orders as PaymentOrder[],
    actions: actions as PaymentAction[],
  }
}

export function parsePayments(value: unknown): CustomerPayments | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["cases"]) || !Array.isArray(row.cases)) return null
  const cases = row.cases.map(parsePaymentCase)
  if (cases.some(item => !item)) return null
  return { cases: cases as PaymentCase[] }
}

export function parseCasePayments(value: unknown): CustomerCasePayments | "not_found" | null {
  const row = record(value)
  if (!row || !sameKeys(row, ["found", "case"]) && !sameKeys(row, ["found"])) return null
  if (row.found === false && sameKeys(row, ["found"])) return "not_found"
  if (row.found !== true || !sameKeys(row, ["found", "case"])) return null
  const item = parsePaymentCase(row.case)
  if (!item) return null
  return { found: true, case: item }
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null) return null
  return text(value, max) ?? undefined
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

function optionalMinor(value: unknown): number | null | undefined {
  if (value === null) return null
  const amount = minor(value)
  return amount === null ? undefined : amount
}

function optionalVatNumber(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === "string" && /^[A-Z0-9]{8,20}$/.test(value) ? value : undefined
}

export type ReceiptDownload = {
  receiptRef: string
  reference: string
  orderRef: string
  serviceName: string
  amountMinor: number
  currency: string
  taxBehaviour: PaymentTax
  taxAmountMinor: number
  paidAt: string
  paymentStatus: "Paid"
  providerLabel: "Card payment through Stripe"
  billToName: string
  billToEmail: string | null
  billToCountry: string | null
  contactName: string | null
  paymentModel: PaymentModel
  standardAmountMinor: number | null
  discountAmountMinor: number | null
  quotedSubtotalMinor: number | null
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

const RECEIPT_DOWNLOAD_KEYS = [
  "status", "receiptRef", "reference", "orderRef", "serviceName", "amountMinor", "currency",
  "taxBehaviour", "taxAmountMinor", "paidAt", "paymentStatus", "providerLabel",
  "billToName", "billToEmail", "billToCountry", "contactName", "paymentModel",
  "standardAmountMinor", "discountAmountMinor", "quotedSubtotalMinor",
  "sellerVatRegistered", "sellerVatNumber",
  "sellerLegalName", "sellerTradingName", "sellerAddress", "sellerEmail",
  "sellerRegistrationNumber", "sellerPlaceOfRegistration", "billToCaptured",
] as const

export function parseReceiptDownload(value: unknown): ReceiptDownload | "not_found" | null {
  const row = record(value)
  if (!row) return null
  if (sameKeys(row, ["status"]) && row.status === "not_found") return "not_found"
  if (!sameKeys(row, RECEIPT_DOWNLOAD_KEYS)) return null
  if (row.status !== "ok") return null
  const receiptRef = text(row.receiptRef, 16)
  const reference = text(row.reference, 16)
  const orderRef = text(row.orderRef, 16)
  const serviceName = text(row.serviceName, 200)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const paidAt = timestamp(row.paidAt)
  const paymentStatus = oneOf(row.paymentStatus, ["Paid"] as const)
  const providerLabel = oneOf(row.providerLabel, ["Card payment through Stripe"] as const)
  const billToName = text(row.billToName, 200)
  const billToEmail = optionalEmail(row.billToEmail)
  const billToCountry = optionalCountry(row.billToCountry)
  const contactName = optionalText(row.contactName, 200)
  const paymentModel = oneOf(row.paymentModel, MODELS)
  const standardAmountMinor = optionalMinor(row.standardAmountMinor)
  const discountAmountMinor = optionalMinor(row.discountAmountMinor)
  const quotedSubtotalMinor = optionalMinor(row.quotedSubtotalMinor)
  const sellerVatRegistered = flag(row.sellerVatRegistered)
  const sellerVatNumber = optionalVatNumber(row.sellerVatNumber)
  const sellerLegalName = text(row.sellerLegalName, 200)
  const sellerTradingName = text(row.sellerTradingName, 200)
  const sellerAddress = text(row.sellerAddress, 500)
  const sellerEmail = optionalEmail(row.sellerEmail)
  const sellerRegistrationNumber = optionalText(row.sellerRegistrationNumber, 40)
  const sellerPlaceOfRegistration = optionalText(row.sellerPlaceOfRegistration, 80)
  const billToCaptured = flag(row.billToCaptured)
  const prices = [standardAmountMinor, discountAmountMinor, quotedSubtotalMinor]
  const priceShape = prices.every(item => item === null) || prices.every(item => typeof item === "number")
  if (!receiptRef || !RECEIPT_REF.test(receiptRef) || !reference || !isPublicCaseReference(reference)
    || !orderRef || !ORDER_REF.test(orderRef) || receiptRef === orderRef || !serviceName
    || amountMinor === null || !unit || !taxBehaviour || taxAmountMinor === null || !paidAt
    || !paymentStatus || !providerLabel || !billToName || billToEmail === undefined || billToCountry === undefined
    || contactName === undefined || !paymentModel || standardAmountMinor === undefined
    || discountAmountMinor === undefined || quotedSubtotalMinor === undefined || !priceShape || sellerVatRegistered === null
    || sellerVatNumber === undefined || !sellerLegalName || !sellerTradingName || !sellerAddress
    || sellerEmail === undefined || sellerRegistrationNumber === undefined
    || sellerPlaceOfRegistration === undefined || billToCaptured === null) return null
  return {
    receiptRef, reference, orderRef, serviceName, amountMinor, currency: unit,
    taxBehaviour, taxAmountMinor, paidAt, paymentStatus, providerLabel,
    billToName, billToEmail, billToCountry, contactName, paymentModel,
    standardAmountMinor, discountAmountMinor, quotedSubtotalMinor,
    sellerVatRegistered, sellerVatNumber, sellerLegalName, sellerTradingName, sellerAddress,
    sellerEmail, sellerRegistrationNumber, sellerPlaceOfRegistration, billToCaptured,
  }
}
