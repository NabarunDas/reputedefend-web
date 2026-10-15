# COM-13A acceptance specification

Status: acceptance foundation is in source. `supabase/migrations/20261014234000_paid_service_acceptance_v1.sql` and `supabase/migrations/20261015013000_paid_service_acceptance_gate_v1.sql` are additive and are not applied to DEV or Production. The catalogue row for `PS-2026-10-14.2` is inserted with status `SOLICITOR_REVIEW` and `operative` false. COM-13B retires `confirm_paid_service_agreement_v1`: a caller-supplied actor and the predictable statement are not approval. `admin_confirm_paid_service_agreement_v1` can record an authenticated operator, an actual external evidence reference, this version and SHA-256 `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`, but neither migration calls it. On 2026-10-15 the business owner reported that a solicitor reviewed and approved the wording of this exact version and hash. That report is owner-reported confirmation. It is not a solicitor document, signature, or evidence reference, and it does not make the catalogue operative. Stripe, the Customer Portal, Guard activation and mail automation stay behind their existing gates.

The paid-service text is version `PS-2026-10-14.2` in `lib/commercial/paid-service-agreement.ts`. `PS-2026-10-14.1` was an earlier internal draft and was not accepted by any customer. The customer sees that body only when the quotation is bound to this version and hash and the catalogue row is `APPROVED` and operative. Until an authenticated operator records an actual external evidence reference, `operative` is false and the acceptance screens fail closed. The generic website terms page is not this agreement. The canonical body is the customer contract only. Approval status, the database tax gate and the content hash stay outside that body.

Managed card-setup stop: `MANAGED_PAYMENT_SETUP` and `SUCCESS_FEE_CONSENT_V1` describe an off-session card charge. The approved Managed model invoices the success fee after documented success and does not charge a card automatically. The secure-link and Customer Portal screens do not offer that card setup. Live Stripe stays disabled. Do not enable Managed card setup until that workflow is retired or rewritten to the invoice-after-success model.

## What already exists

Quote acceptance is a `QUOTE_ACCEPTANCE` customer action pinned to `quote_version_id`. The applied catalogue and portal migrations refuse acceptance while `tax_behaviour` is `UNCONFIRMED`. That block stays. COM-12A does not change it to `NOT_APPLICABLE`.

A service agreement is an immutable `agreement_versions` row. `admin_private.agreement_content_hash_v1` hashes the JSON array of kind, title, body and scope with SHA-256. Acceptance is an `authorization_records` row created through the existing OTP customer action. The current customer control is one statement: “I have read and agree to this service agreement and scope.” Case-management permission is a separate kind, `CASE_MANAGEMENT_PERMISSION`.

`SUCCESS_FEE_CONSENT_V1` is a different text. It says a payment method may be used off-session for the success fee. The COM-12A draft forbids an automatic Managed card charge and forbids collecting the success fee in advance. COM-13A must not treat `SUCCESS_FEE_CONSENT_V1` as acceptance of `PS-2026-10-14.2`.

Relaunch Guard already has `GUARD_RECURRING_CONSENT_V1` and `GUARD_CANCELLATION_TERMS_V1`. The draft preserves the published cancellation, unused-period refund and free-period no-auto-conversion promises. It does not activate Guard.

The Customer Portal opens only when `CUSTOMER_PORTAL_ENABLED` is exactly `true` and the customer backend is configured. This specification does not enable that flag.

## Three separate confirmations

Each confirmation starts unchecked. The server stores each one. A browser checkbox is not acceptance.

1. Business-purpose and authority. The customer confirms they are acting for the business and are authorised to bind it for the quotation’s location.
2. Quotation and versioned commercial terms. The customer accepts one `quote_version_id` together with one agreement version and its content hash.
3. The fee basis that applies. A Managed quotation needs a contingent success-fee acknowledgement that no fee is collected before documented success and that no card is charged automatically. A Guard quotation needs the existing recurring-payment consent for that location and price. A Guided quotation has no success-fee acknowledgement and no recurring consent.

A Managed order does not reuse the Guard consent. A Guard order does not reuse the success-fee acknowledgement.

## Server enforcement

The accepting RPC re-checks the customer session, the verified membership, and that the case belongs to that customer, business and location. It refuses a hash that does not match the approved version body. It refuses `tax_behaviour = UNCONFIRMED`. It refuses a missing business-purpose confirmation, a missing terms acceptance, or a missing fee-basis confirmation where that basis applies.

The stored acceptance records the agreement version, the content hash, the accepted quotation, the customer identifier, and the acceptance timestamp. Replaying the same idempotency key returns the original acceptance and does not insert a second obligation. The customer can download the snapshot that was accepted. A later edit of the draft does not change that snapshot.

## What COM-13A must not do

Do not update historical `agreement_versions`, `authorization_records` or `quote_acceptances` to point at the new text. Do not mark an old acceptance as acceptance of `PS-2026-10-14.1`. Do not enable Stripe live mode, Checkout, invoice issuance, refunds or charges. Do not enable the Customer Portal or a Guard or mail feature gate. Do not change published prices.

## Additive database change

COM-12A did not add this migration. COM-13A adds it for review and does not apply it. It adds, and does not rewrite:

- a catalogue row for `PS-2026-10-14.2` and its SHA-256, inserted as `SOLICITOR_REVIEW` with `operative` false until the exact confirmation is recorded;
- an acceptance row linking customer, case, quote version, agreement version and content hash, with the three confirmation timestamps;
- a check that `UNCONFIRMED` tax still cannot be accepted.

Tax resolution itself, including any move away from `UNCONFIRMED`, is a separate commercial migration. It is not bundled into the acceptance migration and it is not a global VAT-zero shortcut.

No such migration is in COM-12A.
