import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { loadComplaints } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../ui"
import { ApproveButton, SettingsActionForm } from "../settings/forms"

export const metadata = { title: "Complaints" }

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const query = await searchParams
  const raw = Array.isArray(query.filter) ? query.filter[0] : query.filter
  const filter = raw === "resolved" || raw === "all" ? raw : "open"
  const data = await loadComplaints(filter) as {
    rows?: Array<{ id: string; caseId?: string | null; reference?: string | null; title: string; summary?: string; status: string; dueAt?: string; resolution?: string; recordVersion?: number }>
  }
  return <section className="page">
    <Link className="back-link" href="/settings">Back to settings</Link>
    <PageHeader title="Complaints" description="Complaints are independent work items. Closing a case does not delete a complaint. There is no invented complaint SLA and no automatic refund or payment change." />
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
      <SettingsActionForm
        operation="create_complaint"
        submit="Record complaint"
        fields={[
          { name: "customerId", label: "Customer id", required: true, maxLength: 36 },
          { name: "caseId", label: "Case id", maxLength: 36 },
          { name: "source", label: "Source", required: true, maxLength: 20 },
          { name: "category", label: "Category", required: true, maxLength: 20 },
          { name: "summary", label: "Summary", required: true, maxLength: 2000 },
        ]}
      />
      {!data.rows?.length ? <EmptyState>No complaints match this filter.</EmptyState> : (
        <ul className="task-list">{data.rows.map(row => (
          <li key={row.id}>
            {row.caseId && row.reference ? <Link href={`/cases/${row.caseId}`}>{row.reference}: {row.title}</Link> : <strong>{row.title}</strong>}
            <p className="muted">{row.status}{row.dueAt ? ` · due ${ukDate(row.dueAt)}` : ""}{row.resolution ? ` · ${row.resolution}` : ""}</p>
            {row.status === "OPEN" && <ApproveButton operation="acknowledge_complaint" id={row.id} version={row.recordVersion ?? 1} label="Acknowledge" record={row.title} />}
            {(row.status === "OPEN" || row.status === "ACKNOWLEDGED") && (
              <SettingsActionForm
                operation="resolve_complaint"
                extras={{ id: row.id }}
                version={row.recordVersion ?? 1}
                submit="Resolve"
                record={row.title}
                fields={[{ name: "resolution", label: "Resolution", required: true, maxLength: 2000 }]}
              />
            )}
            {(row.status === "OPEN" || row.status === "ACKNOWLEDGED") && <ApproveButton operation="cancel_complaint" id={row.id} version={row.recordVersion ?? 1} label="Cancel complaint" record={row.title} />}
          </li>
        ))}</ul>
      )}
    </section>
  </section>
}
