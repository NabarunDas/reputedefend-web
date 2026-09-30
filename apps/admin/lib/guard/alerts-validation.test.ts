import { describe, expect, it } from "vitest"
import { guardAlertArgs, isGuardAlertOperation } from "./alerts-validation"

const alertId = "11111111-1111-4111-8111-111111111111"

describe("guard alert validation", () => {
  it("requires severity, disposition and reason to acknowledge", () => {
    expect(isGuardAlertOperation("acknowledge")).toBe(true)
    expect(guardAlertArgs("acknowledge", { alertId, version: 1, severity: "HIGH" })).toBeNull()
    expect(guardAlertArgs("acknowledge", { alertId, version: 1, severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE", reason: "Reviewed the available profile change." }))
      .toMatchObject({ severity: "HIGH", disposition: "CONFIRMED_CUSTOMER_ISSUE" })
  })

  it("requires an explicit case type and rejects incomplete notification copy", () => {
    expect(guardAlertArgs("create_intervention_case", { alertId, version: 1 })).toBeNull()
    expect(guardAlertArgs("create_intervention_case", { alertId, version: 1, caseType: "PROFILE_RECOVERY" })?.caseType).toBe("PROFILE_RECOVERY")
    expect(guardAlertArgs("prepare_notification", { alertId, version: 1, fact: "too short", effect: "The listing may be wrong.", nextStep: "Please check the profile." })).toBeNull()
  })
})
