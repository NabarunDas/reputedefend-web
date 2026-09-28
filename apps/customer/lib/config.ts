import "server-only"

export function customerConfig() {
  const { CUSTOMER_AUTH_ENABLED, CUSTOMER_ORIGIN, SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env
  if (CUSTOMER_AUTH_ENABLED !== "true" || !CUSTOMER_ORIGIN || !SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) return null
  try {
    const origin = new URL(CUSTOMER_ORIGIN)
    const supabase = new URL(SUPABASE_URL)
    if (origin.origin !== CUSTOMER_ORIGIN || origin.username || origin.password || supabase.protocol !== "https:") return null
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(origin.hostname))) return null
    return { origin: origin.origin, url: supabase.origin, secret: SUPABASE_SECRET_KEY, publishable: SUPABASE_PUBLISHABLE_KEY }
  } catch { return null }
}
export const sessionCookie = process.env.NODE_ENV === "production" ? "__Host-pr-action" : "pr-action-dev"
export const pendingCookie = process.env.NODE_ENV === "production" ? "__Host-pr-action-pending" : "pr-action-pending-dev"
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" }
