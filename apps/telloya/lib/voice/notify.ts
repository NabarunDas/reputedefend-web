import type { CallRecord, NotificationIntent } from "./types"
import { leadIdFor } from "./lead"

export function notificationKey(leadId: string): string {
  return `${leadId}-business`
}

export function intentFor(environment: string, locationId: string, callId: string): NotificationIntent {
  const leadId = leadIdFor(environment, locationId, callId)
  return {
    leadId,
    idempotencyKey: notificationKey(leadId),
    status: "pending",
  }
}

/** One intent per finalised lead. A retry returns the existing intent. */
export function ensureNotificationIntent(environment: string, record: CallRecord): CallRecord {
  if (!record.finalised || record.notification) return record
  return {
    ...record,
    notification: intentFor(environment, record.lead.tenantLocationId, record.lead.providerCallRef),
  }
}

export function markIntentFailed(record: CallRecord): CallRecord {
  if (!record.notification) return record
  return {
    ...record,
    notification: { ...record.notification, status: "failed" },
  }
}
