import { describe, expect, it } from "vitest"
import {
  feeWording,
  hasLegalValue,
  isLimitedCompany,
  legalIdentity,
  publicLegalDisclosure,
  registeredOfficeInline,
  showsCompanyRegistration,
  tradingAsLine,
} from "@/lib/legal"

describe("legal identity", () => {
  it("describes ProfileRelaunch Ltd, registered in England and Wales", () => {
    const disclosure = publicLegalDisclosure()
    expect(legalIdentity.tradingName).toBe("ProfileRelaunch")
    expect(legalIdentity.legalName).toBe("ProfileRelaunch Ltd")
    expect(legalIdentity.businessStructure).toBe("private-limited-company")
    expect(isLimitedCompany()).toBe(true)
    expect(showsCompanyRegistration()).toBe(true)
    expect(tradingAsLine()).toBe("ProfileRelaunch Ltd, trading as ProfileRelaunch")
    expect(disclosure.companyNumber).toBe("Company number 17520826.")
    expect(disclosure.placeOfRegistration).toBe("Registered in England and Wales.")
    expect(disclosure.incorporated).toBe("Incorporated 14 October 2026.")
    expect(disclosure.registeredOfficeInline).toBe("71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom")
    expect(registeredOfficeInline()).toBe(disclosure.registeredOfficeInline)
    expect(legalIdentity.siteUrl).toBe("https://profilerelaunch.com")
    expect(legalIdentity.noticeUpdated).toBe("14 October 2026")
    expect(legalIdentity.contactEmail).toBe("contact@profilerelaunch.com")
    expect(feeWording).toMatch(/fees will be explained clearly before you decide how to proceed/)
  })

  it("does not invent a VAT number, phone, DPO or governing-law details", () => {
    expect(legalIdentity.vatRegistered).toBe(false)
    const unset = [
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
