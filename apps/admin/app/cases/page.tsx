import Link from "next/link"
import { notFound } from "next/navigation"
import { filters, stages, tracks } from "@/lib/cases/model"
import { listCases } from "@/lib/cases/queries"
import { ukDate } from "@/lib/admin/activity"
import { Badge, EmptyState, PageHeader } from "../ui"

export const metadata = { title: "Cases" }
export default async function Cases({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = filters(await searchParams); if (!f) notFound()
  const all = await listCases(f), rows = all.slice(0, 50), last = rows.at(-1)
  return <section className="page">
    <PageHeader title="Cases" description="Review new requests, plan the next action and keep track of work already underway." />
    <section className="panel">
      <form className="filters"><label>Search reference, client or business<input name="q" defaultValue={f.q} maxLength={100} /></label><label>Show<select name="filter" defaultValue={f.filter}>{Object.entries({ open: "Open cases", all: "All cases", closed: "Closed and cancelled", unassigned: "Unassigned", overdue: "Overdue", GUIDED: "Guided", MANAGED: "Managed" }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><button>Search</button></form>
      <p className="muted">{rows.length} cases on this page.</p>
      {!rows.length ? <EmptyState>No cases match these filters.</EmptyState> : <div className="table-scroll" role="region" aria-label="Case queue" tabIndex={0}><table><thead><tr><th>Case</th><th>Client and business</th><th>Stage</th><th>Responsibility</th><th>Next action</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td><Link href={`/cases/${c.id}`}>{c.reference}</Link><br />{tracks[c.track]}</td><td>{c.client}<br />{c.business}</td><td><Badge tone="info">{stages[c.stage]}</Badge><br />{c.status}</td><td>{c.assigned ? "Administrator" : "Unassigned"} · <Badge tone={c.priority === "URGENT" ? "danger" : c.priority === "HIGH" ? "warning" : "neutral"}>{c.priority}</Badge></td><td>{c.nextAction || "Not recorded"}{c.due && <><br />{ukDate(c.due)}</>}</td></tr>)}</tbody></table></div>}
      {all.length > 50 && last && <div className="pagination"><Link href={`/cases?${new URLSearchParams({ q: f.q, filter: f.filter, time: last.createdAt, before: last.id })}`}>Next page</Link></div>}
    </section>
  </section>
}
