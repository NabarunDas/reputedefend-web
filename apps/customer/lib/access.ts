const PUBLIC_BRAND_ASSETS = new Set([
  "/icon.png",
  "/apple-icon.png",
  "/brand/profile-relaunch-logo.png",
  "/brand/profile-relaunch-logo-light.png",
])

export function isPublicRead(pathname: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false
  return pathname === "/" || pathname === "/robots.txt" || pathname === "/pay/return" || pathname.startsWith("/action/") || pathname.startsWith("/_next/static/") || pathname === "/_next/image" || PUBLIC_BRAND_ASSETS.has(pathname)
}

export const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const

export const ACTION_UNAVAILABLE =
  "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link."
