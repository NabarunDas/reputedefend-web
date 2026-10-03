// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../layout"
import { CasesUnavailable, CasesView } from "./cases-view"
import type { CustomerCasePage, CustomerCaseRow } from "@/lib/portal/cases/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/cases" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))

const submittedAt = "2026-10-08T12:00:00.000Z"

function row(overrides: Partial<CustomerCaseRow> = {}): CustomerCaseRow {
  return {
    reference: "PR-26-ABCDEF",
    caseType: "PROFILE_RECOVERY",
    serviceTrack: "GUIDED",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    status: "RECEIVED",
    workStage: "INITIAL_REVIEW",
    submittedAt,
    closedAt: null,
    attentionItems: [{ code: "EVIDENCE_REQUIRED", dueAt: "2026-10-08T12:00:00.000Z" }],
    ...overrides,
  }
}

function page(cases: CustomerCaseRow[], next: CustomerCasePage["nextCursor"] = null): CustomerCasePage {
  return { cases, nextCursor: next }
}

afterEach(() => {
  cleanup()
  nav.pathname = "/portal/cases"
})

describe("cases page", () => {
  it("renders the heading, the active filter, and a case card without raw fields", () => {
    render(<PortalLayout><CasesView view="active" page={page([row()])} /></PortalLayout>)
    expect(screen.getByRole("heading", { level: 1, name: "Cases" })).toBeTruthy()
    expect(screen.getByText("See your active and previous ProfileRelaunch cases.")).toBeTruthy()
    const filters = screen.getByRole("navigation", { name: "Case filters" })
    expect(filters.querySelector("[aria-current='page']")).toHaveTextContent("Active")
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/portal/cases?view=previous")
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/portal/cases?view=all")
    expect(screen.getByText("PR-26-ABCDEF")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Profile Recovery" })).toBeTruthy()
    expect(screen.getByText("Harbour Bakery")).toBeTruthy()
    expect(screen.getByText("High Street")).toBeTruthy()
    expect(screen.getByText("Action needed")).toBeTruthy()
    expect(screen.getByText("Guided service")).toBeTruthy()
    expect(screen.getByText("Started 8 October 2026")).toBeTruthy()
    expect(screen.getByText("Upload evidence")).toBeTruthy()
    expect(screen.getByText("Use the secure case link in the ProfileRelaunch email to provide the requested evidence.")).toBeTruthy()
    const card = screen.getByText("PR-26-ABCDEF").closest("article")
    expect(card?.querySelector("a")).toBeNull()
    expect(document.body.textContent).not.toMatch(/INITIAL_REVIEW|RECEIVED|EVIDENCE_REQUIRED|PROFILE_RECOVERY|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|The profile was suspended/)
    const portalNav = screen.getByRole("navigation", { name: "Customer portal" })
    expect(portalNav.querySelector("[aria-current='page']")).toHaveTextContent("Cases")
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current")
  })

  it("marks Previous and All and uses the public reference in the next-page link", () => {
    const { rerender } = render(<CasesView view="previous" page={page([])} />)
    expect(screen.getByRole("navigation", { name: "Case filters" }).querySelector("[aria-current='page']")).toHaveTextContent("Previous")
    expect(screen.getByText("You don't have any previous cases.")).toBeTruthy()
    rerender(<CasesView view="all" page={page([row({ attentionItems: [] })], { submittedAt, reference: "PR-26-ABCDEF" })} />)
    expect(screen.getByRole("navigation", { name: "Case filters" }).querySelector("[aria-current='page']")).toHaveTextContent("All")
    const next = screen.getByRole("link", { name: "Next page" })
    expect(next.getAttribute("href")).toBe(`/portal/cases?view=all&before=${encodeURIComponent(submittedAt)}&ref=PR-26-ABCDEF`)
    expect(next.getAttribute("href")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
  })

  it("uses the empty copy for each filter and a distinct failure", () => {
    const { rerender } = render(<CasesView view="active" page={page([])} />)
    expect(screen.getByText("You don't have any active cases.")).toBeTruthy()
    rerender(<CasesView view="all" page={page([])} />)
    expect(screen.getByText("No ProfileRelaunch cases are available.")).toBeTruthy()
    expect(screen.queryByRole("link", { name: /get help|start a case/i })).toBeNull()
    rerender(<CasesUnavailable />)
    expect(screen.getByRole("heading", { name: "We couldn't load your cases" })).toBeTruthy()
    expect(screen.getByText("Refresh the page and try again. If the problem continues, contact ProfileRelaunch.")).toBeTruthy()
    expect(screen.queryByText("You don't have any active cases.")).toBeNull()
    expect(screen.queryByText("No ProfileRelaunch cases are available.")).toBeNull()
  })

  it("keeps Cases current on a future case descendant and Dashboard only on the exact dashboard path", () => {
    nav.pathname = "/portal/cases/later"
    render(<PortalLayout><CasesView view="active" page={page([])} /></PortalLayout>)
    expect(screen.getByRole("navigation", { name: "Customer portal" }).querySelector("[aria-current='page']")).toHaveTextContent("Cases")
  })
})
