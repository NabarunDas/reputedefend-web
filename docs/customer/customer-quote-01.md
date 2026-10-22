# CUSTOMER-QUOTE-01 — Service-specific quotation and agreement presentation

The customer quotation is now a single service document. It names the business, location, case, quotation and service, then shows what ProfileRelaunch will do, what the customer does, what is not included, one final price, when that price is paid, and how long the quotation remains valid. A success definition is shown only when the service is an outcome-based success fee. A zero discount is not described as "No discount". The acceptance lines for business authority, the selected service, a Managed success fee and Guard monthly billing stay. The words SHA-256, the agreement version and template markers are not part of those acceptance lines.

The agreement on the page is the exact body already bound to that quotation. Markdown headings in that body become headings. Paragraphs stay paragraphs. The customer can download a branded PDF of that same wording. The PDF adds the ProfileRelaunch name and page numbers around the wording. It does not replace a clause.

The version and SHA-256 stay on the acceptance request. The server still rejects an acceptance unless that pair matches the catalogue row bound to the quotation.

## Issued quotations stay on their stored agreement

`PS-2026-10-14.2` is unchanged. Its SHA-256 remains `0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4`. The offer trigger in `supabase/migrations/20261015013000_paid_service_acceptance_gate_v1.sql` still binds only that version and hash. This change does not edit that migration, does not insert a catalogue row, and does not update quote `QT-26-H6JSMB` or any historical acceptance.

A quotation already bound to `PS-2026-10-14.2` therefore still shows that full agreement, including the other services, because that is the contract attached to the offer. Hiding those clauses while keeping the old hash would make the displayed text differ from the text the hash verifies. The quotation summary above that agreement is limited to the purchased service. The agreement itself is not filtered.

## Proposed service agreements

Five new bodies are source proposals only. Each is `SOLICITOR_REVIEW`, not operative, not customer-visible, and not acceptance-actionable. The current acceptance gate treats every one of them as a stale version. They are not a replacement for `PS-2026-10-14.2`.

| Service | Version | SHA-256 |
| --- | --- | --- |
| Guided Relaunch | PS-2026-10-21.GR | `e08731b8138122a692a69e704a79ba0dfee4c9edd05138548e7b0f1e7f9bd76a` |
| Guided Review | PS-2026-10-21.GV | `9249604f97b6fb1a599636b3eb3d18f3da9db2eae56b8e9021e69ab252a68bb7` |
| Managed Relaunch | PS-2026-10-21.MR | `97ad2d9685735791d8b60f2f1304c7d78f6d82e11406b3c8c63c1fab0c532f54` |
| Managed Review | PS-2026-10-21.MV | `db5f0b66042bfa811c9b79f3e72e9027fa0caf785cbac7fabbc50b6fd77d427d` |
| Relaunch Guard | PS-2026-10-21.GD | `e48450fed19cb3e5c77f82666c586cf4f09ece0dd5fe2fc51fa4d695da5124fa` |

Guided agreements state that the customer submits the prepared work and does not add ProfileRelaunch as a Google Manager. Managed and Guard agreements keep Manager access where that service needs it. Each agreement states only its own price. Shared clauses cover formation, authority, tax, confidentiality, intellectual property, liability, complaints, ending the service, and the law of England and Wales. Liability still preserves rights that cannot legally be limited, including death, personal injury caused by negligence, and fraud, and keeps the cap at the greater of £1,000 or twice the fee for that service order.

A wording change to one of these proposals needs a new version id and a new SHA-256. Do not edit a pinned body and keep its hash.

## Approval and migration, not part of this change

Before a newly issued quotation can bind one of these versions, a solicitor needs to approve that exact version and hash, and a later migration needs to:

- insert a catalogue row for the approved version and hash
- record the approval evidence through the existing immutable approval path
- let the offer trigger select the agreement for the service being offered
- leave every quotation that is already offered or accepted on `PS-2026-10-14.2`

That migration is not in this change. It has not been applied to DEV or Production. No quotation is issued and no payment is taken.
