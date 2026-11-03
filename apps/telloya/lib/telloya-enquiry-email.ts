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
    caseRef: ref,
    brand: {
      name: "Telloya",
      tagline: "AI Receptionist — operated by ProfileRelaunch Ltd",
      siteUrl: "https://telloya.com",
      logoUrl: null,
      referenceLabel: "Enquiry reference",
    },
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
  planTier?: string
  guardInterested?: boolean
  guardLocationCount?: number
  customMonthlyMinutes?: number
  customMonthlyCalls?: number
  customPhoneNumbers?: number
  customLocations?: number
  customLanguages?: string
  customRequirements?: string
  voicePreference?: string
  voiceAccent?: string
  primaryLanguage?: string
  speakingStyle?: string
  additionalLanguages?: string
  overageInterested?: boolean
  overageMonthlyCapGbp?: number
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

function planTierLabel(tier: string | undefined): string {
  if (!tier) return "Not selected"
  if (tier === "basic") return "Basic (£49/month, 120 minutes)"
  if (tier === "growth") return "Growth (£79/month, 300 minutes)"
  if (tier === "pro") return "Pro (£120/month, 500 minutes)"
  if (tier === "custom") return "Custom (quotation required)"
  return tier
}

export function telloyaInternalNotificationText(data: TelloyaEnquiryData, ref: string, submittedAt: Date) {
  const lines = [
    `Enquiry Reference: ${ref}`,
    `Source: Telloya Marketing`,
    `Product Interest: ${productLabel(data.product)}`,
  ]

  if (data.planTier) {
    lines.push(`Selected Plan: ${planTierLabel(data.planTier)}`)
  }

  if (data.guardInterested) {
    const locations = data.guardLocationCount ? ` (${data.guardLocationCount} locations)` : ""
    lines.push(`Relaunch Guard: Interested${locations}`)
  }

  lines.push("")
  lines.push(`Name: ${data.fullName}`)
  lines.push(`Email: ${data.email}`)
  lines.push(`Phone: ${data.phone}`)
  lines.push("")
  lines.push(`Business: ${data.businessName}`)
  lines.push(`Trade: ${data.trade}`)
  lines.push(`Country: ${data.country}`)

  if (data.locations) {
    lines.push(`Locations: ${data.locations}`)
  }

  if (data.websiteUrl) {
    lines.push(`Website: ${data.websiteUrl}`)
  }

  // Custom plan requirements
  if (data.planTier === "custom") {
    lines.push("")
    lines.push("Custom Plan Requirements:")
    if (data.customMonthlyMinutes) lines.push(`  Monthly minutes: ${data.customMonthlyMinutes}`)
    if (data.customMonthlyCalls) lines.push(`  Monthly calls: ${data.customMonthlyCalls}`)
    if (data.customPhoneNumbers) lines.push(`  Phone numbers: ${data.customPhoneNumbers}`)
    if (data.customLocations) lines.push(`  Locations: ${data.customLocations}`)
    if (data.customLanguages) lines.push(`  Languages: ${data.customLanguages}`)
    if (data.customRequirements) {
      lines.push(`  Additional requirements:\n  ${data.customRequirements.replaceAll("\n", "\n  ")}`)
    }
  }

  // Voice preferences
  if (data.voicePreference || data.voiceAccent || data.primaryLanguage || data.speakingStyle || data.additionalLanguages) {
    lines.push("")
    lines.push("Voice & Language Preferences:")
    if (data.voicePreference) lines.push(`  Voice preference: ${data.voicePreference}`)
    if (data.voiceAccent) lines.push(`  Accent: ${data.voiceAccent}`)
    if (data.primaryLanguage) lines.push(`  Primary language: ${data.primaryLanguage}`)
    if (data.speakingStyle) lines.push(`  Speaking style: ${data.speakingStyle}`)
    if (data.additionalLanguages) lines.push(`  Additional languages: ${data.additionalLanguages}`)
  }

  // Overage interest
  if (data.overageInterested) {
    const cap = data.overageMonthlyCapGbp ? ` (cap: £${data.overageMonthlyCapGbp}/month)` : ""
    lines.push("")
    lines.push(`Interested in additional minutes${cap}`)
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
  ]

  if (data.planTier) {
    rows.push({ label: "Selected Plan", value: planTierLabel(data.planTier) })
  }

  if (data.guardInterested) {
    const locations = data.guardLocationCount ? ` (${data.guardLocationCount} locations)` : ""
    rows.push({ label: "Relaunch Guard", value: `Interested${locations}` })
  }

  rows.push(
    { label: "Name", value: data.fullName },
    { label: "Email", value: data.email },
    { label: "Phone", value: data.phone },
    { label: "Business", value: data.businessName },
    { label: "Trade", value: data.trade },
    { label: "Country", value: data.country },
  )

  if (data.locations) {
    rows.push({ label: "Locations", value: data.locations })
  }

  if (data.websiteUrl) {
    rows.push({ label: "Website", value: data.websiteUrl })
  }

  // Custom plan requirements
  if (data.planTier === "custom") {
    const customParts: string[] = []
    if (data.customMonthlyMinutes) customParts.push(`Monthly minutes: ${data.customMonthlyMinutes}`)
    if (data.customMonthlyCalls) customParts.push(`Monthly calls: ${data.customMonthlyCalls}`)
    if (data.customPhoneNumbers) customParts.push(`Phone numbers: ${data.customPhoneNumbers}`)
    if (data.customLocations) customParts.push(`Locations: ${data.customLocations}`)
    if (data.customLanguages) customParts.push(`Languages: ${data.customLanguages}`)
    if (data.customRequirements) customParts.push(`Additional requirements:\n${data.customRequirements}`)
    if (customParts.length) {
      rows.push({ label: "Custom Plan Requirements", value: customParts.join("\n") })
    }
  }

  // Voice preferences
  if (data.voicePreference || data.voiceAccent || data.primaryLanguage || data.speakingStyle || data.additionalLanguages) {
    const voiceParts: string[] = []
    if (data.voicePreference) voiceParts.push(`Voice: ${data.voicePreference}`)
    if (data.voiceAccent) voiceParts.push(`Accent: ${data.voiceAccent}`)
    if (data.primaryLanguage) voiceParts.push(`Primary language: ${data.primaryLanguage}`)
    if (data.speakingStyle) voiceParts.push(`Speaking style: ${data.speakingStyle}`)
    if (data.additionalLanguages) voiceParts.push(`Additional languages: ${data.additionalLanguages}`)
    rows.push({ label: "Voice & Language Preferences", value: voiceParts.join("\n") })
  }

  // Overage interest
  if (data.overageInterested) {
    const cap = data.overageMonthlyCapGbp ? ` (cap: £${data.overageMonthlyCapGbp}/month)` : ""
    rows.push({ label: "Additional Minutes Interest", value: `Yes${cap}` })
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
