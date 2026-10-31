// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../../layout"
import { CaseUnavailable, CaseWorkspace } from "./case-workspace"
import { GUIDED_PROGRESS_NOTE, MANAGED_PROGRESS_NOTE } from "@/lib/portal/cases/workspace"
import { parseCaseDetail, type CustomerCaseDetail } from "@/lib/portal/cases/parse"

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
    expect(screen.getAllByText("Action needed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Guided service").length).toBeGreaterThan(0)
    expect(screen.getByText("3 October 2026")).toBeTruthy()
    expect(screen.queryByText(/^Closed /)).toBeNull()
    expect(screen.getByRole("heading", { name: "What happens next" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Upload evidence" })).toBeTruthy()
    expect(screen.getByText("Upload the requested evidence in your customer portal.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Upload evidence for PR-26-ABCDEF" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/documents")
    expect(screen.getByRole("link", { name: "Documents and evidence" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/documents")
    expect(screen.getByRole("link", { name: "Service and permissions" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/service")
    expect(screen.getByRole("link", { name: "Payments for this case" })).toHaveAttribute("href", "/portal/cases/PR-26-ABCDEF/payments")
    expect(screen.getByRole("link", { name: "Case messages" })).toHaveAttribute("href", "/portal/messages")
    expect(screen.getByText("You also have 1 other step waiting for you.")).toBeTruthy()
    expect(screen.getByText("Review your quote")).toBeTruthy()
    expect(screen.queryByText("Nothing is needed from you right now. We'll let you know when that changes.")).toBeNull()
    const progress = screen.getByRole("heading", { name: "Progress" }).parentElement
    expect(progress?.querySelector("[aria-current='step']")).toHaveTextContent("Information")
    expect(progress?.querySelector("[aria-current='step']")).toHaveTextContent("Now")
    expect(progress?.querySelector("[aria-current='step']")).toHaveTextContent("Your step")
    expect(screen.getByText(GUIDED_PROGRESS_NOTE)).toBeTruthy()
    expect(screen.queryByText(MANAGED_PROGRESS_NOTE)).toBeNull()
    expect(screen.getByText("Case received")).toBeTruthy()
    expect(screen.getByText("Pack ready for you")).toBeTruthy()
    expect(screen.queryByText("Submitted to Google")).toBeNull()
    expect(screen.queryByText("Decision")).toBeNull()
    expect(progress?.querySelector("a, button")).toBeNull()
    const updates = screen.getByRole("heading", { name: "Case updates" }).parentElement?.querySelector("ol")
    const times = updates?.querySelectorAll("time") ?? []
    expect(times).toHaveLength(2)
    expect(times[0]).toHaveAttribute("dateTime", "2026-10-04T12:00:00.000Z")
    expect(times[0]).toHaveTextContent("4 Oct 2026, 13:00")
    expect(updates).toHaveTextContent("You submitted evidence.")
    expect(updates).toHaveTextContent("We received your ProfileRelaunch case.")
    const terms = screen.getAllByRole("term").map(item => item.textContent)
    expect(terms).toEqual(["Reference", "Business", "Location", "Case", "Arrangement", "Status", "Started"])
    expect(screen.getByRole("link", { name: "Back to cases" })).toHaveAttribute("href", "/portal/cases")
    expect(document.querySelector("[data-case-id]")).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b(INITIAL_REVIEW|EVIDENCE_COLLECTION|EVIDENCE_REQUIRED|PROFILE_RECOVERY|CASE_RECEIVED|UNDER_REVIEW|AWAITING_CUSTOMER)\b/)
    expect(document.body.innerHTML).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    expect(screen.queryByRole("button", { name: /upload|review your quote|accept|pay|download|message/i })).toBeNull()
    const portalNav = screen.getByRole("navigation", { name: "Customer portal" })
    expect(portalNav.querySelector("[aria-current='page']")).toHaveTextContent("Cases")
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current")
    const headings = screen.getAllByRole("heading").map(item => item.textContent)
    expect(headings.indexOf("Case details")).toBeLessThan(headings.indexOf("What happens next"))
    expect(headings.indexOf("What happens next")).toBeLessThan(headings.indexOf("Progress"))
    expect(headings.indexOf("Progress")).toBeLessThan(headings.indexOf("Case updates"))
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
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "This case was cancelled" })).toBeTruthy()
    expect(screen.getByText("No further action is currently available for this case.")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Progress" })).toBeNull()
    expect(screen.queryByText(/Decision/)).toBeNull()
    expect(screen.getByText("This ProfileRelaunch case was cancelled.")).toBeTruthy()
    expect(screen.getByText("8 October 2026")).toBeTruthy()
    expect(screen.queryByText("Undecided")).toBeNull()
    expect(screen.queryByText("UNDECIDED")).toBeNull()
    const terms = screen.getAllByRole("term").map(item => item.textContent)
    expect(terms).toEqual(["Reference", "Business", "Case", "Status", "Started", "Closed"])

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
    expect(screen.getAllByText("Complete").length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "The review was removed" })).toBeTruthy()
    expect(screen.getByText("This case is complete.")).toBeTruthy()
    expect(screen.getByText("Decision")).toBeTruthy()
    expect(screen.getByText(MANAGED_PROGRESS_NOTE)).toBeTruthy()
    expect(screen.queryByText(GUIDED_PROGRESS_NOTE)).toBeNull()
    expect(screen.getByText("The review was removed and the case was completed.")).toBeTruthy()
    expect(screen.queryByText("Complete history")).toBeNull()

    rerender(<CaseWorkspace detail={detail({
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt,
      attentionItems: [],
      outcomeCode: "NOT_RESTORED",
    }, { timeline: [{ code: "CASE_COMPLETED", occurredAt: closedAt }] })} />)
    expect(screen.getByRole("heading", { name: "Your profile was not restored" })).toBeTruthy()
    expect(screen.getByText("The profile was not restored. This case is complete.")).toBeTruthy()
    expect(screen.getByText("Your profile was not restored and the case was completed.")).toBeTruthy()
    expect(screen.queryByText("Your profile was restored")).toBeNull()

    rerender(<CaseWorkspace detail={detail({
      status: "CANCELLED",
      workStage: "FINISHED",
      closedAt,
      attentionItems: [],
      outcomeCode: "WITHDRAWN",
    }, { timeline: [{ code: "CASE_CANCELLED", occurredAt: closedAt }] })} />)
    expect(screen.getByRole("heading", { name: "This case was withdrawn" })).toBeTruthy()
    expect(screen.getAllByText("This case was withdrawn and is now closed. This closure does not report a restoration or removal result.")).toHaveLength(2)
    expect(screen.queryByText(/No Google result/)).toBeNull()

    rerender(<CaseWorkspace detail={detail({
      status: "CANCELLED",
      workStage: "FINISHED",
      closedAt,
      attentionItems: [],
      outcomeCode: "WITHDRAWN",
    }, { timeline: [
      { code: "CASE_CANCELLED", occurredAt: closedAt },
      { code: "GOOGLE_DECISION_RECORDED", occurredAt: "2026-10-06T09:00:00.000Z" },
      { code: "SUBMITTED_TO_GOOGLE", occurredAt: "2026-10-04T09:00:00.000Z" },
    ] })} />)
    expect(screen.getByText("A Google decision was recorded for your case.")).toBeTruthy()
    expect(screen.getByText("Your case was submitted to Google.")).toBeTruthy()
    expect(screen.getAllByText("This case was withdrawn and is now closed. This closure does not report a restoration or removal result.").length).toBeGreaterThan(0)
    expect(screen.queryByText(/No Google result/)).toBeNull()
  })

  it("does not show a terminal decision when the parser rejects the payload", () => {
    const malformed = {
      found: true,
      case: {
        reference: "PR-26-ABCDEF",
        caseType: "PROFILE_RECOVERY",
        serviceTrack: "GUIDED",
        businessName: "Harbour Bakery",
        locationName: "High Street",
        status: "UNDER_REVIEW",
        workStage: "OUTCOME_REVIEW",
        submittedAt,
        closedAt: null,
        attentionItems: [],
        outcomeCode: "RESTORED",
      },
      timeline: [{ code: "CASE_COMPLETED", occurredAt: closedAt }],
      timelineTruncated: false,
    }
    expect(parseCaseDetail(malformed)).toBeNull()
    expect(parseCaseDetail({
      ...malformed,
      case: { ...malformed.case, outcomeCode: "NOT_RESTORED", status: "UNDER_REVIEW", workStage: "FURTHER_REVIEW" },
    })).toBeNull()
    render(<CaseUnavailable />)
    expect(screen.queryByRole("heading", { name: "Your profile was restored" })).toBeNull()
    expect(screen.queryByText("Your profile was restored and the case was completed.")).toBeNull()
    expect(screen.queryByRole("heading", { name: "Your profile was not restored" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "The review was removed" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "The review was not removed" })).toBeNull()
    expect(screen.getByRole("heading", { name: "We couldn't load this case" })).toBeTruthy()
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

  it("shows a recorded paid Guided service beside the case status", () => {
    render(<CaseWorkspace
      detail={detail({ attentionItems: [], status: "AWAITING_CUSTOMER", workStage: "PAYMENT_REQUIRED" })}
      commerce={{ purchasedService: "Guided Relaunch", payment: "Paid £99.00" }}
    />)
    expect(screen.getByText("Guided Relaunch")).toBeTruthy()
    expect(screen.getByText("Paid £99.00")).toBeTruthy()
    expect(screen.getAllByText("In progress").length).toBeGreaterThan(0)
    expect(screen.queryByRole("link", { name: /pay £|pay now/i })).toBeNull()
    expect(screen.queryByText("Submitted to Google")).toBeNull()
    expect(screen.queryByText("Decision")).toBeNull()
  })

  it("shows a published Guided pack as ready to download, and preparation when that pack is withdrawn", () => {
    const published = detail({
      attentionItems: [],
      status: "UNDER_REVIEW",
      workStage: "READY_TO_SUBMIT",
    }, {
      timeline: [
        { code: "NOTIFICATION_DELIVERED", occurredAt: "2026-10-30T09:17:00.000Z" },
        { code: "PACK_PUBLISHED", occurredAt: "2026-10-30T09:16:00.000Z" },
        { code: "CASE_RECEIVED", occurredAt: submittedAt },
      ],
    })
    const { rerender } = render(<CaseWorkspace
      detail={published}
      packHref="/portal/cases/PR-26-ABCDEF/documents"
      packPublished
      handover={{ submitted: false, correctionRequested: false, outcomeReported: false, outcomeReviewed: false, evidenceOptions: [] }}
    />)
    expect(screen.getByRole("heading", { name: "Pack ready for you" })).toBeTruthy()
    expect(screen.getByText("Download your documents. You choose if and when to send them to Google. We have not sent them.")).toBeTruthy()
    expect(screen.getByText("ProfileRelaunch prepared this pack. You submit it to Google yourself.")).toBeTruthy()
    expect(screen.getAllByRole("link", { name: "Download your completed pack" })).toHaveLength(2)
    expect(screen.getByRole("heading", { name: "What would you like to do next?" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "I've submitted my pack to Google" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("button", { name: "Request a correction" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Update Google's decision" })).toBeNull()
    expect(screen.getByText("Not reported")).toBeTruthy()
    expect(screen.getByText("Awaiting")).toBeTruthy()
    const progress = screen.getByRole("heading", { name: "Progress" }).parentElement
    expect(progress?.querySelector("[aria-current='step']")).toHaveTextContent("Pack ready for you")
    expect(screen.getByText("Your pack was published for you to download.")).toBeTruthy()
    expect(screen.getByText("We emailed you to let you know your pack is ready.")).toBeTruthy()
    expect(screen.queryByText("Submitted to Google")).toBeNull()

    rerender(<CaseWorkspace detail={published} packHref={null} packPublished={false} />)
    expect(screen.getByRole("heading", { name: "We're preparing your pack" })).toBeTruthy()
    expect(screen.getByText("Nothing is needed from you right now. We'll let you know when your pack is ready.")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Download your completed pack" })).toBeNull()
    expect(screen.getByRole("heading", { name: "Progress" }).parentElement?.querySelector("[aria-current='step']")).toHaveTextContent("Preparing your pack")
  })

  it("shows a completed Guided preparation, and the pack only while it is still available", () => {
    const closed = detail({
      attentionItems: [],
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt,
    }, {
      timeline: [
        { code: "CASE_COMPLETED", occurredAt: closedAt },
        { code: "PACK_PUBLISHED", occurredAt: "2026-10-07T09:00:00.000Z" },
        { code: "CASE_RECEIVED", occurredAt: submittedAt },
      ],
    })
    const { rerender } = render(<CaseWorkspace
      detail={closed}
      packHref="/portal/cases/PR-26-ABCDEF/documents"
      packPublished
      handover={{ submitted: false, correctionRequested: false, outcomeReported: false, outcomeReviewed: false, evidenceOptions: [] }}
    />)
    expect(screen.getByText("Preparation complete")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Your Guided Relaunch service is complete" })).toBeTruthy()
    expect(screen.getByText("Your Guided Relaunch service is complete. Your submission pack remains available in your account. You can tell us when you've submitted it to Google and update us when you hear back.")).toBeTruthy()
    expect(screen.getAllByRole("link", { name: "Download your completed pack" })).toHaveLength(2)
    expect(screen.getByRole("button", { name: "I've submitted my pack to Google" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Update Google's decision" })).toBeNull()
    expect(screen.getByText("ProfileRelaunch service")).toBeTruthy()
    expect(screen.getByText("Google submission")).toBeTruthy()
    expect(screen.getByText("Not reported")).toBeTruthy()
    expect(screen.getByText("Awaiting")).toBeTruthy()
    const progress = screen.getByRole("heading", { name: "Progress" }).parentElement
    expect(progress?.querySelector("[aria-current='step']")).toBeNull()
    expect(progress).toHaveTextContent("Pack ready for you")
    expect(progress).toHaveTextContent("Completed")
    expect(progress).not.toHaveTextContent("Now")
    expect(screen.queryByText("Submitted to Google")).toBeNull()
    expect(screen.queryByText("Your profile was restored")).toBeNull()

    rerender(<CaseWorkspace detail={closed} packHref={null} packPublished={false} />)
    expect(screen.queryByRole("link", { name: "Download your completed pack" })).toBeNull()
    expect(screen.getByText("Your preparation is complete. Sending anything to Google is your choice, and a later Google decision is separate.")).toBeTruthy()
    const withoutPack = screen.getByRole("heading", { name: "Progress" }).parentElement
    expect(withoutPack?.querySelector("[aria-current='step']")).toBeNull()
    expect(withoutPack).not.toHaveTextContent("Pack ready for you")
    expect(withoutPack).not.toHaveTextContent("Now")
    expect(screen.queryByText("Your profile was restored")).toBeNull()
    expect(screen.queryByText("Submitted to Google")).toBeNull()
  })

  it("keeps the pack actions on the case page and does not treat a customer outcome as a verified decision", () => {
    const closed = detail({
      attentionItems: [],
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt,
    }, {
      timeline: [
        { code: "CUSTOMER_REPORTED_OUTCOME", occurredAt: "2026-10-09T09:00:00.000Z" },
        { code: "CUSTOMER_REPORTED_SUBMISSION", occurredAt: "2026-10-08T09:00:00.000Z" },
        { code: "CASE_COMPLETED", occurredAt: closedAt },
      ],
    })
    const { rerender } = render(<CaseWorkspace
      detail={closed}
      packHref="/portal/cases/PR-26-ABCDEF/documents"
      packPublished
      handover={{
        submitted: true,
        correctionRequested: false,
        outcomeReported: true,
        outcomeReviewed: false,
        evidenceOptions: [],
      }}
    />)
    expect(screen.getAllByRole("link", { name: "Download your completed pack" }).length).toBeGreaterThan(0)
    expect(screen.getByRole("heading", { name: "Your Google submission is recorded" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Request a correction" })).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "I've submitted my pack to Google" })).toBeNull()
    const outcome = screen.getByRole("button", { name: "Update Google's decision" })
    expect(outcome).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("This is your report. It is not an independently verified Google decision, and it does not change your completed ProfileRelaunch service or its payment.")).not.toBeVisible()
    expect(screen.getAllByText("Customer reported").length).toBeGreaterThan(0)
    expect(screen.queryByText("Reviewed")).toBeNull()
    expect(screen.queryByText("Your profile was restored")).toBeNull()
    rerender(<CaseWorkspace
      detail={closed}
      packHref="/portal/cases/PR-26-ABCDEF/documents"
      packPublished
      handover={{
        submitted: true,
        correctionRequested: false,
        outcomeReported: true,
        outcomeReviewed: true,
        evidenceOptions: [],
      }}
    />)
    expect(screen.getByText("Reviewed")).toBeTruthy()
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0)
    expect(screen.queryByText("Your profile was restored")).toBeNull()
  })

  it("shows a recorded customer submission and a recorded Google decision", () => {
    const { rerender } = render(<CaseWorkspace detail={detail({
      attentionItems: [],
      status: "UNDER_REVIEW",
      workStage: "SUBMITTED",
    }, {
      timeline: [
        { code: "SUBMITTED_TO_GOOGLE", occurredAt: "2026-10-06T09:00:00.000Z" },
        { code: "CASE_RECEIVED", occurredAt: submittedAt },
      ],
    })} />)
    expect(screen.getByRole("heading", { name: "A submission has been recorded" })).toBeTruthy()
    expect(screen.getByText("We've recorded that this pack was sent to Google. That record is not a decision from Google.")).toBeTruthy()
    const progress = screen.getByRole("heading", { name: "Progress" }).parentElement
    expect(progress?.querySelector("[aria-current='step']")).toHaveTextContent("Submission recorded")
    expect(progress?.querySelector("[aria-current='step']")).toHaveTextContent("Now")
    expect(screen.queryByText("Decision")).toBeNull()
    expect(screen.queryByText("Your profile was restored")).toBeNull()

    rerender(<CaseWorkspace detail={detail({
      attentionItems: [],
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt,
      outcomeCode: "RESTORED",
    }, {
      timeline: [
        { code: "CASE_COMPLETED", occurredAt: closedAt },
        { code: "GOOGLE_DECISION_RECORDED", occurredAt: "2026-10-07T09:00:00.000Z" },
        { code: "SUBMITTED_TO_GOOGLE", occurredAt: "2026-10-06T09:00:00.000Z" },
      ],
    })} />)
    expect(screen.getByRole("heading", { name: "Your profile was restored" })).toBeTruthy()
    const decided = screen.getByRole("heading", { name: "Progress" }).parentElement
    expect(decided?.querySelector("[aria-current='step']")).toHaveTextContent("Decision")
    expect(decided).toHaveTextContent("Submission recorded")
    expect(decided?.querySelector("[aria-current='step']")).not.toHaveTextContent("Submission recorded")
    expect(screen.queryByText("Preparation complete")).toBeNull()

    rerender(<CaseWorkspace detail={detail({
      attentionItems: [],
      status: "CLOSED",
      workStage: "FINISHED",
      closedAt,
    }, {
      timeline: [
        { code: "GOOGLE_DECISION_RECORDED", occurredAt: "2026-10-07T09:00:00.000Z" },
        { code: "CASE_RECEIVED", occurredAt: submittedAt },
      ],
    })} />)
    expect(screen.getByRole("heading", { name: "A Google decision was recorded" })).toBeTruthy()
    expect(screen.getByText("We've recorded a decision from Google for this case.")).toBeTruthy()
    expect(screen.queryByText("Your profile was restored")).toBeNull()
    expect(screen.queryByText("Preparation complete")).toBeNull()
    expect(screen.getByRole("heading", { name: "Progress" }).parentElement?.querySelector("[aria-current='step']")).toHaveTextContent("Decision")
  })

  it("keeps two updates from the same day without an extra note", () => {
    renderWorkspace(detail({ attentionItems: [], status: "UNDER_REVIEW", workStage: "PREPARATION" }, {
      timeline: [
        { code: "PAYMENT_RECEIVED", occurredAt: "2026-10-04T15:00:00.000Z" },
        { code: "PAYMENT_RECEIVED", occurredAt: "2026-10-04T12:00:00.000Z" },
      ],
    }))
    const times = document.querySelectorAll(".case-timeline time")
    expect(times).toHaveLength(2)
    expect(times[0]).toHaveAttribute("dateTime", "2026-10-04T15:00:00.000Z")
    expect(times[1]).toHaveAttribute("dateTime", "2026-10-04T12:00:00.000Z")
    expect(screen.getAllByText("We received a payment for this case.")).toHaveLength(2)
    expect(screen.queryByText("Separate event on this day.")).toBeNull()
    expect(screen.queryByText(/Separate event/)).toBeNull()
  })

  it("shows a load failure that is not a missing case", () => {
    render(<CaseUnavailable />)
    expect(screen.getByRole("heading", { level: 1, name: "We couldn't load this case" })).toBeTruthy()
    expect(screen.getByText("Refresh the page and try again. If the problem continues, contact ProfileRelaunch.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to cases" })).toHaveAttribute("href", "/portal/cases")
    expect(document.body.textContent).not.toMatch(/RPC|SQL|Supabase|not found|ownership/i)
  })
})
