// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"
import type { CaseFlowFacts, CaseFlowModel } from "@/lib/case-flow/model"

const getCase = vi.fn()
const getCaseAuthorization = vi.fn()
const loadCaseFlow = vi.fn()
vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("@/lib/authorization/queries", () => ({ getCaseAuthorization: (...args: unknown[]) => getCaseAuthorization(...args) }))
vi.mock("@/lib/case-flow/load", () => ({ loadCaseFlow: (...args: unknown[]) => loadCaseFlow(...args) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))
vi.mock("../forms", () => ({
  PlanForm: () => null, TransitionForm: () => null, NoteForm: () => null, TaskForm: () => null,
  ResolveTask: () => null, SubmissionForm: () => <p>submission form</p>, ResolveSubmission: () => null, CloseForm: () => null,
}))
vi.mock("./authorization-forms", () => ({
  AuthorizationPanel: () => <section><h3>Agreements &amp; permissions</h3></section>,
}))

import CasePage from "./page"
import { CASE_ID, caseDetail, cockpitScenarios, componentScenarios, flowFrom, type CockpitScenarioName } from "./cockpit/fixtures"

afterEach(() => cleanup())
beforeEach(() => {
  getCase.mockReset()
  loadCaseFlow.mockReset()
  getCaseAuthorization.mockReset().mockResolvedValue({ caseId: CASE_ID, readiness: { authorizationReady: false } })
})

/** The legacy case and the projection, lined up on the same facts. */
function arrange(facts: CaseFlowFacts, overrides: Partial<CaseDetail> = {}) {
  const c = caseDetail({
    stage: facts.technicalStage as CaseDetail["stage"],
    track: facts.serviceTrack as CaseDetail["track"],
    status: facts.caseStatus,
    outcome: facts.outcome as CaseDetail["outcome"],
    summary: facts.outcomeSummary,
    transitions: facts.allowedTransitions as CaseDetail["transitions"],
    ...overrides,
  })
  getCase.mockResolvedValue(c)
  loadCaseFlow.mockResolvedValue(flowFrom(facts))
  return c
}

async function showFacts(facts: CaseFlowFacts, overrides: Partial<CaseDetail> = {}) {
  const c = arrange(facts, overrides)
  render(await CasePage({ params: Promise.resolve({ id: CASE_ID }), searchParams: Promise.resolve({}) }))
  return { c, flow: flowFrom(facts) }
}

async function show(name: CockpitScenarioName, overrides: Partial<CaseDetail> = {}) {
  return showFacts(cockpitScenarios[name], overrides)
}

describe("the case cockpit, across the states operators see", () => {
  const expected: Array<[CockpitScenarioName, string]> = [
    ["newCase", "Review the new case"],
    ["evidenceNothingAskedFor", "Raise an evidence request"],
    ["evidenceWaitingForCustomer", "Waiting for the customer to upload evidence"],
    ["evidenceScanProblem", "Refresh the evidence security check"],
    ["serviceNeedsQuote", "Create the quote"],
    ["managedWaitingForAgreement", "Waiting for the service agreement"],
    ["managedPermissionInReview", "Re-establish an invalidated permission"],
    ["guidedWaitingForPayment", "Waiting for the upfront payment"],
    ["preparationApprovePack", "Approve the evidence pack"],
    ["readyToSubmitNeedsPublish", "Publish the pack to the customer"],
    ["readyToSubmitRecordSubmission", "Submit externally, then record the submission"],
    ["waitingForGoogle", "Waiting for Google"],
    ["furtherReview", "Do the further work this case needs"],
    ["outcomeReview", "Close the case"],
  ]

  it.each(expected)("%s leads with the one thing to do next", async (name, label) => {
    await show(name)
    const card = document.getElementById("case-next-action")!
    expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(label)
  })

  it.each(expected)("%s puts the case journey above the workspace", async name => {
    await show(name)
    const journey = screen.getByRole("heading", { name: "Case journey" })
    expect(journey.compareDocumentPosition(screen.getByRole("heading", { name: "Work on this case" })))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(within(journey.closest("section")!).getAllByRole("listitem")).toHaveLength(9)
  })

  it.each(expected)("%s has exactly one page heading, and it is the reference", async name => {
    const { c } = await show(name)
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(c.reference)
  })

  it("names the client, the business, the service track and the priority in the header", async () => {
    await show("managedWaitingForAgreement")
    const header = screen.getByRole("heading", { level: 1 }).closest("header")!
    expect(within(header).getByText("Alex Mercer — Mercer Bakery")).toBeInTheDocument()
    expect(within(header).getByText("Service: Managed")).toBeInTheDocument()
    expect(within(header).getByText("Normal priority")).toBeInTheDocument()
    expect(within(header).getByText("Open")).toBeInTheDocument()
    expect(within(header).getByRole("link", { name: "Client record" })).toHaveAttribute("href", `/records/client/${cockpitScenarios.newCase.customerId}`)
  })

  it("keeps the technical stage out of the headline but available lower down", async () => {
    await show("readyToSubmitRecordSubmission")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("PR-1042")
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toMatch(/READY_TO_SUBMIT/)
    expect(screen.getByText("Ready to submit (READY_TO_SUBMIT)")).toBeInTheDocument()
  })

  it("renders the record links safely when the case has no location", async () => {
    await show("newCase", { locationId: "" as unknown as string })
    expect(screen.getAllByText("No location recorded").length).toBeGreaterThan(0)
    expect(document.body.innerHTML).not.toMatch(/href="\/records\/location\/"/)
  })
})

const checklist = () => screen.queryByRole("heading", { name: "Case prerequisites" })
const prerequisitePhase = (flow: CaseFlowModel) => flow.phases.find(phase => phase.id === "PREREQUISITES")!.state

describe("blockers, attention and prerequisites", () => {
  it("shows what is blocking immediately after the recommendation", async () => {
    await show("guidedWaitingForPayment")
    const blockers = screen.getByRole("heading", { name: "Blocking progress" })
    expect(within(blockers.closest("section")!).getByRole("heading", { name: "The upfront payment has not been collected" })).toBeInTheDocument()
    expect(document.getElementById("case-next-action")!.compareDocumentPosition(blockers))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it("omits the blockers section entirely when nothing is blocking", async () => {
    await show("newCase")
    expect(screen.queryByRole("heading", { name: "Blocking progress" })).toBeNull()
  })

  it("keeps supporting attention below the one dominant recommendation", async () => {
    await show("evidenceScanProblem")
    const attention = screen.getByRole("heading", { name: "Other things needing attention" })
    expect(within(attention.closest("section")!).getByRole("heading", { name: "A security scan result is missing" })).toBeInTheDocument()
    expect(document.getElementById("case-next-action")!.compareDocumentPosition(attention))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it("lists the Managed prerequisite groups with their individual items", async () => {
    await show("managedWaitingForAgreement")
    const section = screen.getByRole("heading", { name: "Case prerequisites" }).closest("section")!
    expect(within(section).getAllByRole("listitem")).toHaveLength(9)
    expect(within(section).getByText("The service agreement is accepted")).toBeInTheDocument()
  })

  it("shows no prerequisite section on a track that has none", async () => {
    await show("newCase")
    expect(checklist()).toBeNull()
  })

  it("never prints a reason code, a blocker code or an action id", async () => {
    await show("managedPermissionInReview")
    const cockpit = document.querySelector(".cockpit-split")!.parentElement!
    const text = Array.from(cockpit.children).slice(0, 6).map(node => node.textContent).join(" ")
    expect(text).not.toMatch(/AUTHORISATION_IN_REVIEW|RESOLVE_AUTHORISATION_REVIEW|AUTHORISATION_REVIEW_REQUIRED/)
  })
})

/**
 * The checklist follows the journey, not the existence of the groups: UX-1
 * returns them for the whole life of a Guided or Managed case, and these say
 * which part of that life is the part worth reading them in. Each one asserts
 * the resolver's own phase state first, so a test can never agree with the
 * page about a readiness neither of them worked out.
 */
describe("when the prerequisite checklist is worth reading", () => {
  it("holds it back while the service is still being chosen, though the model already lists it", async () => {
    const { flow } = await show("serviceNeedsQuote")
    expect(prerequisitePhase(flow)).toBe("UPCOMING")
    expect(flow.prerequisites.length).toBeGreaterThan(0)
    expect(checklist()).toBeNull()
  })

  it("shows it while the case is at the prerequisites phase", async () => {
    const { flow } = await show("managedWaitingForAgreement")
    expect(prerequisitePhase(flow)).toBe("CURRENT")
    expect(checklist()).toBeInTheDocument()
  })

  it("drops it once preparation has started and the prerequisites still hold", async () => {
    const { flow } = await show("preparationApprovePack")
    expect(prerequisitePhase(flow)).toBe("COMPLETE")
    expect(flow.prerequisites.length).toBeGreaterThan(0)
    expect(checklist()).toBeNull()
  })

  it("leaves it out at the submission phase too", async () => {
    const { flow } = await show("readyToSubmitRecordSubmission")
    expect(prerequisitePhase(flow)).toBe("COMPLETE")
    expect(flow.prerequisites.length).toBeGreaterThan(0)
    expect(checklist()).toBeNull()
  })

  it("brings it back when a permission is invalidated long after it was met", async () => {
    const { flow } = await showFacts(componentScenarios.managedPermissionInvalidatedLater)
    expect(flow.phase).toBe("PREPARATION")
    expect(prerequisitePhase(flow)).toBe("NEEDS_ATTENTION")
    expect(checklist()).toBeInTheDocument()
    expect(within(checklist()!.closest("section")!).getByText("The case-management permission is active")).toBeInTheDocument()
  })

  it("does not resurrect it on a finished case", async () => {
    const { flow } = await show("closedSuccessfully")
    expect(prerequisitePhase(flow)).toBe("COMPLETE")
    expect(flow.prerequisites.length).toBeGreaterThan(0)
    expect(checklist()).toBeNull()
  })
})

describe("a closed case", () => {
  it("still uses the cockpit, with the outcome in place of a recommendation", async () => {
    await show("closedSuccessfully")
    const card = document.getElementById("case-next-action")!
    expect(within(card).getByRole("heading", { name: "This case is closed" })).toBeInTheDocument()
    expect(within(card).queryByRole("link")).toBeNull()
    expect(screen.getByText("9 of 9 phases complete.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Closure" })).toBeInTheDocument()
  })

  it("keeps an open complaint visible and does not resurrect old prerequisites", async () => {
    await show("closedWithOpenComplaint")
    expect(screen.getByRole("heading", { name: "There is an open complaint about this case" })).toBeInTheDocument()
    expect(checklist()).toBeNull()
    expect(screen.queryByRole("heading", { name: "Blocking progress" })).toBeNull()
  })

  it("keeps the reopen path and drops the commands a closed case cannot run", async () => {
    await show("closedSuccessfully")
    expect(screen.getByText("Reopen with a new task")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Progress case" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Close or withdraw this case" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Agreements & permissions" })).toBeNull()
  })

  it("says so when a case has been reopened", async () => {
    await showFacts({ ...cockpitScenarios.furtherReview, reopened: true })
    expect(screen.getByText("This case was previously closed and has been reopened for further work.")).toBeInTheDocument()
  })
})

describe("the case workspace below the cockpit", () => {
  it("groups the work, the workspaces, the details and the history", async () => {
    await show("preparationApprovePack")
    for (const group of ["Work on this case", "Supporting workspaces", "Case details", "History"]) {
      expect(screen.getByRole("heading", { name: group, level: 2 })).toBeInTheDocument()
    }
  })

  it("gives each same-page action an anchor the recommendation can reach", async () => {
    await show("preparationApprovePack")
    for (const id of ["case-plan", "case-progress", "case-authorisation", "case-tasks", "case-submissions", "case-closure"]) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it("opens the section the recommendation points at", async () => {
    await show("outcomeReview")
    const closure = document.getElementById("case-closure")!
    expect(closure.querySelector("details")).toHaveAttribute("open")
    expect(document.getElementById("case-plan")!.querySelector("details")).not.toHaveAttribute("open")
  })

  it("calls the stored plan a recorded plan, not the next action", async () => {
    await show("newCase", { nextAction: "Call the customer", due: "2026-06-20T09:00:00.000Z" })
    expect(screen.getByText("Recorded plan: Call the customer — 20 Jun 2026, 10:00")).toBeInTheDocument()
    expect(screen.queryByText(/^Next action:/)).toBeNull()
  })

  it("keeps the original request, the received date and the review protection warning", async () => {
    await show("newCase", { type: "REVIEW_PROTECTION" })
    expect(screen.getByRole("heading", { name: "Original request" })).toBeInTheDocument()
    expect(screen.getByText("The business profile was suspended without warning.")).toBeInTheDocument()
    expect(screen.getByText("Received 18 May 2026, 11:00.")).toBeInTheDocument()
    expect(screen.getByText(/The exact review URL and agreed scope still need to be recorded/)).toBeInTheDocument()
  })

  it("links the case to the evidence workspace", async () => {
    await show("newCase")
    expect(screen.getByRole("heading", { name: "Evidence & Documents" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open evidence workspace" })).toHaveAttribute("href", `/cases/${CASE_ID}/evidence`)
    expect(screen.getByRole("heading", { name: "Agreements & permissions" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /customer portal/i })).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/href=["'][^"']*customer[^"']*portal/i)
  })

  it("keeps the case communications link", async () => {
    await show("newCase")
    expect(screen.getByRole("link", { name: "Open case communications" })).toHaveAttribute("href", `/communications?case=${CASE_ID}`)
  })

  it("puts open tasks above the ones already dealt with, and counts them", async () => {
    await show("newCase", {
      tasks: [
        { id: "t1", caseId: CASE_ID, reference: "PR-1042", title: "Chase the customer", owner: "ADMIN", kind: "FOLLOW_UP", due: "2026-06-10T09:00:00.000Z", source: "agreed on the phone", timezone: "Europe/London", status: "OPEN", resolution: "" },
        { id: "t2", caseId: CASE_ID, reference: "PR-1042", title: "Old call", owner: "ADMIN", kind: "CALL", due: "2026-05-10T09:00:00.000Z", source: "agreed on the phone", timezone: "Europe/London", status: "DONE", resolution: "Completed" },
      ],
    })
    expect(screen.getByRole("heading", { name: "Tasks (1 open)" })).toBeInTheDocument()
    expect(screen.getByText("Chase the customer")).toBeInTheDocument()
    expect(screen.getByText("Completed and cancelled tasks (1)")).toBeInTheDocument()
  })

  it("keeps the submission form behind the same stage and track gate as before", async () => {
    await show("readyToSubmitRecordSubmission")
    expect(screen.getByText("Record an externally completed submission")).toBeInTheDocument()
    cleanup()
    await show("newCase")
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
  })

  it("does not offer the submission form while an attempt is unresolved", async () => {
    await show("readyToSubmitRecordSubmission", {
      submissions: [{ id: "s1", actor: "ADMIN", track: "GUIDED", submittedAt: "2026-05-20T09:00:00.000Z", reference: "G-1", channel: "appeal form", evidence: "screenshot", result: null, resultNote: null }],
    })
    expect(screen.queryByText("Record an externally completed submission")).toBeNull()
    expect(screen.getByText(/An attempt is recorded with no decision against it/)).toBeInTheDocument()
  })

  it("keeps the customer preview behind a disclosure and still calls it a preview", async () => {
    await show("newCase")
    const preview = screen.getByText("Customer-visible preview").closest("details")!
    expect(preview).not.toHaveAttribute("open")
    expect(within(preview).getByText(/^This is a preview\./)).toBeInTheDocument()
  })

  it("keeps the history newest first with its pagination unchanged", async () => {
    const events = Array.from({ length: 51 }, (_, index) => ({
      id: `event-${index}`, event: "CASE_NOTE", note: `note ${index}`, visibility: "INTERNAL",
      createdAt: "2026-05-20T09:00:00.000Z", details: {},
    }))
    await show("newCase", { events })
    expect(screen.getByRole("heading", { name: "Case history" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Older history" })).toHaveAttribute("href", `/cases/${CASE_ID}?before=event-49`)
  })
})
