# Close safeguard — reviewable migration, not applied

Status: the check proposed here is implemented in `supabase/migrations/20261019235000_admin_journey_12a_close_billing_v1.sql`. That file is in the recovery manifest as pending (`appliedToDev: false`). It has not been applied to DEV (`rmzozuiamjcclvtgutgd`) or Production (`cxwwekdzkkjjbiyofrov`). Do not apply it from the pull request. Independent review applies it to DEV only.

## Gap

`public.admin_case_command_v1`, operation `close`, is the only closure write. The guided Step 11 form withholds that command until the Step 10 billing position is met. The case cockpit does not.

`apps/admin/app/cases/[id]/page.tsx` renders `CloseForm` for every case that is not already `CLOSED` or `CANCELLED`. The form posts `operation: "close"`. The current function, replaced by `supabase/migrations/20261019183000_admin_journey_10b_record_outcome_v1.sql`, refuses a close when:

- the outcome or summary is not valid
- a non-withdrawal is outside `OUTCOME_REVIEW`
- a stored outcome or `closure_summary` differs from the submitted value
- a task is `OPEN` or a submission has no result
- the case is already `CLOSED` or `CANCELLED`
- the case version is stale

It never reads `quotes`, `service_orders`, `payment_obligations` or `payment_receipts`. An operator on the cockpit can therefore close:

- a Guided case whose upfront obligation is not `PAID`, or which has no receipt
- a Managed case whose qualifying outcome has no provider-confirmed success fee
- a Managed case whose non-qualifying outcome already has a success-fee obligation
- a withdrawal from a stage other than `OUTCOME_REVIEW`, including before settlement

Step 11 does not treat those as ready. The database still accepts them from the other screen.

## Proposed check

Add one predicate inside the existing `close` branch, before the `UPDATE`, in a new migration reviewed on its own. Return the existing `prerequisite` status when the predicate fails. Do not add a second close operation, a new status, or a Guard write.

`service_orders.state` has no `ACCEPTED_PAID` value. Upfront settlement is an `UPFRONT` order with a non-void `UPFRONT` obligation in `PAID` and a row in `payment_receipts`. That is the same shape Step 10 already treats as settled.

For `cases.service_track = 'GUIDED'`, require all of the following for the same case and customer:

- exactly one `quotes` row in `ACCEPTED`
- exactly one `service_orders` row for that quote, with `payment_model = 'UPFRONT'` and `case_id` equal to the case
- exactly one non-void `payment_obligations` row of `kind = 'UPFRONT'` in `state = 'PAID'` for that order
- one `payment_receipts` row for that obligation
- no `SUCCESS_FEE` or `RECURRING_MONTHLY` order for the case

For `MANAGED`, use `admin_private.qualifying_success_outcome_v1(c)`:

- qualifying: exactly one `SUCCESS_FEE` order for the case, one non-void `SUCCESS_FEE` obligation in `PAID`, and a receipt for that obligation
- not qualifying: no non-void `SUCCESS_FEE` obligation for the case

`WITHDRAWN` keeps `status = 'CANCELLED'`. The commercial predicate still applies, so a Guided withdrawal is not a way around the upfront receipt. A non-qualifying Managed withdrawal still must not carry a success-fee obligation.

Refusal uses `prerequisite`. It does not change the outcome, the summary, the status, or any payment row. It does not enrol Guard or send email.

## Why this stays separate

Applying the predicate changes the cockpit, not only the guided preview. It also refuses closures that the current DEV function accepts. That is a commercial-rule change and needs its own review. This proposal does not authorise that apply.
