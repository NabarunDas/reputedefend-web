import "server-only"
import { customerBackendConfig } from "@/lib/config"

export const PORTAL_SESSION_SECONDS = 60 * 60 * 8
export const PORTAL_PENDING_SECONDS = 60 * 10
export { PORTAL_ACTIVITY_DEBOUNCE_MS, PORTAL_IDLE_SECONDS, PORTAL_IDLE_WARNING_SECONDS } from "./idle-policy"

/**
 * Independent of customer-action availability. This flag does not read
 * CUSTOMER_AUTH_ENABLED. It is not enabled in deployed environments.
 */
export function portalAvailable() {
  return process.env.CUSTOMER_PORTAL_ENABLED === "true" && customerBackendConfig() !== null
}

/**
 * First-time invitation login. Independent of ordinary sign-in and default
 * off. A true value still requires the Customer Portal gate.
 */
export function invitedLoginAvailable() {
  return portalAvailable() && process.env.CUSTOMER_INVITED_LOGIN_ENABLED === "true"
}

export function portalSessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-pr-portal" : "pr-portal-dev"
}

export function portalPendingCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-pr-portal-pending" : "pr-portal-pending-dev"
}

export function portalInviteCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-pr-portal-invite" : "pr-portal-invite-dev"
}

export function portalCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  }
}
