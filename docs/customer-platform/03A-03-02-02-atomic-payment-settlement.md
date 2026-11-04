# 03A-03-02-02 Atomic commercial payment settlement

This phase records one verified initial Telloya or Complete invoice and moves only that subscription from `PAYMENT_PENDING` to `ACTIVE`. It does not provision Telloya, buy a number, configure forwarding, enable live answering, activate Guard, start overage, grant an entitlement, or send mail.

`20261104190000_customer_commercial_payment_settlement_v1` is in the repository and is not the DEV ledger head. The observed DEV ledger still contains 102 entries and ends at `20261103230000`. Do not apply `20261104190000` to DEV. Do not apply `20261104190000` to Production. Do not replay `20261103230000`. Production and AWS ApprovedMigrationHead remain `20261014170000`.

## Current and proposed path

| Stage | Before this phase | This phase |
| --- | --- | --- |
| Signed webhook | Stores one `stripe_event_receipts` row and enqueues `PROCESS_STRIPE_EVENT` | Unchanged. No second webhook. |
| Verifier | `assessCommercialSettlement` returns `verified` for one paid initial invoice | Reused as a pre-check. Its boolean is not settlement authority. |
| Invoice worker | Lists commercial invoice candidates and observes them | When both flags are exactly `true`, the same worker re-reads the provider, claims one invoice, and settles it. Otherwise it stays observation-only. |
| Recovery claim | `dev_payment_event_claim_v1` rejects `invoice.%` | Unchanged. Commercial invoices use `commercial_payment_invoice_claim_v1`. |
| Evidence | Every insert raises | An insert is allowed only inside the leased settlement transaction, and only when the durable receipt, lease, amount, currency, period, and membership agree. |
| Subscription | A billable `ACTIVE` transition always raises | `PAYMENT_PENDING` becomes `ACTIVE` only after that same transaction has inserted the matching evidence row. |
| Customer view | A paid subscription with no provision can disappear from My Products | It stays pending. The next step says payment is recorded and setup has not started. It is not described as live. |

## One transaction

`commercial_payment_settle_initial_invoice_v1` is service-role only. Anonymous and authenticated roles cannot execute it. The command requires an existing signed `invoice.paid` receipt, a running `dev-payment-events` lease, and structured provider facts. A payload that only says `verified: true` is rejected.

Inside the transaction it locks the outbox, receipt, and job, then the Checkout preparation and the business's commercial subscriptions in id order. It re-reads the acceptance, approved plan, customer map, and membership. It requires a GBP payment equal to the accepted monthly amount, quantity 1, no trial, discount, automatic tax, refund, or dispute, and a non-overlapping paid period. It then inserts one `commercial_payment_evidence` row, sets the Stripe customer and subscription, records the paid period, moves that subscription to `ACTIVE`, appends `verified_initial_invoice`, marks the receipt processed, and completes the existing job. Those writes commit together or roll back together.

A provider failure before the claim leaves the receipt queued and writes nothing. A provider failure after the claim fails the job as retryable and still writes no payment row. A settled event stays settled after the lease expires or the worker restarts.

## Flags

`CUSTOMER_COMMERCIAL_PAYMENT_SETTLEMENT_ENABLED` defaults off. It does nothing unless `CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED` is also exactly `true` and the existing develop-preview worker block is open. No Vercel value is changed. Tests use the isolated database and the fake provider. No live Stripe call is made.
