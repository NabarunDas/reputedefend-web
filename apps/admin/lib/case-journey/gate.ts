/**
 * DEV/develop Preview only.
 *
 * Production, every other Preview branch, and any other Supabase project
 * are refused. No extra environment flag is introduced: the existing Preview
 * identity and the DEV project URL are the whole check.
 */

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"

export function devCaseJourneyPreviewEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "develop" && url === DEV_SUPABASE_URL
}
