# ADMIN-JOURNEY-07 — Guided and Managed service activation

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check.

This step does not mark an obligation paid, grant Google access by itself, change the commercial agreement, prepare a pack, or submit anything to Google. No database migration is added.

## What this reuses

- `summarisePayment` and `summariseCommercial` for the order and the quote
- `IssuePaymentActionForm` with `issue_guided_payment_action`, and only when case flow already names `START_UPFRONT_PAYMENT` as an action that can be taken
- `AuthorizationPanel` for the existing agreement, permission and manager-access commands
- The payment provider gate already on `/api/operations/payments`

The commercial workspace is unchanged. Saved-card setup and success-fee approval stay off this step. Success-fee approval remains a later billing action. Pack preparation and Google submission remain later steps.

## Guided

The selected track is shown with the service order named by the accepted quote. Activation is complete only when the quote list and the payment list are complete, one quote is accepted, that quote's order id is the only upfront order, the order state is `ACCEPTED_PAID`, the upfront obligation is `PAID`, and a receipt is recorded. A quote with no order id, or an order id that is not that upfront order, is a disagreement. It is not activation, and it does not receive a payment link.

A due or collecting obligation is waiting. A failed payment, a void obligation, a paid mark without a receipt, and an order that does not agree with the obligation need attention. Returning from Checkout is not payment. An accepted quote alone is not activation. The selected track alone is not activation.

When payment collection is switched off, the step does not issue a customer payment link and does not start a charge. A link is issued only when case flow already allows `START_UPFRONT_PAYMENT` and the loaded order and the money row both name that same quote order, Guided payment model, case and customer. A missing order, case or customer is not treated as agreement. The link is the existing payment command and it does not mark the obligation paid.

## Managed

Activation is complete only when the accepted quote's order id is the only success-fee order, and that order is accepted, together with an accepted service agreement, verified business authority, an active case-management permission, verified Google manager access, and database authorisation readiness. A different order on the case does not stand in for that quote.

A saved card is not required and is not collected here. Choosing Managed does not grant Google access. An expired agreement or permission link is not acceptance. A revoked permission or a membership in review puts the step back to attention. Disagreeing customer, business or authority records do the same.

The manager-access control is the existing command. It still requires a fresh sign-in, recorded evidence, and confirmation that no Google password or one-time code was collected.

## Reopened cases

A reopen does not erase a current paid receipt or a current authorisation record. The step says the case was reopened and still reads those records. It does not treat the earlier closure as activation.
