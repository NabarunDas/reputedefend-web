// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import { CaseQueue, CaseQueueAction, CaseQueueItem, CaseQueueStatus } from "./queue"
import { queueEntries, queueScenarios } from "./queue-fixtures"
import type { CaseQueueEntry } from "./queue"

afterEach(() => cleanup())

const renderItem = (entry: CaseQueueEntry) => {
  render(<ul>{<CaseQueueItem row={entry.row} flow={entry.flow} />}</ul>)
  return entry
}

const item = (reference: string) => screen.getByRole("article", { name: reference })

describe("what a case says about itself", () => {
  it("names the case, the client and the business", () => {
    const { row } = renderItem(queueScenarios.newCaseToTriage)
    expect(screen.getByRole("heading", { level: 2, name: row.reference })).toBeInTheDocument()
    expect(screen.getByText(`${row.client} · ${row.business}`)).toBeInTheDocument()
  })

  it("says which human phase the case is in, and never the technical stage", () => {
    const { flow } = renderItem(queueScenarios.waitingOnTheCustomer)
    expect(screen.getByText(flow.phaseLabel)).toBeInTheDocument()
    expect(screen.queryByText(flow.technicalStage)).not.toBeInTheDocument()
    expect(screen.queryByText(flow.technicalStageLabel)).not.toBeInTheDocument()
  })

  it("says the service track and the priority", () => {
    renderItem(queueScenarios.managedPermissionInReview)
    expect(screen.getByText("Managed")).toBeInTheDocument()
    expect(screen.getByText("Urgent")).toBeInTheDocument()
  })

  it("says whether the case is assigned, without confusing that with who owes the next step", () => {
    renderItem(queueScenarios.unassigned)
    expect(screen.getByText("Unassigned")).toBeInTheDocument()
    // Assignment is a staffing fact; ownership of the step is the model's.
    expect(screen.getByText(/^Action owner:/)).toBeInTheDocument()
  })
})

