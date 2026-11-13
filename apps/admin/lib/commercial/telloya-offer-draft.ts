import {
  overagePolicy,
  relaunchGuardAddon,
  telloyaPlans,
  type TelloyaPlanTier,
} from "../../../telloya/lib/pricing"
import { formatGbpPence, poundsToPence, telloyaCataloguePence, telloyaGuardLocationPence, telloyaOveragePence } from "./telloya-offer"

export type TelloyaDraftPlanTier = TelloyaPlanTier

export const CUSTOM_AMOUNT_MIN_PENCE = 1
export const CUSTOM_AMOUNT_MAX_PENCE = 10_000_000
export const CUSTOM_INCLUDED_MINUTES_MAX = 1_000_000

export type TelloyaOfferDraftSelection = {
  planTier: TelloyaDraftPlanTier | null
  customAmountPence: number | null
  customIncludedMinutes: number | null
  customRequirements: string
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
  customApprovalRequired: boolean
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

export function parseCustomAmountGbpInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === "") return null
  const match = trimmed.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const pounds = Number(match[1])
  const pencePart = match[2] ? Number(match[2].padEnd(2, "0")) : 0
  if (!Number.isInteger(pounds) || !Number.isInteger(pencePart) || pounds < 0 || pencePart < 0) return null
  if (pounds > Math.floor(CUSTOM_AMOUNT_MAX_PENCE / 100)) return null
  const pence = pounds * 100 + pencePart
  if (!Number.isInteger(pence) || pence < CUSTOM_AMOUNT_MIN_PENCE || pence > CUSTOM_AMOUNT_MAX_PENCE) return null
  return pence
}

export function formatCustomAmountGbpInput(pence: number | null): string {
  if (pence == null || !Number.isInteger(pence) || pence <= 0) return ""
  return (pence / 100).toFixed(2)
}

export function emptyTelloyaOfferDraft(prefillTier: string | null | undefined = null): TelloyaOfferDraftSelection {
  return {
    planTier: parseTelloyaDraftPlanTier(prefillTier),
    customAmountPence: null,
    customIncludedMinutes: null,
    customRequirements: "",
    proposedGuardQuantity: 0,
    guardLocationIds: [],
    overageOptIn: false,
    overageCapPence: null,
    notes: "",
    version: 0,
  }
}

export function draftSelectionSnapshot(selection: TelloyaOfferDraftSelection): Omit<TelloyaOfferDraftSelection, "version"> {
  return {
    planTier: selection.planTier,
    customAmountPence: selection.planTier === "custom" ? selection.customAmountPence : null,
    customIncludedMinutes: selection.planTier === "custom" ? selection.customIncludedMinutes : null,
    customRequirements: selection.planTier === "custom" ? selection.customRequirements : "",
    proposedGuardQuantity: selection.proposedGuardQuantity,
    guardLocationIds: [...selection.guardLocationIds].sort(),
    overageOptIn: selection.overageOptIn,
    overageCapPence: selection.overageOptIn ? selection.overageCapPence : null,
    notes: selection.notes,
  }
}

export function draftSelectionsEqual(left: TelloyaOfferDraftSelection, right: TelloyaOfferDraftSelection): boolean {
  const a = draftSelectionSnapshot(left)
  const b = draftSelectionSnapshot(right)
  return a.planTier === b.planTier
    && a.customAmountPence === b.customAmountPence
    && a.customIncludedMinutes === b.customIncludedMinutes
    && a.customRequirements === b.customRequirements
    && a.proposedGuardQuantity === b.proposedGuardQuantity
    && a.overageOptIn === b.overageOptIn
    && a.overageCapPence === b.overageCapPence
    && a.notes === b.notes
    && a.guardLocationIds.length === b.guardLocationIds.length
    && a.guardLocationIds.every((id, index) => id === b.guardLocationIds[index])
}

export function draftSaveReady(selection: TelloyaOfferDraftSelection): boolean {
  if (!selection.planTier) return false
  if (selection.planTier !== "custom") return true
  return Number.isInteger(selection.customAmountPence)
    && (selection.customAmountPence as number) >= CUSTOM_AMOUNT_MIN_PENCE
    && (selection.customAmountPence as number) <= CUSTOM_AMOUNT_MAX_PENCE
}

