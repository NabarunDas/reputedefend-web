# ADMIN-JOURNEY-E2E-01 — eleven-step acceptance

Status: acceptance record for the disposable Managed walks. The stage correction was applied to DEV only as migration `20261020120000` and is described in `docs/admin/admin-journey-e2e-02.md`. This is not a Production-readiness decision.

Environment used: PGlite, loading the repository migration chain, including the E2E-02 file, before its separate live DEV application. No connection was made to DEV (`rmzozuiamjcclvtgutgd`) or Production (`cxwwekdzkkjjbiyofrov`). No live Stripe charge, refund, invoice, Google submission, or outbound customer email was sent. Agreement PS-2026-10-14.2 was not edited. This exercise did not apply a migration to DEV or Production.

The repository now records `20261021132018` as the applied DEV head and `20261014170000` as the Production head. `20261020210000` remains applied. This exercise did not re-read either live ledger.

## How to read a result

These four categories are separate. A database slice or a mocked screen is not a full-journey PASS.

| Category | Meaning |
| --- | --- |
| Composed case walk | One synthetic case moved through that step by existing commands in disposable PGlite. |
| Database slice | A focused SQL test of one rule. Some of those tests insert rows the product command does not write. |
| UI unit | A mocked component test. It does not sign in. |
| Signed-in browser | An Admin or customer session in a browser. |

- **PASS** — that category executed the rule and the product matched it.
- **FAIL** — that category executed the rule and the product disagreed, or the composed command path cannot finish the branch.
- **NOT TESTED** — this exercise did not run that scenario.

Signed-in browser is **NOT TESTED** for every scenario. This environment has no Admin OTP session and no DEV service credentials. Mocked component tests are UI unit coverage only.

## Composed case walks

| Step | A Guided recovery | B Managed qualifying | C Managed unsuccessful | D Reopen after the Guided close |
| --- | --- | --- | --- | --- |
| 1 Intake reviewed | PASS | PASS | PASS | NOT TESTED |
| 2 Customer and business screened | PASS | PASS | PASS | NOT TESTED |
| 3 Documents requested | PASS | PASS | PASS | NOT TESTED |
| 4 Evidence reviewed and accepted | PASS | PASS | PASS | NOT TESTED |
| 5 Assessment approved | PASS | PASS | PASS | NOT TESTED |
| 6 Quote accepted | PASS | PASS | PASS | NOT TESTED |
| 7 Activation / settlement or authority | PASS | PASS | PASS | NOT TESTED |
| 8 Preparation approved / entered | PASS | PASS — disposable chain enters `PREPARATION` with authority and no saved card | PASS — same transition on the unsuccessful case | NOT TESTED |
| 9 Submission recorded from ready stage | PASS | PASS — first submission is from `READY_TO_SUBMIT` | PASS — first submission is from `READY_TO_SUBMIT` | NOT TESTED |
| 10 Outcome and billing | PASS | PASS | PASS | PASS |
| 11 Closure | PASS | PASS | PASS | PASS |
| Managed `AUTHORIZATION_REQUIRED → PREPARATION` work-stage transition | NOT APPLICABLE | **FAIL** — `prerequisite`, despite `authorizationReady: true` | **FAIL** — `prerequisite`, despite `authorizationReady: true` | NOT TESTED |
| Signed-in browser, all steps | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

**Managed B and C are NOT accepted as complete stage-by-stage journeys.** Their pack, submission, outcome and closure commands execute, but the required Managed work-stage transition fails and both cases proceed from an earlier stage. A successful standalone RPC is not proof of the authorised sequence. D is the same Guided case after its successful close. The walk reopens it, records `NOT_RESTORED`, and closes again. It does not start a new cancellation case from intake, so steps 1–9 are not a D walk.

### A — Guided successful profile recovery

`apps/admin/lib/case-journey/acceptance-walk.database.test.ts` walks one synthetic profile-recovery case:

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

`presentCaseJourney` then reports steps 1–10 `COMPLETED` and focuses step 11. After close, all eleven steps are `COMPLETED`.

### B — Managed qualifying success

`apps/admin/lib/case-journey/managed-acceptance-walk.database.test.ts` walks one synthetic Managed profile-recovery case on its own location. The same file’s second case is scenario C. They share a customer and a business. Manager access is stored per location, so the two cases do not share that record.

Membership and email verification have no RPC. Those two rows are inserted. The service agreement, the case-management permission, and Google manager access are command results. `authorizationReady` is read from `admin_case_authorization_readiness_v1`. It is not a fixture flag.

