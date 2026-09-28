import { NextRequest, NextResponse } from "next/server"
import { isPublicRead, privateResponseHeaders } from "./lib/access"
import { actionSessionFromToken } from "./lib/backend"
import { sessionCookie } from "./lib/config"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response: NextResponse
  const actionPost = request.method === "POST" && /^\/api\/action\/(exchange|otp|verify|command)$/.test(pathname)
  if (isPublicRead(pathname, request.method) || actionPost || await actionSessionFromToken(request.cookies.get(sessionCookie)?.value)) {
    response = NextResponse.next()
  } else if (pathname === "/api" || pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) {
    response = NextResponse.json({ message: "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link." }, { status: 401 })
  } else {
    const home = request.nextUrl.clone()
    home.pathname = "/"
    home.search = ""
    response = NextResponse.redirect(home, 303)
  }
  for (const [key, value] of Object.entries(privateResponseHeaders)) response.headers.set(key, value)
  return response
}
export const config = { matcher: "/:path*" }
