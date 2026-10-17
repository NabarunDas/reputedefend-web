# MKT-UX-11 legacy country match

Reviewed intake function: `public.create_case_intake_v1` in `supabase/migrations/20260915193000_case_intake_transaction_v1.sql`.

## Finding

The Get Help form stores United Kingdom as `GB`. The applied intake function matches an existing business and location with `public._intake_norm_text`. That function trims, lowercases, and collapses spaces. It does not know country aliases.

`UK`, `uk`, and `United Kingdom` therefore do not equal `GB`. A later submission from the same customer, for the same business, creates a second business and a second location. This happens both when the Google Business Profile URL is absent and when the new submission repeats the stored URL. The URL match runs only inside the business chosen by the country comparison, so the existing URL is not reused.

`public._intake_norm_text('UK')` is `uk`. `public._intake_norm_text('GB')` is `gb`. A repeated `submission_key` still returns the case already created and does not insert another case. Historical country text is left unchanged.

## Smallest correction

Add `public._intake_country_key(text)` and use it only for the four location-country comparisons in `create_case_intake_v1`. The key maps normalised `gb`, `uk`, `u.k.`, `u.k`, `united kingdom`, `great britain`, and `britain` to `gb`. Every other value stays on `_intake_norm_text`.

Do not replace `_intake_norm_text`. Business names, websites, and profile URLs keep their current comparisons. Do not update stored `locations.country` values.

The corrected function still refuses a merge when any of these are true:

- the business names differ
- the countries do not share a key, including `US` and `Ukraine` against `GB`
- the business belongs to a different customer
- more than one location on that business shares the country key
- a supplied profile URL differs from the stored profile URL
- both website URLs are present and differ

One exact business match reuses that business. One exact location match reuses that location. The stored country text stays `UK`, `uk`, or `United Kingdom`.

## DEV deployment and separate Production release

`docs/customer/proposed-intake-country-key-v1.sql` remains the reviewed source and is intentionally outside the shared `supabase/migrations` chain. It was **applied to DEV only** on 17 October 2026 as tracked Supabase migration `20261017113702_get_help_legacy_country_match_dev_v1`. Production remains unchanged.

DEV deployment was explicitly approved and completed in Supabase project `profilerelaunch-dev` (`rmzozuiamjcclvtgutgd`) after head `20261017111446`. The new head is `20261017113702`. Checked after install: UK/United Kingdom/GB resolve to `gb`, US remains `us`, intake RPC retains `service_role` execute and the helper is unavailable to anon/authenticated. No historical business or location rows were rewritten.

**Production remains pending:** Production Supabase is in a separate organisation not accessible to the current connector. Confirm its migration head and exact intake function body before applying this source to Production; require the same four-comparison-only change. Apply the DB compatibility patch before releasing the new Get Help form on `main`. Do not merge unrelated DEV Admin changes into Production, and do not copy the DEV-only migration history into Production.

`CREATE OR REPLACE` preserves the existing `service_role` execute grant on `create_case_intake_v1`. The new key is revoked from `PUBLIC`, `anon`, and `authenticated`, and is not granted to `service_role`. The intake function is `SECURITY DEFINER`, so it can call the key.

## Regression tests

`lib/cases/intake-country.database.test.ts` loads the core and intake migrations in local PGlite. Every data change runs inside `BEGIN` / `ROLLBACK`. The proposal is executed only inside those rolled-back transactions.

The test covers the unfixed duplicate for a missing URL and a matching URL, unchanged submission-key idempotency, reuse after the proposal for `UK`, `uk`, `United Kingdom`, and `GB`, and the non-merge safeguards above. It also checks that the rollback removes the proposal and that no file under `supabase/migrations` defines `_intake_country_key`.
