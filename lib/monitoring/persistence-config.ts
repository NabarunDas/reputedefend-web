import "server-only"

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

/**
 * Server-only rollout flag. Only the exact value `true` enables
 * /start-monitoring and /api/monitoring persistence.
 */
export function isMonitoringPersistenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return trimEnv(env.MONITORING_PERSISTENCE_ENABLED) === "true"
}

export const MONITORING_UNAVAILABLE = "Relaunch Guard setup is temporarily unavailable. Please try again shortly."
