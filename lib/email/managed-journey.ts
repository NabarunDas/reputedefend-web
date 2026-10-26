import { customerPriceBoundary } from "../pricing"
import { customerEmailSecurityNote, renderCustomerEmail, type CustomerEmailBlock } from "./customer-message"
import { quoteMoneyLabel } from "./quotation-offer"
import { validReplyMailbox } from "./reply-mailbox"

const caseRefPattern = /^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$/
const originPattern = /^https:\/\/[A-Za-z0-9.-]+$/

export const managedCaseButton = "Open your case"
export const managedInvoiceButton = "View your invoice"
export const managedSubmittedSentence = "We have submitted your case to Google through Google's own process. This email is our note of that submission. It does not mean Google has made a decision."
export const managedFollowUpSentence = "We have sent Google a further update on your case. This email is our note of that follow-up. It does not mean Google has made a decision."
export const managedGoogleReplySentence = "Google has sent a reply. A reply is not the same as the agreed successful outcome. We still check the original profile or review ourselves before any success fee is discussed."
export const managedUnsuccessfulReplySentence = "The response does not meet the agreed success criteria, so no success fee is payable for this request."
export const managedOpenCaseSentence = "This note does not finish the case and it does not create a fee."
export const managedInvoiceSentence = "Your success fee invoice is ready. It is payable within 14 days from the signed-in Customer Portal. We do not charge a saved card."
export const managedProfileCheckedSentence = "We checked the original profile restriction named in your agreement."
export const managedReviewCheckedSentence = "We checked the exact review named in your agreement."
export const managedPaidSentence = "Your case is complete. The agreed outcome was checked and the success fee has been paid."
export const managedNoFeeSentence = "We have closed this case. The agreed successful outcome was not shown, so no success fee is payable."
export const managedWithdrawnSentence = "This service has been withdrawn. No success fee is payable."
export const managedGuardSentence = "Relaunch Guard is optional. This email does not enrol you or charge you."
export const managedReplySentence = "Reply to this email if you need anything explained. Keep the case reference in the subject."

export type ManagedNoticeVariant =
  | "submitted"
  | "follow_up"
  | "google_reply"
  | "unsuccessful_reply"
  | "invoice"
  | "complete_paid"
  | "complete_no_fee"
  | "withdrawn"

export function managedServiceName(serviceCode: string): string | null {
  if (serviceCode === "MANAGED_RELAUNCH") return "Managed Profile Recovery"
  if (serviceCode === "MANAGED_REVIEW") return "Managed Review Protection"
  return null
}

export function managedPortalPage(origin: string, caseRef: string, page: "case" | "payments"): string | null {
  const root = origin.trim().replace(/\/$/, "")
  if (!originPattern.test(root) || !caseRefPattern.test(caseRef.trim())) return null
  const ref = caseRef.trim()
  return page === "payments" ? `${root}/portal/cases/${ref}/payments` : `${root}/portal/cases/${ref}`
}

function subjectFor(variant: ManagedNoticeVariant, serviceName: string, caseRef: string): string {
  if (variant === "submitted") return `We have submitted your ${serviceName} case — ${caseRef}`
  if (variant === "follow_up") return `We have sent Google a further update — ${caseRef}`
  if (variant === "google_reply") return `Google has replied about your case — ${caseRef}`
  if (variant === "unsuccessful_reply") return `No success fee is payable for this request — ${caseRef}`
  if (variant === "invoice") return `Your success fee invoice is ready — ${caseRef}`
  if (variant === "complete_paid") return `Your ${serviceName} case is complete — ${caseRef}`
  if (variant === "withdrawn") return `Your ${serviceName} service has been withdrawn — ${caseRef}`
  return `Your ${serviceName} case is closed — ${caseRef}`
}

