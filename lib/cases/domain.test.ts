import { describe, expect, it } from "vitest"
import {
  CASE_STATUSES,
  CASE_TYPES,
  isCasePublicRef,
  isCasePublicRefForType,
  isCaseStatus,
  isCaseType,
  mapFormServiceToCaseType,
} from "@/lib/cases/domain"

describe("case types", () => {
  it("accepts PROFILE_RECOVERY and REVIEW_PROTECTION only", () => {
    expect(CASE_TYPES).toEqual(["PROFILE_RECOVERY", "REVIEW_PROTECTION"])
    expect(isCaseType("PROFILE_RECOVERY")).toBe(true)
    expect(isCaseType("REVIEW_PROTECTION")).toBe(true)
    expect(isCaseType("PROFILE_ACCESS")).toBe(false)
    expect(isCaseType("GENERAL")).toBe(false)
    expect(isCaseType("MONITORING")).toBe(false)
    expect(isCaseType("GUARD")).toBe(false)
  })
})

describe("case statuses", () => {
  it("accepts the v1 status set", () => {
    expect(CASE_STATUSES).toEqual([
      "RECEIVED",
      "UNDER_REVIEW",
      "AWAITING_CUSTOMER",
      "RECOMMENDATION_READY",
      "CLOSED",
      "CANCELLED",
    ])
    for (const status of CASE_STATUSES) {
      expect(isCaseStatus(status)).toBe(true)
    }
    expect(isCaseStatus("OPEN")).toBe(false)
  })
})

describe("isCasePublicRef", () => {
  it("accepts database-generated examples", () => {
    expect(isCasePublicRef("PR-26-7K4M2Q")).toBe(true)
    expect(isCasePublicRef("RV-26-X8P3LM")).toBe(true)
    expect(isCasePublicRefForType("PR-26-7K4M2Q", "PROFILE_RECOVERY")).toBe(true)
    expect(isCasePublicRefForType("RV-26-X8P3LM", "REVIEW_PROTECTION")).toBe(true)
  })

  it("rejects malformed refs", () => {
    expect(isCasePublicRef("PR-26-7K4M2")).toBe(false)
    expect(isCasePublicRef("PR-2026-7K4M2Q")).toBe(false)
    expect(isCasePublicRef("PX-26-7K4M2Q")).toBe(false)
    expect(isCasePublicRef("pr-26-7K4M2Q")).toBe(false)
    expect(isCasePublicRef("PR-26-7K4M2I")).toBe(false)
    expect(isCasePublicRef("PR-26-7K4M2O")).toBe(false)
    expect(isCasePublicRef("PR-26-7K4M20")).toBe(false)
    expect(isCasePublicRef("PR-26-7K4M21")).toBe(false)
    expect(isCasePublicRef("")).toBe(false)
    expect(isCasePublicRefForType("RV-26-X8P3LM", "PROFILE_RECOVERY")).toBe(false)
  })
})

describe("mapFormServiceToCaseType", () => {
  it("maps current form values without changing the form", () => {
    expect(mapFormServiceToCaseType("profile-recovery")).toBe("PROFILE_RECOVERY")
    expect(mapFormServiceToCaseType("profile-access")).toBe("PROFILE_RECOVERY")
    expect(mapFormServiceToCaseType("review-protection")).toBe("REVIEW_PROTECTION")
    expect(mapFormServiceToCaseType("general")).toBeNull()
  })
})

describe("mapFormServiceToIssueSubtype", () => {
  it("keeps profile-access as a Profile Recovery subtype", async () => {
    const { mapFormServiceToIssueSubtype } = await import("@/lib/cases/domain")
    expect(mapFormServiceToIssueSubtype("profile-access")).toBe("ACCESS_VERIFICATION")
    expect(mapFormServiceToIssueSubtype("profile-recovery")).toBeNull()
    expect(mapFormServiceToIssueSubtype("review-protection")).toBeNull()
  })
})

describe("public ref generation ownership", () => {
  it("does not expose a TypeScript generator", async () => {
    const domain = await import("@/lib/cases/domain")
    expect("generateCasePublicRef" in domain).toBe(false)
    expect("generate_case_public_ref" in domain).toBe(false)
  })
})
