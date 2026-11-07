import { describe, expect, it } from "vitest"

import {
  acceptedIncludedMinutes,
  attributeCompletedCall,
  attributeUsagePeriod,
  evaluateUsage,
  ownerApprovedIncludedMinutes,
  proposedBillableMinutes,
  reviewedOverageMinor,
  type UsagePosition,
} from "./usage-policy"

const PERIOD = { startMs: Date.parse("2026-11-01T00:00:00.000Z"), endMs: Date.parse("2026-12-01T00:00:00.000Z") }
const NEXT = { startMs: PERIOD.endMs, endMs: Date.parse("2027-01-01T00:00:00.000Z") }

function reason(decision: ReturnType<typeof evaluateUsage>): string {
  if (decision.outcome !== "deny") throw new Error(decision.outcome)
  return decision.reason
}

function position(overrides: Partial<UsagePosition> = {}): UsagePosition {
  return {
    scope: "customer_phone",
    subscriptionState: "ACTIVE",
    provisionState: "LIVE",
    nowMs: PERIOD.startMs + 86_400_000,
    period: PERIOD,
    confirmedCustomerSeconds: 0,
    openReservationSeconds: 0,
    previousPeriodCustomerSeconds: 0,
    snapshot: {
      tier: "BASIC",
      includedMinutes: 120,
      minutesRollover: false,
      overageOptIn: false,
      overageRateMinor: null,
      overageCapMinor: null,
    },
    ...overrides,
  }
}

describe("owner-approved allowances", () => {
  it("uses the Basic, Growth and Pro minute allowances", () => {
    expect(ownerApprovedIncludedMinutes).toEqual({ BASIC: 120, GROWTH: 300, PRO: 500 })
    expect(evaluateUsage(position()).outcome).toBe("allow_included")
    expect(evaluateUsage(position({ snapshot: { ...position().snapshot, tier: "GROWTH", includedMinutes: 300 } })).outcome).toBe("allow_included")
    expect(evaluateUsage(position({ snapshot: { ...position().snapshot, tier: "PRO", includedMinutes: 500 } })).outcome).toBe("allow_included")
  })

  it("takes a Custom allowance only from the accepted snapshot", () => {
    expect(evaluateUsage(position({
      snapshot: { tier: "CUSTOM", includedMinutes: 40, minutesRollover: false, overageOptIn: false, overageRateMinor: null, overageCapMinor: null },
    })).outcome).toBe("allow_included")
    expect(evaluateUsage(position({
      snapshot: { tier: "CUSTOM", includedMinutes: null, minutesRollover: false, overageOptIn: false, overageRateMinor: null, overageCapMinor: null },
    }))).toMatchObject({ outcome: "deny", reason: "custom_allowance_not_accepted", chargeCreated: false })
  })

  it("refuses a marketing-form minute preference that differs from the accepted plan", () => {
    expect(() => acceptedIncludedMinutes({ ...position().snapshot, includedMinutes: 999 })).toThrow(/accepted plan snapshot/)
  })
})

describe("monthly boundaries and no rollover", () => {
  it("starts the next period at its own allowance", () => {
    const carried = evaluateUsage(position({
      period: NEXT,
      nowMs: NEXT.startMs,
      previousPeriodCustomerSeconds: 120 * 60,
      confirmedCustomerSeconds: 0,
    }))
    expect(carried.outcome).toBe("allow_included")
  })

  it("does not authorise a call outside the billing period", () => {
    expect(reason(evaluateUsage(position({ nowMs: PERIOD.endMs })))).toBe("outside_billing_period")
    expect(reason(evaluateUsage(position({ nowMs: PERIOD.startMs - 1 })))).toBe("outside_billing_period")
  })

  it("attributes a late event to the period that contains it", () => {
    expect(attributeUsagePeriod(PERIOD.endMs - 1, [PERIOD, NEXT])?.startMs).toBe(PERIOD.startMs)
    expect(attributeUsagePeriod(PERIOD.endMs, [PERIOD, NEXT])?.startMs).toBe(NEXT.startMs)
    expect(attributeUsagePeriod(PERIOD.startMs - 1, [PERIOD, NEXT])).toBeNull()
  })

  it("keeps a call that crosses renewal on the reserved period", () => {
    const crossed = attributeCompletedCall({
      reservationPeriod: PERIOD,
      endedAtMs: NEXT.startMs + 60_000,
      currentPeriod: NEXT,
    })
    expect(crossed).toEqual({ period: PERIOD, source: "reservation" })
    const missingStart = attributeCompletedCall({
      reservationPeriod: null,
      endedAtMs: NEXT.startMs + 60_000,
      currentPeriod: NEXT,
    })
    expect(missingStart).toEqual({ period: NEXT, source: "current_period" })
    const lateWithoutReservation = attributeCompletedCall({
      reservationPeriod: null,
      endedAtMs: NEXT.endMs + 1,
      currentPeriod: NEXT,
    })
    expect(lateWithoutReservation).toEqual({ period: null, source: "unattributed" })
  })

  it("keeps an in-progress reservation on its own period and leaves the next period's allowance intact", () => {
    const original = evaluateUsage(position({
      confirmedCustomerSeconds: 119 * 60,
      openReservationSeconds: 60,
    }))
    expect(reason(original)).toBe("allowance_exhausted")
    const renewed = evaluateUsage(position({
      period: NEXT,
      nowMs: NEXT.startMs,
      confirmedCustomerSeconds: 0,
      openReservationSeconds: 0,
      previousPeriodCustomerSeconds: 119 * 60 + 60,
    }))
    expect(renewed.outcome).toBe("allow_included")
  })

  it("keeps cancellation, allowance and cap decisions on the subscription that owns the seconds", () => {
    const canceled = evaluateUsage(position({
      subscriptionState: "CANCELED",
      confirmedCustomerSeconds: 30,
    }))
    expect(reason(canceled)).toBe("subscription_inactive")
    const other = evaluateUsage(position({
      period: NEXT,
      nowMs: NEXT.startMs,
      confirmedCustomerSeconds: 0,
    }))
    expect(other.outcome).toBe("allow_included")
    const capped = evaluateUsage(position({
      confirmedCustomerSeconds: 120 * 60,
      openReservationSeconds: 60,
      snapshot: { ...position().snapshot, overageOptIn: true, overageRateMinor: 25, overageCapMinor: 25 },
    }))
    expect(reason(capped)).toBe("spending_cap_exhausted")
    const uncapped = evaluateUsage(position({
      period: NEXT,
      nowMs: NEXT.startMs,
      confirmedCustomerSeconds: 30,
      snapshot: { ...position().snapshot, tier: "GROWTH", includedMinutes: 300, overageOptIn: true, overageRateMinor: 25, overageCapMinor: 25 },
    }))
    expect(uncapped.outcome).toBe("allow_included")
  })

  it("rejects a snapshot that would roll unused minutes forward", () => {
    expect(reason(evaluateUsage(position({
      snapshot: { ...position().snapshot, minutesRollover: true },
    })))).toBe("rollover_not_permitted")
  })
})

