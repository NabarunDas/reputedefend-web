# ADMIN-JOURNEY-E2E-04 — customer terminal outcome

Status: proposed. `supabase/migrations/20261020210000_admin_journey_e2e_04_customer_outcome_v1.sql` is in the repository with `appliedToDev: false`. It is not applied to DEV (`rmzozuiamjcclvtgutgd`) or Production (`cxwwekdzkkjjbiyofrov`). Do not apply it from the pull request. Do not replay `20261020150000` or any earlier applied migration.

The verified DEV applied head stays `20261020150000`. Production and AWS ApprovedMigrationHead stay `20261014170000`. Until independent review applies this file, live DEV still returns `outcomeCode: null` for a closed `NOT_RESTORED` case.

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
| Either | `WITHDRAWN` | `CANCELLED` | This case was withdrawn | This case was withdrawn. No Google result is recorded. |

Partial restoration says the profile was not fully restored. A recommended response says the review was not removed. Withdrawal says no Google result is recorded.

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
