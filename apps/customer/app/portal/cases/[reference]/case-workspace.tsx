import { caseTypeLabel, customerCaseState, statusLabel } from "@/lib/portal/cases/model"
import { presentDetailRows, presentNextStep, presentProgress, presentTimeline, type CaseCommerce, type PresentedTimelineEntry } from "@/lib/portal/cases/workspace"
import type { CustomerCaseDetail } from "@/lib/portal/cases/parse"

const STATE_CLASS = {
  ACTION_NEEDED: "status-action-needed",
  RECEIVED: "status-received",
  IN_PROGRESS: "status-in-progress",
  SUBMITTED: "status-submitted",
  WAITING_GOOGLE: "status-waiting-google",
  COMPLETE: "status-complete",
  CANCELLED: "status-cancelled",
} as const

const PREVIEW_UPDATES = 5

export function CaseUnavailable() {
  return (
    <div className="case-workspace state-panel">
      <h1>We couldn&apos;t load this case</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}

export function CaseWorkspace({
  detail,
  commerce = null,
  packHref = null,
  packPublished,
}: {
  detail: CustomerCaseDetail
  commerce?: CaseCommerce | null
  packHref?: string | null
  packPublished?: boolean
}) {
  const item = detail.case
  const state = customerCaseState(item.status, item.workStage, item.attentionItems.length)
  const next = presentNextStep({ ...item, packHref })
  const progress = presentProgress(item.status, item.workStage, {
    serviceTrack: item.serviceTrack,
    outcomeCode: item.outcomeCode,
    timeline: detail.timeline,
    packPublished,
  })
  const timeline = presentTimeline(detail)
  const details = presentDetailRows(detail, commerce)
  const recent = timeline.slice(0, PREVIEW_UPDATES)
  const older = timeline.slice(PREVIEW_UPDATES)
  return (
    <div className="case-workspace">
      <nav className="case-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/portal/cases">Cases</a></li>
          <li aria-current="page">{item.reference}</li>
        </ol>
      </nav>

      <header className="case-workspace-header">
        <h1>{caseTypeLabel(item.caseType)}</h1>
        <p className={`status-badge ${STATE_CLASS[state]}`}>{statusLabel(state)}</p>
      </header>

      <section className="case-details-section" aria-labelledby="details-heading">
        <h2 id="details-heading">Case details</h2>
        <dl className="case-details">
          {details.map(row => (
            <div key={row.term}>
              <dt>{row.term}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="attention-surface case-next" aria-labelledby="next-heading">
        <h2 id="next-heading">What happens next</h2>
        <h3>{next.title}</h3>
        {next.timing ? <p className="attention-timing">{next.timing}</p> : null}
        {next.body ? <p>{next.body}</p> : null}
        {next.support ? <p className="attention-support">{next.support}</p> : null}
        {next.href && next.actionLabel ? <p className="attention-action"><a className="portal-button" href={next.href}>{next.actionLabel}</a></p> : null}
        {next.alsoWaiting ? <p>{next.alsoWaiting}</p> : null}
        {next.remaining.length > 0 ? (
          <ul className="attention-list">
            {next.remaining.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}
          </ul>
        ) : null}
      </section>

      <nav className="case-actions" aria-label="Case sections">
        <a className="portal-button secondary" href={`/portal/cases/${item.reference}/documents`}>Documents and evidence</a>
        <a className="portal-button secondary" href={`/portal/cases/${item.reference}/service`}>Service and permissions</a>
        <a className="portal-button secondary" href={`/portal/cases/${item.reference}/payments`}>Payments for this case</a>
        <a className="portal-button secondary" href="/portal/messages">Case messages</a>
      </nav>

      {progress ? (
        <section className="case-progress-section" aria-labelledby="progress-heading">
          <h2 id="progress-heading">Progress</h2>
          <ol className="case-progress">
            {progress.map(step => (
              <li key={step.code} className={`case-progress-${step.position}`} {...(step.position === "current" ? { "aria-current": "step" as const } : {})}>
                <span className="case-progress-label">{step.label}</span>
                <span className={step.position === "current" ? "case-progress-now" : "sr-only"}>{step.text.replace(`${step.label}. `, "")}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="case-updates" aria-labelledby="updates-heading">
        <h2 id="updates-heading">Case updates</h2>
        <Timeline events={recent} />
        {older.length > 0 ? (
          <details className="timeline-more">
            <summary>Show all activity</summary>
            <Timeline events={older} />
          </details>
        ) : null}
        {detail.timelineTruncated ? <p>Showing the latest 20 case updates.</p> : null}
      </section>

      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}

function Timeline({ events }: { events: PresentedTimelineEntry[] }) {
  return (
    <ol className="case-timeline">
      {events.map((event, index) => (
        <li key={`${event.code}-${event.occurredAt}-${index}`}>
          <time dateTime={event.occurredAt}>{event.dateLabel}</time>
          <p>{event.message}</p>
          {event.separate ? <p className="timeline-note">Separate event on this day.</p> : null}
        </li>
      ))}
    </ol>
  )
}
