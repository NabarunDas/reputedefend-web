# ADMIN-JOURNEY-E2E-01 — eleven-step acceptance

Status: acceptance record for `develop` at `3d35e3c` and the disposable regression added with this note. This is not a Production-readiness decision.

Environment used: PGlite, loading the repository migration chain. No connection was made to DEV (`rmzozuiamjcclvtgutgd`) or Production (`cxwwekdzkkjjbiyofrov`). No live Stripe charge, refund, invoice, Google submission, or outbound customer email was sent. Agreement PS-2026-10-14.2 was not edited. No migration was added or applied.

The repository records `20261019235000` as the applied DEV head and `20261014170000` as the Production head. This exercise did not re-read either live ledger.

Browser: this environment has no Admin OTP session and no DEV service credentials. Every signed-in browser scenario is **NOT TESTED**. Mocked component tests are listed as automated coverage only.

## Result key

- **PASS** — a disposable PGlite test, or a pure test fed by that projection, executed the rule.
- **FAIL** — a test executed the rule and the product disagreed with it.
- **NOT TESTED** — this exercise did not run that scenario, including every signed-in browser path.

## Eleven steps

| Step | A Guided recovery | B Managed qualifying | C Managed unsuccessful | D Cancel and reopen |
| --- | --- | --- | --- | --- |
| 1 Intake reviewed | PASS | PASS | PASS | PASS |
| 2 Customer and business verified | PASS | PASS | PASS | PASS |
| 3 Documents requested | PASS | NOT TESTED | NOT TESTED | NOT TESTED |
| 4 Evidence reviewed and accepted | PASS | NOT TESTED | NOT TESTED | NOT TESTED |
| 5 Assessment approved | PASS | NOT TESTED | NOT TESTED | PASS |
| 6 Quote accepted | PASS | PASS | NOT TESTED | PASS |
| 7 Activation / settlement or authority | PASS | PASS | NOT TESTED | PASS |
| 8 Preparation approved | PASS | NOT TESTED | NOT TESTED | NOT TESTED |
| 9 Submission recorded and resolved | PASS | PASS | NOT TESTED | NOT TESTED |
| 10 Outcome and billing | PASS | PASS | PASS | PASS |
| 11 Closure | PASS | PASS | PASS | PASS |
| Signed-in browser, all steps | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

No scenario is **FAIL**.

### A — Guided successful profile recovery

`apps/admin/lib/case-journey/acceptance-walk.database.test.ts` walks one synthetic profile-recovery case through the existing commands:

1. `admin_case_journey_decision_v1` records `INTAKE_REVIEW` / `REVIEWED`.
2. The same command records `BUSINESS_VERIFICATION` / `PRELIMINARY_COMPLETE`. It does not verify email or grant authority.
3. An evidence request is drafted, reviewed, and queued. Delivery is a local provider event (`communication_apply_provider_event_v1`). The `SEND_EMAIL` job is not completed. No message leaves the database.
4. The ownership letter is finalised, scanned clean, accepted, marked customer-visible, and the request is fulfilled.
5. The assessment is drafted, reviewed, and approved as Guided.
6. The customer accepts `GUIDED_RELAUNCH` through the quote-acceptance OTP command. The order is `ACCEPTED_AWAITING_PAYMENT`.
7. Settlement is `payment_apply_provider_event_v1` with `livemode: false`. The obligation becomes `PAID`, one receipt is stored, and the order state stays `ACCEPTED_AWAITING_PAYMENT`.
8. The pack is approved and published from that visible file.
9. The submission actor is `CUSTOMER`. It is resolved `DECIDED`. The command does not call Google.
10. `record_outcome` stores `RESTORED` and leaves the case `UNDER_REVIEW` at `OUTCOME_REVIEW`.
11. `close` with the same outcome and summary stores `CLOSED` / `FINISHED`.

`presentCaseJourney` then reports steps 1–10 `COMPLETED`, focuses step 11, and offers close. After close, all eleven steps are `COMPLETED` and the focus is empty. Destinations are the case, the business record, commercial, evidence, and money.

`admin_case_detail_v1` puts the closure summary on `customerPreview.summary` and does not put the internal intake note in `customerPreview.notes`. `customer_portal_case_v1` for the owning customer returns `CLOSED`, `outcomeCode: RESTORED`, and timeline codes `QUOTE_ACCEPTED`, `PAYMENT_RECEIVED`, `SUBMITTED_TO_GOOGLE`, and `CASE_COMPLETED`. It does not include the internal note or the summary sentence. A second customer receives `{ found: false }`.

Slice coverage that the walk does not replace: `guided-settlement.database.test.ts`, `close-billing.database.test.ts`, `decision.database.test.ts`, `assessment.database.test.ts`, `synthetic-checkout.database.test.ts`.

### B — Managed qualifying success

There is no single Managed command walk in this exercise. The commercial rule is covered in slices:

- Authority, agreement, permission, and Manager access: `apps/admin/lib/authorization/database.test.ts`. Incomplete authority does not activate Managed preparation.
- Accepted Managed quote and order: `apps/admin/lib/commercial/paid-service-acceptance.database.test.ts` and `apps/admin/lib/payments/database.test.ts`.
- Managed submission actor `ADMIN`: `apps/admin/lib/cases/database.test.ts`.
- A success-fee obligation is not created before approval of a qualifying outcome: `payments/database.test.ts`.
- An approved fee stays “Approved fee” and is not complete. An issued invoice is “Invoiced”, says it is not payment, and does not complete step 10. Provider settlement is the completed position: `apps/admin/lib/case-journey/outcome.test.ts`.
- Close of a settled qualifying Managed case, and refusal while the fee is uncollected: `apps/admin/lib/cases/close-billing.database.test.ts`.

