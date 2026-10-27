/**
 * Turns a recorded quotation or settled payment into the shared document.
 * Prices are the amounts on that record. Catalogue prices are not applied.
 */
import {
  billingDateTimeLabel,
  billingPeriodLabel,
  buildBillingDocument,
  sellerFromLegalIdentity,
  settledReceipt,
  type BillingDetailInput,
  type BillingDocument,
  type BillingDocumentInput,
  type BillingLineInput,
  type RecordedTax,
  type SellerFacts,
} from "./document"

export type RecordedParty = {
  name: string
  email?: string | null
  countryCode?: string | null
  contactName?: string | null
}

export type RecordedPrice = {
  standardAmountMinor?: number | null
  discountAmountMinor?: number | null
  quotedSubtotalMinor?: number | null
}

const SAFE_REFERENCE = /^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/

function party(input: RecordedParty): BillingDocumentInput["billTo"] {
  const lines: string[] = []
  const contact = input.contactName?.trim()
  if (contact && contact !== input.name.trim()) lines.push(contact)
  const country = input.countryCode?.trim()
  if (country && /^[A-Z]{2}$/.test(country)) lines.push(`Country ${country}`)
  const email = input.email?.trim()
  return { name: input.name, lines, email: email || undefined }
}

function customerSafeReference(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || !SAFE_REFERENCE.test(trimmed)) return undefined
  return trimmed
}

function priceLines(
  serviceName: string,
  detail: string | undefined,
  amountMinor: number,
  taxBehaviour: RecordedTax,
  taxAmountMinor: number,
  price: RecordedPrice | undefined,
): { lines: BillingLineInput[]; discountMinor: number; taxMinor: number } {
  const standard = price?.standardAmountMinor
  const discount = price?.discountAmountMinor
  const subtotal = price?.quotedSubtotalMinor
  const discountKnown = typeof standard === "number" && typeof discount === "number" && typeof subtotal === "number"
    && standard === discount + subtotal
    && standard >= discount
  const netAgrees = discountKnown && (
    taxBehaviour === "EXCLUSIVE"
      ? subtotal + taxAmountMinor === amountMinor
      : subtotal === amountMinor
  )
  if (discountKnown && netAgrees && discount > 0) {
    return {
      lines: [{ description: serviceName, detail, quantity: 1, unitAmountMinor: standard }],
      discountMinor: discount,
      taxMinor: taxAmountMinor,
    }
  }
  if (taxBehaviour === "EXCLUSIVE" && taxAmountMinor > 0 && taxAmountMinor <= amountMinor) {
    return {
      lines: [{ description: serviceName, detail, quantity: 1, unitAmountMinor: amountMinor - taxAmountMinor }],
      discountMinor: 0,
      taxMinor: taxAmountMinor,
    }
  }
  if (taxBehaviour === "INCLUSIVE" && taxAmountMinor > 0 && taxAmountMinor <= amountMinor) {
    return {
      lines: [{ description: serviceName, detail, quantity: 1, unitAmountMinor: amountMinor }],
      discountMinor: 0,
      taxMinor: taxAmountMinor,
    }
  }
  return {
    lines: [{ description: serviceName, detail, quantity: 1, unitAmountMinor: amountMinor }],
    discountMinor: 0,
    taxMinor: 0,
  }
}

function lineDetail(parts: Array<string | undefined>): string | undefined {
  const detail = parts.filter((part): part is string => Boolean(part && part.trim())).join(". ")
  return detail || undefined
}

export function paymentReceiptDocument(input: {
  state: string
  reference: string
  issuedOn: string
  serviceName: string
  amountMinor: number
  currency: string
  taxBehaviour: RecordedTax
  taxAmountMinor: number
  paymentModel?: "UPFRONT" | "SUCCESS_FEE" | "RECURRING_MONTHLY" | null
  orderReference?: string | null
  caseReference?: string | null
  paymentMethod?: string | null
  billTo: RecordedParty
  seller?: SellerFacts
  price?: RecordedPrice | null
  periodStart?: string | null
  periodEnd?: string | null
  coveredLocation?: string | null
}): BillingDocument | null {
  return settledReceipt(input.state, () => {
    const period = input.periodStart && input.periodEnd ? billingPeriodLabel(input.periodStart, input.periodEnd) : undefined
    const detail = lineDetail([
      input.paymentModel === "SUCCESS_FEE" ? "Success fee" : undefined,
      input.paymentModel === "RECURRING_MONTHLY" ? "Monthly subscription" : undefined,
      period ? `Billing period ${period}` : undefined,
      input.coveredLocation ? `Covered location: ${input.coveredLocation}` : undefined,
    ])
    const priced = priceLines(input.serviceName, detail, input.amountMinor, input.taxBehaviour, input.taxAmountMinor, input.price ?? undefined)
    const details: BillingDetailInput[] = [
      { label: "Receipt", value: input.reference },
      { label: "Order", value: input.orderReference ?? "" },
      { label: "Case", value: input.caseReference ?? "" },
      { label: "Payment date", value: billingDateTimeLabel(input.issuedOn) },
      { label: "Payment method", value: input.paymentMethod ?? "" },
      { label: "Billing period", value: period ?? "" },
    ]
    return buildBillingDocument({
      kind: "receipt",
      reference: input.reference,
      issuedOn: input.issuedOn,
      currency: input.currency,
      seller: input.seller ?? sellerFromLegalIdentity(),
      billTo: party(input.billTo),
      lines: priced.lines,
      discountMinor: priced.discountMinor,
      taxMinor: priced.taxMinor,
      taxBehaviour: priced.taxMinor > 0 ? input.taxBehaviour : "NOT_APPLICABLE",
      totalMinor: input.amountMinor,
      details,
    })
  })
}

