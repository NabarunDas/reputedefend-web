# 03A-03-01 Commercial subscription payment preparation

An accepted Telloya or Complete offer can reserve one monthly checkout preparation. This phase does not collect a payment, create payment evidence, grant an entitlement, or activate a service.

## Current and target architecture

The shared payment lane stays the only Stripe integration.

| Concern | Already in place | This phase |
| --- | --- | --- |
| Stripe client and event mapping | `PaymentProvider`, `lib/payments/stripe.ts`, `mapEvent` | Reused. No second client and no second event processor. |
| Customer mapping | `payment_prepare_customer_v1`, `createCustomer`, `payment_record_customer_map_v1`, `stripe_customer_maps` | Reused when a preparation has no mapped customer. |
| Recurring price and subscription Checkout | `createRecurringPrice`, `createSubscriptionCheckout` | Optional commercial descriptor. Guard calls that omit it stay on the Guard product and Guard metadata. |
| URL and lane checks | `trustedStripeUrl`, `guardExternalPayment`, livemode agreement | Reused. A fake Checkout host is local only. |
| Provider operations | `provider_operations` idempotency, `payment_record_provider_refs_v1` | Two new purposes, `COMMERCIAL_PRICE` and `COMMERCIAL_CHECKOUT`, tied to one commercial subscription. |
| Commercial record | Subscription, items, acceptance, plan conditions, payment-evidence guard | Acceptance snapshot is the amount authority. `ACCEPTED` can become `PAYMENT_PENDING` only inside the preparation command. |
| Customer pages | Accepted offer and shared Billing page | Payment readiness on those pages. No Telloya billing dashboard. |

The gap this phase closes is that a commercial subscription checkout has no Recovery service order and no Guard subscription. The existing eligibility trigger would otherwise classify that checkout as Guard work. The new migration exempts only a `COMMERCIAL_CHECKOUT` operation that already names a commercial subscription and names no service order, obligation, or Guard subscription.

## Preparation boundary

`public.customer_portal_commercial_payment_prepare_v1` runs only for a valid Customer Portal session. The browser sends the offer selector and an idempotency key. It does not send a customer id, a Stripe price, a subscription id, or an amount.

The command locks the subscription, then takes a transaction advisory lock, then checks:

- verified membership for that business
- state `ACCEPTED`, or an existing preparation for a retryable `PAYMENT_PENDING`
- one immutable acceptance for that customer and business
- plan, amount, tax, currency, cadence, agreement reference, and Guard quantity still match the acceptance
- no Stripe subscription id and no other occupying billable subscription for the business
- the requested livemode agrees with the payment lane when a livemode is supplied

A consistent yearly, one-time, or non-GBP acceptance returns `unsupported` and does not change state. An accepted offer whose tax behaviour is `INCLUSIVE` or `EXCLUSIVE` also returns `unsupported` before any provider operation or Checkout preparation is reserved. `NOT_APPLICABLE` is the only payable shape in this phase: the accepted amount is the full amount payable. The command does not remove tax, change the accepted price, or assume a tax rate. A later phase can add a verified tax configuration and invoice reconciliation without changing the accepted offer. A changed price returns conflict. A missing acceptance, a withdrawn offer, another customer, or a revoked membership returns unavailable and does not write a receipt for those refusals that happen before an acceptance is confirmed.

A successful first call inserts one `CREATE_RECURRING_PRICE` operation, one `CREATE_SUBSCRIPTION_CHECKOUT` operation, and one `commercial_checkout_preparations` row, then moves `ACCEPTED` to `PAYMENT_PENDING`. The stored amount is the accepted total, including selected Guard locations. Additional-usage opt-in and the spending cap are stored and are not added to the price. A second request, including a different idempotency key, returns the same operations. A provider timeout leaves those operations pending so the retry uses the same price idempotency key.

