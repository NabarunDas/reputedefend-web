import { describe, expect, it } from "vitest"
import { legalIdentity } from "@/lib/legal"
import {
  privacyAnalytics,
  privacyCaseFields,
  privacyMarketing,
  privacyNoUpload,
  privacySeo,
} from "./content"

const copy = JSON.stringify({
  privacyAnalytics,
  privacyCaseFields,
  privacyMarketing,
  privacyNoUpload,
  privacySeo,
}).toLowerCase()

describe("Privacy notice copy", () => {
  it("no longer claims the website does not run analytics", () => {
    expect(copy).not.toContain("does not run analytics")
    expect(copy).not.toContain("does not use advertising cookies, analytics cookies or a cookie banner")
    expect(privacyAnalytics.join(" ").toLowerCase()).toContain("optional")
    expect(privacyAnalytics.join(" ").toLowerCase()).toContain("consent")
    expect(privacyAnalytics.join(" ")).toContain("Cookie settings")
    expect(privacyAnalytics.join(" ").toLowerCase()).toContain("do not send names")
  })

  it("keeps current intake fields and does not claim file upload or marketing consent", () => {
    expect(privacyCaseFields.join(" ")).toContain("optional phone number")
    expect(privacyCaseFields.join(" ")).toContain("Business Profile or review URLs")
    expect(privacyNoUpload.toLowerCase()).toContain("does not currently provide file")
    expect(privacyMarketing.toLowerCase()).toContain("not marketing consent")
    expect(copy).not.toMatch(/upload screenshots|document portal is available/)
    expect(privacyMarketing.toLowerCase()).toContain("no newsletter signup")
  })

  it("keeps operator identity and international positioning", () => {
    expect(legalIdentity.legalName).toBe("Saswati Das")
    expect(legalIdentity.tradingName).toBe("ProfileRelaunch")
    expect(legalIdentity.businessStructure).toBe("sole-trader")
    expect(legalIdentity.contactEmail).toBe("contact@reputedefend.com")
    expect(legalIdentity.noticeUpdated).toBe("13 September 2026")
    expect(copy).not.toMatch(/for uk businesses|uk-only|uk customers only/)
  })
})
