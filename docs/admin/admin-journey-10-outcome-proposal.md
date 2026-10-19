# Proposal — record a case outcome without closing the case

Status: not applied. This is not a migration and it is not wired to `admin_case_command_v1`. Do not apply it to DEV or Production from this pull request. The executable text is `docs/admin/proposed-admin-journey-10-outcome.sql`. That file stays outside `supabase/migrations`.

## Why it is separate

`public.admin_case_command_v1` operation `close` is the only writer of `cases.outcome`. The same statement sets `status` to `CLOSED` or `CANCELLED`, `work_stage` to `FINISHED`, and `closed_at`. `reopen` clears the outcome. `approve_success_fee` then requires `admin_private.qualifying_success_outcome_v1`, which reads that column.

Step 10 must not call `close`. Without a pre-closure outcome, a qualifying success fee cannot be approved, and Step 10 cannot be completed from an open case, until the case has already been closed from the case cockpit. That is still the live behaviour. This proposal is the smallest later change that would let Step 10 finish before Step 11.

## Current reader and future command

These are different.

The journey reader, `readStoredOutcome`, only looks at the row that is already stored. A coherent closed record remains authoritative: `CLOSED` with a non-withdrawal outcome at `FINISHED`, or `CANCELLED` with `WITHDRAWN` at `FINISHED`. An open case is also accepted when the row already has the shape `record_outcome` would write: an allowed outcome, a summary of 10 to 2000 characters, `OUTCOME_REVIEW` for every outcome except `WITHDRAWN`, and any other open stage for `WITHDRAWN`. A reopened case, a finished stage on an open case, a missing summary, the wrong outcome for the case type, and a closed status that does not match the outcome still fail closed.

That reader does not record an outcome. The journey does not render a record control, and `assessProposedOutcomeRecord` is not called from the page. Saying the stored shape is recognisable is not a claim that the command exists today.

`assessProposedOutcomeRecord` describes the future write. It returns `closesCase: false` and `changesStage: false`, and it refuses a short summary, an outcome the case type does not allow, a closed case, an outcome that is already stored, and a stage `close` would not accept. `WITHDRAWN` from `FINISHED` is refused because that stage belongs to a closed case.

## Proposed command

`docs/admin/proposed-admin-journey-10-outcome.sql` is a replacement for `public.admin_case_command_v1` with two changes:

- operation `record_outcome` accepts the same outcome vocabulary `close` already accepts, requires a summary of 10 to 2000 characters, allows `WITHDRAWN` from an open stage, and allows every other outcome only from `OUTCOME_REVIEW`
- it refuses a finished stage, a closed or cancelled case, and an outcome that is already stored
- it sets `cases.outcome` and `cases.closure_summary` only, and leaves `status`, `work_stage` and `closed_at` unchanged
- `close` refuses when `cases.outcome` is already set to a different value. The same outcome may still close the case. Staff session, request fingerprint, `workflow_version`, the open-task and unresolved-submission checks, the outcome vocabulary, `case_work_events` and `admin_private.write_record_audit_v1` stay as they are. The existing workflow-version trigger still bumps the version on update

`approve_success_fee` stays as it is. Once an outcome is recorded, its existing qualifying check can succeed before closure. Approval would still not charge a card.

## Tests

`apps/admin/lib/case-journey/outcome-proposal.ts` holds the future checks and the current reader. The future functions are not called from the journey page or the case command. `outcome.test.ts` covers a legitimate open outcome, a forged stage, a reopened case, a contradictory closed record, and the fact that Step 11 stays incomplete while the case is open.

No SQL file is added under `supabase/migrations`.
