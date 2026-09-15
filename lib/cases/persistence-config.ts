import "server-only"

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

/**
 * Server-only rollout flag. Only the exact value `true` enables DB-backed
 * Get Help case intake. Unset/false keeps today's email-only production path.
 */
export function isCasePersistenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return trimEnv(env.CASE_PERSISTENCE_ENABLED) === "true"
}
