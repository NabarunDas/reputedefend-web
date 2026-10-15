# COM-14A commercial eligibility

Status: source-only. `supabase/migrations/20261015140000_commercial_eligibility_gate_v1.sql` is additive and has not been applied to DEV or Production. AWS ApprovedMigrationHead stays at `20261014170000`. The paid-service catalogue stays `SOLICITOR_REVIEW` and inoperative. Stripe live mode, the Customer Portal, Guard and mail automation stay off.

The seed is a review backlog. Every listed country is `PENDING_REVIEW`. There is no `APPROVED` row. An EU, rest-of-world or global approval is not a valid key. A missing row is also pending. `UK` is not a country code; the receiving establishment uses `GB`.

Non-VAT-registration is not worldwide zero-rated VAT. `UK_DOMESTIC_NOT_VAT_REGISTERED` can be approved only for `GB`. `UNCONFIRMED` tax still blocks an offer and an acceptance. A country, service or payment-flow approval does not transfer to another country, service or flow.

Contract prices stay in GBP. Local-currency presentment is recorded only after an approval names a Stripe-supported currency, and no foreign-exchange rate is invented. A stored Checkout or Guard receipt is checked again before it is replayed. If the decision is no longer approved, the customer receives the enquiry message and the previous provider operation is not returned.

## Still for the accountant

No country below is authorised for a paid sale. Each needs its own decision, evidence of the customer's receiving establishment, and a matching service and payment flow.

- United Kingdom (`GB`), domestic supply while ProfileRelaunch Ltd is not VAT registered.
- Each EU member separately, starting with IE, DE, FR, NL, ES and IT. Not a single EU code.
- United States, one decision per state that will actually be sold to.
- Canada, one decision per province that will actually be sold to.
- AU, NZ, SG, AE and IN.
- Every other country remains pending until a decision is recorded.

The seller's VAT position, whether a reverse charge is supportable, and whether the supplier must register before invoicing are accountant decisions. Stripe Tax is not a registration.

## Still for the owner

- The solicitor approval of PS-2026-10-14.2 still needs an authenticated Admin record with a real external evidence reference. Owner-reported confirmation does not make the catalogue operative.
- DEV application of this migration, then Production, only after the usual backup and `ApprovedMigrationHead` review.
- Live Stripe, Customer Portal, Guard and email remain separate activation decisions.
