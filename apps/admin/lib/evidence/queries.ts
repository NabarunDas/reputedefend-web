import "server-only"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { requireStaff } from "../require-staff"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { type EvidenceCase, type EvidenceQueueRow, type QueueFilter } from "./model"

async function read<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<T | null>(name, { ...args, p_token: tokenHash(token) })
  if (result === null) redirect("/login")
  return result
}

export async function getEvidenceCase(id: string): Promise<EvidenceCase> {
  if (!isUuid(id)) notFound()
  const result = await read<EvidenceCase | { missing: true }>("admin_evidence_case_v1", { p_case: id })
  if ("missing" in result) notFound()
  return result
}

export function listEvidenceQueue(filter: { filter: QueueFilter; time: string | null; before: string | null }) {
  return read<EvidenceQueueRow[]>("admin_evidence_queue_v1", {
    p_filter: filter.filter,
    p_before_time: filter.time,
    p_before_id: filter.before,
  })
}
