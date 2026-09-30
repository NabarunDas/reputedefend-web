import { describe, expect, it } from "vitest"
import {
  guardActivationEnabled,
  guardAlertNotificationsEnabled,
  guardAlertsEnabled,
  guardChecksEnabled,
  guardRefundsEnabled,
  guardSubscriptionsEnabled,
} from "./gate"

describe("guard feature gates", () => {
  it("defaults subscription, refund and activation gates to disabled", () => {
    expect(guardActivationEnabled({})).toBe(false)
    expect(guardSubscriptionsEnabled({})).toBe(false)
    expect(guardRefundsEnabled({})).toBe(false)
    expect(guardSubscriptionsEnabled({ GUARD_SUBSCRIPTIONS_ENABLED: "false" })).toBe(false)
    expect(guardRefundsEnabled({ GUARD_REFUNDS_ENABLED: "yes" })).toBe(false)
    expect(guardSubscriptionsEnabled({ GUARD_SUBSCRIPTIONS_ENABLED: "true" })).toBe(true)
    expect(guardRefundsEnabled({ GUARD_REFUNDS_ENABLED: "true" })).toBe(true)
    expect(guardChecksEnabled({})).toBe(false)
    expect(guardChecksEnabled({ GUARD_CHECKS_ENABLED: "false" })).toBe(false)
    expect(guardChecksEnabled({ GUARD_CHECKS_ENABLED: "yes" })).toBe(false)
    expect(guardChecksEnabled({ GUARD_CHECKS_ENABLED: "true" })).toBe(true)
    expect(guardAlertsEnabled({})).toBe(false)
    expect(guardAlertsEnabled({ GUARD_ALERTS_ENABLED: "false" })).toBe(false)
    expect(guardAlertsEnabled({ GUARD_ALERTS_ENABLED: "yes" })).toBe(false)
    expect(guardAlertsEnabled({ GUARD_ALERTS_ENABLED: "true" })).toBe(true)
    expect(guardAlertNotificationsEnabled({})).toBe(false)
    expect(guardAlertNotificationsEnabled({ GUARD_ALERT_NOTIFICATIONS_ENABLED: "true" })).toBe(true)
  })
})
