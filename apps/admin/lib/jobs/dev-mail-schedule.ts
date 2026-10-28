/**
 * The develop Admin preview is the only host the DEV mail schedule may call.
 * Production, the marketing site, and any path or query string are refused.
 */
const DEVELOP_ADMIN_PREVIEW = /^https:\/\/profilerelaunch-admin-git-develop-[a-z0-9-]+\.vercel\.app$/

export function devMailScheduleUrl(origin: string): string | null {
  if (!DEVELOP_ADMIN_PREVIEW.test(origin)) return null
  return `${origin}/api/internal/jobs/dev-mail-dispatch`
}
