# Record a case outcome without closing the case

Status: the reviewable migration is `supabase/migrations/20261019183000_admin_journey_10b_record_outcome_v1.sql`. It is not applied to DEV (`rmzozuiamjcclvtgutgd`) or Production (`cxwwekdzkkjjbiyofrov`). Do not apply it from the pull request.

`docs/admin/proposed-admin-journey-10-outcome.sql` is the earlier proposal. It stays outside `supabase/migrations`. The migration is that function plus one stricter close rule: when an outcome is already stored, close refuses a different `closure_summary` as well as a different outcome.

## What the command does

`record_outcome` accepts the same outcome vocabulary `close` already accepts. It requires a summary of 10 to 2000 characters. `WITHDRAWN` is allowed from an open stage. Every other outcome requires `OUTCOME_REVIEW`. It refuses a finished stage, a closed or cancelled case, and an outcome that is already stored.

It sets `cases.outcome` and `cases.closure_summary` only. Status, `work_stage` and `closed_at` stay as they are. It does not approve a success fee, create an invoice, collect a payment, or close the case.

`close` is unchanged when no outcome is stored. If an outcome is stored, the close payload must repeat that outcome and its summary exactly. Reopen clears both, and that is the correction path. Staff session, request fingerprint, `workflow_version`, the open-task and unresolved-submission checks, `case_work_events` and `admin_private.write_record_audit_v1` stay as they are.

`approve_success_fee` is unchanged. A qualifying stored outcome can satisfy its existing check before closure. Approval still does not charge a card, and Step 10 does not call it automatically.

## Reader

`readStoredOutcome` only looks at the stored row. A coherent closed record remains authoritative. An open case is also accepted when the row has the shape `record_outcome` writes. A reopened case, a finished stage on an open case, a missing summary, the wrong outcome for the case type, and a closed status that does not match the outcome still fail closed.

The journey offers the record form only while Step 10 is open, the billing records agree, and no outcome is stored. `assessProposedOutcomeRecord` and `assessProposedClose` describe the same checks and are not called from the page.
