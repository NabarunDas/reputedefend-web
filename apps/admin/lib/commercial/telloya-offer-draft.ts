import {
  overagePolicy,
  relaunchGuardAddon,
  telloyaPlans,
  type TelloyaPlanTier,
} from "../../../telloya/lib/pricing"
import { formatGbpPence, poundsToPence, telloyaCataloguePence, telloyaGuardLocationPence, telloyaOveragePence } from "./telloya-offer"

export type TelloyaDraftPlanTier = TelloyaPlanTier

export type TelloyaOfferDraftSelection = {
  planTier: TelloyaDraftPlanTier | null
  proposedGuardQuantity: number
  guardLocationIds: string[]
  overageOptIn: boolean
  overageCapPence: number | null
  notes: string
  version: number
}

export type TelloyaDraftEstimate = {
  planTier: TelloyaDraftPlanTier | null
  planName: string | null
  planAmountPence: number | null
  includedMinutes: number | null
  proposedGuardQuantity: number
  guardUnitPence: number
  guardAmountPence: number
  monthlyTotalPence: number | null
  quotationRequired: boolean
  overageOptIn: boolean
  overageRatePence: number
  overageCapPence: number | null
  overageLabel: string | null
  summaryLines: string[]
  totalLabel: string
}

export type TelloyaOfferDraftPanel =
  | { availability: "closed" | "unavailable" | "locked" }
  | ({ availability: "ready" } & TelloyaOfferDraftSelection)

const PLAN_TIERS = new Set<TelloyaDraftPlanTier>(["basic", "growth", "pro", "custom"])

export function parseTelloyaDraftPlanTier(value: unknown): TelloyaDraftPlanTier | null {
  if (typeof value !== "string") return null
  const tier = value.trim().toLowerCase()
  return PLAN_TIERS.has(tier as TelloyaDraftPlanTier) ? tier as TelloyaDraftPlanTier : null
}

export function emptyTelloyaOfferDraft(prefillTier: string | null | undefined = null): TelloyaOfferDraftSelection {
  return {
    planTier: parseTelloyaDraftPlanTier(prefillTier),
    proposedGuardQuantity: 0,
    guardLocationIds: [],
    overageOptIn: false,
    overageCapPence: null,
    notes: "",
    version: 0,
  }
}

export function estimateTelloyaDraft(input: {
  planTier: TelloyaDraftPlanTier | null
  proposedGuardQuantity: number
  overageOptIn?: boolean
  overageCapPence?: number | null
}): TelloyaDraftEstimate {
  const quantity = Number.isInteger(input.proposedGuardQuantity) && input.proposedGuardQuantity >= 0
    ? Math.min(input.proposedGuardQuantity, 50)
    : 0
  const overageOptIn = input.overageOptIn === true
  const overageCapPence = overageOptIn && Number.isInteger(input.overageCapPence) && (input.overageCapPence ?? 0) > 0
    ? input.overageCapPence ?? null
    : null
  const catalogue = input.planTier ? telloyaCataloguePence(input.planTier) : null
  const plan = input.planTier ? telloyaPlans.find(item => item.tier === input.planTier) ?? null : null
  const quotationRequired = input.planTier === "custom" || catalogue?.amountPence === null
  const planAmountPence = quotationRequired ? null : catalogue?.amountPence ?? null
  const guardAmountPence = quantity * telloyaGuardLocationPence
  const monthlyTotalPence = planAmountPence === null ? null : planAmountPence + guardAmountPence
  const summaryLines: string[] = []
  if (!input.planTier) {
    summaryLines.push("Choose a Telloya plan to calculate the draft monthly total.")
  } else if (quotationRequired) {
    summaryLines.push(`${plan?.name ?? "Custom"} requires a separate quotation.`)
  } else if (planAmountPence !== null) {
    summaryLines.push(`${plan?.name ?? "Plan"} ${formatGbpPence(planAmountPence)} / month`)
    if (catalogue?.includedMinutes != null) summaryLines.push(`${catalogue.includedMinutes} included minutes`)
  }
  if (quantity > 0) {
    summaryLines.push(`Relaunch Guard × ${quantity} at ${formatGbpPence(telloyaGuardLocationPence)} = ${formatGbpPence(guardAmountPence)}`)
  } else {
    summaryLines.push("Relaunch Guard off")
  }
  summaryLines.push("Standard setup included. One operating location and one number on standard tiers.")
  let overageLabel: string | null = null
  if (overageOptIn) {
    overageLabel = overageCapPence
      ? `Overage proposed at ${formatGbpPence(telloyaOveragePence)}/min with a ${formatGbpPence(overageCapPence)} spending cap (not part of the fixed monthly total; subject to customer opt-in).`
      : `Overage proposed at ${formatGbpPence(telloyaOveragePence)}/min — set a spending cap to complete the proposal (still not customer consent).`
    summaryLines.push(overageLabel)
  } else {
    summaryLines.push(`Overage not proposed. ${formatGbpPence(telloyaOveragePence)}/min only after a customer-approved opt-in and spending cap.`)
  }
  return {
    planTier: input.planTier,
    planName: plan?.name ?? null,
    planAmountPence,
    includedMinutes: catalogue?.includedMinutes ?? null,
    proposedGuardQuantity: quantity,
    guardUnitPence: telloyaGuardLocationPence,
    guardAmountPence,
    monthlyTotalPence,
    quotationRequired,
    overageOptIn,
    overageRatePence: telloyaOveragePence,
    overageCapPence,
    overageLabel,
    summaryLines,
    totalLabel: monthlyTotalPence === null
      ? (quotationRequired ? "Quotation required" : "Choose a plan")
      : `${formatGbpPence(monthlyTotalPence)} / month`,
  }
}

