// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"

import { CaseSnapshot } from "./snapshot"
import { caseDetail, cockpitScenarios, componentScenarios, flowFrom } from "./fixtures"
import type { CaseFlowFacts } from "@/lib/case-flow/model"
import type { CaseDetail } from "@/lib/cases/model"

afterEach(() => cleanup())

function snapshotFor(facts: CaseFlowFacts, overrides: Partial<CaseDetail> = {}) {
  const flow = flowFrom(facts)
  const c = caseDetail({ status: facts.caseStatus, track: facts.serviceTrack as CaseDetail["track"], ...overrides })
  render(<CaseSnapshot c={c} flow={flow} />)
  return flow
}

/** The word above a snapshot value, read from the list rather than guessed. */
function rowLabelled(label: string) {
  const terms = Array.from(document.querySelectorAll("dt"))
  const term = terms.find(node => node.textContent === label)
  return term?.nextElementSibling?.textContent ?? null
}

describe("the case snapshot's ownership row", () => {
  it("names the operator as the owner of work they have to do, rather than reporting a wait", () => {
    const flow = snapshotFor(cockpitScenarios.newCase)
    expect(flow.primaryAction!.state).toBe("ACTION_REQUIRED")
    expect(flow.waitingOn).toBe("ADMIN")
    expect(rowLabelled("Action owner")).toBe("You")
    expect(screen.queryByText("Waiting on")).toBeNull()
    expect(screen.queryByText("ProfileRelaunch")).toBeNull()
  })

  it("still names the operator when the step is merely ready rather than demanded", () => {
    const flow = snapshotFor(cockpitScenarios.readyToSubmitRecordSubmission)
    expect(flow.primaryAction!.state).toBe("READY")
    expect(rowLabelled("Action owner")).toBe("You")
    expect(screen.queryByText("Waiting on")).toBeNull()
  })

  it("reports a wait only when the case is actually waiting on somebody", () => {
    const flow = snapshotFor(cockpitScenarios.evidenceWaitingForCustomer)
    expect(flow.primaryAction!.state).toBe("WAITING")
    expect(rowLabelled("Waiting on")).toBe("Customer")
    expect(screen.queryByText("Action owner")).toBeNull()
  })

  it("names Google when Google is the party being waited on", () => {
    snapshotFor(cockpitScenarios.waitingForGoogle)
    expect(rowLabelled("Waiting on")).toBe("Google")
  })

  it("says what a blocked case is blocked by", () => {
    const flow = snapshotFor(componentScenarios.commercialPositionUnknown)
    expect(flow.primaryAction!.state).toBe("BLOCKED")
    expect(rowLabelled("Blocked by")).toBe("ProfileRelaunch")
    expect(screen.queryByText("Waiting on")).toBeNull()
  })

  it("reports a finished case as finished instead of waiting on nobody", () => {
    const flow = snapshotFor(cockpitScenarios.closedSuccessfully)
    expect(flow.primaryAction).toBeNull()
    expect(rowLabelled("Work state")).toBe("Complete")
    expect(screen.queryByText("Waiting on")).toBeNull()
    expect(screen.queryByText("Nobody")).toBeNull()
  })

  it("keeps the ownership row in the same position whatever the state", () => {
    for (const facts of [cockpitScenarios.newCase, cockpitScenarios.evidenceWaitingForCustomer, cockpitScenarios.closedSuccessfully]) {
      snapshotFor(facts)
      expect(Array.from(document.querySelectorAll("dt")).map(node => node.textContent?.replace(/^(Action owner|Waiting on|Blocked by|Work state)$/, "ownership")))
        .toEqual(["Service track", "Current phase", "ownership", "Open tasks", "Case status", "Priority"])
      cleanup()
    }
  })
})

describe("the rest of the case snapshot", () => {
  it("states the track, the human phase, the open task count, the status and the priority", () => {
    snapshotFor(cockpitScenarios.managedWaitingForAgreement, {
      priority: "HIGH",
      tasks: [
        { id: "t1", status: "OPEN" } as CaseDetail["tasks"][number],
        { id: "t2", status: "DONE" } as CaseDetail["tasks"][number],
      ],
    })
    expect(rowLabelled("Service track")).toBe("Managed")
    expect(rowLabelled("Current phase")).toBe("Prerequisites")
    expect(rowLabelled("Open tasks")).toBe("1")
    expect(rowLabelled("Case status")).toBe("Open")
    expect(rowLabelled("Priority")).toBe("High priority")
  })

  it("calls a closed case closed", () => {
    snapshotFor(cockpitScenarios.closedSuccessfully)
    expect(rowLabelled("Case status")).toBe("Closed")
    expect(rowLabelled("Current phase")).toBe("Complete")
  })
})