1. Intake `REVIEWED`.
2. Screening `PRELIMINARY_COMPLETE`.
3. The evidence request is drafted, reviewed, queued, and marked delivered by a local provider event. No `SEND_EMAIL` job succeeds.
4. The letter is accepted, made customer-visible, and the request is fulfilled.
5. The assessment is approved as Managed.
6. The customer accepts `MANAGED_RELAUNCH`. The order is `ACCEPTED_SUCCESS_FEE`. Obligations, invoices, and receipts are zero.
7. The customer accepts the service agreement and the case-management permission. Manager access is verified. Readiness reports the agreement, the permission, business authority, manager access, and `authorizationReady`. Step 7 is `COMPLETED` with no saved card and no payment consent. `managed_setup_ready_v1` stays false. On the disposable chain that includes the pending ADMIN-JOURNEY-E2E-02 migration, `transition` to `PREPARATION` succeeds. Live DEV has not received that migration, so this note does not say the live DEV function has changed.
8. The pack is approved and published while the stage is `PREPARATION`. Step 8 is `COMPLETED`. `READY_TO_SUBMIT` is refused until that pack exists, then the transition succeeds.
9. A submission from `AUTHORIZATION_REQUIRED` or `PREPARATION` is `denied`. The first submission is actor `ADMIN` from `READY_TO_SUBMIT`, then the stage is `SUBMITTED`. It is resolved `DECIDED`; no Google call occurs. Close while the attempt or authorisation follow-up is open returns `open_work`. A later submission from `FURTHER_REVIEW` is refused while the case permission or Google manager access is revoked. Restoring that authorisation records one `ADMIN` retry, and repeating the request does not add another row. The retry is resolved before outcome review.
10. `record_outcome` stores `RESTORED` and leaves the case open. `approve_success_fee` then creates one `DUE` `SUCCESS_FEE` obligation for £299.00. Close returns `prerequisite`. The hosted invoice is recorded `ISSUED` and close still returns `prerequisite`. The step headline is “Invoiced” and says an issued invoice is not payment. Step 10 stays incomplete. `payment_apply_provider_event_v1` type `invoice.paid` (test mode, no `livemode: true`) marks the obligation and the invoice `PAID`, writes one receipt, and writes ledger events `OBLIGATION_CREATED`, `INVOICE_ISSUED`, `PROVIDER_PAYMENT_SUCCEEDED`, and `RECEIPT_RECORDED`. A second `invoice.paid` is `duplicate: true` and does not add a receipt. The order stays `ACCEPTED_SUCCESS_FEE`. The headline is “Settled”. No Guard order is created.
11. `close` stores `CLOSED` / `FINISHED`. All eleven steps are `COMPLETED`.

The owning customer portal returns `CLOSED`, `outcomeCode: RESTORED`, and timeline codes including `QUOTE_ACCEPTED`, `PAYMENT_RECEIVED`, `SUBMITTED_TO_GOOGLE`, and `CASE_COMPLETED`. A second customer receives `{ found: false }`. Staff work events and the case and payment audits name the staff actor.

### C — Managed unsuccessful outcome

The second case repeats the same command sequence: authority without a saved card, `AUTHORIZATION_REQUIRED` → `PREPARATION` → `READY_TO_SUBMIT`, then an `ADMIN` submission. It does not skip those stages.

`record_outcome` stores `NOT_RESTORED` and leaves the case open. `approve_success_fee` returns `denied`. Obligations, invoices, and receipts stay zero. Step 10 is `COMPLETED` with headline “Not billable” before close. `close` stores `CLOSED` / `FINISHED` with that outcome and still creates no fee. All eleven steps are `COMPLETED` after close. No `PAYMENT_RECEIVED` timeline event is created.

The case row remains `NOT_RESTORED`. The disposable portal returns that code after closure. See the customer visibility section below. Signed-in browser acceptance is NOT TESTED.

### D — Reopen on the Guided case

After the successful Guided close, the same walk reopens the case, keeps the original intake and close events, refuses another `RESTORED` record at `FURTHER_REVIEW`, records `NOT_RESTORED` at `OUTCOME_REVIEW`, refuses a second record, and closes on that new outcome. The upfront receipt is still the settlement. The disposable portal then returns `outcomeCode: NOT_RESTORED`. Signed-in browser acceptance of that screen remains NOT TESTED.

Early withdrawal and a Managed cancellation from intake were not composed.

## Customer-facing unsuccessful outcome visibility — PASS on the disposable chain

DEV migration `20261020210000_admin_journey_e2e_04_customer_outcome_v1.sql` is applied to DEV only and is not applied to Production. Signed-in browser acceptance is NOT TESTED.

Both composed walks that store a closed `NOT_RESTORED` now show:

- `public.cases.outcome` is `NOT_RESTORED`.
- `customer_portal_case_v1` returns `status: CLOSED` and `outcomeCode: NOT_RESTORED`.
- The timeline code for the closed case is `CASE_COMPLETED`.
- The portal JSON does not contain the closure-summary sentence or the staff intake note.
- Admin `customerPreview.summary` does contain the summary. The staff intake note stays out of `customerPreview.notes`.