export function draftChecklist(input: {
  termsConfigured: boolean
  offerablePlans: number
  membershipVerified: boolean
  selectedLocations: number
  offerReady: boolean
  mailReady?: boolean
}): { code: string; label: string; ready: boolean }[] {
  return [
    { code: "catalogue", label: "Approved Telloya plan catalogue", ready: input.offerablePlans > 0 },
    { code: "terms", label: "Approved service agreement and tax treatment", ready: input.termsConfigured },
    { code: "authority", label: "Verified business authority", ready: input.membershipVerified },
    { code: "location", label: "Confirmed operating location", ready: input.selectedLocations > 0 },
    { code: "offer", label: "Official offer prepared", ready: input.offerReady },
    { code: "mail", label: "Offer email controls approved", ready: input.mailReady === true },
  ]
}

export function mapDraftTierToApprovedPlan<T extends { tierCode: string | null; offerable: boolean }>(
  plans: T[],
  planTier: TelloyaDraftPlanTier | null,
): T | null {
  if (!planTier || planTier === "custom") return null
  const wanted = planTier.toUpperCase()
  return plans.find(plan => plan.offerable && (plan.tierCode ?? "").toUpperCase() === wanted) ?? null
}

export function guardQuantityForDraft(input: {
  proposedGuardQuantity: number
  guardLocationIds: string[]
  confirmedLocationCount: number
}): number {
  if (input.guardLocationIds.length > 0) return input.guardLocationIds.length
  if (!Number.isInteger(input.proposedGuardQuantity) || input.proposedGuardQuantity < 0) return 0
  return Math.min(input.proposedGuardQuantity, 50)
}

export const telloyaDraftPricingFacts = {
  plans: telloyaPlans.map(plan => ({
    tier: plan.tier,
    name: plan.name,
    monthlyPriceGbp: plan.monthlyPriceGbp,
    minutesPerMonth: plan.minutesPerMonth,
    popular: plan.popular === true,
    amountPence: plan.monthlyPriceGbp === null ? null : poundsToPence(plan.monthlyPriceGbp),
  })),
  guardUnitPence: telloyaGuardLocationPence,
  guardName: relaunchGuardAddon.name,
  overageRatePence: telloyaOveragePence,
  overageRequiresOptIn: overagePolicy.requiresOptIn,
  overageRequiresCap: overagePolicy.requiresSpendingCap,
} as const
