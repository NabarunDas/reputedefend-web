import { PORTAL_IDLE_WARNING_SECONDS } from "./idle-policy"

export type PortalClock = {
  authenticatedAt: string
  expiresAt: string
  idleExpiresAt: string
}

/** The earlier of the idle deadline and the absolute eight-hour deadline. */
export function portalDeadlineMs(clock: PortalClock): number | null {
  const absolute = Date.parse(clock.expiresAt)
  const idle = Date.parse(clock.idleExpiresAt)
  if (!Number.isFinite(absolute) || !Number.isFinite(idle)) return null
  return Math.min(absolute, idle)
}

export function portalExpiryWarning(clock: PortalClock, now: number): boolean {
  const deadline = portalDeadlineMs(clock)
  if (deadline === null) return false
  const remaining = deadline - now
  return remaining > 0 && remaining <= PORTAL_IDLE_WARNING_SECONDS * 1000
}
