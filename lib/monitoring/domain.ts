export const MONITORING_REQUEST_STATUSES = [
  "REQUESTED",
  "AWAITING_PAYMENT",
  "AWAITING_AUTHORIZATION",
  "ACTIVE",
  "PAUSED",
  "CANCELLED",
] as const

export type MonitoringRequestStatus = (typeof MONITORING_REQUEST_STATUSES)[number]

export const MONITORING_REQUEST_SOURCE = "START_MONITORING" as const
export type MonitoringRequestSource = typeof MONITORING_REQUEST_SOURCE

export const MONITORING_INTAKE_SOURCE = "start-monitoring" as const
export type MonitoringIntakeSource = typeof MONITORING_INTAKE_SOURCE

export const MONITORING_LOCATIONS_MIN = 1
export const MONITORING_LOCATIONS_MAX = 1000

const MONITORING_REQUEST_STATUS_SET = new Set<string>(MONITORING_REQUEST_STATUSES)

export function isMonitoringRequestStatus(value: string): value is MonitoringRequestStatus {
  return MONITORING_REQUEST_STATUS_SET.has(value)
}

/**
 * REQUESTED means the customer asked to start Relaunch Guard onboarding.
 * It does not mean monitoring is currently active.
 */
export function isMonitoringCurrentlyActive(status: MonitoringRequestStatus) {
  return status === "ACTIVE"
}
