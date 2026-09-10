import { describe, expect, it } from "vitest"
import {
  feeWording,
  hasLegalValue,
  isSoleTrader,
  legalIdentity,
  showsCompanyRegistration,
  tradingAsLine,
} from "@/lib/legal"

describe("legal identity", () => {
  it("describes a UK sole trader trading as ReputeDefend", () => {
    expect(legalIdentity.tradingName).toBe("ReputeDefend")
    expect(legalIdentity.legalName).toBe("Saswati Das")
    expect(legalIdentity.businessStructure).toBe("sole-trader")
    expect(isSoleTrader()).toBe(true)
    expect(tradingAsLine()).toBe("Saswati Das, trading as ReputeDefend")
    expect(legalIdentity.siteUrl).toBe("https://reputedefend.com")
    expect(legalIdentity.noticeUpdated).toMatch(/\d{1,2} \w+ \d{4}/)
    expect(feeWording).toMatch(/fees will be explained clearly before you decide how to proceed/)
  })

  it("publishes the confirmed correspondence address and contact email", () => {
    expect(legalIdentity.contactEmail).toBe("contact@reputedefend.com")
    expect(legalIdentity.postalAddress).toContain("6 Bradford Road")
    expect(legalIdentity.postalAddress).toContain("Old Town")
    expect(legalIdentity.postalAddress).toContain("Swindon")
    expect(legalIdentity.postalAddress).toContain("SN1 4FE")
    expect(legalIdentity.postalAddress).toContain("United Kingdom")
  })

  it("does not invent company, VAT, phone, DPO or governing-law details", () => {
    const unset = [
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

    expect(showsCompanyRegistration()).toBe(false)
    expect(tradingAsLine().toLowerCase()).not.toMatch(/\bltd\b|limited|registered office|companies house/)
  })

  it("names Resend as the enquiry email processor now that delivery uses it", () => {
    expect(legalIdentity.enquiryProcessorName).toBe("Resend")
  })
})
