/**
 * Customer quotation presentation.
 *
 * Stored scope, exclusions, success definition and payment wording are shown
 * in full, once. A trailing standard-wording marker is the only scope text
 * omitted, and the stored snapshot is not changed. The short role lines are
 * not copies of that stored wording and do not replace it.
 */
import { formatMoney } from "../money"
import { customerFacingTaxNote } from "../pricing"
import { customerFacingScope, preservedPaymentTiming } from "./scope-templates"
import { customerFacingTerms } from "./agreement-render"

export const QUOTATION_ACCEPTANCE = "I have read this quotation and the agreement shown above, and I accept them for the service named in this quotation."

const WORK: Record<string, { provider: string; customer: string }> = {
  GUIDED_RELAUNCH: {
    provider: "Preparation of the relaunch pack for this location.",
    customer: "Filing that pack with Google is your step.",
  },
  GUIDED_REVIEW: {
    provider: "Preparation of the review pack for this location.",
    customer: "Filing that pack with Google is your step.",
  },
  MANAGED_RELAUNCH: {
    provider: "Case work on the profile restriction, once you have authorised it.",
    customer: "Your authorisation, and any access the case needs.",
  },
  MANAGED_REVIEW: {
    provider: "Case work on the specified review, once you have authorised it.",
    customer: "Your authorisation, and any access the case needs.",
  },
  RELAUNCH_GUARD: {
    provider: "Scheduled checks of this Business Profile, with an email if something needs attention.",
    customer: "Keeping the monitoring access in place.",
  },
}

const PAYMENT_BASIS = {
  UPFRONT: "Payable after acceptance, before work starts",
  SUCCESS_FEE: "Payable only after the agreed outcome",
  RECURRING_MONTHLY: "Billed monthly after monitoring starts",
} as const

export type QuotationPriceRow = { label: string; amount: string }

export type CustomerQuotationInput = {
  serviceCode: string
  serviceName: string
  paymentModel: string
  scope: string
  exclusions: string
  successDefinition: string
  paymentTiming: string
  termsReference: string
  standardAmountMinor: number
  discountAmountMinor: number
  quotedAmountMinor?: number
  taxBehaviour: string
  taxAmountMinor: number
  totalAmountMinor: number
  currency: string
}

export type CustomerQuotationPresentation = {
  providerWork: string
  customerWork: string
  scope: string
  exclusions: string
  successDefinition: string | null
  paymentBasis: string | null
  paymentWording: string
  terms: string | null
  priceRows: QuotationPriceRow[]
  total: string
  taxNote: string
  assurance: string | null
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function trimEnds(text: string): string {
  let start = 0
  let end = text.length
  while (start < end && (text[start] === " " || text[start] === "\n" || text[start] === "\t" || text[start] === "\r")) start += 1
  while (end > start && (text[end - 1] === " " || text[end - 1] === "\n" || text[end - 1] === "\t" || text[end - 1] === "\r")) end -= 1
  return text.slice(start, end)
}

function paymentBasisFor(input: CustomerQuotationInput): string | null {
  const stored = normalize(input.paymentTiming)
  const known = input.paymentModel === "UPFRONT"
    ? preservedPaymentTiming.UPFRONT
    : input.paymentModel === "SUCCESS_FEE"
      ? preservedPaymentTiming.SUCCESS_FEE
      : input.paymentModel === "RECURRING_MONTHLY"
        ? preservedPaymentTiming.RECURRING_MONTHLY
        : null
  if (!known || stored !== normalize(known)) return null
  const label = input.paymentModel === "UPFRONT"
    ? PAYMENT_BASIS.UPFRONT
    : input.paymentModel === "SUCCESS_FEE"
      ? PAYMENT_BASIS.SUCCESS_FEE
      : PAYMENT_BASIS.RECURRING_MONTHLY
  if (stored.toLowerCase().includes(label.toLowerCase())) return null
  return label
}

function assuranceFor(input: CustomerQuotationInput, paymentWording: string): string | null {
  if (input.paymentModel === "SUCCESS_FEE") {
    return "Accepting this quote does not create an invoice or outstanding debt."
  }
  if (input.serviceCode === "RELAUNCH_GUARD" && !normalize(paymentWording).toLowerCase().includes("does not start monitoring")) {
    return "Accepting this quote does not start monitoring."
  }
  return null
}

export function presentCustomerQuotation(input: CustomerQuotationInput): CustomerQuotationPresentation {
  const work = WORK[input.serviceCode] ?? {
    provider: input.serviceName,
    customer: "You provide accurate information about the business named in this quotation.",
  }
  const paymentWording = trimEnds(input.paymentTiming)
  const priceRows: QuotationPriceRow[] = []
  if (input.discountAmountMinor > 0) {
    priceRows.push({ label: "Standard price", amount: formatMoney(input.standardAmountMinor, input.currency) })
    priceRows.push({ label: "Discount", amount: formatMoney(input.discountAmountMinor, input.currency) })
  }
  if (input.taxAmountMinor > 0 && input.taxBehaviour === "EXCLUSIVE") {
    const beforeTax = input.quotedAmountMinor ?? input.totalAmountMinor - input.taxAmountMinor
    priceRows.push({ label: "Price before recorded tax", amount: formatMoney(beforeTax, input.currency) })
    priceRows.push({ label: "Recorded tax", amount: formatMoney(input.taxAmountMinor, input.currency) })
  } else if (input.taxAmountMinor > 0) {
    priceRows.push({ label: "Included in the total", amount: formatMoney(input.taxAmountMinor, input.currency) })
  }
  return {
    providerWork: work.provider,
    customerWork: work.customer,
    scope: customerFacingScope(input.scope),
    exclusions: trimEnds(input.exclusions),
    successDefinition: input.paymentModel === "SUCCESS_FEE" && trimEnds(input.successDefinition) ? trimEnds(input.successDefinition) : null,
    paymentBasis: paymentBasisFor(input),
    paymentWording,
    terms: customerFacingTerms(input.termsReference),
    priceRows,
    total: formatMoney(input.totalAmountMinor, input.currency),
    taxNote: customerFacingTaxNote(input.taxBehaviour),
    assurance: assuranceFor(input, paymentWording),
  }
}
