import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { backend, tokenHash } from "../auth/backend"
import { sessionCookie } from "../auth/config"
import { isUuid } from "../records/model"
import { requireStaff } from "../require-staff"
import { guardAlertsEnabled } from "./gate"
import {
  guardAlertQueueParams,
  parseAlertQueueCursors,
  type GuardAlertList,
  type GuardAlertQueuePage,
  type GuardAlertQueueParam,
  type GuardAlertRow,
} from "./alerts-model"

async function listQueue(token: string, queue: string, after: string | null): Promise<GuardAlertList> {
  const result = await backend().rpc<GuardAlertList | null>("admin_guard_alert_list_v1", {
    p_token: tokenHash(token),
    p_queue: queue,
    p_limit: 50,
    p_after: after,
  })
  if (result === null) redirect("/login")
  return {
    ...result,
    alerts: result.alerts || [],
    hasMore: result.hasMore === true,
    nextCursor: result.nextCursor || null,
  }
}

function emptyPage(after: string | null, invalidCursor = false): GuardAlertQueuePage {
  return { rows: [], hasMore: false, nextCursor: null, after, invalidCursor }
}

export async function loadGuardAlerts(
  params: Record<string, string | string[] | undefined> = {},
): Promise<{
  enabled: boolean
  queues: Record<GuardAlertQueueParam, GuardAlertQueuePage>
}> {
  await requireStaff()
  const enabled = guardAlertsEnabled()
  const token = (await cookies()).get(sessionCookie)!.value
  const cursors = parseAlertQueueCursors(params, isUuid)
  const keys = Object.keys(guardAlertQueueParams) as GuardAlertQueueParam[]
  const results = await Promise.all(keys.map(async key => {
    if (cursors[key].invalid) return { key, page: emptyPage(null, true) }
    const list = await listQueue(token, guardAlertQueueParams[key], cursors[key].after)
    if (list.status === "invalid" && list.reason === "invalid_cursor") {
      return { key, page: emptyPage(cursors[key].after, true) }
    }
    return {
      key,
      page: {
        rows: (list.alerts || []) as GuardAlertRow[],
        hasMore: list.hasMore === true,
        nextCursor: list.nextCursor || null,
        after: cursors[key].after,
        invalidCursor: false,
      },
    }
  }))
  return {
    enabled,
    queues: Object.fromEntries(results.map(item => [item.key, item.page])) as Record<GuardAlertQueueParam, GuardAlertQueuePage>,
  }
}

export async function loadGuardAlert(alertId: string) {
  await requireStaff()
  if (!isUuid(alertId)) return null
  const token = (await cookies()).get(sessionCookie)!.value
  const result = await backend().rpc<Record<string, unknown> | null>("admin_guard_alert_detail_v1", {
    p_token: tokenHash(token),
    p_alert: alertId,
  })
  if (result === null) redirect("/login")
  if (result.status !== "success") return null
  return { ...result, enabled: guardAlertsEnabled() }
}
