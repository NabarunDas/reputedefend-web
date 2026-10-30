import { CaseSummary } from "./case-summary"
import { PageHeading, welcomeHeading } from "@/components/portal-ui"
import { attentionIntro, calmActiveCopy, presentCase, type PresentedCase } from "@/lib/portal/cases/model"
import type { CustomerDashboard } from "@/lib/portal/cases/parse"
import { brandSiteUrl } from "../../../../lib/brand"

function isPrevious(item: PresentedCase) {
  return item.state === "COMPLETE" || item.state === "CANCELLED"
}

function CaseList({ items }: { items: PresentedCase[] }) {
  return (
    <ul className="case-list">
      {items.map(item => (
        <li key={item.reference}>
          <CaseSummary item={item} titleLevel={3} />
        </li>
      ))}
    </ul>
  )
}

export function PortalUnavailable() {
  return (
    <div className="portal-dashboard state-panel">
      <h1>We couldn&apos;t load your customer space</h1>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
    </div>
  )
}

export function PortalHome({ dashboard, accountName = null }: { dashboard: CustomerDashboard; accountName?: string | null }) {
  const attention = dashboard.attentionCases.map(presentCase)
  const attentionRefs = new Set(attention.map(item => item.reference))
  const recent = dashboard.recentCases.map(presentCase).filter(item => !attentionRefs.has(item.reference))
  const activeRecent = recent.filter(item => !isPrevious(item))
  const previousRecent = recent.filter(isPrevious)
  const { activeCases, attentionCases, previousCases } = dashboard.summary
  const hasCases = activeCases + previousCases > 0
  const activeInCalm = attentionCases === 0 && activeCases > 0
  const showOtherActive = attentionCases > 0 && activeRecent.length > 0
  const showUnplacedActive = !activeInCalm && activeRecent.length > 0 && attentionCases === 0
  const hasBelow = showOtherActive || previousRecent.length > 0 || showUnplacedActive
  return (
    <div className="portal-dashboard">
      <PageHeading
        title={welcomeHeading(accountName)}
        lede="Here is where your cases stand, and the one step that needs you when there is one."
      />

      <div className="portal-main">
        {attentionCases > 0 ? (
          <section className="attention-surface" aria-labelledby="attention-heading">
            <h2 id="attention-heading">Your attention is needed</h2>
            <p>{attentionIntro(attentionCases)}</p>
            <CaseList items={attention} />
            {attentionCases > attention.length ? <p className="case-more"><a href="/portal/cases?view=active">View all active cases</a></p> : null}
          </section>
        ) : activeCases > 0 ? (
          <section className="calm-surface" aria-labelledby="calm-heading">
            <h2 id="calm-heading">Nothing needed from you right now</h2>
            <p>{calmActiveCopy(activeCases)}</p>
            {activeRecent.length > 0 ? <CaseList items={activeRecent} /> : null}
          </section>
        ) : (
          <section className="calm-surface" aria-labelledby="no-active-heading">
            <h2 id="no-active-heading">No active cases</h2>
            <p>
              {previousCases > 0
                ? "Your previous ProfileRelaunch cases are still available below."
                : "When you start a ProfileRelaunch case, it will appear here."}
            </p>
            {previousCases === 0 ? (
              <p><a href={`${brandSiteUrl}/get-help`}>Tell us about your business</a></p>
            ) : null}
          </section>
        )}
      </div>

      <aside className="portal-side" aria-label="Overview">
        {hasCases ? (
          <nav className="portal-shortcuts" aria-label="Case areas">
            <ul>
              <li><a href="/portal/documents">Documents</a></li>
              <li><a href="/portal/payments">Payments</a></li>
              <li><a href="/portal/messages">Messages</a></li>
            </ul>
          </nav>
        ) : null}
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
      </aside>

      {hasBelow ? (
        <div className="portal-below">
          {showOtherActive ? (
            <section className="portal-cases-section" aria-labelledby="your-cases-heading">
              <h2 id="your-cases-heading">Your cases</h2>
              <CaseList items={activeRecent} />
            </section>
          ) : null}

          {previousRecent.length > 0 ? (
            <section className="portal-cases-section" aria-labelledby="previous-cases-heading">
              <h2 id="previous-cases-heading">Previous cases</h2>
              <CaseList items={previousRecent} />
              <p className="case-more"><a href="/portal/cases?view=all">View all cases</a></p>
            </section>
          ) : null}

          {showUnplacedActive ? (
            <section className="portal-cases-section" aria-labelledby="your-cases-heading">
              <h2 id="your-cases-heading">Your cases</h2>
              <CaseList items={activeRecent} />
              {previousRecent.length === 0 ? <p className="case-more"><a href="/portal/cases?view=all">View all cases</a></p> : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
