# Migration proposal: Telloya Phase 05A-02 validation

**Status:** applied once to `profilerelaunch-dev`. Do not replay it. Do not apply it to Production.

The canonical SQL is the single versioned migration:

`supabase/migrations/20261103200518_telloya_enquiry_phase_05a_02_validation.sql`

The verified DEV ledger contains 100 entries and ends at `20261103200518`. The canonical version is recorded once. The applied SQL MD5 is `ce8975868e0727760bb283a99b2f5dc9`. The repository file is 10,317 characters and its SHA-256 is `d2b402acd545a05b251cffb61c0a0a4b8028cb220ead5525ff122cbf97cfb0ab`. The recovery manifest records `appliedToDev: true`. `appliedMigrationHead` is this file. Production remains at `20261014170000`. Telloya feature flags remain false.

Executable assertions live outside the migration directory:

`supabase/tests/database/telloya-enquiry-phase-05a-02.validation.sql`

They run through `supabase/tests/database/telloya-enquiry-phase-05a-02.database.test.ts` on a disposable PGlite database. A failed assertion raises an exception and fails the test process.

This document does not contain a second copy of the SQL.

## What the migration changes

`CREATE OR REPLACE` of `admin_private.valid_enquiry_v1(jsonb, boolean)` only.

Unchanged:

- Function signature, `IMMUTABLE`, and `search_path=''`
- Grants from `20260917185905` (no new `GRANT` or `REVOKE`)
- `public.create_general_enquiry_v1`
- Applied migration `20261102200000_telloya_enquiry_infrastructure_v1.sql`
- The ProfileRelaunch branch, copied from that applied function

## Telloya contract

Original Telloya keys stay required, including `product` of `telloya` or `complete`. A blank or missing product is rejected even when `planTier` is present.

`planTier` may be absent or `""` on a historical product-only payload. A non-blank value must be `basic`, `growth`, `pro`, or `custom`.

Optional fields are validated whenever they are supplied, including when the related add-on is not selected:

| Field | Rule |
| --- | --- |
| `guardLocationCount` | Integer 1–999. Required when `guardInterested` is true. |
| `customMonthlyMinutes` | Integer 1–1,000,000. Required when `planTier` is `custom`. |
| `customMonthlyCalls` | Integer 1–100,000 when supplied. Optional for Custom. |
| `customPhoneNumbers` | Integer 1–999. Required when `planTier` is `custom`. |
| `customLocations` | Integer 1–9,999. Required when `planTier` is `custom`. |
| `overageMonthlyCapGbp` | Number £1–£100,000. Required when `overageInterested` is true. |
| `customLanguages` | String, maximum 500 characters |
| `customRequirements` | String, maximum 2,000 characters |
| `additionalLanguages` | String, maximum 500 characters |
| `voiceAccent` / `primaryLanguage` | String, maximum 100 characters |
| `voicePreference` | `female`, `male`, `no-preference`, or blank |
| `speakingStyle` | `friendly`, `professional`, `calm`, `no-preference`, or blank |
| `details` | 1–5,000 characters |
| Whole payload | At most 32,768 bytes |

## Rollback

Do not edit `20261102200000` or this applied file. Do not replay `20261103200518`. A later rollback migration, if one is approved, would `CREATE OR REPLACE` the function body from `20261102200000`. No rollback migration is included here.

## Tests

The SQL script asserts ProfileRelaunch compatibility, legacy Telloya and `complete` payloads, blank `planTier`, all four current tiers, invalid enums and bounds, conditional requirements, privilege preservation, JSON persistence, `TY-YY-XXXXXX` references, retry idempotency, and conflict on a changed payload.