Steps 3, 4, 5, and 8 were not re-run on a Managed case here. Pack and evidence commands are not track-specific, but that is not a Managed preparation walk.

### C — Managed unsuccessful outcome

`close-billing.database.test.ts` closes a non-qualifying Managed case with no success-fee collection, refuses a contradictory active fee, and allows a voided uncollected fee. `outcome.test.ts` treats a voided success fee on a non-qualifying order as not billable and completes step 10 without a charge.

The close fixture inserts the accepted Managed order. It does not run the customer accept command, the authority commands, or the evidence, pack, and submission commands. Steps 3, 4, 5, 6, 7, 8, and 9 were not composed onto that unsuccessful case.

### D — Cancellation and reopening

The Guided walk, after the successful close, reopens the case, keeps the original intake and close events, refuses another `RESTORED` record at `FURTHER_REVIEW`, records `NOT_RESTORED` at `OUTCOME_REVIEW`, refuses a second record, and closes on that new outcome. The upfront receipt is still the settlement. The customer portal shows the re-closed case as `CLOSED` and returns `outcomeCode: null` for `NOT_RESTORED`.

`close-billing.database.test.ts` covers early Guided withdrawal, Managed withdrawal before and at outcome review, and the rule that an active success fee blocks cancellation. `record-outcome.database.test.ts` covers invalid outcomes, replay, a repeated record, stale versions, and a new outcome after reopen on the chain that ends at `20261019183000`. That file does not load `20261019235000`, so its close-without-commercial-rows case is not the current predicate.

## Negative and security checks

| Check | Result | Evidence |
| --- | --- | --- |
| Unpaid Guided close | PASS | Walk denies close before settlement. `close-billing.database.test.ts` refuses unpaid, failed, and unconfirmed checkout. |
| Missing receipt | PASS | `close-billing.database.test.ts`. The walk records exactly one receipt. |
| Wrong customer or wrong order | PASS | `close-billing.database.test.ts`. Portal read by the other customer is `{ found: false }`. |
| Duplicate or extra order | PASS | `close-billing.database.test.ts` refuses a second order and an extra same-track order. |
| Broken quote, acceptance, approval, amount, currency, or tax link | PASS | `close-billing.database.test.ts`. |
| Incorrect evidence | PASS | `assessment.database.test.ts` refuses approval without ready evidence. `payments/database.test.ts` rejects invalid outcome evidence for a success fee. |
| Incomplete authority | PASS | `authorization/database.test.ts` keeps Managed preparation blocked. |
| Open task | PASS | Walk: close returns `open_work` until the payment follow-up and the reopen task are resolved. |
| Unresolved submission | PASS | Walk: close returns `open_work` while the attempt has no result. |
| Stale version | PASS | Walk returns `conflict` and does not close. Also `close-billing.database.test.ts`. |
| Outcome that does not match the stored record | PASS | Walk denies `NOT_RESTORED` while `RESTORED` is stored, and denies a second record after the replacement. |
| Unauthorised token | PASS | Walk and `close-billing.database.test.ts` return `unauthorized` and write nothing. |
| Replay of the same close | PASS | Walk returns the stored response and keeps one close event for that request. |
| Direct table update | PASS | `anon` cannot `UPDATE public.cases`. `case_close_billing_ready_v1` is not executable by `anon`, `authenticated`, or `service_role`. |
| Live-mode provider event | PASS | `payments/database.test.ts` ignores a live-mode webhook. The walk settles with `livemode: false` only. |
| Both Admin close screens | PASS as mocked UI | `closure.ui.test.tsx` and `cockpit/close-billing.ui.test.tsx` post `operation: "close"` and show the settlement refusal. Not a signed-in browser run. |
| Logged-out journey route | NOT TESTED in a browser | `gate.test.ts` covers the DEV preview gate in unit tests. |

## Customer visibility

- Owning customer, successful close: portal status `CLOSED`, outcome `RESTORED`, payment and quote visible, internal note absent.
- Other customer: case not found.
- Admin customer preview: summary present, internal note absent.
- Portal case payload does not include the closure-summary sentence.
- After a valid `NOT_RESTORED` close, the portal still says `CLOSED` and sets `outcomeCode` to null. The case row keeps `NOT_RESTORED`.

## Automated coverage added

`apps/admin/lib/case-journey/acceptance-walk.database.test.ts`.

Existing suites cited above were not rewritten.

## Unresolved blockers

1. Signed-in Admin and customer browser journeys for A, B, C, and D were not run. No DEV OTP or service credential was available here.
2. Managed qualifying and Managed unsuccessful cases were not walked through all eleven commands in one case. Their commercial, authority, invoice, and close rules are slice tests.
3. Document request, evidence review, and pack publication were not repeated on a Managed or cancellation case.
4. The customer portal shows `RESTORED` and hides `NOT_RESTORED`. It also omits the closure-summary sentence. Whether that is the intended customer copy is unresolved.
5. `record-outcome.database.test.ts` still proves close on the pre-`20261019235000` chain. The current predicate is the full chain used by the walk and by `close-billing.database.test.ts`.
6. Production remains at `20261014170000`. Nothing in this exercise authorises a Production deploy, a live charge, a Google submission, or an outbound customer email.
