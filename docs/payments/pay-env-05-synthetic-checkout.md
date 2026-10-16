# PAY-ENV-05A — Synthetic order-linked Stripe Checkout

Status: **code, tests and runbook only**. No migration is added. Nothing in this change is applied to DEV or Production. No Stripe Checkout Session, customer, payment or charge is created against the connected sandbox. `DEV_STRIPE_ONE_SHOT_ENABLED` stays off. The production worker, Guard, outgoing mail and Production payments stay disabled.

This is the rehearsal for a later human-operated DEV test. It is not that test. Local tests mock the Stripe SDK and use a disposable database. They do not prove a connected sandbox payment.

## What is proven, and what is only simulated

Checkout creation is proven offline. `test/pay-env-05/checkout-creation.database.test.ts` is its own TypeScript project and is statically checked by `npm run typecheck:pay-env-05`. It calls `paymentCommand`, the handler for `POST /api/action/payment`, which runs the real `openCustomerCheckout` and `ensureCustomer` path. `createPaymentCheckout` runs against a mocked Stripe SDK `customers.create` and `checkout.sessions.create`. The amount, currency, customer, `client_reference_id`, session metadata, PaymentIntent metadata, return URLs and idempotency key come from the accepted service order. A thrown create leaves the obligation unpaid and writes no provider reference. A later request reuses the open Checkout and does not create a second customer or session.

That rehearsal does not call `POST /api/portal/payments`. The portal handler is `portalPaymentCommand`, and it calls the same `openCustomerCheckout`. `apps/customer/lib/portal/payments/command.test.ts` covers that command with a mocked provider: the portal gate hides it, a forged customer id is rejected, a disabled provider does not report success, consent does not return an internal id, an untrusted Checkout URL is not returned, and `mark_paid` is rejected. Those tests do not create a Checkout from an accepted order. The portal HTTP request together with a hosted Stripe Checkout remains deferred until the connected DEV test. The Money acceptance row stays `DEFERRED_EXTERNAL`.

Signature verification is proven offline in one Admin test. That test uses the Stripe SDK to generate a header and the real `constructStripeEvent` implementation. A matching body is accepted. A changed body and a live-mode body are rejected before the receipt RPC. The settlement suite does not sign its payloads; those events are assumed verified after `payment_receive_stripe_event_v1`. Connected signed delivery remains the separate PAY-ENV-03 sandbox proof.

The one-shot path is proven on disposable PGlite for the new order-linked `payment_intent.succeeded` event. The test ingests the receipt, claims it with `admin_dev_stripe_one_shot_claim_v1`, and settles that lease with `settleClaimedStripeEvent`. The job type is `PROCESS_STRIPE_EVENT`. The selected receipt becomes processed and the order gains one receipt. A second claim does not add a receipt. An unsupported event stays unpromoted. Queued email and Guard outbox rows stay unpromoted. With the one-shot flag unset, the request boundary returns before any claim. This is not a connected DEV execution, and GitHub Actions skips the separate two-session PostgreSQL race because it does not install PostgreSQL server binaries.

A handler result of success is not payment evidence. The database can return `denied` and the handler still completes the job. The obligation and receipt are the proof.

## What the local rehearsal proves

An eligible synthetic UK business can move through the existing commands only:

catalogue price and a verified GB purchasing establishment, operator tax `NOT_APPLICABLE` while the seller is not VAT-registered, immutable quote, customer OTP acceptance of the current paid-service agreement, one `service_orders` row, one GUIDED upfront obligation, a scoped `GUIDED_PAYMENT` action, `customer_payment_command_v1` through the action handler in the Checkout creation project, `customer_portal_payment_command_v1` in the settlement suite, `payment_ensure_customer_map_v1`, `payment_record_provider_refs_v1`, then the real `processStripeEventHandler` applying `checkout.session.completed` and `payment_intent.succeeded`. The portal HTTP route is not that creation rehearsal.

Settlement is one `payment_receipts` row per obligation and two ledger events from the provider event, `PROVIDER_PAYMENT_SUCCEEDED` and `RECEIPT_RECORDED`, after the acceptance event `OBLIGATION_CREATED`. The owning portal session can see that receipt. Another customer cannot.

