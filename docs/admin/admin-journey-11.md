# ADMIN-JOURNEY-11 — Case closure and optional Guard

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check.

This step shows the case status, the verified outcome, the stored customer summary, the billing position, outstanding tasks and submission attempts. It closes and reopens only through the existing `close` and `reopen` commands. It does not send email, submit anything to Google, or collect a payment.

Agreement `PS-2026-10-14.2` is unchanged. No migration is added or applied.

## What this reuses

- `close` and `reopen` on `public.admin_case_command_v1`, including the outcome and summary guard from `20261019183000_admin_journey_10b_record_outcome_v1.sql`
- The Step 10 billing reading. Guided closure still requires the verified upfront settlement. Managed closure still requires provider-confirmed settlement after a qualifying outcome, or a non-qualifying outcome with no success-fee obligation
- The case-flow projection for tasks, submissions, outcome and summary
- The loaded case record, including work events, as the closure history
- The existing Guard workspace at `/guard`

The comparison runs only when Step 11 is open. A locked step does not load the money list and does not show a command. `close` and `reopen` check their rules again.

## Completion

Step 11 is complete only when the case status is `CLOSED` or `CANCELLED`. A recorded outcome on an open case is not closure. A reopened case is open again. Guard is not part of the evidence.

`CLOSED` and `CANCELLED` stay distinct. A withdrawal is `CANCELLED`. The step says the case is closed only when the case record and the projection both say `CLOSED`, and cancelled only when both say `CANCELLED`.

## The close control

The guided form is withheld until every earlier step is complete or does not apply, the Step 10 billing position is met, no task is open, and every submission has a decision or a withdrawal.

When Step 10 has already stored an outcome, the form shows that outcome and summary and submits those exact strings. It has no control that can replace them. The database still refuses a different value. The form sends the current case version. A stale version is the existing `conflict` result, and the page does not then call the case closed.

Reopening uses the existing command and its follow-up task. The previous outcome remains on the reopen event. A later `record_outcome` is a new open outcome and does not restore the old closure.

## Optional Guard

Guard is explained on the step and linked to `/guard`. It is not required. The step does not enrol the customer, apply a discount, raise an invoice, or charge a card.

A restored Managed case that the database has closed can be reviewed afterwards for the existing included Guard offer. The customer has to choose that offer. This step does not create it.

## Commercial gap

The case cockpit still renders `CloseForm` for every open case and posts the same `close` command. That command checks the outcome, the summary, the stage, open tasks and unresolved submissions. It does not check the Guided upfront settlement or the Managed success-fee position. A separate, unapplied safeguard is described in `docs/admin/admin-journey-11-close-safeguard.md`. This change does not apply it and does not change the command.
