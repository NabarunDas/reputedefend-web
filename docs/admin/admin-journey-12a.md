# ADMIN-JOURNEY-12A — close billing prerequisite

Status: reviewable DEV migration. Not applied to DEV (`rmzozuiamjcclvtgutgd`) or Production (`cxwwekdzkkjjbiyofrov`). Do not apply it from this pull request. Independent review applies it to DEV only.

Agreement PS-2026-10-14.2 is unchanged. Prices, contractual terms, Guard billing, Stripe collection, invoices, refunds, Google submission and outbound customer email are unchanged.

## What changed

`supabase/migrations/20261019235000_admin_journey_12a_close_billing_v1.sql` replaces `public.admin_case_command_v1` and adds `admin_private.case_close_billing_ready_v1`. The only behaviour change is inside the existing `close` operation. There is no second close command.

Before the close update, the command calls the predicate with the case row and the outcome being written. A failure returns the existing `prerequisite` status. It does not write a work event, an audit row, an outcome, a summary, a status change, or any payment row.

`service_orders.state` has no `ACCEPTED_PAID` value. An upfront order stays `ACCEPTED_AWAITING_PAYMENT`. Settlement is a non-void `UPFRONT` obligation in `PAID` plus one `payment_receipts` row for that obligation, order and customer. Checkout attempts, saved cards and unconfirmed payments are not read.

Guided closure, including `WITHDRAWN`, requires:

- exactly one `ACCEPTED` quote for the same case and customer
- exactly one `UPFRONT` order in `ACCEPTED_AWAITING_PAYMENT` for that quote, with the same case and customer
- no `SUCCESS_FEE` or `RECURRING_MONTHLY` order on the case
- exactly one `PAID` `UPFRONT` obligation with matching case and customer, and a receipt for that obligation

Managed qualifying success (`PROFILE_RECOVERY` + `RESTORED`, or `REVIEW_PROTECTION` + `REMOVED`, using the outcome being written) requires the accepted quote, one `SUCCESS_FEE` order in `ACCEPTED_SUCCESS_FEE`, no upfront or recurring order, and one `PAID` success-fee obligation linked to an approval for that case, order and outcome, plus a receipt.

A Managed outcome that is not qualifying, including `WITHDRAWN`, does not require a success fee. It is refused when any non-void success-fee obligation is already linked to the case. A void obligation does not count. Closing does not create a charge.

`UNDECIDED` does not pass the predicate. Staff authorisation, idempotency, optimistic concurrency, outcome-summary integrity, open-work checks, reopening and every other case command stay as they are. A withdrawal that passes the commercial rule is still stored as `CANCELLED`.

The helper is not granted to `PUBLIC`, `anon`, `authenticated` or `service_role`. `CREATE OR REPLACE` keeps the existing `service_role` execute grant on `admin_case_command_v1`.

Both Admin closure screens post `operation: "close"` to `/api/cases/command`. The guided Step 11 form and the original case cockpit form show the same settlement sentence. A `close` prerequisite is returned as HTTP 409 with: “Closure needs the recorded settlement for this service. A checkout return, a saved card or an unpaid fee is not enough, and an unsuccessful case is not charged in order to close.” Other prerequisite refusals keep the previous generic message. A 409 does not mark the form completed.

## Impact

Until this file is applied, the DEV function from Step 10B still accepts a close that has no recorded settlement. After it is applied, the cockpit can no longer close an unpaid Guided case, a qualifying Managed case without a confirmed success-fee receipt, or an unsuccessful Managed case that still has an active success-fee obligation. Guided withdrawal is not a payment bypass. An unsuccessful customer is not charged in order to close.

`record_outcome`, `reopen`, notes, tasks, submissions and stage transitions are unchanged. The Step 11 screen can still withhold the button; the database is the rule both screens have to pass.

## Compatibility

| Item | Position |
| --- | --- |
| DEV applied head | Remains `20261019183000`. This file is `appliedToDev: false`. |
| Repository head | `20261019235000`, pending. |
| Production and AWS ApprovedMigrationHead | Remain `20261014170000`. |
| Step 10B and the seven DEV-HISTORY-01 files | Not edited and not replayed. |
| `record-outcome` PGlite suite | Still loads the chain through Step 10B only, so it keeps proving the previous close behaviour. |
| Clean PGlite rehearsal | Applies this file to a throwaway database. That is not a live apply. |

Applying the file will refuse closures the current DEV function accepts. Do not apply it to any live database from this change.
