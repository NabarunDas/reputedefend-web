/**
 * Guided Step 6 reads the existing commercial projection.
 *
 * A draft, an offer, an open acceptance link, a declined quote and an expired
 * quote do not finish the step. Only an accepted quote on a complete list does.
 * The approved assessment pathway is shown here and is not written to
 * `service_track`. Purchasing-establishment and tax eligibility stay on the
 * existing offer command. This module does not add a country list.
 */

import type { AssessmentJudgement } from "./assessment"
import type { CaseFlowFacts, CaseServiceTrack } from "../case-flow/model"
import { commercialQuotesTied, summariseCommercial } from "../case-flow/resolve"
import {
  currentApprovedPrice,
  quoteServiceForCase,
  type CommercialPriceChoice,
} from "../commercial-workspace/model"
import { formatGbp, paymentModelLabel, serviceLabel, taxLabel, type PriceVersion, type QuoteListItem } from "../commerce/model"
import { ukDate } from "../admin/activity"
import { preservedQuoteWording } from "../../../../lib/commercial/scope-templates"

export type JourneyQuoteCommands = {
  draft: boolean
  setTax: boolean
  offer: boolean
  issueAcceptance: boolean
  revokeAcceptance: boolean
}

export type JourneyQuoteRecord = {
  quoteId: string
  version: number
  quoteVersionId: string
  actionId: string | null
  publicRef: string
  serviceName: string
  amountLabel: string
  tax: string
  validUntilLabel: string
  scope: string
  exclusions: string
  templateVersion: string | null
}

export type JourneyQuotePanel = {
  pathway: "GUIDED" | "MANAGED" | null
  trackNote: string
  headline: string
  detail: string
  notices: string[]
  priceChoice: CommercialPriceChoice | null
  quote: JourneyQuoteRecord | null
  commands: JourneyQuoteCommands
}

const noCommands: JourneyQuoteCommands = {
  draft: false,
  setTax: false,
  offer: false,
  issueAcceptance: false,
  revokeAcceptance: false,
}

/** The service a quote may name. An undecided track follows the recommendation and is not updated. */
export function quoteServiceForRecommendation(
  track: CaseServiceTrack,
  caseType: string,
  pathway: "GUIDED" | "MANAGED" | null,
): string | null {
  if (track === "GUIDED" || track === "MANAGED") return quoteServiceForCase(track, caseType)
  if (track === "UNDECIDED" && pathway) return quoteServiceForCase(pathway, caseType)
  return null
}

function approvedPathway(assessment: AssessmentJudgement | null | undefined): "GUIDED" | "MANAGED" | null {
  if (!assessment || assessment.phase !== "approved") return null
  if (assessment.pathway === "GUIDED" || assessment.pathway === "MANAGED") return assessment.pathway
  return null
}

function trackNote(track: CaseServiceTrack, pathway: "GUIDED" | "MANAGED" | null): string {
  const recommended = pathway === "GUIDED" ? "Guided" : pathway === "MANAGED" ? "Managed" : null
  if (!recommended) {
    return "No current approved pathway is on file. A recommendation would not select the service track, and it is not the customer's agreement."
  }
  if (track === "UNDECIDED") {
    return `The approved assessment recommends ${recommended}. The service track stays not chosen. Drafting a quote for that recommendation does not select the track and is not the customer's agreement.`
  }
  const selected = track === "GUIDED" ? "Guided" : "Managed"
  if (track === pathway) {
    return `The approved assessment recommends ${recommended}. The service track is already ${selected}. This step does not change it. The recommendation is not the customer's agreement.`
  }
  return `The approved assessment recommends ${recommended}. The selected service track is ${selected}. This step does not change the selected track. A quote prepared here follows the selected track.`
}

function closedReplacement(status: string | undefined): boolean {
  return status === "EXPIRED" || status === "DECLINED" || status === "CANCELLED" || status === "SUPERSEDED"
}

