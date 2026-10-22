# CUSTOMER-QUOTE-03 — Aligned drafts of the five service agreements

This pack records the 22 October 2026 drafts after the wording named in CUSTOMER-QUOTE-03 was brought into line with the published ProfileRelaunch promises. It does not approve them. Each agreement remains `SOLICITOR_REVIEW`. None is operative, customer-visible, or acceptance-actionable. No catalogue row is inserted, no migration is applied, no quote is issued, and no payment is taken.

Three kinds of text are kept apart:

- A website promise is the wording currently published on the ProfileRelaunch site. This change does not rewrite the site.
- Contract text is the proposed body in `lib/commercial/service-agreements.ts`. "Aligned in draft" means that body now contains the clause quoted below. It is not solicitor approval.
- A legal judgement is a decision about whether that contract text is lawful, reasonable or sufficient. This pack does not make that judgement.

The SHA-256 below is the hash of the exact UTF-8 body. The PDF is a reading copy of the same words. Approving a PDF file, or a hash of the PDF bytes, would not approve the agreement. A reviewer approves a version id together with the body hash, or does not approve it.

The PDF adds the ProfileRelaunch name in the header and a page number. Those are not part of the hashed body. The version id and the hash are not printed in the agreement.

## Approval register

| Service | Reading copy | Version | SHA-256 of the source body | Status | Approved | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Guided Relaunch | [guided-relaunch.pdf](quote-02/guided-relaunch.pdf) | PS-2026-10-22.GR | `705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3` | SOLICITOR_REVIEW | No | None |
| Guided Review | [guided-review.pdf](quote-02/guided-review.pdf) | PS-2026-10-22.GV | `56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9` | SOLICITOR_REVIEW | No | None |
| Managed Profile Recovery | [managed-profile-recovery.pdf](quote-02/managed-profile-recovery.pdf) | PS-2026-10-22.MR | `725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269` | SOLICITOR_REVIEW | No | None |
| Managed Review Protection | [managed-review-protection.pdf](quote-02/managed-review-protection.pdf) | PS-2026-10-22.MV | `62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784` | SOLICITOR_REVIEW | No | None |
| Relaunch Guard | [relaunch-guard.pdf](quote-02/relaunch-guard.pdf) | PS-2026-10-22.GD | `51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23` | SOLICITOR_REVIEW | No | None |

Approved means a person has recorded approval of that exact version and that exact hash. Cursor, CI, and this document do not do that. The owner-reported note of 15 October 2026 applies only to `PS-2026-10-14.2`. It is not a solicitor document, and it does not approve these five bodies.

Each proposal is dated 22 October 2026 in the customer-visible text. The contracting party in every body is ProfileRelaunch Ltd, company number 17520826, incorporated in England and Wales on 14 October 2026, registered office 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ. Notices go to contact@profilerelaunch.com. No body states a VAT number. Each body says ProfileRelaunch is not registered for VAT and does not add VAT while that remains the case. No body invents a telephone number or a data-protection officer.

A change to any body needs a new version id and a new hash before anyone is asked to approve it. Do not approve a version and then edit the body. Do not reuse an older version id with a new hash.

## Superseded 21 October drafts

These hashes were the previous unapproved proposals. Nothing was bound to them, including quote `QT-26-H6JSMB`. The PDFs in this folder are the 22 October reading copies, not those drafts. Do not approve the hashes in this table.

| Service | Superseded version | SHA-256, unapproved and unused |
| --- | --- | --- |
| Guided Relaunch | PS-2026-10-21.GR | `e4f9ecb589f0e4efa8f46a25faa750bb2db3cf3ad1665b511f34fb486fbe8c88` |
| Guided Review | PS-2026-10-21.GV | `6b4c26493e4e3450cfca9a5c41908ec44c22b329f85228a536c8192d1803a2ff` |
| Managed Profile Recovery | PS-2026-10-21.MR | `1a7188c9d9f1b054cf3bf6627a66a9206f042dbf5684c5615c870be72f4699ee` |
| Managed Review Protection | PS-2026-10-21.MV | `6dded927728a4cec7226712eccbf1d3243645602f58a56f94275b76235549214` |
| Relaunch Guard | PS-2026-10-21.GD | `b48fdffe3ff8ec15543fec0e0717fdabba73c4ffe128fc1b2600b8d2ca61c9e6` |

`PS-2026-10-14.2` (SHA-256 `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`) is unchanged. It remains the only agreement a quotation can bind today. Every quotation already offered or accepted, including `QT-26-H6JSMB`, stays on that version and hash.

## Decision status

