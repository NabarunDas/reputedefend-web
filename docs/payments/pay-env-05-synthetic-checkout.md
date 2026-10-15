# PAY-ENV-05A — Synthetic order-linked Stripe Checkout

Status: **code, tests and runbook only**. No migration is added. Nothing in this change is applied to DEV or Production. No Stripe Checkout Session, customer, payment or charge is created against the connected sandbox. `DEV_STRIPE_ONE_SHOT_ENABLED` stays off. The production worker, Guard, outgoing mail and Production payments stay disabled.

This is the rehearsal for a later human-operated DEV test. It is not that test. Local tests mock the Stripe SDK and use a disposable database. They do not prove a connected sandbox payment.

## What the local rehearsal proves

An eligible synthetic UK business can move through the existing commands only:

catalogue price and a verified GB purchasing establishment, operator tax `NOT_APPLICABLE` while the seller is not VAT-registered, immutable quote, customer OTP acceptance of the current paid-service agreement, one `service_orders` row, one GUIDED upfront obligation, a scoped `GUIDED_PAYMENT` action, `customer_portal_payment_command_v1` / `customer_payment_command_v1`, `payment_ensure_customer_map_v1`, `payment_record_provider_refs_v1`, then the real `processStripeEventHandler` applying `checkout.session.completed` and `payment_intent.succeeded`.

Settlement is one `payment_receipts` row per obligation and two ledger events from the provider event, `PROVIDER_PAYMENT_SUCCEEDED` and `RECEIPT_RECORDED`, after the acceptance event `OBLIGATION_CREATED`. The owning portal session can see that receipt. Another customer cannot.

`checkout.session.completed` correlates the session and does not by itself mark the obligation paid. `payment_intent.succeeded` is the settlement, including when it arrives first. A second event id for the same PaymentIntent does not add a receipt. Two overlapping database sessions produce one receipt; the loser waits on the obligation lock. A mismatched amount, currency, customer, order or Stripe customer is refused and does not pay. The handler currently returns job success for a database `denied` result, so a succeeded job is not evidence of payment. A failed PaymentIntent leaves no receipt. A live-mode event is refused before apply. A subscription Checkout is sent to `guard_apply_subscription_event_v1` and does not settle the guided order. A setup intent does not save a card or create a guided receipt. An expired Checkout can be replaced by the existing function; the replacement still produces one receipt.

## Preconditions before any connected DEV test

Stop if any item is missing. Do not bypass it.

- Independent review of this draft has accepted the code, and a named operator is authorised to run PAY-ENV-05B.
- DEV Supabase remains `rmzozuiamjcclvtgutgd`. Production data is not used.
- The genuine solicitor approval for agreement `PS-2026-10-14.2` and its recorded hash is still the current approval. Do not create a synthetic solicitor signature.
- The purchasing business has one verified GB establishment. The Google listing country is not that decision.
- Seller VAT position remains the current `NOT_VAT_REGISTERED` row. Do not flip a tax switch, register for VAT, or approve a new country in this test.
- The operator sets the quote tax to `NOT_APPLICABLE` only for that GB establishment. `UNCONFIRMED` tax must stay blocked.
- The quote uses the current approved Guided price. Do not invent an amount.
- The customer is synthetic. The inbox can receive the existing OTP without enabling global outgoing mail. If delivery would require turning on Resend for everyone, stop and wait for a separate gate. Do not add a test checkout API or skip OTP.
- Admin and Customer Preview for branch `develop` stay on `PAYMENTS_PROVIDER_MODE=stripe_test` with the existing restricted test key and webhook secret. Do not print those values or the Vercel bypass URL.
- Stripe sandbox `acct_1UGQgBBq7gpSHBmB` only. `livemode=false`. No live key and no `STRIPE_LIVE_ACTIVATION`.
- Before opening Checkout, inspect the restricted key in the Stripe dashboard. This test needs `Customers.create` and Checkout `Sessions.create` only. Do not add invoice, subscription, refund or live permissions in advance. Write access was still unverified when this runbook was written; a dashboard permission check is not permission to create objects until 05B is authorised.
- The sandbox webhook remains `https://dev-hooks.profilerelaunch.com/api/webhooks/stripe`. Do not add an endpoint.
- `DEV_STRIPE_ONE_SHOT_ENABLED` is off until the operator is ready to process the specific new events, and it is turned off again afterwards.
- Do not select the existing stand-alone sandbox invoice events. They are not this order.

## Operator sequence

Use the existing Admin and Customer Preview deployments for `develop`. Paths only:

1. Sign in to Admin Preview as the authorised operator.
2. Record counts, with no names, emails or secrets: quotes, service orders, payment obligations, payment receipts, payment ledger rows, Stripe event receipts, `PROCESS_STRIPE_EVENT` outbox rows, and Guard subscriptions.
3. Create or select one synthetic UK case. Verify the purchasing establishment and the customer email and membership through the existing Admin commands.
4. Draft the Guided quote from the current price, set tax to `NOT_APPLICABLE`, and offer it.
5. Issue the quote-acceptance action to the synthetic inbox. The customer signs in with the real OTP and accepts the current agreement, business purpose and terms. There is no fee acknowledgement on a Guided quote.
6. Move the case to payment required through the existing workflow.
7. Issue `GUIDED_PAYMENT` for that order. The customer opens `/portal/cases/{reference}/payments` and starts checkout. The browser calls `POST /api/portal/payments`. There is no other checkout route.
8. On Stripe's hosted test-mode Checkout page, pay with Stripe's published successful test card only. Do not type a real card. Do not copy the card number into notes, logs or this repository.
9. Confirm the sandbox webhook stored `checkout.session.completed` and `payment_intent.succeeded` for this Checkout, both with `livemode=false`, and that the metadata carries this customer, service order, obligation, attempt, provider operation and order reference.
10. Only if 05B explicitly authorises it, set `DEV_STRIPE_ONE_SHOT_ENABLED=true` on Admin Preview `develop`, redeploy, sign in again within five minutes, and process those two new event ids one at a time from `/operations/jobs`. Then set the flag back to false and redeploy before any other work.
11. Sign in to the Customer Preview as the same synthetic owner. The payments page shows one receipt for that order and no provider ids. A second test customer must not see it.
12. Record the after counts. Expect exactly one new service order, one new upfront obligation, one new receipt, and the ledger events named above. Guard subscriptions and outgoing mail rows for this order stay at zero. The earlier stand-alone invoice events stay unpromoted.

## Supported and unsupported

Supported for this test: one Guided upfront Checkout in Stripe test mode, paid with the published success test card, then settled by the two signed events above.

Unsupported, and a reason to stop rather than improvise: live mode, a real card, Managed success-fee collection, hosted invoices, Guard or any subscription, setup-only Checkout, refunds, disputes, Production, a second charge for the same obligation, and any event whose amount, currency, customer, order or Stripe customer does not match the stored obligation.

## Evidence and rollback

Keep the public order reference, obligation state, receipt count and the two Stripe event ids. Do not keep payloads, OTPs, session tokens, keys, bypass URLs or card data.

Do not delete ledger rows, receipts, quotes, agreement approvals or audit events. They are the record of the synthetic purchase. Unsetting the one-shot flag stops further manual processing. It does not reverse a settlement already applied. There is no cron in this test, and the production worker is not started.

If Checkout was opened but not paid, leave the attempt uncaptured. Do not mark it paid by hand. An expired Checkout is replaced only by the existing customer retry, which creates a new attempt rather than editing the old one.
