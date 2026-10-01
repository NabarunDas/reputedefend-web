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
    // Backed by the Google provider resolver. Manual is the production state.
    expect(status.google).toBe("Manual mode")
    expect(status.paymentProvider).toBe("Disabled")
    expect(JSON.stringify(status)).not.toMatch(/sk_live|re_secret|STRIPE_SECRET|RESEND_API_KEY/)
  })

  it("distinguishes a Google integration that is switched off from one never set up", () => {
    expect(systemConfigurationStatus({ GOOGLE_BUSINESS_PROFILE_PROVIDER: "google" }).google).toBe("Disabled")
    expect(systemConfigurationStatus({
      GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
      GOOGLE_BUSINESS_PROFILE_API_ENABLED: "true",
    }).google).toBe("Not configured")
  })

  it("never echoes a Google credential into the status list", () => {
    const status = systemConfigurationStatus({
      GOOGLE_BUSINESS_PROFILE_PROVIDER: "google",
      GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "google-client-secret",
      GOOGLE_BUSINESS_PROFILE_TOKEN_KEY: "0123456789abcdef0123456789abcdef",
    })
    expect(JSON.stringify(status)).not.toMatch(/google-client-secret|0123456789abcdef/)
  })
})
