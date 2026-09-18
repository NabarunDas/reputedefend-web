/** Only these reads bypass authentication. Auth POST routes enforce their own boundary. */
const publicBrandAssets = new Set([
  "/brand/profile-relaunch-logo.png",
  "/brand/profile-relaunch-logo-light.png",
])

export function isPublicRead(pathname: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false
  return pathname === "/login"
    || pathname === "/robots.txt"
    || pathname.startsWith("/_next/static/")
    || publicBrandAssets.has(pathname)
}

export const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const
