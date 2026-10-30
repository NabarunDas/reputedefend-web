import { caseTypeLabel, customerCaseState, serviceLabel, statusLabel } from "@/lib/portal/cases/model"
import { presentDetailRows, presentNextStep, presentProgress, presentTimeline, progressContext, type CaseCommerce, type PresentedProgressStep, type PresentedTimelineEntry } from "@/lib/portal/cases/workspace"
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
  const next = presentNextStep({ ...item, packHref, timeline: detail.timeline })
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
  const current = progress?.find(step => step.position === "current") ?? null
  const preparationComplete = progress != null && progress.length > 0 && progress.every(step => step.position === "earlier")
  const service = serviceLabel(item.serviceTrack)
  const context = progressContext(item.serviceTrack)
  return (
    <div className="case-workspace">
      <nav className="case-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/portal/cases">Cases</a></li>
          <li aria-current="page">{item.reference}</li>
        </ol>
      </nav>

      <header className="case-workspace-header">
        <div className="case-summary-band">
          <div className="case-summary-identity">
            <p className="case-ref">{item.reference}</p>
            <h1>{caseTypeLabel(item.caseType)}</h1>
            <p className="case-identity-business">{item.businessName}</p>
            {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
            {service ? <p className="case-service">{service}</p> : null}
          </div>
          <div className="case-summary-status">
            <p className={`status-badge ${STATE_CLASS[state]}`}>{statusLabel(state)}</p>
            {current ? <p className="case-stage">Stage: {current.label}</p> : preparationComplete ? <p className="case-stage">Preparation complete</p> : null}
          </div>
        </div>
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
          {context ? <p className="case-progress-note">{context}</p> : null}
          <ol className="case-progress">
            {progress.map((step, index) => (
              <ProgressStep
                key={step.code}
                step={step}
                showState={step.position === "current" || (preparationComplete && index === progress.length - 1)}
              />
            ))}
          </ol>
        </section>
      ) : null}

      <section className="case-updates" aria-labelledby="updates-heading">
        <h2 id="updates-heading">Case updates</h2>
        <Timeline events={recent} />
        {older.length > 0 ? (
          <details className="timeline-more">
            <summary>Show earlier activity ({older.length})</summary>
            <Timeline events={older} />
          </details>
        ) : null}
        {detail.timelineTruncated ? <p>Showing the latest 20 case updates.</p> : null}
      </section>

      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}

function ProgressStep({ step, showState }: { step: PresentedProgressStep; showState: boolean }) {
  const owner = step.ownerLabel === "Your step" ? "you" : step.ownerLabel === "Recorded" ? "recorded" : "team"
  return (
    <li className={`case-progress-${step.position}`} {...(step.position === "current" ? { "aria-current": "step" as const } : {})}>
      <span className="case-progress-label">{step.label}</span>
      <span className={showState ? "case-progress-now" : "sr-only"}>{step.text.replace(`${step.label}. `, "")}</span>
      <span className={`case-progress-owner case-progress-owner-${owner}`}>{step.ownerLabel}</span>
    </li>
  )
}

function Timeline({ events }: { events: PresentedTimelineEntry[] }) {
  return (
    <ol className="case-timeline">
      {events.map((event, index) => (
        <li key={`${event.code}-${event.occurredAt}-${index}`}>
          <time dateTime={event.occurredAt}>{event.dateLabel}</time>
          <p>{event.message}</p>
        </li>
      ))}
    </ol>
  )
}
