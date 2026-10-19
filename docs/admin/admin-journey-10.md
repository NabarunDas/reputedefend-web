# ADMIN-JOURNEY-10 — Outcome verification and billing

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check.

This step shows the Google decision or withdrawal, the supporting evidence, the case outcome, the selected service track and the billing position. It does not close the case, send email, submit anything to Google, or take a payment.

Agreement `PS-2026-10-14.2` is unchanged. A Managed success fee is invoiced only after documented success. There is no automatic card charge and no collection in advance.

## What this reuses

- `cases.outcome`, written today only by the existing `close` command
- The case-flow quote, order, obligation and receipt projection
- The loaded service order, checked against the accepted quote before a billing command is offered
- The money list for approval, invoice status, receipt and accepted evidence
- `ApproveSuccessFeeForm` and the TEST-MODE `issue_invoice_fallback` command
- `isQualifyingSuccessFeeOutcome`, which copies the database rule for display

The comparison runs only when Step 10 is open. A locked step does not load the money list or the service order and does not show a command. `approve_success_fee` and `issue_invoice_fallback` check their rules again.

## Completion

Guided Step 10 follows the same settled order Step 7 uses. It is complete only when the case outcome is recorded, the accepted quote is linked to the only upfront order, that order is `ACCEPTED_PAID`, the upfront obligation is `PAID`, and a receipt is recorded. `ACCEPTED_AWAITING_PAYMENT` together with a paid obligation or a receipt is a conflict. A paid obligation without a receipt is a conflict. An awaiting order that is due or collecting stays pending and does not create a second charge. A failed collection is not settlement. A void obligation needs attention and is not collected from this step.

Managed Step 10 is complete when either:

- the outcome qualifies (`RESTORED` for profile recovery, `REMOVED` for review protection) and the success-fee obligation is `PAID` with a receipt, or
- the outcome does not qualify and no success-fee obligation exists.

Approval, an issued invoice, a saved card and a checkout return are not settlement. An unsuccessful case is not invoiced in order to finish the step. A failed collection stays unfinished.

The selected outcome evidence is checked by version id. Each id offered for approval has to be on this case, uploaded, clean, valid and accepted, and linked to its document. Extra accepted files do not block a valid selected version. A missing, rejected or unsafe selected version withholds the command.

Approve and the TEST-MODE invoice are offered only when the uniquely accepted quote, the track order, the money row and the loaded service order name the same order, case and customer. A missing order, a second money row, a null case, or a row for another customer withholds both controls.

## Outcome and closure

Step 10 records an outcome with `record_outcome`. That command writes `cases.outcome` and `cases.closure_summary` only. It does not change status, stage or the closure date, and it does not approve a success fee, create an invoice, collect a payment, or close the case. The form is shown only while Step 10 is open, the records agree, and no outcome is stored. The select offers an outcome the case type and current stage allow.

The reader accepts two authoritative shapes. A closed case is authoritative when `CLOSED` holds a non-withdrawal outcome at `FINISHED`, or `CANCELLED` holds `WITHDRAWN` at `FINISHED`. An open case is authoritative when the stored row has the recorded pre-closure shape: the outcome vocabulary, a summary, and the stage the command requires. After a reopen, that open shape is accepted only when a later `record_outcome` work event matches the stored outcome and summary, has `closesCase` false, and has a greater event id than every loaded reopen. A retained outcome with no such event, a finished stage while the case is open, a missing summary, and a closed status that contradicts the outcome fail closed. An unreopened open case does not need that event.

`close` is unchanged when no outcome is stored. If an outcome is already stored, close must repeat that outcome and its summary exactly. A different value is refused. Reopen clears both, and that is the correction path. The migration is `supabase/migrations/20261019183000_admin_journey_10b_record_outcome_v1.sql`. It is not applied to DEV or Production. Until it is applied, the live function still rejects `record_outcome`.

The repository's newest file marked applied to DEV is `20261015230000`. The observed DEV ledger does not end there. It was observed on 19 October 2026 to end at `20261019163645 admin_journey_05_assessment_dev_v1`, with seven versions after `20261015230000` that are not in `supabase/migrations`. This change does not add those files and does not apply `20261019183000`. The reconciliation plan is in `docs/admin/admin-journey-10-outcome-proposal.md`. Production and AWS stay at `20261014170000`.

Closure and optional Guard stay on Step 11. An open case with a verified outcome is not a closed case.
