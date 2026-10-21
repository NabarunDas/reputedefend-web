# ADMIN-JOURNEY-12A — close billing prerequisite

Status: reviewed and applied to DEV (`rmzozuiamjcclvtgutgd`) on 2026-10-20, at canonical migration version `20261019235000`, after independent SQL and permission verification. Not applied to Production (`cxwwekdzkkjjbiyofrov`). Do not replay.

Agreement PS-2026-10-14.2 is unchanged. Prices, contractual terms, Guard billing, Stripe collection, invoices, refunds, Google submission and outbound customer email are unchanged.

## What changed

`supabase/migrations/20261019235000_admin_journey_12a_close_billing_v1.sql` replaces `public.admin_case_command_v1` and adds `admin_private.case_close_billing_ready_v1`. The only behaviour change is inside the existing `close` operation. There is no second close command.

Before the close update, the command calls the predicate with the case row and the outcome being written. A failure returns the existing `prerequisite` status. It does not write a work event, an audit row, an outcome, a summary, a status change, or any payment row.

`service_orders.state` has no `ACCEPTED_PAID` value. An upfront order stays `ACCEPTED_AWAITING_PAYMENT`. Steps 7 and 10 treat that order as settled when the upfront obligation is `PAID` and a matching receipt is recorded. Settlement for closure is the same shape: a non-void `UPFRONT` obligation in `PAID` plus one `payment_receipts` row for that obligation, order and customer. The receipt amount, currency and tax match the obligation. The obligation amount, currency and tax match the order. The order amount, currency and tax match the accepted quote version. Checkout attempts, saved cards and unconfirmed payments are not read.

The accepted quote, its current accepted version, the quote acceptance, the order and, where a payment exists, the obligation all name one another. A success-fee approval names that same quote version, order, case and outcome. One applicable order for the case and track is required. A second order on the same track is not ignored, including an order that has no paid obligation.

Guided closure, including `WITHDRAWN`, requires:

- exactly one `ACCEPTED` quote for the same case and customer
- exactly one `UPFRONT` order in `ACCEPTED_AWAITING_PAYMENT` for that accepted version and acceptance, with the same case and customer
- no `SUCCESS_FEE` or `RECURRING_MONTHLY` order on the case
- exactly one `PAID` `UPFRONT` obligation for that quote version, case and customer, and a receipt whose amount, currency and tax match that obligation

Managed qualifying success (`PROFILE_RECOVERY` + `RESTORED`, or `REVIEW_PROTECTION` + `REMOVED`, using the outcome being written) requires the accepted quote, one `SUCCESS_FEE` order in `ACCEPTED_SUCCESS_FEE`, no upfront or recurring order, and one `PAID` success-fee obligation linked to an approval for that case, order, quote version and outcome, plus a matching receipt.

A Managed decision at `OUTCOME_REVIEW` that is not qualifying needs that one accepted linked order. It does not need a success fee, and closing does not create a charge. It is refused when any non-void success-fee obligation is already linked to the case, or when the accepted order is missing, mismatched or not unique. A void obligation does not count as an active charge. Step 10 treats that voided fee as not billable. `WITHDRAWN` before `OUTCOME_REVIEW` can still cancel a Managed case that has no active success fee. A Guided withdrawal is not a payment bypass.

`UNDECIDED` does not pass the predicate. Staff authorisation, idempotency, optimistic concurrency, outcome-summary integrity, open-work checks, reopening and every other case command stay as they are. A withdrawal that passes the commercial rule is still stored as `CANCELLED`.

The helper is not granted to `PUBLIC`, `anon`, `authenticated` or `service_role`. `CREATE OR REPLACE` keeps the existing `service_role` execute grant on `admin_case_command_v1`.

Both Admin closure screens post `operation: "close"` to `/api/cases/command`. The guided Step 11 form and the original case cockpit form show the same settlement sentence. A `close` prerequisite is returned as HTTP 409 with: “Closure needs the accepted service for this case and the recorded settlement that service requires. A checkout return, a saved card or an unpaid fee is not enough, and an unsuccessful case is not charged in order to close.” Other prerequisite refusals keep the previous generic message. A 409 does not mark the form completed.

## Impact

The DEV function now enforces the commercial prerequisite for all Admin closure entry points. The cockpit can no longer close an unpaid Guided case, a qualifying Managed case without a confirmed success-fee receipt, a post-service Managed decision that has no unique accepted order, or an unsuccessful Managed case that still has an active success-fee obligation. A voided uncollected success fee does not block that unsuccessful close. Guided withdrawal is not a payment bypass. An unsuccessful customer is not charged in order to close.

`record_outcome`, `reopen`, notes, tasks, submissions and stage transitions are unchanged. The Step 11 screen can still withhold the button; the database is the rule both screens have to pass.

## Compatibility

| Item | Position |
| --- | --- |
| DEV applied head | `20261019235000`. This file is `appliedToDev: true` after verification. |
| Repository head | `20261021155147` is applied to DEV only. `20261020210000` remains applied to DEV only under E2E-04. Neither is applied to Production. Step 12A remains applied and immutable. `20261021210000` has not been applied. |
| Production and AWS ApprovedMigrationHead | Remain `20261014170000`. |
| Step 10B and the seven DEV-HISTORY-01 files | Not edited and not replayed. |
| `record-outcome` PGlite suite | Still loads the chain through Step 10B only, so it keeps proving the previous close behaviour. |
| Clean PGlite rehearsal | Applies this file to a throwaway database. That is not a live apply. |

Applying the file will refuse closures the current DEV function accepts. Do not apply it to any live database from this change.
