import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { requireStaff } from "../require-staff"
import {
  guardCheckQueueParams,
  parseCheckQueueCursors,
  type GuardCheckDetail,
  type GuardCheckList,
  type GuardCheckQueuePage,
  type GuardCheckQueueParam,
  type GuardCheckQueues,
} from "./checks-model"

async function listQueue(token: string, queue: string, after: string | null): Promise<GuardCheckList> {
  const result = await backend().rpc<GuardCheckList | null>("admin_guard_check_list_v1", {
    p_token: tokenHash(token),
    p_now: null,
    p_service_date: null,
    p_window: null,
    p_queue: queue,
    p_limit: 50,
    p_after: after,
  })
  if (result === null) redirect("/login")
  return {
    ...result,
    timezone: result.timezone || "Europe/London",
    scheduleConfigured: result.scheduleConfigured === true,
    obligations: result.obligations || [],
    hasMore: result.hasMore === true,
    nextCursor: result.nextCursor || null,
  }
}

function emptyPage(after: string | null, invalidCursor = false): GuardCheckQueuePage {
  return { rows: [], hasMore: false, nextCursor: null, after, invalidCursor }
}

export async function loadGuardChecks(
  params: Record<string, string | string[] | undefined> = {},
): Promise<GuardCheckQueues> {
  await requireStaff()
  const token = (await cookies()).get(sessionCookie)!.value
  const cursors = parseCheckQueueCursors(params, isUuid)
  const keys = Object.keys(guardCheckQueueParams) as GuardCheckQueueParam[]
  const results = await Promise.all(keys.map(async key => {
    if (cursors[key].invalid) return { key, list: null as GuardCheckList | null, page: emptyPage(null, true) }
    const list = await listQueue(token, guardCheckQueueParams[key], cursors[key].after)
    if (list.status === "invalid" && list.reason === "invalid_cursor") {
      return { key, list, page: emptyPage(cursors[key].after, true) }
    }
    return {
      key,
      list,
      page: {
        rows: list.obligations,
        hasMore: list.hasMore === true,
        nextCursor: list.nextCursor || null,
        after: cursors[key].after,
        invalidCursor: false,
      } satisfies GuardCheckQueuePage,
    }
  }))
  const byKey = Object.fromEntries(results.map(item => [item.key, item])) as Record<
    GuardCheckQueueParam,
    (typeof results)[number]
  >
  const meta = results.find(item => item.list && item.list.serviceDate)?.list
  return {
    serviceDate: meta?.serviceDate || "",
    timezone: meta?.timezone || "Europe/London",
    scheduleConfigured: meta?.scheduleConfigured === true,
    scheduleVersionId: meta?.scheduleVersionId,
    morningLocalStart: meta?.morningLocalStart,
    morningLocalEnd: meta?.morningLocalEnd,
    eveningLocalStart: meta?.eveningLocalStart,
    eveningLocalEnd: meta?.eveningLocalEnd,
    claimedByMe: meta?.claimedByMe,
    now: meta?.now,
    morning: byKey.morning.page,
    evening: byKey.evening.page,
    claimed: byKey.claimed.page,
    retry: byKey.retry.page,
    missed: byKey.missed.page,
    completed: byKey.completed.page,
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
