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

import { CasePrerequisites } from "./prerequisites"
import { cockpitScenarios, flowFrom, type CockpitScenarioName } from "./fixtures"

afterEach(() => cleanup())

function prerequisitesFor(name: CockpitScenarioName) {
  const flow = flowFrom(cockpitScenarios[name])
  render(<CasePrerequisites groups={flow.prerequisites} />)
  return flow
}

describe("case prerequisites", () => {
  it("shows nothing at all when the track has none", () => {
    const { container } = render(<CasePrerequisites groups={flowFrom(cockpitScenarios.newCase).prerequisites} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows the Guided group with each item's own state", () => {
    prerequisitesFor("guidedWaitingForPayment")
    expect(screen.getByRole("heading", { name: /Guided/ })).toBeInTheDocument()
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("Done")
    expect(items[1]).toHaveTextContent("In progress")
    expect(screen.getByText("Not complete")).toBeInTheDocument()
  })

  it("shows both Managed groups rather than one authorised flag", () => {
    prerequisitesFor("managedWaitingForAgreement")
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2)
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(9)
    expect(items[2]).toHaveTextContent("In progress")
    expect(items[3]).toHaveTextContent("Not started")
  })

  it("marks the Managed payment group satisfied once consent and a method exist", () => {
    prerequisitesFor("managedPermissionInReview")
    expect(screen.getByText("All in place")).toBeInTheDocument()
    expect(screen.getByText("Not complete")).toBeInTheDocument()
  })

  it("flags an invalidated permission as needing attention, not as merely unstarted", () => {
    prerequisitesFor("managedPermissionInReview")
    const permission = screen.getAllByRole("listitem").find(item => item.textContent?.includes("The case-management permission is active"))
    expect(permission).toHaveTextContent("Needs attention")
  })

  it("gives every item a word beside its symbol, so state is never colour alone", () => {
    prerequisitesFor("managedWaitingForAgreement")
    for (const item of screen.getAllByRole("listitem")) {
      expect(item.textContent).toMatch(/Done|In progress|Not started|Needs attention|Not needed/)
    }
  })

  it("links an outstanding item to where it is dealt with and leaves a finished one as text", () => {
    prerequisitesFor("guidedWaitingForPayment")
    const items = screen.getAllByRole("listitem")
    expect(items[0].querySelector("a")).toBeNull()
    expect(items[1].querySelector("a")).toHaveAttribute("href", `/cases/${cockpitScenarios.guidedWaitingForPayment.caseId}/commercial`)
  })

  it("does not turn the list into a row of commands", () => {
    prerequisitesFor("managedWaitingForAgreement")
    expect(screen.queryByRole("button")).toBeNull()
    expect(document.querySelectorAll(".button-link")).toHaveLength(0)
  })
})
