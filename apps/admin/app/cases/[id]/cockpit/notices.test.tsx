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

import { CaseAttention, CaseBlockers } from "./notices"
import { cockpitScenarios, componentScenarios, flowFrom } from "./fixtures"

afterEach(() => cleanup())

describe("blockers", () => {
  it("shows nothing when nothing is blocking", () => {
    const { container } = render(<CaseBlockers blockers={flowFrom(cockpitScenarios.newCase).blockers} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("says what is missing, why it stops progress and who resolves it", () => {
    const flow = flowFrom(cockpitScenarios.guidedWaitingForPayment)
    render(<CaseBlockers blockers={flow.blockers} />)
    expect(screen.getByRole("heading", { name: "The upfront payment has not been collected" })).toBeInTheDocument()
    expect(screen.getByText(/A completed checkout page is not a payment record/)).toBeInTheDocument()
    expect(screen.getByText("To be resolved by Customer.")).toBeInTheDocument()
  })

  it("attributes a deployment capability to the system rather than to a person", () => {
    render(<CaseBlockers blockers={flowFrom(cockpitScenarios.readyToSubmitRecordSubmission).blockers} />)
    expect(screen.getByRole("heading", { name: "There is no automated Google submission in this deployment" })).toBeInTheDocument()
    expect(screen.getByText("To be resolved by System.")).toBeInTheDocument()
  })

  it("keeps blocker codes out of the interface", () => {
    render(<CaseBlockers blockers={flowFrom(cockpitScenarios.managedPermissionInReview).blockers} />)
    expect(document.body.textContent).not.toMatch(/AUTHORISATION_IN_REVIEW|AUTHORISATION_INCOMPLETE/)
  })

  it("gives each link a distinct name even when two point at the same place", () => {
    render(<CaseBlockers blockers={flowFrom(cockpitScenarios.managedPermissionInReview).blockers} />)
    const names = screen.getAllByRole("link").map(link => link.textContent)
    expect(names).toHaveLength(2)
    expect(new Set(names).size).toBe(2)
  })
})

describe("attention items", () => {
  it("shows nothing when there is nothing to note", () => {
    const { container } = render(<CaseAttention items={flowFrom(cockpitScenarios.closedSuccessfully).attentionItems} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("marks how serious each item is in words", () => {
    render(<CaseAttention items={flowFrom(cockpitScenarios.managedPermissionInReview).attentionItems} />)
    expect(screen.getByText("Critical")).toBeInTheDocument()
    expect(screen.getByText("For information")).toBeInTheDocument()
  })

  it("keeps the model's order rather than sorting the journey out of sequence", () => {
    const flow = flowFrom(cockpitScenarios.evidenceScanProblem)
    render(<CaseAttention items={flow.attentionItems} />)
    const headings = screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent)
    expect(headings).toEqual(flow.attentionItems.map(item => item.title))
  })

  it("reports a date that has passed as overdue", () => {
    render(<CaseAttention items={flowFrom(componentScenarios.evidenceRequestOverdue).attentionItems} />)
    expect(screen.getByText(/Due 1 May 2026.*This is overdue\./)).toBeInTheDocument()
  })

  it("keeps an open complaint visible after the case is closed", () => {
    render(<CaseAttention items={flowFrom(cockpitScenarios.closedWithOpenComplaint).attentionItems} />)
    expect(screen.getByRole("heading", { name: "There is an open complaint about this case" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^Open Complaints/ })).toHaveAttribute("href", "/complaints")
  })

  it("keeps attention codes out of the interface", () => {
    render(<CaseAttention items={flowFrom(cockpitScenarios.evidenceScanProblem).attentionItems} />)
    expect(document.body.textContent).not.toMatch(/EVIDENCE_SCAN_UNRESOLVED|LIVE_MAIL_DISABLED/)
  })
})
