// @vitest-environment jsdom
/**
 * Today, as an operator opens it.
 *
 * The thing worth guarding at this level is what the page leads with. A
 * dashboard that renders is not the same as a workbench that answers "what
 * do I do now", so these tests read the page the way somebody arriving at it
 * would: what is the first work on it, is anything mistaken for a task, and
 * does it say what it cannot do.
 *
 * The read pattern is guarded here too, because it is the reason the page is
 * affordable: one dashboard call, one list read per fifty open cases and one
 * projection per fifty, resolved against a single instant. A regression to a
 * read per case would still render correctly and would still be wrong.
 */

import React from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const listCases = vi.fn()
const loadCaseFlows = vi.fn()
const loadDashboard = vi.fn()

vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/cases/queries", () => ({ listCases: (...args: unknown[]) => listCases(...args) }))
vi.mock("@/lib/reports/queries", () => ({ loadDashboard: (...args: unknown[]) => loadDashboard(...args) }))
vi.mock("@/lib/case-flow/load", async () => ({
  ...await vi.importActual<typeof import("@/lib/case-flow/projection")>("@/lib/case-flow/projection"),
  loadCaseFlows: (...args: unknown[]) => loadCaseFlows(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import AdminHome from "./page"
import { requireStaff } from "@/lib/require-staff"
import { busyAttention, dashboard, guardWindows, todayScenarios, upcomingDeadlines, type TodayEntry } from "./today/fixtures"
import { TODAY_CASE_SCAN_LIMIT } from "@/lib/today/scan"
import type { CaseRow } from "@/lib/cases/model"

afterEach(() => cleanup())
beforeEach(() => {
  listCases.mockReset().mockResolvedValue([])
  loadCaseFlows.mockReset().mockResolvedValue(new Map())
  loadDashboard.mockReset().mockResolvedValue(dashboard())
})

/** Serve these cases through the real cursor pagination the loader walks. */
function serve(entries: readonly TodayEntry[]) {
  const rows = entries.map(item => item.row)
  listCases.mockImplementation(async (filters: { time: string | null; before: string | null }) => {
    const start = filters.before ? rows.findIndex(row => row.id === filters.before) + 1 : 0
    return rows.slice(start, start + 51)
  })
  loadCaseFlows.mockImplementation(async (ids: string[]) =>
    new Map(ids.map(id => [id, entries.find(item => item.row.id === id)!.flow])))
}

const show = async () => render(await AdminHome())

const panel = (name: string | RegExp) =>
  screen.getByRole("heading", { name }).closest("section") as HTMLElement

describe("what the page reads", () => {
  it("requires a signed-in member of staff", async () => {
    await show()
    expect(requireStaff).toHaveBeenCalled()
  })

  it("asks the dashboard for the current day and nothing else", async () => {
    await show()
    expect(loadDashboard).toHaveBeenCalledTimes(1)
    expect(loadDashboard).toHaveBeenCalledWith("today", null, null)
  })

  it("asks the case list only for open cases", async () => {
    await show()
    expect(listCases).toHaveBeenCalledWith({ q: "", filter: "open", time: null, before: null })
  })

  it("costs one list read and one projection per fifty cases, never one per case", async () => {
    serve(Array.from({ length: 137 }, (_, index) => entryAt(index)))
    await show()
    expect(listCases).toHaveBeenCalledTimes(3)
    expect(loadCaseFlows).toHaveBeenCalledTimes(3)
    expect(loadCaseFlows.mock.calls.map(call => call[0].length)).toEqual([50, 50, 37])
  })

  it("resolves every batch against one instant, so overdue means the same thing on every row", async () => {
    serve(Array.from({ length: 120 }, (_, index) => entryAt(index)))
    await show()
    const instants = loadCaseFlows.mock.calls.map(call => (call[1] as Date).toISOString())
    expect(new Set(instants).size).toBe(1)
  })

  it("does not project anything when no case is open", async () => {
    await show()
    expect(loadCaseFlows).not.toHaveBeenCalled()
  })
})

describe("the first thing on the page", () => {
  it("is the day, under one heading", async () => {
    await show()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
  })

  it("is not a wall of metric cards", async () => {
    serve([todayScenarios.adminApprovePack])
    await show()
    const headings = screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)
    expect(headings[0]).toBe("Do next")
    // Management figures are present, but behind a disclosure and last.
    expect(headings.at(-1)).toBe("Management snapshot")
  })

  it("offers no period control, so a date range cannot change operational work", async () => {
    await show()
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("To")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument()
  })

  it("summarises the day in real counts", async () => {
    serve([
      todayScenarios.adminApprovePack,
      todayScenarios.blockedCommercialUnknown,
      todayScenarios.waitingOnGoogle,
      todayScenarios.waitingOnCustomer,
    ])
    loadDashboard.mockResolvedValue(dashboard({ needsAttention: busyAttention }))
    await show()
    const summary = screen.getByText(/needs you/)
    expect(summary).toHaveTextContent("1 case needs you")
    expect(summary).toHaveTextContent("1 is blocked")
    expect(summary).toHaveTextContent("2 are waiting externally")
    expect(summary).toHaveTextContent("5 other operational queues need attention")
  })
})

describe("a busy working day", () => {
  beforeEach(() => serve([
    todayScenarios.progressionCloseCase,
    todayScenarios.adminApprovePack,
    todayScenarios.safetyEvidenceThreat,
    todayScenarios.waitingOnCustomer,
    todayScenarios.blockedCommercialUnknown,
  ]))

  it("leads with the safety case, then the admin work, then the progression step", async () => {
    await show()
    const work = within(panel("Do next")).getAllByRole("heading", { level: 3 }).map(node => node.textContent)
    expect(work).toEqual([
      "Deal with a blocked evidence file",
      "Approve the evidence pack",
      "Close the case",
    ])
  })

  it("links each piece of work to the place that performs it", async () => {
    await show()
    const first = within(panel("Do next")).getAllByRole("listitem")[0]
    expect(within(first).getByRole("link", { name: "Deal with a blocked evidence file" }))
      .toHaveAttribute("href", `/cases/${todayScenarios.safetyEvidenceThreat.row.id}/evidence`)
  })

  it("gives each case one secondary link to the case itself", async () => {
    await show()
    const first = within(panel("Do next")).getAllByRole("listitem")[0]
    expect(within(first).getByRole("link", { name: "PR-2001" }))
      .toHaveAttribute("href", `/cases/${todayScenarios.safetyEvidenceThreat.row.id}`)
    expect(within(first).getAllByRole("link")).toHaveLength(2)
  })

  it("shows the blocked case apart from the work, and not as something to complete", async () => {
    await show()
    const blocked = panel(/Blocked/)
    expect(within(blocked).getByText("PR-2016")).toBeInTheDocument()
    expect(within(panel("Do next")).queryByText("PR-2016")).not.toBeInTheDocument()
    // Only the case link; the blocked action is not offered as a button.
    expect(within(blocked).getAllByRole("link")).toHaveLength(2)
  })

  it("shows the first ten pieces of work and says how many were left off", async () => {
    cleanup()
    serve(Array.from({ length: 18 }, (_, index) => entryAt(index)))
    await show()
    expect(within(panel("Do next")).getAllByRole("listitem")).toHaveLength(10)
    expect(within(panel("Do next")).getByText(/10 of 18 shown/)).toBeInTheDocument()
  })

  it("shows each case exactly once on the whole page", async () => {
    await show()
    for (const reference of ["PR-2001", "PR-2004", "PR-2009", "PR-2010", "PR-2016"]) {
      expect(screen.getAllByText(reference)).toHaveLength(1)
    }
  })
})

describe("a day of waiting", () => {
  beforeEach(() => serve([
    todayScenarios.waitingOnCustomer,
    todayScenarios.waitingOnGoogle,
    todayScenarios.waitingOnScan,
  ]))

  it("groups waiting cases by who the next move belongs to", async () => {
    await show()
    const waiting = panel("Waiting")
    expect(within(waiting).getAllByRole("heading", { level: 3 }).map(node => node.textContent?.trim()))
      .toEqual(["Waiting on customers 1", "Waiting on Google 1", "Waiting on systems 1"])
  })

  it("says nothing here needs ProfileRelaunch, and offers no chasing", async () => {
    await show()
    const waiting = panel("Waiting")
    expect(within(waiting).getByText("Nothing here needs ProfileRelaunch yet.")).toBeInTheDocument()
    expect(waiting.textContent).not.toMatch(/chase|Chase|overdue by|days waiting/)
  })

  it("leaves Do next empty rather than filling it with other people's work", async () => {
    await show()
    expect(within(panel("Do next")).getByText("No open case is waiting on ProfileRelaunch."))
      .toBeInTheDocument()
  })

  it("says a recorded date has passed, and says it in words", async () => {
    cleanup()
    serve([todayScenarios.waitingOnCustomerOverdue])
    await show()
    expect(screen.getByText(/Overdue since/)).toBeInTheDocument()
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0)
  })

  it("shows no date at all on a case that records none", async () => {
    await show()
    expect(panel("Waiting").textContent).not.toMatch(/Due |Overdue/)
  })
})

describe("operational exceptions", () => {
  it("lists only the queues that have something in them", async () => {
    loadDashboard.mockResolvedValue(dashboard({ needsAttention: busyAttention }))
    await show()
    const queues = panel("Other operational work")
    expect(within(queues).getAllByRole("listitem")).toHaveLength(5)
    expect(within(queues).getAllByRole("heading", { level: 3 }).map(node => node.textContent))
      .toEqual(["Intake", "Guard exceptions", "Contact", "Money", "Platform"])
  })

  it("sends each one to the report that holds the records", async () => {
    loadDashboard.mockResolvedValue(dashboard({ needsAttention: busyAttention }))
    await show()
    const queues = panel("Other operational work")
    expect(within(queues).getByRole("link", { name: /Payment exceptions/ }))
      .toHaveAttribute("href", expect.stringContaining("/reports/payment_exceptions"))
  })

  it("says so in one line when there is nothing, rather than eleven zeroes", async () => {
    serve([todayScenarios.adminApprovePack])
    await show()
    const queues = panel("Other operational work")
    expect(within(queues).getByText("No other operational exceptions need attention.")).toBeInTheDocument()
    expect(within(queues).queryAllByRole("listitem")).toHaveLength(0)
  })
})

describe("Guard", () => {
  it("says when no monitoring schedule is configured", async () => {
    serve([todayScenarios.adminApprovePack])
    await show()
    expect(within(panel(/Guard checks/)).getByText("Monitoring schedule not configured.")).toBeInTheDocument()
  })

  it("names today's windows and their state, and links to the existing check", async () => {
    serve([todayScenarios.adminApprovePack])
    loadDashboard.mockResolvedValue(dashboard({
      monitoringScheduleConfigured: true,
      secondary: { todayWindows: guardWindows },
    }))
    await show()
    const guard = panel(/Guard checks/)
    expect(within(guard).getByRole("link", { name: "Morning check" }))
      .toHaveAttribute("href", `/guard/checks/${guardWindows[0].id}`)
    expect(guard).toHaveTextContent("Done")
    expect(guard).toHaveTextContent("Not started")
  })

  it("keeps Guard obligations apart from Guard exceptions", async () => {
    serve([todayScenarios.adminApprovePack])
    loadDashboard.mockResolvedValue(dashboard({
      needsAttention: busyAttention,
      monitoringScheduleConfigured: true,
      secondary: { todayWindows: guardWindows },
    }))
    await show()
    expect(panel(/Guard checks/).textContent).not.toContain("Failed or missed Guard checks")
    expect(within(panel("Other operational work")).getByText("Failed or missed Guard checks")).toBeInTheDocument()
  })
})

describe("the platform", () => {
  it("mentions a healthy worker quietly, without a warning", async () => {
    serve([todayScenarios.adminApprovePack])
    await show()
    expect(screen.getByText(/Background processing healthy/)).toBeInTheDocument()
    expect(document.querySelector(".notice-danger")).toBeNull()
  })

  it("warns prominently when the existing late threshold has been passed", async () => {
    serve([todayScenarios.adminApprovePack])
    loadDashboard.mockResolvedValue(dashboard({
      freshness: { status: "LATE", lastStartedAt: "2026-05-28T09:00:00.000Z", lateAfterSeconds: 93600 },
    }))
    await show()
    const warning = screen.getByText(/Background processing is late/)
    expect(warning).toHaveClass("notice-danger")
    expect(warning).toHaveTextContent("Step 10 late threshold")
  })

  it("admits when it does not know", async () => {
    loadDashboard.mockResolvedValue(dashboard({ freshness: {} }))
    await show()
    expect(screen.getByText(/status is unknown/)).toBeInTheDocument()
  })
})

describe("what is coming up, and how the business is doing", () => {
  it("lists real recorded deadlines after the current work", async () => {
    serve([todayScenarios.adminApprovePack])
    loadDashboard.mockResolvedValue(dashboard({ secondary: { upcomingDeadlines } }))
    await show()
    const coming = panel("Coming up")
    expect(within(coming).getByRole("link", { name: /PR-2099/ }))
      .toHaveAttribute("href", `/cases/${upcomingDeadlines[0].caseId}`)
    const headings = screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)
    expect(headings.indexOf("Coming up")).toBeGreaterThan(headings.indexOf("Do next"))
  })

  it("keeps management figures last, collapsed, and in their own currencies", async () => {
    serve([todayScenarios.adminApprovePack])
    await show()
    const management = panel("Management snapshot")
    expect(management.querySelector("details")).not.toHaveAttribute("open")
    expect(within(management).getByText("1,250.00 GBP · 300.00 USD")).toBeInTheDocument()
    expect(within(management).getByText("Active Guard (paid)")).toBeInTheDocument()
    expect(within(management).getByText("Active Guard (included)")).toBeInTheDocument()
    expect(within(management).getByRole("link", { name: "Open reports" })).toHaveAttribute("href", "/reports")
  })
})

describe("a quiet day", () => {
  it("says so once instead of rendering six empty panels", async () => {
    await show()
    expect(screen.getByRole("heading", { level: 2, name: "Nothing needs attention" })).toBeInTheDocument()
    const headings = screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent)
    expect(headings).toEqual(["Nothing needs attention", "Coming up", "Management snapshot"])
  })

  it("still names the missing monitoring schedule, which is not the same as no checks", async () => {
    await show()
    expect(screen.getByText("Monitoring schedule not configured.")).toBeInTheDocument()
  })
})

