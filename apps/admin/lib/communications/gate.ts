import {
  parseWorkerCadenceSeconds,
  resolveProviderMode,
  type EnvMap,
} from "../jobs/config"

function configuredFromAddress(env: EnvMap): boolean {
  const raw = env.COMMUNICATIONS_FROM_EMAIL
  return !!raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) && raw.length <= 254
}

/** Live customer mail requires a worker at least this frequent. Daily Hobby cadence is not enough. */
export const MAX_LIVE_MAIL_CADENCE_SECONDS = 300
export const PROVIDER_IDEMPOTENCY_SAFETY_WINDOW_MS = 23 * 60 * 60 * 1000

export function communicationsSendEnabled(env: EnvMap = process.env): boolean {
  if (env.VERCEL_ENV !== "production") return false
  if (env.COMMUNICATIONS_SEND_ENABLED !== "true") return false
  if (env.JOB_WORKER_ENABLED !== "true") return false
  if (resolveProviderMode(env) !== "production") return false
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.length < 8) return false
  if (!configuredFromAddress(env)) return false
  if (parseWorkerCadenceSeconds(env) > MAX_LIVE_MAIL_CADENCE_SECONDS) return false
  return true
}

export function sendDisabledReason(env: EnvMap = process.env): string {
  if (communicationsSendEnabled(env)) return ""
  return "Outgoing customer email is not enabled yet. Reviewed drafts are preserved, but sending will be enabled only after the production worker runs at the required cadence."
}

export function acceptanceWindowExpired(firstAttemptAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!firstAttemptAt) return false
  const started = typeof firstAttemptAt === "string" ? Date.parse(firstAttemptAt) : firstAttemptAt.getTime()
  if (!Number.isFinite(started)) return true
  return now - started >= PROVIDER_IDEMPOTENCY_SAFETY_WINDOW_MS
}
