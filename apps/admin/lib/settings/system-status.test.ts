import { describe, expect, it } from "vitest"
import { systemConfigurationStatus } from "./system-status"

describe("system configuration status", () => {
  it("returns safe labels and never echoes secrets", () => {
    const status = systemConfigurationStatus({
      GUARD_ACTIVATION_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_should_not_appear",
      RESEND_API_KEY: "re_secret",
      PRIVACY_DELETION_ENABLED: "yes",
    })
    expect(status.guardActivation).toBe("Enabled")
    expect(status.privacyDeletion).toBe("Disabled")
    expect(status.google).toBe("Not configured")
    expect(status.paymentProvider).toBe("Disabled")
    expect(JSON.stringify(status)).not.toMatch(/sk_live|re_secret|STRIPE_SECRET|RESEND_API_KEY/)
  })
})
