/**
 * What the workbench decides, with nothing rendered and nothing read.
 *
 * Three things matter here and they are all things that would be invisible
 * in a screenshot. The order cases come in has to be UX-1's band and then
 * facts the case actually records, never the case's own priority field and
 * never a weighting this page invented. Every open case has to land in
 * exactly one of do-next, blocked and waiting. And when the scan could not
 * see every case, the model has to say so rather than hand back a confident
 * ordering of a sample.
 *
 * The ordering tests build the two or three fields `compareWork` reads
 * directly, because the rule under test is a comparison and the clearest way
 * to test a comparison is to vary one thing at a time. Everything about
 * classification and presentation uses flows the resolver actually produced.
 */

import { describe, expect, it } from "vitest"
import { dashboard, population, todayScenarios } from "../../app/today/fixtures"
import { buildTodayWorkModel, todayWaitingGroups } from "./model"
import { TODAY_CASE_SCAN_LIMIT } from "./scan"
import type { CaseFlowModel, CaseNextAction, CasePriorityBand } from "../case-flow/model"
import type { CaseRow } from "../cases/model"
import type { TodayCaseItem } from "./model"

const NOW = new Date("2026-06-01T12:00:00.000Z")
const PAST = "2026-05-01T12:00:00.000Z"
const SOONER = "2026-06-02T12:00:00.000Z"
const LATER = "2026-06-09T12:00:00.000Z"

function build(entries: readonly { row: CaseRow; flow: CaseFlowModel }[], options: {
  complete?: boolean
  dashboardFacts?: ReturnType<typeof dashboard>
} = {}) {
  const { rows, flows } = population(entries)
  return buildTodayWorkModel({
    now: NOW,
    dashboard: options.dashboardFacts ?? dashboard(),
    rows,
    flows,
    complete: options.complete ?? true,
    scanLimit: TODAY_CASE_SCAN_LIMIT,
  })
}

const references = (items: TodayCaseItem[]) => items.map(item => item.row.reference)

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

/**
 * A case reduced to the fields the ordering rule reads. The band is the one
 * UX-1 put on the chosen action; nothing here can change which action was
 * chosen, because that already happened.
 */
function sortable(
  reference: string,
  band: CasePriorityBand,
  action: Partial<CaseNextAction> = {},
  row: Partial<CaseRow> = {},
): { row: CaseRow; flow: CaseFlowModel } {
  const primaryAction = {
    id: "REVIEW_EVIDENCE",
    label: "Review the uploaded evidence",
    description: "",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    priorityBand: band,
    dueAt: null,
    overdue: false,
    destination: null,
    reasonCodes: [],
    ...action,
  } as CaseNextAction
  return {
    row: { id: reference, reference, priority: "NORMAL", createdAt: "2026-05-01T00:00:00.000Z", ...row } as CaseRow,
    flow: {
      caseId: reference,
      reference,
      phaseLabel: "Collecting evidence",
      phases: [],
      serviceTrack: "UNDECIDED",
      primaryAction,
      waitingOn: primaryAction.owner,
      blockers: [],
      attentionItems: [],
      prerequisites: [],
      caseComplete: false,
    } as unknown as CaseFlowModel,
  }
}

