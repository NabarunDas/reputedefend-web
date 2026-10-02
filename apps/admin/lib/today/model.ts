/**
 * What an operator has to do, worked out once from facts that already exist.
 *
 * Today used to open with nineteen metric cards and a date-range control. It
 * answered "how is the business doing" before "what do I do now", which is
 * the wrong order for the first screen of a working day. This module builds
 * the other answer: the open cases that need ProfileRelaunch, the ones that
 * are stuck, the ones nobody should keep reopening because the ball is with
 * somebody else, and the non-case queues that still need clearing.
 *
 * It invents nothing. The priority is UX-1's: the band the resolver already
 * chose the action by, carried out on the action itself. The dates are the
 * ones the case actually records. The operational counts are the dashboard's
 * own report predicates, untouched. There is no urgency score, no weighting
 * by revenue or age, and no service level — a thing is overdue when a
 * recorded date has passed and at no other time.
 *
 * Everything here is pure. The reads live in `load.ts`, which hands this
 * function the facts and one `now`.
 */

import { priorityBands } from "../case-flow/actions"
import { coverageLabel, formatAmountGroups, periodHref, reportLabels, type ReportKey } from "../reports/model"
import type { CaseRow } from "../cases/model"
import type { CaseFlowModel, CaseNextAction } from "../case-flow/model"

// ---------------------------------------------------------------------------
// Dashboard facts, as Today reads them
// ---------------------------------------------------------------------------

export type DashboardCount = {
  count?: number
  numerator?: number
  denominator?: number
  percentage?: number | null
  amounts?: Array<{ currency: string; amountMinor: number }>
}

export type DashboardFacts = {
  status?: string
  computedAt?: string
  timezone?: string
  freshness?: { status?: string; lastStartedAt?: string | null; lateAfterSeconds?: number }
  monitoringScheduleConfigured?: boolean
  needsAttention?: Record<string, DashboardCount>
  metrics?: Record<string, DashboardCount>
  secondary?: {
    upcomingDeadlines?: Array<{ id: string; title: string; dueAt: string; caseId: string; reference: string }>
    todayWindows?: Array<{ id: string; windowCode: string; state: string }>
  }
}

/**
 * Today never varies the period. Operational work is current work, so the
 * drill-down links carry the preset the dashboard was read with and nothing
 * a querystring could change.
 */
const todayPeriod = { preset: "today" as const, startDate: null, endDate: null }

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Who the case is waiting on, as the Waiting section groups them. */
export type TodayWaitingGroupId = "CUSTOMER" | "GOOGLE" | "PAYMENT_PROVIDER" | "SYSTEM"

export const todayWaitingGroups: Array<{ id: TodayWaitingGroupId; label: string }> = [
  { id: "CUSTOMER", label: "Waiting on customers" },
  { id: "GOOGLE", label: "Waiting on Google" },
  { id: "PAYMENT_PROVIDER", label: "Waiting on the payment provider" },
  { id: "SYSTEM", label: "Waiting on systems" },
]

/**
 * One case in one position. The action is non-null by construction: it is
 * what decided which section the case belongs in.
 */
export type TodayCaseItem = {
  row: CaseRow
  flow: CaseFlowModel
  action: CaseNextAction
}

export type TodayCaseWork = {
  /** False when there were more open cases than the scan is allowed to read. */
  complete: boolean
  scannedCaseCount: number
  scanLimit: number
  doNext: TodayCaseItem[]
  blocked: TodayCaseItem[]
  waiting: Record<TodayWaitingGroupId, TodayCaseItem[]>
  counts: { doNext: number; blocked: number; waiting: number }
}

export type TodayOperationalQueue = {
  key: ReportKey
  label: string
  count: number
  href: string
}

export type TodayOperationalGroup = {
  id: string
  label: string
  queues: TodayOperationalQueue[]
}

export type TodayGuardWindow = {
  id: string
  label: string
  state: string
  href: string
}

export type TodayGuard = {
  scheduleConfigured: boolean
  windows: TodayGuardWindow[]
}

export type TodayUpcomingItem = {
  id: string
  title: string
  dueAt: string
  caseId: string
  reference: string
}

