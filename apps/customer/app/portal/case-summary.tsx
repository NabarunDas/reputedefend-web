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

/** Shared case summary. It is not a link: the case workspace is a later phase. */
export function CaseSummary({ item, titleLevel = 2 }: { item: PresentedCase; titleLevel?: 2 | 3 }) {
  const Title = titleLevel === 3 ? "h3" : "h2"
  return (
    <article className="case-card">
      <p className="case-ref">{item.reference}</p>
      <Title className="case-title">{item.caseTypeLabel}</Title>
      <p className="case-business">{item.businessName}</p>
      {item.locationName ? <p className="case-location">{item.locationName}</p> : null}
      <p className={`status-badge ${STATE_CLASS[item.state]}`}>{item.statusLabel}</p>
      {item.serviceLabel ? <p className="case-service">{item.serviceLabel}</p> : null}
      <p className="case-started">{item.startedLabel}</p>
      {item.attention.length > 0 ? (
        <ul className="attention-list">
          {item.attention.map((attention, index) => (
            <li key={`${attention.label}-${index}`}>
              <p className="attention-label">{attention.label}</p>
              {attention.timing ? <p className="attention-timing">{attention.timing}</p> : null}
              <p className="attention-support">{attention.support}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
