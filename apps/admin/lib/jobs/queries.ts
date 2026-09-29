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
