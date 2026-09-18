import Link from "next/link"
import { notFound } from "next/navigation"
import { filters } from "@/lib/cases/model"
import { listTasks } from "@/lib/cases/queries"
import { ukDate } from "@/lib/admin/activity"
import { Badge, EmptyState, PageHeader } from "../ui"

export const metadata = { title: "Tasks" }
export default async function Tasks({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = filters(await searchParams, true); if (!f) notFound()
  const all = await listTasks(f), rows = all.slice(0, 50), last = rows.at(-1)
  return <section className="page">
    <PageHeader title="Tasks" description="Due dates are shown in UK time. This queue is checked manually; automatic reminders are not enabled yet." />
    <section className="panel">
      <form className="filters"><label>Show<select name="filter" defaultValue={f.filter}>{Object.entries({ open: "Open tasks", overdue: "Overdue", customer: "Customer actions", admin: "Admin actions", resolved: "Resolved" }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><button>Apply</button></form>
      <p className="muted">{rows.length} tasks on this page, earliest due first.</p>
      {!rows.length ? <EmptyState>No tasks match this filter.</EmptyState> : <ul className="task-list">{rows.map(t => <li key={t.id}><Link href={`/cases/${t.caseId}`}>{t.reference}: {t.title}</Link><p>{t.owner === "ADMIN" ? "Admin" : "Customer"} · {t.kind} · {ukDate(t.due)} · <Badge tone={f.filter === "overdue" || t.status === "OPEN" ? (f.filter === "overdue" ? "danger" : "info") : t.status === "DONE" ? "success" : "neutral"}>{t.status}</Badge></p></li>)}</ul>}
      {all.length > 50 && last && <div className="pagination"><Link href={`/tasks?${new URLSearchParams({ filter: f.filter, time: last.due, before: last.id })}`}>Next page</Link></div>}
    </section>
  </section>
}
