/**
 * Server lane for operator-attested Telloya provider evidence.
 *
 * VERCEL_ENV is set by the deployment, not by the browser.
 * production authorises production evidence.
 * preview and development authorise dev evidence.
 * Any other value, including a missing value, leaves recording closed.
 * This module does not read a provider credential.
 */
export type CommercialProviderLane = "dev" | "production"

export function commercialProviderLane(): CommercialProviderLane | null {
  const lane = process.env.VERCEL_ENV
  if (lane === "production") return "production"
  if (lane === "preview" || lane === "development") return "dev"
  return null
}
