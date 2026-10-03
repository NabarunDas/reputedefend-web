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

export function parseReceiptDownload(value: unknown): {
  reference: string
  orderRef: string
  amountMinor: number
  currency: string
  taxBehaviour: PaymentTax
  taxAmountMinor: number
  paidAt: string
} | "not_found" | null {
  const row = record(value)
  if (!row) return null
  if (sameKeys(row, ["status"]) && row.status === "not_found") return "not_found"
  if (!sameKeys(row, ["status", "reference", "orderRef", "amountMinor", "currency", "taxBehaviour", "taxAmountMinor", "paidAt"])) return null
  if (row.status !== "ok") return null
  const reference = text(row.reference, 16)
  const orderRef = text(row.orderRef, 16)
  const amountMinor = minor(row.amountMinor)
  const unit = currency(row.currency)
  const taxBehaviour = oneOf(row.taxBehaviour, TAX)
  const taxAmountMinor = minor(row.taxAmountMinor)
  const paidAt = timestamp(row.paidAt)
  if (!reference || !isPublicCaseReference(reference) || !orderRef || !ORDER_REF.test(orderRef)
    || amountMinor === null || !unit || !taxBehaviour || taxAmountMinor === null || !paidAt) return null
  return { reference, orderRef, amountMinor, currency: unit, taxBehaviour, taxAmountMinor, paidAt }
}
