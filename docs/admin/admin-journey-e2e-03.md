# ADMIN-JOURNEY-E2E-03 — success-fee outcome guard

Status: independently reviewed and applied to DEV (`rmzozuiamjcclvtgutgd`) on 2026-10-20 as canonical version `20261020150000`, after exact source-to-ledger SQL and ACL verification. `appliedToDev: true`. Not applied to Production (`cxwwekdzkkjjbiyofrov`). Do not replay.

Verified DEV applied head is `20261020150000`. Production and AWS ApprovedMigrationHead stay `20261014170000`. DEV now denies an early `approve_success_fee` without a not-null SQL exception.

## What changes

`admin_private.admin_payment_command_core_v1` denies `approve_success_fee` when `qualifying_success_outcome_v1` is not true.

`qualifying_success_outcome_v1` returns null when `cases.outcome` is null. `IF NOT null` does not enter the denial, and the later insert then fails the `success_fee_approvals.outcome` not-null constraint. `IS NOT TRUE` fails closed for both null and false, so the command returns `denied` and writes nothing.

The helper itself is unchanged. Accepted-quote checks, accepted evidence, staff reauthentication, optimistic versions, command-receipt idempotency, the success-fee amount, the ledger entry, Guided payment rules, Managed stage rules, close billing, and Guard billing are unchanged.

## Disposable proof

Both Managed walks on the full chain call the real command:

- Before `record_outcome`, approval returns `denied`. Repeating the same request returns `denied`. No approval, obligation, invoice, payment receipt, or command receipt is stored.
- After `NOT_RESTORED`, approval returns `denied` and still stores none of those rows. Closure completes without a success fee.
- After `RESTORED`, a bad token is `unauthorized`, a stale version is `conflict`, and an evidence version that is not the accepted file is `denied`. Each refusal stores nothing.
- One qualifying approval creates one `DUE` `SUCCESS_FEE` obligation of 29900 and no payment receipt. The same request returns the stored success. A later request returns `replay: true` and does not add a second obligation or receipt.
- Test-mode `invoice.paid` settlement and close stay as they were.

## Not in this change

- A closed `NOT_RESTORED` outcome is shown by pending `20261020210000`. That migration is not applied to DEV or Production. See `docs/admin/admin-journey-e2e-04.md`.
- No command writes `payment_obligations.state = 'VOID'`.
- No signed-in browser journey was run.
- Live payments, outbound email, and Google submission stay off.
- Guard billing and agreement PS-2026-10-14.2 are unchanged.
