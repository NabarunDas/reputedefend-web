/* Get Help mail follows the same delivery path in Production and on the
 * develop DEV Preview. Any other Vercel Preview persists nothing to Resend. */
import "server-only"

const DEV_SUPABASE_HOST = "rmzozuiamjcclvtgutgd.supabase.co"

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

/** The DEV project, matched the same way case persistence matches it: https on that hostname. */
export function isDevSupabaseProject(url: string | undefined) {
  const raw = url?.trim() ?? ""
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.protocol === "https:" && parsed.hostname === DEV_SUPABASE_HOST
  } catch {
    return false
  }
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

export type IntakeMailLane = "shared" | "feature-preview"

/**
 * `shared` is Production, local development, and the develop Preview on the DEV project.
 * Those runtimes use the normal customer acknowledgement and internal notice.
 * `feature-preview` is every other Vercel Preview. It records the case and does not send.
 */
export function intakeMailLane(
  env: Record<string, string | undefined> = process.env,
): IntakeMailLane {
  if (env.VERCEL_ENV !== "preview") return "shared"
  if (env.VERCEL_GIT_COMMIT_REF === "develop" && isDevSupabaseProject(env.SUPABASE_URL)) return "shared"
  return "feature-preview"
}

/** Staff replay of an existing case is only available on the develop DEV Preview. */
export function developDevIntakeMailLane(
  env: Record<string, string | undefined> = process.env,
) {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && isDevSupabaseProject(env.SUPABASE_URL)
}

export type IntakeMailObservation = {
  vercelEnv: "production" | "preview" | "development" | "other" | "absent"
  gitRef: "develop" | "other" | "absent"
  database: "exact-dev" | "other" | "absent"
  lane: IntakeMailLane
}

/** Fixed classes only. This never includes a value, an address, or a secret. */
export function observeIntakeMailRuntime(
  env: Record<string, string | undefined> = process.env,
): IntakeMailObservation {
  const vercel = env.VERCEL_ENV
  const vercelEnv = vercel === "production" || vercel === "preview" || vercel === "development"
    ? vercel
    : vercel ? "other" : "absent"
  const ref = env.VERCEL_GIT_COMMIT_REF
  const gitRef = ref === "develop" ? "develop" : ref ? "other" : "absent"
  const url = env.SUPABASE_URL
  const database = !url ? "absent" : isDevSupabaseProject(url) ? "exact-dev" : "other"
  const lane: IntakeMailLane = vercel !== "preview" || (ref === "develop" && database === "exact-dev")
    ? "shared"
    : "feature-preview"
  return { vercelEnv, gitRef, database, lane }
}

export function featurePreviewMailLogLine(observation: IntakeMailObservation) {
  return `[case-intake] feature preview mail withheld vercel=${observation.vercelEnv} ref=${observation.gitRef} database=${observation.database}`
}
