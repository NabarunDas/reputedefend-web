import { describe, expect, it } from "vitest"
import { guardActivationEnabled, guardRefundsEnabled, guardSubscriptionsEnabled } from "./gate"

describe("guard feature gates", () => {
  it("defaults subscription, refund and activation gates to disabled", () => {
    expect(guardActivationEnabled({})).toBe(false)
    expect(guardSubscriptionsEnabled({})).toBe(false)
    expect(guardRefundsEnabled({})).toBe(false)
    expect(guardSubscriptionsEnabled({ GUARD_SUBSCRIPTIONS_ENABLED: "false" })).toBe(false)
    expect(guardRefundsEnabled({ GUARD_REFUNDS_ENABLED: "yes" })).toBe(false)
    expect(guardSubscriptionsEnabled({ GUARD_SUBSCRIPTIONS_ENABLED: "true" })).toBe(true)
    expect(guardRefundsEnabled({ GUARD_REFUNDS_ENABLED: "true" })).toBe(true)
  })
})
