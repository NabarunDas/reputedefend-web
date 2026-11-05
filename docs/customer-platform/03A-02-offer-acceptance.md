# 03A-02 Customer commercial offer and agreement acceptance

A signed-in customer can read a prepared Telloya or Complete offer and, when acceptance is switched on, accept that exact offer. This phase does not take a payment, create an entitlement, open Guard coverage, or activate a service.

## What is reused

The customer portal session, verified business membership, commercial subscription, plan version, onboarding request, and command-receipt pattern stay in place. The offer selector is the existing commercial `public_ref`.

Recovery case agreements and `paid_service_acceptances` are not reused. A Telloya or Complete acceptance does not attach to a Recovery case.

`onboarding_requests` has no `ACCEPTED` state. A valid acceptance leaves the request state unchanged and moves only the linked commercial subscription from `OFFERED` to `ACCEPTED`.

## Agreement gate

`terms_ref` on a plan is not an agreement. `public.commercial_agreement_versions` stores the product-scoped title, body, cancellation text, required confirmations, and content hash. This phase does not approve a plan or an agreement and does not seed either.

An offer can be accepted only when an `APPROVED` agreement exists for the same product and the plan's `terms_ref`, and an `APPROVED` `commercial_plan_conditions` row identifies the Telloya tier and the commercial conditions. A missing or unapproved agreement is `terms_pending`. Missing approved conditions are `conditions_pending`. The customer sees that the missing part is not available. No wording, minutes, Guard price, or spending cap is invented, and no consent is stored.

Marketing prices are not copied into a plan or an offer. Basic, Growth, Pro, and Custom remain Telloya tiers. Relaunch Guard is optional coverage on that plan, not another AI tier. Additional usage is recorded only when the approved conditions include a rate, the customer opts in separately from the recurring charge, and the customer enters a monthly spending cap. Accepting the base subscription does not authorise extra usage charges.

## Read

`public.customer_portal_commercial_offer_v1(p_token_hash text, p_selector text)` is service-role only. The session comes from `customer_portal_session_v1`. An invalid, expired, idle, or revoked session returns null.

The selector must be a commercial public reference. The function does not accept a customer id or a business id. A missing selector, another customer's subscription, and a subscription with no matching request all return `{status: unavailable}` with no commercial detail. Pending or revoked membership on the customer's own subscription returns unavailable with reason `authority` and no price.

An eligible offer requires a verified membership, an `OFFERED` billable subscription, a current approved plan whose price, tax, cadence, currency, and terms match the subscription snapshot, and an approved agreement for that product. The response contains the presentation facts only.

`CUSTOMER_COMMERCIAL_OFFER_READ_ENABLED` must be exactly `true`. It does not enable acceptance.

## Acceptance

`public.customer_portal_commercial_offer_command_v1` runs in one transaction. It locks the subscription, classifies it again, and checks the submitted offer version, price, tax, cadence, agreement reference, affirmative agreement acceptance, recurring consent for `MONTH` or `YEAR`, and every required confirmation.

On success it sets the subscription to `ACCEPTED`, inserts one immutable `commercial_offer_acceptances` row, and appends an `OFFERED` to `ACCEPTED` commercial subscription event. The acceptance stores the agreement version, full terms snapshot, content hash, product, business, locations, pricing, currency, tax, cadence, the session email, the authenticated actor, and the server timestamp.

The same idempotency key and the same submission return the original result and do not insert a second acceptance. A different submission for that key, a stale price, a different tax amount, or a selector that does not match the submitted snapshot returns conflict and does not accept a different offer. A later request for an offer that is already accepted also returns conflict when the tax amount, the required confirmations, or the recorded commercial conditions differ. The command locks the subscription, then the plan row, then the approved conditions, then the approved agreement. It rechecks the plan status, effective window, product, price, tax, currency, cadence, and terms reference under that plan lock. A plan retired before that lock is acquired is not accepted. A withdrawal that commits first leaves the row outside `OFFERED`, so the acceptance update matches nothing.

The subscription is not set to `PAID`, `ACTIVE`, or `LIVE`. No entitlement, payment evidence, Guard allocation, or service provision is created.

## Customer pages

`/portal/onboarding/offer/[selector]` shows the Telloya tier, business, locations, included services, included minutes, recurring base charge, optional Guard coverage and price, additional-usage policy, cadence, tax treatment, total, the agreement, and the cancellation text. The stored tax fact is inclusive, exclusive, or not applicable. The page calls that applicable tax and does not rename it VAT. Guard is described as optional coverage and is not described as active.

Accept offer is shown only when `CUSTOMER_COMMERCIAL_OFFER_ACCEPT_ENABLED` is exactly `true`, after the terms are on the page. The consent boxes start unchecked. A successful acceptance returns to the same offer, which is then a read-only accepted record. Setup progress says Offer accepted and explains that payment and service setup follow separately.

Both flags stay off until the migration, the agreements, and the plans are verified. This change does not set a Vercel variable.

## Migration

`20261103120000_customer_portal_onboarding_status_v1` remains applied on DEV. When it was applied, the verified DEV ledger contained 98 entries and ended there. Do not replay it. Do not apply it to Production.

`20261103140000_customer_commercial_offer_acceptance_v1` was applied once to DEV. When it was applied, the verified DEV ledger contained 99 entries and ended there. The ledger before the payment preparation contained 100 entries and ended at `20261103200518`. The ledger before the payment settlement contained 102 entries and ended at `20261103230000`. The ledger before the payment verification contained 101 entries and ended at `20261103213000`. The ledger before the setup handover contained 103 entries and ended at `20261104190000`. The current verified DEV ledger contains 104 entries and ends at `20261104220000`. Do not replay `20261103140000`. Do not apply `20261103140000` to Production. Production is unchanged. It did not approve a plan or an agreement, and it did not create a subscription, payment, or acceptance. Customer commercial offer read and accept flags remain off. It replaces the private onboarding status function so an eligible offer can be reviewed and an accepted subscription can show Offer accepted. The original onboarding file is not rewritten.
