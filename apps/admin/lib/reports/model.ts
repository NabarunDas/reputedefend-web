export const reportKeys = [
  "overdue_work", "unassigned_enquiries", "missed_guard_checks", "unreviewed_guard_alerts",
  "guard_alerts_needs_review", "failed_customer_email", "access_recovery", "contact_recovery",
  "payment_exceptions", "guard_billing_exceptions", "failed_jobs",
  "clients_total", "clients_active_service", "contacts_enquiry_only", "open_enquiries", "open_cases",
  "collected_gross", "collected_refunds", "outstanding_money",
  "guard_locations_requested", "guard_locations_onboarding", "guard_locations_paid_active",
  "guard_locations_included_active", "guard_locations_paused", "guard_locations_ending", "guard_locations_ended",
  "guard_recurring", "check_coverage_due", "check_coverage_completed",
  "enquiry_to_case", "quote_conversion", "service_mix", "first_response", "case_age", "outcomes",
  "evidence_turnaround", "overdue_invoices", "guard_activation", "guard_churn",
  "guard_coverage_failures", "handling_time",
] as const

export type ReportKey = (typeof reportKeys)[number]
export const reportPresets = ["today", "last_7_days", "current_month", "custom"] as const
export type ReportPreset = (typeof reportPresets)[number]
export const savedFilterModules = ["ENQUIRIES", "CASES", "TASKS", "GUARD_CHECKS", "GUARD_ALERTS", "MONEY", "REPORTS"] as const

export const reportLabels: Record<ReportKey, string> = {
  overdue_work: "Overdue work",
  unassigned_enquiries: "Unassigned enquiries",
  missed_guard_checks: "Failed or missed Guard checks",
  unreviewed_guard_alerts: "Unreviewed Guard alerts",
  guard_alerts_needs_review: "Guard alerts needing evidence re-review",
  failed_customer_email: "Failed customer email",
  access_recovery: "Access recovery",
  contact_recovery: "Contact recovery",
  payment_exceptions: "Payment exceptions",
  guard_billing_exceptions: "Guard billing exceptions",
  failed_jobs: "Failed or dead-lettered jobs",
  clients_total: "Client records",
  clients_active_service: "Active service clients",
  contacts_enquiry_only: "Enquiry-only contacts",
  open_enquiries: "Open enquiries",
  open_cases: "Open cases",
  collected_gross: "Gross confirmed collections",
  collected_refunds: "Confirmed refunds",
  outstanding_money: "Outstanding money",
  guard_locations_requested: "Guard requested",
  guard_locations_onboarding: "Guard onboarding",
  guard_locations_paid_active: "Paid active Guard",
  guard_locations_included_active: "Included active Guard",
  guard_locations_paused: "Paused Guard",
  guard_locations_ending: "Ending Guard",
  guard_locations_ended: "Ended Guard",
  guard_recurring: "Guard recurring commitment",
  check_coverage_due: "Checks due",
  check_coverage_completed: "Qualifying completed checks",
  enquiry_to_case: "Enquiry-to-case conversion",
  quote_conversion: "Accepted quote conversion",
  service_mix: "Guided / Managed / Guard mix",
  first_response: "First-response performance",
  case_age: "Open case age",
  outcomes: "Decided outcomes",
  evidence_turnaround: "Evidence turnaround",
  overdue_invoices: "Overdue invoices",
  guard_activation: "Guard activations",
  guard_churn: "Guard ending or ended",
  guard_coverage_failures: "Guard coverage failures",
  handling_time: "Check handling time",
}

export function isReportKey(value: string | undefined): value is ReportKey {
  return !!value && (reportKeys as readonly string[]).includes(value)
}

export function isPreset(value: string | undefined): value is ReportPreset {
  return !!value && (reportPresets as readonly string[]).includes(value)
}

export function parseDateOnly(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null
  return value
}

export function parsePeriod(query: Record<string, string | string[] | undefined>) {
  const one = (key: string) => {
    const value = query[key]
    return Array.isArray(value) ? value[0] : value
  }
  const preset = isPreset(one("preset")) ? one("preset") as ReportPreset : "today"
  const startDate = parseDateOnly(one("start"))
  const endDate = parseDateOnly(one("end"))
  if (preset === "custom") {
    if (!startDate || !endDate || startDate > endDate) return null
    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    if ((end.getTime() - start.getTime()) / 86400000 > 366) return null
  }
  return { preset, startDate, endDate, cursor: one("cursor") || null, key: one("report") || one("key") }
}

export function periodHref(path: string, period: { preset: ReportPreset; startDate: string | null; endDate: string | null }, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ preset: period.preset, ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value)) })
  if (period.preset === "custom" && period.startDate && period.endDate) {
    params.set("start", period.startDate)
    params.set("end", period.endDate)
  }
  return `${path}?${params}`
}

export function formatMinor(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—"
  const code = currency || "GBP"
  return `${(amount / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`
}

export function coverageLabel(summary: { numerator?: number; denominator?: number; percentage?: number | null } | undefined) {
  if (!summary || !summary.denominator) return "Not applicable"
  return `${summary.numerator ?? 0} / ${summary.denominator} (${summary.percentage}%)`
}

export function netAmounts(
  gross?: Array<{ currency: string; amountMinor: number }>,
  refunds?: Array<{ currency: string; amountMinor: number }>,
) {
  const map = new Map<string, number>()
  for (const row of gross || []) map.set(row.currency, (map.get(row.currency) || 0) + row.amountMinor)
  for (const row of refunds || []) map.set(row.currency, (map.get(row.currency) || 0) - row.amountMinor)
  return [...map.entries()].map(([currency, amountMinor]) => ({ currency, amountMinor })).sort((a, b) => a.currency.localeCompare(b.currency))
}