export function renderManagedNotice(input: {
  variant: ManagedNoticeVariant
  serviceCode: string
  serviceName: string
  caseRef: string
  amountMinor?: number | null
  currency?: string | null
  origin: string
  replyTo?: string | null
}): { subject: string; html: string; text: string; pageUrl: string } | null {
  const serviceName = managedServiceName(input.serviceCode)
  const caseRef = input.caseRef.trim()
  const replyTo = validReplyMailbox(input.replyTo)
  const needsAmount = input.variant === "invoice" || input.variant === "complete_paid"
  const amountLabel = needsAmount ? quoteMoneyLabel(input.amountMinor ?? -1, input.currency ?? "") : null
  const page = input.variant === "invoice" ? "payments" : "case"
  const pageUrl = managedPortalPage(input.origin, caseRef, page)
  if (!serviceName || input.serviceName.trim() !== serviceName || !replyTo || !pageUrl) return null
  if (needsAmount && (!amountLabel || input.currency !== "GBP" || (input.amountMinor ?? 0) <= 0)) return null
  const subject = subjectFor(input.variant, serviceName, caseRef)
  if (subject.length < 8 || subject.length > 200) return null
  const button = input.variant === "invoice" ? managedInvoiceButton : managedCaseButton
  const blocks: CustomerEmailBlock[] = [
    { type: "paragraph", text: "Hello," },
    { type: "paragraph", text: `This update is about your ${serviceName} case ${caseRef}.` },
  ]
  if (input.variant === "submitted") blocks.push({ type: "paragraph", text: managedSubmittedSentence })
  if (input.variant === "follow_up") blocks.push({ type: "paragraph", text: managedFollowUpSentence })
  if (input.variant === "google_reply") blocks.push({ type: "paragraph", text: managedGoogleReplySentence })
  if (input.variant === "unsuccessful_reply") blocks.push({ type: "paragraph", text: managedUnsuccessfulReplySentence })
  if (input.variant === "submitted" || input.variant === "follow_up" || input.variant === "google_reply" || input.variant === "unsuccessful_reply") {
    blocks.push({ type: "paragraph", text: managedOpenCaseSentence })
  }
  if (input.variant === "invoice" && amountLabel) {
    blocks.push({ type: "paragraph", text: managedInvoiceSentence })
    blocks.push({ type: "paragraph", text: `Amount due: ${amountLabel}` })
    blocks.push({ type: "paragraph", text: customerPriceBoundary })
  }
  if (input.variant === "complete_paid" && amountLabel) {
    blocks.push({ type: "paragraph", text: input.serviceCode === "MANAGED_REVIEW" ? managedReviewCheckedSentence : managedProfileCheckedSentence })
    blocks.push({ type: "paragraph", text: managedPaidSentence })
    blocks.push({ type: "paragraph", text: `Amount paid: ${amountLabel}` })
    blocks.push({ type: "paragraph", text: customerPriceBoundary })
    blocks.push({ type: "paragraph", text: managedGuardSentence })
  }
  if (input.variant === "complete_no_fee") {
    blocks.push({ type: "paragraph", text: managedNoFeeSentence })
    blocks.push({ type: "paragraph", text: managedGuardSentence })
  }
  if (input.variant === "withdrawn") {
    blocks.push({ type: "paragraph", text: managedWithdrawnSentence })
    blocks.push({ type: "paragraph", text: managedGuardSentence })
  }
  blocks.push({ type: "button", label: button, url: pageUrl })
  blocks.push({ type: "paragraph", text: managedReplySentence })
  const rendered = renderCustomerEmail({
    title: input.variant === "invoice" ? "Your invoice is ready" : input.variant === "complete_paid" ? "Your case is complete" : "An update on your case",
    blocks,
    caseRef,
  })
  if (!rendered) return null
  const combined = `${subject}\n${rendered.text}\n${rendered.html}`
  if (combined.includes("#t=") || rendered.text.includes("/action/") || rendered.html.includes("/action/")) return null
  if (!rendered.text.includes(pageUrl) || !rendered.html.includes(pageUrl)) return null
  if (!rendered.text.includes(button) || !rendered.html.includes(customerEmailSecurityNote)) return null
  if (rendered.text.includes("pi_") || rendered.html.toLowerCase().includes("pi_") || rendered.text.includes("cus_") || rendered.html.toLowerCase().includes("cus_")) return null
  return { subject, html: rendered.html, text: rendered.text, pageUrl }
}
