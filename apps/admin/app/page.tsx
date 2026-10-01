import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { ukDate } from "@/lib/admin/activity"
import { coverageLabel, formatMinor, netAmounts, parsePeriod, periodHref, reportLabels, type ReportKey } from "@/lib/reports/model"
import { loadDashboard } from "@/lib/reports/queries"
import { PeriodForm } from "./reports/forms"
import { EmptyState, PageHeader } from "./ui"

export const metadata = { title: "Today" }

type CountPayload = { count?: number; numerator?: number; denominator?: number; percentage?: number | null; amounts?: Array<{ currency: string; amountMinor: number }> }
type Dashboard = {
  status?: string
  computedAt?: string
  timezone?: string
  period?: { start?: string; end?: string; timezone?: string }
  freshness?: { status?: string; lastStartedAt?: string | null; lateAfterSeconds?: number }
  monitoringScheduleConfigured?: boolean
  needsAttention?: Record<string, CountPayload>
  metrics?: Record<string, CountPayload>
  secondary?: {
    caseMix?: Array<{ type: string; track: string; count: number }>
    upcomingDeadlines?: Array<{ id: string; title: string; dueAt: string; caseId: string; reference: string }>
    workload?: Array<{ owner: string; count: number }>
    recentPayments?: Array<{ id: string; paidAt: string; amountMinor: number; currency: string }>
    todayWindows?: Array<{ id: string; windowCode: string; state: string }>
  }
}

const attention: Array<[keyof NonNullable<Dashboard["needsAttention"]>, ReportKey]> = [
  ["overdueWork", "overdue_work"],
  ["unassignedEnquiries", "unassigned_enquiries"],
  ["missedGuardChecks", "missed_guard_checks"],
  ["unreviewedGuardAlerts", "unreviewed_guard_alerts"],
  ["guardAlertsNeedsReview", "guard_alerts_needs_review"],
  ["failedCustomerEmail", "failed_customer_email"],
  ["accessRecovery", "access_recovery"],
  ["contactRecovery", "contact_recovery"],
  ["paymentExceptions", "payment_exceptions"],
  ["guardBillingExceptions", "guard_billing_exceptions"],
  ["failedJobs", "failed_jobs"],
]