describe("what to do next", () => {
  it("uses the model's label, never the recorded note", () => {
    const { row, flow } = renderItem(queueScenarios.packToApprove)
    expect(screen.getByText(flow.primaryAction!.label)).toBeInTheDocument()
    expect(screen.queryByText(row.nextAction)).not.toBeInTheDocument()
  })

  it("names the operator as the owner of a step they can take now", () => {
    renderItem(queueScenarios.newCaseToTriage)
    expect(screen.getByText("Action required")).toBeInTheDocument()
    expect(screen.getByText("Action owner: You")).toBeInTheDocument()
  })

  it("names the party a waiting case is waiting on, and does not call it an owner", () => {
    renderItem(queueScenarios.waitingOnTheCustomer)
    expect(screen.getByText("Waiting")).toBeInTheDocument()
    expect(screen.getByText("Waiting on: Customer")).toBeInTheDocument()
  })

  it("names Google when Google is holding the case up", () => {
    renderItem(queueScenarios.waitingForGoogle)
    expect(screen.getByText("Waiting on: Google")).toBeInTheDocument()
  })

  it("says a blocked step is blocked and names what is blocking it", () => {
    const { flow } = renderItem(queueScenarios.commercialPositionUnknown)
    expect(flow.primaryAction!.state).toBe("BLOCKED")
    expect(screen.getByText("Blocked")).toBeInTheDocument()
    expect(screen.getByText(/^Blocked by:/)).toBeInTheDocument()
  })

  it("gives a completed case its outcome instead of an invented next step", () => {
    const { flow } = renderItem(queueScenarios.closedSuccessfully)
    expect(flow.primaryAction).toBeNull()
    // Said twice, deliberately: the phase the case is in, and the state of
    // the work. The outcome is what replaces the next step.
    expect(screen.getAllByText("Complete")).toHaveLength(2)
    expect(screen.getByText("Restored")).toBeInTheDocument()
    expect(screen.queryByText(/^Action owner:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument()
  })

  it("shows a date only when the model carries an authoritative one", () => {
    const withDate = queueScenarios.evidenceOverdue
    expect(withDate.flow.primaryAction!.dueAt).not.toBeNull()
    renderItem(withDate)
    expect(screen.getByText(/^Due /)).toBeInTheDocument()
    cleanup()

    // The row's own `due` column is a note's date, not the work's, so a case
    // whose action has none shows none even though the row has one.
    const withoutDate = queueScenarios.newCaseToTriage
    expect(withoutDate.flow.primaryAction!.dueAt).toBeNull()
    expect(withoutDate.row.due).not.toBeNull()
    renderItem(withoutDate)
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument()
  })

  it("formats a date the way the rest of Admin does", () => {
    renderItem(queueScenarios.evidenceOverdue)
    expect(screen.getByText("Due 1 May 2026, 13:00")).toBeInTheDocument()
  })
})

describe("what needs attention", () => {
  it("counts blockers rather than listing their codes", () => {
    const { flow } = renderItem(queueScenarios.managedPermissionInReview)
    expect(flow.blockers).toHaveLength(2)
    expect(screen.getByText("2 blockers")).toBeInTheDocument()
    for (const blocker of flow.blockers) {
      expect(screen.queryByText(blocker.code)).not.toBeInTheDocument()
      expect(screen.queryByText(blocker.title)).not.toBeInTheDocument()
    }
  })

  it("counts everything else as other issues", () => {
    const { flow } = renderItem(queueScenarios.openComplaintAlongside)
    expect(flow.attentionItems.length).toBeGreaterThan(0)
    const count = flow.attentionItems.length
    expect(screen.getByText(`${count} other issue${count === 1 ? "" : "s"}`)).toBeInTheDocument()
  })

  it("says one blocker in the singular", () => {
    const single = queueEntries.find(candidate => candidate.flow.blockers.length === 1)!
    renderItem(single)
    expect(screen.getByText("1 blocker")).toBeInTheDocument()
  })

  it("says Overdue in words, not in colour alone", () => {
    renderItem(queueScenarios.evidenceOverdue)
    expect(screen.getByText("Overdue")).toBeInTheDocument()
  })

  it("says nothing at all about a case with nothing wrong with it", () => {
    const calm = queueScenarios.closedSuccessfully
    expect(calm.flow.blockers).toHaveLength(0)
    expect(calm.flow.attentionItems).toHaveLength(0)
    renderItem(calm)
    expect(screen.queryByText(/blocker/)).not.toBeInTheDocument()
    expect(screen.queryByText(/other issue/)).not.toBeInTheDocument()
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument()
  })

  it("surfaces a reopened case through the model's own attention items", () => {
    const { flow } = renderItem(queueScenarios.reopenedAfterClosure)
    expect(flow.reopened).toBe(true)
    expect(screen.getByText(/other issue/)).toBeInTheDocument()
  })
})

describe("every one of the seventeen states", () => {
  it.each(Object.entries(queueScenarios))("renders %s with a phase, a link and no empty action", (_name, entry) => {
    render(<CaseQueue entries={[entry]} />)
    const article = item(entry.row.reference)

    expect(within(article).getByRole("link", { name: entry.row.reference }))
      .toHaveAttribute("href", `/cases/${entry.row.id}`)
    expect(within(article).getAllByText(entry.flow.phaseLabel).length).toBeGreaterThan(0)
    expect(within(article).getAllByText(entry.flow.primaryAction?.label ?? "Complete").length).toBeGreaterThan(0)
  })

  it("renders all seventeen together as one list", () => {
    render(<CaseQueue entries={queueEntries} />)
    expect(screen.getAllByRole("listitem")).toHaveLength(17)
    expect(screen.getAllByRole("article")).toHaveLength(17)
  })

  it("keeps the order it was given, and does not re-rank by urgency", () => {
    render(<CaseQueue entries={queueEntries} />)
    const headings = screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)
    expect(headings).toEqual(queueEntries.map(entry => entry.row.reference))
  })
})

describe("the shape of the list", () => {
  it("is a real list of articles, each labelled by its own reference", () => {
    render(<CaseQueue entries={queueEntries.slice(0, 3)} />)
    const list = screen.getByRole("list")
    expect(list.tagName).toBe("UL")
    for (const node of within(list).getAllByRole("listitem")) {
      expect(node.firstElementChild?.tagName).toBe("ARTICLE")
    }
  })

  it("gives each case exactly one link, and makes nothing else clickable", () => {
    render(<CaseQueue entries={queueEntries} />)
    expect(screen.getAllByRole("link")).toHaveLength(17)
    for (const article of screen.getAllByRole("article")) {
      expect(within(article).getAllByRole("link")).toHaveLength(1)
      expect(within(article).queryAllByRole("button")).toHaveLength(0)
      expect(article.querySelectorAll("[onclick]")).toHaveLength(0)
    }
  })

  it("puts no heading above level two in the list, so the page keeps one h1", () => {
    render(<CaseQueue entries={queueEntries} />)
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(17)
  })

  it("renders an empty list rather than inventing an empty state of its own", () => {
    render(<CaseQueue entries={[]} />)
    expect(within(screen.getByRole("list")).queryAllByRole("listitem")).toHaveLength(0)
  })
})

describe("the pieces on their own", () => {
  it("renders the status cluster without the rest of the row", () => {
    const { flow } = queueScenarios.managedWaitingForAgreement
    render(<CaseQueueStatus flow={flow} priority="HIGH" />)
    expect(screen.getByText(flow.phaseLabel)).toBeInTheDocument()
    expect(screen.getByText("High priority")).toBeInTheDocument()
  })

  it("falls back to a plain word for a priority the catalogue does not know", () => {
    render(<CaseQueueStatus flow={queueScenarios.newCaseToTriage.flow} priority="CRITICAL" />)
    expect(screen.getByText("CRITICAL priority")).toBeInTheDocument()
  })

  it("renders the action on its own, in each of the four states", () => {
    const states = new Map(queueEntries
      .filter(entry => entry.flow.primaryAction)
      .map(entry => [entry.flow.primaryAction!.state, entry.flow]))
    expect([...states.keys()].sort()).toEqual(["ACTION_REQUIRED", "BLOCKED", "READY", "WAITING"])

    for (const [state, flow] of states) {
      cleanup()
      render(<CaseQueueAction flow={flow} />)
      expect(screen.getByText(flow.primaryAction!.label), state).toBeInTheDocument()
    }
  })

  it("says an unrecorded outcome plainly rather than leaving the row blank", () => {
    const flow = { ...queueScenarios.closedSuccessfully.flow, outcome: null }
    render(<CaseQueueAction flow={flow} />)
    expect(screen.getByText("Outcome not recorded")).toBeInTheDocument()
  })
})
