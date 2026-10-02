// @vitest-environment jsdom
/**
 * The Cases page as a whole.
 *
 * The thing worth guarding at this level is the read pattern. The queue is
 * only affordable because the page costs one case-list read plus one batch
 * projection for the identifiers on the page, so these tests count the calls
 * and check what was asked for, as well as checking that filtering, paging
 * and the empty state survived the redesign.
 */

import React from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const listCases = vi.fn()
const loadCaseFlows = vi.fn()
const notFoundError = new Error("NEXT_NOT_FOUND")

vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/cases/queries", () => ({ listCases: (...args: unknown[]) => listCases(...args) }))
vi.mock("@/lib/case-flow/load", async () => ({
  ...await vi.importActual<typeof import("@/lib/case-flow/projection")>("@/lib/case-flow/projection"),
  loadCaseFlows: (...args: unknown[]) => loadCaseFlows(...args),
}))
vi.mock("next/navigation", () => ({ notFound: () => { throw notFoundError } }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import Cases from "./page"
import { queueEntries } from "./queue-fixtures"

const rows = queueEntries.map(entry => entry.row)
const flows = new Map(queueEntries.map(entry => [entry.row.id, entry.flow]))

afterEach(() => cleanup())
beforeEach(() => {
  listCases.mockReset().mockResolvedValue(rows)
  loadCaseFlows.mockReset().mockResolvedValue(flows)
})

const show = async (params: Record<string, string> = {}) =>
  render(await Cases({ searchParams: Promise.resolve(params) }))

describe("what the page reads", () => {
  it("costs one case list read and one batch projection", async () => {
    await show()
    expect(listCases).toHaveBeenCalledTimes(1)
    expect(loadCaseFlows).toHaveBeenCalledTimes(1)
  })

  it("asks for flows for the rows on this page and no others", async () => {
    await show()
    expect(loadCaseFlows).toHaveBeenCalledWith(rows.map(row => row.id))
  })

  it("never asks for more than a page of flows, however many rows come back", async () => {
    const page = Array.from({ length: 60 }, (_, index) => ({ ...rows[index % rows.length], id: `${index}` }))
    listCases.mockResolvedValue(page)
    loadCaseFlows.mockResolvedValue(new Map(page.slice(0, 50).map((row, index) =>
      [row.id, queueEntries[index % queueEntries.length].flow])))

    await show()
    expect(loadCaseFlows.mock.calls[0][0]).toHaveLength(50)
  })

  it("does not call the projection at all when nothing matched", async () => {
    listCases.mockResolvedValue([])
    await show()
    expect(loadCaseFlows).not.toHaveBeenCalled()
    expect(screen.getByText("No cases match these filters.")).toBeInTheDocument()
  })

  it("fails rather than falling back to the stage and the recorded note", async () => {
    // One row with no flow: the page must stop, not render a degraded queue.
    loadCaseFlows.mockResolvedValue(new Map([...flows].slice(1)))
    await expect(show()).rejects.toThrow(/no result for/)
  })

  it("pairs rows to flows by identifier, not by the order they came back in", async () => {
    loadCaseFlows.mockResolvedValue(new Map([...flows].reverse()))
    await show()
    expect(screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent))
      .toEqual(rows.map(row => row.reference))
  })
})

describe("what the page shows", () => {
  it("has one heading above the queue", async () => {
    await show()
    expect(screen.getByRole("heading", { level: 1, name: "Cases" })).toBeInTheDocument()
  })

  it("renders one list entry per case, in the order the list gave them", async () => {
    await show()
    const list = screen.getByRole("list")
    expect(within(list).getAllByRole("listitem")).toHaveLength(rows.length)
    expect(screen.getByText(`${rows.length} cases on this page.`)).toBeInTheDocument()
  })

  it("keeps every existing filter, and the search box", async () => {
    await show({ q: "mercer", filter: "overdue" })
    const search = screen.getByLabelText("Search reference, client or business")
    expect(search).toHaveValue("mercer")
    expect(search).toHaveAttribute("maxlength", "100")

    const select = screen.getByLabelText("Show")
    expect(select).toHaveValue("overdue")
    expect([...select.querySelectorAll("option")].map(option => option.textContent)).toEqual([
      "Open cases", "All cases", "Closed and cancelled", "Unassigned", "Overdue", "Guided", "Managed",
    ])
  })

  it("passes the filters it was given to the case list unchanged", async () => {
    await show({ q: " mercer ", filter: "GUIDED" })
    expect(listCases).toHaveBeenCalledWith({ q: "mercer", filter: "GUIDED", time: null, before: null })
  })

  it("refuses a filter the model does not recognise", async () => {
    await expect(show({ filter: "urgent" })).rejects.toBe(notFoundError)
    expect(listCases).not.toHaveBeenCalled()
  })

  it("keeps cursor pagination, carrying the filters into the next page", async () => {
    const page = Array.from({ length: 51 }, (_, index) => ({ ...rows[index % rows.length], id: `${index}` }))
    listCases.mockResolvedValue(page)
    loadCaseFlows.mockResolvedValue(new Map(page.slice(0, 50).map((row, index) =>
      [row.id, queueEntries[index % queueEntries.length].flow])))

    await show({ q: "mercer", filter: "open" })
    const next = screen.getByRole("link", { name: "Next page" })
    const query = new URLSearchParams(next.getAttribute("href")!.split("?")[1])
    expect(query.get("q")).toBe("mercer")
    expect(query.get("filter")).toBe("open")
    expect(query.get("before")).toBe(page[49].id)
  })

  it("offers no next page when the page is not full", async () => {
    await show()
    expect(screen.queryByRole("link", { name: "Next page" })).not.toBeInTheDocument()
  })
})