Repeating a successful request rechecks the customer, verified membership, subscription, and acceptance before it reads the current preparation and provider operations. The returned Stripe references and operation status come from those current records. The original receipt, idempotency keys, and provider-operation ids stay unchanged. A revoked membership, a canceled or ended subscription, or an activated subscription does not reopen Checkout.

The application records the price and the Checkout session afterwards. The Checkout operation is `SUBMITTED`, not `SUCCEEDED`. Recording it does not insert `commercial_payment_evidence` and does not set `ACTIVE`. A return to `/pay/return` is not payment evidence.

When a preparation already stores a Checkout session, the application retrieves that exact session from the shared provider. It reuses the session only when the Stripe customer, commercial metadata, subscription and acceptance association, currency, payment lane, subscription mode, and payable amount all match the accepted total. A missing or zero Checkout total is not treated as confirmation. An open eligible session returns its verified Checkout URL and does not create another session. A completed, paid, or processing session shows that payment confirmation is still pending and does not start another checkout. An expired or cancelled session fails closed with a recovery message. This phase does not issue a replacement Checkout. A matching session id alone is not enough, and retrieving a session does not record payment evidence or move the subscription to `ACTIVE`.

`CUSTOMER_COMMERCIAL_CHECKOUT_ENABLED` must be exactly `true` before the route calls the database. The flag does not override Stripe test and live separation, Supabase pinning, the provider-lane agreement, or live-payment activation. When the flag is off, or a deployed lane does not have payments enabled, the customer sees that payment setup is being prepared and there is no payment button. Local tests use the fake provider and do not call Stripe.

## Customer presentation

The accepted-offer page shows that the offer is accepted, payment is not completed, the contractual charge, the billing cadence, and the included Guard charge when Guard was selected. The shared Billing page can list the same unpaid accepted offers. The intended action, once the flag and the payment lane both allow it, is Continue to secure payment. The response does not include Stripe identifiers.

## Migration

`20261103213000_customer_commercial_payment_preparation_v1` was applied once to DEV. When it was applied, the verified DEV ledger contained 101 entries and ended at `20261103213000`. The previous verified DEV ledger contained 100 entries and ended at `20261103200518`. The ledger before the payment settlement contained 102 entries and ended at `20261103230000`. The current verified DEV ledger contains 103 entries and ends at `20261104190000`. The repository file is 44,920 characters. Its MD5 is `8db49c31c5d8b41e93e3768017120137`. Its SHA-256 is `8f4103468abc024f249d671fabea0e8587cb60093de3d7f5665f5c8f5bd90f8d`. Do not replay `20261103213000`. Do not apply `20261103213000` to Production. Do not replay `20261103200518`. Do not apply `20261103200518` to Production. No customer or payment records were created. Commercial feature flags remain OFF. It does not seed a plan, an agreement, a subscription, an acceptance, or a payment.

## 03A-03-02 verified Stripe webhook settlement

The next phase may mark a subscription paid only after a verified Stripe event is bound to the reserved preparation. It should reuse `mapEvent` and the existing Stripe event receipt path. It should not add a webhook endpoint or a second processor.

A settlement may proceed only when one verified event identifies all of the following together:

- the Stripe customer already mapped to this customer
- the Checkout session stored on this preparation
- the Stripe subscription created from that session
- the Stripe price stored on this preparation
- the invoice or payment amount equal to the accepted total, in the currency the provider charged
- the subscription period start and end supplied by Stripe
- test or live mode equal to the preparation and the configured lane

Only then may the phase insert one `commercial_payment_evidence` row and consider `PAYMENT_PENDING` to `ACTIVE`. A browser redirect, a Checkout `SUCCEEDED` flag, or an unmatched event must not do either. The existing evidence trigger stays closed until that binding exists.

03A-03-02 still does not grant entitlements, bill additional usage, cancel a subscription, issue a refund, or manage `PAST_DUE` and `PAUSED`. Those stay in later reviewed phases.