describe("more open cases than the page can read", () => {
  beforeEach(() => serve(Array.from({ length: TODAY_CASE_SCAN_LIMIT + 1 }, (_, index) => entryAt(index))))

  it("refuses to show an ordering it cannot stand behind", async () => {
    await show()
    expect(screen.queryByRole("heading", { name: "Do next" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Case work cannot be prioritised today" })).toBeInTheDocument()
    expect(screen.getByText(/cannot say which of them matters most/)).toBeInTheDocument()
  })

  it("sends the operator to the queue that can answer", async () => {
    await show()
    expect(screen.getAllByRole("link", { name: "View all cases" })[0]).toHaveAttribute("href", "/cases")
  })

  it("does not claim a count of work it did not finish counting", async () => {
    await show()
    expect(screen.getAllByText(/Case work cannot be prioritised today/).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/\d+ cases? needs? you/)
  })

  it("still answers for the work that is not case work", async () => {
    loadDashboard.mockResolvedValue(dashboard({ needsAttention: busyAttention }))
    await show()
    expect(screen.getByRole("heading", { name: "Other operational work" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Management snapshot" })).toBeInTheDocument()
  })
})

describe("what the page never does", () => {
  it("leaks no operator email or analytics", async () => {
    serve([todayScenarios.adminApprovePack])
    await show()
    expect(document.body.textContent).not.toContain("admin@profilerelaunch.com")
    expect(document.body.textContent).not.toMatch(/googletagmanager|google-analytics|gtag\(/)
  })

  it("builds no clickable cards out of plain elements", async () => {
    serve([todayScenarios.adminApprovePack, todayScenarios.waitingOnGoogle])
    await show()
    expect(document.querySelectorAll("[onclick]")).toHaveLength(0)
    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent?.trim()).not.toBe("")
      expect(link.querySelector("a, button")).toBeNull()
    }
  })

  it("shows a completed case nowhere", async () => {
    serve([todayScenarios.adminApprovePack, todayScenarios.closedCase])
    await show()
    expect(screen.queryByText("PR-2017")).not.toBeInTheDocument()
  })
})

/** A distinct open case for the volume tests, reusing one resolved flow. */
function entryAt(index: number): TodayEntry {
  const source = todayScenarios.adminApprovePack
  return {
    row: {
      ...source.row,
      id: `${(index + 1).toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`,
      reference: `PR-${4000 + index}`,
      createdAt: new Date(Date.UTC(2026, 5, 1, 12) - index * 60_000).toISOString(),
    } as CaseRow,
    flow: source.flow,
  }
}
