import "server-only"

export const ADMIN_EMAIL = "admin@profilerelaunch.com"
export function authConfig() {
  const { ADMIN_AUTH_ENABLED, ADMIN_ORIGIN, SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env
  if (ADMIN_AUTH_ENABLED !== "true" || !ADMIN_ORIGIN || !SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) return null
  try {
    const origin = new URL(ADMIN_ORIGIN)
    const supabase = new URL(SUPABASE_URL)
    if (origin.origin !== ADMIN_ORIGIN || origin.username || origin.password || supabase.protocol !== "https:") return null
    if (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1"].includes(origin.hostname))) return null
    return { origin: origin.origin, url: supabase.origin, secret: SUPABASE_SECRET_KEY, publishable: SUPABASE_PUBLISHABLE_KEY }
  } catch { return null }
}
export const sessionCookie = process.env.NODE_ENV === "production" ? "__Host-pr-admin" : "pr-admin-dev"
export const challengeCookie = process.env.NODE_ENV === "production" ? "__Host-pr-admin-challenge" : "pr-admin-challenge-dev"
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" } as const
