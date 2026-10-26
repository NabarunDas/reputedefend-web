import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import type { JobHealth } from "./model"

export async function loadJobHealth(): Promise<JobHealth> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<JobHealth | null>("admin_job_health_v1", { p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}

export type PaymentEventQueue = {
  unprocessed: number
  oldestAvailableAt: string | null
}

/** Unprocessed test-mode settlement events. Missing SQL fails soft until the migration is applied. */
export async function loadPaymentEventQueue(): Promise<PaymentEventQueue | null> {
  await requireStaff()
  try {
    const result = await backend().rpc<{
      status?: string
      unprocessed?: number
      oldestAvailableAt?: string | null
    } | null>("dev_payment_event_queue_v1", {})
    if (!result || result.status !== "success" || typeof result.unprocessed !== "number" || result.unprocessed < 0) return null
    if (result.oldestAvailableAt != null && typeof result.oldestAvailableAt !== "string") return null
    return { unprocessed: result.unprocessed, oldestAvailableAt: result.oldestAvailableAt ?? null }
  } catch {
    return null
  }
}
