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

export type WorkerHeartbeatRow = {
  workerName: string
  environment: string
  status: "HEALTHY" | "LATE" | "NEVER_RUN"
  lastSuccessAt: string | null
  expectedIntervalSeconds: number
}

/** Named worker heartbeats. Missing SQL fails soft and the page keeps the single heartbeat. */
export async function loadWorkerHeartbeats(): Promise<WorkerHeartbeatRow[] | null> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)?.value
  if (!token) return null
  try {
    const result = await backend().rpc<{
      status?: string
      workers?: Array<{
        workerName?: string
        environment?: string
        status?: string
        lastSuccessAt?: string | null
        expectedIntervalSeconds?: number
      }>
    } | null>("admin_worker_heartbeats_v1", { p_token: tokenHash(token) })
    if (!result || result.status !== "success" || !Array.isArray(result.workers)) return null
    const rows: WorkerHeartbeatRow[] = []
    for (const worker of result.workers) {
      if (!worker.workerName || !worker.environment) return null
      if (worker.status !== "HEALTHY" && worker.status !== "LATE" && worker.status !== "NEVER_RUN") return null
      if (typeof worker.expectedIntervalSeconds !== "number") return null
      rows.push({
        workerName: worker.workerName,
        environment: worker.environment,
        status: worker.status,
        lastSuccessAt: worker.lastSuccessAt ?? null,
        expectedIntervalSeconds: worker.expectedIntervalSeconds,
      })
    }
    return rows
  } catch {
    return null
  }
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
