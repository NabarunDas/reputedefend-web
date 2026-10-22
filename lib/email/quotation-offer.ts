import { brandName, brandSiteUrl } from "../brand"
import {
  customerEmailSecurityNote,
  renderCustomerEmail,
  trustedActionUrl,
  type CustomerEmailBlock,
} from "./customer-message"
import { validReplyMailbox } from "./reply-mailbox"

export const quotationButtonLabel = "Review and accept quotation"
export const quotationIndependenceSentence = `${brandName} is independent of Google. We do not control Google's systems, decisions or timescales.`
export const quotationLinkExpirySentence = "This secure link expires before that date and no later than seven days after it is sent."
export const quotationReplySentence = "If you have a question about this quotation, reply to this email."
export const quotationWebsiteSentence = "If you have a question about this quotation, contact us through the ProfileRelaunch website."
export const quotationWordingMarker = "Standard wording version "
export const preservedAcceptedQuoteRef = "QT-26-TBGP5Q"
export const publishedCustomerPriceLabels = ["£99.00", "£59.00", "£299.00", "£149.00", "£9.99"] as const

const defaultIntroduction = [
  "Hello,",
  `Thank you for contacting ${brandName}. Please review the quotation below for the service we discussed. It describes this service only.`,
]

export function quoteMoneyLabel(amountMinor: number, currency: string): string | null {
  if (!Number.isInteger(amountMinor) || amountMinor < 0 || amountMinor > 100_000_000) return null
  if (!/^[A-Z]{3}$/.test(currency)) return null
  const pounds = Math.floor(amountMinor / 100)
  const pence = String(amountMinor % 100).padStart(2, "0")
  return `£${pounds}.${pence} ${currency}`
}

export function quoteValidUntilLabel(validUntil: string): string | null {
  const at = Date.parse(validUntil)
  if (!Number.isFinite(at)) return null
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(at))
  const day = parts.find(part => part.type === "day")?.value
  const month = parts.find(part => part.type === "month")?.value
  const year = parts.find(part => part.type === "year")?.value
  if (!day || !month || !year) return null
  return `${day} ${month} ${year}`
}

export function quotePaymentLabel(paymentModel: string): string | null {
  if (paymentModel === "UPFRONT") return "Upfront"
  if (paymentModel === "SUCCESS_FEE") return "Success fee"
  if (paymentModel === "RECURRING_MONTHLY") return "Recurring monthly"
  return null
}

function unsafeCopy(value: string): boolean {
  const lower = value.toLowerCase()
  return value.includes("<") || value.includes(">") || value.includes("#t=")
    || lower.includes("http:") || lower.includes("https:") || lower.includes("javascript:")
    || lower.includes("data:") || lower.includes("www.")
}

export function editableQuotationIntroduction(value: string | null | undefined): string | null {
  const source = value?.trim() ? value.trim() : defaultIntroduction.join("\n\n")
  if (source.length < 20 || source.length > 4000 || unsafeCopy(source)) return null
  const paragraphs = source.split(/\n{2,}/).map(item => item.trim()).filter(Boolean)
  if (paragraphs.length === 0 || paragraphs.some(item => item.length > 2000)) return null
  return paragraphs.join("\n\n")
}

function customerLines(value: string): string[] | null {
  const items = value.split("\n").map(item => item.trim()).filter(item => item && !item.startsWith(quotationWordingMarker))
  if (items.length === 0 || items.length > 20) return null
  if (items.some(item => item.length > 2000 || unsafeCopy(item))) return null
  return items
}

export function renderQuotationOffer(input: {
  publicRef: string
  caseRef?: string | null
  serviceName: string
  amountMinor: number
  currency: string
  paymentModel: string
  scope: string
  exclusions: string
  validUntil: string
  actionUrl: string
  replyTo?: string | null
  subject?: string | null
  introduction?: string | null
}): { subject: string; html: string; text: string; amountLabel: string; validUntilLabel: string } | null {
  const publicRef = input.publicRef.trim()
  const serviceName = input.serviceName.trim()
  if (!publicRef || publicRef.length > 40 || unsafeCopy(publicRef)) return null
  if (publicRef === preservedAcceptedQuoteRef) return null
  if (!serviceName || serviceName.length > 120 || unsafeCopy(serviceName)) return null
  if (!trustedActionUrl(input.actionUrl) || input.actionUrl.includes("#t=")) return null
  const amountLabel = quoteMoneyLabel(input.amountMinor, input.currency)
  const validUntilLabel = quoteValidUntilLabel(input.validUntil)
  const payment = quotePaymentLabel(input.paymentModel)
  const scope = customerLines(input.scope)
  const exclusions = customerLines(input.exclusions)
  const introduction = editableQuotationIntroduction(input.introduction)
  if (!amountLabel || !validUntilLabel || !payment || !scope || !exclusions || !introduction) return null
  const ownPrice = amountLabel.split(" ")[0]
  if (publishedCustomerPriceLabels.some(label => label !== ownPrice && input.scope.includes(label))) return null
  if (publishedCustomerPriceLabels.some(label => label !== ownPrice && input.exclusions.includes(label))) return null
  const replyTo = validReplyMailbox(input.replyTo)
  const caseRef = input.caseRef?.trim() || ""
  if (caseRef && (caseRef.length > 40 || unsafeCopy(caseRef))) return null
  const subject = (input.subject?.trim() || `Your ${brandName} quotation ${publicRef}`).trim()
  if (subject.length > 200 || !subject.includes(publicRef) || unsafeCopy(subject)) return null
  const blocks: CustomerEmailBlock[] = [
    ...introduction.split(/\n{2,}/).map(text => ({ type: "paragraph" as const, text })),
    { type: "paragraph", text: `Quotation: ${publicRef}` },
    { type: "paragraph", text: `Service: ${serviceName}` },
    { type: "paragraph", text: `Amount: ${amountLabel}` },
    { type: "paragraph", text: `Payment: ${payment}` },
    { type: "paragraph", text: `This quotation is valid until ${validUntilLabel}.` },
    { type: "list", title: "Included in this quotation", items: scope },
    { type: "list", title: "Not included", items: exclusions },
    { type: "paragraph", text: quotationLinkExpirySentence },
    { type: "button", label: quotationButtonLabel, url: input.actionUrl },
    { type: "paragraph", text: replyTo ? quotationReplySentence : quotationWebsiteSentence },
    { type: "paragraph", text: "Kind regards," },
    { type: "paragraph", text: `${brandName} Support Team` },
    { type: "paragraph", text: quotationIndependenceSentence },
  ]
  const rendered = renderCustomerEmail({ title: "Your quotation", blocks, caseRef: caseRef || null })
  if (!rendered) return null
  if (rendered.text.includes("#t=") || rendered.html.includes("#t=")) return null
  if (rendered.text.includes(quotationWordingMarker) || rendered.html.includes(quotationWordingMarker)) return null
  if (!rendered.text.includes(customerEmailSecurityNote) || !rendered.html.includes(customerEmailSecurityNote)) return null
  if (!rendered.text.includes(brandSiteUrl)) return null
  return { subject, html: rendered.html, text: rendered.text, amountLabel, validUntilLabel }
}
