import type { TelloyaOfferVersion } from "./telloya-offer"

export type TelloyaOfferMessage = {
  subject: string
  text: string
  html: string
  idempotencyKey: string
  reviewPath: string
}

export type TelloyaQueuedMessage = TelloyaOfferMessage & {
  state: "queued" | "provider_accepted" | "delivered" | "failed" | "blocked"
}

export type TelloyaAmendment = {
  offerVersion: number
  message: string
  categories: string[]
  state: "open" | "accepted" | "rejected"
}

const CATEGORIES = new Set(["price", "minutes", "guard", "timing", "other"])

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
}

export function telloyaOfferMessage(input: {
  enquiryRef: string
  customerId: string
  selector: string
  version: TelloyaOfferVersion
  customerName?: string | null
}): TelloyaOfferMessage | null {
  if (!/^TY-\d{2}-[A-Z0-9]{6}$/.test(input.enquiryRef)) return null
  if (!input.customerId || input.selector === input.enquiryRef || !/^[A-Za-z0-9-]{12,40}$/.test(input.selector)) return null
  const guard = input.version.guardLocations > 0
  const name = input.customerName?.trim() || ""
  const greeting = name ? `Hello ${name},` : "Hello,"
  const subject = `Your Telloya proposal — ${input.enquiryRef}`
  const reviewPath = `/portal/onboarding/offer/${input.selector}`
  const price = input.version.monthlyTotalPence === null
    ? "a price confirmed in the offer"
    : `£${(input.version.monthlyTotalPence / 100).toFixed(2)} per month`
  const planLabel = input.version.planCode === "custom"
    ? "Custom"
    : `${input.version.planCode[0].toUpperCase()}${input.version.planCode.slice(1)}`
  const minutesText = input.version.includedMinutes === null
    ? "confirmed in the quotation"
    : String(input.version.includedMinutes)
  const guardText = guard
    ? `${input.version.guardLocations} Relaunch Guard location${input.version.guardLocations === 1 ? "" : "s"} are listed. Guard monitoring is not active.`
    : "not included"
  const text = [
    greeting,
    "",
    "Telloya — a ProfileRelaunch company",
    `Enquiry ${input.enquiryRef}`,
    `Plan: ${planLabel}`,
    `Included minutes: ${minutesText}`,
    `Recurring monthly total: ${price}`,
    `Relaunch Guard: ${guardText}`,
    "Standard setup is included. One operating location and one receptionist number apply on standard tiers.",
    "",
    "Next steps:",
    "1. Review your offer in the Customer Portal.",
    "2. Request changes, or accept the versioned service agreement and recurring consent.",
    "3. Continue to secure payment when that step is available.",
    "",
    "Review your offer",
    reviewPath,
    "This link is not a payment link.",
  ].join("\n")
  const html = [
    '<div style="font-family:Georgia,serif;color:#15202b;line-height:1.5;max-width:560px">',
    '<p style="margin:0 0 12px 0;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#5b6b7c">Telloya — a ProfileRelaunch company</p>',
    `<p style="margin:0 0 16px 0">${escapeHtml(greeting)}</p>`,
    `<p style="margin:0 0 8px 0">Enquiry <strong>${escapeHtml(input.enquiryRef)}</strong></p>`,
    `<p style="margin:0 0 4px 0">Plan: <strong>${escapeHtml(planLabel)}</strong></p>`,
    `<p style="margin:0 0 4px 0">Included minutes: ${escapeHtml(minutesText)}</p>`,
    `<p style="margin:0 0 16px 0"><strong>Recurring monthly total: ${escapeHtml(price)}</strong></p>`,
    `<p style="margin:0 0 16px 0">Relaunch Guard: ${escapeHtml(guardText)}</p>`,
    '<p style="margin:0 0 8px 0"><strong>Next steps</strong></p>',
    '<ol style="margin:0 0 20px 20px;padding:0">',
    "<li>Review your offer in the Customer Portal.</li>",
    "<li>Request changes, or accept the versioned service agreement and recurring consent.</li>",
    "<li>Continue to secure payment when that step is available.</li>",
    "</ol>",
    `<p style="margin:0 0 12px 0"><a href="${escapeHtml(reviewPath)}">Review your offer</a></p>`,
    '<p style="margin:0;color:#5b6b7c;font-size:13px">This link is not a payment link.</p>',
    "</div>",
  ].join("")
  return {
    subject,
    text,
    html,
    idempotencyKey: `${input.customerId}:${input.version.version}:${input.version.termsHash}:offer`,
    reviewPath,
  }
}