export function quotationDocument(input: {
  reference: string
  issuedOn: string
  serviceName: string
  currency: string
  taxBehaviour: RecordedTax
  taxAmountMinor: number
  totalMinor: number
  standardAmountMinor: number
  discountAmountMinor: number
  quotedSubtotalMinor: number
  billTo: RecordedParty
  seller?: SellerFacts
  caseReference?: string | null
  orderReference?: string | null
  validUntil?: string | null
  paymentModel?: "UPFRONT" | "SUCCESS_FEE" | "RECURRING_MONTHLY" | null
}): BillingDocument {
  const basis = input.paymentModel === "SUCCESS_FEE"
    ? "Success fee, payable only after the agreed outcome"
    : input.paymentModel === "RECURRING_MONTHLY"
      ? "Monthly subscription"
      : input.paymentModel === "UPFRONT"
        ? "Payable before the service starts"
        : undefined
  const priced = priceLines(input.serviceName, basis, input.totalMinor, input.taxBehaviour, input.taxAmountMinor, {
    standardAmountMinor: input.standardAmountMinor,
    discountAmountMinor: input.discountAmountMinor,
    quotedSubtotalMinor: input.quotedSubtotalMinor,
  })
  return buildBillingDocument({
    kind: "quotation",
    reference: input.reference,
    issuedOn: input.issuedOn,
    currency: input.currency,
    seller: input.seller ?? sellerFromLegalIdentity(),
    billTo: party(input.billTo),
    lines: priced.lines,
    discountMinor: priced.discountMinor,
    taxMinor: priced.taxMinor,
    taxBehaviour: input.taxBehaviour,
    totalMinor: input.totalMinor,
    details: [
      { label: "Quotation", value: input.reference },
      { label: "Case", value: input.caseReference ?? "" },
      { label: "Order", value: input.orderReference ?? "" },
      { label: "Valid until", value: input.validUntil ? billingDateTimeLabel(input.validUntil) : "" },
    ],
  })
}

export function invoiceDocument(input: {
  state: string
  reference: string
  issuedOn: string
  serviceName: string
  amountMinor: number
  currency: string
  taxBehaviour: RecordedTax
  taxAmountMinor: number
  billTo: RecordedParty
  seller?: SellerFacts
  orderReference?: string | null
  caseReference?: string | null
  price?: RecordedPrice | null
}): BillingDocument | null {
  if (input.state !== "ISSUED") return null
  const priced = priceLines(input.serviceName, undefined, input.amountMinor, input.taxBehaviour, input.taxAmountMinor, input.price ?? undefined)
  return buildBillingDocument({
    kind: "invoice",
    reference: input.reference,
    issuedOn: input.issuedOn,
    currency: input.currency,
    seller: input.seller ?? sellerFromLegalIdentity(),
    billTo: party(input.billTo),
    lines: priced.lines,
    discountMinor: priced.discountMinor,
    taxMinor: priced.taxMinor,
    taxBehaviour: priced.taxMinor > 0 ? input.taxBehaviour : "NOT_APPLICABLE",
    totalMinor: input.amountMinor,
    details: [
      { label: "Invoice", value: input.reference },
      { label: "Order", value: input.orderReference ?? "" },
      { label: "Case", value: input.caseReference ?? "" },
    ],
  })
}

export function creditNoteDocument(input: {
  state: string
  reference: string
  issuedOn: string
  serviceName: string
  amountMinor: number
  currency: string
  billTo: RecordedParty
  seller?: SellerFacts
  originalReference?: string | null
  caseReference?: string | null
  orderReference?: string | null
  periodStart?: string | null
  periodEnd?: string | null
}): BillingDocument | null {
  const period = input.periodStart && input.periodEnd ? billingPeriodLabel(input.periodStart, input.periodEnd) : undefined
  return settledReceipt(input.state, () => buildBillingDocument({
    kind: "credit_note",
    reference: input.reference,
    issuedOn: input.issuedOn,
    currency: input.currency,
    seller: input.seller ?? sellerFromLegalIdentity(),
    billTo: party(input.billTo),
    lines: [{
      description: input.serviceName,
      detail: lineDetail(["Refund or adjustment", period ? `Billing period ${period}` : undefined]),
      quantity: 1,
      unitAmountMinor: input.amountMinor,
    }],
    discountMinor: 0,
    taxMinor: 0,
    taxBehaviour: "NOT_APPLICABLE",
    totalMinor: input.amountMinor,
    details: [
      { label: "Credit note", value: input.reference },
      { label: "Original receipt", value: customerSafeReference(input.originalReference) ?? "" },
      { label: "Order", value: input.orderReference ?? "" },
      { label: "Case", value: input.caseReference ?? "" },
      { label: "Credit date", value: billingDateTimeLabel(input.issuedOn) },
      { label: "Billing period", value: period ?? "" },
    ],
  }))
}
