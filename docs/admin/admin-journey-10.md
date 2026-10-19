# ADMIN-JOURNEY-10 — Outcome verification and billing

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check.

This step shows the Google decision or withdrawal, the supporting evidence, the case outcome, the selected service track and the billing position. It does not close the case, send email, submit anything to Google, or take a payment.

Agreement `PS-2026-10-14.2` is unchanged. A Managed success fee is invoiced only after documented success. There is no automatic card charge and no collection in advance.

## What this reuses

- `cases.outcome`, written today only by the existing `close` command
- The case-flow quote, order, obligation and receipt projection
- The money list for approval, invoice status, receipt and accepted evidence
- `ApproveSuccessFeeForm` and the TEST-MODE `issue_invoice_fallback` command
- `isQualifyingSuccessFeeOutcome`, which copies the database rule for display

The comparison runs only when Step 10 is open. A locked step does not load the money list and does not show a command. `approve_success_fee` and `issue_invoice_fallback` check their rules again.

## Completion

Guided Step 10 is complete only when the case outcome is recorded, the accepted quote is linked to the only upfront order, that obligation is `PAID`, and a receipt is recorded. A paid obligation without a receipt is a conflict. This step does not create a second charge.

Managed Step 10 is complete when either:

- the outcome qualifies (`RESTORED` for profile recovery, `REMOVED` for review protection) and the success-fee obligation is `PAID` with a receipt, or
- the outcome does not qualify and no success-fee obligation exists.

Approval, an issued invoice, a saved card and a checkout return are not settlement. An unsuccessful case is not invoiced in order to finish the step. A failed collection stays unfinished. Incomplete or conflicting quote, order, submission or money records hide every billing command.

## Outcome and closure

The existing `close` command records the outcome and closes the case together. Step 10 does not call it, and it does not invent an outcome so that a fee can be approved. A qualifying success fee can be approved only after that outcome already exists. A pre-closure outcome command is described in `docs/admin/admin-journey-10-outcome-proposal.md` and is not applied.

Closure and optional Guard stay on Step 11.
