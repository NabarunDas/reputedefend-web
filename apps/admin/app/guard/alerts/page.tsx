import Link from "next/link"
import { loadGuardAlerts } from "@/lib/guard/alerts-queries"
import {
  alertSeverityLabel,
  alertStateLabel,
  guardAlertQueueHref,
  type GuardAlertQueuePage,
  type GuardAlertQueueParam,
  type GuardAlertRow,
} from "@/lib/guard/alerts-model"
import { Badge, EmptyState, PageHeader } from "../../ui"

export const metadata = { title: "Guard alerts" }

function Queue({
  title, page, param, cursors,
}: {
  title: string
  page: GuardAlertQueuePage
  param: GuardAlertQueueParam
  cursors: Record<GuardAlertQueueParam, string | null>
}) {
  return <section className="panel">
    <h2>{title}</h2>
    {page.invalidCursor && <p className="muted">That page is not valid for this queue. <Link href={guardAlertQueueHref(cursors, param, null)}>Back to the first page</Link></p>}
    {!page.rows.length && !page.invalidCursor ? <EmptyState>No items in this queue.</EmptyState> : null}
    {page.rows.length ? <div className="table-scroll" role="region" aria-label={title} tabIndex={0}>
      <table>
        <thead><tr>
          <th>Location</th><th>Coverage</th><th>State</th><th>Severity</th>
          <th>Issues</th><th>Latest observed</th><th>Notification</th><th>Blockers</th><th>Case</th>
        </tr></thead>
        <tbody>{page.rows.map((row: GuardAlertRow) => <tr key={row.id}>
          <td>
            {row.alertId || (row.state && row.id) ? <Link href={`/guard/alerts/${row.alertId || row.id}`}>{row.locationName || "Location"}</Link> : <span>{row.locationName || "Location"}</span>}
            <br /><span className="muted">{row.businessName} · {row.customerName}</span>
          </td>
          <td>{row.coverageBasis === "INCLUDED" ? "Included" : row.coverageBasis === "DIRECT_GUARD" ? "Direct" : row.kind || "—"}</td>
          <td><Badge>{alertStateLabel(row.state)}</Badge></td>
          <td>{row.severity ? alertSeverityLabel(row.severity) : row.reasonCode || "—"}</td>
          <td>{Array.isArray(row.issueCodes) && row.issueCodes.length ? row.issueCodes.join(", ") : "—"}</td>
          <td>{row.latestObservedAt || row.openedAt || "—"}</td>
          <td>{row.notificationStatus || "None"}</td>
          <td>
            {row.contactBlocked ? <p>Contact recovery</p> : null}
            {row.accessBlocked ? <p>Access recovery</p> : null}
            {row.openServiceActionKind ? <p>{row.openServiceActionKind}</p> : null}
            {!row.contactBlocked && !row.accessBlocked && !row.openServiceActionKind ? <p className="muted">None</p> : null}
          </td>
          <td>{row.linkedCaseRef || "—"}</td>
        </tr>)}</tbody>
      </table>
    </div> : null}
    {(page.after || page.hasMore) && <p>
      {page.after ? <Link href={guardAlertQueueHref(cursors, param, null)}>First page</Link> : null}
      {page.after && page.hasMore ? " · " : null}
      {page.hasMore && page.nextCursor ? <Link href={guardAlertQueueHref(cursors, param, page.nextCursor)}>View more</Link> : null}
    </p>}
  </section>
}

export default async function GuardAlertsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams ?? {}
  const alerts = await loadGuardAlerts(params)
  const cursors: Record<GuardAlertQueueParam, string | null> = {
    newReview: alerts.queues.newReview.after,
    acknowledged: alerts.queues.acknowledged.after,
    highCritical: alerts.queues.highCritical.after,
    needsReview: alerts.queues.needsReview.after,
    contact: alerts.queues.contact.after,
    access: alerts.queues.access.after,
    resolved: alerts.queues.resolved.after,
  }
  return <section className="page">
    <PageHeader title="Guard alerts" description={alerts.enabled
      ? "Internal review of attention candidates. No automatic customer email, case, discount or charge."
      : "Guard alerts are not enabled. These queues are read-only and do not mean monitoring is live."} />
    {!alerts.enabled && <p role="status">Guard alerts are not enabled</p>}
    <Queue title="New review" page={alerts.queues.newReview} param="newReview" cursors={cursors} />
    <Queue title="Acknowledged" page={alerts.queues.acknowledged} param="acknowledged" cursors={cursors} />
    <Queue title="High / Critical" page={alerts.queues.highCritical} param="highCritical" cursors={cursors} />
    <Queue title="Needs review again" page={alerts.queues.needsReview} param="needsReview" cursors={cursors} />
    <Queue title="Contact recovery" page={alerts.queues.contact} param="contact" cursors={cursors} />
    <Queue title="Access recovery" page={alerts.queues.access} param="access" cursors={cursors} />
    <Queue title="Resolved recently" page={alerts.queues.resolved} param="resolved" cursors={cursors} />
  </section>
}
