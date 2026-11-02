/**
 * Telloya enquiry email content
 * Extends existing enquiry email infrastructure with Telloya-specific templates
 */

import { brandName } from "@/lib/brand"
import { renderCustomerEmail } from "@shared/email/customer-message"
import { escapeHtml } from "@shared/enquiry-email"

function brandedSubject(rest: string) {
  return `[${brandName}] ${rest}`
}

export function telloyaCustomerAcknowledgementSubject(ref: string) {
  return brandedSubject(`Your Telloya enquiry (${ref})`)
}

export function telloyaCustomerAcknowledgement(ref: string) {
  return renderCustomerEmail({
    title: `Your Telloya enquiry reference: ${ref}`,
    blocks: [
      { type: "paragraph", text: "Hello," },
      { 
        type: "paragraph", 
        text: `Thank you for your interest in Telloya. We have received your enquiry and saved it as reference ${ref}.` 
      },
      { 
        type: "paragraph", 
        text: "Telloya is our AI receptionist service designed for busy tradespeople and local service businesses. When you cannot answer calls, Telloya helps capture missed enquiries and the details you need to follow up." 
      },
      { 
        type: "paragraph", 
        text: "A member of our team will review your enquiry and contact you at the email address or phone number you provided to discuss how Telloya can help your business." 
      },
      { 
        type: "paragraph", 
        text: "Submitting this form does not, by itself, create a client relationship or activate any service. We will discuss your requirements, pricing, and next steps when we reach out." 
      },
      { type: "paragraph", text: "Kind regards," },
      { type: "paragraph", text: "Telloya — a service operated by ProfileRelaunch Ltd" },
    ],
  })
}

export function telloyaCustomerAcknowledgementText(ref: string) {
  return telloyaCustomerAcknowledgement(ref)?.text ?? ""
}

export function telloyaCustomerAcknowledgementHtml(ref: string) {
  return telloyaCustomerAcknowledgement(ref)?.html ?? ""
}

interface TelloyaEnquiryData {
  fullName: string
  email: string
  phone: string
  businessName: string
  country: string
  trade: string
  locations?: string
  websiteUrl?: string
  product: string
  missedCallProblem?: string
  phoneSetup?: string
  contactPreference?: string
}

export function telloyaInternalNotificationSubject(data: TelloyaEnquiryData, ref: string) {
  const business = data.businessName.replaceAll(/\s+/g, " ").trim().slice(0, 80) || "Business"
  const product = data.product === "complete" ? "Complete" : "Telloya"
  return brandedSubject(`New ${product} enquiry (${ref}) — ${business}`)
}

function productLabel(product: string): string {
  if (product === "telloya") return "Telloya (AI Receptionist)"
  if (product === "complete") return "Complete (Full Service Package)"
  return "Not specified"
}

export function telloyaInternalNotificationText(data: TelloyaEnquiryData, ref: string, submittedAt: Date) {
  const lines = [
    `Enquiry Reference: ${ref}`,
    `Source: Telloya Marketing`,
    `Product Interest: ${productLabel(data.product)}`,
    "",
    `Name: ${data.fullName}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone}`,
    "",
    `Business: ${data.businessName}`,
    `Trade: ${data.trade}`,
    `Country: ${data.country}`,
  ]

  if (data.locations) {
    lines.push(`Locations: ${data.locations}`)
  }

  if (data.websiteUrl) {
    lines.push(`Website: ${data.websiteUrl}`)
  }

  lines.push("")

  if (data.missedCallProblem) {
    lines.push(`Missed Call Requirements:\n${data.missedCallProblem}`)
    lines.push("")
  }

  if (data.phoneSetup) {
    lines.push(`Phone Setup:\n${data.phoneSetup}`)
    lines.push("")
  }

  if (data.contactPreference) {
    lines.push(`Contact Preference:\n${data.contactPreference}`)
    lines.push("")
  }

  lines.push(`Submitted: ${submittedAt.toISOString()}`)

  return lines.join("\n")
}

export function telloyaInternalNotificationHtml(data: TelloyaEnquiryData, ref: string, submittedAt: Date) {
  const rows = [
    { label: "Enquiry Reference", value: ref },
    { label: "Source", value: "Telloya Marketing" },
    { label: "Product Interest", value: productLabel(data.product) },
    { label: "Name", value: data.fullName },
    { label: "Email", value: data.email },
    { label: "Phone", value: data.phone },
    { label: "Business", value: data.businessName },
    { label: "Trade", value: data.trade },
    { label: "Country", value: data.country },
  ]

  if (data.locations) {
    rows.push({ label: "Locations", value: data.locations })
  }

  if (data.websiteUrl) {
    rows.push({ label: "Website", value: data.websiteUrl })
  }

  if (data.missedCallProblem) {
    rows.push({ label: "Missed Call Requirements", value: data.missedCallProblem })
  }

  if (data.phoneSetup) {
    rows.push({ label: "Phone Setup", value: data.phoneSetup })
  }

  if (data.contactPreference) {
    rows.push({ label: "Contact Preference", value: data.contactPreference })
  }

  rows.push({ label: "Submitted", value: submittedAt.toISOString() })

  const items = rows
    .map((row) => `<p><strong>${escapeHtml(row.label)}</strong><br>${escapeHtml(row.value).replaceAll("\n", "<br>")}</p>`)
    .join("")

  return `<div>${items}</div>`
}
