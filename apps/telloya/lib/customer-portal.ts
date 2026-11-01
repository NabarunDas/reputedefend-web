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
 * 
 * - Production (VERCEL_ENV=production): Uses canonical production portal
 * - DEV Preview (VERCEL_ENV=preview + VERCEL_GIT_COMMIT_REF=develop): Uses approved DEV portal
 * - Feature branch previews: Use production portal (safest default)
 * - Local development: Uses production portal
 * 
 * No arbitrary destinations are allowed through environment variables or query parameters.
 * This prevents separate Telloya login and preserves existing customer OTP/session implementation.
 */
export function getCustomerPortalHref(): string {
  const vercelEnv = trimEnv(process.env.VERCEL_ENV)
  const gitRef = trimEnv(process.env.VERCEL_GIT_COMMIT_REF)
  
  // Only the approved develop preview uses DEV portal
  if (vercelEnv === "preview" && gitRef === "develop") {
    return DEV_CUSTOMER_PORTAL_HREF
  }
  
  // Everything else uses production portal (safest default)
  return PRODUCTION_CUSTOMER_PORTAL_HREF
}