`checkout.session.completed` correlates the session and does not by itself mark the obligation paid. `payment_intent.succeeded` is the settlement, including when it arrives first. A second event id for the same PaymentIntent does not add a receipt. Two overlapping database sessions produce one receipt; the loser waits on the obligation lock. A mismatched amount, currency, customer, order or Stripe customer is refused and does not pay. The handler currently returns job success for a database `denied` result, so a succeeded job is not evidence of payment. A failed PaymentIntent leaves no receipt. A live-mode event is refused before apply. A subscription Checkout is sent to `guard_apply_subscription_event_v1` and does not settle the guided order. A setup intent does not save a card or create a guided receipt. An expired Checkout can be replaced by the existing function; the replacement still produces one receipt.

## Preconditions before any connected DEV test

Stop if any item is missing. Do not bypass it.

- Independent review of this draft has accepted the code, and a named operator is authorised to run PAY-ENV-05B.
- **05B mail is blocked** until that operator can show one isolated synthetic inbox already receives the existing Supabase Auth one-time code for that address alone. `COMMUNICATIONS_SEND_ENABLED`, `JOB_PROVIDER_MODE` and global Resend stay off. If that inbox does not already receive Auth mail, stop. Do not turn those gates on to unblock the test. The separate mechanism for a later review is a customer-auth send hook that allows `signInWithOtp` only for one configured synthetic address and refuses every other address. That hook is not part of this change, and it does not start the communications worker or Guard.
- `CUSTOMER_AUTH_ENABLED=true` and `CUSTOMER_PORTAL_ENABLED=true` currently open customer authentication and the portal on all Customer Preview branches. Stripe mode, the restricted test key and the webhook secret are scoped to the `develop` Preview. Before 05B, review narrowing the customer gates to that DEV branch. This change does not edit Vercel.
- DEV Supabase remains `rmzozuiamjcclvtgutgd`. It still has zero service orders, payment obligations and payment receipts. The local fixture is not authorisation to insert verification, eligibility, tax or approval rows into that database. Production data is not used.
- The genuine solicitor approval for agreement `PS-2026-10-14.2` and its recorded hash is still the current approval. Do not create a synthetic solicitor signature.
- The purchasing business has one verified GB establishment. The Google listing country is not that decision.
- Seller VAT position remains the current `NOT_VAT_REGISTERED` row. Do not flip a tax switch, register for VAT, or approve a new country in this test.
- The operator sets the quote tax to `NOT_APPLICABLE` only for that GB establishment. `UNCONFIRMED` tax must stay blocked.
- The quote uses the current approved Guided price. Do not invent an amount.
- The customer is synthetic. The inbox can receive the existing OTP without enabling global outgoing mail. If delivery would require turning on Resend for everyone, stop and wait for a separate gate. Do not add a test checkout API or skip OTP.
- Admin and Customer Preview for branch `develop` stay on `PAYMENTS_PROVIDER_MODE=stripe_test` with the existing restricted test key and webhook secret. Do not print those values or the Vercel bypass URL.
- Stripe sandbox `acct_1UGQgBBq7gpSHBmB` only. `livemode=false`. No live key and no `STRIPE_LIVE_ACTIVATION`.
- Before opening Checkout, inspect the restricted key in the Stripe dashboard. This test needs `Customers.create` and Checkout `Sessions.create` only. Do not add invoice, subscription, refund or live permissions in advance. Write access is still unverified. A dashboard permission check is not permission to create objects until 05B is authorised, and this pull request does not call the connected Stripe account.
- Sandbox webhook endpoint `we_1UQqYeBq7gpSHBmBrkw0PLXq` is enabled for `checkout.session.completed` and `payment_intent.succeeded` in test mode only. Do not print the secret-bearing endpoint URL. Do not add an endpoint. The public hostname remains `https://dev-hooks.profilerelaunch.com/api/webhooks/stripe`.
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
7. Issue `GUIDED_PAYMENT` for that order. The customer opens `/portal/cases/{reference}/payments` and starts checkout. The browser calls `POST /api/portal/payments`. Do not add a checkout route for this test. The older action route is not the operator path, and this connected portal request is still deferred.
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
