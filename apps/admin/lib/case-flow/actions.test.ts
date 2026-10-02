import { describe, expect, it } from "vitest"
import { actionCatalogue, bandOf, highestPriority, priorityBands, priorityKey } from "./actions"
import { caseDestinationKinds } from "./destinations"
import { caseNextActionIds, type CaseNextActionId } from "./model"

describe("action catalogue", () => {
  it("defines every action exactly once", () => {
    expect(Object.keys(actionCatalogue).sort()).toEqual([...caseNextActionIds].sort())
    expect(new Set(caseNextActionIds).size).toBe(caseNextActionIds.length)
  })

  it("gives every action a band, an owner, wording and a surface", () => {
    for (const id of caseNextActionIds) {
      const definition = actionCatalogue[id]
      expect(priorityBands[definition.band], id).toBeDefined()
      expect(definition.label.length, id).toBeGreaterThan(3)
      expect(definition.description.length, id).toBeGreaterThan(20)
      expect(caseDestinationKinds, id).toContain(definition.surface)
    }
  })

  it("only ever waits on somebody who has actually been asked", () => {
    for (const id of caseNextActionIds) {
      const definition = actionCatalogue[id]
      if (definition.band !== "WAITING") continue
      expect(definition.state, id).toBe("WAITING")
      expect(definition.owner, id).not.toBe("ADMIN")
    }
  })

  it("keeps the declared bands in the documented order", () => {
    expect(priorityBands.SAFETY).toBeLessThan(priorityBands.ADMIN_ACTION)
    expect(priorityBands.ADMIN_ACTION).toBeLessThan(priorityBands.OUTBOUND)
    expect(priorityBands.OUTBOUND).toBeLessThan(priorityBands.WAITING)
    expect(priorityBands.WAITING).toBeLessThan(priorityBands.PROGRESSION)
  })

  // Declaration order breaks ties inside a band, so the catalogue has to be
  // grouped by band for that tie-breaking to mean "earliest in the journey".
  it("declares the catalogue in band order", () => {
    let previous = 0
    for (const id of Object.keys(actionCatalogue) as CaseNextActionId[]) {
      // The fallback is deliberately declared last whatever its band; it is
      // only ever proposed when nothing else was.
      if (id === "REVIEW_CASE_STATE") continue
      const band = priorityBands[bandOf(id)]
      expect(band, id).toBeGreaterThanOrEqual(previous)
      previous = band
    }
  })
})

describe("priority", () => {
  it("prefers safety over anything an operator could otherwise be doing", () => {
    const chosen = highestPriority([
      { id: "CLOSE_CASE" },
      { id: "REVIEW_EVIDENCE" },
      { id: "RESOLVE_EVIDENCE_THREAT" },
      { id: "WAIT_FOR_GOOGLE" },
    ])
    expect(chosen?.id).toBe("RESOLVE_EVIDENCE_THREAT")
  })

  it("prefers work that can be done now over waiting for somebody else", () => {
    expect(highestPriority([{ id: "WAIT_FOR_SERVICE_AGREEMENT" }, { id: "ISSUE_CASE_PERMISSION" }])?.id)
      .toBe("ISSUE_CASE_PERMISSION")
    expect(highestPriority([{ id: "WAIT_FOR_CUSTOMER_EVIDENCE" }, { id: "REVIEW_EVIDENCE" }])?.id)
      .toBe("REVIEW_EVIDENCE")
  })

  it("prefers resolving the current step over advancing past it", () => {
    expect(highestPriority([{ id: "ADVANCE_TO_PREPARATION" }, { id: "START_UPFRONT_PAYMENT" }])?.id)
      .toBe("START_UPFRONT_PAYMENT")
  })

  it("picks the earliest unfinished step inside a band", () => {
    expect(highestPriority([{ id: "ISSUE_CASE_PERMISSION" }, { id: "VERIFY_CUSTOMER_CONTACT" }])?.id)
      .toBe("VERIFY_CUSTOMER_CONTACT")
    expect(highestPriority([{ id: "OFFER_QUOTE" }, { id: "CREATE_QUOTE" }])?.id).toBe("CREATE_QUOTE")
  })

  it("does not depend on the order candidates were proposed in", () => {
    const candidates: Array<{ id: CaseNextActionId }> = [
      { id: "CLOSE_CASE" },
      { id: "REVIEW_EVIDENCE" },
      { id: "RESOLVE_PAYMENT_EXCEPTION" },
      { id: "REQUEST_EVIDENCE" },
    ]
    const forwards = highestPriority(candidates)?.id
    const backwards = highestPriority([...candidates].reverse())?.id
    expect(forwards).toBe(backwards)
    expect(forwards).toBe("RESOLVE_PAYMENT_EXCEPTION")
  })

  it("gives every action a distinct key, so ties cannot be resolved by luck", () => {
    const keys = caseNextActionIds.map(priorityKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("has nothing to recommend when nothing was proposed", () => {
    expect(highestPriority([])).toBeNull()
  })
})
