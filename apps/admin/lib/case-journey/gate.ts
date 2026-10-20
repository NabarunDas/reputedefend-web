/**
 * DEV/develop Preview only.
 *
 * Production, every other Preview branch, and any other Supabase project
 * are refused. No extra environment flag is introduced: the existing Preview
 * identity and the DEV project URL are the whole check.
 *
 * On that lane the eleven-step workflow is the primary case page. The
 * nine-phase cockpit stays available as case details.
 */

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"

export function devCaseJourneyPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "develop" && url === DEV_SUPABASE_URL
}

export type CaseWorkspaceChoice = "workflow" | "details"

/**
 * Server-side choice for `/cases/:id`.
 *
 * The workflow is chosen only on the existing DEV Preview lane, and only
 * when the operator did not ask for details or an older history page.
 * Every other environment stays on the case cockpit.
 */
export function caseWorkspaceChoice(
  query: { view?: string | string[]; before?: string | string[] },
  env: Record<string, string | undefined> = process.env,
): CaseWorkspaceChoice {
  if (!devCaseJourneyPreviewEnabled(env)) return "details"
  if (query.view === "details" || typeof query.before === "string") return "details"
  return "workflow"
}

/** Cockpit URL. On the DEV lane it keeps `view=details` so it does not bounce back to the workflow. */
export function caseDetailsHref(caseId: string, before?: string, env: Record<string, string | undefined> = process.env): string {
  if (!devCaseJourneyPreviewEnabled(env)) {
    return before ? `/cases/${caseId}?before=${before}` : `/cases/${caseId}`
  }
  return before ? `/cases/${caseId}?view=details&before=${before}` : `/cases/${caseId}?view=details`
}

export function caseWorkflowHref(caseId: string): string {
  return `/cases/${caseId}/journey`
}
