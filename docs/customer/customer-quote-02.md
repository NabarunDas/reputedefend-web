# CUSTOMER-QUOTE-02 — Review pack for the five service agreements

This pack prepares the five proposed paid-service agreements for a person to read and, separately, to approve or refuse. It does not approve them. Each agreement remains `SOLICITOR_REVIEW`. None is operative, customer-visible, or acceptance-actionable. No catalogue row is inserted, no migration is applied, no quote is issued, and no payment is taken.

The contract text is the source body in `lib/commercial/service-agreements.ts`. The SHA-256 below is the hash of that exact UTF-8 body. The PDF is a reading copy of the same words. Approving a PDF file, or a hash of the PDF bytes, would not approve the agreement. A reviewer approves a version id together with the body hash, or does not approve it.

The PDF adds the ProfileRelaunch name in the header and a page number. Those are not part of the hashed body. The version id and the hash are not printed in the agreement.

## Approval register

| Service | Reading copy | Version | SHA-256 of the source body | Status | Approved | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Guided Relaunch | [guided-relaunch.pdf](quote-02/guided-relaunch.pdf) | PS-2026-10-21.GR | `e4f9ecb589f0e4efa8f46a25faa750bb2db3cf3ad1665b511f34fb486fbe8c88` | SOLICITOR_REVIEW | No | None |
| Guided Review | [guided-review.pdf](quote-02/guided-review.pdf) | PS-2026-10-21.GV | `6b4c26493e4e3450cfca9a5c41908ec44c22b329f85228a536c8192d1803a2ff` | SOLICITOR_REVIEW | No | None |
| Managed Profile Recovery | [managed-profile-recovery.pdf](quote-02/managed-profile-recovery.pdf) | PS-2026-10-21.MR | `1a7188c9d9f1b054cf3bf6627a66a9206f042dbf5684c5615c870be72f4699ee` | SOLICITOR_REVIEW | No | None |
| Managed Review Protection | [managed-review-protection.pdf](quote-02/managed-review-protection.pdf) | PS-2026-10-21.MV | `6dded927728a4cec7226712eccbf1d3243645602f58a56f94275b76235549214` | SOLICITOR_REVIEW | No | None |
| Relaunch Guard | [relaunch-guard.pdf](quote-02/relaunch-guard.pdf) | PS-2026-10-21.GD | `b48fdffe3ff8ec15543fec0e0717fdabba73c4ffe128fc1b2600b8d2ca61c9e6` | SOLICITOR_REVIEW | No | None |

Approved means a person has recorded approval of that exact version and that exact hash. Cursor, CI, and this document do not do that. The owner-reported note of 15 October 2026 applies only to `PS-2026-10-14.2`. It is not a solicitor document, and it does not approve these five bodies.

Each proposal is dated 22 October 2026 in the customer-visible text. The contracting party in every body is ProfileRelaunch Ltd, company number 17520826, incorporated in England and Wales on 14 October 2026, registered office 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ. Notices go to contact@profilerelaunch.com. No body states a VAT number. Each body says ProfileRelaunch is not registered for VAT and does not add VAT while that remains the case.

A change to any body needs a new hash before anyone is asked to approve it. Do not approve a version and then edit the body.

## What already matches

These points are the same in the approved omnibus `PS-2026-10-14.2` (SHA-256 `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`), the published prices, and the proposal for the service they belong to. They are listed so a reviewer can see what this pack is not asking them to reopen.