describe("the order cases are worked in", () => {
  it("is the UX-1 band, highest first", () => {
    const model = build([
      sortable("PR-D", "PROGRESSION"),
      sortable("PR-C", "JOURNEY"),
      sortable("PR-B", "ADMIN_ACTION"),
      sortable("PR-A", "SAFETY"),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-A", "PR-B", "PR-C", "PR-D"])
  })

  it("does not let the case record's own priority move anything", () => {
    const model = build([
      sortable("PR-PROGRESSION", "PROGRESSION", {}, { priority: "URGENT" }),
      sortable("PR-SAFETY", "SAFETY", {}, { priority: "LOW" }),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-SAFETY", "PR-PROGRESSION"])
  })

  it("does not let an older case, a track or a type move anything", () => {
    const model = build([
      sortable("PR-NEW", "SAFETY", {}, { createdAt: "2026-05-31T00:00:00.000Z", track: "MANAGED", type: "REVIEW_REMOVAL" }),
      sortable("PR-OLD", "JOURNEY", {}, { createdAt: "2024-01-01T00:00:00.000Z", track: "GUIDED", type: "PROFILE_RECOVERY" }),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-NEW", "PR-OLD"])
  })

  it("puts an overdue action first inside its band", () => {
    const model = build([
      sortable("PR-SOON", "ADMIN_ACTION", { dueAt: SOONER }),
      sortable("PR-LATE", "ADMIN_ACTION", { dueAt: PAST, overdue: true }),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-LATE", "PR-SOON"])
  })

  it("does not let an overdue action jump into a higher band", () => {
    const model = build([
      sortable("PR-JOURNEY-LATE", "JOURNEY", { dueAt: PAST, overdue: true }),
      sortable("PR-SAFETY", "SAFETY"),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-SAFETY", "PR-JOURNEY-LATE"])
  })

  it("then takes the earliest real due date", () => {
    const model = build([
      sortable("PR-LATER", "ADMIN_ACTION", { dueAt: LATER }),
      sortable("PR-SOONER", "ADMIN_ACTION", { dueAt: SOONER }),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-SOONER", "PR-LATER"])
  })

  it("then puts a dated action before an undated one", () => {
    const model = build([
      sortable("PR-NONE", "ADMIN_ACTION"),
      sortable("PR-DATED", "ADMIN_ACTION", { dueAt: LATER }),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-DATED", "PR-NONE"])
  })

  it("then keeps the order the Cases list gave, so the page does not reshuffle itself", () => {
    const model = build([
      sortable("PR-FIRST", "ADMIN_ACTION"),
      sortable("PR-SECOND", "ADMIN_ACTION"),
      sortable("PR-THIRD", "ADMIN_ACTION"),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-FIRST", "PR-SECOND", "PR-THIRD"])
  })

  it("invents no score: an undated safety case still beats a dated overdue progression one", () => {
    const model = build([
      sortable("PR-PROGRESSION", "PROGRESSION", { dueAt: PAST, overdue: true }),
      sortable("PR-SAFETY", "SAFETY"),
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-SAFETY", "PR-PROGRESSION"])
  })

  it("orders blocked and waiting cases by the same rule", () => {
    const blocked = (reference: string, band: CasePriorityBand) =>
      sortable(reference, band, { state: "BLOCKED" })
    const model = build([blocked("PR-LOW", "PROGRESSION"), blocked("PR-HIGH", "SAFETY")])
    expect(references(model.caseWork.blocked)).toEqual(["PR-HIGH", "PR-LOW"])
  })

  it("leaves the resolved flow exactly as it found it", () => {
    const entry = sortable("PR-X", "SAFETY", { dueAt: PAST, overdue: true })
    const before = structuredClone(entry.flow)
    build([entry])
    expect(entry.flow).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// Where a case lands
// ---------------------------------------------------------------------------

describe("which section a case lands in", () => {
  const scenario = (name: keyof typeof todayScenarios) => todayScenarios[name]

  it("puts an action ProfileRelaunch has to take in Do next", () => {
    const model = build([scenario("adminApprovePack")])
    expect(references(model.caseWork.doNext)).toEqual(["PR-2004"])
    expect(model.caseWork.counts).toEqual({ doNext: 1, blocked: 0, waiting: 0 })
  })

  it("puts a progression step the case has earned in Do next", () => {
    const model = build([scenario("progressionCloseCase")])
    expect(references(model.caseWork.doNext)).toEqual(["PR-2009"])
  })

  it("keeps a blocked case out of Do next even though ProfileRelaunch owns it", () => {
    const model = build([scenario("blockedCommercialUnknown")])
    expect(model.caseWork.doNext).toEqual([])
    expect(references(model.caseWork.blocked)).toEqual(["PR-2016"])
  })

  it.each([
    ["waitingOnCustomer", "CUSTOMER"],
    ["waitingOnCustomerOverdue", "CUSTOMER"],
    ["waitingOnAgreement", "CUSTOMER"],
    ["waitingOnGoogle", "GOOGLE"],
    ["waitingOnScan", "SYSTEM"],
  ] as const)("puts %s under %s and never in Do next", (name, group) => {
    const model = build([scenario(name)])
    expect(model.caseWork.doNext).toEqual([])
    expect(model.caseWork.blocked).toEqual([])
    expect(references(model.caseWork.waiting[group])).toEqual([scenario(name).row.reference])
  })

  it("leaves a completed case out of every work section", () => {
    const model = build([scenario("closedCase")])
    expect(model.caseWork.doNext).toEqual([])
    expect(model.caseWork.blocked).toEqual([])
    expect(model.caseWork.counts).toEqual({ doNext: 0, blocked: 0, waiting: 0 })
    expect(model.caseWork.scannedCaseCount).toBe(1)
  })

  it("shows each case exactly once across the whole page", () => {
    const entries = Object.values(todayScenarios)
    const model = build(entries)
    const placed = [
      ...model.caseWork.doNext,
      ...model.caseWork.blocked,
      ...todayWaitingGroups.flatMap(group => model.caseWork.waiting[group.id]),
    ].map(item => item.row.id)
    expect(new Set(placed).size).toBe(placed.length)
    // Every open case is somewhere; only the closed one is not.
    expect(placed).toHaveLength(entries.length - 1)
  })

  it("places a case with several blockers once, on its primary action", () => {
    // This case has three blockers and two attention items, and still appears
    // only where its chosen action puts it.
    const model = build([scenario("safetyPermissionInvalidated")])
    expect(scenario("safetyPermissionInvalidated").flow.blockers.length).toBeGreaterThan(1)
    expect(references(model.caseWork.doNext)).toEqual(["PR-2002"])
    expect(model.caseWork.blocked).toEqual([])
  })

  it("counts what it scanned, not what it placed", () => {
    const model = build(Object.values(todayScenarios))
    expect(model.caseWork.scannedCaseCount).toBe(Object.values(todayScenarios).length)
  })
})

describe("a realistic morning", () => {
  it("leads with safety, then admin work, then the journey, then progression", () => {
    const model = build([
      todayScenarios.progressionCloseCase,
      todayScenarios.journeyRequestEvidence,
      todayScenarios.adminReviewNewCase,
      todayScenarios.safetyEvidenceThreat,
    ])
    expect(references(model.caseWork.doNext)).toEqual(["PR-2001", "PR-2003", "PR-2006", "PR-2009"])
  })

  it("puts the overdue follow-up ahead of the undated request in the same band", () => {
    const model = build([todayScenarios.journeyRequestEvidence, todayScenarios.journeyFollowUpGoogleOverdue])
    expect(references(model.caseWork.doNext)).toEqual(["PR-2007", "PR-2006"])
  })
})

// ---------------------------------------------------------------------------
// Failing closed
// ---------------------------------------------------------------------------

describe("when the scan could not see every case", () => {
  const partial = () => build(Object.values(todayScenarios), { complete: false })

  it("says so, and carries the bound it stopped at", () => {
    const model = partial()
    expect(model.caseWork.complete).toBe(false)
    expect(model.caseWork.scanLimit).toBe(TODAY_CASE_SCAN_LIMIT)
  })

  it("is never described as a clear day", () => {
    const model = build([], { complete: false })
    expect(model.summary.clear).toBe(false)
  })

  it("still answers for the work that is not case work", () => {
    const model = build([], {
      complete: false,
      dashboardFacts: dashboard({ needsAttention: { paymentExceptions: { count: 2 } } }),
    })
    expect(model.operational.flatMap(group => group.queues).map(queue => queue.key)).toEqual(["payment_exceptions"])
    expect(model.management.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// The rest of the day
// ---------------------------------------------------------------------------

describe("operational exception queues", () => {
  it("shows only the queues that have something in them", () => {
    const model = build([], {
      dashboardFacts: dashboard({
        needsAttention: { unassignedEnquiries: { count: 3 }, failedJobs: { count: 5 }, paymentExceptions: { count: 0 } },
      }),
    })
    expect(model.operational.map(group => group.id)).toEqual(["intake", "platform"])
    expect(model.operational.flatMap(group => group.queues).map(queue => [queue.key, queue.count])).toEqual([
      ["unassigned_enquiries", 3],
      ["failed_jobs", 5],
    ])
  })

  it("produces nothing at all when every queue is empty", () => {
    expect(build([]).operational).toEqual([])
    expect(build([]).summary.operationalQueues).toBe(0)
  })

  it("links each queue to the report that holds the records, for the current day", () => {
    const model = build([], { dashboardFacts: dashboard({ needsAttention: { failedCustomerEmail: { count: 1 } } }) })
    expect(model.operational[0].queues[0].href).toContain("/reports/failed_customer_email")
    expect(model.operational[0].queues[0].href).toContain("preset=today")
  })

  it("takes the count from the dashboard rather than recounting anything", () => {
    const model = build([], { dashboardFacts: dashboard({ needsAttention: { missedGuardChecks: { count: 7 } } }) })
    expect(model.operational[0].queues[0].count).toBe(7)
  })
})

describe("today's Guard checks", () => {
  it("says the schedule is not configured rather than showing an empty list", () => {
    expect(build([]).guard).toEqual({ scheduleConfigured: false, windows: [] })
  })

  it("names each window and links to the existing check", () => {
    const model = build([], {
      dashboardFacts: dashboard({
        monitoringScheduleConfigured: true,
        secondary: { todayWindows: [{ id: "window-1", windowCode: "MORNING", state: "PENDING" }] },
      }),
    })
    expect(model.guard).toEqual({
      scheduleConfigured: true,
      windows: [{ id: "window-1", label: "Morning", state: "PENDING", href: "/guard/checks/window-1" }],
    })
  })

  it("invents no obligations when the schedule is configured but nothing is due", () => {
    const model = build([], { dashboardFacts: dashboard({ monitoringScheduleConfigured: true }) })
    expect(model.guard).toEqual({ scheduleConfigured: true, windows: [] })
  })
})

describe("the platform", () => {
  it.each([
    ["HEALTHY", "HEALTHY"],
    ["LATE", "LATE"],
    ["NEVER_RUN", "NEVER_RUN"],
  ] as const)("carries %s through unchanged", (reported, expected) => {
    const model = build([], { dashboardFacts: dashboard({ freshness: { status: reported, lastStartedAt: null, lateAfterSeconds: 93600 } }) })
    expect(model.health.status).toBe(expected)
  })

  it("calls an unreported status unknown rather than healthy", () => {
    expect(build([], { dashboardFacts: dashboard({ freshness: {} }) }).health.status).toBe("UNKNOWN")
    expect(build([], { dashboardFacts: dashboard({ freshness: undefined }) }).health.status).toBe("UNKNOWN")
  })

  it("reports the existing threshold rather than one of its own", () => {
    expect(build([]).health.lateAfterSeconds).toBe(93600)
  })
})

describe("the management snapshot", () => {
  it("keeps currencies apart instead of converting them", () => {
    const net = build([]).management.find(entry => entry.key === "collected_net")
    expect(net?.value).toBe("1,250.00 GBP · 300.00 USD")
  })

  it("reports paid and included Guard separately rather than as one number", () => {
    const values = Object.fromEntries(build([]).management.map(entry => [entry.key, entry.value]))
    expect(values.guard_locations_paid_active).toBe("6")
    expect(values.guard_locations_included_active).toBe("2")
    expect(build([]).management.some(entry => entry.value === "8")).toBe(false)
  })

  it("uses the existing coverage wording for check coverage", () => {
    const coverage = build([]).management.find(entry => entry.key === "check_coverage_completed")
    expect(coverage?.value).toBe("1 / 2 (50%)")
  })

  it("links every figure to the report that still owns it", () => {
    for (const figure of build([]).management) {
      expect(figure.href).toContain(`/reports/${figure.key}`)
    }
  })
})

describe("the summary line", () => {
  it("counts the real work, not what the page displays", () => {
    const model = build(Object.values(todayScenarios), {
      dashboardFacts: dashboard({ needsAttention: { failedJobs: { count: 2 } } }),
    })
    expect(model.summary).toEqual({
      needYou: model.caseWork.counts.doNext,
      blocked: model.caseWork.counts.blocked,
      waiting: model.caseWork.counts.waiting,
      operationalQueues: 1,
      clear: false,
    })
    expect(model.summary.needYou).toBeGreaterThan(5)
  })

  it("is clear only when there is nothing anywhere", () => {
    expect(build([]).summary.clear).toBe(true)
    expect(build([todayScenarios.waitingOnGoogle]).summary.clear).toBe(false)
    expect(build([], { dashboardFacts: dashboard({ needsAttention: { failedJobs: { count: 1 } } }) }).summary.clear).toBe(false)
    expect(build([], {
      dashboardFacts: dashboard({
        monitoringScheduleConfigured: true,
        secondary: { todayWindows: [{ id: "window-1", windowCode: "EVENING", state: "PENDING" }] },
      }),
    }).summary.clear).toBe(false)
  })

  it("records the instant the whole page was built against", () => {
    expect(build([]).generatedAt).toBe(NOW.toISOString())
  })
})

describe("coming up", () => {
  it("passes real recorded deadlines through and manufactures none", () => {
    expect(build([]).upcoming).toEqual([])
    const deadline = { id: "task-1", title: "Send the pack", dueAt: LATER, caseId: "case-1", reference: "PR-9" }
    expect(build([], { dashboardFacts: dashboard({ secondary: { upcomingDeadlines: [deadline] } }) }).upcoming)
      .toEqual([deadline])
  })
})
