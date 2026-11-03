/**
 * Session-scoped onboarding progress read.
 *
 * Exactly "true" calls customer_portal_onboarding_status_v1. Every other value
 * leaves My Products unchanged and does not query that function. This flag
 * does not accept an offer, collect a payment, grant an entitlement, or open
 * a Telloya workspace. Preview and Production do not inherit a DEV value.
 */
export function onboardingStatusReadEnabled() {
  return process.env.CUSTOMER_ONBOARDING_STATUS_READ_ENABLED === "true"
}