- Prices: Guided Relaunch £99 upfront, Guided Review £59 upfront, Managed Profile Recovery £299 success fee, Managed Review Protection £149 success fee, Relaunch Guard £9.99 per month per location. A quotation may state a different price for that order.
- Managed Profile Recovery is earned only when the original restriction is absent at an initial check and again at least 48 hours later, and is not known to have returned between those checks. A pending or ambiguous observation is not a completed success.
- Managed Review Protection is earned only when the named review is absent at two checks at least 48 hours apart. Reporting, hiding, a rating change, or an acknowledgement is not itself removal.
- An undisputed Managed invoice is payable within 14 calendar days. There is no automatic card charge and no collection of the success fee in advance. Accepting the quotation does not take payment.
- Guard checks are manual, twice each day, including weekends and bank holidays, on a Europe/London schedule, with an email when a check needs attention. They are not continuous monitoring and they do not promise to prevent a suspension or a review.
- After Managed Profile Recovery has met its agreed outcome, the customer can choose 30 days of Guard for that location at no extra charge. The 30 days start when monitoring is activated. Continuing at the monthly price is the customer's choice. Charging does not start automatically.
- Paid Guard monitoring can give 20% off a later standard Managed Profile Recovery or Managed Review Protection fee at that location when the issue arises during paid monitoring. A problem that already existed when monitoring started is excluded. The reduction does not apply to the monitoring fee or to a custom or bulk quotation, and it cannot be combined with another offer. Cancelling monitoring does not remove a reduction already agreed. The later case is still outcome-based.
- Guard cancellation has no cancellation fee. Monitoring normally runs to the end of the paid month and does not renew. An immediate stop returns the unused portion of that month.
- Guided cancellation before substantive case-specific work begins refunds the fee already paid. After that work begins, only an evidenced fair portion may be retained.
- Nothing in the agreements limits liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited. The proposed cap remains the greater of £1,000 or twice the fee for that service order. The omnibus still records that whether the cap is reasonable is open for the reviewer. This pack does not decide it.
- The customer confirms the service is for the business. If the customer is in law a consumer, rights that cannot be excluded remain.
- Confidentiality and the published privacy notice are the data terms. There is no separate processing schedule and no data-protection officer is named.
- The governing law and courts are England and Wales, without removing a right to sue in another court where the law does not allow that choice to be taken away.
- ProfileRelaunch is independent of Google. No agreement authorises ProfileRelaunch to decide a Google outcome.

## Decisions required

Each item is a difference a person needs to accept, reject, or resolve by a new body and a new hash. This pack does not choose for them.

### D1. Guided work is prepared by ProfileRelaunch and submitted by the customer

The published recovery, review, pricing and how-it-works pages say "We prepare it. You submit it." The Guided proposals say the customer files the work with Google, ProfileRelaunch does not submit it, and the service does not require the customer to add ProfileRelaunch as a Manager.

The omnibus does not say that. Section 3 describes Guided Relaunch and Guided Review as support ProfileRelaunch carries out for the customer. Section 8 says that where the service needs access to a Business Profile, the customer adds ProfileRelaunch as a Manager. That sentence is not limited to Managed or Guard.

Decision: approve Guided agreements in which the customer submits and Manager access is not required, or require a new body that follows the omnibus instead.

### D2. When the Guided fee is due

The omnibus says a Guided fee is payable upfront only after a valid quotation and the agreement have been accepted. The proposals say the price is due after acceptance and before work begins. The standard quotation wording still says the quoted amount is payable later through the payment workflow, and that accepting the quote does not charge a card.

Decision: confirm that "before work begins" is the intended due point, or replace that sentence before approval so the agreement, the quotation, and the later payment step describe the same obligation.

### D3. The 20% reduction during the included 30 days of Guard

The Relaunch Guard page says the paid-member discount does not apply during the included period. Omnibus section 13 says the same. The Guard proposal describes the included 30 days and, separately, 20% off while paid monitoring is active. It does not say the reduction is unavailable during the included period.

Decision: accept the omission, or put the exclusion back into the Guard body and approve the new hash.

### D4. Whether the 20% reduction is expressly unavailable for Guided support

The Relaunch Guard page and omnibus section 13 say the discount does not apply to Guided support. The proposal grants 20% only for an eligible new Managed Profile Recovery or Managed Review Protection case. It does not repeat an exclusion for Guided support.

