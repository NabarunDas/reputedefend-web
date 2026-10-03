const CONTROL = /[\u0000-\u001F\u007F]/

/**
 * Login input is trimmed and lower-cased for lookup. This is not a verdict
 * on whether a ProfileRelaunch customer exists.
 */
export function normalizePortalEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 320 || CONTROL.test(trimmed) || /\s/.test(trimmed)) return null
  const at = trimmed.indexOf("@")
  if (at <= 0 || at !== trimmed.lastIndexOf("@") || at === trimmed.length - 1) return null
  return trimmed.toLowerCase()
}

export const PORTAL_LOGIN_MESSAGE =
  "If this email is linked to a ProfileRelaunch account, we've sent a six-digit code."

export function portalLoginNotice(typedEmail: string) {
  return `If ${typedEmail} is linked to a ProfileRelaunch account, we've sent a six-digit code.`
}

export const PORTAL_VERIFY_ERROR =
  "We couldn't verify that code. Check it and try again, or request a new code."

export const PORTAL_UNAVAILABLE = "Customer portal sign-in is unavailable."

export const PORTAL_EMAIL_INVALID = "Enter a valid email address."
