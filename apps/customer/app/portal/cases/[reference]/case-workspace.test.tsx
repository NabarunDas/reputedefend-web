// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../../layout"
import { CaseUnavailable, CaseWorkspace } from "./case-workspace"
import type { CustomerCaseDetail } from "@/lib/portal/cases/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/cases/PR-26-ABCDEF" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))

const submittedAt = "2026-10-03T09:00:00.000Z"
const closedAt = "2026-10-08T09:00:00.000Z"

function detail(overrides: Partial<CustomerCaseDetail["case"]> = {}, extra: Partial<CustomerCaseDetail> = {}): CustomerCaseDetail {
  return {
    found: true,
    case: {
      reference: "PR-26-ABCDEF",
      caseType: "PROFILE_RECOVERY",
      serviceTrack: "GUIDED",
      businessName: "Harbour Bakery",
      locationName: "High Street",
      status: "AWAITING_CUSTOMER",
      workStage: "EVIDENCE_COLLECTION",
      submittedAt,
      closedAt: null,
      attentionItems: [
        { code: "EVIDENCE_REQUIRED", dueAt: "2026-10-08T12:00:00.000Z" },
        { code: "QUOTE_ACCEPTANCE", expiresAt: "2026-10-20T12:00:00.000Z" },
      ],
      outcomeCode: null,
      ...overrides,
    },
    timeline: [
      { code: "EVIDENCE_SUBMITTED", occurredAt: "2026-10-04T12:00:00.000Z" },
      { code: "CASE_RECEIVED", occurredAt: submittedAt },
    ],
    timelineTruncated: false,
    ...extra,
  }
}

afterEach(() => {
  cleanup()
  nav.pathname = "/portal/cases/PR-26-ABCDEF"
})

function renderWorkspace(value: CustomerCaseDetail = detail()) {
  return render(<PortalLayout><CaseWorkspace detail={value} /></PortalLayout>)
}

