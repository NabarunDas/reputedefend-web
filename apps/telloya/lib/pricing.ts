/**
 * Canonical Telloya pricing configuration
 * 
 * This is the single source of truth for all Telloya plan prices,
 * minute allowances, and Relaunch Guard add-on pricing.
 */

export type TelloyaPlanTier = "basic" | "growth" | "pro" | "custom"

export interface TelloyaPlan {
  tier: TelloyaPlanTier
  name: string
  monthlyPriceGbp: number | null
  minutesPerMonth: number | null
  popular?: boolean
}

export interface RelaunchGuardAddon {
  pricePerLocationGbp: number
  name: string
  description: string
  infoUrl: string
}

export interface OveragePolicy {
  pricePerMinuteGbp: number
  requiresOptIn: boolean
  requiresSpendingCap: boolean
}

/**
 * Core Telloya subscription plans
 */
export const telloyaPlans: readonly TelloyaPlan[] = [
  {
    tier: "basic",
    name: "Basic",
    monthlyPriceGbp: 49,
    minutesPerMonth: 120,
  },
  {
    tier: "growth",
    name: "Growth",
    monthlyPriceGbp: 79,
    minutesPerMonth: 300,
    popular: true,
  },
  {
    tier: "pro",
    name: "Pro",
    monthlyPriceGbp: 120,
    minutesPerMonth: 500,
  },
  {
    tier: "custom",
    name: "Custom",
    monthlyPriceGbp: null,
    minutesPerMonth: null,
  },
] as const

/**
 * Relaunch Guard optional add-on
 * Separate from core Telloya AI subscription
 */
export const relaunchGuardAddon: RelaunchGuardAddon = {
  pricePerLocationGbp: 9.99,
  name: "Relaunch Guard",
  description: "Optional Google Business Profile monitoring per location",
  infoUrl: "https://profilerelaunch.com/relaunch-guard",
} as const

/**
 * Overage and additional usage policy
 */
export const overagePolicy: OveragePolicy = {
  pricePerMinuteGbp: 0.25,
  requiresOptIn: true,
  requiresSpendingCap: true,
} as const

/**
 * Core capabilities shared across all plans
 */
export const coreTelloyaCapabilities = [
  "AI answering for eligible forwarded missed calls",
  "Business-specific greeting and configuration",
  "Conversational enquiry collection",
  "Caller contact and service requirements",
  "Callback-time preferences",
  "Structured lead summaries delivered by the agreed method",
] as const

/**
 * Get plan by tier
 */
export function getPlanByTier(tier: TelloyaPlanTier): TelloyaPlan | undefined {
  return telloyaPlans.find((p) => p.tier === tier)
}

/**
 * Calculate combined monthly price for a fixed plan plus Guard add-on
 */
export function calculateCombinedPrice(
  planPriceGbp: number,
  guardLocations: number
): number {
  return planPriceGbp + relaunchGuardAddon.pricePerLocationGbp * guardLocations
}

/**
 * Format GBP price for display
 */
export function formatGbpPrice(amount: number): string {
  return `£${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`
}

/**
 * Format minute allowance for display
 */
export function formatMinutes(minutes: number): string {
  return `${minutes} minutes/month`
}

/**
 * Approved standard-plan entitlement. Custom quotations are separate.
 * Guard locations are priced on their own and do not add receptionist capacity.
 */
export const standardEntitlement = {
  operatingLocations: 1,
  receptionistNumbers: 1,
} as const

export const commercialCopy = {
  standardEntitlement: "One operating location and one receptionist telephone number.",
  extraReceptionist:
    "Additional receptionist locations or numbers require a separately agreed Custom quotation.",
  standardSetup: "Standard setup is included.",
  complexSetup: "Complex setup requires a separate quotation.",
  guardPriceBasis: `Optional Relaunch Guard costs ${formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)} per paid Guard location per month.`,
  guardOnly: "Additional Guard-only locations do not create additional receptionist entitlements.",
  overageOptIn: `Extra usage costs ${formatGbpPrice(overagePolicy.pricePerMinuteGbp)} per minute, with separate explicit opt-in and a customer-defined spending cap.`,
  overageEnquiry: "Enquiry interest is not authorisation to charge for overage.",
  voicePreference:
    "A male or female voice, a preferred speaking style, a preferred accent, and primary or additional languages can be requested.",
  voiceProvider:
    "These are configuration preferences, not guaranteed offerings. Available combinations depend on the selected voice provider and technical compatibility.",
  international:
    "Conditional forwarding, number provisioning and available voices depend on the customer's provider and location.",
} as const
