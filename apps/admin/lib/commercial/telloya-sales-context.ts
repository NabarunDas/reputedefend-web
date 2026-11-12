import type { EnquiryPayload } from "../enquiries/model"
import { telloyaPlanInterestLabel } from "./telloya-admin-journey"
import type { OnboardingView } from "./onboarding"
import type { TelloyaOfferPanel } from "../../app/enquiries/telloya-offer-actions"
import { formatGbpPence, previewTelloyaOffer } from "./telloya-offer"

export type TelloyaSalesException =
  | "resolve_customer"
  | "confirm_business_authority"
  | "confirm_operating_location"
  | "resolve_business"
  | "revoked_membership"
  | "custom_quote_required"
  | "plan_interest_missing"

export type TelloyaSalesBlocker =
  | "demonstration_not_completed"
  | "approved_catalogue_missing"
  | "service_agreement_missing"
  | "tax_treatment_unconfigured"
  | "business_authority_unverified"
  | "operating_location_unconfirmed"
  | "offer_already_prepared"

export type TelloyaSalesWorkspace = {
  available: boolean
  primaryAction: "prepare_review" | "queue_mail" | "wait" | "none"
  primaryLabel: string
  product: "TELLOYA"
  planInterest: string
  planTier: string | null
  customerSummary: string
  businessSummary: string
  voiceLocationSummary: string
  guardInterestSummary: string
  illustrativeMonthly: string | null
  exceptions: { code: TelloyaSalesException; message: string }[]
  blockers: { code: TelloyaSalesBlocker; message: string }[]
  sendable: boolean
  needsReconciliation: boolean
  onboardingStep: string | null
}

const tierOf = (value: string | undefined) => {
  const tier = (value ?? "").trim().toLowerCase()
  return tier === "basic" || tier === "growth" || tier === "pro" || tier === "custom" ? tier : null
}

export function telloyaSalesBootstrapAllowed(
  flag: string | undefined = process.env.TELLOYA_ADMIN_JOURNEY_ENABLED,
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  return flag === "true" && vercelEnv !== "production"
}

