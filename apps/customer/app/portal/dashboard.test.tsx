// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import { PortalHome, PortalUnavailable } from "./portal-home"
import type { CustomerCaseRow, CustomerDashboard } from "@/lib/portal/cases/parse"

const submittedAt = "2026-10-08T12:00:00.000Z"

function row(overrides: Partial<CustomerCaseRow> = {}): CustomerCaseRow {
  return {
    reference: "PR-26-ABCDEF",
    caseType: "PROFILE_RECOVERY",
    serviceTrack: "GUIDED",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    status: "UNDER_REVIEW",
    workStage: "EVIDENCE_COLLECTION",
    submittedAt,
    closedAt: null,
    attentionItems: [{ code: "QUOTE_ACCEPTANCE", expiresAt: "2026-10-20T12:00:00.000Z" }],
    ...overrides,
  }
}

function dashboard(overrides: Partial<CustomerDashboard> = {}): CustomerDashboard {
  return {
    summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
    attentionCases: [],
    recentCases: [],
    ...overrides,
  }
}

afterEach(cleanup)

describe("customer dashboard", () => {
  it("shows the no-case copy and only the three summary terms", () => {
    render(<PortalHome dashboard={dashboard()} />)
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to My ProfileRelaunch" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "No active cases" })).toBeTruthy()
    expect(screen.getByText("When you start a ProfileRelaunch case, it will appear here.")).toBeTruthy()
    const terms = screen.getAllByRole("term").map(item => item.textContent)
    expect(terms).toEqual(["Active cases", "Needs your attention", "Previous cases"])
    expect(screen.getAllByRole("definition").map(item => item.textContent)).toEqual(["0", "0", "0"])
    expect(screen.queryByRole("link", { name: "View all cases" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/revenue|success rate|document|payment|Guard|message/i)
  })

  it("stays calm when active cases have no usable obligation", () => {
    const active = row({ attentionItems: [], serviceTrack: "UNDECIDED", locationName: null })
    render(<PortalHome dashboard={dashboard({
      summary: { activeCases: 2, attentionCases: 0, previousCases: 0 },
      recentCases: [active, { ...active, reference: "RV-26-ABCDEF", caseType: "REVIEW_PROTECTION" }],
    })} />)
    expect(screen.getByRole("heading", { name: "Nothing needed from you right now" })).toBeTruthy()
    expect(screen.getByText("We're working on your active cases. We'll let you know when you need to do something.")).toBeTruthy()
    expect(screen.queryByText("Undecided")).toBeNull()
    expect(screen.queryByText("everything is on track")).toBeNull()
  })

  it("describes one attention case without a fake action", () => {
    const item = row()
    render(<PortalHome dashboard={dashboard({
      summary: { activeCases: 1, attentionCases: 1, previousCases: 0 },
      attentionCases: [item],
      recentCases: [item],
    })} />)
    expect(screen.getByRole("heading", { name: "Your attention is needed" })).toBeTruthy()
    expect(screen.getByText("One of your cases has a step for you.")).toBeTruthy()
    expect(screen.getAllByText("PR-26-ABCDEF").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Harbour Bakery").length).toBeGreaterThan(0)
    expect(screen.getAllByText("High Street").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Profile Recovery").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Action needed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Review your quote").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Secure link expires 20 October 2026").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Use the secure link in the ProfileRelaunch email for this step.").length).toBeGreaterThan(0)
    const viewCase = screen.getAllByRole("link", { name: "View case PR-26-ABCDEF" })
    expect(viewCase.length).toBeGreaterThan(0)
    expect(viewCase[0]).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF")
    expect(viewCase[0].textContent).toMatch(/View case/)
    expect(screen.queryByRole("button")).toBeNull()
    expect(document.body.textContent).not.toMatch(/QUOTE_ACCEPTANCE|UNDER_REVIEW|EVIDENCE_COLLECTION|issue description/)
  })

  it("pluralises several attention cases and links to the active list when more exist", () => {
    const items = ["PR-26-AAAAA2", "PR-26-AAAAA3", "PR-26-AAAAA4", "PR-26-AAAAA5", "PR-26-AAAAA6"].map(reference => row({ reference, attentionItems: [] }))
    items[0].attentionItems = [{ code: "EVIDENCE_REQUIRED", dueAt: "2026-10-08T12:00:00.000Z" }]
    render(<PortalHome dashboard={dashboard({
      summary: { activeCases: 6, attentionCases: 6, previousCases: 1 },
      attentionCases: items,
      recentCases: items.slice(0, 3),
    })} />)
    expect(screen.getByText("Some of your cases have steps for you.")).toBeTruthy()
    expect(screen.getAllByText("Upload evidence").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Requested by 8 October 2026").length).toBeGreaterThan(0)
    expect(screen.getByRole("link", { name: "View all active cases" })).toHaveAttribute("href", "/portal/cases?view=active")
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0)
    const recent = screen.getByRole("heading", { name: "Your cases" }).parentElement
    expect(recent?.querySelectorAll("article")).toHaveLength(3)
    expect(screen.getByRole("link", { name: "View all cases" })).toHaveAttribute("href", "/portal/cases?view=all")
    const cardLinks = [...(recent?.querySelectorAll(".case-list a") ?? [])]
    expect(cardLinks.map(link => link.getAttribute("href"))).toEqual([
      "/portal/cases/PR-26-AAAAA2",
      "/portal/cases/PR-26-AAAAA3",
      "/portal/cases/PR-26-AAAAA4",
    ])
    expect(cardLinks.every(link => !link.getAttribute("href")?.match(/[0-9a-f]{8}-[0-9a-f]{4}/))).toBe(true)
  })

  it("keeps previous cases visible when nothing is active", () => {
    const previous = row({
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt: "2026-10-09T12:00:00.000Z",
      attentionItems: [],
      serviceTrack: "MANAGED",
    })
    render(<PortalHome dashboard={dashboard({
      summary: { activeCases: 0, attentionCases: 0, previousCases: 1 },
      recentCases: [previous],
    })} />)
    expect(screen.getByRole("heading", { name: "No active cases" })).toBeTruthy()
    expect(screen.getByText("Your previous ProfileRelaunch cases are still available below.")).toBeTruthy()
    expect(screen.getByText("Complete")).toBeTruthy()
    expect(screen.getByText("Managed service")).toBeTruthy()
    expect(screen.getByRole("link", { name: "View all cases" })).toHaveAttribute("href", "/portal/cases?view=all")
  })

  it("shows a load failure instead of an empty workspace", () => {
    render(<PortalUnavailable />)
    expect(screen.getByRole("heading", { level: 1, name: "We couldn't load your customer space" })).toBeTruthy()
    expect(screen.getByText("Refresh the page and try again. If the problem continues, contact ProfileRelaunch.")).toBeTruthy()
    expect(screen.queryByText("When you start a ProfileRelaunch case, it will appear here.")).toBeNull()
    expect(screen.queryByText("customer_portal_dashboard_v1")).toBeNull()
  })
})
