// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import { CaseCompletion, CaseNextActionCard } from "./next-action"
import { cockpitScenarios, componentScenarios, flowFrom } from "./fixtures"
import type { CaseFlowFacts } from "@/lib/case-flow/model"

afterEach(() => cleanup())

function cardFor(facts: CaseFlowFacts) {
  const flow = flowFrom(facts)
  render(<CaseNextActionCard action={flow.primaryAction!} />)
  return flow
}

describe("the next action card", () => {
  it("shows the model's own label and explanation", () => {
    const flow = cardFor(cockpitScenarios.preparationApprovePack)
    expect(screen.getByRole("heading", { name: "Approve the evidence pack" })).toBeInTheDocument()
    expect(screen.getByText(flow.primaryAction!.description)).toBeInTheDocument()
  })

  it("names the operator as the owner of work they can do now", () => {
    cardFor(cockpitScenarios.newCase)
    expect(screen.getByText("Action owner: You")).toBeInTheDocument()
    expect(screen.getByText("Action required")).toBeInTheDocument()
  })

  it("names the party a waiting case is waiting on", () => {
    cardFor(cockpitScenarios.evidenceWaitingForCustomer)
    expect(screen.getByText("Waiting on: Customer")).toBeInTheDocument()
    expect(screen.getByText("Waiting")).toBeInTheDocument()
  })

  it("names Google when Google is the one holding the case up", () => {
    cardFor(cockpitScenarios.waitingForGoogle)
    expect(screen.getByText("Waiting on: Google")).toBeInTheDocument()
  })

  it("does not offer a waiting step as something to press", () => {
    cardFor(cockpitScenarios.evidenceWaitingForCustomer)
    const link = screen.getByRole("link", { name: "View Evidence and documents" })
    expect(link).toHaveAttribute("href", `/cases/${cockpitScenarios.newCase.caseId}/evidence`)
    expect(link).not.toHaveClass("button-link")
    expect(screen.queryByRole("link", { name: "Waiting for the customer to upload evidence" })).toBeNull()
  })

  it("says a blocked step is blocked instead of dressing it up as available", () => {
    cardFor(componentScenarios.commercialPositionUnknown)
    expect(screen.getByText("Blocked")).toBeInTheDocument()
    expect(screen.getByText("Blocked by: ProfileRelaunch")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View Commercial and money" })).not.toHaveClass("button-link")
  })

  it("makes a step that can be taken now the one button on the card", () => {
    cardFor(cockpitScenarios.guidedWaitingForPayment)
    expect(screen.queryByRole("link", { name: /^View/ })).toBeInTheDocument()
    cleanup()
    cardFor(cockpitScenarios.serviceNeedsQuote)
    const cta = screen.getByRole("link", { name: "Create the quote" })
    expect(cta).toHaveClass("button-link")
    expect(cta).toHaveAttribute("href", `/cases/${cockpitScenarios.serviceNeedsQuote.caseId}/commercial`)
  })

  it("labels the button with the action rather than with 'continue'", () => {
    cardFor(cockpitScenarios.readyToSubmitRecordSubmission)
    expect(screen.getByRole("link", { name: "Submit externally, then record the submission" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /^(Continue|Go|Open)$/ })).toBeNull()
  })

  it("sends a same-case action to the section that holds the command, not to the top of this page", () => {
    cardFor(cockpitScenarios.managedPermissionInReview)
    const link = screen.getByRole("link", { name: "Re-establish an invalidated permission" })
    expect(link).toHaveAttribute("href", "#case-authorisation")
  })

  it("sends a submission recommendation to the submission section", () => {
    cardFor(cockpitScenarios.readyToSubmitRecordSubmission)
    expect(screen.getByRole("link", { name: /^Submit externally/ })).toHaveAttribute("href", "#case-submissions")
  })

  it("sends a closure recommendation to the closure section", () => {
    cardFor(cockpitScenarios.outcomeReview)
    expect(screen.getByRole("link", { name: "Close the case" })).toHaveAttribute("href", "#case-closure")
  })

  it("links straight out to another workspace when the work happens there", () => {
    cardFor(cockpitScenarios.evidenceScanProblem)
    expect(screen.getByRole("link", { name: "Refresh the evidence security check" }))
      .toHaveAttribute("href", `/cases/${cockpitScenarios.newCase.caseId}/evidence`)
  })

  it("flags a date that has already passed", () => {
    cardFor(componentScenarios.evidenceRequestOverdue)
    expect(screen.getByText(/overdue/)).toBeInTheDocument()
    expect(screen.getByText(/^Due 1 May 2026/)).toBeInTheDocument()
  })

  it("does not invent a date when the model has none", () => {
    cardFor(cockpitScenarios.newCase)
    expect(screen.queryByText(/^Due /)).toBeNull()
  })
})

describe("a completed case", () => {
  it("reports the outcome instead of recommending anything", () => {
    const flow = flowFrom(cockpitScenarios.closedSuccessfully)
    expect(flow.primaryAction).toBeNull()
    render(<CaseCompletion outcome="Profile restored" summary="The profile was reinstated by Google." />)
    expect(screen.getByRole("heading", { name: "This case is closed" })).toBeInTheDocument()
    expect(screen.getByText("Outcome: Profile restored")).toBeInTheDocument()
    expect(screen.getByText("The profile was reinstated by Google.")).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("says so plainly when no outcome was ever recorded", () => {
    render(<CaseCompletion outcome={null} summary="" />)
    expect(screen.getByText("Outcome: Historical closure — outcome not recorded")).toBeInTheDocument()
  })
})
