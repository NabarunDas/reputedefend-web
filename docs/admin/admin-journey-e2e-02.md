# ADMIN-JOURNEY-E2E-02 — Managed stage readiness

Status: proposed. `supabase/migrations/20261020120000_admin_journey_e2e_02_managed_stage_v1.sql` is in the repository with `appliedToDev: false`. It is not applied to DEV (`rmzozuiamjcclvtgutgd`) or Production (`cxwwekdzkkjjbiyofrov`). Do not apply it from the pull request. Do not replay `20261019235000` or any earlier applied migration.

The observed DEV applied head stays `20261019235000`. Production and AWS ApprovedMigrationHead stay `20261014170000`.

## What changes

`admin_private.case_stage_ready_v1` no longer calls `managed_setup_ready_v1` for a Managed case.

- Managed `PREPARATION` is ready only when `case_authorization_readiness_v1` reports `authorizationReady`.
- Managed `READY_TO_SUBMIT` needs that same flag and a current published pack.
- Guided `PREPARATION` and `READY_TO_SUBMIT` still use `guided_payment_ready_v1`, and ready-to-submit still requires the published pack.
- `managed_setup_ready_v1` is unchanged. It still describes a usable saved card and linked consent for Stripe setup. A Managed stage transition does not require either.

`public.admin_case_command_v1` is replaced so a new Managed submission cannot start from an earlier stage.

- A first Managed submission is allowed only at `READY_TO_SUBMIT`, and only while that stage is still ready. If readiness no longer holds, the status is `prerequisite`.
- Any other Managed stage, including `AUTHORIZATION_REQUIRED`, `PREPARATION`, and `FURTHER_REVIEW` with no existing submission, returns `denied`.
- A later Managed submission from `FURTHER_REVIEW` is allowed only when a submission already exists and `authorizationReady` is still true. Revoked case-management permission or revoked Google manager access returns `prerequisite` and writes no submission. Restoring that authorisation permits one retry. A withdrawal that is reopened with no submission must still go `FURTHER_REVIEW` → `PREPARATION` → `READY_TO_SUBMIT`.
- Guided submissions keep the previous stage list and the `invalid` status.
- The `close` branch is the Step 12A predicate, unchanged.

`case_transitions` is not rewritten. The case-flow projection can still recommend a saved-card step. The database command is the stage rule. That projection disagreement is left for ADMIN-JOURNEY-07.

## Disposable proof

`apps/admin/lib/case-journey/managed-acceptance-walk.database.test.ts` loads the full chain, including this pending file, in PGlite. Both Managed cases use commands for the stage changes. Neither inserts a saved card, a consent, a success-fee approval, an obligation, an invoice, a receipt, or a `VOID` row.

Each walk shows:

- `PREPARATION` is `prerequisite` with no agreement, with an agreement but no permission, and with a permission but no verified manager access. Step 7 is not `COMPLETED` on those same records.
- After agreement, permission, and verified manager access, Step 7 is `COMPLETED`, `authorizationReady` is true, saved methods and consents are zero, and `managed_setup_ready_v1` is false. `PREPARATION` then succeeds.
- A stale version is `conflict`. A bad token is `unauthorized`. Repeating the same preparation request stores one transition.
- Submission from `SERVICE_SELECTION`, `AUTHORIZATION_REQUIRED`, and `PREPARATION` is `denied`.
- `READY_TO_SUBMIT` is `prerequisite` before the pack is published, and again after manager access or the case permission is revoked. Step 7 leaves `COMPLETED` on those revoked records and returns when the command restores them.
- The first submission is actor `ADMIN` from `READY_TO_SUBMIT`. The stage becomes `SUBMITTED`. Step 9 is complete only after the attempt is resolved.
- After the first submission is resolved, a retry from `FURTHER_REVIEW` is `prerequisite` while the case permission is revoked, and again while manager access is revoked. Each refusal leaves the submission count at one. Restoring the permission and verified manager access records one `ADMIN` retry. Repeating that request does not add another row. The retry is resolved before outcome review.
- A separate withdrawn case, reopened at `FURTHER_REVIEW` with no submission, is denied a submission and refused `PREPARATION` without authorisation.

Qualifying settlement and the unsuccessful close are unchanged. Guided payment rules are unchanged.

## Not in this change

- `approve_success_fee` before a stored outcome still raises `null value in column "outcome"` instead of `denied`.
- The customer portal still maps `NOT_RESTORED` to `outcomeCode: null`.
- No command writes `payment_obligations.state = 'VOID'`.
- No signed-in browser journey was run.
- Live payments, outbound email, and Google submission stay off.
