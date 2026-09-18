import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { actions, outcomes, parseActivityFilters, ukDate } from "@/lib/admin/activity"
import { listActivity } from "@/lib/admin/queries"
import { AdminNav } from "../admin-nav"
export const metadata = { title: "Activity" }
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const filters = parseActivityFilters(await searchParams)
  if (!filters) return <section className="panel"><AdminNav current="activity" /><h1>Check your filters</h1><p>That activity filter isn’t available.</p><Link href="/activity">Show all activity</Link></section>
  const rows = await listActivity(filters)
  const visible = rows.slice(0, 50)
  const next = new URLSearchParams()
  if (filters.action) next.set("action", filters.action)
  if (filters.outcome) next.set("outcome", filters.outcome)
  if (visible.length) next.set("before", visible[visible.length - 1].id)
  return <section className="panel workspace"><AdminNav current="activity" />
    <h1>Activity</h1><p>Sign-ins, session changes, client records and enquiry activity. Times are shown in UK time.</p>
    <form className="filters" action="/activity" method="get">
      <div><label htmlFor="action">Action</label><select id="action" name="action" defaultValue={filters.action || ""}><option value="">All actions</option>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><label htmlFor="outcome">Result</label><select id="outcome" name="outcome" defaultValue={filters.outcome || ""}><option value="">All results</option>{Object.entries(outcomes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <button type="submit">Apply filters</button><Link href="/activity">Clear filters</Link>
    </form>
    {!visible.length ? <p className="notice">No activity matches these filters.</p> : <div className="table-scroll" role="region" aria-label="Activity history" tabIndex={0}><table>
      <caption>Admin account activity — newest recorded first</caption><thead><tr><th scope="col">Time (UK)</th><th scope="col">Action</th><th scope="col">Result</th><th scope="col">Details</th></tr></thead>
      <tbody>{visible.map(event => <tr key={event.id}><td><time dateTime={event.createdAt}>{ukDate(event.createdAt)}</time></td><td>{actions[event.action]}</td><td>{outcomes[event.outcome]}</td><td><details><summary>Reference {event.id}</summary><p className="reference">Request: {event.requestId}</p>{event.targetId && <p className="reference">{event.entity || "Session"}: {event.targetId}</p>}{event.reason && <p className="preserve-lines">{event.reason}</p>}{event.details && Object.keys(event.details).length > 0 && <pre className="reference">{JSON.stringify(event.details, null, 2)}</pre>}</details></td></tr>)}</tbody>
    </table></div>}
    <div className="pagination">{filters.before && <Link href={`/activity?${new URLSearchParams({ ...(filters.action ? { action: filters.action } : {}), ...(filters.outcome ? { outcome: filters.outcome } : {}) })}`}>Back to newest</Link>}{rows.length > 50 && <Link href={`/activity?${next}`}>Older activity</Link>}</div>
  </section>
}
