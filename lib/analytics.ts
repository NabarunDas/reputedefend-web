/**
 * Optional GA4 helpers. Analytics is off until a visitor accepts.
 * Do not load gtag, send page views, or grant ad consent before that choice.
 */

import { CASE_SERVICES, GENERAL_SERVICE_OPTIONS } from "@/lib/enquiry"

export const ANALYTICS_CONSENT_KEY = "profilerelaunch:analytics-consent:v1"
export const COOKIE_SETTINGS_EVENT = "profilerelaunch:cookie-settings"
export const ANALYTICS_CONSENT_EVENT = "profilerelaunch:analytics-consent-change"

export type AnalyticsConsent = "accepted" | "rejected"

export const DENIED_AD_CONSENT = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const

/**
 * Host-only GA cookies. Canonical tracking host is profilerelaunch.com;
 * www / .co.uk variants should redirect there rather than share analytics
 * identity across subdomains.
 */
export const GA_HOST_COOKIE_DOMAIN = "none"

export const GA_RUNTIME_CONFIG = {
  send_page_view: false,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_domain: GA_HOST_COOKIE_DOMAIN,
} as const

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/

export function readGaMeasurementId(
  value: string | undefined = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
): string | undefined {
  const id = value?.trim()
  if (!id || !MEASUREMENT_ID_PATTERN.test(id)) return undefined
  return id
}

export function analyticsIsConfigured(value?: string) {
  return Boolean(readGaMeasurementId(value ?? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID))
}

export function sanitizePathname(pathname: string) {
  const raw = pathname.trim() || "/"
  const path = raw.split("?")[0]?.split("#")[0] || "/"
  return path.startsWith("/") ? path : `/${path}`
}

export function sanitizedPageLocation(origin: string, pathname: string) {
  return `${origin.replace(/\/$/, "")}${sanitizePathname(pathname)}`
}

export function pageViewPayload(origin: string, pathname: string) {
  return {
    page_path: sanitizePathname(pathname),
    page_location: sanitizedPageLocation(origin, pathname),
  }
}

export function readStoredConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    if (value === "accepted" || value === "rejected") return value
  } catch {
    return null
  }
  return null
}

export function storeConsent(value: AnalyticsConsent) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value)
  } catch {
    // Preference storage is best-effort; the in-memory listeners still update.
  }
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: value }))
}

export function openCookieSettings() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))
}

export function gaDisableKey(measurementId: string) {
  return `ga-disable-${measurementId}`
}

export function setGaDisabled(measurementId: string, disabled: boolean) {
  if (typeof window === "undefined") return
  Object.assign(window, { [gaDisableKey(measurementId)]: disabled })
}

export function removeAnalyticsCookies() {
  if (typeof document === "undefined" || typeof location === "undefined") return

  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_"))

  const hostname = location.hostname
  const domains = ["", hostname, `.${hostname}`]
  const paths = ["/", location.pathname]

  for (const name of names) {
    for (const domain of domains) {
      for (const path of paths) {
        const domainPart = domain ? `; domain=${domain}` : ""
        document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domainPart}`
      }
    }
  }
}

export function removeGoogleAnalyticsScripts() {
  if (typeof document === "undefined") return
  document
    .querySelectorAll('script[src*="www.googletagmanager.com/gtag/js"]')
    .forEach((node) => node.parentNode?.removeChild(node))
}

export function denyAdvertisingConsent() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  window.gtag("consent", "update", { ...DENIED_AD_CONSENT })
}

export function withdrawAnalytics(measurementId: string) {
  setGaDisabled(measurementId, true)
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ...DENIED_AD_CONSENT,
    })
  }
  removeAnalyticsCookies()
  removeGoogleAnalyticsScripts()
  storeConsent("rejected")
}

export function acceptAnalytics(measurementId: string) {
  setGaDisabled(measurementId, false)
  storeConsent("accepted")
}

export function sendSanitizedPageView(origin: string, pathname: string) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false
  if (readStoredConsent() !== "accepted") return false
  window.gtag("event", "page_view", pageViewPayload(origin, pathname))
  return true
}

export const LEAD_CONVERSION_EVENT = "generate_lead"

export const LEAD_TYPES = ["homepage_enquiry", "contact", "assessment", "guard_setup"] as const

export type LeadType = (typeof LEAD_TYPES)[number]

/**
 * Only the fixed service enums may travel with a conversion. Derived from the
 * form option lists so an unexpected or free-text value cannot be forwarded.
 */
const APPROVED_SERVICE_TYPES: ReadonlySet<string> = new Set<string>([
  ...CASE_SERVICES.map((service) => service.value),
  ...GENERAL_SERVICE_OPTIONS.map((option) => option.value),
])

export type LeadConversionPayload = {
  lead_type: LeadType
  service_type?: string
}

/**
 * The complete set of parameters a conversion may carry. Nothing a visitor
 * typed, and no contact, case or submission identifier, belongs here.
 */
export function leadConversionPayload({
  leadType,
  serviceType,
}: {
  leadType: LeadType
  serviceType?: string
}): LeadConversionPayload {
  const payload: LeadConversionPayload = { lead_type: leadType }
  if (serviceType && APPROVED_SERVICE_TYPES.has(serviceType)) payload.service_type = serviceType
  return payload
}

/**
 * Records a successful lead submission as a GA4 `generate_lead` event.
 *
 * Sends nothing unless analytics is already running with accepted consent:
 * this never initialises gtag and never bypasses the GoogleAnalytics
 * component. Callers must only invoke it after a genuine, non-simulated
 * success, since one call emits one event.
 */
export function sendLeadConversion({
  leadType,
  serviceType,
}: {
  leadType: LeadType
  serviceType?: string
}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false
  if (readStoredConsent() !== "accepted") return false
  if (!LEAD_TYPES.includes(leadType)) return false
  window.gtag("event", LEAD_CONVERSION_EVENT, leadConversionPayload({ leadType, serviceType }))
  return true
}

export function subscribeConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange)
  return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, onStoreChange)
}

export function getConsentSnapshot() {
  return readStoredConsent()
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}
