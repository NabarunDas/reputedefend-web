import type { PresentedCase } from "@/lib/portal/cases/model"

const STATE_CLASS: Record<PresentedCase["state"], string> = {
  ACTION_NEEDED: "status-action-needed",
  RECEIVED: "status-received",
  IN_PROGRESS: "status-in-progress",
  SUBMITTED: "status-submitted",
  WAITING_GOOGLE: "status-waiting-google",
  COMPLETE: "status-complete",
  CANCELLED: "status-cancelled",
}

function caseGroup(state: PresentedCase["state"]) {
  if (state === "COMPLETE") return "complete"
  if (state === "CANCELLED") return "cancelled"
  return "active"
}

/** Shared case summary. The card itself is not a link; "View case" is. */
export function CaseSummary({ item, titleLevel = 2 }: { item: PresentedCase; titleLevel?: 2 | 3 }) {
  const Title = titleLevel === 3 ? "h3" : "h2"
  return (
    <article className={`case-card case-card-${caseGroup(item.state)}`}>
      <div className="case-card-head">
        <div className="case-card-identity">
          <Title className="case-title">{item.businessName}</Title>
          {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
          <p className="case-meta">
            <span className="case-type">{item.caseTypeLabel}</span>
            {item.serviceLabel ? <span className="case-service">{item.serviceLabel}</span> : null}
          </p>
        </div>
        <p className={`status-badge ${STATE_CLASS[item.state]}`}>{item.statusLabel}</p>
      </div>
      <p className="case-ref">{item.reference}</p>
      <p className="case-started">{item.startedLabel}</p>
      {item.attention.length > 0 ? (
        <ul className="attention-list">
          {item.attention.map((attention, index) => (
            <li key={`${attention.label}-${index}`}>
              <p className="attention-label">{attention.label}</p>
              {attention.timing ? <p className="attention-timing">{attention.timing}</p> : null}
              <p className="attention-support">{attention.support}</p>
              {attention.href && attention.actionLabel ? (
                <p className="attention-action">
                  <a href={attention.href}>{attention.actionLabel}</a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="case-open">
        <a className="portal-button" href={`/portal/cases/${item.reference}`}>
          <span aria-hidden="true">View case</span>
          <span className="sr-only">View case {item.reference}</span>
        </a>
      </p>
    </article>
  )
}
