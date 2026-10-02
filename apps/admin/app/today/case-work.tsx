/**
 * The case work on the workbench: what to do, what is stuck, what is with
 * somebody else.
 *
 * Each case appears once, in one of the three, at the position its UX-1
 * primary action put it. Nothing here re-reads a stage, re-ranks a case or
 * decides that a wait has gone on long enough — there is no service level in
 * this product and a list that implied one would be lying.
 *
 * The visual difference between the three sections is doing real work. A case
 * the operator can finish gets the action as its link, because that is the
 * thing to click. A blocked case and a waiting case do not: their link opens
 * the case so the operator can see the situation, and nothing on the row
 * pretends to be a step they can complete.
 */

import Link from "next/link"
import type { ReactNode } from "react"
import { ukDate } from "@/lib/admin/activity"
import type { TodayCaseItem, TodayCaseWork } from "@/lib/today/model"
import { todayWaitingGroups } from "@/lib/today/model"
import { Badge, EmptyState } from "../ui"
import { actionStatePresentation, actionTarget, caseAttentionNotices, ownerSentence } from "../cases/presentation"

/** How many of each list the home page shows before sending the operator on. */
export const todayDisplayLimits = { doNext: 10, blocked: 5, waiting: 5 } as const

type Mode = "ACTIONABLE" | "BLOCKED" | "WAITING"

/**
 * One case, as one row.
 *
 * `ACTIONABLE` is the only mode that links the action, so a case nobody can
 * currently advance never carries a call to action. The rest of the row is
 * identical in all three modes, because the questions an operator asks about
 * a case do not change with its state.
 */
export function TodayCaseItemRow({ item, mode, level = 3 }: { item: TodayCaseItem; mode: Mode; level?: 3 | 4 }) {
  const { row, flow, action } = item
  const heading = `today-case-${row.id}`
  const reference = `today-case-ref-${row.id}`
  const target = mode === "ACTIONABLE" ? actionTarget(action, `/cases/${row.id}`) : null
  const notices = caseAttentionNotices(flow)
  const state = actionStatePresentation[action.state]
  const Headline = level === 3 ? "h3" : "h4"

  return <li>
    {/* Named by the case and then the work, so a list of these reads as
        "RD-1024, review uploaded evidence" rather than ten identical rows. */}
    <article className={`today-case today-case-${mode.toLowerCase()}`} aria-labelledby={`${reference} ${heading}`}>
      <Headline className="today-case-headline" id={heading}>
        {target ? <Link href={target.href}>{action.label}</Link> : action.label}
      </Headline>
      <p className="today-case-identity">
        <Link id={reference} href={`/cases/${row.id}`}>{row.reference}</Link>
        <span className="today-case-business"> · {row.business}</span>
      </p>
      <p className="today-case-meta muted">
        {flow.phaseLabel} · {mode === "ACTIONABLE" ? state.word : ownerSentence(action)}
      </p>
      <TodayCaseDue item={item} />
      {notices.length > 0 && <p className="today-case-notices">
        {notices.map(notice => (
          <span key={notice.text} className={`queue-notice queue-notice-${notice.tone}`}>{notice.text}</span>
        ))}
      </p>}
    </article>
  </li>
}

/**
 * The action's own recorded date. A case with no date shows none: UX-1 never
 * invents one, so neither does the workbench.
 */
function TodayCaseDue({ item }: { item: TodayCaseItem }): ReactNode {
  if (!item.action.dueAt) return null
  const word = item.action.overdue ? "Overdue since" : "Due"
  return <p className={`today-case-due${item.action.overdue ? " queue-overdue" : ""}`}>
    {word} {ukDate(item.action.dueAt)}
  </p>
}

function TodayCaseList({ items, mode, limit }: { items: TodayCaseItem[]; mode: Mode; limit: number }) {
  return <ul className="today-case-list">
    {items.slice(0, limit).map(item => <TodayCaseItemRow key={item.row.id} item={item} mode={mode} />)}
  </ul>
}

/**
 * `10 of 18 shown`, and where the other eight are.
 *
 * The page displays a working amount; the prioritisation behind it ran over
 * every case that was scanned, so the count is the honest one rather than the
 * length of what is on screen.
 */
