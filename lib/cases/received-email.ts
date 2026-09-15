import { formattedFromAddress } from "@/lib/enquiry-config"
import { brandName } from "@/lib/brand"
import { caseTypeLabel, type CaseType } from "@/lib/cases/domain"
import { caseServiceLabel, type EnquiryInput } from "@/lib/enquiry"
import { escapeHtml } from "@/lib/enquiry-email"
import type { EnquiryEmailMessage } from "@/lib/enquiry-provider"

function brandedSubject(rest: string) {
  return `[${brandName}] ${rest}`
}

function compact(value: string) {
  return value.replaceAll(/\s+/g, " ").trim().slice(0, 80)
}

function paragraphsToHtml(paragraphs: string[]) {
  return `<div>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>`
}

export function caseReceivedCustomerSubject(caseType: CaseType, publicRef: string) {
  return brandedSubject(`We've received your ${caseTypeLabel(caseType)} case — ${publicRef}`)
}

export function caseReceivedCustomerText(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
) {
  return [
    `We have received your ${caseTypeLabel(caseType)} assessment.`,
    `Case reference: ${publicRef}`,
    `Business: ${data.businessName}`,
    `A ${brandName} specialist will review the information you submitted. We may contact you if clarification is needed.`,
    "No payment is taken merely by submitting this assessment.",
    "Keep this reference for future correspondence.",
    "We will never ask you for passwords, OTPs, verification codes or security answers.",
  ].join("\n\n")
}

export function caseReceivedCustomerHtml(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
) {
  return paragraphsToHtml(caseReceivedCustomerText(data, caseType, publicRef).split("\n\n"))
}

export function buildCaseReceivedCustomerMessage(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  fromEmail: string,
): EnquiryEmailMessage {
  return {
    kind: "customer-ack",
    from: formattedFromAddress(fromEmail),
    to: data.email,
    replyTo: fromEmail,
    subject: caseReceivedCustomerSubject(caseType, publicRef),
    text: caseReceivedCustomerText(data, caseType, publicRef),
    html: caseReceivedCustomerHtml(data, caseType, publicRef),
  }
}

export function caseReceivedInternalSubject(
  caseType: CaseType,
  publicRef: string,
  businessName: string,
) {
  return brandedSubject(`New ${caseTypeLabel(caseType)} case — ${publicRef} — ${compact(businessName) || "Business"}`)
}

export function caseReceivedInternalText(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  submittedAt: Date,
) {
  const rows: Array<[string, string]> = [
    ["Case reference", publicRef],
    ["Service", caseTypeLabel(caseType)],
    ["Form route", caseServiceLabel(data.service)],
    ["Name", data.fullName],
    ["Email", data.email],
  ]
  if (data.phone) rows.push(["Phone", data.phone])
  rows.push(["Business", data.businessName], ["Country", data.country])
  if (data.websiteUrl) rows.push(["Website", data.websiteUrl])
  if (data.businessProfileUrl) rows.push(["Business Profile URL", data.businessProfileUrl])
  if (data.reviewUrl) rows.push(["Review URL", data.reviewUrl])
  rows.push(["Case description", data.details], ["Submitted", submittedAt.toISOString()])
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n\n")
}

export function caseReceivedInternalHtml(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  submittedAt: Date,
) {
  const items = caseReceivedInternalText(data, caseType, publicRef, submittedAt)
    .split("\n\n")
    .map((row) => {
      const index = row.indexOf(": ")
      const label = index === -1 ? "Detail" : row.slice(0, index)
      const value = index === -1 ? row : row.slice(index + 2)
      return `<p><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`
    })
    .join("")
  return `<div>${items}</div>`
}

export function buildCaseReceivedInternalMessage(
  data: EnquiryInput,
  caseType: CaseType,
  publicRef: string,
  fromEmail: string,
  toEmail: string,
  extraReplyTo: string | undefined,
  submittedAt: Date,
): EnquiryEmailMessage {
  const replyTo = extraReplyTo && extraReplyTo.toLowerCase() !== data.email.toLowerCase()
    ? [data.email, extraReplyTo]
    : data.email
  return {
    kind: "internal",
    from: formattedFromAddress(fromEmail),
    to: toEmail,
    replyTo,
    subject: caseReceivedInternalSubject(caseType, publicRef, data.businessName),
    text: caseReceivedInternalText(data, caseType, publicRef, submittedAt),
    html: caseReceivedInternalHtml(data, caseType, publicRef, submittedAt),
  }
}
