import "server-only"
import { cookies } from "next/headers"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import type { PackNotificationDispatch, PackNotificationPhase } from "./preparation"
import { parseDevMailCadenceSeconds } from "../jobs/dev-mail-dispatch"

const phases = new Set<PackNotificationPhase>([
  "none",
  "queued",
  "processing",
  "provider_accepted",
  "delivered",
  "failed",
  "blocked",
  "acceptance_unknown",
])

/**
 * Pack-ready notification state from the case record.
 * A missing function fails soft so Step 8 still renders before the migration is applied.
 */
export async function loadPackNotificationDispatch(caseId: string): Promise<PackNotificationDispatch | null> {
  const token = (await cookies()).get(sessionCookie)?.value
  if (!token) return null
  try {
    const result = await backend().rpc<{
      status?: string
      phase?: string
      communicationId?: string | null
      stalled?: boolean
      workerLate?: boolean
      workerSeen?: boolean
    } | null>("admin_pack_notification_status_v1", {
      p_token: tokenHash(token),
      p_case: caseId,
      p_cadence_seconds: parseDevMailCadenceSeconds(),
    })
    if (!result || result.status !== "success" || !result.phase || !phases.has(result.phase as PackNotificationPhase)) return null
    if (result.communicationId != null && typeof result.communicationId !== "string") return null
    return {
      phase: result.phase as PackNotificationPhase,
      communicationId: result.communicationId ?? null,
      stalled: result.stalled === true,
      workerLate: result.workerLate === true,
      workerSeen: result.workerSeen === true,
    }
  } catch {
    return null
  }
}
