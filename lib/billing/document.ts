/**
 * One billing document for every ProfileRelaunch service.
 *
 * Quotations, invoices, payment receipts, recurring receipts and credit notes
 * share this model. A renderer draws it. The model does not look up a product
 * price and it does not recalculate a stored total. Callers pass the amounts
 * recorded on the quotation or the settled payment.
 *
 * Seller identity comes from the verified legal record supplied by the caller.
 * A missing VAT number stays missing. Historical receipt rows are not rewritten
 * here. A later change to the legal identity must select the identity that was
 * current at the transaction, which today is ProfileRelaunch Ltd as recorded
 * since incorporation on 14 October 2026.
 */
import { legalIdentity, registeredOfficeLines, type LegalIdentity } from "../legal"
import { formatMoney } from "../money"

export type BillingKind = "quotation" | "invoice" | "receipt" | "credit_note"
export type RecordedTax = "INCLUSIVE" | "EXCLUSIVE" | "NOT_APPLICABLE" | "UNCONFIRMED"
export type BillingStatus = "Proposed" | "Payment due" | "Paid" | "Credited"

export type BillingParty = {
  name: string
  lines: string[]
  email?: string
}

export type BillingLine = {
  description: string
  detail?: string
  quantity: string
  unitAmount: string
  amount: string
}

export type BillingRow = { label: string; value: string }

export type BillingDocument = {
  kind: BillingKind
  title: "Quotation" | "Invoice" | "Receipt" | "Credit note" | "VAT Invoice"
  reference: string
  issuedOn: string
  issuedOnLabel: string
  status: BillingStatus
  seller: BillingParty
  sellerMeta: string[]
  billTo: BillingParty
  currency: string
  lines: BillingLine[]
  totals: BillingRow[]
  details: BillingRow[]
  notes: string[]
}

export type SellerFacts = {
  legalName: string
  tradingName: string
  addressLines: string[]
  email?: string
  registrationNumber?: string
  placeOfRegistration?: string
  vatRegistered: boolean
  vatNumber?: string
}

export type BillingLineInput = {
  description: string
  detail?: string
  quantity: number
  unitAmountMinor: number
}

export type BillingDetailInput = { label: string; value: string }

export type BillingDocumentInput = {
  kind: BillingKind
  reference: string
  issuedOn: string
  currency: string
  seller: SellerFacts
  billTo: { name: string; lines?: string[]; email?: string }
  lines: BillingLineInput[]
  discountMinor?: number
  taxMinor?: number
  taxBehaviour: RecordedTax
  totalMinor: number
  details?: BillingDetailInput[]
}

export class BillingDocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BillingDocumentError"
  }
}

const REFERENCE = /^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/

export function sellerFromLegalIdentity(identity: LegalIdentity = legalIdentity): SellerFacts {
  if (!identity.legalName?.trim()) throw new BillingDocumentError("seller legal name is not recorded")
  return {
    legalName: identity.legalName.trim(),
    tradingName: identity.tradingName.trim(),
    addressLines: registeredOfficeLines(identity),
    email: identity.contactEmail?.trim() || undefined,
    registrationNumber: identity.registrationNumber?.trim() || undefined,
    placeOfRegistration: identity.placeOfRegistration?.trim() || undefined,
    vatRegistered: identity.vatRegistered === true,
    vatNumber: identity.vatNumber?.trim() || undefined,
  }
}

export function billingDateLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) throw new BillingDocumentError("document date is not recorded")
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)
}

export function billingDateTimeLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) throw new BillingDocumentError("document date is not recorded")
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
  return `${formatted} UK`
}

export function billingPeriodLabel(start: string, end: string): string {
  return `${billingDateLabel(start)} – ${billingDateLabel(end)}`
}

function money(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new BillingDocumentError("amount is not a recorded minor unit")
  if (!/^[A-Z]{3}$/.test(currency)) throw new BillingDocumentError("currency is not recorded")
  return formatMoney(minor, currency)
}