An open or reopened case still returns `outcomeCode: null`. The customer case workspace states that the profile was not restored. See `docs/admin/admin-journey-e2e-04.md`.

## Composed branches that do not finish

| Branch | Composed result | What the command did |
| --- | --- | --- |
| Managed work-stage progression into `PREPARATION` with completed authority and no saved card | PASS on the disposable chain | Walks B and C. `managed_setup_ready_v1` is false. Step 7 is `COMPLETED` and `transition` to `PREPARATION` succeeds. DEV now has independently applied `20261020120000`; signed-in browser acceptance remains untested. |
| Close while a qualifying success fee is `DUE` | PASS | Walk B. `close` returns `prerequisite`. The headline is “Approved fee”. Step 10 is not complete. |
| Close while that fee’s hosted invoice is `ISSUED` and unpaid | PASS | Walk B. `close` returns `prerequisite`. The headline is “Invoiced” and says this is not payment. |
| `approve_success_fee` after `NOT_RESTORED` | PASS | Walk C. Status `denied`. No obligation, invoice, or receipt. |
| `approve_success_fee` before any stored outcome | PASS on the disposable chain | Walks B and C. A missing outcome returns `denied`. No approval, obligation, invoice, or receipt is stored. DEV now denies that approval after independently applied `20261020150000`. Signed-in browser acceptance remains untested. |
| Close of a non-qualifying case that already has a non-void success fee | FAIL | No command can create that fee. `approve_success_fee` is denied for `NOT_RESTORED`. The walk does not insert an obligation. |
| Close of a non-qualifying case whose success fee is `VOID` | FAIL | No `public` or `admin_private` function updates `payment_obligations.state` to `VOID`. The walk does not insert a `VOID` row. |

The last two rows are blockers for a composed walk. They are not repaired by inserting the row in this test.

## Database slices

These PASS or FAIL on their own. None of them is the composed PASS in the table above.

| Rule | Slice result | Evidence |
| --- | --- | --- |
| Unpaid, failed, or unconfirmed Guided close | PASS | `apps/admin/lib/cases/close-billing.database.test.ts` |
| Missing receipt | PASS | `close-billing.database.test.ts` |
| Wrong customer, wrong order, second order, extra same-track order | PASS | `close-billing.database.test.ts` |
| Broken quote, acceptance, approval, amount, currency, or tax link | PASS | `close-billing.database.test.ts` |
| Inserted contradictory active success fee blocks a non-qualifying close | PASS as a slice | `close-billing.database.test.ts` inserts the obligation. Not walk C. |
| Inserted `VOID` success fee allows a non-qualifying close | PASS as a slice | `close-billing.database.test.ts` updates the row to `VOID`. Not walk C. |
| Qualifying Managed close after an inserted settled fee | PASS as a slice | `close-billing.database.test.ts`. Walk B now covers the same rule with commands. |
| Success fee is not created before approval of a qualifying outcome | PASS | `apps/admin/lib/payments/database.test.ts`. That file sets the outcome with SQL. Walk B uses `record_outcome`. |
| Hosted invoice and duplicate `invoice.paid` | PASS | `payments/database.test.ts`, and walk B. |
| Live-mode provider event is ignored | PASS | `payments/database.test.ts`. The walks send test-mode events only. |
| Incomplete Managed authority does not unlock `PREPARATION` | PASS | Walks B and C refuse `PREPARATION` with no agreement, with no permission, and with no manager access. `authorization/database.test.ts` still uses the early chain, which blocks `PREPARATION` unconditionally. |
| Assessment approval without ready evidence | PASS | `apps/admin/lib/case-journey/assessment.database.test.ts` |
| Invalid outcome evidence for a success fee | PASS | `payments/database.test.ts` |
| Early and outcome-review withdrawal | PASS as a slice | `close-billing.database.test.ts`. Not a composed cancellation walk. |
| Repeated outcome recording on the pre-`20261019235000` chain | PASS on that chain only | `apps/admin/lib/cases/record-outcome.database.test.ts` does not load `20261019235000`. |
| Billing headlines for approved, invoiced, void, and not billable | PASS as a pure test | `apps/admin/lib/case-journey/outcome.test.ts` feeds fixtures. Walks B and C read the same presenter from command rows. |
| Portal returns a coherent finished outcome | PASS as a database slice on the disposable chain | `apps/admin/lib/customer-portal/case-workspace.database.test.ts`. Open, reopened, wrong-type and inconsistent rows stay `outcomeCode: null`. Signed-in browser acceptance is NOT TESTED. |

## UI unit

