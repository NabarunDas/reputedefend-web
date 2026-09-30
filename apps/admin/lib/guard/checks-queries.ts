import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { requireStaff } from "../require-staff"
import type { GuardCheckDetail, GuardCheckList, GuardCheckQueues } from "./checks-model"

async function listQueue(token: string, queue: string): Promise<GuardCheckList> {
  const result = await backend().rpc<GuardCheckList | null>("admin_guard_check_list_v1", {
    p_token: tokenHash(token),
    p_now: null,
    p_service_date: null,
    p_window: null,
    p_queue: queue,
    p_limit: 50,
    p_after: null,
  })
  if (result === null) redirect("/login")
  return {
    ...result,
    timezone: result.timezone || "Europe/London",
    scheduleConfigured: result.scheduleConfigured === true,
    obligations: result.obligations || [],
  }
}

export async function loadGuardChecks(): Promise<GuardCheckQueues> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const [morning, evening, claimed, retry, missed, completed] = await Promise.all([
    listQueue(token, "MORNING"),
    listQueue(token, "EVENING"),
    listQueue(token, "CLAIMED_BY_ME"),
    listQueue(token, "RETRY_REQUIRED"),
    listQueue(token, "MISSED"),
    listQueue(token, "COMPLETED_TODAY"),
  ])
  return {
    serviceDate: morning.serviceDate,
    timezone: morning.timezone,
    scheduleConfigured: morning.scheduleConfigured,
    scheduleVersionId: morning.scheduleVersionId,
    morningLocalStart: morning.morningLocalStart,
    morningLocalEnd: morning.morningLocalEnd,
    eveningLocalStart: morning.eveningLocalStart,
    eveningLocalEnd: morning.eveningLocalEnd,
    claimedByMe: morning.claimedByMe,
    now: morning.now,
    morning: morning.obligations,
    evening: evening.obligations,
    claimed: claimed.obligations,
    retry: retry.obligations,
    missed: missed.obligations,
    completed: completed.obligations,
  }
}

export async function loadGuardCheck(obligationId: string): Promise<GuardCheckDetail> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<GuardCheckDetail | null>("admin_guard_check_detail_v1", {
    p_token: tokenHash(token), p_obligation: obligationId, p_now: null,
  })
  if (result === null) redirect("/login")
  return {
    ...result,
    timezone: result.timezone || "Europe/London",
    scheduleConfigured: result.scheduleConfigured === true,
    attempts: result.attempts || [],
    observation: result.observation || null,
  }
}
