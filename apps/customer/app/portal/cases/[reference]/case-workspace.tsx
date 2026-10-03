import { caseTypeLabel, customerCaseState, formatPortalDate, serviceLabel, statusLabel } from "@/lib/portal/cases/model"
import { presentDetailRows, presentNextStep, presentProgress, presentTimeline } from "@/lib/portal/cases/workspace"
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

export function CaseUnavailable() {
  return (
    <div className="case-workspace">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>We couldn&apos;t load this case</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}

export function CaseWorkspace({ detail }: { detail: CustomerCaseDetail }) {
  const item = detail.case
  const state = customerCaseState(item.status, item.workStage, item.attentionItems.length)
  const service = serviceLabel(item.serviceTrack)
  const next = presentNextStep(item)
  const progress = presentProgress(item.status, item.workStage)
  const timeline = presentTimeline(detail)
  const details = presentDetailRows(detail)
  return (
    <div className="case-workspace">
      <nav className="case-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/portal/cases">Cases</a></li>
          <li aria-current="page">{item.reference}</li>
        </ol>
      </nav>

      <header className="case-workspace-header">
        <p className="eyebrow">CUSTOMER PORTAL</p>
        <p className="case-ref">{item.reference}</p>
        <h1>{caseTypeLabel(item.caseType)}</h1>
        <p className="case-business">{item.businessName}</p>
        {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
        <p className={`status-badge ${STATE_CLASS[state]}`}>{statusLabel(state)}</p>
        {service ? <p className="case-service">{service}</p> : null}
        <p className="case-started">Started {formatPortalDate(item.submittedAt)}</p>
        {item.closedAt ? <p className="case-closed">Closed {formatPortalDate(item.closedAt)}</p> : null}
        <p className="case-documents-link"><a href={`/portal/cases/${item.reference}/documents`}>Documents and evidence</a></p>
        <p className="case-documents-link"><a href={`/portal/cases/${item.reference}/service`}>Service and permissions</a></p>
      </header>

      <section className="attention-surface case-next" aria-labelledby="next-heading">
        <h2 id="next-heading">What happens next</h2>
        <h3>{next.title}</h3>
        {next.timing ? <p className="attention-timing">{next.timing}</p> : null}
        {next.body ? <p>{next.body}</p> : null}
        {next.support ? <p className="attention-support">{next.support}</p> : null}
        {next.href && next.actionLabel ? <p className="attention-action"><a href={next.href}>{next.actionLabel}</a></p> : null}
        {next.alsoWaiting ? <p>{next.alsoWaiting}</p> : null}
        {next.remaining.length > 0 ? (
          <ul className="attention-list">
            {next.remaining.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}
          </ul>
        ) : null}
      </section>

      {progress ? (
        <section className="case-progress-section" aria-labelledby="progress-heading">
          <h2 id="progress-heading">Progress</h2>
          <ol className="case-progress">
            {progress.map(step => (
              <li key={step.code} className={`case-progress-${step.position}`} {...(step.position === "current" ? { "aria-current": "step" as const } : {})}>
                {step.text}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="case-updates" aria-labelledby="updates-heading">
        <h2 id="updates-heading">Case updates</h2>
        <ol className="case-timeline">
          {timeline.map((event, index) => (
            <li key={`${event.code}-${event.occurredAt}-${index}`}>
              <time dateTime={event.occurredAt}>{event.dateLabel}</time>
              <p>{event.message}</p>
            </li>
          ))}
        </ol>
        {detail.timelineTruncated ? <p>Showing the latest 20 case updates.</p> : null}
      </section>

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

      <p className="case-back"><a href="/portal/cases">Back to cases</a></p>
    </div>
  )
}
