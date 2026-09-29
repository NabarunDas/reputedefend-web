import { describe, expect, it } from "vitest"
import { communicationsInboundEnabled, inboundMailDomain, inboundOwnedAddresses } from "./gate"

describe("inbound mail gate", () => {
  it("stays disabled without production inbound configuration", () => {
    expect(communicationsInboundEnabled({
      COMMUNICATIONS_INBOUND_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      RESEND_API_KEY: "re_test",
      INBOUND_MAIL_DOMAIN: "reply.profilerelaunch.com",
    })).toBe(false)
    expect(inboundMailDomain({ INBOUND_MAIL_DOMAIN: "profilerelaunch.com" })).toBeNull()
    expect(inboundOwnedAddresses({ COMMUNICATIONS_FROM_EMAIL: "ops@reputedefend.com" })).toEqual(["ops@reputedefend.com"])
  })
})
