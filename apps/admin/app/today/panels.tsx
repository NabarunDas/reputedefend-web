/**
 * Everything on the workbench that is not a case.
 *
 * The summary at the top, the platform warning that only shows itself when
 * there is something wrong, the exception queues that still need clearing,
 * the Guard checks the schedule obliges us to do today, the deadlines that
 * are coming but are not today's work, and — last, quietly — the management
 * figures that used to be the whole page.
 *
 * Every number here is the dashboard's. The predicate behind each exception
 * count lives in `admin_dashboard_today_v1` and is not restated in
 * TypeScript, so a report and this page can never disagree about how many
 * there are.
 */

import Link from "next/link"
import { ukDate } from "@/lib/admin/activity"
import type {
  TodayGuard,
  TodayHealth,
  TodayManagementEntry,
  TodayOperationalGroup,
  TodaySummary as TodaySummaryFacts,
  TodayUpcomingItem,
} from "@/lib/today/model"
import { EmptyState } from "../ui"

/**
 * What the day holds, in one sentence of real counts.
 *
 * Zeroes are left out rather than listed: "0 cases are blocked" is not
 * information, and four of those in a row is how a summary stops being read.
 * When the case scan could not finish, the case counts are left out too,
 * because a count of a sample is not a count.
 */
export function TodaySummary({ summary, complete }: { summary: TodaySummaryFacts; complete: boolean }) {
  const parts: string[] = []
  if (complete) {
    if (summary.needYou > 0) parts.push(`${summary.needYou} ${plural(summary.needYou, "case")} ${summary.needYou === 1 ? "needs" : "need"} you`)
    if (summary.blocked > 0) parts.push(`${summary.blocked} ${summary.blocked === 1 ? "is" : "are"} blocked`)
    if (summary.waiting > 0) parts.push(`${summary.waiting} ${summary.waiting === 1 ? "is" : "are"} waiting externally`)
  } else {
    parts.push("Case work cannot be prioritised today")
  }
  if (summary.operationalQueues > 0) {
    parts.push(`${summary.operationalQueues} other operational ${plural(summary.operationalQueues, "queue")} ${summary.operationalQueues === 1 ? "needs" : "need"} attention`)
  }
  return <p className="today-summary" role="status">
    {parts.length > 0 ? parts.join(" · ") : "No case or operational work currently needs attention."}
  </p>
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}

/**
 * The platform, mentioned only to the extent that it deserves mentioning.
 *
 * A healthy worker is one quiet line. A late one is a warning, using the
 * existing Step 10 threshold and no new timeout of this page's invention. A
 * status the dashboard could not report is said to be unknown rather than
 * assumed to be fine.
 */
export function TodayHealthStrip({ health }: { health: TodayHealth }) {
  if (health.status === "HEALTHY") {
    return <p className="today-health muted">
      Background processing healthy{health.lastStartedAt ? ` · last run ${ukDate(health.lastStartedAt)}` : ""}.
    </p>
  }
  const message = health.status === "LATE"
    ? "Background processing is late: the existing Step 10 late threshold has been exceeded. Counts on this page may be behind."
    : health.status === "NEVER_RUN"
      ? "Background processing has never run. Counts on this page may be incomplete."
      : "Background processing status is unknown. Counts on this page cannot be confirmed current."
  return <p className="notice-danger today-health-warning" role="status">
    {message} {health.lastStartedAt && <>Last run {ukDate(health.lastStartedAt)}. </>}
    <Link href="/operations/jobs">Open operations</Link>
  </p>
}

/**
 * The exception queues, grouped and filtered to the ones that have anything
 * in them.
 *
 * Eleven equally sized cards, eight of them zero, is a dashboard rather than
 * a list of work. Each row here is a real count with the drill-down that
 * holds the actual records; the records themselves are not re-fetched to
 * reproduce the report inside this page.
 */
