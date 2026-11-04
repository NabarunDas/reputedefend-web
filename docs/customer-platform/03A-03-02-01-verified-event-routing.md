# 03A-03-02-01 Verified commercial Stripe event routing

This phase classifies and verifies Stripe events for an accepted Telloya or Complete subscription. It does not insert `commercial_payment_evidence`, move a subscription to `ACTIVE`, grant an entitlement, provision Telloya, start Guard coverage, or send billing mail.

`20261103230000_customer_commercial_payment_verification_v1` was applied once to DEV. The verified DEV ledger contains 102 entries and ends at `20261103230000`. The previous ledger contained 101 entries and ended at `20261103213000`. The repository file is 12,838 characters. Its MD5 is `de03ef27a623a72ae3e4015a33782406`. Its SHA-256 is `9a761103c01d8bb50c1656fe81a35ccab349f862304c6a8044a6a327dac57d9a`. Do not replay `20261103230000`. Do not apply `20261103230000` to Production. No commercial subscription or payment evidence was created. Commercial feature flags remain OFF.

## Existing and proposed routing

| Stage | Already in place | This phase |
| --- | --- | --- |
| Signed webhook | `handleStripeWebhook` verifies the signature, checks the payment lane, and stores `admin_private.stripe_event_receipts` through `payment_receive_stripe_event_v1` | Reused. No second webhook. A client-supplied payload cannot enter this path. |
| Outbox | The receipt insert enqueues `PROCESS_STRIPE_EVENT` | Reused. Commercial observation does not claim or complete that job. |
| DEV worker | `runDevPaymentEventWorker` claims Recovery checkout and PaymentIntent events. Subscription checkouts were treated as Guard and left queued. Invoice events were excluded from the candidate query. | The same worker. Guard and Recovery claim paths stay. Commercial events are observed and not claimed. |
| Guard and Recovery handlers | `guard_apply_subscription_event_v1` and `payment_apply_provider_event_v1` | Unchanged. The payment fence still rejects Guard application. |
| One-shot tool | `dev-stripe-one-shot` leaves subscription checkouts and subscription invoices queued | Unchanged. It is not a second commercial worker. |
| Evidence | `guard_commercial_payment_evidence_v1` rejects every insert | Unchanged. This phase does not replace that function. |

A metadata key such as `commercialSubscriptionId` does not prove ownership. The classifier uses a signed receipt reconciled to `commercial_checkout_preparations`, the commercial subscription, the immutable acceptance, and `stripe_customer_maps`. Checkout metadata must match that customer, commercial subscription, acceptance, and Checkout provider operation. Guard or Recovery metadata on a prepared session is suspicious and is not payment evidence. Commercial metadata with no preparation is suspicious and is not sent to Guard or Recovery settlement. A subscription checkout with no preparation and no commercial claim stays on the existing Guard queue.

`CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED` must be exactly `true`. It defaults off. It does not override the develop-preview, DEV Supabase, payment-lane, or secret checks. `20261103230000` is applied on DEV. The flag stays off. While it is off, the worker does not call the new functions. A subscription checkout that merely claims commercial metadata is skipped. Recovery payment checkouts and Guard subscriptions keep their current paths.

## Verification result

`assessCommercialSettlement` returns `verified`, `pending`, `unmatched`, `mismatch`, `unsupported`, or `already_processed`, with an internal reason. Customers do not receive Stripe identifiers. While confirmation is incomplete, the customer portal says: "Your payment is being verified. We'll update your account when confirmation is complete." A completed Checkout is `pending` / `checkout_not_payment` even when its payment status is paid.

`verified` requires all of the following:

- the signed receipt is already stored and matches the event
- test or live mode matches the preparation and the configured lane
- the preparation, its Checkout session, mapped Stripe customer, subscription, and acceptance agree
- the Checkout metadata matches the customer, commercial subscription, acceptance, and Checkout provider operation
- the retrieved Stripe subscription matches that subscription id, customer, price, quantity 1, test or live mode, active state, and the invoice period
- the invoice subscription is the subscription created by that Checkout
- one GBP line for the stored recurring price, quantity 1, no trial, discount, automatic tax, refund, or dispute
- the paid and due amounts equal the accepted monthly total
- the subscription is `active` at the provider and `PAYMENT_PENDING` commercially, with a valid non-overlapping period
- billing reason `subscription_create` and tax behaviour `NOT_APPLICABLE`

Telloya requires Guard quantity 0. Complete may record a Guard quantity on the acceptance; Stripe quantity stays 1 because the price is the accepted total. Missing provider facts return `pending` / `provider_incomplete` and the receipt stays queued. Duplicate evidence is `already_processed`. An overlapping period for a different event is `mismatch`.

The new database functions are `STABLE`, read-only, and service-role-only. `commercial_payment_invoice_candidates_v1` lists test-mode `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.marked_uncollectible`, and `invoice.voided` receipts. It does not claim them. The worker calls that list and the correlation functions only through its payment fence. A verified result does not complete the outbox job. The receipt stays unprocessed so a later run, or the next phase, can settle it. Repeating the read is safe because this phase does not write evidence or change subscription state.

## 03A-03-02-02 design

The next phase may record payment and advance state only in one database transaction, after this verifier has returned `verified` for a specific receipt id:

1. Lock the commercial subscription and its preparation.
2. Re-read the signed receipt, preparation, acceptance, customer map, and evidence periods inside the transaction.
3. Insert one `commercial_payment_evidence` row whose `provider_event_id` is the Stripe event id, whose amount and currency are the acceptance snapshot, and whose period is the verified invoice period.
4. Set `stripe_subscription_id` from the verified invoice when it is still null, and move `PAYMENT_PENDING` to `ACTIVE` only for that same subscription.
5. Mark the receipt processed and complete the existing outbox job.

The evidence-blocking trigger can be replaced only by that transaction's checks. A browser return, a Checkout completion, or a verifier result from outside the transaction must not insert evidence or change state. The transaction must reject a second event for the same period, a changed acceptance, a canceled subscription, or a livemode disagreement.

That phase still does not grant entitlements, bill additional usage, cancel a subscription, issue a refund, or manage `PAST_DUE` and `PAUSED`.

`20261103230000` replaces `commercial_checkout_preparations_checkout_session_id_check` and the session pattern in `commercial_payment_record_checkout_v1`. The accepted id keeps the `cs_` prefix, allows the underscore in `cs_test_` and `cs_live_`, and is bounded to 252 characters. Malformed ids, whitespace, oversized strings, and other provider ids are rejected. The applied `20261103213000` file is unchanged. `20261103230000` is already applied on DEV and must not be replayed. Do not apply `20261103230000` to Production. A recorded session is still not payment evidence.
