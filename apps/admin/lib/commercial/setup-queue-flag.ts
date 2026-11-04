/**
 * Read-only paid setup queue.
 *
 * Exactly "true" calls admin_commercial_setup_queue_v1. Every other value
 * leaves the page closed and does not query that function. This flag does not
 * provision Telloya, activate Guard, collect a payment, or send mail.
 */
export function commercialSetupQueueEnabled() {
  return process.env.ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED === "true"
}
