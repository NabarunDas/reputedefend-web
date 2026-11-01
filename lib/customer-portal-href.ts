/**
 * The only Customer Portal addresses Marketing navigation may publish.
 *
 * Production is the canonical portal. DEV is the verified develop preview
 * already named by the customer message allowlist. A similarly named Vercel
 * hostname is not approved, and nothing here accepts a caller-supplied path
 * or query.
 */
export const PRODUCTION_CUSTOMER_PORTAL_HREF = "https://customer.profilerelaunch.com/portal"

export const DEV_CUSTOMER_PORTAL_HREF =
  "https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal"

const APPROVED_PORTAL_HREFS = new Set([
  PRODUCTION_CUSTOMER_PORTAL_HREF,
  DEV_CUSTOMER_PORTAL_HREF,
])

export function isCustomerPortalHref(value: string | null | undefined): value is string {
  return typeof value === "string" && APPROVED_PORTAL_HREFS.has(value)
}
