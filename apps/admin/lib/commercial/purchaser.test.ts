import { describe, expect, it } from "vitest"
import { buildPurchaserRecord, establishmentFailureMessage, purchaserCommandMessage } from "./purchaser"

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
    const outcome = purchaserCommandMessage(built.payload, { status: "success", verificationStatus: "PENDING", countryCode: "GB" })
    expect(outcome.httpStatus).toBe(200)
    expect(outcome.message).toMatch(/Saved as not yet verified/)
    expect(outcome.message).toMatch(/new purchasing-establishment note/)
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
    expect(built.payload.evidenceReference).toMatch(/^Purchaser is a limited company\. /)
    const outcome = purchaserCommandMessage(built.payload, { status: "success", verificationStatus: "VERIFIED", countryCode: "GB" })
    expect(outcome.httpStatus).toBe(200)
    expect(outcome.message).toMatch(/already the current record/)
    expect(outcome.message).toMatch(/does not confirm that the name or evidence/)
    expect(outcome.message).toMatch(/Not applicable/)
    expect(outcome.message).toMatch(/advertised total/)
    expect(outcome.message).not.toMatch(/VAT charged|including VAT/)
    expect(outcome.message).not.toContain(built.payload.legalName)
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
    const outcome = purchaserCommandMessage(abroad.payload, { status: "success", verificationStatus: "VERIFIED", countryCode: "IE" })
    expect(outcome.message).toMatch(/does not confirm that the name or evidence/)
    expect(outcome.message).toMatch(/does not by itself clear a binding quote/)
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

  it("distinguishes a reused verified record, a new note, a retry and a country conflict", () => {
    const pending = input()
    const built = buildPurchaserRecord(pending)
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const reused = purchaserCommandMessage(built.payload, { status: "success", verificationStatus: "VERIFIED", countryCode: "GB" })
    expect(reused.httpStatus).toBe(409)
    expect(reused.message).toMatch(/already current/)
    expect(reused.message).toMatch(/was not saved/)
    expect(reused.message).not.toMatch(/Saved as not yet verified|new purchasing-establishment note/)
    const rejected = buildPurchaserRecord(input({ outcome: "rejected" }))
    expect(rejected.ok).toBe(true)
    if (!rejected.ok) return
    const rejectedReuse = purchaserCommandMessage(rejected.payload, { status: "success", verificationStatus: "VERIFIED", countryCode: "GB" })
    expect(rejectedReuse.httpStatus).toBe(409)
    expect(rejectedReuse.message).not.toMatch(/Recorded as not sufficient|new purchasing-establishment note/)
    const verified = buildPurchaserRecord(input({ outcome: "verified", confirmed: true, legalName: "Replacement Name Ltd" }))
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    const sameStatus = purchaserCommandMessage(verified.payload, { status: "success", verificationStatus: "VERIFIED", countryCode: "GB" })
    expect(sameStatus.httpStatus).toBe(200)
    expect(sameStatus.message).toMatch(/does not confirm that the name or evidence/)
    expect(sameStatus.message).not.toContain("Replacement Name Ltd")
    const replay = purchaserCommandMessage(built.payload, { status: "replay", countryCode: "GB" })
    expect(replay.httpStatus).toBe(200)
    expect(replay.message).toMatch(/already recorded/)
    expect(replay.message).toMatch(/not overwritten/)
    expect(replay.message).not.toMatch(/Saved as not yet verified|new purchasing-establishment note/)
    const conflict = purchaserCommandMessage(built.payload, { status: "conflict", reason: "conflicting_establishment" })
    expect(conflict.httpStatus).toBe(409)
    expect(conflict.message).toMatch(/different verified purchasing establishment/)
    const created = purchaserCommandMessage(rejected.payload, { status: "success", verificationStatus: "REJECTED", countryCode: "GB" })
    expect(created.httpStatus).toBe(200)
    expect(created.message).toMatch(/new purchasing-establishment note/)
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
