/**
 * The develop Admin preview is the only host the DEV mail schedule may call.
 * Production, the marketing site, and any path or query string are refused.
 *
 * A workflow file in this branch is not a schedule. GitHub runs schedule
 * events only from the default branch, which is main.
 */
const DEVELOP_ADMIN_PREVIEW = /^https:\/\/profilerelaunch-admin-git-develop-[a-z0-9-]+\.vercel\.app$/
const DEVELOP_HOST_PATTERN = "https://profilerelaunch-admin-git-develop-[a-z0-9-]+\\.vercel\\.app"
export const DEV_MAIL_SCHEDULE_CRON = "*/5 * * * *"
export const DEV_MAIL_SCHEDULE_PATH = "/api/internal/jobs/dev-mail-dispatch"

export function devMailScheduleUrl(origin: string): string | null {
  if (!DEVELOP_ADMIN_PREVIEW.test(origin)) return null
  return `${origin}${DEV_MAIL_SCHEDULE_PATH}`
}

export type DevMailScheduleObservation = {
  defaultBranch: string
  workflowOnDefaultBranch: boolean
  cron: string | null
  hostPattern: string | null
  path: string | null
}

export type DevMailScheduleAssessment = {
  scheduled: boolean
  reason: "scheduled" | "absent_from_default_branch" | "wrong_cadence" | "wrong_host" | "wrong_path" | "wrong_default_branch"
}

/** Reads the reviewed workflow text. Placement on the default branch is a separate fact. */
export function observeDevMailWorkflow(
  source: string,
  placement: { defaultBranch: string; onDefaultBranch: boolean },
): DevMailScheduleObservation {
  const crons = [...source.matchAll(/cron:\s*"([^"]+)"/g)].map(match => match[1])
  const developHost = source.includes(DEVELOP_HOST_PATTERN)
  const otherHost = /admin\.profilerelaunch\.com|profilerelaunch-admin\.vercel\.app|profilerelaunch-customer-git-/.test(source)
  return {
    defaultBranch: placement.defaultBranch,
    workflowOnDefaultBranch: placement.onDefaultBranch,
    cron: crons.length === 1 ? crons[0] : null,
    hostPattern: developHost && !otherHost ? DEVELOP_HOST_PATTERN : null,
    path: source.includes(`path="${DEV_MAIL_SCHEDULE_PATH}"`) ? DEV_MAIL_SCHEDULE_PATH : null,
  }
}

/**
 * Scheduled only when the default branch itself carries this workflow.
 * A copy on develop, or a file that can call another host, is not a schedule.
 */
export function assessDevMailSchedule(observation: DevMailScheduleObservation): DevMailScheduleAssessment {
  if (observation.defaultBranch !== "main") return { scheduled: false, reason: "wrong_default_branch" }
  if (!observation.workflowOnDefaultBranch) return { scheduled: false, reason: "absent_from_default_branch" }
  if (observation.cron !== DEV_MAIL_SCHEDULE_CRON) return { scheduled: false, reason: "wrong_cadence" }
  if (observation.hostPattern !== DEVELOP_HOST_PATTERN) return { scheduled: false, reason: "wrong_host" }
  if (observation.path !== DEV_MAIL_SCHEDULE_PATH) return { scheduled: false, reason: "wrong_path" }
  return { scheduled: true, reason: "scheduled" }
}
