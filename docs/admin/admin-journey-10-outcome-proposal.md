# Record a case outcome without closing the case

Status: the reviewable migration is `supabase/migrations/20261019183000_admin_journey_10b_record_outcome_v1.sql`. It was applied to DEV (`rmzozuiamjcclvtgutgd`) only, at canonical ledger version `20261019183000`, after independent review. It is not applied to Production (`cxwwekdzkkjjbiyofrov`). Do not replay it.

`docs/admin/proposed-admin-journey-10-outcome.sql` is the earlier proposal. It stays outside `supabase/migrations`. The migration is that function plus one stricter close rule: when an outcome is already stored, close refuses a different `closure_summary` as well as a different outcome.

## What the command does

`record_outcome` accepts the same outcome vocabulary `close` already accepts. It requires a summary of 10 to 2000 characters. `WITHDRAWN` is allowed from an open stage. Every other outcome requires `OUTCOME_REVIEW`. It refuses a finished stage, a closed or cancelled case, and an outcome that is already stored.

It sets `cases.outcome` and `cases.closure_summary` only. Status, `work_stage` and `closed_at` stay as they are. It does not approve a success fee, create an invoice, collect a payment, or close the case.

`close` is unchanged when no outcome is stored. If an outcome is stored, the close payload must repeat that outcome and its summary exactly. Reopen clears both, and that is the correction path. Staff session, request fingerprint, `workflow_version`, the open-task and unresolved-submission checks, `case_work_events` and `admin_private.write_record_audit_v1` stay as they are.

`approve_success_fee` is unchanged. A qualifying stored outcome can satisfy its existing check before closure. Approval still does not charge a card, and Step 10 does not call it automatically.

## Reader

`readStoredOutcome` looks at the stored row and, when the case was reopened, at the loaded case-detail work events. A coherent closed record remains authoritative. An unreopened open case is accepted when the row has the shape `record_outcome` writes. A reopened open case is accepted only when a `record_outcome` event matches the stored outcome and summary exactly, has `closesCase` false, and its numeric event id is greater than every loaded `reopen`. Event ids are compared as integers, so `"10"` is after `"9"`.

Missing events, a mismatched summary, `closesCase` other than false, a `record_outcome` that is not after the latest reopen, and a full page of 51 events with no reopen while the case is marked reopened all fail closed. A page of 51 events can hide an older reopen. It cannot hide a later one, so a matching `record_outcome` inside that page is accepted when no later reopen is loaded. A buried event that the 51-row page does not show is not proof. A finished stage on an open case, a missing summary, the wrong outcome for the case type, and a closed status that does not match the outcome still fail closed. Closure and the success-fee gates are unchanged.

The journey offers the record form only while Step 10 is open, the billing records agree, and no outcome is stored. `assessProposedOutcomeRecord` and `assessProposedClose` describe the writer and are not called from the page.

## DEV ledger

DEV-HISTORY-01 recorded the seven statements already in the DEV ledger after `20261015230000`. They stay in `supabase/migrations`, marked `appliedToDev`, and their bytes are unchanged. The observed DEV applied head is `20261019163645 admin_journey_05_assessment_dev_v1`. Provenance is in `docs/admin/dev-history-01.md`.

`20261019183000_admin_journey_10b_record_outcome_v1.sql` is now applied to DEV only; the repository has no pending DEV migrations. It is not applied to Production. Do not replay the seven historical statements. Production `cxwwekdzkkjjbiyofrov` and AWS `ApprovedMigrationHead` stay at `20261014170000`.
