/**
 * Standard Scope and Exclusions for a new draft quote.
 *
 * Prices, cadences and the published service lines come from `lib/pricing.ts`
 * and the approved website descriptions. The wording is stored on
 * `quote_versions.scope_text` and `quote_versions.exclusions_text`. A later
 * edit to this module does not rewrite a quote that has already been saved.
 */
import { pricingGroups, pricingNote } from "../pricing"

export const SCOPE_EXCLUSIONS_TEMPLATE_VERSION = "SCOPE-2026-10-21.2"

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

/** Paid-service agreement, section 12. VAT is not added, and the price is not described as a VAT charge. */
export const agreementTaxBoundary =
  "We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt."

export const finalCustomerPrice = "The price on this quote is the final customer price. No tax is added on top."

/**
 * Server-owned quote text. These sentences are copied so the standard wording
 * matches them. This module does not replace `success_definition_v1` or
 * `payment_timing_text_v1`.
 */
export const preservedSuccessDefinition = {
  GUIDED_RELAUNCH:
    "This is an upfront guided recovery service. Payment collection is a later step and is not taken by accepting this quote.",
  GUIDED_REVIEW:
    "This is an upfront guided review service. Payment collection is a later step and is not taken by accepting this quote.",
  MANAGED_RELAUNCH:
    "Success relates to the agreed successful restoration outcome. Google makes the final platform decision. Accepting this quote is not evidence that restoration has occurred and does not create a collectible fee today.",
  MANAGED_REVIEW:
    "Success relates to the agreed successful removal outcome. Google makes the final platform decision. Accepting this quote is not evidence that removal has occurred and does not create a collectible fee today.",
  RELAUNCH_GUARD:
    "This is a recurring monthly monitoring subscription quote. Accepting this quote does not start monitoring and does not take payment.",
} as const

export const preservedPaymentTiming = {
  UPFRONT:
    "The quoted amount is payable later through the payment workflow. Accepting this quote does not charge a card and is not payment authorisation.",
  SUCCESS_FEE:
    "No service fee is charged today. The quoted success fee becomes collectible only after the defined successful outcome and the later payment/consent workflow. Accepting this quote is not payment authorisation for future card charging.",
  RECURRING_MONTHLY:
    "Accepting this quote does not start monitoring and does not take payment. Recurring collection is a later step.",
} as const

const guidedFee =
  "A Guided fee is payable upfront only after you have accepted a valid quotation and this agreement."
const managedRestoration =
  "The fee is earned only when the original restriction is absent at an initial check and again at a second check at least 48 hours later, and the original restriction is not known to have returned between those checks."
const managedRemoval =
  "The fee is earned only when that specified review is absent at two checks at least 48 hours apart. Evidence that the same review returned during that period means that verification attempt has not succeeded. Reporting, hiding, a rating change, or an acknowledgement is not by itself a successful removal."
const managedNoAdvance =
  "There is no automatic card charge for a Managed success fee and no collection of that fee in advance."
const guardStart =
  "Monitoring for a location starts only after you have accepted the Guard order for that location, we have confirmed the access we asked for, and we have completed the initial check. Sending a setup form does not start monitoring and does not take payment."

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
      `${guidedRelaunch} The final customer price is £99 upfront. ${guidedDelivery} ${publishedGuidedLine} ${publishedGuidedCopy} ${guidedFee} ${finalCustomerPrice}`,
    ),
    exclusions: `${pricingNote} ProfileRelaunch does not submit the prepared profile work to Google. This quote does not include Managed case work, a success fee, or Relaunch Guard monitoring. ${preservedSuccessDefinition.GUIDED_RELAUNCH} ${preservedPaymentTiming.UPFRONT} ${agreementTaxBoundary}`,
  },
  MANAGED_RELAUNCH: {
    scope: withVersion(
      `${managedRelaunch} The final customer price is £299, payable only upon the contractually defined and verified successful restoration outcome, with no upfront service fee. ${publishedManagedLine} ${publishedManagedCopy} ${managedDelivery} ${managedRestoration} ${finalCustomerPrice}`,
    ),
    exclusions: `${pricingNote} ${preservedSuccessDefinition.MANAGED_RELAUNCH} ${preservedPaymentTiming.SUCCESS_FEE} ${managedNoAdvance} A pending outcome is not invoiced as success. This quote does not include Guided preparation for the customer to submit, or Relaunch Guard monitoring. ${agreementTaxBoundary}`,
  },
  GUIDED_REVIEW: {
    scope: withVersion(
      `${guidedReview} The final customer price is £59 upfront. ${guidedDelivery} ${publishedGuidedLine} ${publishedGuidedCopy} ${guidedFee} ${finalCustomerPrice}`,
    ),
    exclusions: `${pricingNote} ProfileRelaunch does not submit the prepared review work to Google. This quote does not include Managed removal work, a success fee, or Relaunch Guard monitoring. ${preservedSuccessDefinition.GUIDED_REVIEW} ${preservedPaymentTiming.UPFRONT} ${agreementTaxBoundary}`,
  },
  MANAGED_REVIEW: {
    scope: withVersion(
      `${managedReview} The final customer price is £149, payable only on the contractually defined and verified successful removal, with no upfront service fee. ${publishedManagedLine} ${publishedManagedCopy} ${managedDelivery} ${managedRemoval} ${finalCustomerPrice}`,
    ),
    exclusions: `${pricingNote} ${preservedSuccessDefinition.MANAGED_REVIEW} ${preservedPaymentTiming.SUCCESS_FEE} ${managedNoAdvance} A pending outcome is not invoiced as success. This quote does not include Guided preparation for the customer to submit, or Relaunch Guard monitoring. ${agreementTaxBoundary}`,
  },
  RELAUNCH_GUARD: {
    scope: withVersion(
      `Relaunch Guard. The final customer price is ${guard.price} per month per location. ${guard.name}. ${publishedGuardLead} ${publishedGuardPoints.join(". ")}. ${guardStart} ${finalCustomerPrice}`,
    ),
    exclusions: `${publishedGuardBoundary} ${pricingNote} ${preservedSuccessDefinition.RELAUNCH_GUARD} ${preservedPaymentTiming.RECURRING_MONTHLY} ${agreementTaxBoundary}`,
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
