import { NextRequest, NextResponse } from "next/server"
import { isPublicRead, privateResponseHeaders } from "./lib/access"
import { sessionFromToken } from "./lib/auth/backend"
import { sessionCookie } from "./lib/auth/config"

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  let response: NextResponse
  const authPost = request.method === "POST" && /^\/auth\/(send|verify|logout|logout-all)$/.test(pathname)
  if (isPublicRead(pathname, request.method) || authPost || await sessionFromToken(request.cookies.get(sessionCookie)?.value)) {
    response = NextResponse.next()
  } else if (pathname === "/api" || pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) {
    response = NextResponse.json({ error: "Staff sign-in is required." }, { status: 401 })
  } else {
    const login = request.nextUrl.clone()
    login.pathname = "/login"
    login.search = ""
    response = NextResponse.redirect(login, 303)
  }
  for (const [key, value] of Object.entries(privateResponseHeaders)) response.headers.set(key, value)
  return response
}
export const config = { matcher: "/:path*" }
