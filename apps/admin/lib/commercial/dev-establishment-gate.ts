/* PAY-ENV-05B DEV Preview operator form config refresh: Production remains unavailable. */
/** Secure DEV/develop-only pilot control. Production and other Preview branches never expose it. */
export function devEstablishmentEditorEnabled(env: Record<string,string|undefined> = process.env) {
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "develop"
    && ["https://rmzozuiamjcclvtgutgd.supabase.co", "https://rmzozuiamjcclvtgutgd.supabase.co/"].includes(env.SUPABASE_URL?.trim() ?? "")
    && env.DEV_BUSINESS_ESTABLISHMENT_EDITOR_ENABLED === "true"
}
