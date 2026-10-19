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

The existing `close` command records the outcome and closes the case together. Step 10 does not call it, and it does not invent an outcome so that a fee can be approved.

The current reader accepts two authoritative shapes. A closed case is authoritative when `CLOSED` holds a non-withdrawal outcome at `FINISHED`, or `CANCELLED` holds `WITHDRAWN` at `FINISHED`. An open case is authoritative only when the stored row already matches the proposed pre-closure record: the outcome vocabulary, a summary, and the stage that command would require. The reader does not record that row. The page does not offer `record_outcome`. A reopened case, a finished stage while the case is open, a missing summary, and a closed status that contradicts the outcome fail closed.

A pre-closure outcome command, and the close-command guard that would stop a later close from overwriting that outcome, are described in `docs/admin/admin-journey-10-outcome-proposal.md` and `docs/admin/proposed-admin-journey-10-outcome.sql`. Neither is applied.

Closure and optional Guard stay on Step 11. An open case with a verified outcome is not a closed case.
