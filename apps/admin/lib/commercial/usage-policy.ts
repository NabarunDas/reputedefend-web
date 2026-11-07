/**
 * Server-side Telloya allowance and spending-cap evaluation.
 * A dashboard warning is not this check. This module does not create a Stripe
 * charge, invoice, or subscription, and it does not place a call.
 *
 * Partial minutes are REVIEW_BEFORE_CHARGE. The proposed customer-facing rule
 * rounds provider-confirmed seconds up to the next whole minute and prices
 * that minute at the accepted integer rate. No charge is created here.
 */

export const TELLOYA_OVERAGE_RATE_MINOR = 25
export const USAGE_RESERVATION_SECONDS = 60
export const PARTIAL_MINUTE_REVIEW = "REVIEW_BEFORE_CHARGE" as const

export const ownerApprovedIncludedMinutes = {
  BASIC: 120,
  GROWTH: 300,
  PRO: 500,
} as const

export type StandardUsageTier = keyof typeof ownerApprovedIncludedMinutes
export type UsageTier = StandardUsageTier | "CUSTOM"
export type CallScope = "customer_phone" | "admin_web_qa"

export type UsageSnapshot = {
  tier: UsageTier
  includedMinutes: number | null
  minutesRollover: boolean
  overageOptIn: boolean
  overageRateMinor: number | null
  overageCapMinor: number | null
}

export type UsagePeriod = {
  startMs: number
  endMs: number
}

export type UsagePosition = {
  scope: CallScope
  subscriptionState: string
  provisionState: string
  nowMs: number
  period: UsagePeriod
  /** Confirmed customer-phone seconds already in this period. Internal QA is excluded. */
  confirmedCustomerSeconds: number
  /** Seconds reserved for customer calls that have not ended. */
  openReservationSeconds: number
  /** Customer seconds from the previous period. They must not increase this period. */
  previousPeriodCustomerSeconds: number
  snapshot: UsageSnapshot
}

export type UsageDecision =
  | {
      outcome: "allow_included" | "allow_overage"
      billable: true
      reserveSeconds: number
      projectedOverageMinor: number
      chargeCreated: false
    }
  | {
      outcome: "deny" | "exclude_internal_qa"
      billable: false
      reason: string
      chargeCreated: false
    }

const ACTIVE_SUBSCRIPTION = new Set(["ACTIVE", "CANCEL_AT_PERIOD_END"])

export function proposedBillableMinutes(durationSeconds: number): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
    throw new Error("duration_seconds must be a non-negative integer")
  }
  if (durationSeconds === 0) return 0
  return Math.ceil(durationSeconds / 60)
}

export function acceptedIncludedMinutes(snapshot: UsageSnapshot): number | null {
  if (snapshot.tier === "CUSTOM") return snapshot.includedMinutes
  const approved = ownerApprovedIncludedMinutes[snapshot.tier]
  if (snapshot.includedMinutes !== approved) {
    throw new Error("included minutes must match the accepted plan snapshot")
  }
  return approved
}

/**
 * Proposed overage in integer minor units. This does not create a charge.
 * Seconds inside the included allowance are free. Seconds beyond it round up
 * to the next whole minute at the accepted rate, then stop at the cap.
 */
export function reviewedOverageMinor(input: {
  customerSeconds: number
  includedMinutes: number
  rateMinor: number
  capMinor: number
}): { minor: number; exceedsCap: boolean; review: typeof PARTIAL_MINUTE_REVIEW; chargeCreated: false } {
  if (!Number.isInteger(input.customerSeconds) || input.customerSeconds < 0) {
    throw new Error("customer seconds must be a non-negative integer")
  }
  if (!Number.isInteger(input.includedMinutes) || input.includedMinutes < 0) {
    throw new Error("included minutes must be a non-negative integer")
  }
  if (!Number.isInteger(input.rateMinor) || input.rateMinor < 0) {
    throw new Error("overage rate must be an integer minor-unit amount")
  }
  if (!Number.isInteger(input.capMinor) || input.capMinor < 0) {
    throw new Error("spending cap must be an integer minor-unit amount")
  }
  const overageSeconds = Math.max(0, input.customerSeconds - input.includedMinutes * 60)
  const raw = proposedBillableMinutes(overageSeconds) * input.rateMinor
  return {
    minor: Math.min(raw, input.capMinor),
    exceedsCap: raw > input.capMinor,
    review: PARTIAL_MINUTE_REVIEW,
    chargeCreated: false,
  }
}

export function attributeUsagePeriod(endedAtMs: number, periods: readonly UsagePeriod[]): UsagePeriod | null {
  return periods.find(period => endedAtMs >= period.startMs && endedAtMs < period.endMs) ?? null
}

function deny(reason: string): UsageDecision {
  return { outcome: "deny", billable: false, reason, chargeCreated: false }
}

export function evaluateUsage(position: UsagePosition): UsageDecision {
  if (position.scope === "admin_web_qa") {
    return { outcome: "exclude_internal_qa", billable: false, reason: "internal_admin_web_call", chargeCreated: false }
  }
  if (position.snapshot.minutesRollover) return deny("rollover_not_permitted")
  if (position.previousPeriodCustomerSeconds < 0) return deny("invalid_previous_usage")
  if (!ACTIVE_SUBSCRIPTION.has(position.subscriptionState)) return deny("subscription_inactive")
  if (position.provisionState !== "LIVE") return deny("provision_inactive")
  if (position.nowMs < position.period.startMs || position.nowMs >= position.period.endMs) return deny("outside_billing_period")
  if (!Number.isInteger(position.confirmedCustomerSeconds) || position.confirmedCustomerSeconds < 0) return deny("invalid_confirmed_usage")
  if (!Number.isInteger(position.openReservationSeconds) || position.openReservationSeconds < 0) return deny("invalid_reservation")

  const includedMinutes = acceptedIncludedMinutes(position.snapshot)
  if (includedMinutes == null) return deny("custom_allowance_not_accepted")
  const includedSeconds = includedMinutes * 60
  const committedSeconds = position.confirmedCustomerSeconds + position.openReservationSeconds
  const remainingIncluded = Math.max(0, includedSeconds - committedSeconds)
  if (remainingIncluded >= USAGE_RESERVATION_SECONDS) {
    return {
      outcome: "allow_included",
      billable: true,
      reserveSeconds: USAGE_RESERVATION_SECONDS,
      projectedOverageMinor: 0,
      chargeCreated: false,
    }
  }
  if (!position.snapshot.overageOptIn) return deny("allowance_exhausted")
  if (position.snapshot.overageRateMinor !== TELLOYA_OVERAGE_RATE_MINOR) return deny("overage_rate_not_accepted")
  const cap = position.snapshot.overageCapMinor
  if (cap == null || !Number.isInteger(cap) || cap < 1) return deny("spending_cap_missing")
  const projected = reviewedOverageMinor({
    customerSeconds: committedSeconds + USAGE_RESERVATION_SECONDS,
    includedMinutes,
    rateMinor: TELLOYA_OVERAGE_RATE_MINOR,
    capMinor: cap,
  })
  if (projected.exceedsCap) return deny("spending_cap_exhausted")
  return {
    outcome: "allow_overage",
    billable: true,
    reserveSeconds: USAGE_RESERVATION_SECONDS,
    projectedOverageMinor: projected.minor,
    chargeCreated: false,
  }
}