export function buildTelloyaSalesWorkspace(input: {
  payload: EnquiryPayload
  demoStatus: "NOT_BOOKED" | "BOOKED" | "COMPLETED" | null
  onboarding: OnboardingView
  offer: TelloyaOfferPanel
}): TelloyaSalesWorkspace | null {
  if (input.payload.source !== "telloya") return null
  const demoCompleted = input.demoStatus === "COMPLETED"
  const planTier = tierOf(input.payload.planTier)
  const exceptions: TelloyaSalesWorkspace["exceptions"] = []
  const blockers: TelloyaSalesWorkspace["blockers"] = []

  if (!demoCompleted) {
    blockers.push({
      code: "demonstration_not_completed",
      message: "Complete the offline demonstration before preparing a personalised offer.",
    })
  }

  const onboarding = input.onboarding.supported ? input.onboarding : null
  const request = onboarding?.request ?? null
  const needsReconciliation = demoCompleted && (
    !request
    || onboarding?.step === "classify"
    || onboarding?.step === "customer"
    || onboarding?.step === "business"
    || onboarding?.step === "locations"
  )

  if (!planTier) {
    exceptions.push({
      code: "plan_interest_missing",
      message: "The enquiry did not record a Basic, Growth, Pro or Custom preference. Confirm the plan before preparing a sendable offer.",
    })
  } else if (planTier === "custom") {
    exceptions.push({
      code: "custom_quote_required",
      message: "Custom remains quotation-only. Owner approval is required before a priced offer can be prepared.",
    })
  }

  if (onboarding?.step === "customer" && onboarding.candidates.length > 1) {
    exceptions.push({
      code: "resolve_customer",
      message: "More than one customer matches this enquiry email. Choose the correct customer before continuing.",
    })
  }

  if (onboarding?.membership === "revoked") {
    exceptions.push({
      code: "revoked_membership",
      message: "Business authority has been withdrawn. Matching does not restore it.",
    })
  } else if (onboarding?.membership === "pending" || (request?.businessId && !onboarding?.membership)) {
    exceptions.push({
      code: "confirm_business_authority",
      message: "Confirm business authority. Pending membership is not verified authority.",
    })
  } else if (onboarding?.businesses.some(item => item.membership === "revoked") && !onboarding.membership) {
    exceptions.push({
      code: "revoked_membership",
      message: "A linked business has withdrawn authority. Resolve that membership before offering.",
    })
  }

  if (onboarding?.step === "business") {
    const usable = onboarding.businesses.filter(item => item.membership !== "revoked")
    if (usable.length > 1) {
      exceptions.push({
        code: "resolve_business",
        message: "More than one business could apply. Confirm the matching business before continuing.",
      })
    } else if (usable.length === 1) {
      exceptions.push({
        code: "confirm_business_authority",
        message: "Confirm the business. A sole existing membership is not selected without matching enquiry evidence.",
      })
    } else if (usable.length === 0 && onboarding.businesses.some(item => item.membership === "revoked")) {
      exceptions.push({
        code: "revoked_membership",
        message: "Business authority has been withdrawn. Matching does not restore it.",
      })
    }
  }

  const selectedLocations = onboarding?.locations.filter(item => item.selected) ?? []
  if (
    demoCompleted
    && selectedLocations.length === 0
    && onboarding?.step !== "business"
    && onboarding?.step !== "customer"
    && (
      !request
      || onboarding?.step === "locations"
      || onboarding?.step === "next"
      || onboarding?.step === "classify"
    )
  ) {
    exceptions.push({
      code: "confirm_operating_location",
      message: "Confirm the operating location. Enquiry location text is not a verified service address, and a sole existing location is not selected automatically.",
    })
  }

  const plans = onboarding?.approvedPlans ?? []
  const offerable = plans.filter(plan => plan.offerable)
  if (demoCompleted && (!onboarding?.termsConfigured || offerable.length === 0)) {
    blockers.push({
      code: "approved_catalogue_missing",
      message: "Not sendable — approved Telloya plan catalogue is not configured.",
    })
    blockers.push({
      code: "service_agreement_missing",
      message: "Not sendable — approved service agreement and tax treatment are not configured.",
    })
    blockers.push({
      code: "tax_treatment_unconfigured",
      message: "Not sendable — tax treatment is not configured.",
    })
  }
  if (onboarding?.membership !== "verified") {
    blockers.push({
      code: "business_authority_unverified",
      message: "Business authority must be verified before a sendable offer can be prepared.",
    })
  }
  if (selectedLocations.length === 0) {
    blockers.push({
      code: "operating_location_unconfirmed",
      message: "An operating location must be confirmed before a sendable offer can be prepared.",
    })
  }
  if (input.offer.availability === "ready") {
    blockers.push({
      code: "offer_already_prepared",
      message: `Commercial offer ${input.offer.offerRef} is already linked. Review that offer rather than creating another.`,
    })
  }

  const preview = previewTelloyaOffer(planTier ?? undefined, input.payload.guardLocationCount)
  const illustrativeMonthly = preview?.monthlyTotalPence != null
    ? `${formatGbpPence(preview.monthlyTotalPence)} illustrative catalogue total`
    : null

  const customerSummary = onboarding?.customer
    ? `${onboarding.customer.name || "Customer"}${onboarding.emailVerified ? " · email verified" : " · email not verified"}`
    : [input.payload.fullName, input.payload.email, input.payload.phone].filter(Boolean).join(" · ") || "Customer details from the enquiry"

  const businessSummary = onboarding?.businesses.find(item => item.id === request?.businessId)?.name
    || input.payload.businessName
    || "Business details from the enquiry"

  const voiceLocationSummary = selectedLocations.length > 0
    ? selectedLocations.map(item => `${item.name || "Location"} · ${item.country}`).join("; ")
    : input.payload.locations?.trim() || input.payload.country || "Proposed location needs confirmation"

  const guardCount = input.payload.guardLocationCount
  const guardInterestSummary = input.payload.guardInterested
    ? `Guard interest recorded${typeof guardCount === "number" ? ` for ${guardCount} location${guardCount === 1 ? "" : "s"}` : ""}. Unticked until Admin chooses Guard locations.`
    : "No Guard interest recorded. Guard stays unselected until Admin chooses locations."

  const blockingException = exceptions.length > 0
  const sendable = demoCompleted
    && !blockingException
    && onboarding?.membership === "verified"
    && selectedLocations.length > 0
    && Boolean(onboarding.termsConfigured)
    && offerable.length > 0
    && input.offer.availability !== "ready"

  let primaryAction: TelloyaSalesWorkspace["primaryAction"] = "none"
  let primaryLabel = "Offer workspace unavailable"
  if (!demoCompleted) {
    primaryAction = "none"
    primaryLabel = "Complete the offline demonstration first"
  } else if (input.offer.availability === "ready" && input.offer.state === "OFFERED" && !input.offer.emailQueued) {
    primaryAction = "queue_mail"
    primaryLabel = "Queue offer email"
  } else if (input.offer.availability === "ready") {
    primaryAction = "wait"
    primaryLabel = "Review the linked commercial offer"
  } else {
    primaryAction = "prepare_review"
    primaryLabel = sendable ? "Prepare personalised offer" : "Review personalised offer draft"
  }

  return {
    available: true,
    primaryAction,
    primaryLabel,
    product: "TELLOYA",
    planInterest: telloyaPlanInterestLabel(planTier ?? undefined),
    planTier,
    customerSummary,
    businessSummary,
    voiceLocationSummary,
    guardInterestSummary,
    illustrativeMonthly,
    exceptions,
    blockers: [...new Map(blockers.map(item => [item.code, item])).values()],
    sendable,
    needsReconciliation: Boolean(needsReconciliation),
    onboardingStep: onboarding?.step ?? null,
  }
}
