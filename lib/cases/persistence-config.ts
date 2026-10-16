/* PAY-ENV-05B DEV Preview branch config refresh: case intake stays no-email unless its exact gate is set. */
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

/** Opt-in DEV/develop Preview case intake without *any* Resend delivery.
 * Produces a saved case and a failed communication audit record, not a sent email.
 * Production and unrelated previews are never affected.
 */
export function devCaseIntakeEmailSuppressed(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && env.DEV_CASE_INTAKE_NO_EMAIL === "true"
    && ["https://rmzozuiamjcclvtgutgd.supabase.co", "https://rmzozuiamjcclvtgutgd.supabase.co/"].includes(env.SUPABASE_URL?.trim() ?? "")
}
