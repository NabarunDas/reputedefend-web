import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { sessionCookie } from "./auth/config"
import { sessionFromToken } from "./auth/backend"

/** Every protected page and command must call this independently of the proxy. */
export async function requireStaff() {
  const token = (await cookies()).get(sessionCookie)?.value
  const session = await sessionFromToken(token)
  if (!session) redirect("/login")
  return session
}
