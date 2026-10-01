import Link from "next/link"
import { requireStaff } from "@/lib/require-staff"
import { parsePeriod, periodHref, reportLabels, type ReportKey } from "@/lib/reports/model"
import { loadSavedFilters } from "@/lib/reports/queries"
import { PeriodForm, SavedFilterForm } from "./forms"
import { EmptyState, PageHeader } from "../ui"

export const metadata = { title: "Reports" }

const groups: Array<{ title: string; keys: ReportKey[] }> = [
  { title: "Needs attention", keys: ["overdue_work", "unassigned_enquiries", "missed_guard_checks", "unreviewed_guard_alerts", "guard_alerts_needs_review", "failed_customer_email", "access_recovery", "contact_recovery", "payment_exceptions", "guard_billing_exceptions", "failed_jobs"] },
  { title: "Operations", keys: ["enquiry_to_case", "quote_conversion", "service_mix", "first_response", "case_age", "outcomes", "evidence_turnaround", "handling_time"] },
  { title: "Money", keys: ["collected_gross", "collected_refunds", "collected_net", "outstanding_money", "overdue_invoices"] },
  { title: "Guard", keys: ["guard_activation", "guard_churn", "check_coverage_completed", "guard_coverage_failures", "guard_recurring"] },
]

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaff()
  const period = parsePeriod(await searchParams)
  if (!period) return <section className="page"><PageHeader title="Reports" /><EmptyState>The date range is invalid.</EmptyState></section>
  const saved = await loadSavedFilters("REPORTS") as { filters?: Array<{ id: string; name: string; version: number; filter: Record<string, unknown> }> }
  return <section className="page">
    <PageHeader title="Reports" description="Each report uses one shared predicate for the summary, the paginated drill-down and the audited CSV export. Timezone: Europe/London." />
    <PeriodForm preset={period.preset} startDate={period.startDate} endDate={period.endDate} />
    <SavedFilterForm module="REPORTS" filters={saved.filters || []} current={{ preset: period.preset, startDate: period.startDate, endDate: period.endDate }} />
    {groups.map(group => <section key={group.title} className="panel">
      <h2>{group.title}</h2>
      <ul>{group.keys.map(key => <li key={key}><Link href={periodHref(`/reports/${key}`, period)}>{reportLabels[key]}</Link></li>)}</ul>
    </section>)}
  </section>
}
