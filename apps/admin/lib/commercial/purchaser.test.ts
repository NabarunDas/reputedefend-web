import { describe, expect, it } from "vitest"
import { buildPurchaserRecord, establishmentFailureMessage, purchaserSavedMessage } from "./purchaser"

const businessId = "22222222-2222-4222-8222-222222222222"

function input(overrides: Record<string, unknown> = {}) {
  return {
    businessId,
    purchaserType: "SOLE_TRADER",
    countryCode: "GB",
    legalName: "Das Example",
    evidenceType: "OTHER",
    evidenceReference: "Staff checked the purchaser's own invoice heading and address.",
    outcome: "pending",
    ...overrides,
  }
}

describe("purchaser establishment capture", () => {
  it("records a UK sole trader without a Companies House number or tax identifier", () => {
    const built = buildPurchaserRecord(input())
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.payload.verificationStatus).toBe("PENDING")
    expect(built.payload.evidenceType).toBe("OTHER")
    expect(built.payload.evidenceReference).toMatch(/^Purchaser is a sole trader\. /)
    expect(built.payload).not.toHaveProperty("registrationId")
    expect(built.payload).not.toHaveProperty("taxId")
    expect(purchaserSavedMessage(built.payload)).toMatch(/not yet verified/)
  })

  it("verifies a UK limited company from evidence other than Companies House", () => {
    const built = buildPurchaserRecord(input({
      purchaserType: "LIMITED_COMPANY",
      legalName: "Example Genuine Business Ltd",
      evidenceType: "OTHER",
      outcome: "verified",
      confirmed: true,
      registrationId: "",
    }))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.payload.verificationStatus).toBe("VERIFIED")
    expect(built.payload.evidenceReference).toMatch(/^Purchaser is a UK limited company\. /)
    expect(purchaserSavedMessage(built.payload)).toMatch(/Not applicable/)
    expect(purchaserSavedMessage(built.payload)).toMatch(/advertised total/)
    expect(purchaserSavedMessage(built.payload)).not.toMatch(/VAT charged|including VAT/)
  })

  it("does not treat a self-declaration as verified", () => {
    const missing = buildPurchaserRecord(input({ outcome: "verified", confirmed: false }))
    expect(missing.ok).toBe(false)
    const declared = buildPurchaserRecord(input({ outcome: "pending", confirmed: true }))
    expect(declared.ok).toBe(false)
  })

  it("rejects synthetic evidence and does not accept a country code as proof", () => {
    expect(buildPurchaserRecord(input({
      evidenceReference: "DEV SYNTHETIC / NOT REAL simulated payer for this test.",
    })).ok).toBe(false)
    expect(buildPurchaserRecord(input({ evidenceReference: "GB" })).ok).toBe(false)
    expect(buildPurchaserRecord(input({
      evidenceReference: "Worldwide zero-rated treatment for this purchaser.",
    })).ok).toBe(false)
  })

  it("does not require Companies House for a sole trader and does not invent a non-UK decision", () => {
    const companiesHouse = buildPurchaserRecord(input({ evidenceType: "COMPANIES_HOUSE" }))
    expect(companiesHouse.ok).toBe(false)
    if (!companiesHouse.ok) expect(companiesHouse.message).toMatch(/Companies House is not required/)
    const abroad = buildPurchaserRecord(input({
      purchaserType: "LIMITED_COMPANY",
      countryCode: "ie",
      evidenceType: "REGISTRY_EXTRACT",
      outcome: "verified",
      confirmed: true,
    }))
    expect(abroad.ok).toBe(true)
    if (!abroad.ok) return
    expect(abroad.payload.countryCode).toBe("IE")
    expect(purchaserSavedMessage(abroad.payload)).toMatch(/does not by itself clear a binding quote/)
  })

  it("asks for a state before verifying a US or Canadian establishment", () => {
    const missing = buildPurchaserRecord(input({
      purchaserType: "OTHER",
      countryCode: "US",
      evidenceType: "OTHER",
      outcome: "verified",
      confirmed: true,
    }))
    expect(missing.ok).toBe(false)
    const recorded = buildPurchaserRecord(input({
      purchaserType: "OTHER",
      countryCode: "US",
      subdivisionCode: "ca",
      evidenceType: "OTHER",
      outcome: "verified",
      confirmed: true,
    }))
    expect(recorded.ok).toBe(true)
    if (recorded.ok) expect(recorded.payload.subdivisionCode).toBe("CA")
  })

  it("rejects fields that would bypass the existing command", () => {
    expect(buildPurchaserRecord(input({ supersede: true })).ok).toBe(false)
    expect(buildPurchaserRecord(input({ actorId: "spoof" })).ok).toBe(false)
    expect(buildPurchaserRecord(input({ purchaserType: "spoof" })).ok).toBe(false)
  })

  it("keeps an unknown database reason off the staff message", () => {
    const message = establishmentFailureMessage("invalid", "internal_debug: 22222222-2222-4222-8222-222222222222")
    expect(message).toBe("Check the purchaser details and try again.")
    expect(message).not.toContain("22222222")
    expect(establishmentFailureMessage("conflict", "conflicting_establishment")).toMatch(/Review the business record/)
  })
})
