import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { activationPlan, activationPlans, cutoverSequence, releaseRecordTemplate, stopConditions } from "./cutover"
import { liveCapabilities } from "./gates"
import { environmentContract } from "./environment"

const doc = readFileSync(new URL("../../../../docs/admin/production-cutover-readiness.md", import.meta.url), "utf8")

describe("cutover sequence", () => {
  it("is five ordered phases, numbered 0 to 4", () => {
    expect(cutoverSequence.map(phase => phase.number)).toEqual([0, 1, 2, 3, 4])
  })

  it("describes each phase completely", () => {
    const incomplete = cutoverSequence
      .filter(
        phase =>
          phase.intent.trim().length < 40
          || phase.steps.length < 3
          || phase.verification.length < 2
          || phase.prohibited.length < 2
          || phase.stopCondition.trim().length < 60,
      )
      .map(phase => phase.number)
    expect(incomplete).toEqual([])
  })

  it("does not combine the database, the domain and activation into one event", () => {
    const [, database, access, , activation] = cutoverSequence
    expect(database.name).toBe("Production database")
    expect(access.name).toBe("Admin production access")
    expect(activation.name).toContain("one at a time")
    expect(activation.prohibited.join(" ")).toMatch(/do not activate two capabilities in one change/i)
  })

  it("refuses a destructive rollback as the response to an application defect", () => {
    const phase3 = cutoverSequence.find(phase => phase.number === 3)
    expect(phase3?.stopCondition).toMatch(/do not propose a destructive database rollback/i)
    expect(phase3?.stopCondition).toMatch(/forward-only/i)
  })

  it("keeps every phase from creating external resources it is not allowed to", () => {
    expect(cutoverSequence[0].prohibited.join(" ")).toMatch(/do not change dns from the repository/i)
    expect(cutoverSequence[1].prohibited.join(" ")).toMatch(/do not replay an applied migration/i)
    expect(cutoverSequence[2].prohibited.join(" ")).toMatch(/do not create a second admin identity/i)
  })

  it("appears in the document in the same order", () => {
    let position = -1
    for (const phase of cutoverSequence) {
      const next = doc.indexOf(`### Phase ${phase.number} — `)
      expect({ phase: phase.number, found: next > position }).toEqual({ phase: phase.number, found: true })
      position = next
    }
  })
})

describe("activation plans", () => {
  it("covers every live capability exactly once", () => {
    expect(activationPlans.map(plan => plan.capability).sort()).toEqual(liveCapabilities.map(entry => entry.id).sort())
  })

  it("gives each capability a prerequisite, a test, an enable action, a verification and a rollback", () => {
    const incomplete = activationPlans
      .filter(
        plan =>
          plan.prerequisite.length < 2
          || plan.test.trim().length < 40
          || plan.enableAction.trim().length < 30
          || plan.verification.trim().length < 30
          || plan.rollback.trim().length < 40,
      )
      .map(plan => plan.capability)
    expect(incomplete).toEqual([])
  })

  it("says what closing the gate does not undo", () => {
    expect(activationPlan("outgoing_mail").rollback).toMatch(/does not recall a message/i)
    expect(activationPlan("stripe_payments").rollback).toMatch(/does not reverse a charge/i)
    expect(activationPlan("privacy_deletion").rollback).toMatch(/cannot undo/i)
  })

  it("names only enable actions the environment contract knows about", () => {
    const named = activationPlans.flatMap(plan => plan.enableAction.match(/\b[A-Z][A-Z0-9_]{4,}\b/g) ?? [])
    const unknown = named.filter(name => !environmentContract.some(entry => entry.name === name))
    expect([...new Set(unknown)]).toEqual([])
  })

  it("requires a reviewed code change where a setting is not enough", () => {
    expect(activationPlan("google_api").prerequisite.join(" ")).toMatch(/googleLiveStack is null/i)
    expect(activationPlan("stripe_payments").prerequisite.join(" ")).toMatch(/test-mode keys/i)
  })

  it("does not let Guard alert notifications precede outgoing mail", () => {
    expect(activationPlan("guard_automation").prerequisite.join(" ")).toMatch(/outgoing mail already activated/i)
  })
})

describe("stop conditions", () => {
  it("gives every trigger an ordered safe response", () => {
    const incomplete = stopConditions
      .filter(entry => entry.trigger.trim().length < 20 || entry.halt.trim().length < 10 || entry.response.length < 3)
      .map(entry => entry.id)
    expect(incomplete).toEqual([])
  })

  it("preserves evidence before anything is changed", () => {
    const unexpected = stopConditions.find(entry => entry.id === "unexpected-capability-enabled")
    expect(unexpected?.response[0]).toMatch(/before changing any configuration/i)
    const provider = stopConditions.find(entry => entry.id === "provider-effect-unexpected")
    expect(provider?.response.join(" ")).toMatch(/preserve every provider event/i)
  })

  it("appears in the document", () => {
    for (const entry of stopConditions) expect(doc).toContain(`\`${entry.id}\``)
  })
})

describe("release record template", () => {
  it("carries every field the record has to hold", () => {
    expect(releaseRecordTemplate.map(field => field.field)).toEqual([
      "Release identifier",
      "Git commit SHA",
      "Deployment identifier",
      "Admin domain",
      "Migration head applied",
      "Database verification",
      "Admin identity count",
      "Environment contract check",
      "Live capability gate states",
      "Smoke test results",
      "Runtime error check",
      "Step 22B status",
      "Exceptions accepted",
      "Owner decisions recorded",
      "Operator",
      "Date and time",
      "Outcome",
      "Rollback notes",
    ])
  })

  it("marks every claim about production as something the operator observed", () => {
    const observed = releaseRecordTemplate.filter(field => field.requiresObservation).map(field => field.field)
    expect(observed).toContain("Migration head applied")
    expect(observed).toContain("Admin identity count")
    expect(observed).toContain("Live capability gate states")
    expect(observed).toContain("Step 22B status")
  })

  it("records presence rather than value for the environment check", () => {
    const field = releaseRecordTemplate.find(entry => entry.field === "Environment contract check")
    expect(field?.description).toMatch(/never a value/i)
  })

  it("appears in the document with every field", () => {
    for (const field of releaseRecordTemplate) expect(doc).toContain(`| ${field.field} |`)
  })
})