describe("customer case workspace", () => {
  it("shows the case, the next step, progress, updates and details", () => {
    renderWorkspace()
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(breadcrumb.querySelector("a")).toHaveAttribute("href", "/portal/cases")
    expect(breadcrumb).toHaveTextContent("Cases")
    expect(breadcrumb).toHaveTextContent("PR-26-ABCDEF")
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Profile Recovery" })).toBeTruthy()
    expect(screen.getAllByText("PR-26-ABCDEF").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Harbour Bakery").length).toBeGreaterThan(0)
    expect(screen.getAllByText("High Street").length).toBeGreaterThan(0)
    expect(screen.getByText("Action needed")).toBeTruthy()
    expect(screen.getAllByText("Guided service").length).toBeGreaterThan(0)
    expect(screen.getByText("Started 3 October 2026")).toBeTruthy()
    expect(screen.queryByText(/^Closed /)).toBeNull()
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Upload evidence" })).toBeTruthy()
    expect(screen.getByText("Upload the requested evidence in your customer portal.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Upload evidence for PR-26-ABCDEF" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/documents")
    expect(screen.getByRole("link", { name: "Documents and evidence" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/documents")
    expect(screen.getByRole("link", { name: "Service and permissions" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/service")
    expect(screen.getByText("You also have 1 other step waiting for you.")).toBeTruthy()
    expect(screen.getByText("Review your quote")).toBeTruthy()
    expect(screen.queryByText("Nothing is needed from you right now. We'll let you know when that changes.")).toBeNull()
    const progress = screen.getByRole("heading", { name: "Progress" }).parentElement
    expect(progress?.querySelector("[aria-current='step']")).toHaveTextContent("Information — current step")
    expect(screen.getByText("Case received — earlier step")).toBeTruthy()
    expect(screen.getByText("Submitted to Google — upcoming step")).toBeTruthy()
    expect(progress?.querySelector("a, button")).toBeNull()
    const updates = screen.getByRole("heading", { name: "Case updates" }).parentElement?.querySelector("ol")
    const times = updates?.querySelectorAll("time") ?? []
    expect(times).toHaveLength(2)
    expect(times[0]).toHaveAttribute("dateTime", "2026-10-04T12:00:00.000Z")
    expect(times[0]).toHaveTextContent("4 October 2026")
    expect(updates).toHaveTextContent("You submitted evidence.")
    expect(updates).toHaveTextContent("We received your ProfileRelaunch case.")
    const terms = screen.getAllByRole("term").map(item => item.textContent)
    expect(terms).toEqual(["Reference", "Service", "Business", "Location", "Service type", "Started"])
    expect(screen.getByRole("link", { name: "Back to cases" })).toHaveAttribute("href", "/portal/cases")
    expect(document.querySelector("[data-case-id]")).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b(INITIAL_REVIEW|EVIDENCE_COLLECTION|EVIDENCE_REQUIRED|PROFILE_RECOVERY|CASE_RECEIVED|UNDER_REVIEW|AWAITING_CUSTOMER)\b/)
    expect(document.body.innerHTML).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    expect(screen.queryByRole("button", { name: /upload|review your quote|accept|pay|download|message/i })).toBeNull()
    const portalNav = screen.getByRole("navigation", { name: "Customer portal" })
    expect(portalNav.querySelector("[aria-current='page']")).toHaveTextContent("Cases")
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current")
    const headings = screen.getAllByRole("heading").map(item => item.textContent)
    expect(headings.indexOf("What happens next")).toBeLessThan(headings.indexOf("Progress"))
    expect(headings.indexOf("Progress")).toBeLessThan(headings.indexOf("Case updates"))
    expect(headings.indexOf("Case updates")).toBeLessThan(headings.indexOf("Case details"))
  })

  it("hides the tracker for a cancelled case and shows a closed outcome", () => {
    const { rerender } = renderWorkspace(detail({
      status: "CANCELLED",
      workStage: "FINISHED",
      closedAt,
      attentionItems: [],
      serviceTrack: "UNDECIDED",
      locationName: null,
    }, { timeline: [{ code: "CASE_CANCELLED", occurredAt: closedAt }, { code: "CASE_RECEIVED", occurredAt: submittedAt }] }))
    expect(screen.getByText("Cancelled")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "This case was cancelled" })).toBeTruthy()
    expect(screen.getByText("No further action is currently available for this case.")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Progress" })).toBeNull()
    expect(screen.queryByText(/Decision/)).toBeNull()
    expect(screen.getByText("This ProfileRelaunch case was cancelled.")).toBeTruthy()
    expect(screen.getByText("Closed 8 October 2026")).toBeTruthy()
    expect(screen.queryByText("Undecided")).toBeNull()
    expect(screen.queryByText("UNDECIDED")).toBeNull()
    const terms = screen.getAllByRole("term").map(item => item.textContent)
    expect(terms).toEqual(["Reference", "Service", "Business", "Started", "Closed"])

    rerender(<CaseWorkspace detail={detail({
      reference: "RV-26-ABCDEF",
      caseType: "REVIEW_PROTECTION",
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt,
      attentionItems: [],
      outcomeCode: "REMOVED",
      serviceTrack: "MANAGED",
    }, { timeline: [{ code: "CASE_COMPLETED", occurredAt: closedAt }] })} />)
    expect(screen.getByRole("heading", { level: 1, name: "Review Protection" })).toBeTruthy()
    expect(screen.getByText("Complete")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "The review was removed" })).toBeTruthy()
    expect(screen.getByText("This case is complete.")).toBeTruthy()
    expect(screen.getByText("Decision — current step")).toBeTruthy()
    expect(screen.getByText("The review was removed and the case was completed.")).toBeTruthy()
    expect(screen.queryByText("Complete history")).toBeNull()
  })

  it("says when the timeline is only the latest 20 updates", () => {
    const timeline = Array.from({ length: 20 }, (_, index) => ({
      code: "PAYMENT_RECEIVED" as const,
      occurredAt: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    }))
    renderWorkspace(detail({ attentionItems: [], status: "UNDER_REVIEW", workStage: "PREPARATION" }, { timeline, timelineTruncated: true }))
    expect(screen.getByText("Showing the latest 20 case updates.")).toBeTruthy()
    expect(screen.getAllByRole("list") .length).toBeGreaterThan(0)
    expect(document.querySelectorAll(".case-timeline time")).toHaveLength(20)
    expect(screen.queryByText("Complete history")).toBeNull()
  })

  it("shows a load failure that is not a missing case", () => {
    render(<CaseUnavailable />)
    expect(screen.getByRole("heading", { level: 1, name: "We couldn't load this case" })).toBeTruthy()
    expect(screen.getByText("Refresh the page and try again. If the problem continues, contact ProfileRelaunch.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to cases" })).toHaveAttribute("href", "/portal/cases")
    expect(document.body.textContent).not.toMatch(/RPC|SQL|Supabase|not found|ownership/i)
  })
})
