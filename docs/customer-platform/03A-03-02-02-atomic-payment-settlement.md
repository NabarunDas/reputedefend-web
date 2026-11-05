# 03A-03-02-02 Atomic commercial payment settlement

This phase records one verified initial Telloya or Complete invoice and moves only that subscription from `PAYMENT_PENDING` to `ACTIVE`. It does not provision Telloya, buy a number, configure forwarding, enable live answering, activate Guard, start overage, grant an entitlement, or send mail.

`20261104190000_customer_commercial_payment_settlement_v1` was applied once to DEV. When it was applied, the verified DEV ledger contained 103 entries and ended at `20261104190000`. The current verified DEV ledger contains 104 entries and ends at `20261104220000`. Do not replay `20261104220000`. Do not apply `20261104220000` to Production. The previous ledger contained 102 entries and ended at `20261103230000`. The repository file is 71,495 characters. Its MD5 is `f09048135272dbc84b7ff1c794f18361`. Its SHA-256 is `950af7786e449b1158b531d67f7a858ae9c59aad6a2496e227752bd3779961c1`. Service-role-only settlement RPC permissions were verified. Ordinary payment-evidence inserts remain blocked. Invalid invoice claims and untrusted settlement payloads were rejected. No commercial subscription or payment evidence was created. Commercial feature flags remain OFF. Do not replay `20261104190000`. Do not apply `20261104190000` to Production. Do not replay `20261103230000`. Production and AWS ApprovedMigrationHead remain `20261014170000`.

## Current and proposed path

| Stage | Before this phase | This phase |
| --- | --- | --- |
| Signed webhook | Stores one `stripe_event_receipts` row and enqueues `PROCESS_STRIPE_EVENT` | Unchanged. No second webhook. |
| Verifier | `assessCommercialSettlement` returns `verified` for one paid initial invoice | Reused as a pre-check. Its boolean is not settlement authority. |
| Invoice worker | Lists commercial invoice candidates and observes them | When both flags are exactly `true`, the worker claims one invoice and reads the invoice, Checkout session, and Stripe subscription again. It re-runs the full verifier on that second read. Only an exact `verified` result is settled. Otherwise it stays observation-only. |
| Recovery claim | `dev_payment_event_claim_v1` rejects `invoice.%` | Unchanged. Commercial invoices use `commercial_payment_invoice_claim_v1`. |
| Evidence | Every insert raises | An insert is allowed only inside the leased settlement transaction, and only when the durable receipt, lease, amount, currency, period, and membership agree. |
| Subscription | A billable `ACTIVE` transition always raises | `PAYMENT_PENDING` becomes `ACTIVE` only after that same transaction has inserted the matching evidence row. |
| Customer view | A paid subscription with no provision can disappear from My Products | Telloya stays pending: "Payment received. Your AI receptionist setup has not started." Guard included in that package stays pending: "Included in your package. Monitoring setup is pending." It is not described as live, and a Telloya-only subscription still shows Guard as not subscribed. |

## One transaction

`commercial_payment_settle_initial_invoice_v1` is service-role only. Anonymous and authenticated roles cannot execute it. The command requires an existing signed `invoice.paid` receipt, a running `dev-payment-events` lease, and structured provider facts. A payload that contains `verified` is rejected. After the claim, the worker reads the provider again, re-reads the signed receipt and the durable preparation, and runs `assessCommercialSettlement`. It calls the settlement command only when that second result is exactly `verified`. The command then compares Checkout mode, status, customer, commercial ids, acceptance, operation, subscription metadata, and invoice metadata with the locked preparation. A missing or contradictory fact returns without writing.

Inside the transaction it locks the outbox, receipt, and job, then the Checkout preparation and the business's commercial subscriptions in id order. It re-reads the acceptance, approved plan, customer map, and membership. It requires a GBP payment equal to the accepted monthly amount, quantity 1, no trial, discount, automatic tax, refund, or dispute, and a non-overlapping paid period. It then inserts one `commercial_payment_evidence` row, sets the Stripe customer and subscription, records the paid period, moves that subscription to `ACTIVE`, appends `verified_initial_invoice`, marks the receipt processed, and completes the existing job. Those writes commit together or roll back together.

A provider failure before the claim leaves the receipt queued and writes nothing. A provider failure after the claim fails the job as retryable and still writes no payment row. A settled event stays settled after the lease expires or the worker restarts.

## Flags

`CUSTOMER_COMMERCIAL_PAYMENT_SETTLEMENT_ENABLED` defaults off. It does nothing unless `CUSTOMER_COMMERCIAL_PAYMENT_VERIFICATION_ENABLED` is also exactly `true` and the existing develop-preview worker block is open. No Vercel value is changed. Tests use an isolated database and the fake provider. The concurrent claim and settlement test opens two connections to a disposable local PostgreSQL cluster. It does not use DEV or Production. No live Stripe call is made.