Decision: confirm that a Managed-only grant is enough, or restore the express Guided exclusion and approve the new hash.

### D5. Notice before a Guard price change

The Relaunch Guard page says a higher monthly price needs at least 30 days' notice, and that the higher price is charged only if the customer accepts it. Neither the omnibus nor the Guard proposal contains that clause.

Decision: leave the promise on the website only, or add it to the Guard body before approval.

### D6. An incomplete Guard check or lost access

The Relaunch Guard page says an incomplete check is retried and reported, and that lost access pauses billing for unavailable coverage. It also says that if no working alert channel remains, the service and billing pause. Neither the omnibus nor the Guard proposal contains those operational promises. The proposal does not invent a telephone number.

Decision: leave those sentences on the website, or add the ones that should be contractual before approval.

### D7. What Manager access allows Guard to change

The Relaunch Guard page says Manager access allows changes, Guard checks and alerts by default, and a change to the profile needs separate approval. The Guard proposal asks the customer to add ProfileRelaunch as a Manager and says the customer remains the owner. It does not say that a profile change needs separate approval.

Decision: accept the shorter access clause, or add the limit before approval.

### D8. Payment in a currency other than pounds

The pricing page says prices are in pounds, and that a payment provider may apply its own conversion rate or fees if the customer pays from an account in another currency. Omnibus section 4 says that where Stripe can present another currency, the final currency and amount are shown before payment, the quotation in pounds remains authoritative, and no conversion rate is guaranteed. The current seller presentment used by the eligibility checks is pounds only.

Each proposal says the quotation amount in pounds is authoritative. None mentions a payment-provider conversion or a Stripe presentment in another currency.

Decision: confirm that new agreements should not promise a non-pound presentment, and decide whether the customer's own provider conversion should be stated in the agreement.

### D9. A pending Managed outcome

The omnibus says a pending outcome is not invoiced as success. The Managed proposals say a pending outcome is not invoiced.

Decision: confirm that a pending outcome produces no invoice at all.

### D10. The record of the two Managed checks

Omnibus section 10 says both verification timestamps and the observations that support them are recorded. The Managed proposals say the observations relied on for the success fee are recorded. They do not expressly say both timestamps are kept.

Decision: confirm the observation record is sufficient, or require the timestamps in the body before approval.

### D11. A dispute about a Managed outcome before a claim

Omnibus section 19 says a dispute about whether a Managed outcome met the success criteria is first handled under the evidence and dispute clause, and that either party may still bring a claim. The proposals keep the written dispute and the pause on a genuinely disputed amount. Their governing-law section does not repeat that the dispute is handled there first.

Decision: confirm the invoice dispute clause is the whole of that process.

### D12. Ending one service while another continues

The omnibus says ending one service order does not end a different service order. The Guard proposal says ending monitoring does not end a different service order. The Managed and Guided proposals do not say that.

Decision: confirm the single-service agreements may stay silent, or add the sentence to the Managed and Guided endings before approval.

### D13. Which services can be offered before all five are approved

The safe rehearsal below is for Guided Relaunch only. The other four bodies may still be unapproved when that rehearsal is allowed.

Decision: until a service has its own operative agreement, a new offer of that service either continues to bind `PS-2026-10-14.2`, or it is refused. This pack does not switch any service away from the omnibus.

### D14. Open points that the proposals do not close

The omnibus still lists the whole version, the liability cap, consumer misclassification, international customers and jurisdiction, professional indemnity, and privacy and data-processing terms as open for the reviewer. The website terms say the site is intended for businesses and is designed to support businesses internationally. The proposals keep the business confirmation, the consumer savings sentence, the England and Wales clause, the same liability cap, and the privacy-notice sentence. They do not add indemnity insurance or a processing schedule.

Decision: these remain open. Approval of a proposal would have to cover them expressly. This pack does not close them.

## Later DEV activation, not part of this change

