import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { coverageLabel, formatMinor, isReportKey, parsePeriod, periodHref, reportLabels } from "@/lib/reports/model"
import { loadReport } from "@/lib/reports/queries"
import { EmptyState, PageHeader } from "../../ui"
import { ExportButton, PeriodForm } from "../forms"

export default async function ReportDetailPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const { key } = await params
  if (!isReportKey(key)) notFound()
  const period = parsePeriod(await searchParams)
  if (!period) return <section className="page"><PageHeader title={reportLabels[key]} /><EmptyState>The date range is invalid.</EmptyState></section>
  const data = await loadReport(key, period.preset, period.startDate, period.endDate, period.cursor) as {
    status?: string; reason?: string
    period?: { start?: string; end?: string; timezone?: string }
    summary?: { count?: number; numerator?: number; denominator?: number; percentage?: number | null; measured?: number; excluded?: number; medianSeconds?: number | null; p90Seconds?: number | null; amounts?: Array<{ currency: string; amountMinor: number }>; eligible?: number; converted?: number; notYetConverted?: number; excludedSpam?: number; monitoring?: number; offered?: number; accepted?: number; closedOther?: number; stillOpen?: number; success?: number; excludedOpen?: number }
    page?: { rows?: Array<{ id: string; occurredAt: string; label: string; href: string; amountMinor?: number; currency?: string; elapsedSeconds?: number | null }>; hasMore?: boolean; nextCursor?: string }
  }
  if (data.status === "invalid") {
    return <section className="page"><PageHeader title={reportLabels[key]} /><EmptyState>{data.reason === "invalid_cursor" ? "That page link is invalid." : "This report could not be loaded."}</EmptyState></section>
  }
  const rows = data.page?.rows || []
  return <section className="page">
    <Link className="back-link" href={periodHref("/reports", period)}>Back to reports</Link>
    <PageHeader title={reportLabels[key]} description={`Europe/London period ${data.period?.start ? ukDate(data.period.start) : ""} to ${data.period?.end ? ukDate(data.period.end) : ""}.`} actions={<ExportButton reportKey={key} preset={period.preset} startDate={period.startDate} endDate={period.endDate} />} />
    <PeriodForm preset={period.preset} startDate={period.startDate} endDate={period.endDate} />
    <section className="panel">
      <h2>Summary</h2>
      <p>Count: {data.summary?.count ?? 0}</p>
      {data.summary?.denominator != null && <p>Coverage: {coverageLabel(data.summary)}</p>}
      {data.summary?.measured != null && <p>Measured: {data.summary.measured}. Excluded or missing: {data.summary.excluded}. Median: {data.summary.medianSeconds ?? "—"}s. P90: {data.summary.p90Seconds ?? "—"}s.</p>}
      {data.summary?.eligible != null && <p>Eligible: {data.summary.eligible}. Converted: {data.summary.converted}. Not yet converted: {data.summary.notYetConverted}. Excluded spam: {data.summary.excludedSpam}. Monitoring interest excluded: {data.summary.monitoring}.</p>}
      {data.summary?.offered != null && <p>Offered cohort: {data.summary.offered}. Accepted: {data.summary.accepted}. Closed other: {data.summary.closedOther}. Still open: {data.summary.stillOpen}.</p>}
      {data.summary?.success != null && <p>Successful decided outcomes: {data.summary.success}. Excluded open or undecided: {data.summary.excludedOpen}.</p>}
      {!!data.summary?.amounts?.length && <ul>{data.summary.amounts.map(row => <li key={row.currency}>{formatMinor(row.amountMinor, row.currency)}</li>)}</ul>}
    </section>
    <section className="panel">
      <h2>Matching records</h2>
      {!rows.length ? <EmptyState>No rows match this predicate.</EmptyState> : <div className="table-scroll"><table aria-label={reportLabels[key]}><caption className="muted">Same predicate as the summary count</caption><thead><tr><th>Record</th><th>When</th><th>Amount</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.href ? <Link href={row.href}>{row.label || row.id}</Link> : row.label}</td><td>{row.occurredAt ? ukDate(row.occurredAt) : "—"}</td><td>{row.currency ? formatMinor(row.amountMinor || 0, row.currency) : row.elapsedSeconds != null ? `${row.elapsedSeconds}s` : "—"}</td></tr>)}</tbody></table></div>}
      {data.page?.hasMore && data.page.nextCursor && <p className="pagination"><Link href={periodHref(`/reports/${key}`, period, { cursor: data.page.nextCursor })}>View more</Link></p>}
    </section>
  </section>
}
