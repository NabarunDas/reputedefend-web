/**
 * Standard Scope and Exclusions for a new draft quote.
 *
 * Prices, cadences and the published service lines come from `lib/pricing.ts`
 * and the approved website descriptions. The wording is stored on
 * `quote_versions.scope_text` and `quote_versions.exclusions_text`. A later
 * edit to this module does not rewrite a quote that has already been saved.
 */
import { pricingGroups, pricingNote } from "../pricing"

export const SCOPE_EXCLUSIONS_TEMPLATE_VERSION = "SCOPE-2026-10-21.1"

export const scopeServiceCodes = [
  "GUIDED_RELAUNCH",
  "MANAGED_RELAUNCH",
  "GUIDED_REVIEW",
  "MANAGED_REVIEW",
  "RELAUNCH_GUARD",
] as const

export type ScopeServiceCode = (typeof scopeServiceCodes)[number]

export type ScopeExclusionsTemplate = {
  serviceCode: ScopeServiceCode
  version: string
  scope: string
  exclusions: string
}

/** Approved Guided description on the website. */
export const publishedGuidedLine = "We prepare it. You submit it."
export const publishedGuidedCopy =
  "We organise the evidence and prepare what needs to be submitted. You remain the person who files it with Google."

/** Approved Managed description on the website. */
export const publishedManagedLine = "You authorise us. We manage the case."
export const publishedManagedCopy =
  "With your authorisation, we handle the case work after the assessment. You are not left to assemble and submit it alone."

/** Approved Relaunch Guard description on the website. */
export const publishedGuardLead =
  "We manually check your Google Business Profile and reviews each morning and evening, UK time, including weekends and bank holidays. If we spot a concerning change, we review it and email you with what we found and what to do next."
export const publishedGuardPoints = [
  "Two manual checks a day",
  "Email alerts after a human review",
  "Available without a recovery or review case",
] as const
export const publishedGuardBoundary =
  "Monitoring does not prevent suspensions or guarantee instant detection. Help with an appeal or review challenge is a separate service, with any fee agreed before work starts."

const guidedDelivery = "ProfileRelaunch prepares the work and the customer submits it."
const managedDelivery =
  "ProfileRelaunch carries out the authorised permitted work, subject to the applicable success-fee terms."

const VERSION_MARKER = "Standard wording version "

export function standardWordingVersionLine(version = SCOPE_EXCLUSIONS_TEMPLATE_VERSION): string {
  return `${VERSION_MARKER}${version}.`
}

function priced(groupId: string, name: string) {
  const group = pricingGroups.find(item => item.id === groupId)
  const item = group?.items.find(entry => entry.name === name)
  if (!item) throw new Error(`Missing published price for ${name}`)
  return item
}

function offer(groupId: string, name: string): string {
  const item = priced(groupId, name)
  const detail = item.detail && item.detail !== publishedGuidedLine ? ` ${item.detail}.` : ""
  return `${item.name} (${item.price} ${item.cadence}).${detail}`
}

function withVersion(body: string): string {
  return `${body}\n\n${standardWordingVersionLine()}`
}

const guidedRelaunch = offer("profile-recovery", "Guided Relaunch")
const managedRelaunch = offer("profile-recovery", "Managed Relaunch")
const guidedReview = offer("review-protection", "Guided Review")
const managedReview = offer("review-protection", "Managed Review")
const guard = priced("relaunch-guard", "Profile + Review monitoring")

const templates: Record<ScopeServiceCode, { scope: string; exclusions: string }> = {
  GUIDED_RELAUNCH: {
    scope: withVersion(
      `${guidedRelaunch} ${publishedGuidedLine} ${guidedDelivery} ${publishedGuidedCopy}`,
    ),
    exclusions: `${pricingNote} ProfileRelaunch does not submit the prepared profile work to Google. This quote does not include Managed case work, a success fee, or Relaunch Guard monitoring. Accepting this quote does not charge a card and is not payment authorisation.`,
  },
  MANAGED_RELAUNCH: {
    scope: withVersion(
      `${managedRelaunch} ${publishedManagedLine} ${publishedManagedCopy} ${managedDelivery}`,
    ),
    exclusions: `${pricingNote} This quote does not charge a fee today. Accepting it is not evidence that restoration has occurred and does not create a collectible fee today. It does not include Guided preparation for the customer to submit, or Relaunch Guard monitoring.`,
  },
  GUIDED_REVIEW: {
    scope: withVersion(
      `${guidedReview} ${publishedGuidedLine} ${guidedDelivery} ${publishedGuidedCopy}`,
    ),
    exclusions: `${pricingNote} ProfileRelaunch does not submit the prepared review work to Google. This quote does not include Managed removal work, a success fee, or Relaunch Guard monitoring. Accepting this quote does not charge a card and is not payment authorisation.`,
  },
  MANAGED_REVIEW: {
    scope: withVersion(
      `${managedReview} ${publishedManagedLine} ${publishedManagedCopy} ${managedDelivery}`,
    ),
    exclusions: `${pricingNote} This quote does not charge a fee today. Accepting it is not evidence that removal has occurred and does not create a collectible fee today. It does not include Guided preparation for the customer to submit, or Relaunch Guard monitoring.`,
  },
  RELAUNCH_GUARD: {
    scope: withVersion(
      `Relaunch Guard. ${guard.name} (${guard.price} ${guard.cadence}). ${publishedGuardLead} ${publishedGuardPoints.join(". ")}.`,
    ),
    exclusions: `${publishedGuardBoundary} ${pricingNote} Accepting this quote does not start monitoring and does not take payment.`,
  },
}

export function isScopeServiceCode(value: string): value is ScopeServiceCode {
  return (scopeServiceCodes as readonly string[]).includes(value)
}

/** Current standard wording for a new draft. Unknown services are not invented. */
export function standardScopeExclusions(serviceCode: string): ScopeExclusionsTemplate | null {
  if (!isScopeServiceCode(serviceCode)) return null
  const template = templates[serviceCode]
  return {
    serviceCode,
    version: SCOPE_EXCLUSIONS_TEMPLATE_VERSION,
    scope: template.scope,
    exclusions: template.exclusions,
  }
}

/** The template version written into saved scope text, if that quote used one. */
export function templateVersionUsed(scope: string): string | null {
  const start = scope.lastIndexOf(VERSION_MARKER)
  if (start < 0) return null
  const rest = scope.slice(start + VERSION_MARKER.length)
  const end = rest.indexOf(".")
  const revisionEnd = end < 0 ? -1 : rest.indexOf(".", end + 1)
  if (end <= 0 || revisionEnd <= end) return null
  const version = rest.slice(0, revisionEnd)
  if (!version.startsWith("SCOPE-") || version.includes(" ")) return null
  const dated = version.slice("SCOPE-".length).split(".")
  if (dated.length !== 2) return null
  const [date, revision] = dated
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d+$/.test(revision)) return null
  return version
}

/**
 * The words already stored on a quote version. This does not read the current
 * template and does not replace an edit, an existing quote, or an accepted
 * agreement.
 */
export function preservedQuoteWording(stored: { scope: string; exclusions: string }): {
  scope: string
  exclusions: string
  templateVersion: string | null
} {
  return {
    scope: stored.scope,
    exclusions: stored.exclusions,
    templateVersion: templateVersionUsed(stored.scope),
  }
}
