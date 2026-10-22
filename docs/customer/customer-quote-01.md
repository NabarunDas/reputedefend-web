# CUSTOMER-QUOTE-01 — Service-specific quotation and agreement presentation

The customer quotation names the business, location, case, quotation and service, then shows one final price, how long the quotation remains valid, and a short overview of the service. The overview is labelled as an explanation. It is not a substitute for the quotation. Below it, the customer sees the stored scope, the stored exclusions, and the stored payment wording in full. A sentence is not removed because it mentions an amount. A success definition is shown only when the service is an outcome-based success fee, and that text is the stored definition. A zero discount is not described as "No discount". The acceptance lines for business authority, the selected service, a Managed success fee and Guard monthly billing stay. The words SHA-256, the agreement version and template markers are not part of those acceptance lines. A trailing standard-wording marker is still omitted from the scope display. The stored scope is not changed, and a marker that is not at the end of the scope stays visible.

The agreement on the page is the exact body already bound to that quotation. Markdown headings in that body become headings. Paragraphs stay paragraphs. The customer can download a branded PDF of that agreement only. The PDF adds the ProfileRelaunch name and page numbers around the wording. It does not replace a clause. A character that Helvetica cannot draw stops the download. It is not replaced with a question mark. Lines use the Helvetica widths so the wording stays inside the page margins.

The version and SHA-256 stay on the acceptance request. The server still rejects an acceptance unless that pair matches the catalogue row bound to the quotation.

## Issued quotations stay on their stored agreement

`PS-2026-10-14.2` is unchanged. Its SHA-256 remains `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`. The offer trigger in `supabase/migrations/20261015013000_paid_service_acceptance_gate_v1.sql` still binds only that version and hash. This change does not edit that migration, does not insert a catalogue row, and does not update quote `QT-26-H6JSMB` or any historical acceptance.

A quotation already bound to `PS-2026-10-14.2` therefore still shows that full agreement, including the other services, because that is the contract attached to the offer. Hiding those clauses while keeping the old hash would make the displayed text differ from the text the hash verifies. The quotation summary above that agreement is limited to the purchased service. The agreement itself is not filtered.

## Proposed service agreements

Five new bodies are source proposals only. Each is `SOLICITOR_REVIEW`, not operative, not customer-visible, and not acceptance-actionable. The current acceptance gate treats every one of them as a stale version. They are not a replacement for `PS-2026-10-14.2`.

The customer-visible text of each proposal starts with the service title and the date 22 October 2026. It does not contain the version id. The version id and the SHA-256 below are metadata. They are what a later approval and catalogue row must name. These hashes replace the earlier proposal hashes because the visible wording was settled before any solicitor approval. Nothing was bound to the earlier hashes.

| Service | Version | SHA-256 |
| --- | --- | --- |
| Guided Relaunch | PS-2026-10-21.GR | `e4f9ecb589f0e4efa8f46a25faa750bb2db3cf3ad1665b511f34fb486fbe8c88` |
| Guided Review | PS-2026-10-21.GV | `6b4c26493e4e3450cfca9a5c41908ec44c22b329f85228a536c8192d1803a2ff` |
| Managed Relaunch | PS-2026-10-21.MR | `1a7188c9d9f1b054cf3bf6627a66a9206f042dbf5684c5615c870be72f4699ee` |
| Managed Review | PS-2026-10-21.MV | `6dded927728a4cec7226712eccbf1d3243645602f58a56f94275b76235549214` |
| Relaunch Guard | PS-2026-10-21.GD | `b48fdffe3ff8ec15543fec0e0717fdabba73c4ffe128fc1b2600b8d2ca61c9e6` |

Guided agreements state that the customer submits the prepared work and does not add ProfileRelaunch as a Google Manager. Managed and Guard agreements keep Manager access where that service needs it. Each agreement states only its own price. Shared clauses cover formation, authority, tax, confidentiality, intellectual property, liability, complaints, ending the service, and the law of England and Wales. Liability still preserves rights that cannot legally be limited, including death, personal injury caused by negligence, and fraud, and keeps the cap at the greater of £1,000 or twice the fee for that service order.

A wording change to one of these proposals needs a new version id and a new SHA-256. Do not edit a pinned body and keep its hash.

## Approval and migration, not part of this change

Before a newly issued quotation can bind one of these versions, a solicitor needs to approve that exact version and hash, and a later migration needs to:

- insert a catalogue row for the approved version and hash
- record the approval evidence through the existing immutable approval path
- let the offer trigger select the agreement for the service being offered
- leave every quotation that is already offered or accepted on `PS-2026-10-14.2`

That migration is not in this change. It has not been applied to DEV or Production. No quotation is issued and no payment is taken.

## Reissuing QT-26-H6JSMB later

This change does not reissue QT-26-H6JSMB. The offered version stays on `PS-2026-10-14.2` at the stored £99 gross price.

An offered or accepted quote version is immutable. The database rejects a change to its scope, exclusions, price, payment wording, terms reference, agreement version or agreement hash. The agreement is bound only when a version moves from draft to offered. A later catalogue change does not rewrite a version that is already offered.

Do not call `create_version` and then `offer` on QT-26-H6JSMB. Offering a different version of that same quote marks the current offered version superseded and revokes its acceptance link. That would modify the existing offer.

After a solicitor has approved one exact proposed version and hash, and after a separate migration has inserted that catalogue row and made a newly offered quotation select the agreement for its service:

1. Create a new quote with `create_draft` for the same case, Guided Relaunch, and the £99 gross price. That command inserts a new quote and a new public reference. It does not update QT-26-H6JSMB.
2. Set the draft tax through the existing command, then offer that new quote. The offer trigger binds the approved Guided Relaunch agreement to the new version only.
3. Leave QT-26-H6JSMB offered on `PS-2026-10-14.2`. Do not cancel it, supersede it, or withdraw its acceptance link unless that separate change has its own approval.
4. The customer accepts the new quotation. An acceptance already recorded stays on the quote version it accepted.

No such quote is created by this change.
