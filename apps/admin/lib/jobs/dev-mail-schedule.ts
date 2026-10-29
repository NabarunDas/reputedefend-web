/**
 * The develop Admin preview is the only host an emergency mail wake may call.
 * Production, the marketing site, and any path or query string are refused.
 *
 * The five-minute recovery is not a GitHub Actions schedule. A runner would
 * start even when the queue is empty. The database function returns before
 * any HTTP call when nothing is eligible.
 */
const DEVELOP_ADMIN_PREVIEW = /^https:\/\/profilerelaunch-admin-git-develop-[a-z0-9-]+\.vercel\.app$/
export const DEV_MAIL_RECOVERY_CRON = "*/5 * * * *"
export const DEV_MAIL_SCHEDULE_PATH = "/api/internal/jobs/dev-mail-dispatch"

export function devMailScheduleUrl(origin: string): string | null {
  if (!DEVELOP_ADMIN_PREVIEW.test(origin)) return null
  return `${origin}${DEV_MAIL_SCHEDULE_PATH}`
}

export type DevMailScheduleObservation = {
  defaultBranch: string
  workflowOnDefaultBranch: boolean
  cron: string | null
  path: string | null
}

export type DevMailScheduleAssessment = {
  scheduled: boolean
  reason: "github_schedule_refused" | "database_recovery" | "wrong_default_branch"
}

/** A cron key in the workflow is refused. Recovery stays in the database. */
export function observeDevMailWorkflow(
  source: string,
  placement: { defaultBranch: string; onDefaultBranch: boolean },
): DevMailScheduleObservation {
  const crons = [...source.matchAll(/cron:\s*"([^"]+)"/g)].map(match => match[1])
  return {
    defaultBranch: placement.defaultBranch,
    workflowOnDefaultBranch: placement.onDefaultBranch,
    cron: crons.length === 1 ? crons[0] : crons.length > 1 ? "multiple" : null,
    path: source.includes(DEV_MAIL_SCHEDULE_PATH) ? DEV_MAIL_SCHEDULE_PATH : null,
  }
}

export function assessDevMailSchedule(observation: DevMailScheduleObservation): DevMailScheduleAssessment {
  if (observation.defaultBranch !== "main") return { scheduled: false, reason: "wrong_default_branch" }
  if (observation.cron) return { scheduled: false, reason: "github_schedule_refused" }
  return { scheduled: false, reason: "database_recovery" }
}
