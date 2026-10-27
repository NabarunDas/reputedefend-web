import { BillingDocumentError, type BillingDocument, type SellerFacts } from "../../../../../lib/billing/document"
import {
  creditNoteDocument,
  invoiceDocument,
  paymentReceiptDocument,
  quotationDocument,
} from "../../../../../lib/billing/recorded"
import type { ReceiptDownload } from "../payments/parse"
import type { GuardDocumentDownload, InvoiceDocumentDownload, QuotationDocumentDownload } from "./parse"

function seller(record: {
  sellerLegalName: string
  sellerTradingName: string
  sellerAddress: string
  sellerEmail: string | null
  sellerRegistrationNumber: string | null
  sellerPlaceOfRegistration: string | null
  sellerVatRegistered: boolean
  sellerVatNumber: string | null
}): SellerFacts {
  const legalName = record.sellerLegalName.trim()
  if (!legalName) throw new BillingDocumentError("seller legal name is not recorded")
  const tradingName = record.sellerTradingName.trim() || legalName
  return {
    legalName,
    tradingName,
    addressLines: record.sellerAddress.split("\n").map(line => line.trim()).filter(Boolean),
    email: record.sellerEmail?.trim() || undefined,
    registrationNumber: record.sellerRegistrationNumber?.trim() || undefined,
    placeOfRegistration: record.sellerPlaceOfRegistration?.trim() || undefined,
    vatRegistered: record.sellerVatRegistered,
    vatNumber: record.sellerVatNumber ?? undefined,
  }
}

function party(record: { billToName: string; billToEmail: string | null; billToCountry: string | null; contactName: string | null }) {
  return {
    name: record.billToName,
    email: record.billToEmail,
    countryCode: record.billToCountry,
    contactName: record.contactName,
  }
}

export function documentFromReceipt(receipt: ReceiptDownload): BillingDocument | null {
  return paymentReceiptDocument({
    state: "PAID",
    reference: receipt.receiptRef,
    issuedOn: receipt.paidAt,
    serviceName: receipt.serviceName,
    amountMinor: receipt.amountMinor,
    currency: receipt.currency,
    taxBehaviour: receipt.taxBehaviour,
    taxAmountMinor: receipt.taxAmountMinor,
    paymentModel: receipt.paymentModel,
    orderReference: receipt.orderRef,
    caseReference: receipt.reference,
    paymentMethod: receipt.providerLabel,
    billTo: party(receipt),
    seller: seller(receipt),
    price: {
      standardAmountMinor: receipt.standardAmountMinor,
      discountAmountMinor: receipt.discountAmountMinor,
      quotedSubtotalMinor: receipt.quotedSubtotalMinor,
    },
  })
}

export function documentFromInvoice(invoice: InvoiceDocumentDownload): BillingDocument | null {
  return invoiceDocument({
    state: "ISSUED",
    reference: invoice.invoiceRef,
    issuedOn: invoice.issuedAt,
    serviceName: invoice.serviceName,
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    taxBehaviour: invoice.taxBehaviour,
    taxAmountMinor: invoice.taxAmountMinor,
    billTo: party(invoice),
    seller: seller(invoice),
    orderReference: invoice.orderRef,
    caseReference: invoice.reference,
    price: {
      standardAmountMinor: invoice.standardAmountMinor,
      discountAmountMinor: invoice.discountAmountMinor,
      quotedSubtotalMinor: invoice.quotedSubtotalMinor,
    },
  })
}

export function documentFromQuotation(quote: QuotationDocumentDownload): BillingDocument {
  return quotationDocument({
    reference: quote.quoteRef,
    issuedOn: quote.issuedAt,
    serviceName: quote.serviceName,
    currency: quote.currency,
    taxBehaviour: quote.taxBehaviour,
    taxAmountMinor: quote.taxAmountMinor,
    totalMinor: quote.totalMinor,
    standardAmountMinor: quote.standardAmountMinor,
    discountAmountMinor: quote.discountAmountMinor,
    quotedSubtotalMinor: quote.quotedSubtotalMinor,
    billTo: party(quote),
    seller: seller(quote),
    caseReference: quote.reference,
    orderReference: quote.orderRef,
    validUntil: quote.validUntil,
    paymentModel: quote.paymentModel,
  })
}

export function documentFromGuard(row: GuardDocumentDownload): BillingDocument | null {
  if (row.kind === "credit_note") {
    return creditNoteDocument({
      state: "SUCCEEDED",
      reference: row.reference,
      issuedOn: row.issuedAt,
      serviceName: row.serviceName,
      amountMinor: row.amountMinor,
      currency: row.currency,
      billTo: party(row),
      seller: seller(row),
      originalReference: row.relatedReference,
      orderReference: row.orderRef,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
    })
  }
  return paymentReceiptDocument({
    state: "PAID",
    reference: row.reference,
    issuedOn: row.issuedAt,
    serviceName: row.serviceName,
    amountMinor: row.amountMinor,
    currency: row.currency,
    taxBehaviour: "NOT_APPLICABLE",
    taxAmountMinor: 0,
    paymentModel: "RECURRING_MONTHLY",
    orderReference: row.orderRef,
    paymentMethod: "Card payment through Stripe",
    billTo: party(row),
    seller: seller(row),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    coveredLocation: row.coveredLocation,
    paymentSettled: row.paymentSettled,
  })
}
