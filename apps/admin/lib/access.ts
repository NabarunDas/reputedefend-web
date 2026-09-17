/** Bootstrap policy only: no staff sessions exist until the OTP stage is built. */
export function isPublicRead(pathname: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false
  return pathname === "/login" || pathname === "/robots.txt" || pathname.startsWith("/_next/static/")
}

export const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const
