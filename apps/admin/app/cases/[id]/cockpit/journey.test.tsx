// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import { CaseJourney } from "./journey"
import { cockpitScenarios, flowFrom, type CockpitScenarioName } from "./fixtures"

afterEach(() => cleanup())

function journeyFor(name: CockpitScenarioName) {
  const flow = flowFrom(cockpitScenarios[name])
  render(<CaseJourney phases={flow.phases} phase={flow.phase} progress={flow.progressSummary} />)
  return flow
}

const phaseNames = ["Received", "Evidence", "Assessment", "Service", "Prerequisites", "Preparation", "Submission", "Decision", "Complete"]

describe("the case journey", () => {
  it("shows all nine phases in journey order", () => {
    journeyFor("preparationApprovePack")
    const steps = screen.getAllByRole("listitem")
    expect(steps).toHaveLength(9)
    expect(steps.map(step => step.textContent)).toEqual(phaseNames.map(name => expect.stringContaining(name)))
  })

  it("marks the phase the case is actually in", () => {
    journeyFor("preparationApprovePack")
    const current = screen.getAllByRole("listitem").filter(step => step.getAttribute("aria-current") === "step")
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent("Preparation")
    expect(current[0]).toHaveTextContent("In progress")
  })

  it("names the phase that needs attention rather than only tinting it", () => {
    journeyFor("evidenceScanProblem")
    const evidence = screen.getAllByRole("listitem").find(step => step.textContent?.startsWith("!Evidence"))
    expect(evidence).toHaveTextContent("Needs attention")
  })

  it("keeps the stage and the troubled phase apart when a later stage looks back", () => {
    // Ready to submit with an unpublished pack: the case is at submission,
    // and preparation is what needs looking at. One must not overwrite the
    // other, because the operator has to see both.
    journeyFor("readyToSubmitNeedsPublish")
    const steps = screen.getAllByRole("listitem")
    expect(steps[5]).toHaveTextContent("Needs attention")
    expect(steps[6]).toHaveTextContent("In progress")
    expect(steps[6].getAttribute("aria-current")).toBe("step")
  })

  it("shows earlier phases as complete without claiming the whole journey is", () => {
    journeyFor("preparationApprovePack")
    const steps = screen.getAllByRole("listitem")
    expect(steps[0]).toHaveTextContent("Complete")
    expect(steps[8]).toHaveTextContent("Not started")
  })

  it("leaves every phase of a new case unstarted rather than forcing them green", () => {
    journeyFor("newCase")
    const steps = screen.getAllByRole("listitem")
    expect(steps[0]).toHaveTextContent("In progress")
    expect(steps.slice(1).every(step => step.textContent?.includes("Not started"))).toBe(true)
  })

  it("gives every phase a word, so no state is carried by colour alone", () => {
    journeyFor("managedPermissionInReview")
    for (const step of screen.getAllByRole("listitem")) {
      expect(step.textContent).toMatch(/Complete|In progress|Not started|Needs attention/)
    }
  })

  it("counts phases reached rather than inventing a percentage", () => {
    journeyFor("waitingForGoogle")
    expect(screen.getByText("7 of 9 phases complete.")).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/%/)
  })

  it("says in a sentence what the phase the case is in actually means", () => {
    const flow = journeyFor("guidedWaitingForPayment")
    const detail = flow.phases.find(phase => phase.id === flow.phase)!.detail
    expect(screen.getByText(`Prerequisites: ${detail}`)).toBeInTheDocument()
  })

  it("shows a closed case as finished all the way through", () => {
    journeyFor("closedSuccessfully")
    const steps = screen.getAllByRole("listitem")
    expect(steps.every(step => step.textContent?.includes("Complete"))).toBe(true)
    expect(screen.getByText("9 of 9 phases complete.")).toBeInTheDocument()
  })
})
