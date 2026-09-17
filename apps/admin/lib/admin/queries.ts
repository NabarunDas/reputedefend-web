import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import type { Activity, ActivityFilters } from "./activity"

// Each query declares its own capability/RPC. No client-controlled table names or RPC names.
export async function listActivity(filters: ActivityFilters): Promise<Activity[]> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<Activity[] | null>("admin_audit_list_v1", {
    p_token: tokenHash(token), p_before: filters.before, p_action: filters.action, p_outcome: filters.outcome,
  })
  if (result === null) redirect("/login")
  return result
}
