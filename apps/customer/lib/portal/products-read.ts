/**
 * Session-scoped My Products entitlement projection.
 *
 * Exactly "true" reads customer_portal_products_v1 while My Products is open.
 * Every other value leaves ProfileRelaunch and Telloya without a commercial status.
 * This flag does not open the hub, send mail, grant an entitlement, or open a
 * Telloya workspace. Preview and Production do not inherit a DEV value.
 */
export function productsReadEnabled() {
  return process.env.CUSTOMER_PRODUCTS_READ_ENABLED === "true"
}
