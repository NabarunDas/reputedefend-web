import "server-only"

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

/**
 * Server-only pre-launch indexing gate.
 *
 * The public marketing site is only indexable when it is both a Vercel
 * Production deployment and explicitly launched:
 *
 * - `SITE_LAUNCHED=false` (or unset): pre-launch mode. A Production
 *   deployment may exist but must never be indexed.
 * - `SITE_LAUNCHED=true`: public launch mode. Only effective when
 *   `VERCEL_ENV=production`, so Preview can never become indexable.
 *
 * Server-side only. Do not prefix with NEXT_PUBLIC_ and do not read this
 * from client components.
 */
export function isSitePublic(env: Record<string, string | undefined> = process.env) {
  return trimEnv(env.VERCEL_ENV) === "production" && trimEnv(env.SITE_LAUNCHED) === "true"
}
