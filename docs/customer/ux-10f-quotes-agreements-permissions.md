# UX-10F — Customer quotes, agreements and permissions

UX-10F lets a signed-in customer review and complete the commercial steps that already exist for an owned case:

- review the offered quote snapshot
- accept or decline that quote
- review and accept or decline the Service Agreement
- review and accept or decline Case Management Permission
- see the current accepted, declined, expired, or withdrawn state
- complete an existing eligible authorization-revocation action

The Customer Portal is not launched. `CUSTOMER_PORTAL_ENABLED` stays unset. Guard, messaging, account editing, and Stripe stay outside this phase. After a quote is accepted, payment or payment-method setup is described as the next step. UX-10G later moved that step into the customer Payments area. The emailed secure payment link remains. The UX-10G migration has not been applied.

## Route

`/portal/cases/[reference]/service` is titled **Service and permissions**. The case workspace links here as "Service and permissions". Portal navigation stays Dashboard, Cases, Documents, Payments, Relaunch Guard, and Account. Payments stays disabled.

`POST /api/portal/service` is the only mutation route. The browser sends the public case reference, an opaque action selector, the operation, and a confirmation object. The server supplies the portal session hash and the idempotency UUID.

## Ownership

Every read and write starts from `admin_private.customer_portal_session_v1(p_token_hash)`. The customer, verified auth user, and verified email are derived on the server. A customer may act only when the case is owned, the action belongs to that case and customer, the action email matches the verified portal email, the action is still eligible, and the quote, agreement, or authorization scope still matches.

The browser does not send a customer id, case UUID, business id, location id, action UUID, agreement version, authorization id, quote id, quote version, service order id, or Auth user id as authority. Sharing a business or location is not enough. An invalid session returns SQL `NULL` and the page redirects to `/login`. A missing or unowned reference returns exactly `{ "found": false }` and the page calls `notFound()`.

The emailed secure-action session and the portal session stay separate. The portal does not require the action cookie, and it does not create an action session from the portal session.

## Identifiers

The case URL uses the public case reference. The quote reference and, after acceptance, the service-order reference are shown because they are public. An actionable customer action uses a stable selector, `ca-` plus the SHA-256 digest of the action id. The selector is not a secret and it is not authority. Each mutation resolves it again against the portal session, the owned case, and the current eligible action. A selector that no longer matches fails closed.

Internal UUIDs, action secrets, secure-link tokens, expected email addresses, and payment-provider references are not rendered.

## Quote, agreement, and permission

The page shows the immutable quote snapshot: reference, service name, scope, exclusions, success definition, standard amount, discount where one was stored, quoted amount, tax where the snapshot records it, total, currency, payment timing, valid until, and terms reference. Prices are not recomputed from the current catalogue. A quote with unconfirmed tax cannot be accepted. Decline still uses the existing open action.

Service Agreement and Case Management Permission show the stored title, body, scope, version, and current status. Acceptance requires an explicit confirmation in the page. The database mutation remains the authority. An accepted permission creates the existing `authorization_records` row. `authorization_records.source` stays `CUSTOMER_OTP` because the portal identity was OTP-verified. Portal provenance is recorded as `source: CUSTOMER_PORTAL` on agreement and revocation event details where the schema already allows it.

Declining an agreement or withdrawing a permission does not cancel a service order. Revocation is offered only when an eligible open `AUTHORIZATION_REVOCATION` action already exists for an active authorization on the owned case. The portal does not create that action.

Closed or cancelled cases can still show historical records. They cannot accept or revoke.

## Shared mutation

Quote acceptance, quote decline, agreement acceptance, agreement decline, and authorization revocation live in one private helper, `admin_private.customer_commercial_apply_v1`. It locks the action, rechecks eligibility, expiry, email, and scope, and writes the existing domain and audit events.

`admin_private.customer_action_command_core_v1` calls that helper for `QUOTE_ACCEPTANCE`, `AGREEMENT_ACCEPTANCE`, and `AUTHORIZATION_REVOCATION`, with channel `CUSTOMER_OTP`. Guard permission stays in the core. The public `customer_action_command_v1` wrapper is unchanged, so guard subscription commands and the existing request and response contract stay as they were. Quote acceptance still calls `admin_private.accept_quote_version_v1`, which creates exactly one `quote_acceptance` and one `service_order`.

The portal command is `public.customer_portal_service_command_v1`. Its operations are `accept_quote`, `decline_quote`, `accept_agreement`, `decline_agreement`, and `revoke_authorization`. An operation must match the action kind the selector resolves to. The same helper runs with channel `CUSTOMER_PORTAL`.

Identical replay of a portal request returns the stored result. The same idempotency key with a different operation, selector, or payload returns a conflict. A quote accepted in one channel cannot create a second order from the other channel.

## Attention

`QUOTE_ACCEPTANCE`, `SERVICE_AGREEMENT`, and `CASE_PERMISSION` link to `/portal/cases/{reference}/service`. `EVIDENCE_REQUIRED` stays on the documents route. UX-10G later points `GUIDED_PAYMENT`, `MANAGED_PAYMENT_SETUP`, `PAYMENT_RECOVERY`, and `INVOICE_PAYMENT` at `/portal/cases/{reference}/payments`.

## Migration

`supabase/migrations/20261003204538_customer_portal_quotes_agreements_permissions_v1.sql` is additive. It does not create a table and it does not edit an applied migration.

Public functions, granted only to `service_role`:

- `public.customer_portal_case_service_v1(text, text)`
- `public.customer_portal_service_command_v1(text, uuid, text, text, text, jsonb)`

Private helpers, not executable by `PUBLIC`, `anon`, `authenticated`, or `service_role`:

- `admin_private.customer_portal_action_selector_v1(uuid)`
- `admin_private.customer_commercial_apply_v1(...)`
- `admin_private.customer_portal_quote_view_v1(uuid, uuid, text)`
- `admin_private.customer_portal_agreement_view_v1(uuid, uuid, text, text)`
- `admin_private.customer_portal_service_actions_v1(uuid, uuid, text)`

`admin_private.customer_action_command_core_v1` is replaced so the secure-link path delegates commercial mutations to the shared helper.

The migration was applied to `profilerelaunch-dev` on 2026-10-03 after independent review. Supabase MCP initially registered `20261003220517`; that single history row was repaired immediately to repository version `20261003204538`. `appliedMigrationHead` remains `20261003204538_customer_portal_quotes_agreements_permissions_v1.sql`. UX-10G later added pending repository head `20261003224746_customer_portal_payments_receipts_v1.sql`. That file has not been applied, so `pendingMigrations()` returns it. The UX-10F migration is immutable.
