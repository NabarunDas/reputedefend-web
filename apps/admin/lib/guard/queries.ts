import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import type { GuardList } from "./model"

export async function loadGuard(): Promise<GuardList> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<GuardList | null>("admin_guard_list_v1", { p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return {
    requests: result.requests || [],
    coverages: result.coverages || [],
    guardOrders: result.guardOrders || [],
    locations: result.locations || [],
    subscriptions: result.subscriptions || [],
    continuations: result.continuations || [],
    reminders: result.reminders || [],
    adjustments: result.adjustments || [],
  }
}