export type TodayHealthStatus = "HEALTHY" | "LATE" | "NEVER_RUN" | "UNKNOWN"

export type TodayHealth = {
  status: TodayHealthStatus
  lastStartedAt: string | null
  lateAfterSeconds: number | null
}

export type TodayManagementEntry = {
  key: ReportKey
  label: string
  value: string
  href: string
}

export type TodaySummary = {
  needYou: number
  blocked: number
  waiting: number
  operationalQueues: number
  /**
   * Outstanding Guard checks for the current London date: pending or claimed,
   * and anything the dashboard reports that is not a known finished state.
   * Completed and cancelled checks are not work. This is not an exception count.
   */
  guardChecksDue: number
  /**
   * True when there is no current business work: no case to do, none blocked,
   * none waiting, no exception queue and no outstanding Guard check. It says
   * nothing about platform health, whether a schedule is configured, or
   * whether a future deadline exists. Those are shown on their own.
   */
  clear: boolean
}

export type TodayWorkModel = {
  generatedAt: string
  summary: TodaySummary
  health: TodayHealth
  caseWork: TodayCaseWork
  operational: TodayOperationalGroup[]
  guard: TodayGuard
  upcoming: TodayUpcomingItem[]
  management: TodayManagementEntry[]
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * The order cases are worked in.
 *
 * The band is UX-1's and is not re-derived here. Inside one band the only
 * things allowed to break the tie are facts the case already records: an
 * action whose recorded date has passed comes before one whose date is still
 * ahead, a dated action comes before an undated one, and anything still tied
 * keeps the order the Cases list gave it. The case record's own
 * LOW/NORMAL/HIGH/URGENT is deliberately not consulted — it is metadata an
 * operator sets, not a position in the workflow.
 */
function compareWork(a: TodayCaseItem, b: TodayCaseItem, index: Map<string, number>): number {
  const band = priorityBands[a.action.priorityBand] - priorityBands[b.action.priorityBand]
  if (band !== 0) return band

  if (a.action.overdue !== b.action.overdue) return a.action.overdue ? -1 : 1

  const left = a.action.dueAt, right = b.action.dueAt
  if (left && right && left !== right) return left < right ? -1 : 1
  if (left && !right) return -1
  if (!left && right) return 1

  return (index.get(a.row.id) ?? 0) - (index.get(b.row.id) ?? 0)
}

function ordered(items: TodayCaseItem[], index: Map<string, number>): TodayCaseItem[] {
  return [...items].sort((a, b) => compareWork(a, b, index))
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Where one case belongs, from its primary action alone.
 *
 * A case appears exactly once. It may well have blockers, attention items
 * and an overdue task all at the same time, but UX-1 already reduced that to
 * one recommendation and Today shows the case at that one position. The
 * supporting trouble becomes a count on the row.
 */
function placement(action: CaseNextAction): "DO_NEXT" | "BLOCKED" | TodayWaitingGroupId {
  if (action.state === "BLOCKED") return "BLOCKED"
  if (action.state === "ACTION_REQUIRED" || action.state === "READY") {
    if (action.owner === "ADMIN") return "DO_NEXT"
  }
  // Anything left is somebody else's move: either an explicit wait, or an
  // actionable step whose owner is not ProfileRelaunch. Grouping it by owner
  // keeps the case visible without implying we can clear it. ADMIN cannot
  // reach here with a wait in the current catalogue; if it ever does, the
  // case is still shown rather than dropped.
  return action.owner === "CUSTOMER" || action.owner === "GOOGLE" || action.owner === "PAYMENT_PROVIDER"
    ? action.owner
    : "SYSTEM"
}

function buildCaseWork(
  rows: readonly CaseRow[],
  flows: ReadonlyMap<string, CaseFlowModel>,
  complete: boolean,
  scanLimit: number,
): TodayCaseWork {
  const index = new Map(rows.map((row, position) => [row.id, position]))
  const doNext: TodayCaseItem[] = []
  const blocked: TodayCaseItem[] = []
  const waiting: Record<TodayWaitingGroupId, TodayCaseItem[]> = {
    CUSTOMER: [], GOOGLE: [], PAYMENT_PROVIDER: [], SYSTEM: [],
  }

  for (const row of rows) {
    const flow = flows.get(row.id)
    // A finished case has no action and no place on a work list. It is still
    // in Cases and in Reports.
    if (!flow || flow.caseComplete || !flow.primaryAction) continue
    const item: TodayCaseItem = { row, flow, action: flow.primaryAction }
    const where = placement(item.action)
    if (where === "DO_NEXT") doNext.push(item)
    else if (where === "BLOCKED") blocked.push(item)
    else waiting[where].push(item)
  }

  const waitingOrdered: Record<TodayWaitingGroupId, TodayCaseItem[]> = {
    CUSTOMER: ordered(waiting.CUSTOMER, index),
    GOOGLE: ordered(waiting.GOOGLE, index),
    PAYMENT_PROVIDER: ordered(waiting.PAYMENT_PROVIDER, index),
    SYSTEM: ordered(waiting.SYSTEM, index),
  }
  const waitingCount = todayWaitingGroups.reduce((total, group) => total + waitingOrdered[group.id].length, 0)

  return {
    complete,
    scannedCaseCount: rows.length,
    scanLimit,
    doNext: ordered(doNext, index),
    blocked: ordered(blocked, index),
    waiting: waitingOrdered,
    counts: { doNext: doNext.length, blocked: blocked.length, waiting: waitingCount },
  }
}

// ---------------------------------------------------------------------------
// Everything that is not a case
// ---------------------------------------------------------------------------

/**
 * The eleven exception queues, grouped so they read as areas of work rather
 * than as eleven equal cards. The counts are the dashboard's; the predicate
 * behind each one lives in `admin_dashboard_today_v1` and is not restated
 * here in TypeScript.
 */
const operationalGroups: Array<{ id: string; label: string; queues: Array<[string, ReportKey]> }> = [
  { id: "intake", label: "Intake", queues: [["unassignedEnquiries", "unassigned_enquiries"]] },
  {
    id: "guard",
    label: "Guard exceptions",
    queues: [
      ["missedGuardChecks", "missed_guard_checks"],
      ["unreviewedGuardAlerts", "unreviewed_guard_alerts"],
      ["guardAlertsNeedsReview", "guard_alerts_needs_review"],
      ["guardBillingExceptions", "guard_billing_exceptions"],
    ],
  },
  {
    id: "contact",
    label: "Contact",
    queues: [
      ["failedCustomerEmail", "failed_customer_email"],
      ["accessRecovery", "access_recovery"],
      ["contactRecovery", "contact_recovery"],
    ],
  },
  { id: "money", label: "Money", queues: [["paymentExceptions", "payment_exceptions"]] },
  { id: "platform", label: "Platform", queues: [["failedJobs", "failed_jobs"]] },
  { id: "case-work", label: "Case work", queues: [["overdueWork", "overdue_work"]] },
]

function buildOperational(needsAttention: Record<string, DashboardCount>): TodayOperationalGroup[] {
  const groups: TodayOperationalGroup[] = []
  for (const group of operationalGroups) {
    const queues = group.queues
      .map(([field, key]) => ({
        key,
        label: reportLabels[key],
        count: needsAttention[field]?.count ?? 0,
        href: periodHref(`/reports/${key}`, todayPeriod),
      }))
      // A queue with nothing in it is not work, and eleven zeroes are not a
      // dashboard worth reading.
      .filter(queue => queue.count > 0)
    if (queues.length > 0) groups.push({ id: group.id, label: group.label, queues })
  }
  return groups
}

const windowLabels: Record<string, string> = { MORNING: "Morning", EVENING: "Evening" }

/**
 * States a Guard obligation has finished in. The dashboard returns every
 * obligation for the London date, including these, because the report is a
 * record of the day. The workbench is a list of work, so a check that is
 * already done or was cancelled is not still something to do.
 *
 * Only these two are dropped. A state this build does not know stays visible:
 * hiding it would be the workbench deciding, on no evidence, that it was not
 * work.
 */
const finishedGuardStates = new Set(["COMPLETED", "CANCELLED"])

function buildGuard(facts: DashboardFacts): TodayGuard {
  const configured = facts.monitoringScheduleConfigured === true
  if (!configured) return { scheduleConfigured: false, windows: [] }
  return {
    scheduleConfigured: true,
    windows: (facts.secondary?.todayWindows ?? [])
      .filter(window => !finishedGuardStates.has(window.state))
      .map(window => ({
        id: window.id,
        label: windowLabels[window.windowCode] ?? window.windowCode,
        state: window.state,
        href: `/guard/checks/${window.id}`,
      })),
  }
}

const healthStatuses: TodayHealthStatus[] = ["HEALTHY", "LATE", "NEVER_RUN"]

function buildHealth(facts: DashboardFacts): TodayHealth {
  const reported = facts.freshness?.status
  const status = healthStatuses.find(entry => entry === reported) ?? "UNKNOWN"
  return {
    status,
    lastStartedAt: facts.freshness?.lastStartedAt ?? null,
    lateAfterSeconds: facts.freshness?.lateAfterSeconds ?? null,
  }
}

/** Counts, money and coverage, each formatted by the helper that owns it. */
function metricValue(key: ReportKey, entry: DashboardCount | undefined): string {
  if (key === "check_coverage_completed") return coverageLabel(entry)
  if (entry?.amounts) return formatAmountGroups(entry.amounts, "None")
  return String(entry?.count ?? 0)
}

const managementEntries: Array<[string, ReportKey, string]> = [
  ["openCases", "open_cases", "Open cases"],
  ["openEnquiries", "open_enquiries", "Open enquiries"],
  ["clientsActiveService", "clients_active_service", "Active service clients"],
  ["collectedNet", "collected_net", "Net collections today"],
  ["outstandingMoney", "outstanding_money", "Outstanding money"],
  ["guardPaidActive", "guard_locations_paid_active", "Active Guard (paid)"],
  ["guardIncludedActive", "guard_locations_included_active", "Active Guard (included)"],
  ["guardRecurring", "guard_recurring", "Guard recurring commitment"],
  ["checkCoverage", "check_coverage_completed", "Guard check coverage today"],
]

/**
 * Paid and included Guard are listed separately rather than summed. They are
 * two different commercial arrangements, and one number standing for both is
 * a figure nobody could act on.
 */
function buildManagement(metrics: Record<string, DashboardCount>): TodayManagementEntry[] {
  return managementEntries.map(([field, key, label]) => ({
    key,
    label,
    value: metricValue(key, metrics[field]),
    href: periodHref(`/reports/${key}`, todayPeriod),
  }))
}

// ---------------------------------------------------------------------------

export function buildTodayWorkModel(input: {
  now: Date
  dashboard: DashboardFacts
  rows: readonly CaseRow[]
  flows: ReadonlyMap<string, CaseFlowModel>
  complete: boolean
  scanLimit: number
}): TodayWorkModel {
  const caseWork = buildCaseWork(input.rows, input.flows, input.complete, input.scanLimit)
  const operational = buildOperational(input.dashboard.needsAttention ?? {})
  const guard = buildGuard(input.dashboard)
  const upcoming = input.dashboard.secondary?.upcomingDeadlines ?? []

  const queueCount = operational.reduce((total, group) => total + group.queues.length, 0)

  return {
    generatedAt: input.now.toISOString(),
    summary: {
      needYou: caseWork.counts.doNext,
      blocked: caseWork.counts.blocked,
      waiting: caseWork.counts.waiting,
      operationalQueues: queueCount,
      guardChecksDue: guard.windows.length,
      clear:
        caseWork.complete &&
        caseWork.counts.doNext === 0 &&
        caseWork.counts.blocked === 0 &&
        caseWork.counts.waiting === 0 &&
        queueCount === 0 &&
        guard.windows.length === 0,
    },
    health: buildHealth(input.dashboard),
    caseWork,
    operational,
    guard,
    upcoming: [...upcoming],
    management: buildManagement(input.dashboard.metrics ?? {}),
  }
}
