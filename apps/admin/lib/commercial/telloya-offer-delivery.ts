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

export function telloyaOfferMessage(input: {
  enquiryRef: string
  customerId: string
  selector: string
  version: TelloyaOfferVersion
}): TelloyaOfferMessage | null {
  if (!/^TY-\d{2}-[A-Z0-9]{6}$/.test(input.enquiryRef)) return null
  if (!input.customerId || input.selector === input.enquiryRef || !/^[A-Za-z0-9-]{12,40}$/.test(input.selector)) return null
  const guard = input.version.guardLocations > 0
  const subject = guard
    ? `Your Telloya + Relaunch Guard proposal — ${input.enquiryRef}`
    : input.version.planCode === "custom"
      ? `Your personalised Telloya proposal — ${input.enquiryRef}`
      : `Your Telloya ${input.version.planCode[0].toUpperCase()}${input.version.planCode.slice(1)} proposal — ${input.enquiryRef}`
  const reviewPath = `/portal/onboarding/offer/${input.selector}`
  const price = input.version.monthlyTotalPence === null ? "a price confirmed in the offer" : `£${(input.version.monthlyTotalPence / 100).toFixed(2)} per month`
  const text = [
    subject,
    `This proposal is ${price}.`,
    input.version.includedMinutes === null ? "The included minutes are quoted in the offer." : `${input.version.includedMinutes} minutes are included each month.`,
    guard ? `${input.version.guardLocations} Relaunch Guard locations are listed. Guard monitoring is not active.` : "Relaunch Guard is not included.",
    "Review your offer and subscribe",
    `Open ${reviewPath} after you sign in. This link is not a payment link.`,
  ].join("\n")
  return {
    subject,
    text,
    html: `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("\n", "</p><p>")}</p>`,
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
