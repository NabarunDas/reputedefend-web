import { CaseSummary } from "./case-summary"
import { attentionIntro, calmActiveCopy, presentCase } from "@/lib/portal/cases/model"
import type { CustomerDashboard } from "@/lib/portal/cases/parse"

export function PortalUnavailable() {
  return (
    <div className="portal-dashboard">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>We couldn&apos;t load your customer space</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
    </div>
  )
}

export function PortalHome({ dashboard }: { dashboard: CustomerDashboard }) {
  const attention = dashboard.attentionCases.map(presentCase)
  const recent = dashboard.recentCases.map(presentCase)
  const { activeCases, attentionCases, previousCases } = dashboard.summary
  return (
    <div className="portal-dashboard">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Welcome to My ProfileRelaunch</h1>
      <p className="lead">See what needs your attention and where your cases stand.</p>

      {attentionCases > 0 ? (
        <section className="attention-surface" aria-labelledby="attention-heading">
          <h2 id="attention-heading">Your attention is needed</h2>
          <p>{attentionIntro(attentionCases)}</p>
          <ul className="case-list">
            {attention.map(item => (
              <li key={item.reference}>
                <CaseSummary item={item} titleLevel={3} />
              </li>
            ))}
          </ul>
          {attentionCases > attention.length ? <p className="case-more"><a href="/portal/cases?view=active">View all active cases</a></p> : null}
        </section>
      ) : activeCases > 0 ? (
        <section className="calm-surface" aria-labelledby="calm-heading">
          <h2 id="calm-heading">Nothing needed from you right now</h2>
          <p>{calmActiveCopy(activeCases)}</p>
        </section>
      ) : (
        <section className="calm-surface" aria-labelledby="no-active-heading">
          <h2 id="no-active-heading">No active cases</h2>
          <p>
            {previousCases > 0
              ? "Your previous ProfileRelaunch cases are still available below."
              : "When you start a ProfileRelaunch case, it will appear here."}
          </p>
        </section>
      )}

      <section className="portal-summary-section" aria-label="Case summary">
        <dl className="portal-summary">
          <div>
            <dt>Active cases</dt>
            <dd>{activeCases}</dd>
          </div>
          <div>
            <dt>Needs your attention</dt>
            <dd>{attentionCases}</dd>
          </div>
          <div>
            <dt>Previous cases</dt>
            <dd>{previousCases}</dd>
          </div>
        </dl>
      </section>

      {recent.length > 0 ? (
        <section className="portal-cases-section" aria-labelledby="your-cases-heading">
          <h2 id="your-cases-heading">Your cases</h2>
          <ul className="case-list">
            {recent.map(item => (
              <li key={item.reference}>
                <CaseSummary item={item} titleLevel={3} />
              </li>
            ))}
          </ul>
          <p className="case-more"><a href="/portal/cases?view=all">View all cases</a></p>
        </section>
      ) : null}
    </div>
  )
}