describe("overage and the spending cap", () => {
  it("leaves overage off unless the accepted snapshot opts in", () => {
    const exhausted = evaluateUsage(position({ confirmedCustomerSeconds: 120 * 60 }))
    expect(exhausted).toMatchObject({ outcome: "deny", reason: "allowance_exhausted", billable: false, chargeCreated: false })
  })

  it("allows one more minute inside the accepted cap at 25 minor units", () => {
    const decision = evaluateUsage(position({
      confirmedCustomerSeconds: 120 * 60,
      snapshot: { ...position().snapshot, overageOptIn: true, overageRateMinor: 25, overageCapMinor: 25 },
    }))
    expect(decision).toMatchObject({ outcome: "allow_overage", projectedOverageMinor: 25, chargeCreated: false })
  })

  it("stops when the next minute would exceed the cap", () => {
    expect(reason(evaluateUsage(position({
      confirmedCustomerSeconds: 120 * 60,
      openReservationSeconds: 60,
      snapshot: { ...position().snapshot, overageOptIn: true, overageRateMinor: 25, overageCapMinor: 25 },
    })))).toBe("spending_cap_exhausted")
    expect(reason(evaluateUsage(position({
      confirmedCustomerSeconds: 120 * 60,
      snapshot: { ...position().snapshot, overageOptIn: true, overageRateMinor: 25, overageCapMinor: 24 },
    })))).toBe("spending_cap_exhausted")
  })

  it("does not authorise overage at a rate other than the accepted 25 minor units", () => {
    expect(reason(evaluateUsage(position({
      confirmedCustomerSeconds: 120 * 60,
      snapshot: { ...position().snapshot, overageOptIn: true, overageRateMinor: 20, overageCapMinor: 1000 },
    })))).toBe("overage_rate_not_accepted")
  })
})

describe("reservations, partial minutes and inactive subscriptions", () => {
  it("counts an open reservation before authorising another call", () => {
    const first = evaluateUsage(position({ confirmedCustomerSeconds: 119 * 60 }))
    expect(first.outcome).toBe("allow_included")
    const second = evaluateUsage(position({ confirmedCustomerSeconds: 119 * 60, openReservationSeconds: 60 }))
    expect(reason(second)).toBe("allowance_exhausted")
  })

  it("documents partial minutes without creating a charge", () => {
    expect(proposedBillableMinutes(0)).toBe(0)
    expect(proposedBillableMinutes(1)).toBe(1)
    expect(proposedBillableMinutes(60)).toBe(1)
    expect(proposedBillableMinutes(61)).toBe(2)
    const reviewed = reviewedOverageMinor({ customerSeconds: 120 * 60 + 61, includedMinutes: 120, rateMinor: 25, capMinor: 100 })
    expect(reviewed).toEqual({ minor: 50, exceedsCap: false, review: "REVIEW_BEFORE_CHARGE", chargeCreated: false })
    expect(reviewedOverageMinor({ customerSeconds: 120 * 60 + 61, includedMinutes: 120, rateMinor: 25, capMinor: 25 }).exceedsCap).toBe(true)
  })

  it("refuses a cancelled, paused, expired or unpaid subscription", () => {
    for (const subscriptionState of ["PAST_DUE", "PAUSED", "CANCELED", "ENDED", "PAYMENT_PENDING", "DRAFT"]) {
      expect(reason(evaluateUsage(position({ subscriptionState })))).toBe("subscription_inactive")
    }
    expect(evaluateUsage(position({ subscriptionState: "CANCEL_AT_PERIOD_END" })).outcome).toBe("allow_included")
    expect(reason(evaluateUsage(position({ provisionState: "TEST_REQUIRED" })))).toBe("provision_inactive")
  })

  it("excludes an internal Admin web call from billable customer usage", () => {
    expect(evaluateUsage(position({
      scope: "admin_web_qa",
      confirmedCustomerSeconds: 120 * 60,
      subscriptionState: "CANCELED",
    }))).toMatchObject({ outcome: "exclude_internal_qa", billable: false, chargeCreated: false })
  })
})
