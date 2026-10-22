/**
 * Customer quotation presentation.
 *
 * The stored scope, exclusions, success definition and payment wording are
 * shown in full. A trailing standard-wording marker is the only scope text
 * omitted, and the stored snapshot is not changed. The overview is labelled
 * as an explanation. It is not a substitute for those terms, and it is not
 * produced by deleting sentences from them.
 */
import { formatMoney } from "../money"
import { customerFacingTaxNote } from "../pricing"
import {
  customerFacingScope,
  preservedPaymentTiming,
  publishedGuardLead,
  publishedGuidedCopy,
  publishedGuidedLine,
  publishedManagedCopy,
  publishedManagedLine,
} from "./scope-templates"
import { customerFacingTerms } from "./agreement-render"

const OVERVIEW: Record<string, string> = {
  GUIDED_RELAUNCH: `${publishedGuidedLine} ${publishedGuidedCopy}`,
  GUIDED_REVIEW: `${publishedGuidedLine} ${publishedGuidedCopy}`,
  MANAGED_RELAUNCH: `${publishedManagedLine} ${publishedManagedCopy}`,
  MANAGED_REVIEW: `${publishedManagedLine} ${publishedManagedCopy}`,
  RELAUNCH_GUARD: publishedGuardLead,
}

export const QUOTATION_OVERVIEW_NOTE = "This overview explains the service. It is not a substitute for the scope and exclusions below, which are the terms of this quotation."

export const QUOTATION_ACCEPTANCE = "I have read this quotation and the agreement shown above, and I accept them for the service named in this quotation."

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
  overviewNote: string
  overview: string
  responsibilities: string
  scope: string
  exclusions: string
  successDefinition: string | null
  paymentSummary: string | null
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

export function customerResponsibilities(serviceCode: string): string {
  if (serviceCode === "GUIDED_RELAUNCH" || serviceCode === "GUIDED_REVIEW") {
    return `${publishedGuidedLine} ${publishedGuidedCopy}`
  }
  if (serviceCode === "MANAGED_RELAUNCH" || serviceCode === "MANAGED_REVIEW") {
    return `${publishedManagedLine} ${publishedManagedCopy} Where this service needs access to the Business Profile, you add ProfileRelaunch as a Manager. You remain the owner. You do not give ProfileRelaunch your Google password or access to your email.`
  }
  if (serviceCode === "RELAUNCH_GUARD") {
    return "You remain the owner of the Business Profile. Where monitoring needs access, you add ProfileRelaunch as a Manager. You do not give ProfileRelaunch your Google password or access to your email."
  }
  return "You give accurate information about the business named in this quotation, and you remain responsible for what you publish."
}

export function quotationPaymentLine(input: Pick<CustomerQuotationInput, "paymentModel" | "paymentTiming" | "totalAmountMinor" | "currency">): string {
  const amount = formatMoney(input.totalAmountMinor, input.currency)
  const stored = normalize(input.paymentTiming)
  if (input.paymentModel === "UPFRONT" && stored === normalize(preservedPaymentTiming.UPFRONT)) {
    return `${amount} is due after you accept this quotation and before work begins. Accepting this quotation does not take payment.`
  }
  if (input.paymentModel === "SUCCESS_FEE" && stored === normalize(preservedPaymentTiming.SUCCESS_FEE)) {
    return `No service fee is charged today. ${amount} becomes payable only after the documented successful outcome and a later invoice. Accepting this quotation does not take payment.`
  }
  if (input.paymentModel === "RECURRING_MONTHLY" && stored === normalize(preservedPaymentTiming.RECURRING_MONTHLY)) {
    return `${amount} per month is billed after this quotation is accepted and monitoring is activated. Accepting this quotation does not start monitoring and does not take payment.`
  }
  return trimEnds(input.paymentTiming)
}

function assuranceFor(input: CustomerQuotationInput, paymentTiming: string): string | null {
  if (input.paymentModel === "SUCCESS_FEE") {
    return "Accepting this quote does not create an invoice or outstanding debt."
  }
  if (input.serviceCode === "RELAUNCH_GUARD" && !normalize(paymentTiming).toLowerCase().includes("does not start monitoring")) {
    return "Accepting this quote does not start monitoring."
  }
  return null
}

export function presentCustomerQuotation(input: CustomerQuotationInput): CustomerQuotationPresentation {
  const paymentWording = trimEnds(input.paymentTiming)
  const paymentLine = quotationPaymentLine(input)
  const paymentSummary = normalize(paymentLine) === normalize(paymentWording) ? null : paymentLine
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
    overviewNote: QUOTATION_OVERVIEW_NOTE,
    overview: OVERVIEW[input.serviceCode] ?? input.serviceName,
    responsibilities: customerResponsibilities(input.serviceCode),
    scope: customerFacingScope(input.scope),
    exclusions: trimEnds(input.exclusions),
    successDefinition: input.paymentModel === "SUCCESS_FEE" && trimEnds(input.successDefinition) ? trimEnds(input.successDefinition) : null,
    paymentSummary,
    paymentWording,
    terms: customerFacingTerms(input.termsReference),
    priceRows,
    total: formatMoney(input.totalAmountMinor, input.currency),
    taxNote: customerFacingTaxNote(input.taxBehaviour),
    assurance: assuranceFor(input, paymentSummary ?? paymentWording),
  }
}
