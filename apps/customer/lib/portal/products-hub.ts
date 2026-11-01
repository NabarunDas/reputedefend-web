/**
 * My Products and /portal/recovery.
 *
 * Exactly "true" opens those routes. Every other value, including an empty
 * string, leaves them closed. Preview and Production are separate deployments,
 * so an enabled DEV value is not copied here and Production does not inherit it.
 * This flag does not replace /portal and does not enable Telloya or a purchase.
 */
export function productsHubEnabled() {
  return process.env.CUSTOMER_PRODUCTS_HUB_ENABLED === "true"
}
