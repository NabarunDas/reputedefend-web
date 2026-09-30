import Link from "next/link"
import { loadGuardChecks } from "@/lib/guard/checks-queries"
import {
  localWindowLabel,
  londonDateTime,
  obligationQueueLabel,
  windowLabel,
  type GuardCheckObligation,
} from "@/lib/guard/checks-model"
import { Badge, EmptyState, PageHeader } from "../../ui"

export const metadata = { title: "Guard checks" }

function Queue({
  title, rows, actor,
}: {
  title: string
  rows: GuardCheckObligation[]
  actor?: string | null
}) {
  return <section className="panel">
    <h2>{title}</h2>
    {!rows.length ? <EmptyState>No checks in this queue.</EmptyState> : <div className="table-scroll" role="region" aria-label={title} tabIndex={0}>
      <table>
        <thead><tr>
          <th>Location</th><th>Coverage</th><th>Window</th><th>Service date</th>
          <th>Status</th><th>Claim</th><th>Attempts</th><th>Baseline</th><th>Previous</th><th>Missed / late</th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <td>
            <Link href={`/guard/checks/${row.id}`}>{row.locationName}</Link>
            <br /><span className="muted">{row.businessName} · {row.customerName}</span>
          </td>
          <td>{row.coverageBasis === "INCLUDED" ? "Included" : "Direct"}</td>
          <td>{windowLabel(row.windowCode)}</td>
          <td>{row.serviceDate}</td>
          <td><Badge>{obligationQueueLabel(row)}</Badge></td>
          <td>{row.upcoming || row.windowOpen === false
            ? "Upcoming"
            : row.claimedBy ? (row.claimedBy === actor ? "Claimed by me" : "Claimed") : "Unclaimed"}</td>
          <td>{row.attemptCount}{row.retryCount ? ` · ${row.retryCount} retries` : ""}</td>
          <td>{row.baselineAvailable ? "Verified baseline" : "No verified baseline"}</td>
          <td>{row.previousObservation ? `${row.previousObservation.classification} · ${londonDateTime(row.previousObservation.observedAt)}` : "None"}</td>
          <td>
            {row.missedAt && <p>Missed {londonDateTime(row.missedAt)}</p>}
            {row.late && <p>Late by {row.secondsLate}s</p>}
            {!row.missedAt && !row.late && <p className="muted">On time or open</p>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>
}

export default async function GuardChecksPage() {
  const checks = await loadGuardChecks()
  const actor = checks.claimedByMe
  return <section className="page">
    <PageHeader
      title="Guard checks"
      description="Manual morning and evening monitoring queues. Times are Europe/London. Live monitoring remains disabled. No Google API, customer alert or email is sent from this workspace."
    />
    <p className="muted">UK service date {checks.serviceDate}. {checks.scheduleConfigured
      ? `Approved windows: morning ${localWindowLabel(checks.morningLocalStart, checks.morningLocalEnd)} · evening ${localWindowLabel(checks.eveningLocalStart, checks.eveningLocalEnd)}.`
      : "Schedule not configured."}</p>
    <p><Link href="/guard">Back to Guard onboarding</Link></p>
    <Queue title="Morning" rows={checks.morning} actor={actor} />
    <Queue title="Evening" rows={checks.evening} actor={actor} />
    <Queue title="Claimed by me" rows={checks.claimed} actor={actor} />
    <Queue title="Retry required" rows={checks.retry} actor={actor} />
    <Queue title="Missed" rows={checks.missed} actor={actor} />
    <Queue title="Completed today" rows={checks.completed} actor={actor} />
  </section>
}