| Check | Result | Evidence |
| --- | --- | --- |
| Both Admin close screens post `operation: "close"` and show a settlement refusal | PASS as mocked UI | `closure.ui.test.tsx` and `cockpit/close-billing.ui.test.tsx` |
| DEV preview gate | PASS as a unit test | `gate.test.ts` |
| Customer terminal outcome copy | PASS as a component test | `apps/customer/lib/portal/cases/workspace.test.ts`, `case-workspace.test.tsx` and `page.test.tsx`. These render the component. They are not a signed-in browser journey. |
| Signed-in journey | NOT TESTED | No browser session was opened. |

## Negative and security checks

| Check | Composed walk | Database slice |
| --- | --- | --- |
| Unpaid Guided close | PASS. Walk A denies close before settlement. | PASS. `close-billing.database.test.ts` |
| Missing receipt | PASS. Walk A stores one receipt. | PASS. `close-billing.database.test.ts` |
| Wrong customer | PASS. The other customer receives `{ found: false }` on A, B, and C. | PASS. `close-billing.database.test.ts` |
| Duplicate or extra order | Not run as a second order on these walks. | PASS. `close-billing.database.test.ts` |
| Broken commercial link | Not run on these walks. | PASS. `close-billing.database.test.ts` |
| Incorrect evidence | Not run on these walks. | PASS. Assessment and success-fee evidence slices above. |
| Incomplete authority | PASS. Walks B and C refuse `PREPARATION` until agreement, permission and manager access are all present, and refuse `READY_TO_SUBMIT` after a revoked permission or revoked manager access. | PASS. `authorization/database.test.ts` on the early chain. |
| Open task | PASS. Walks A, B, and C return `open_work`. | Covered by the same close command. |
| Unresolved submission | PASS. Walks A, B, and C return `open_work`. | Covered by the same close command. |
| Stale version | PASS. Walk A returns `conflict`. Walks B and C return `conflict` on the preparation transition. | PASS. `close-billing.database.test.ts` |
| Outcome that does not match the stored record | PASS. Walk A denies the mismatched close and a second record. | PASS. `close-billing.database.test.ts` |
| Unauthorised token | PASS. Walk A returns `unauthorized`. Walks B and C return `unauthorized` on the preparation transition. | PASS. `close-billing.database.test.ts` |
| Replay of the same close | PASS. Walk A keeps one close event for that request. | PASS. `close-billing.database.test.ts` |
| Direct table update and helper execute | PASS. Walk A: `anon` cannot update `public.cases`. `case_close_billing_ready_v1` is not executable by `anon`, `authenticated`, or `service_role`. | Same command privileges. |
| Duplicate success-fee settlement | PASS. Walk B keeps one obligation, one invoice, and one receipt. | PASS. `payments/database.test.ts` |
| Approved fee or issued invoice treated as settlement | PASS. Walk B. Close stays `prerequisite` for both. | Presenter fixtures in `outcome.test.ts` |

## Automated coverage added

- `apps/admin/lib/case-journey/acceptance-walk.database.test.ts` — Guided walk, reopen, and the close security checks.
- `apps/admin/lib/case-journey/managed-acceptance-walk.database.test.ts` — Managed qualifying settlement and Managed unsuccessful close.

The original walks did not change portal SQL. E2E-04 now does. It is applied to DEV only and is not applied to Production. See `docs/admin/admin-journey-e2e-04.md`.

## Unresolved blockers

1. **DEV migration integrated; signed-in behaviour still to be tested.** The disposable Managed walks pass `AUTHORIZATION_REQUIRED` → `PREPARATION` → `READY_TO_SUBMIT`, and reviewed migration `20261020120000_admin_journey_e2e_02_managed_stage_v1.sql` was applied to DEV only. Its functions and grants were verified; signed-in Admin and Customer browser acceptance remains pending.
2. Signed-in Admin and customer browser journeys for A, B, C, and D were not run. No DEV OTP or service credential was available here.
3. A composed close against a `VOID` success fee cannot be run. No function writes that state.
4. A composed close against an active success fee on a non-qualifying outcome cannot be run. The approval command refuses to create the fee.
5. DEV fix integrated: early `approve_success_fee` now fails closed with `denied` after DEV migration `20261020150000`; disposable walks confirm no financial rows. Signed-in browser acceptance remains pending. See `docs/admin/admin-journey-e2e-03.md`.
6. DEV migration integrated: a closed `NOT_RESTORED` outcome is returned after DEV migration `20261020210000`. Disposable walks and portal tests show the same result. Signed-in browser acceptance is NOT TESTED. See `docs/admin/admin-journey-e2e-04.md`.
7. `record-outcome.database.test.ts` still proves close on the pre-`20261019235000` chain. The current predicate is the full chain used by the walks and by `close-billing.database.test.ts`.
8. Production remains at `20261014170000`. Nothing in this exercise authorises a Production deploy, a live charge, a Google submission, or an outbound customer email.
