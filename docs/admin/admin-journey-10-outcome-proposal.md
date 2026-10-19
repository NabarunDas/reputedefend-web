# Proposal — record a case outcome without closing the case

Status: not applied. This is not a migration and it is not wired to `admin_case_command_v1`. Do not apply it to DEV or Production from this pull request.

## Why it is separate

`public.admin_case_command_v1` operation `close` is the only writer of `cases.outcome`. The same statement sets `status` to `CLOSED` or `CANCELLED`, `work_stage` to `FINISHED`, and `closed_at`. `reopen` clears the outcome. `approve_success_fee` then requires `admin_private.qualifying_success_outcome_v1`, which reads that column.

Step 10 must not call `close`. Without a pre-closure outcome, a qualifying success fee cannot be approved, and Step 10 cannot be completed, until the case has already been closed from the case cockpit. That is the current behaviour. This proposal is the smallest later change that would let Step 10 finish before Step 11.

## Proposed command

Add operation `record_outcome` to the existing case command. It would:

- accept the same outcome vocabulary `close` already accepts
- require a summary of 10 to 2000 characters
- allow `WITHDRAWN` from an open stage, and every other outcome only from `OUTCOME_REVIEW`
- refuse a closed or cancelled case, and refuse to replace an outcome that is already stored
- set `cases.outcome` and `cases.closure_summary` only
- leave `status`, `work_stage` and `closed_at` unchanged

`close` stays the closure command. It would still close the case. A later review of that command can refuse a close whose outcome differs from one already recorded. This proposal does not change `close`.

`approve_success_fee` stays as it is. Once an outcome is recorded, its existing qualifying check can succeed before closure. Approval would still not charge a card.

## Tests

`apps/admin/lib/case-journey/outcome-proposal.ts` documents the checks above. `assessProposedOutcomeRecord` returns `closesCase: false` and `changesStage: false` on the only success path, and refuses an outcome, stage, summary, existing outcome or closed case that `close` would not accept. The function is not called from the journey page or the case command.

No SQL file is added under `supabase/migrations`.