export function queueTelloyaOfferEmail(existing: TelloyaQueuedMessage[], version: TelloyaOfferVersion | undefined, message: TelloyaOfferMessage | null): { result: string; messages: TelloyaQueuedMessage[] } {
  if (!version || version.fixture || version.status !== "SENT" || !message) return { result: "closed", messages: existing }
  if (existing.some(item => item.idempotencyKey === message.idempotencyKey)) return { result: "duplicate", messages: existing }
  return { result: "queued", messages: [...existing, { ...message, state: "queued" }] }
}

export function requestTelloyaAmendment(input: {
  versions: TelloyaOfferVersion[]
  amendments: TelloyaAmendment[]
  version: number
  message: string
  categories: string[]
  businessMatches: boolean
  emailVerified: boolean
}): { result: string; amendments: TelloyaAmendment[]; versions: TelloyaOfferVersion[] } {
  const current = input.versions.find(version => version.current)
  if (!input.businessMatches || !input.emailVerified) return { result: "forbidden", amendments: input.amendments, versions: input.versions }
  if (!current || current.version !== input.version || current.status !== "SENT") return { result: "stale_version", amendments: input.amendments, versions: input.versions }
  const message = input.message.trim()
  if (message.length < 3 || message.length > 1000) return { result: "invalid", amendments: input.amendments, versions: input.versions }
  if (input.categories.length === 0 || input.categories.some(category => !CATEGORIES.has(category))) return { result: "invalid", amendments: input.amendments, versions: input.versions }
  if (input.amendments.some(item => item.offerVersion === current.version && item.state === "open")) return { result: "duplicate", amendments: input.amendments, versions: input.versions }
  return {
    result: "requested",
    versions: input.versions,
    amendments: [...input.amendments, { offerVersion: current.version, message, categories: input.categories, state: "open" }],
  }
}

export function resolveTelloyaAmendment(input: {
  versions: TelloyaOfferVersion[]
  amendments: TelloyaAmendment[]
  decision: "accepted" | "rejected"
  replacement: TelloyaOfferVersion | null
}): { result: string; versions: TelloyaOfferVersion[]; amendments: TelloyaAmendment[] } {
  const open = input.amendments.find(item => item.state === "open")
  const current = input.versions.find(version => version.current)
  if (!open || !current || current.status !== "SENT") return { result: "closed", versions: input.versions, amendments: input.amendments }
  if (input.decision === "rejected") {
    return {
      result: "rejected",
      versions: input.versions,
      amendments: input.amendments.map(item => item === open ? { ...item, state: "rejected" } : item),
    }
  }
  if (!input.replacement || input.replacement.version !== current.version + 1 || input.replacement.termsHash === current.termsHash) {
    return { result: "invalid", versions: input.versions, amendments: input.amendments }
  }
  return {
    result: "revised",
    amendments: input.amendments.map(item => item === open ? { ...item, state: "accepted" } : item),
    versions: [
      ...input.versions.map(version => version.current ? { ...version, current: false, status: "SUPERSEDED" as const } : version),
      { ...input.replacement, current: true, status: "SENT" },
    ],
  }
}

export function acceptTelloyaOffer(input: {
  versions: TelloyaOfferVersion[]
  amendments: TelloyaAmendment[]
  version: number
  identityVerified: boolean
  businessMatches: boolean
  agreementHash: string | null
  recurringConsent: boolean
}): { result: string; versions: TelloyaOfferVersion[] } {
  const current = input.versions.find(version => version.current)
  if (!input.identityVerified || !input.businessMatches) return { result: "forbidden", versions: input.versions }
  if (!current || current.version !== input.version || current.status !== "SENT" || current.fixture) return { result: "stale_version", versions: input.versions }
  if (input.amendments.some(item => item.offerVersion === current.version && item.state === "open")) return { result: "amendment_open", versions: input.versions }
  if (!input.agreementHash || !input.recurringConsent) return { result: "consent_required", versions: input.versions }
  return {
    result: "accepted",
    versions: input.versions.map(version => version.current ? { ...version, status: "ACCEPTED" } : version),
  }
}
