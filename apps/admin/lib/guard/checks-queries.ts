import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import type { GuardCheckDetail, GuardCheckList } from "./checks-model"

export async function loadGuardChecks(): Promise<GuardCheckList> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<GuardCheckList | null>("admin_guard_check_list_v1", {
    p_token: tokenHash(token), p_now: null,
  })
  if (result === null) redirect("/login")
  return {
    serviceDate: result.serviceDate,
    timezone: result.timezone || "Europe/London",
    scheduleConfigured: result.scheduleConfigured === true,
    scheduleVersionId: result.scheduleVersionId,
    morningLocalStart: result.morningLocalStart,
    morningLocalEnd: result.morningLocalEnd,
    eveningLocalStart: result.eveningLocalStart,
    eveningLocalEnd: result.eveningLocalEnd,
    claimedByMe: result.claimedByMe,
    obligations: result.obligations || [],
  }
}

export async function loadGuardCheck(obligationId: string): Promise<GuardCheckDetail> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<GuardCheckDetail | null>("admin_guard_check_detail_v1", {
    p_token: tokenHash(token), p_obligation: obligationId,
  })
  if (result === null) redirect("/login")
  return {
    ...result,
    obligations: result.obligations || [],
    attempts: result.attempts || [],
    observation: result.observation || null,
  }
}
