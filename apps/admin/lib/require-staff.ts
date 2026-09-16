import "server-only"
import { redirect } from "next/navigation"

/**
 * Fail closed until verified OTP sessions and active staff memberships exist.
 * Do not replace this with a cookie-presence or environment-variable bypass.
 * Every future page, command, API and download must enforce its own capability.
 */
export function requireStaff(): never {
  redirect("/login")
}
