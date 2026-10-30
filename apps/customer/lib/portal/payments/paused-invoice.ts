/**
 * Customer copy for a `collection_paused` result.
 *
 * `customer_portal_invoice_target_v1` and `customer_portal_invoice_document_v1`
 * return `{ status: "collection_paused" }` when an OPEN or UPHELD success-fee
 * collection pause exists for the obligation. Both functions return that
 * status before they read `payment_invoices`, and the payload has no Stripe
 * invoice status. It proves collection is withheld. It does not prove whether
 * the provider invoice is open, void, or cancelled.
 */
export const PAUSED_INVOICE_MESSAGE =
  "Payment collection is temporarily paused while the outcome is reviewed. The payment link is unavailable during this review. We'll let you know if anything further is needed."
