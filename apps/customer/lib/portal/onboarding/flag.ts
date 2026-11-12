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

/**
 * Session-scoped commercial offer read.
 *
 * Exactly "true" calls customer_portal_commercial_offer_v1. Every other value
 * leaves the offer page closed and does not query that function. This flag
 * does not accept an offer. Preview and Production do not inherit a DEV value.
 */
export function commercialOfferReadEnabled() {
  return process.env.CUSTOMER_COMMERCIAL_OFFER_READ_ENABLED === "true"
}

/**
 * Session-scoped commercial offer acceptance.
 *
 * Exactly "true" allows the acceptance command. Every other value hides the
 * acceptance action and does not call the command. A readable offer does not
 * enable acceptance. Preview and Production do not inherit a DEV value.
 */
export function commercialOfferAcceptEnabled() {
  return process.env.CUSTOMER_COMMERCIAL_OFFER_ACCEPT_ENABLED === "true"
}

/** Exactly "true" lets a signed-in customer request a change to an open Telloya offer. */
export function telloyaAmendmentEnabled() {
  return process.env.TELLOYA_ADMIN_JOURNEY_ENABLED === "true"
}

/**
 * Session-scoped commercial checkout preparation.
 *
 * Exactly "true" allows the payment-preparation command. Every other value
 * hides the payment action and does not call the command. This flag does not
 * choose a Stripe mode, override the provider lane, collect a payment, grant
 * an entitlement, or activate a service. Preview and Production do not inherit
 * a DEV value.
 */
export function commercialCheckoutEnabled() {
  return process.env.CUSTOMER_COMMERCIAL_CHECKOUT_ENABLED === "true"
}

/**
 * Session-scoped post-payment setup handover.
 *
 * Exactly "true" reads customer_portal_setup_handover_v1 for the signed-in
 * customer. Every other value leaves the setup page closed and does not query
 * that function. This flag does not provision Telloya, activate Guard, collect
 * a payment, or send mail. Preview and Production do not inherit a DEV value.
 */
export function commercialSetupHandoverReadEnabled() {
  return process.env.CUSTOMER_COMMERCIAL_SETUP_HANDOVER_READ_ENABLED === "true"
}
