import Link from "next/link"
import type { CaseAttentionItem, CaseBlocker } from "@/lib/case-flow/model"
import { ukDate } from "@/lib/admin/activity"
import { Badge } from "../../../ui"
import { ownerLabel, severityPresentation } from "./presentation"

/**
 * What is stopping the case, in the model's own words.
 *
 * Codes stay out of the interface. A blocker is shown as the three things it
 * has to answer — what is missing, why that stops progress, and who resolves
 * it — and the code remains available to tests and analytics in the model.
 */
export function CaseBlockers({ blockers }: { blockers: CaseBlocker[] }) {
  if (blockers.length === 0) return null
  return <section className="panel cockpit-blockers" id="case-blockers" aria-labelledby="case-blockers-heading">
    <h2 id="case-blockers-heading">Blocking progress</h2>
    <ul className="notice-list">
      {blockers.map(item => <li key={item.code}>
        <h3>{item.title}</h3>
        <p>{item.explanation}</p>
        <p className="muted">To be resolved by {ownerLabel(item.owner)}.</p>
        {item.destination && <p>
          <Link href={item.destination.href}>
            Open {item.destination.label}<span className="sr-only"> to resolve: {item.title}</span>
          </Link>
        </p>}
      </li>)}
    </ul>
  </section>
}

/**
 * Everything else worth knowing, below the recommendation rather than
 * competing with it. Severity changes how an item looks; it does not change
 * the order, which stays as the model built it so the journey still reads in
 * sequence.
 */
export function CaseAttention({ items }: { items: CaseAttentionItem[] }) {
  if (items.length === 0) return null
  return <section className="panel cockpit-attention" id="case-attention" aria-labelledby="case-attention-heading">
    <h2 id="case-attention-heading">Other things needing attention</h2>
    <ul className="notice-list">
      {items.map(item => {
        const severity = severityPresentation[item.severity]
        return <li key={item.code} className={`notice-item notice-${severity.tone}`}>
          <p className="badge-row"><Badge tone={severity.tone}>{severity.word}</Badge></p>
          <h3>{item.title}</h3>
          <p>{item.explanation}</p>
          <p className="muted">
            Owned by {ownerLabel(item.owner)}.
            {item.dueAt && ` Due ${ukDate(item.dueAt)}.`}
            {item.overdue && " This is overdue."}
          </p>
          {item.destination && <p>
            <Link href={item.destination.href}>
              Open {item.destination.label}<span className="sr-only"> for: {item.title}</span>
            </Link>
          </p>}
        </li>
      })}
    </ul>
  </section>
}