function TodayShowing({ shown, total, href, label }: { shown: number; total: number; href: string; label: string }) {
  if (total === 0) return null
  return <p className="today-showing muted">
    {shown < total && <>{shown} of {total} shown. </>}
    <Link href={href}>{label}</Link>
  </p>
}

/**
 * What the page shows instead of case work when it could not read every case.
 *
 * Ordering cases against each other only means something when all of them
 * were looked at. Past the scan bound they were not, and the case that went
 * unread could be the Safety one, so the partial ranking is not shown at all.
 * A list captioned "do these first" is believed; a caveat above it is not
 * enough to stop that.
 */
export function TodayScanNotice({ caseWork }: { caseWork: TodayCaseWork }) {
  if (caseWork.complete) return null
  return <section className="panel today-primary" aria-labelledby="today-scan-limit">
    <h2 id="today-scan-limit">Case work cannot be prioritised today</h2>
    <p className="notice-danger" role="status">
      More than {caseWork.scanLimit} cases are open, which is more than this page can read, so it cannot
      say which of them matters most. No case ordering is shown rather than a partial one.
    </p>
    <p><Link className="button-link" href="/cases">View all cases</Link></p>
  </section>
}

export function TodayDoNext({ caseWork }: { caseWork: TodayCaseWork }) {
  return <section className="panel today-primary" aria-labelledby="today-do-next">
    <h2 id="today-do-next">Do next</h2>
    {caseWork.counts.doNext === 0
      ? <EmptyState>No open case is waiting on ProfileRelaunch.</EmptyState>
      : <>
        <TodayCaseList items={caseWork.doNext} mode="ACTIONABLE" limit={todayDisplayLimits.doNext} />
        <TodayShowing
          shown={Math.min(caseWork.counts.doNext, todayDisplayLimits.doNext)}
          total={caseWork.counts.doNext}
          href="/cases"
          label="View all cases"
        />
      </>}
  </section>
}

/**
 * Blocked cases, kept out of the work list.
 *
 * A blocked case is not a task somebody can pick up and finish, so it is not
 * shown as one. It is also not the same thing as a safety problem: the band
 * the action came from already decided how urgent it is, and this section is
 * about what sort of attention it needs, not how much.
 */
export function TodayBlocked({ caseWork }: { caseWork: TodayCaseWork }) {
  if (caseWork.counts.blocked === 0) return null
  return <section className="panel today-blocked" aria-labelledby="today-blocked">
    <h2 id="today-blocked">Blocked · needs intervention</h2>
    <TodayCaseList items={caseWork.blocked} mode="BLOCKED" limit={todayDisplayLimits.blocked} />
    <TodayShowing
      shown={Math.min(caseWork.counts.blocked, todayDisplayLimits.blocked)}
      total={caseWork.counts.blocked}
      href="/cases"
      label="View all cases"
    />
  </section>
}

/**
 * Cases where the next move is somebody else's.
 *
 * Grouped by who, because "waiting on the customer" and "waiting on Google"
 * are different situations with different remedies. No row suggests chasing:
 * a wait becomes late only when a date the case actually records has passed,
 * and that is said on the row itself when it happens.
 */
export function TodayWaiting({ caseWork }: { caseWork: TodayCaseWork }) {
  if (caseWork.counts.waiting === 0) return null
  const groups = todayWaitingGroups.filter(group => caseWork.waiting[group.id].length > 0)
  return <section className="panel today-waiting" aria-labelledby="today-waiting">
    <h2 id="today-waiting">Waiting</h2>
    <p className="muted">Nothing here needs ProfileRelaunch yet.</p>
    {groups.map(group => {
      const items = caseWork.waiting[group.id]
      return <div key={group.id} className="today-waiting-group">
        <h3 className="today-waiting-heading">{group.label} <Badge tone="neutral">{items.length}</Badge></h3>
        <ul className="today-case-list">
          {items.slice(0, todayDisplayLimits.waiting).map(item => (
            <TodayCaseItemRow key={item.row.id} item={item} mode="WAITING" level={4} />
          ))}
        </ul>
        {items.length > todayDisplayLimits.waiting && <p className="today-showing muted">
          {todayDisplayLimits.waiting} of {items.length} shown. <Link href="/cases">View all cases</Link>
        </p>}
      </div>
    })}
  </section>
}
