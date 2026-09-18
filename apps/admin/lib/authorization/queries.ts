import "server-only"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { requireStaff } from "../require-staff"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import type { CaseAuthorization } from "./model"

export async function getCaseAuthorization(id: string): Promise<CaseAuthorization> {
  if (!isUuid(id)) notFound()
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<CaseAuthorization | { missing: true } | null>("admin_case_authorization_v1", {
    p_token: tokenHash(token), p_case: id,
  })
  if (result === null) redirect("/login")
  if ("missing" in result) notFound()
  return result
}
