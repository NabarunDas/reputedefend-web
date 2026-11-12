# ADMIN-TY preview handover

**Status:** preview implementation on `cursor/telloya-admin-e2e-preview-20261112`. This is not authorisation to launch, collect payment, send email, place a call, or apply a hosted migration.
**Baseline:** `origin/develop` `c3ba97a19492eb2b7ae27ec906f77e740ef12cae`. Plan branch `plans/telloya-admin-e2e-preview-20261112` at `a9d925204e39a9e590e5fe964a0314f0679f83cf`.

## Phase record

| Phase | Result | Commit | What landed |
| --- | --- | --- | --- |
| ADMIN-TY-00 | DONE | `c79d1a33` | Reuse matrix and dependency map. No behaviour change. |
| ADMIN-TY-01 | DONE | `60ea404f` | Telloya progress on the existing enquiry page. A missing plan says “Plan to be confirmed”. |
| ADMIN-TY-02 | DONE | `ef46f7cf` | Offline demo transitions and source-only `20261112120000_telloya_admin_journey_v1.sql`. Writes stay closed. |
| ADMIN-TY-03 | DONE | `717da3fd` | Offer composer. Growth plus two Guard locations is £98.98. Send stays closed without approved legal and tax terms. |
| ADMIN-TY-04 | DONE | `ffd2d1ef` | One idempotent proposal message and a separate amendment. The customer control is disabled. |
| ADMIN-TY-05 | DONE | `ead1c8c8` | Mocked monthly checkout. No Stripe API call. A return stays “Payment being verified”. |
| ADMIN-TY-06 | DONE | `912c4856` | Setup checklist. Going live stays blocked. |
| ADMIN-TY-07 | DONE | `7bcd1a04` | Plan and payment view. Cancellation is period-end only. Voice stays off. |
| ADMIN-TY-08 | DONE | `cf9880a2`, follow-up `6061c53f` | Synthetic journey test and this handover. |

## What was exercised

Local unit tests and one disposable PGlite migration test. The PGlite test books, completes, replays, and cancels a demonstration. It does not connect to hosted DEV or Production.

No Stripe request was made. No Retell request was made. No email was sent. No hosted SQL was applied. No Vercel environment variable was changed.

## Source-only migration

`supabase/migrations/20261112120000_telloya_admin_journey_v1.sql`

`appliedToDev` is false. `containsDataChange` is false. `safeToReplay` is false. The public demonstration function is executable by `service_role` only. The private tables have row level security and no policies. Do not apply `20261112120000` to DEV or Production.

`20261111130000_telloya_marketing_enquiry_retention_v1.sql` is recorded as applied once to DEV. The verified DEV ledger contains 119 entries and ends at `20261111130000`. The hosted `schema_migrations` statement is 10,710 characters and the repository file is 10,712 characters. The two-byte difference is the dollar sign and closing quote at the end of the reason check, around character 1075. The installed `telloya_marketing_enquiry_holds_reason_check` is correct. Do not edit or replay the applied SQL. Do not apply `20261111130000` to Production.

## Flags

`TELLOYA_ADMIN_JOURNEY_ENABLED` is absent. Exactly `true` would still not approve a service agreement, a tax treatment, a payment, or live answering, because the hosted migration is not applied and the voice gates are unverified.

`TELLOYA_ENQUIRY_ENABLED`, `TELLOYA_USAGE_EVENTS_ENABLED`, and `TELLOYA_INBOUND_ADMISSION_ENABLED` were not enabled.

## Remaining approval

- Owner and legal approval of the paid Telloya Service Agreement.
- Tax treatment for a recurring GBP subscription. International tax stays unsupported.
- `20261111130000` is recorded as applied. The two-byte statement difference is documented and the applied SQL is not edited.
- Explicit approval before applying `20261112120000`.
- Stripe test-mode configuration, if a later owner wants a hosted Checkout session. This branch did not create a Stripe product, price, customer, or session.
- Retell, number purchase, forwarding, and a real test call remain outside this work.
- Production was not changed.

PR #457 and `20261107130000` were not edited.
