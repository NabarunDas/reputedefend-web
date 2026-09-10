import { describe, expect, it } from "vitest"
import { feeWording, hasLegalValue, legalIdentity } from "@/lib/legal"

describe("legal identity", () => {
  it("exposes only confirmed customer-facing identity values", () => {
    expect(legalIdentity.tradingName).toBe("ReputeDefend")
    expect(legalIdentity.siteUrl).toBe("https://reputedefend.com")
    expect(legalIdentity.noticeUpdated).toMatch(/\d{1,2} \w+ \d{4}/)
    expect(feeWording).toMatch(/fees will be explained clearly before you decide how to proceed/)
  })

  it("keeps unconfirmed business details unset rather than inventing them", () => {
    const unset = [
      legalIdentity.legalName,
      legalIdentity.contactEmail,
      legalIdentity.postalAddress,
      legalIdentity.registrationNumber,
      legalIdentity.vatNumber,
      legalIdentity.phone,
      legalIdentity.dpoEmail,
      legalIdentity.governingLaw,
      legalIdentity.courts,
      legalIdentity.hostingProvider,
      legalIdentity.retentionPeriod,
    ]

    for (const value of unset) {
      expect(value).toBeUndefined()
      expect(hasLegalValue(value)).toBe(false)
    }
  })

  it("names Resend as the enquiry email processor now that delivery uses it", () => {
    expect(legalIdentity.enquiryProcessorName).toBe("Resend")
  })
})