function cleanLine(value: string | undefined, label: string, max = 240): string | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) throw new BillingDocumentError(`${label} is too long`)
  return trimmed
}

function entitledToVatInvoice(seller: SellerFacts): boolean {
  return seller.vatRegistered && Boolean(seller.vatNumber)
}

function titleFor(kind: BillingKind, seller: SellerFacts): BillingDocument["title"] {
  if (kind === "invoice" && entitledToVatInvoice(seller)) return "VAT Invoice"
  if (kind === "invoice") return "Invoice"
  if (kind === "quotation") return "Quotation"
  if (kind === "credit_note") return "Credit note"
  return "Receipt"
}

function statusFor(kind: BillingKind): BillingStatus {
  if (kind === "quotation") return "Proposed"
  if (kind === "invoice") return "Payment due"
  if (kind === "credit_note") return "Credited"
  return "Paid"
}

function notesFor(kind: BillingKind, seller: SellerFacts): string[] {
  const notes: string[] = []
  if (kind === "quotation") notes.push("This quotation shows the proposed service and the agreed total.")
  if (kind === "invoice") notes.push("This invoice requests payment of the amount due. It does not confirm that payment has been received.")
  if (kind === "receipt") notes.push("This receipt confirms the amount received.")
  if (kind === "credit_note") notes.push("This credit note records a refund or adjustment. It does not change the original receipt.")
  if (kind === "invoice" && entitledToVatInvoice(seller)) return notes
  if (!seller.vatRegistered) notes.push("It is not a VAT invoice.")
  return notes
}

/**
 * Builds one document from recorded figures.
 * The arithmetic must already agree. This does not apply a catalogue price.
 */