export function TodayOperationalQueues({ groups }: { groups: TodayOperationalGroup[] }) {
  return <section className="panel today-operational" aria-labelledby="today-operational">
    <h2 id="today-operational">Other operational work</h2>
    {groups.length === 0
      ? <EmptyState>No other operational exceptions need attention.</EmptyState>
      : <div className="today-queue-groups">
        {groups.map(group => <div key={group.id} className="today-queue-group">
          <h3 className="today-queue-heading">{group.label}</h3>
          <ul className="today-queue-list">
            {group.queues.map(queue => <li key={queue.key}>
              <span className="today-queue-count">{queue.count}</span>
              <span className="today-queue-label">{queue.label}</span>
              <Link className="today-queue-link" href={queue.href}>
                Open queue<span className="sr-only">: {queue.label}</span>
              </Link>
            </li>)}
          </ul>
        </div>)}
      </div>}
  </section>
}

/**
 * The monitoring obligations for the current London date.
 *
 * When no schedule is configured there are no obligations, and the page says
 * that rather than inventing some. These are commitments to meet, which is a
 * different thing from the Guard exceptions above: those are checks that
 * already went wrong.
 */
export function TodayGuardWork({ guard }: { guard: TodayGuard }) {
  return <section className="panel today-guard" aria-labelledby="today-guard">
    <h2 id="today-guard">Today&apos;s Guard checks</h2>
    {!guard.scheduleConfigured
      ? <p role="status">Monitoring schedule not configured.</p>
      : guard.windows.length === 0
        ? <EmptyState>No monitoring obligations for the current London date.</EmptyState>
        : <ul className="today-guard-list">
          {guard.windows.map(window => <li key={window.id}>
            <Link href={window.href}>{window.label} check</Link>
            <span className="today-guard-state muted"> · {windowState(window.state)}</span>
          </li>)}
        </ul>}
  </section>
}

const windowStates: Record<string, string> = {
  PENDING: "Not started",
  CLAIMED: "In progress",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
}

function windowState(state: string): string {
  return windowStates[state] ?? state
}

/**
 * Dates that are real and are not today.
 *
 * These come last among the work sections on purpose: a deadline next week
 * does not outrank a safety problem this morning merely because it has a
 * date attached to it.
 */
export function TodayUpcoming({ upcoming }: { upcoming: TodayUpcomingItem[] }) {
  return <section className="panel today-upcoming" aria-labelledby="today-upcoming">
    <h2 id="today-upcoming">Coming up</h2>
    {upcoming.length === 0
      ? <EmptyState>No future case deadlines are recorded.</EmptyState>
      : <ul className="attention-list">
        {upcoming.map(item => <li key={item.id}>
          <Link href={`/cases/${item.caseId}`}>{item.reference}: {item.title}</Link>
          <p className="muted">Due {ukDate(item.dueAt)}</p>
        </li>)}
      </ul>}
  </section>
}

/**
 * How the business is doing, below how the day is going.
 *
 * Collapsed by default and compact when opened. None of it is new: every
 * figure is a dashboard metric that the full report still holds, and nothing
 * on this page adds two unlike things together to make a tidier number.
 */
export function TodayManagementSnapshot({ management }: { management: TodayManagementEntry[] }) {
  return <section className="panel today-management" aria-labelledby="today-management">
    <h2 id="today-management">Management snapshot</h2>
    <details>
      <summary>Current business figures</summary>
      <dl className="today-management-list">
        {management.map(entry => <div key={entry.key} className="today-management-entry">
          <dt>{entry.label}</dt>
          <dd>
            <span className="today-management-value">{entry.value}</span>
            <Link href={entry.href}>Open report<span className="sr-only">: {entry.label}</span></Link>
          </dd>
        </div>)}
      </dl>
    </details>
    <p className="today-management-all">
      <Link href="/reports">Open reports</Link> for history, periods and the full set of figures.
    </p>
  </section>
}

/**
 * A clear day, said once.
 *
 * Six empty panels in a row is a worse way of saying "nothing to do" than one
 * sentence, so when there is genuinely no work this replaces all of them. The
 * missing schedule is still worth naming, because an empty Guard list and an
 * unconfigured one look the same and mean very different things.
 */
export function TodayClear({ guard }: { guard: TodayGuard }) {
  return <section className="panel today-primary" aria-labelledby="today-clear">
    <h2 id="today-clear">Nothing needs attention</h2>
    <p role="status">No case or operational work currently needs attention, and no Guard checks are due today.</p>
    {!guard.scheduleConfigured && <p className="muted">Monitoring schedule not configured.</p>}
  </section>
}
