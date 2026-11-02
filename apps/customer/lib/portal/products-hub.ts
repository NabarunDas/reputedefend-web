/**
 * My Products landing.
 *
 * Exactly "true" opens /portal/products and /portal/recovery, and sends a
 * valid session from /portal to My Products. Every other value leaves those
 * routes closed and keeps /portal on the Recovery dashboard. This flag does
 * not enable Telloya, send mail, or record a purchase.
 */
export function productsHubEnabled() {
  return process.env.CUSTOMER_PRODUCTS_HUB_ENABLED === "true"
}
