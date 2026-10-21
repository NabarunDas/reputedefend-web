# ADMIN-JOURNEY-E2E-04 — customer terminal outcome

Status: independently reviewed and applied to DEV (`rmzozuiamjcclvtgutgd`) on 2026-10-20 as canonical version `20261020210000`, after exact source-to-ledger SQL and privilege verification. Generated ledger version `20261020122920` was aligned to canonical. `appliedToDev: true`. Not applied to Production (`cxwwekdzkkjjbiyofrov`). Do not replay this file or any earlier applied migration.

E2E-04 remains applied to DEV. The later DEV applied head is `20261021214813`. `pendingMigrations()` is empty. `20261021155147` remains applied and must not be replayed. Production and AWS ApprovedMigrationHead stay `20261014170000`. Live DEV returns the finished terminal `outcomeCode`. The disposable evidence below is unchanged, and signed-in browser acceptance remains NOT TESTED.

## What changes

`public.customer_portal_case_v1` is replaced. It still returns one owned case, or `{found:false}`, and an invalid session still returns null. `outcomeCode` is set only when all of these hold:

- `closed_at` is present.
- `work_stage` is `FINISHED`.
- The status and outcome agree: `CLOSED` with `RESTORED`, `PARTIALLY_RESTORED` or `NOT_RESTORED` for `PROFILE_RECOVERY`; `CLOSED` with `REMOVED`, `NOT_REMOVED` or `RESPONSE_RECOMMENDED` for `REVIEW_PROTECTION`; `CANCELLED` with `WITHDRAWN` for either case type.

An open case, a reopened case, a wrong case type, a malformed outcome, and a terminal status that does not match the outcome all return `outcomeCode: null`. The closure summary and staff notes are not in the payload. No column, table, or Admin command is added. EXECUTE stays limited to `service_role`.

## Customer copy

The case workspace uses these headings only after that terminal payload. The timeline sentence matches the same result. Copy does not promise further work, a fee, a refund, or a Google action.

| Case type | Outcome | Status | Heading | Timeline |
| --- | --- | --- | --- | --- |
| `PROFILE_RECOVERY` | `RESTORED` | `CLOSED` | Your profile was restored | Your profile was restored and the case was completed. |
| `PROFILE_RECOVERY` | `PARTIALLY_RESTORED` | `CLOSED` | Your profile was partly restored | Your profile was partly restored. The profile was not fully restored, and the case was completed. |
| `PROFILE_RECOVERY` | `NOT_RESTORED` | `CLOSED` | Your profile was not restored | Your profile was not restored and the case was completed. |
| `REVIEW_PROTECTION` | `REMOVED` | `CLOSED` | The review was removed | The review was removed and the case was completed. |
| `REVIEW_PROTECTION` | `NOT_REMOVED` | `CLOSED` | The review was not removed | The review was not removed and the case was completed. |
| `REVIEW_PROTECTION` | `RESPONSE_RECOMMENDED` | `CLOSED` | A response was recommended | A response was recommended. The review was not removed, and the case was completed. |
| Either | `WITHDRAWN` | `CANCELLED` | This case was withdrawn | This case was withdrawn and is now closed. This closure does not report a restoration or removal result. |

Partial restoration says the profile was not fully restored. A recommended response says the review was not removed. Withdrawal says the case is closed and that this closure does not report a restoration or removal result. It does not say whether Google recorded an earlier decision.

The customer parser applies the same rule. A non-null `outcomeCode` is accepted only when `workStage` is `FINISHED`, `closedAt` is present, and the status matches that outcome. Any other non-null outcome rejects the whole payload. A null outcome still parses, including an inconsistent legacy row, and does not invent a result.

## Evidence classes

| Class | Result |
| --- | --- |
| Disposable database | PASS for the eight outcomes, open recording, reopening, wrong type, inconsistent terminal rows, invalid token, and the other customer's reference. |
| Component and route unit | PASS for the headings and timeline sentences. These tests render the component. They do not sign in. |
| Composed Admin walks | PASS on the disposable chain for closed `RESTORED` and closed `NOT_RESTORED`. |
| Signed-in browser | NOT TESTED. |

## Not in this change

- Success-fee approval, invoices, payment amounts, and Guard billing.
- Case-management commands, Google submission, and outbound email.
- Agreement PS-2026-10-14.2.
- A command that writes `payment_obligations.state = 'VOID'`.
