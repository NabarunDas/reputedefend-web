import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import { isUuid } from "../records/model"
import type { CaseCommunicationRead, CommunicationList } from "./model"

export async function loadCommunications(caseId?: string | null): Promise<CommunicationList> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<CommunicationList | null>("admin_communication_list_v1", {
    p_token: tokenHash(token),
    p_case: caseId && isUuid(caseId) ? caseId : null,
  })
  if (result === null) redirect("/login")
  return result
}

/** Outbound history for one case. A non-UUID never becomes a query. */
export async function loadCaseCommunications(caseId: string): Promise<CaseCommunicationRead | null> {
  await requireStaff()
  if (!isUuid(caseId)) return null
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<CaseCommunicationRead | null>("admin_case_communications_v1", {
    p_token: tokenHash(token),
    p_case: caseId,
  })
  if (result === null) redirect("/login")
  return result.status === "success" ? result : null
}
