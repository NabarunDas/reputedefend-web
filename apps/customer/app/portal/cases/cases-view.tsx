import { CaseSummary } from "../case-summary"
import { presentCase } from "@/lib/portal/cases/model"
import type { CasesView, CustomerCasePage } from "@/lib/portal/cases/parse"

const FILTERS: { view: CasesView; label: string }[] = [
  { view: "active", label: "Active" },
  { view: "previous", label: "Previous" },
  { view: "all", label: "All" },
]

const EMPTY: Record<CasesView, string> = {
  active: "You don't have any active cases.",
  previous: "You don't have any previous cases.",
  all: "No ProfileRelaunch cases are available.",
}

export function CasesUnavailable() {
  return (
    <div className="portal-dashboard">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Cases</h1>
      <h2>We couldn&apos;t load your cases</h2>
      <p>Refresh the page and try again. If the problem continues, contact ProfileRelaunch.</p>
    </div>
  )
}

export function CasesView({ view, page }: { view: CasesView; page: CustomerCasePage }) {
  const cases = page.cases.map(presentCase)
  const next = page.nextCursor
  const nextHref = next
    ? `/portal/cases?view=${view}&before=${encodeURIComponent(next.submittedAt)}&ref=${encodeURIComponent(next.reference)}`
    : null
  return (
    <div className="portal-dashboard">
      <p className="eyebrow">CUSTOMER PORTAL</p>
      <h1>Cases</h1>
      <p className="lead">See your active and previous ProfileRelaunch cases.</p>
      <nav aria-label="Case filters">
        <ul className="case-filters">
          {FILTERS.map(filter => {
            const active = filter.view === view
            return (
              <li key={filter.view}>
                <a href={`/portal/cases?view=${filter.view}`} {...(active ? { "aria-current": "page" as const } : {})}>
                  {filter.label}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
      {cases.length === 0 ? <p>{EMPTY[view]}</p> : (
        <ul className="case-list">
          {cases.map(item => (
            <li key={item.reference}>
              <CaseSummary item={item} />
            </li>
          ))}
        </ul>
      )}
      {nextHref ? <p className="case-pagination"><a href={nextHref}>Next page</a></p> : null}
    </div>
  )
}
