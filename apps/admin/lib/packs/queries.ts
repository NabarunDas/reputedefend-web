import "server-only"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { requireStaff } from "../require-staff"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { type PreparedPackCase } from "./model"

export async function getPreparedPackCase(id: string): Promise<PreparedPackCase> {
  if (!isUuid(id)) notFound()
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<PreparedPackCase | { missing: true } | null>("admin_prepared_pack_case_v1", {
    p_token: tokenHash(token), p_case: id,
  })
  if (result === null) redirect("/login")
  if ("missing" in result) notFound()
  return result
}
