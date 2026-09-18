import Link from "next/link"
import { notFound } from "next/navigation"
import { ukDate } from "@/lib/admin/activity"
import { listEvidenceQueue } from "@/lib/evidence/queries"
import { evidenceQueueFilters, fileTypeLabel, formatBytes, queueFilterLabels, type QueueFilter } from "@/lib/evidence/model"
import { Badge, EmptyState, PageHeader } from "../ui"

export const metadata = { title: "Documents" }

const filterOrder: QueueFilter[] = ["needs_review", "scanning", "blocked", "accepted", "rejected", "all"]

function scanTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "NO_THREATS_FOUND") return "success"
  if (status === "PENDING") return "warning"
  if (status === "THREATS_FOUND" || status === "FAILED" || status === "UNSUPPORTED" || status === "ACCESS_DENIED") return "danger"
  return "neutral"
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filter = evidenceQueueFilters(await searchParams)
  if (!filter) notFound()
  const all = await listEvidenceQueue(filter), rows = all.slice(0, 50), last = rows.at(-1)
  return <section className="page">
    <PageHeader title="Documents" description="Global evidence queue for files already uploaded to a case. Open a row to review it in the case evidence workspace." />
    <section className="panel">
      <form className="filters">
        <label>Show
          <select name="filter" defaultValue={filter.filter}>
            {filterOrder.map(value => <option key={value} value={value}>{queueFilterLabels[value]}</option>)}
          </select>
        </label>
        <button>Apply</button>
      </form>
      <p className="muted">{rows.length} document versions on this page. Default view is needs review.</p>
      {!rows.length ? <EmptyState>No documents match this filter.</EmptyState> : <div className="table-scroll" role="region" aria-label="Document queue" tabIndex={0}>
        <table>
          <thead><tr><th>Case</th><th>Client and business</th><th>Document</th><th>File</th><th>Scan</th><th>Review</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.versionId}>
            <td><Link href={`/cases/${row.caseId}/evidence`}>{row.reference}</Link></td>
            <td>{row.client}<br />{row.business}</td>
            <td><Link href={`/cases/${row.caseId}/evidence`}>{row.title}</Link></td>
            <td>{row.filename}<br />{fileTypeLabel(row.contentType)} · {formatBytes(row.sizeBytes)}</td>
            <td>
              <Badge tone={scanTone(row.scanStatus)}>{row.scanStatus.replaceAll("_", " ")}</Badge><br />
              {row.validationStatus} · {row.customerVisible ? "Visible later" : "Not visible"}
            </td>
            <td>
              <Badge tone={row.reviewStatus === "ACCEPTED" ? "success" : row.reviewStatus === "REJECTED" ? "danger" : row.reviewStatus === "UNREVIEWED" ? "warning" : "neutral"}>{row.reviewStatus}</Badge>
              <br />{ukDate(row.uploadedAt)}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      {all.length > 50 && last && <div className="pagination"><Link href={`/documents?${new URLSearchParams({ filter: filter.filter, time: last.uploadedAt, before: last.versionId })}`}>Next page</Link></div>}
    </section>
  </section>
}
