import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { loadIncidents } from "@/lib/settings/queries"
import { EmptyState, PageHeader } from "../ui"
import { ApproveButton, ResolveIncidentForm, SettingsActionForm } from "../settings/forms"

export const metadata = { title: "Incidents" }

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const query = await searchParams
  const raw = Array.isArray(query.filter) ? query.filter[0] : query.filter
  const filter = raw === "resolved" || raw === "all" ? raw : "open"
  const data = await loadIncidents(filter) as {
    rows?: Array<{ id: string; kind: string; status: string; title: string; summary: string; openedAt: string; resolution?: string; recordVersion?: number }>
  }
  return <section className="page">
    <Link className="back-link" href="/settings">Back to settings</Link>
    <PageHeader title="Incidents" description="Record worker, provider, monitoring, mail, billing, security and privacy failures. There is no invented acknowledgement SLA." />
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
        operation="create_incident"
        submit="Open incident"
        fields={[
          { name: "kind", label: "Kind", required: true, maxLength: 40 },
          { name: "severity", label: "Severity", maxLength: 20 },
          { name: "title", label: "Title", required: true, maxLength: 200 },
          { name: "summary", label: "Summary", required: true, maxLength: 2000 },
        ]}
      />
      {!data.rows?.length ? <EmptyState>No incidents match this filter.</EmptyState> : (
        <ul>{data.rows.map(row => (
          <li key={row.id}>
            <strong>{row.title}</strong>
            <p className="muted">{row.kind} · {row.status} · {ukDate(row.openedAt)} — {row.summary}</p>
            {row.status === "OPEN" && <ApproveButton operation="acknowledge_incident" id={row.id} version={row.recordVersion ?? 1} label="Acknowledge" record={row.title} />}
            {row.status !== "RESOLVED" && row.status !== "CANCELLED" && <ResolveIncidentForm id={row.id} version={row.recordVersion ?? 1} record={row.title} />}
            {row.status !== "RESOLVED" && row.status !== "CANCELLED" && <ApproveButton operation="cancel_incident" id={row.id} version={row.recordVersion ?? 1} label="Cancel incident" record={row.title} />}
          </li>
        ))}</ul>
      )}
    </section>
  </section>
}