No migration in this change. Nothing here is applied to DEV or Production. `admin_confirm_paid_service_agreement_v1` still selects only `PS-2026-10-14.2`. Calling it is an approval of that omnibus, and this pack does not call it. The five proposals are not catalogue rows, so they cannot be confirmed by the current function.

The catalogue table accepts only version `PS-2026-10-14.2` and hash `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`. Its body and hash cannot be updated. An operative row cannot be updated. Paid-service acceptance rows are immutable and currently must record that same version and hash. The offer trigger writes that version and hash when a draft becomes offered. An offered or accepted quote version cannot change its scope, price, payment wording, terms, agreement version, or agreement hash.

A later migration, after a person has approved one exact version and hash, would have to do all of the following and no more:

1. Allow the new version id and its own hash in the catalogue checks. Leave the existing row, its body, and its hash untouched.
2. Insert the approved body as its own row. Do not update `PS-2026-10-14.2`.
3. Leave that new row unconfirmed until a separate human confirmation records evidence that is not merely the version id or the hash. The current confirmation function rejects evidence that is only the version or the hash, and it writes one immutable approval. Once a row is operative, the current trigger does not let a later migration turn it back. Confirmation is one-way. Do not confirm a row until that service is meant to be offered.
4. Change offer and acceptance routing only for a service whose row is operative. The routing writes that service's version and hash onto a draft when it is offered. It does not rewrite a quote version that is already offered or accepted. A service without an operative service-specific row follows decision D13.
5. Widen the acceptance-table checks so a new acceptance may store the new version and hash. Do not update or delete an acceptance already stored.

Rollback before confirmation is to refrain from applying the migration. Rollback after an unconfirmed insert, and before any quote stores the new version, is a forward migration that removes only that unconfirmed row. There is no supported way to un-approve an operative row. Do not delete a catalogue row that a quote or an acceptance already names.

The later migration's tests need to show: the omnibus row and hash are unchanged; a proposal hash is rejected before confirmation; after confirmation of one service, a new offer of that service stores that version and hash; a new offer of another service does not receive that body; an already offered quote version still has its original version and hash.

## Replacing the synthetic £99 offer

Quote `QT-26-H6JSMB` on case `PR-26-RZYCE4` stays bound to `PS-2026-10-14.2` and the stored £99 gross price. This change does not cancel it, supersede it, or issue another quote.

When, and only when, the Guided Relaunch version and hash above are operative on DEV, the offer trigger will bind that version to a new Guided offer, and a separate permission authorises the rehearsal:

1. Read the current offered version and record its version id, status, total of 9900, agreement version `PS-2026-10-14.2`, and agreement hash `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`. Do not update those fields.
2. End that offer before any replacement is offered. Use the existing `cancel` command. It records `QUOTE_CANCELLED`, revokes the acceptance link, and changes the status only. If the offer has already passed `valid_until`, it is no longer open for acceptance. `valid_until` cannot be edited on the offered version. Do not leave `QT-26-H6JSMB` offered while another quotation for the case is also offered.
3. Create the replacement with `create_draft` for the same case, Guided Relaunch, and the £99 gross price. That command inserts a new quote and a new public reference. It does not update `QT-26-H6JSMB`.
4. Set the draft tax through the existing command, then offer the new quote. The offer trigger binds the approved Guided Relaunch agreement to the new version only.
5. Check that the case has one offered quote, that the new quote stores `PS-2026-10-21.GR` and hash `e4f9ecb589f0e4efa8f46a25faa750bb2db3cf3ad1665b511f34fb486fbe8c88`, and that the cancelled version still stores `PS-2026-10-14.2` and hash `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`.

Do not call `create_version` and then `offer` on `QT-26-H6JSMB`. Offering another version of that same quote marks the current offer superseded and revokes its acceptance link. That is a different operation from cancelling the quote and creating a new one.

A customer acceptance link, an email, and any payment are separate approvals. This rehearsal does not send them. It does not run on Production and it does not call Stripe.
