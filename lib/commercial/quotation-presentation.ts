/**
 * Customer quotation presentation.
 *
 * Stored scope, exclusions, payment timing and the bound agreement are not
 * rewritten. Repeated price, tax and payment sentences are shown once.
 * A success definition is shown only for an outcome-based success fee.
 */
import { formatMoney } from "../money"
import { customerFacingTaxNote, customerPriceBoundary, customerPriceLine } from "../pricing"
import {
  customerFacingScope,
  preservedPaymentTiming,
  preservedSuccessDefinition,
  publishedGuardLead,
  publishedGuidedCopy,
  publishedGuidedLine,
  publishedManagedCopy,
  publishedManagedLine,
} from "./scope-templates"
import { customerFacingTerms } from "./agreement-render"

const GUIDED_FEE = "A Guided fee is payable upfront only after you have accepted a valid quotation and this agreement."
const FOREIGN_SUCCESS_FEE = "Managed success fees are payable only when the defined successful outcome is achieved under the service terms."
const FINAL_PRICE = `${customerPriceLine} ${customerPriceBoundary}`
const SERVICE_PRICE_PREFIXES = [
  "Guided Relaunch (",
  "Guided Review (",
  "Managed Profile Recovery (",
  "Managed Relaunch (",
  "Managed Review Protection (",
  "Managed Review (",
  "Relaunch Guard (",
  "Profile + Review monitoring (",
]

const DELIVERABLES: Record<string, string> = {
  GUIDED_RELAUNCH: "ProfileRelaunch prepares the profile relaunch work for the location named in this quotation. You submit that work to Google.",
  GUIDED_REVIEW: "ProfileRelaunch prepares the review work named in this quotation. You submit that work to Google.",
  MANAGED_RELAUNCH: "ProfileRelaunch carries out the authorised profile recovery work for the Business Profile and incident named in this quotation.",
  MANAGED_REVIEW: "ProfileRelaunch carries out the authorised review work for the review named in this quotation.",
  RELAUNCH_GUARD: `${publishedGuardLead}`,
}

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
  deliverables: string
  responsibilities: string
  exclusions: string
  successDefinition: string | null
  paymentTiming: string
  terms: string | null
  priceRows: QuotationPriceRow[]
  total: string
  taxNote: string
  assurance: string | null
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function splitSentences(text: string): string[] {
  return text.split(/\n+/).flatMap(paragraph => {
    const trimmed = paragraph.trim()
    if (!trimmed) return []
    return trimmed.split(/(?<=\.)\s+/).map(sentence => sentence.trim()).filter(Boolean)
  })
}

function remember(target: Set<string>, text: string) {
  const normalized = normalize(text)
  if (!normalized) return
  target.add(normalized)
  for (const sentence of splitSentences(text)) target.add(normalize(sentence))
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

function allowedPrices(input: CustomerQuotationInput): Set<string> {
  const tokens = new Set<string>()
  const amounts = [
    input.standardAmountMinor,
    input.discountAmountMinor,
    input.quotedAmountMinor ?? 0,
    input.taxAmountMinor,
    input.totalAmountMinor,
  ]
  for (const minor of amounts) {
    if (!Number.isInteger(minor) || minor <= 0) continue
    tokens.add(formatMoney(minor, input.currency))
    const pounds = minor / 100
    tokens.add(`£${pounds}`)
    tokens.add(`£${pounds.toFixed(2)}`)
  }
  return tokens
}

function hasForeignPrice(sentence: string, allowed: Set<string>): boolean {
  const pattern = /£\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(sentence)) !== null) {
    const token = match[0]
    const withPence = token.includes(".") ? token : `${token}.00`
    const withoutPence = token.endsWith(".00") ? token.slice(0, -3) : token
    if (!allowed.has(token) && !allowed.has(withPence) && !allowed.has(withoutPence)) return true
  }
  return false
}

function isServicePriceLabel(sentence: string, serviceName: string): boolean {
  const text = normalize(sentence)
  const bare = text.replace(/\.$/, "")
  if (bare === serviceName || bare === "Relaunch Guard") return true
  return SERVICE_PRICE_PREFIXES.some(prefix => text.startsWith(prefix))
}

function omittedSentences(input: CustomerQuotationInput, responsibilities: string): Set<string> {
  const omitted = new Set<string>()
  remember(omitted, input.paymentTiming)
  remember(omitted, input.successDefinition)
  remember(omitted, GUIDED_FEE)
  remember(omitted, FINAL_PRICE)
  remember(omitted, customerPriceLine)
  remember(omitted, customerPriceBoundary)
  for (const timing of Object.values(preservedPaymentTiming)) remember(omitted, timing)
  for (const definition of Object.values(preservedSuccessDefinition)) remember(omitted, definition)
  if (input.paymentModel !== "SUCCESS_FEE") remember(omitted, FOREIGN_SUCCESS_FEE)
  for (const sentence of splitSentences(responsibilities)) omitted.add(normalize(sentence))
  return omitted
}

function keptSentences(text: string, input: CustomerQuotationInput, omitted: Set<string>, allowed: Set<string>): string[] {
  return splitSentences(text).filter(sentence => {
    const normalized = normalize(sentence)
    if (!normalized) return false
    if (normalized.startsWith("Standard wording version ")) return false
    if (normalized.startsWith("The final customer price is ")) return false
    if (isServicePriceLabel(sentence, input.serviceName)) return false
    if (omitted.has(normalized)) return false
    if (hasForeignPrice(sentence, allowed)) return false
    return true
  })
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
  return input.paymentTiming.trim()
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
  const responsibilities = customerResponsibilities(input.serviceCode)
  const omitted = omittedSentences(input, responsibilities)
  const allowed = allowedPrices(input)
  const deliverableSentences = keptSentences(customerFacingScope(input.scope), input, omitted, allowed)
  const exclusionSentences = keptSentences(input.exclusions, input, omitted, allowed)
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
  const paymentTiming = quotationPaymentLine(input)
  return {
    deliverables: deliverableSentences.join(" ") || DELIVERABLES[input.serviceCode] || input.serviceName,
    responsibilities,
    exclusions: exclusionSentences.join(" ") || "This quotation covers only the service named above. Google makes the final platform decision.",
    successDefinition: input.paymentModel === "SUCCESS_FEE" && input.successDefinition.trim() ? input.successDefinition.trim() : null,
    paymentTiming,
    terms: customerFacingTerms(input.termsReference),
    priceRows,
    total: formatMoney(input.totalAmountMinor, input.currency),
    taxNote: customerFacingTaxNote(input.taxBehaviour),
    assurance: assuranceFor(input, paymentTiming),
  }
}
