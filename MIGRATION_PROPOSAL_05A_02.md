# Migration proposal: Telloya Phase 05A-02 validation

**Status:** draft review only. Do not apply to DEV or Production.

The canonical SQL is the single versioned migration:

`supabase/migrations/20261103200518_telloya_enquiry_phase_05a_02_validation.sql`

The recovery manifest records that file as pending. `appliedToDev` is false. `appliedMigrationHead` stays `20261103140000_customer_commercial_offer_acceptance_v1.sql`. Do not apply `20261103200518` to DEV or Production.

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

Do not edit `20261102200000`. A later rollback migration, if one is approved, would `CREATE OR REPLACE` the function body from that applied migration. No rollback migration is included here, so applying this file is a one-way proposal until that separate file exists.

## Tests

The SQL script asserts ProfileRelaunch compatibility, legacy Telloya and `complete` payloads, blank `planTier`, all four current tiers, invalid enums and bounds, conditional requirements, privilege preservation, JSON persistence, `TY-YY-XXXXXX` references, retry idempotency, and conflict on a changed payload.
