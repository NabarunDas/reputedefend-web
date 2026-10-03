import "server-only"
import { customerConfig } from "@/lib/config"

export const PORTAL_SESSION_SECONDS = 60 * 60 * 8
export const PORTAL_PENDING_SECONDS = 60 * 10

/**
 * Independent of customer-action availability. Action links stay on
 * CUSTOMER_AUTH_ENABLED via customerConfig(); this flag only opens the portal.
 * It is not enabled in deployed environments by this change.
 */
export function portalAvailable() {
  return process.env.CUSTOMER_PORTAL_ENABLED === "true" && customerConfig() !== null
}

export function portalSessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-pr-portal" : "pr-portal-dev"
}

export function portalPendingCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-pr-portal-pending" : "pr-portal-pending-dev"
}

export function portalCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  }
}
