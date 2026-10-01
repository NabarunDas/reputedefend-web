import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { requireStaff } from "../require-staff"
import { sessionCookie } from "../auth/config"
import { backend, tokenHash } from "../auth/backend"
import type { ReportKey, ReportPreset } from "./model"

async function read<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<T | null>(name, { ...args, p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}

export function loadDashboard(preset: ReportPreset, startDate: string | null, endDate: string | null) {
  return read<Record<string, unknown>>("admin_dashboard_today_v1", {
    p_preset: preset, p_start_date: startDate, p_end_date: endDate, p_now: null,
  })
}

export function loadReport(key: ReportKey, preset: ReportPreset, startDate: string | null, endDate: string | null, cursor: string | null) {
  return read<Record<string, unknown>>("admin_report_detail_v1", {
    p_key: key, p_preset: preset, p_start_date: startDate, p_end_date: endDate, p_cursor: cursor, p_limit: 50, p_now: null,
  })
}

export function loadSearch(query: string, cursor: string | null) {
  return read<Record<string, unknown>>("admin_global_search_v1", {
    p_query: query, p_cursor: cursor, p_limit: 20,
  })
}

export function loadSavedFilters(module: string) {
  return read<Record<string, unknown>>("admin_saved_filter_list_v1", { p_module: module })
}

export function loadCustomerPreview(customerId: string) {
  return read<Record<string, unknown>>("admin_customer_preview_v1", { p_customer: customerId })
}