export function buildBillingDocument(input: BillingDocumentInput): BillingDocument {
  if (!REFERENCE.test(input.reference)) throw new BillingDocumentError("document reference is not recorded")
  if (input.lines.length < 1) throw new BillingDocumentError("document has no service line")
  const currency = input.currency
  let subtotal = 0
  const lines: BillingLine[] = input.lines.map(line => {
    const description = cleanLine(line.description, "description")
    if (!description) throw new BillingDocumentError("service description is not recorded")
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 999) {
      throw new BillingDocumentError("quantity is not recorded")
    }
    const amountMinor = line.quantity * line.unitAmountMinor
    if (!Number.isSafeInteger(amountMinor)) throw new BillingDocumentError("line amount is not recorded")
    subtotal += amountMinor
    return {
      description,
      detail: cleanLine(line.detail, "line detail"),
      quantity: String(line.quantity),
      unitAmount: money(line.unitAmountMinor, currency),
      amount: money(amountMinor, currency),
    }
  })
  const discount = input.discountMinor ?? 0
  const tax = input.taxMinor ?? 0
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) throw new BillingDocumentError("discount does not match the recorded lines")
  if (!Number.isSafeInteger(tax) || tax < 0) throw new BillingDocumentError("tax is not recorded")
  const net = subtotal - discount
  if (input.taxBehaviour === "EXCLUSIVE") {
    if (net + tax !== input.totalMinor) throw new BillingDocumentError("total does not match the recorded lines")
  } else if (input.taxBehaviour === "INCLUSIVE") {
    if (net !== input.totalMinor || tax > input.totalMinor) throw new BillingDocumentError("total does not match the recorded lines")
  } else if (input.taxBehaviour === "NOT_APPLICABLE" || input.taxBehaviour === "UNCONFIRMED") {
    if (tax !== 0 || net !== input.totalMinor) throw new BillingDocumentError("total does not match the recorded lines")
    if (input.taxBehaviour === "UNCONFIRMED" && input.kind !== "quotation") throw new BillingDocumentError("tax treatment is not confirmed")
  } else {
    throw new BillingDocumentError("tax treatment is not recorded")
  }
  const seller = input.seller
  const billName = cleanLine(input.billTo.name, "bill to")
  if (!billName) throw new BillingDocumentError("bill to name is not recorded")
  const sellerLines = [
    seller.tradingName && seller.tradingName !== seller.legalName ? `Trading as ${seller.tradingName}` : "",
    ...seller.addressLines,
  ].filter(Boolean)
  const sellerMeta = [
    seller.registrationNumber ? `Company number ${seller.registrationNumber}` : "",
    seller.placeOfRegistration ? `Registered in ${seller.placeOfRegistration}` : "",
    entitledToVatInvoice(seller) && seller.vatNumber ? `VAT number ${seller.vatNumber}` : "",
  ].filter(Boolean)
  const totals: BillingRow[] = [
    { label: "Subtotal", value: money(subtotal, currency) },
  ]
  if (discount > 0) totals.push({ label: "Discount", value: money(discount, currency) })
  if (tax > 0) {
    const taxLabel = entitledToVatInvoice(seller) ? "VAT" : input.taxBehaviour === "INCLUSIVE" ? "Tax included" : "Tax recorded"
    totals.push({ label: taxLabel, value: money(tax, currency) })
  }
  totals.push({ label: "Total", value: money(input.totalMinor, currency) })
  if (input.kind === "receipt") {
    totals.push({ label: "Amount paid", value: money(input.totalMinor, currency) })
    totals.push({ label: "Outstanding", value: money(0, currency) })
  } else if (input.kind === "invoice") {
    totals.push({ label: "Amount paid", value: money(0, currency) })
    totals.push({ label: "Outstanding", value: money(input.totalMinor, currency) })
  } else if (input.kind === "quotation") {
    totals.push({ label: "Amount due", value: money(input.totalMinor, currency) })
  } else {
    totals.push({ label: "Amount credited", value: money(input.totalMinor, currency) })
  }
  const details = (input.details ?? []).flatMap(detail => {
    const label = cleanLine(detail.label, "detail")
    const value = cleanLine(detail.value, "detail", 400)
    if (!label || !value) return []
    return [{ label, value }]
  })
  return {
    kind: input.kind,
    title: titleFor(input.kind, seller),
    reference: input.reference,
    issuedOn: input.issuedOn,
    issuedOnLabel: billingDateLabel(input.issuedOn),
    status: statusFor(input.kind),
    seller: {
      name: seller.legalName,
      lines: sellerLines,
      email: cleanLine(seller.email, "seller email"),
    },
    sellerMeta,
    billTo: {
      name: billName,
      lines: (input.billTo.lines ?? []).map(line => cleanLine(line, "bill to") ?? "").filter(Boolean),
      email: cleanLine(input.billTo.email, "bill to email"),
    },
    currency,
    lines,
    totals,
    details,
    notes: notesFor(input.kind, seller),
  }
}

/** The financial lines a screen and a PDF must both show. */
export function billingComparableLines(document: BillingDocument): string[] {
  return [
    document.title,
    document.reference,
    document.status,
    document.issuedOnLabel,
    document.seller.name,
    ...document.seller.lines,
    ...document.sellerMeta,
    document.seller.email ?? "",
    document.billTo.name,
    ...document.billTo.lines,
    document.billTo.email ?? "",
    ...document.lines.flatMap(line => [line.description, line.detail ?? "", line.quantity, line.unitAmount, line.amount]),
    ...document.totals.flatMap(row => [row.label, row.value]),
    ...document.details.flatMap(row => [row.label, row.value]),
    ...document.notes,
  ].filter(line => line.length > 0)
}

export type UnsettledPaymentState = "DUE" | "COLLECTING" | "AUTHENTICATION_REQUIRED" | "FAILED" | "VOID" | "ACTION_REQUIRED" | "FINALIZATION_FAILED" | "PENDING"

/** A receipt exists only after the payment is settled. Pending and failed attempts are not receipts. */
export function settledReceipt<T>(state: string, build: () => T): T | null {
  if (state !== "PAID" && state !== "SUCCEEDED") return null
  return build()
}
