export function isPublicRead(pathname: string, method: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false
  return pathname === "/" || pathname === "/robots.txt" || pathname.startsWith("/action/") || pathname.startsWith("/_next/static/")
}

export const privateResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const

export const ACTION_UNAVAILABLE =
  "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link."
