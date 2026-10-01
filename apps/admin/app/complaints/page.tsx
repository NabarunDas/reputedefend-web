import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { loadComplaints } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../ui"

export const metadata = { title: "Complaints" }

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const query = await searchParams
  const raw = Array.isArray(query.filter) ? query.filter[0] : query.filter
  const filter = raw === "resolved" || raw === "all" ? raw : "open"
  const data = await loadComplaints(filter) as {
    rows?: Array<{ id: string; caseId: string; reference: string; title: string; status: string; dueAt: string; resolution?: string }>
  }
  return <section className="page">
    <Link className="back-link" href="/settings">Back to settings</Link>
    <PageHeader title="Complaints" description="Complaint tasks stay visible after a case closes only when they were resolved first. An open complaint still blocks case closure." />
    <section className="panel">
      <form className="filters" method="get">
        <label>Show
          <select name="filter" defaultValue={filter}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
        <button>Apply</button>
      </form>
      {!data.rows?.length ? <EmptyState>No complaints match this filter.</EmptyState> : (
        <ul className="task-list">{data.rows.map(row => (
          <li key={row.id}>
            <Link href={`/cases/${row.caseId}`}>{row.reference}: {row.title}</Link>
            <p className="muted">{row.status} · due {ukDate(row.dueAt)}{row.resolution ? ` · ${row.resolution}` : ""}</p>
          </li>
        ))}</ul>
      )}
    </section>
  </section>
}
