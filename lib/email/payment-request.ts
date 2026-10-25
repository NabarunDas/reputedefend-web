import { brandName } from "../brand"
import { customerPriceBoundary } from "../pricing"
import {
  customerEmailSecurityNote,
  renderCustomerEmail,
  type CustomerEmailBlock,
} from "./customer-message"
import { quoteMoneyLabel } from "./quotation-offer"
import { validReplyMailbox } from "./reply-mailbox"

export const paymentRequestOpeningSentence = "Opening this email does not start a card payment."
export const paymentRequestReplySentence = "If you have a question about this payment, simply reply to this email and keep the order reference in the subject."
export const paymentRequestWebsiteSentence = "If you have a question about this payment, contact us through the ProfileRelaunch website."

const caseRefPattern = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const orderRefPattern = /^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const originPattern = /^https:\/\/[A-Za-z0-9.-]+$/

export function paymentRequestButtonLabel(serviceCode: string, amountMinor: number): string | null {
  if (serviceCode === "GUIDED_RELAUNCH" && amountMinor === 9900) return "Pay £99 securely"
  if (serviceCode === "GUIDED_REVIEW" && amountMinor === 5900) return "Pay £59 securely"
  return null
}

export function paymentRequestServiceName(serviceCode: string): string | null {
  if (serviceCode === "GUIDED_RELAUNCH") return "Guided Relaunch"
  if (serviceCode === "GUIDED_REVIEW") return "Guided Review"
  return null
}

export function portalPaymentsUrl(origin: string, caseRef: string): string | null {
  const root = origin.trim().replace(/\/$/, "")
  if (!originPattern.test(root) || !caseRefPattern.test(caseRef)) return null
  return `${root}/portal/cases/${caseRef}/payments`
}

export function renderPaymentRequest(input: {
  serviceCode: string
  serviceName: string
  orderRef: string
  caseRef: string
  amountMinor: number
  currency: string
  origin: string
  replyTo?: string | null
}): { subject: string; html: string; text: string; paymentsUrl: string; buttonLabel: string } | null {
  const serviceName = paymentRequestServiceName(input.serviceCode)
  const buttonLabel = paymentRequestButtonLabel(input.serviceCode, input.amountMinor)
  const amountLabel = quoteMoneyLabel(input.amountMinor, input.currency)
  const paymentsUrl = portalPaymentsUrl(input.origin, input.caseRef)
  const orderRef = input.orderRef.trim()
  const caseRef = input.caseRef.trim()
  if (!serviceName || input.serviceName.trim() !== serviceName || !buttonLabel || !amountLabel || !paymentsUrl) return null
  if (!orderRefPattern.test(orderRef) || !caseRefPattern.test(caseRef)) return null
  if (input.currency !== "GBP") return null
  const replyTo = validReplyMailbox(input.replyTo)
  const subject = `Pay for your ${brandName} ${serviceName} — ${orderRef}`
  const blocks: CustomerEmailBlock[] = [
    { type: "paragraph", text: "Hello," },
    { type: "paragraph", text: `Your ${serviceName} order ${orderRef} is accepted.` },
    { type: "paragraph", text: `Amount: ${amountLabel}` },
    { type: "paragraph", text: customerPriceBoundary },
    { type: "paragraph", text: paymentRequestOpeningSentence },
    { type: "paragraph", text: "Choose the button below to open the secure ProfileRelaunch payments page. You sign in there if needed, then choose Stripe Checkout yourself." },
    { type: "button", label: buttonLabel, url: paymentsUrl },
    { type: "paragraph", text: replyTo ? paymentRequestReplySentence : paymentRequestWebsiteSentence },
  ]
  const rendered = renderCustomerEmail({ title: "Your payment is ready", blocks, caseRef })
  if (!rendered) return null
  if (rendered.text.includes("#t=") || rendered.html.includes("#t=") || rendered.text.includes("/action/") || rendered.html.includes("/action/")) return null
  if (!rendered.text.includes(buttonLabel) || !rendered.html.includes(buttonLabel)) return null
  if (!rendered.text.includes(paymentsUrl) || !rendered.html.includes(paymentsUrl)) return null
  if (!rendered.text.includes(customerEmailSecurityNote) || !rendered.html.includes(customerEmailSecurityNote)) return null
  return { subject, html: rendered.html, text: rendered.text, paymentsUrl, buttonLabel }
}