| Decision | Status | Agreement | Clause to review |
| --- | --- | --- | --- |
| D1. Guided responsibilities | aligned in draft | Guided Relaunch, section 3; Guided Review, section 3 | "We prepare it. You submit it. We organise the evidence and prepare the profile relaunch work for the location named in the quotation. We do not submit that work for you." Guided Review uses the same opening and "the review work named in the quotation." Section 6: "This service does not require you to add us as a Manager." |
| D2. When the Guided fee is due | aligned in draft | Guided Relaunch and Guided Review, section 4 | "The price is £99 unless the accepted quotation states a different price. It is due after you accept the quotation and before work begins." Guided Review states £59. "Accepting the quotation does not take payment. Payment is a later step." |
| D3. Guard discount during the included 30 days | aligned in draft | Relaunch Guard, section 5 | "The 20% reduction below does not apply during those 30 days." The published page says the paid-member discount does not apply during the included period. |
| D4. Guard discount and Guided support | aligned in draft | Relaunch Guard, section 5 | "While you are paying the monthly price for a location, you receive 20% off the standard fee for an eligible new Managed Profile Recovery or Managed Review Protection case at that location." "The reduction does not apply during the included 30 days, to Guided support, to the monitoring fee, or to a custom or bulk quotation." "Once we agree a reduced fee for a case, cancelling monitoring does not remove that reduction." |
| D5. Notice before a higher Guard price | aligned in draft | Relaunch Guard, section 5 | "We will not charge a higher monthly price unless we have given you at least 30 days' notice of that price and the date it would apply, and you have agreed to it. If you do not agree, monitoring ends before that date. We will not start the higher price automatically." |
| D6. Interrupted Guard checks and lost contact | aligned in draft | Relaunch Guard, section 3 | "If we cannot complete a scheduled check, we retry, record what happened, and tell you if it stays incomplete. If the access this service needs is lost, we ask you to restore it and we pause billing for the coverage we cannot provide. If no working way to alert you remains, we pause the service and the billing. A phone number you have given us may be used only to resolve a failed email. We check a replacement email address before we use it." The same section still says the checks "are not a promise of continuous monitoring." |
| D7. Separate approval for a profile change | aligned in draft | Managed Profile Recovery, Managed Review Protection and Relaunch Guard, section 6 | "Where this service needs access to a Business Profile, you add us as a Manager for this service only. You remain the owner. We do not change the profile unless you separately approve that change. We do not ask for your Google password or access to your email account." Guided agreements do not ask for Manager access. |
| D8. Pounds and a customer's own conversion | aligned in draft | Every proposal, price section | "The price is in pounds sterling (GBP). That pound amount is our agreed fee. If you pay from an account in another currency, your bank or payment provider may convert it or charge its own fee. We do not set or guarantee that rate." No proposal mentions a Stripe presentment in another currency. |
| D9. A pending Managed outcome | aligned in draft | Managed Profile Recovery and Managed Review Protection, section 4 | Recovery: "A pending outcome is not invoiced as success." Review: "A missing, unknown or ambiguous observation stays pending and is not invoiced as success." Section 5: "There is no automatic card charge and no collection of that success fee in advance." |
| D10. Both check times are recorded | aligned in draft | Managed Profile Recovery and Managed Review Protection, sections 4 and 7 | "We record the time of each check and what we observed." Recovery also requires the checks to be "at least 48 hours later." Review requires "two checks at least 48 hours apart." |
| D11. A dispute does not remove a claim | aligned in draft | Managed Profile Recovery and Managed Review Protection, section 5 | "You may dispute the claimed outcome in writing before the invoice falls due." "Either of us may still bring a claim." |
| D12. Ending one order leaves another in place | aligned in draft | Guided and Managed, section 12; Relaunch Guard, section 12 | Guided and Managed: "Ending this service does not end a different service order." Guard: "Ending monitoring does not end a different service order." |
| D13. Which agreement a new offer may use | requires human approval | Not a clause. Activation only, after a person approves an exact version and hash. | Choose, before any service-specific offer is switched on, either a fail-closed route or a documented transition. See below. This pack does not choose and does not switch any offer. |
| D14. Liability, status, privacy, customers abroad, insurance and cancellation rights | requires human approval | Shared sections 2, 8, 10 and 13, left open on purpose | The cap, the business confirmation, the privacy notice, and the England and Wales clause are carried forward. Whether they are enough is a legal and compliance decision. See below. |

The website sentence "We prepare it. You submit it." is now the opening of both Guided service sections. The Guided service does not require the customer to add ProfileRelaunch as a Manager. The published Relaunch Guard page says the paid-member discount does not apply during the included period, and that a higher price needs at least 30 days' notice and the customer's agreement. Those promises are now in the Guard draft. The published page uses a typographic apostrophe in "30 days' notice". The contract uses a straight apostrophe so the reading copy can be drawn. The words are the same.

Aligning a draft is not approval. D1 to D12 still need a person to accept the exact clause, the version id and the hash, or to send them back for another version.

### D13. requires human approval

Until a service has its own operative agreement, a new offer of that service either continues to bind `PS-2026-10-14.2`, or it is refused. Both routes are open. This pack recommends the fail-closed route and does not implement it: do not issue a new binding customer offer on an unapproved service-specific agreement, and do not issue a second open offer for the same case. An already offered or accepted version stays on the agreement stored on it.

