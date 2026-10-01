import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { requireStaff } from "../require-staff"
import { sessionCookie } from "../auth/config"
import { backend, tokenHash } from "../auth/backend"
import type { SettingKey } from "./model"

async function read<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<T | null>(name, { ...args, p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}

export function loadSettingsOverview() {
  return read<Record<string, unknown>>("admin_settings_overview_v1", {})
}

export function loadSettingVersions(key: SettingKey) {
  return read<Record<string, unknown>>("admin_settings_list_v1", { p_key: key })
}

export function loadTemplates() {
  return read<Record<string, unknown>>("admin_template_list_v1", {})
}

export function loadComplaints(filter: string) {
  return read<Record<string, unknown>>("admin_complaint_list_v1", { p_filter: filter })
}

export function loadPrivacy() {
  return read<Record<string, unknown>>("admin_privacy_list_v1", {})
}

export function loadIncidents(filter: string) {
  return read<Record<string, unknown>>("admin_incident_list_v1", { p_filter: filter })
}
