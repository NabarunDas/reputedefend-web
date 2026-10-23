import { describe, expect, it } from "vitest"
import { approvedInclusiveRateBps, quoteTaxIssue } from "../commerce/validation"
import { parseQuoteReadiness, purchaserStatusLabel, unavailableQuoteReadiness } from "./quote-readiness"

const verifiedGb = {
  status: "verified",
  countryCode: "GB",
  legalName: "Harbour Bakery Ltd",
  sellerVat: "NOT_VAT_REGISTERED",
  taxPath: "uk_not_charged",
}

describe("quote readiness parsing", () => {
  it("keeps a verified United Kingdom purchaser and drops anything else", () => {
    const parsed = parseQuoteReadiness({ ...verifiedGb, taxId: "GB999999999", evidence: "secret note" })
    expect(parsed).toEqual({
      status: "verified",
      countryCode: "GB",
      countryLabel: "United Kingdom",
      legalName: "Harbour Bakery Ltd",
      sellerVat: "NOT_VAT_REGISTERED",
      taxPath: "uk_not_charged",
    })
    expect(JSON.stringify(parsed)).not.toContain("GB999999999")
    expect(purchaserStatusLabel(parsed)).toBe("Purchaser verified — United Kingdom")
  })

  it("does not treat a pending note or a conflicting record as verified", () => {
    expect(parseQuoteReadiness({
      status: "pending", countryCode: null, legalName: null, sellerVat: "NOT_VAT_REGISTERED", taxPath: "unavailable",
    }).status).toBe("pending")
    expect(parseQuoteReadiness({
      status: "conflicting", countryCode: null, legalName: null, sellerVat: "NOT_VAT_REGISTERED", taxPath: "review",
    }).status).toBe("conflicting")
    expect(parseQuoteReadiness({
      status: "conflicting", countryCode: "GB", legalName: "Harbour Bakery Ltd", sellerVat: "NOT_VAT_REGISTERED", taxPath: "uk_not_charged",
    })).toEqual(unavailableQuoteReadiness)
  })

  it("does not apply the United Kingdom treatment to an overseas or unknown seller position", () => {
    expect(parseQuoteReadiness({
      status: "verified", countryCode: "FR", legalName: "Bakery SARL", sellerVat: "NOT_VAT_REGISTERED", taxPath: "review",
    })).toMatchObject({ countryLabel: "France", taxPath: "review" })
    expect(parseQuoteReadiness({
      status: "verified", countryCode: "GB", legalName: "Harbour Bakery Ltd", sellerVat: "UNKNOWN", taxPath: "review",
    })).toMatchObject({ taxPath: "review" })
    expect(parseQuoteReadiness({ ...verifiedGb, sellerVat: "UNKNOWN" })).toEqual(unavailableQuoteReadiness)
    expect(parseQuoteReadiness(null)).toEqual(unavailableQuoteReadiness)
  })
})

describe("approved inclusive tax entry", () => {
  it("converts an approved percentage to basis points and refuses a missing rate", () => {
    expect(approvedInclusiveRateBps("20")).toBe(2000)
    expect(approvedInclusiveRateBps("20.5")).toBe(2050)
    expect(approvedInclusiveRateBps("20.555")).toBeNull()
    expect(approvedInclusiveRateBps(20)).toBeNull()
    expect(quoteTaxIssue("set_draft_tax", { taxBehaviour: "INCLUSIVE" })).toMatch(/approved tax percentage/)
    expect(quoteTaxIssue("set_draft_tax", { taxBehaviour: "EXCLUSIVE", taxRateBps: 2000 })).toMatch(/cannot add tax/)
    expect(quoteTaxIssue("set_draft_tax", { taxBehaviour: "NOT_APPLICABLE", taxRateBps: 0 })).toMatch(/does not take a tax rate/)
    expect(quoteTaxIssue("set_draft_tax", { taxBehaviour: "NOT_APPLICABLE" })).toBeNull()
    expect(quoteTaxIssue("offer", { taxBehaviour: "INCLUSIVE" })).toBeNull()
  })
})