The choice, and any later owner approval of a transition, is for a person. It is not a clause in these drafts.

### D14. requires human approval

These points stay open. Approval of a proposal would have to cover them expressly. This pack does not close them, and it does not invent a sign-off, a VAT number, a data-protection officer, or any authority from Google.

- Whether the liability cap, "the greater of £1,000 or twice the fee for that service order", is reasonable.
- Whether the business-purpose confirmation, with the sentence that a consumer keeps rights the law does not allow to be excluded, correctly classifies customers.
- Privacy and data-protection roles. The drafts keep confidentiality and the published privacy notice. They do not add a processing schedule.
- Terms for customers in the United Kingdom and for customers elsewhere. The site is intended for businesses and is designed to support businesses internationally. The drafts keep the law and courts of England and Wales, and a sentence that this choice does not remove a right to sue in another court where the law does not allow that choice to be taken away.
- Whether professional indemnity or other insurance should be stated.
- Statutory cancellation protections, beyond the service-specific refund and cancellation clauses already in each draft.

## Later DEV activation, not part of this change

No migration in this change. Nothing here is applied to DEV or Production. `admin_confirm_paid_service_agreement_v1` still selects only `PS-2026-10-14.2`. Calling it is an approval of that omnibus, and this pack does not call it. The five proposals are not catalogue rows, so they cannot be confirmed by the current function.

The catalogue table accepts only version `PS-2026-10-14.2` and hash `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`. Its body and hash cannot be updated. An operative row cannot be updated. Paid-service acceptance rows are immutable and currently must record that same version and hash. The offer trigger writes that version and hash when a draft becomes offered. An offered or accepted quote version cannot change its scope, price, payment wording, terms, agreement version, or agreement hash.

A later migration, after a person has approved one exact version and hash from the register above, would have to do all of the following and no more:

1. Allow the new version id and its own hash in the catalogue checks. Leave the existing row, its body, and its hash untouched.
2. Insert the approved body as its own row, still `SOLICITOR_REVIEW` and not operative. Do not update `PS-2026-10-14.2`.
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
5. Check that the case has one offered quote, that the new quote stores `PS-2026-10-22.GR` and hash `705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3`, and that the cancelled version still stores `PS-2026-10-14.2` and hash `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`.

Do not call `create_version` and then `offer` on `QT-26-H6JSMB`. Offering another version of that same quote marks the current offer superseded and revokes its acceptance link. That is a different operation from cancelling the quote and creating a new one.

A customer acceptance link, an email, and any payment are separate approvals. This rehearsal does not send them. It does not run on Production and it does not call Stripe.


## Owner's recorded approval — 22 October 2026

On 22 October 2026, the ProfileRelaunch owner confirmed in the project conversation that they had checked and given **legal approval for all five service-specific agreements**, and authorised proceeding through DEV activation and creation of a fresh £99 Guided Relaunch test quotation.

This records **owner approval only**. It is not a representation that an independent solicitor reviewed or signed the documents. The technical contract catalogue continues to mark the drafts as \`SOLICITOR_REVIEW\` and non-operative until a separately tested, auditable owner-approval mechanism and DEV-only activation migration are delivered. In particular, the existing database's literal statement \`Solicitor reviewed paid-service agreement...\` must not be fabricated to make a row operative.

Approved for the owner-controlled DEV rollout are the **exact source bodies**, versions and SHA-256 hashes below, not the old omnibus or superseded 21 October drafts:

| Service | Version | SHA-256 (UTF-8 contract body) |
| --- | --- | --- |
| Guided Relaunch | PS-2026-10-22.GR | \`705a8fe4aa51242ed3d01102a920a2ca22391fa4aa6f60e2c449d14b437f8eb3\` |
| Guided Review | PS-2026-10-22.GV | \`56334ee14bb3c31b4144e339738cefbd28039c5a163785cc9aa7c9f8b85bbbe9\` |
| Managed Profile Recovery | PS-2026-10-22.MR | \`725e0d769943852cef1ffe9dc12a0282bdd6c9ac7a7b2ef4c0fa16cbf637a269\` |
| Managed Review Protection | PS-2026-10-22.MV | \`62a1ee6fbd1cc196103c1ae281592ed857c84df4e13a5158aa7334794ebbc784\` |
| Relaunch Guard | PS-2026-10-22.GD | \`51da445b47ea6f2cc4671b3192c068c78ce81548a7f36a38e6ccc92607905f23\` |

The owner authorises D13's **fail-closed** rule: a new offer may bind a service-specific agreement only if that exact service version/hash is approved and operative; never fall back silently to a wrong agreement. Existing offered or accepted quotes are immutable. The implementation must leave \`QT-26-H6JSMB\` and \`PS-2026-10-14.2\` untouched until a controlled DEV replacement is performed. The approval itself authorises no email, money movement, or Production change.

Any future changes to the body text require another version ID, SHA-256 hash and fresh owner approval. Legal obligations, consumer rights and privacy law remain applicable notwithstanding this owner approval.
