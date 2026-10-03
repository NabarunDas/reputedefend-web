# UX-10G — Customer payments and receipts

UX-10G lets a signed-in customer see the payment position for cases they own and take the payment actions that already exist:

- review amount, currency, tax note, and obligation state from the stored commercial record
- continue a guided checkout, a payment-method setup, or a payment-recovery authentication
- record the existing managed-service success-fee consent
- open an issued hosted invoice through an authorised redirect
- download a customer-owned receipt as a short-lived text projection

The Customer Portal is not launched. `CUSTOMER_PORTAL_ENABLED` stays unset. UX-10H, UX-10I, and UX-10J are not started. Relaunch Guard, messages, account editing, and live Stripe stay outside this phase. Checkout is prepared by the existing payment command. When the payment provider is disabled, the customer sees that secure checkout is not available yet. The page does not mark a payment paid.

## Routes

`/portal/payments` lists owned cases that already have a service order. `/portal/cases/[reference]/payments` is the same view for one owned case. Portal navigation links Payments. The case workspace links “Payments for this case”. After a quote is accepted, the service page points at the case payments route.

`POST /api/portal/payments` is the mutation route. The browser sends the public case reference, an opaque action selector, the operation, and a confirmation object. The server supplies the portal session hash and the idempotency UUID.

`GET /api/portal/payments/receipt` returns a `text/plain` attachment for one owned receipt. `GET /api/portal/payments/invoice` redirects to the stored hosted invoice URL after the same ownership checks. The page HTML and the payments projection do not contain that URL.

## Ownership

Every read, command, receipt download, and invoice redirect starts from `admin_private.customer_portal_session_v1(p_token_hash)`. The customer, verified auth user, and verified email are derived on the server. A route, query string, form body, or client payload cannot supply a customer id.

A customer may act only when the case is owned, the action belongs to that case and customer, the action email matches the verified portal email, and the action is still eligible. Sharing a business or location is not enough. An invalid or revoked session returns SQL `NULL` and the page redirects to `/login`. A missing or unowned reference returns exactly `{ "found": false }` and the case page calls `notFound()`.

The emailed secure-action session and the portal session stay separate. The portal does not require the action cookie, and it does not create an action session from the portal session.

## Identifiers

The case URL uses the public case reference. The service-order reference is shown because it is public. An actionable customer action uses the existing selector, `ca-` plus the SHA-256 digest of the action id. A receipt uses `rc-` plus the SHA-256 digest of the receipt id. Neither selector is a secret or authority. Each mutation and download resolves it again against the portal session and the owned case.

Internal UUIDs, storage paths, provider customer, payment, checkout, invoice, charge, and method identifiers, card brand, last four digits, signed URLs, and the provider receipt URL are not rendered. The receipt download does not redirect to the provider receipt URL.

## Payment position

Obligation states already stored on `payment_obligations` are shown as:

| State | Customer heading | Next action when an eligible action exists |
| --- | --- | --- |
| `DUE` | Payment required, or Success fee required | Continue to secure checkout for an upfront guided payment |
| `COLLECTING` | Payment pending | Continue secure checkout. The payment is not marked paid |
| `AUTHENTICATION_REQUIRED` | Authentication required | Continue authentication |
| `FAILED` | Payment was not completed | Try secure checkout again, or try authentication again |
| `PAID` | Paid | No checkout button. A receipt can be downloaded |
| `VOID` | Void | No checkout button |

There is no separate refunded state. A voided obligation is the stored void state. The portal does not invent invoice numbers, due dates, tax treatment, legal wording, or payment terms. Tax wording follows the stored behaviour: included, shown separately, or does not apply.

Managed-service orders show whether a usable saved payment method exists and whether success-fee consent is recorded. The consent text is the stored canonical text. Recording consent does not create a charge, an attempt, or a receipt. Saving a payment method uses the existing setup checkout.

An issued invoice with a stored hosted URL offers “Open invoice”. Opening it does not mark the invoice paid. A draft invoice is omitted. An issued invoice without a URL says the hosted invoice link is not available yet.

## Shared mutation

Guided checkout, managed setup, recovery checkout, and success-fee consent stay in one private helper, `admin_private.customer_payment_apply_v1`. It is the body that previously lived in `public.customer_payment_command_v1`.

`public.customer_payment_command_v1` still resolves the emailed action session and delegates to that helper with channel `CUSTOMER_OTP`. Its request and response contract is unchanged, including `needs_cancel` and the provider identifiers the existing TypeScript checkout step needs.

The portal command is `public.customer_portal_payment_command_v1`. Its operations are `confirm_consent` and `start_checkout`. An operation must match the action kind the selector resolves to. The same helper runs with channel `CUSTOMER_PORTAL`.

`admin_private.customer_action_command_core_v1` is not changed. Quote acceptance, agreement acceptance, authorization revocation, and Guard permission stay on that path.

Identical replay of a portal request returns the stored result from `admin_private.customer_action_command_receipts`. The same idempotency key with a different operation, selector, or payload returns a conflict. A second checkout reuses the active attempt. Nothing in this phase sets an obligation to `PAID`. Returning from checkout does not mark a payment successful.

## Attention

`GUIDED_PAYMENT`, `MANAGED_PAYMENT_SETUP`, `PAYMENT_RECOVERY`, and `INVOICE_PAYMENT` link to `/portal/cases/{reference}/payments`. Evidence stays on the documents route. Quote, agreement, and permission stay on the service route.

## Migration

`supabase/migrations/20261003224746_customer_portal_payments_receipts_v1.sql` is additive. It does not create a table, grant table access, or add an index. Lookups use the existing customer, case, and order keys. Selectors are computed. The file header still describes the pre-application review; that text is left unchanged because the applied file is immutable.

Public functions, granted only to `service_role`:

- `public.customer_portal_payments_v1(text)`
- `public.customer_portal_case_payments_v1(text, text)`
- `public.customer_portal_payment_command_v1(text, uuid, text, text, text, jsonb)`
- `public.customer_portal_receipt_v1(text, text)`
- `public.customer_portal_invoice_target_v1(text, text, text)`
- `public.customer_payment_command_v1(text, uuid, text, jsonb)` is replaced so the secure-link path delegates to the shared helper

Private helpers, not executable by `PUBLIC`, `anon`, `authenticated`, or `service_role`:

- `admin_private.customer_portal_receipt_selector_v1(uuid)`
- `admin_private.customer_payment_apply_v1(...)`
- `admin_private.customer_portal_case_payments_body_v1(uuid, uuid, text)`

The migration was applied to `profilerelaunch-dev` on 2026-10-03 after independent review. Supabase MCP initially registered `20261003234725`; that single history row was aligned to repository version `20261003224746` without replaying the schema. `appliedMigrationHead` and `migrationHead` both point to `20261003224746_customer_portal_payments_receipts_v1.sql`, and `pendingMigrations()` is empty. The migration is immutable. Do not replay it. Production has not received it.

Rollback is a later migration that drops the new functions and restores `public.customer_payment_command_v1` from `20260930132106_stripe_payments_v1.sql`. Do not edit that applied file. A forward fix is a later `CREATE OR REPLACE` of these functions.
