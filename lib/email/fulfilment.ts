import { customerPriceBoundary } from "../pricing"
import {
  customerEmailSecurityNote,
  renderCustomerEmail,
  type CustomerEmailBlock,
} from "./customer-message"
import { customerCaseSubject, receiptNumberLine, serviceOrderLine } from "./customer-reference"
import { quoteMoneyLabel } from "./quotation-offer"
import { validReplyMailbox } from "./reply-mailbox"

const caseRefPattern = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const orderRefPattern = /^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const receiptRefPattern = /^RC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const originPattern = /^https:\/\/[A-Za-z0-9.-]+$/
const paymentConfirmationReply = "If you have a question about this payment, reply to this email and keep the case reference in the subject."

export const paymentConfirmationButton = "View your receipt"
export const packReadyButton = "View your completed pack"
export const guidedCustomerSubmitsSentence = "You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you."
export const guidedCompletionGuardSentence = "Relaunch Guard is optional. This email does not enrol you."

export function guidedServiceCompleteSentence(serviceName: "Guided Relaunch" | "Guided Review"): string {
  return `Your ${serviceName} service is complete. Your submission pack remains available in your account. You can tell us when you've submitted it to Google and update us when you hear back.`
}

export function fulfilmentServiceName(serviceCode: string): "Guided Relaunch" | "Guided Review" | null {
  if (serviceCode === "GUIDED_RELAUNCH") return "Guided Relaunch"
  if (serviceCode === "GUIDED_REVIEW") return "Guided Review"
  return null
}

export function portalCasePage(origin: string, caseRef: string, page: "payments" | "documents"): string | null {
  const root = origin.trim().replace(/\/$/, "")
  if (!originPattern.test(root) || !caseRefPattern.test(caseRef)) return null
  return `${root}/portal/cases/${caseRef}/${page}`
}

function sharedReady(input: {
  serviceCode: string
  serviceName: string
  caseRef: string
  amountMinor: number
  currency: string
  origin: string
}): { serviceName: "Guided Relaunch" | "Guided Review"; amountLabel: string; caseRef: string } | null {
  const serviceName = fulfilmentServiceName(input.serviceCode)
  const amountLabel = quoteMoneyLabel(input.amountMinor, input.currency)
  const caseRef = input.caseRef.trim()
  if (!serviceName || input.serviceName.trim() !== serviceName || !amountLabel || input.amountMinor <= 0) return null
  if (!caseRefPattern.test(caseRef) || input.currency !== "GBP") return null
  if (!originPattern.test(input.origin.trim().replace(/\/$/, ""))) return null
  return { serviceName, amountLabel, caseRef }
}

export function renderPaymentConfirmation(input: {
  serviceCode: string
  serviceName: string
  orderRef: string
  caseRef: string
  receiptRef: string
  amountMinor: number
  currency: string
  origin: string
  replyTo?: string | null
}): { subject: string; html: string; text: string; pageUrl: string } | null {
  const ready = sharedReady(input)
  const orderRef = input.orderRef.trim()
  const receiptRef = input.receiptRef.trim()
  const pageUrl = portalCasePage(input.origin, input.caseRef, "payments")
  const replyTo = validReplyMailbox(input.replyTo)
  if (!ready || !pageUrl || !orderRefPattern.test(orderRef) || !receiptRefPattern.test(receiptRef) || !replyTo) return null
  const subject = customerCaseSubject("Payment received", ready.caseRef)
  const blocks: CustomerEmailBlock[] = [
    { type: "paragraph", text: "Hello," },
    { type: "paragraph", text: `We have received payment for your ${ready.serviceName} service.` },
    { type: "paragraph", text: serviceOrderLine(orderRef) },
    { type: "paragraph", text: receiptNumberLine(receiptRef) },
    { type: "paragraph", text: `Amount received: ${ready.amountLabel}` },
    { type: "paragraph", text: customerPriceBoundary },
    { type: "paragraph", text: "Your receipt is on the secure payments page. Sign in there to view it. This email does not contain card details." },
    { type: "button", label: paymentConfirmationButton, url: pageUrl },
    { type: "paragraph", text: "ProfileRelaunch will now prepare your submission materials. You submit the finished pack to Google yourself." },
    { type: "paragraph", text: paymentConfirmationReply },
  ]
  const rendered = renderCustomerEmail({ title: "Payment received", blocks, caseRef: ready.caseRef })
  if (!rendered || rendered.text.includes("#t=") || rendered.html.includes("#t=") || rendered.text.includes("/action/") || rendered.html.includes("/action/")) return null
  if (!rendered.text.includes(pageUrl) || !rendered.html.includes(pageUrl)) return null
  if (!rendered.text.includes(paymentConfirmationButton) || !rendered.html.includes(customerEmailSecurityNote)) return null
  return { subject, html: rendered.html, text: rendered.text, pageUrl }
}