export function estimateTelloyaDraft(input: {
  planTier: TelloyaDraftPlanTier | null
  customAmountPence?: number | null
  customIncludedMinutes?: number | null
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
  const customAmountValid = input.planTier === "custom"
    && Number.isInteger(input.customAmountPence)
    && (input.customAmountPence as number) >= CUSTOM_AMOUNT_MIN_PENCE
    && (input.customAmountPence as number) <= CUSTOM_AMOUNT_MAX_PENCE
  const customMinutes = input.planTier === "custom"
    && Number.isInteger(input.customIncludedMinutes)
    && (input.customIncludedMinutes as number) >= 1
    && (input.customIncludedMinutes as number) <= CUSTOM_INCLUDED_MINUTES_MAX
    ? input.customIncludedMinutes as number
    : null
  const customApprovalRequired = input.planTier === "custom"
  const quotationRequired = input.planTier === "custom" && !customAmountValid
  const planAmountPence = input.planTier === "custom"
    ? (customAmountValid ? input.customAmountPence as number : null)
    : catalogue?.amountPence ?? null
  const includedMinutes = input.planTier === "custom"
    ? customMinutes
    : catalogue?.includedMinutes ?? null
  const guardAmountPence = quantity * telloyaGuardLocationPence
  const monthlyTotalPence = planAmountPence === null ? null : planAmountPence + guardAmountPence
  const summaryLines: string[] = []
  if (!input.planTier) {
    summaryLines.push("Choose a Telloya plan to calculate the draft monthly total.")
  } else if (quotationRequired) {
    summaryLines.push("Enter a Custom monthly amount to calculate the draft total.")
  } else if (planAmountPence !== null) {
    summaryLines.push(`${plan?.name ?? "Plan"} ${formatGbpPence(planAmountPence)} / month`)
    if (includedMinutes != null) summaryLines.push(`${includedMinutes} included minutes`)
    else if (customApprovalRequired) summaryLines.push("Included minutes still to confirm for Custom")
  }
  if (quantity > 0) {
    summaryLines.push(`Relaunch Guard × ${quantity} at ${formatGbpPence(telloyaGuardLocationPence)} = ${formatGbpPence(guardAmountPence)}`)
  } else {
    summaryLines.push("Relaunch Guard off")
  }
  summaryLines.push("Standard setup included. One operating location and one number on standard tiers.")
  if (customApprovalRequired && customAmountValid) {
    summaryLines.push("Custom draft is a proposed price only. Approval is required before an official offer can be issued.")
  }
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
    includedMinutes,
    proposedGuardQuantity: quantity,
    guardUnitPence: telloyaGuardLocationPence,
    guardAmountPence,
    monthlyTotalPence,
    quotationRequired,
    customApprovalRequired,
    overageOptIn,
    overageRatePence: telloyaOveragePence,
    overageCapPence,
    overageLabel,
    summaryLines,
    totalLabel: monthlyTotalPence === null
      ? (quotationRequired ? "Enter Custom amount" : "Choose a plan")
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

export function mapDraftTierToApprovedPlan<T extends {
  tierCode: string | null
  offerable: boolean
  amountMinor?: number | null
  includedMinutes?: number | null
}>(
  plans: T[],
  planTier: TelloyaDraftPlanTier | null,
  options: { customAmountPence?: number | null; customIncludedMinutes?: number | null } = {},
): T | null {
  if (!planTier) return null
  if (planTier === "custom") {
    const amount = options.customAmountPence
    const minutes = options.customIncludedMinutes
    if (!Number.isInteger(amount) || (amount as number) <= 0) return null
    if (!Number.isInteger(minutes) || (minutes as number) < 1) return null
    return plans.find(plan =>
      plan.offerable
      && (plan.tierCode ?? "").toUpperCase() === "CUSTOM"
      && plan.amountMinor === amount
      && plan.includedMinutes === minutes
    ) ?? null
  }
  const catalogue = telloyaCataloguePence(planTier)
  if (!catalogue || catalogue.amountPence == null || catalogue.includedMinutes == null) return null
  const wanted = planTier.toUpperCase()
  // Standard drafts must match the published quotation schedule exactly.
  // A future catalogue reprice cannot silently replace Basic/Growth/Pro amounts.
  return plans.find(plan =>
    plan.offerable
    && (plan.tierCode ?? "").toUpperCase() === wanted
    && plan.amountMinor === catalogue.amountPence
    && plan.includedMinutes === catalogue.includedMinutes
  ) ?? null
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
  customAmountMaxPence: CUSTOM_AMOUNT_MAX_PENCE,
  customIncludedMinutesMax: CUSTOM_INCLUDED_MINUTES_MAX,
} as const