function countText(item?: CountPayload) {
  if (item?.amounts?.length) return item.amounts.map(row => formatMinor(row.amountMinor, row.currency)).join(" · ")
  return String(item?.count ?? 0)
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const query = await searchParams
  const period = parsePeriod(query)
  if (!period) {
    return <section className="page"><PageHeader title="Today" /><section className="panel"><EmptyState>The date range is invalid. Use Europe/London calendar dates and a span of at most one year.</EmptyState></section></section>
  }
  const data = await loadDashboard(period.preset, period.startDate, period.endDate) as Dashboard
  if (data.status === "invalid") {
    return <section className="page"><PageHeader title="Today" /><section className="panel"><EmptyState>The selected period could not be applied.</EmptyState></section></section>
  }
  const metrics = data.metrics || {}
  const needs = data.needsAttention || {}
  return <section className="page">
    <PageHeader title="Today" description="Exact operational counts from the same predicates as the drill-down reports. Timezone: Europe/London." />
    <PeriodForm preset={period.preset} startDate={period.startDate} endDate={period.endDate} />
    <p className="muted" role="status">Refreshed {data.computedAt ? ukDate(data.computedAt) : "now"} · {data.timezone}. Worker heartbeat: {data.freshness?.status || "unknown"}{data.freshness?.status === "LATE" ? " — the existing Step 10 late threshold has been exceeded." : ""}.</p>
    <section className="panel" aria-labelledby="needs-attention">
      <h2 id="needs-attention">Needs attention</h2>
      <div className="summary-grid">
        {attention.map(([field, key]) => (
          <Link key={key} className="panel summary-card" href={periodHref(`/reports/${key}`, period)}>
            <p className="label">{reportLabels[key]}</p>
            <p className="count">{countText(needs[field])}</p>
            <p className="action">Open exact records</p>
          </Link>
        ))}
      </div>
    </section>
    <section className="panel" aria-labelledby="core-metrics">
      <h2 id="core-metrics">Core metrics</h2>
      <div className="summary-grid">
        <Link className="panel summary-card" href={periodHref("/reports/clients_total", period)}><p className="label">Client records</p><p className="count">{countText(metrics.clientsTotal)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/clients_active_service", period)}><p className="label">Active service clients</p><p className="count">{countText(metrics.clientsActiveService)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/contacts_enquiry_only", period)}><p className="label">Enquiry-only contacts</p><p className="count">{countText(metrics.contactsEnquiryOnly)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/open_enquiries", period)}><p className="label">Open enquiries</p><p className="count">{countText(metrics.openEnquiries)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/open_cases", period)}><p className="label">Open cases</p><p className="count">{countText(metrics.openCases)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/collected_gross", period)}><p className="label">Gross collections</p><p className="count">{countText(metrics.collectedGross)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/collected_refunds", period)}><p className="label">Refunds</p><p className="count">{countText(metrics.collectedRefunds)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/collected_gross", period)}><p className="label">Net collections</p><p className="count">{netAmounts(metrics.collectedGross?.amounts, metrics.collectedRefunds?.amounts).map(row => formatMinor(row.amountMinor, row.currency)).join(" · ") || "0.00 GBP"}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/outstanding_money", period)}><p className="label">Outstanding money</p><p className="count">{countText(metrics.outstandingMoney)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_locations_requested", period)}><p className="label">Guard requested</p><p className="count">{countText(metrics.guardRequested)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_locations_onboarding", period)}><p className="label">Guard onboarding</p><p className="count">{countText(metrics.guardOnboarding)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_locations_paid_active", period)}><p className="label">Paid active Guard</p><p className="count">{countText(metrics.guardPaidActive)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_locations_included_active", period)}><p className="label">Included active Guard</p><p className="count">{countText(metrics.guardIncludedActive)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_locations_paused", period)}><p className="label">Paused Guard</p><p className="count">{countText(metrics.guardPaused)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_locations_ending", period)}><p className="label">Ending Guard</p><p className="count">{countText(metrics.guardEnding)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_locations_ended", period)}><p className="label">Ended Guard</p><p className="count">{countText(metrics.guardEnded)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/guard_recurring", period)}><p className="label">Guard recurring GBP/month</p><p className="count">{countText(metrics.guardRecurring)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/check_coverage_due", period)}><p className="label">Checks due</p><p className="count">{countText(metrics.checkDue)}</p></Link>
        <Link className="panel summary-card" href={periodHref("/reports/check_coverage_completed", period)}><p className="label">Check coverage</p><p className="count">{coverageLabel(metrics.checkCoverage)}</p></Link>
      </div>
    </section>
    <section className="panel">
      <h2>Case mix</h2>
      {!data.secondary?.caseMix?.length ? <EmptyState>No open cases.</EmptyState> : <table><caption className="muted">Open cases by type and service track</caption><thead><tr><th>Type</th><th>Track</th><th>Count</th></tr></thead><tbody>{data.secondary.caseMix.map(row => <tr key={`${row.type}-${row.track}`}><td>{row.type}</td><td>{row.track}</td><td>{row.count}</td></tr>)}</tbody></table>}
    </section>
    <section className="panel">
      <h2>Upcoming deadlines</h2>
      {!data.secondary?.upcomingDeadlines?.length ? <EmptyState>No future task due dates.</EmptyState> : <ul className="attention-list">{data.secondary.upcomingDeadlines.map(item => <li key={item.id}><Link href={`/cases/${item.caseId}`}>{item.reference}: {item.title}</Link><p className="muted">{ukDate(item.dueAt)}</p></li>)}</ul>}
    </section>
    <section className="panel">
      <h2>Workload</h2>
      {!data.secondary?.workload?.length ? <EmptyState>No open tasks.</EmptyState> : <ul>{data.secondary.workload.map(row => <li key={row.owner}>{row.owner === "ADMIN" ? "Admin" : "Customer"}: {row.count}</li>)}</ul>}
    </section>
    <section className="panel">
      <h2>Recent confirmed payments</h2>
      {!data.secondary?.recentPayments?.length ? <EmptyState>No confirmed receipts.</EmptyState> : <ul>{data.secondary.recentPayments.map(row => <li key={row.id}>{formatMinor(row.amountMinor, row.currency)} · {ukDate(row.paidAt)}</li>)}</ul>}
    </section>
    <section className="panel">
      <h2>Today&apos;s Guard monitoring windows</h2>
      {!data.monitoringScheduleConfigured ? <p role="status">Monitoring schedule not configured</p> : !data.secondary?.todayWindows?.length ? <EmptyState>No obligations for the current London date.</EmptyState> : <ul>{data.secondary.todayWindows.map(row => <li key={row.id}><Link href={`/guard/checks/${row.id}`}>{row.windowCode}</Link> — {row.state}</li>)}</ul>}
    </section>
  </section>
}