export function renderPackReady(input: {
  serviceCode: string
  serviceName: string
  caseRef: string
  amountMinor: number
  currency: string
  origin: string
  replyTo?: string | null
}): { subject: string; html: string; text: string; pageUrl: string } | null {
  const ready = sharedReady(input)
  const pageUrl = portalCasePage(input.origin, input.caseRef, "documents")
  const replyTo = validReplyMailbox(input.replyTo)
  if (!ready || !pageUrl || !replyTo) return null
  const subject = customerCaseSubject("Your document pack is ready", ready.caseRef)
  const blocks: CustomerEmailBlock[] = [
    { type: "paragraph", text: "Hello," },
    { type: "paragraph", text: `Your ${ready.serviceName} submission pack for case ${ready.caseRef} is ready in the Customer Portal.` },
    { type: "paragraph", text: `Amount paid: ${ready.amountLabel}` },
    { type: "paragraph", text: customerPriceBoundary },
    { type: "paragraph", text: "The pack contains the completed statement, the supporting evidence we agreed, and instructions for what you do next." },
    { type: "paragraph", text: guidedCustomerSubmitsSentence },
    { type: "button", label: packReadyButton, url: pageUrl },
    { type: "paragraph", text: "If something in the pack needs a correction, use the button above and ask us before you submit it to Google." },
    { type: "paragraph", text: "Reply to this email if you need help. Keep the case reference in the subject." },
  ]
  const rendered = renderCustomerEmail({ title: "Your submission pack is ready", blocks, caseRef: ready.caseRef })
  if (!rendered || rendered.text.includes("#t=") || rendered.html.includes("#t=") || rendered.text.includes("/action/") || rendered.html.includes("/action/")) return null
  if (!rendered.text.includes(pageUrl) || !rendered.html.includes(pageUrl)) return null
  if (!rendered.text.includes(packReadyButton) || !rendered.text.includes(guidedCustomerSubmitsSentence)) return null
  return { subject, html: rendered.html, text: rendered.text, pageUrl }
}

export function renderGuidedCompletion(input: {
  serviceCode: string
  serviceName: string
  caseRef: string
  amountMinor: number
  currency: string
  origin: string
  replyTo?: string | null
}): { subject: string; html: string; text: string; pageUrl: string } | null {
  const ready = sharedReady(input)
  const pageUrl = portalCasePage(input.origin, input.caseRef, "documents")
  const replyTo = validReplyMailbox(input.replyTo)
  if (!ready || !pageUrl || !replyTo) return null
  const subject = customerCaseSubject("Your case has been completed", ready.caseRef)
  const blocks: CustomerEmailBlock[] = [
    { type: "paragraph", text: "Hello," },
    { type: "paragraph", text: `Your ${ready.serviceName} preparation for case ${ready.caseRef} is complete. The completed statement, supporting evidence and submission instructions are in the Customer Portal.` },
    { type: "paragraph", text: `Amount paid: ${ready.amountLabel}` },
    { type: "paragraph", text: customerPriceBoundary },
    { type: "paragraph", text: guidedCustomerSubmitsSentence },
    { type: "paragraph", text: guidedServiceCompleteSentence(ready.serviceName) },
    { type: "paragraph", text: "Google's later decision is separate from this completed preparation. You can tell us if you submit the pack, and you can ask for a correction from the pack page." },
    { type: "paragraph", text: `${guidedCompletionGuardSentence} It does not apply a discount or charge you.` },
    { type: "button", label: packReadyButton, url: pageUrl },
    { type: "paragraph", text: "Reply to this email if you need a correction. Keep the case reference in the subject." },
  ]
  const rendered = renderCustomerEmail({ title: "Your Guided preparation is complete", blocks, caseRef: ready.caseRef })
  if (!rendered || rendered.text.includes("#t=") || rendered.html.includes("#t=") || rendered.text.includes("/action/") || rendered.html.includes("/action/")) return null
  if (!rendered.text.includes(pageUrl) || !rendered.html.includes(pageUrl)) return null
  if (!rendered.text.includes(packReadyButton) || !rendered.text.includes(guidedCustomerSubmitsSentence) || !rendered.text.includes(guidedCompletionGuardSentence)) return null
  if (!rendered.text.includes(guidedServiceCompleteSentence(ready.serviceName))) return null
  return { subject, html: rendered.html, text: rendered.text, pageUrl }
}
