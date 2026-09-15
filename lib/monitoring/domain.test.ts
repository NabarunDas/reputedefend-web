import { describe, expect, it } from "vitest"
import { CASE_TYPES, isCaseType } from "@/lib/cases/domain"
import {
  isMonitoringCurrentlyActive,
  isMonitoringRequestStatus,
  MONITORING_INTAKE_SOURCE,
  MONITORING_REQUEST_SOURCE,
  MONITORING_REQUEST_STATUSES,
} from "@/lib/monitoring/domain"

describe("monitoring request statuses", () => {
  it("uses the onboarding lifecycle and does not treat REQUESTED as active", () => {
    expect(MONITORING_REQUEST_STATUSES).toEqual([
      "REQUESTED",
      "AWAITING_PAYMENT",
      "AWAITING_AUTHORIZATION",
      "ACTIVE",
      "PAUSED",
      "CANCELLED",
    ])
    for (const status of MONITORING_REQUEST_STATUSES) {
      expect(isMonitoringRequestStatus(status)).toBe(true)
    }
    expect(isMonitoringRequestStatus("RECEIVED")).toBe(false)
    expect(isMonitoringCurrentlyActive("REQUESTED")).toBe(false)
    expect(isMonitoringCurrentlyActive("ACTIVE")).toBe(true)
  })
})

describe("guard is not a case", () => {
  it("does not add GUARD to CaseType and has no public Guard reference", () => {
    expect(CASE_TYPES).toEqual(["PROFILE_RECOVERY", "REVIEW_PROTECTION"])
    expect(isCaseType("GUARD")).toBe(false)
    expect(isCaseType("MONITORING")).toBe(false)
    expect(MONITORING_REQUEST_SOURCE).toBe("START_MONITORING")
    expect(MONITORING_INTAKE_SOURCE).toBe("start-monitoring")
    expect(MONITORING_REQUEST_SOURCE).not.toBe("GET_HELP")
  })
})
