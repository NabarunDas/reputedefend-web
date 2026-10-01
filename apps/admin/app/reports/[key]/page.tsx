import Link from "next/link"
import { notFound } from "next/navigation"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { coverageLabel, formatAmountGroups, formatMinor, isReportKey, parsePeriod, periodHref, reportLabels, reportTemporalMode } from "@/lib/reports/model"
import { loadReport, loadSavedFilters } from "@/lib/reports/queries"
import { EmptyState, PageHeader } from "../../ui"
import { ExportButton, PeriodForm, SavedFilterForm } from "../forms"

export default async function ReportDetailPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const { key } = await params
  if (!isReportKey(key)) notFound()
  const period = parsePeriod(await searchParams)
  if (!period) return <section className="page"><PageHeader title={reportLabels[key]} /><EmptyState>The date range is invalid.</EmptyState></section>
  const mode = reportTemporalMode(key)
  const [data, saved] = await Promise.all([
    loadReport(key, period.preset, period.startDate, period.endDate, period.cursor) as Promise<{
      status?: string; reason?: string; temporalMode?: string
      period?: { start?: string; end?: string; timezone?: string }
      summary?: {
        count?: number; numerator?: number; denominator?: number; percentage?: number | null
        measured?: number; excluded?: number; medianSeconds?: number | null; p90Seconds?: number | null
        amounts?: Array<{ currency: string; amountMinor: number }>
        eligible?: number; converted?: number; notYetConverted?: number; excludedSpam?: number; monitoring?: number
        excluded?: { spam?: number; monitoring?: number; general?: number; nonCaseContact?: number }
        offered?: number; accepted?: number; closedOther?: number; stillOpen?: number
        success?: number; partial?: number; unsuccessful?: number; withdrawn?: number; denominator?: number
        successRate?: number | null; openInIntake?: number; unknownDueDateCount?: number
        mix?: Array<{ code: string; label: string; count: number }>
        groups?: Array<{ group: string; count: number }>
        enquiry?: { measured?: number; excluded?: number; medianSeconds?: number | null; p90Seconds?: number | null }
        case?: { measured?: number; excluded?: number; medianSeconds?: number | null; p90Seconds?: number | null }
        note?: string
        categories?: Record<string, number>
        byType?: Array<{ caseType: string; outcome: string; count: number }>
        byTrack?: Array<{ track: string; outcome: string; count: number }>
        cohort?: string
      }
      page?: { rows?: Array<{ id: string; occurredAt: string; label: string; href: string; amountMinor?: number; currency?: string; elapsedSeconds?: number | null }>; hasMore?: boolean; nextCursor?: string }
    }>,
    loadSavedFilters("REPORTS") as Promise<{ filters?: Array<{ id: string; name: string; version: number; filter: Record<string, unknown> }> }>,
  ])
  if (data.status === "invalid") {
    return <section className="page"><PageHeader title={reportLabels[key]} /><EmptyState>{data.reason === "invalid_cursor" ? "That page link is invalid." : "This report could not be loaded."}</EmptyState></section>
  }
  const rows = data.page?.rows || []
  const periodLabel = mode === "CURRENT"
    ? "Current snapshot. The selected period does not produce this population."
    : `Europe/London period ${data.period?.start ? ukDate(data.period.start) : ""} to ${data.period?.end ? ukDate(data.period.end) : ""}.`
  return <section className="page">
    <Link className="back-link" href={periodHref("/reports", period)}>Back to reports</Link>
    <PageHeader title={reportLabels[key]} description={periodLabel} actions={<ExportButton reportKey={key} preset={period.preset} startDate={period.startDate} endDate={period.endDate} />} />
    {mode === "PERIOD" && <PeriodForm preset={period.preset} startDate={period.startDate} endDate={period.endDate} />}
    {mode === "CURRENT" && <p className="muted" role="status">Current snapshot. Period controls are hidden because they do not change this population.</p>}
    <SavedFilterForm module="REPORTS" filters={saved.filters || []} current={{ reportKey: key, preset: period.preset, startDate: period.startDate, endDate: period.endDate }} />
    <section className="panel">
      <h2>Summary</h2>
      <p>Count: {data.summary?.count ?? 0}</p>
      {data.summary?.denominator != null && key === "check_coverage_completed" && <p>Coverage: {coverageLabel(data.summary)}</p>}
      {data.summary?.measured != null && <p>Measured: {data.summary.measured}. Excluded or missing: {data.summary.excluded}. Median: {data.summary.medianSeconds ?? "—"}s. P90: {data.summary.p90Seconds ?? "—"}s.</p>}
      {data.summary?.enquiry && <p>Enquiry responses: measured {data.summary.enquiry.measured ?? 0}, excluded {data.summary.enquiry.excluded ?? 0}, median {data.summary.enquiry.medianSeconds ?? "—"}s, P90 {data.summary.enquiry.p90Seconds ?? "—"}s.</p>}
      {data.summary?.case && <p>Case responses: measured {data.summary.case.measured ?? 0}, excluded {data.summary.case.excluded ?? 0}, median {data.summary.case.medianSeconds ?? "—"}s, P90 {data.summary.case.p90Seconds ?? "—"}s.</p>}
      {data.summary?.note && <p className="muted">{data.summary.note}</p>}
      {data.summary?.eligible != null && <p>Eligible case-service enquiries: {data.summary.eligible}. Converted: {data.summary.converted}. Not yet converted: {data.summary.notYetConverted}. Excluded spam: {data.summary.excluded?.spam ?? data.summary.excludedSpam}. Monitoring: {data.summary.excluded?.monitoring ?? data.summary.monitoring}. General: {data.summary.excluded?.general ?? 0}. Non-case contact: {data.summary.excluded?.nonCaseContact ?? 0}.</p>}
      {data.summary?.offered != null && <p>Offered cohort: {data.summary.offered}. Accepted: {data.summary.accepted}. Closed other: {data.summary.closedOther}. Still open: {data.summary.stillOpen}.</p>}
      {data.summary?.success != null && <p>Strict success (RESTORED + REMOVED): {data.summary.success}. Denominator (decided non-withdrawn): {data.summary.denominator}. Success rate: {data.summary.successRate == null ? "Not applicable" : `${data.summary.successRate}%`}. Partial or recommendation: {data.summary.partial}. Unsuccessful: {data.summary.unsuccessful}. Withdrawn: {data.summary.withdrawn}. Open in the same intake period: {data.summary.openInIntake}. Open work is not failure.</p>}
      {data.summary?.cohort && <p className="muted">{data.summary.cohort}</p>}
      {!!data.summary?.byType?.length && <ul>{data.summary.byType.map(row => <li key={`${row.caseType}-${row.outcome}`}>{row.caseType} · {row.outcome}: {row.count}</li>)}</ul>}
      {!!data.summary?.byTrack?.length && <ul>{data.summary.byTrack.map(row => <li key={`${row.track}-${row.outcome}`}>{row.track} · {row.outcome}: {row.count}</li>)}</ul>}
      {!!data.summary?.mix?.length && <ul>{data.summary.mix.map(row => <li key={row.code}>{row.label}: {row.count}</li>)}</ul>}
      {!!data.summary?.groups?.length && <ul>{data.summary.groups.map(row => <li key={row.group}>{row.group}: {row.count}</li>)}</ul>}
      {data.summary?.unknownDueDateCount != null && data.summary.unknownDueDateCount > 0 && <p>Overdue status cannot be determined for {data.summary.unknownDueDateCount} issued unpaid invoice{data.summary.unknownDueDateCount === 1 ? "" : "s"} because no due date is recorded.</p>}
      {!!data.summary?.categories && <ul>{Object.entries(data.summary.categories).map(([label, count]) => <li key={label}>{label}: {count}</li>)}</ul>}
      {!!data.summary?.amounts?.length && <ul>{data.summary.amounts.map(row => <li key={row.currency}>{formatMinor(row.amountMinor, row.currency)}</li>)}</ul>}
      {key === "collected_net" && !data.summary?.amounts?.length && <p>{formatAmountGroups([])}</p>}
    </section>
    <section className="panel">
      <h2>Matching records</h2>
      {!rows.length ? <EmptyState>No rows match this predicate.</EmptyState> : <div className="table-scroll"><table aria-label={reportLabels[key]}><caption className="muted">Same predicate as the summary count</caption><thead><tr><th>Record</th><th>When</th><th>Amount</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.href ? <Link href={row.href}>{row.label || row.id}</Link> : row.label}</td><td>{row.occurredAt ? ukDate(row.occurredAt) : "—"}</td><td>{row.currency ? formatMinor(row.amountMinor || 0, row.currency) : row.elapsedSeconds != null ? `${row.elapsedSeconds}s` : "—"}</td></tr>)}</tbody></table></div>}
      {data.page?.hasMore && data.page.nextCursor && <p className="pagination"><Link href={periodHref(`/reports/${key}`, period, { cursor: data.page.nextCursor })}>View more</Link></p>}
    </section>
  </section>
}