export function buildJourneyQuotePanel(input: {
  facts: CaseFlowFacts
  now: string
  assessment: AssessmentJudgement | null
  prices: PriceVersion[]
  quote: QuoteListItem | null
  quoteDetailMissing: boolean
}): JourneyQuotePanel {
  const commercial = summariseCommercial(input.facts, input.now)
  const pathway = approvedPathway(input.assessment)
  const tied = commercialQuotesTied(input.facts)
  const notices: string[] = []
  const serviceCode = quoteServiceForRecommendation(input.facts.serviceTrack, input.facts.caseType, pathway)
  const price = serviceCode ? currentApprovedPrice(input.prices, serviceCode, input.now) : null
  const priceChoice: CommercialPriceChoice | null = price && price !== "ambiguous" ? {
    id: price.id,
    serviceCode: price.serviceCode,
    serviceName: price.displayName || serviceLabel(price.serviceCode),
    amountLabel: formatGbp(price.amountMinor),
    paymentLabel: paymentModelLabel(price.paymentModel),
  } : null
  const named = commercial.quote
  const matched = input.quote && named && input.quote.id === named.id ? input.quote : null
  const statusDisagrees = !!matched && !!named && input.quote?.status !== named.status
  const identityDisagrees = !!named && !!input.quote && input.quote.id !== named.id
  const blocked = !input.facts.commercial.complete || tied || input.quoteDetailMissing || statusDisagrees || identityDisagrees

  if (!input.facts.commercial.complete) {
    notices.push("The quote list may be incomplete, so no quote action is offered from this step.")
  }
  if (tied) {
    notices.push("More than one quote shares the same relevance, so none is treated as the current quote.")
  }
  if (input.quoteDetailMissing || identityDisagrees) {
    notices.push("The quote named for this case could not be loaded, so it cannot be offered or issued from here.")
  } else if (statusDisagrees) {
    notices.push("The quote detail and the case projection do not show the same status, so no quote action is offered.")
  }
  if (price === "ambiguous") {
    notices.push("More than one current price matches this service, so no price has been chosen.")
  }

  const storedWording = matched
    ? preservedQuoteWording({
      scope: matched.currentVersion.scope,
      exclusions: matched.currentVersion.exclusions,
    })
    : null
  const quote: JourneyQuoteRecord | null = matched && storedWording ? {
    quoteId: matched.id,
    version: matched.version,
    quoteVersionId: matched.currentVersion.id,
    actionId: matched.action?.status === "OPEN" ? matched.action.id : null,
    publicRef: matched.publicRef,
    serviceName: matched.currentVersion.serviceName || serviceLabel(matched.currentVersion.serviceCode),
    amountLabel: `${formatGbp(matched.currentVersion.totalAmountMinor)} ${matched.currentVersion.currency}`,
    tax: taxLabel(matched.currentVersion.taxBehaviour),
    validUntilLabel: ukDate(matched.currentVersion.validUntil),
    scope: storedWording.scope,
    exclusions: storedWording.exclusions,
    templateVersion: storedWording.templateVersion,
  } : null

  const liveDraft = commercial.state === "DRAFT_UNCONFIGURED" || commercial.state === "DRAFT_READY"
  const liveOffered = commercial.state === "OFFERED_AWAITING" || commercial.state === "OFFERED_NO_LINK"
  const canReplace = !named || closedReplacement(named.status)
  const trustReady = input.facts.authorization.customerEmailVerified && input.facts.authorization.businessAuthorityVerified
  const commands: JourneyQuoteCommands = blocked ? noCommands : {
    draft: canReplace && !liveDraft && !liveOffered && commercial.state !== "ACCEPTED" && !!priceChoice,
    setTax: commercial.state === "DRAFT_UNCONFIGURED" && !!quote,
    offer: commercial.state === "DRAFT_READY" && !!quote,
    issueAcceptance: commercial.state === "OFFERED_NO_LINK" && !!quote && trustReady,
    revokeAcceptance: liveOffered && !!quote?.actionId,
  }
  if (!blocked && canReplace && !commands.draft && commercial.state !== "ACCEPTED" && !liveDraft && !liveOffered && !priceChoice) {
    notices.push("A quote cannot be drafted until one current approved price matches the service. No price has been invented.")
  }
  if (!blocked && commercial.state === "OFFERED_NO_LINK" && !trustReady) {
    notices.push("The acceptance link stays closed until the customer's email and business authority are verified. Those are the existing customer-action checks.")
  }

  const headline = !input.facts.commercial.complete
    ? "Quote list incomplete"
    : tied
      ? "Quote not confirmed"
      : commercial.state === "ACCEPTED"
      ? "Quote accepted"
      : commercial.state === "DECLINED"
        ? "Quote declined"
        : named?.status === "EXPIRED"
          ? "Quote expired"
          : commercial.acceptanceExpired
            ? "Acceptance link expired"
            : commercial.state === "OFFERED_AWAITING" || commercial.state === "OFFERED_NO_LINK"
              ? "Quote offered"
              : commercial.state === "DRAFT_UNCONFIGURED" || commercial.state === "DRAFT_READY"
                ? "Draft quote"
                : named?.status === "SUPERSEDED"
                  ? "Quote superseded"
                  : named?.status === "CANCELLED"
                    ? "Quote cancelled"
                    : "No quote"

  const summary = !input.facts.commercial.complete
    ? "An accepted row in an incomplete list does not finish this step."
    : tied
      ? "More than one quote shares the same relevance, so none is treated as accepted."
      : commercial.state === "ACCEPTED"
      ? "The customer accepted this quote. Acceptance does not activate the service and does not take a payment."
      : commercial.state === "DECLINED"
        ? "The customer declined this quote. A declined quote is not acceptance."
        : named?.status === "EXPIRED"
          ? "This quote has expired. An expired quote is not acceptance."
          : commercial.acceptanceExpired
            ? "The acceptance link has expired. The quote is still offered. An expired link is not acceptance."
            : commercial.state === "OFFERED_AWAITING"
              ? "An acceptance link is open. Opening the contract is not acceptance."
              : commercial.state === "OFFERED_NO_LINK"
                ? "The quote is offered. There is no usable acceptance link. Offering the quote is not acceptance."
                : commercial.state === "DRAFT_UNCONFIGURED"
                  ? "Tax treatment is not confirmed. Reviewing the draft does not offer it and does not finish this step."
                  : commercial.state === "DRAFT_READY"
                    ? "The draft can be offered. Offering it is the binding issuance, and the existing purchasing-establishment and tax eligibility checks still have to pass."
                    : named?.status === "SUPERSEDED"
                      ? "This quote was superseded. A superseded quote is not acceptance."
                      : named?.status === "CANCELLED"
                        ? "This quote was cancelled. A cancelled quote is not acceptance."
                        : "No quote is on file."

  return {
    pathway,
    trackNote: trackNote(input.facts.serviceTrack, pathway),
    headline,
    detail: summary,
    notices,
    priceChoice: commands.draft ? priceChoice : null,
    quote,
    commands,
  }
}
