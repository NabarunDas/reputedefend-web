import { describe, expect, it } from "vitest"
import { legalIdentity } from "@/lib/legal"
import {
  privacyAnalytics,
  privacyCaseFields,
  privacyCovers,
  privacyMarketing,
  privacyMonitoringFields,
  privacyNoUpload,
  privacySeo,
  privacyUpdated,
  privacyUses,
} from "./content"

const copy = JSON.stringify({
  privacyAnalytics,
  privacyCaseFields,
  privacyCovers,
  privacyMarketing,
  privacyMonitoringFields,
  privacyNoUpload,
  privacySeo,
  privacyUpdated,
  privacyUses,
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
    expect(privacyMarketing.toLowerCase()).toContain("do not subscribe you to marketing emails")
    expect(privacyMarketing.toLowerCase()).toContain("service communications")
    expect(copy).not.toMatch(/upload screenshots|document portal is available/)
    expect(privacyMarketing.toLowerCase()).toContain("no newsletter signup")
  })

  it("describes Relaunch Guard setup fields and uses without inventing marketing signup", () => {
    expect(privacySeo.description).toBe(
      "How ProfileRelaunch handles information from enquiries, case submissions and Relaunch Guard setup requests, including storage, email delivery and optional analytics.",
    )
    expect(privacyCovers[0]).toContain("Relaunch Guard setup requests")
    expect(privacyMonitoringFields).toEqual([
      "your name and email address",
      "an optional phone number",
      "business name and country",
      "an optional website address",
      "the Google Business Profile link for the main location",
      "the number of locations you would like monitored",
      "confirmation that you are authorised to request setup and that the information provided is accurate",
    ])
    expect(privacyUses).toContain("review a monitoring setup request and arrange the next setup steps")
    expect(privacyUses).toContain("keep a record of the request and related service communications")
    expect(privacyUpdated).toBe("16 September 2026")
    expect(privacyUpdated).not.toBe(legalIdentity.noticeUpdated)
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
