/**
 * Approved customer portal navigation for Telloya marketing.
 * 
 * Reuses the vetted portal URL pattern from root marketing to ensure
 * proper login navigation without exposing secrets or creating invalid
 * preview redirects.
 */

import { 
  PRODUCTION_CUSTOMER_PORTAL_HREF,
  DEV_CUSTOMER_PORTAL_HREF,
} from "../../../lib/customer-portal-href"

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

/**
 * Returns the appropriate customer portal URL based on environment.
 * DEV environment (develop branch preview) uses the approved DEV portal URL.
 * Production uses the canonical portal URL.
 */
export function getCustomerPortalHref(): string {
  const vercelEnv = trimEnv(process.env.VERCEL_ENV)
  
  if (vercelEnv === "preview" && trimEnv(process.env.VERCEL_GIT_COMMIT_REF) === "develop") {
    return DEV_CUSTOMER_PORTAL_HREF
  }
  
  return PRODUCTION_CUSTOMER_PORTAL_HREF
}
