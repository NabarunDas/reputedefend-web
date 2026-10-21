# ADMIN-JOURNEY-06 — Guided quote and contract acceptance

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`: `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=develop`, and `SUPABASE_URL` exactly the DEV project `https://rmzozuiamjcclvtgutgd.supabase.co`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check. Case permissions on the quote command are unchanged.

This step does not take a payment, activate a service, send email, or submit anything to Google. Those remain later steps. No new quote API is added. No migration is added for this step.

## What this reuses

- `summariseCommercial` and `commercialQuotesTied` for the quote list
- `quoteServiceForCase` and `currentApprovedPrice` for the service and the price
- `CaseQuoteForm`, `SetDraftTaxForm`, `QuoteActionForm`, `OfferQuoteActionForm` and `RevokeQuoteActionForm`
- `quoteCommand` posting to `/api/operations/quotes`, which calls `admin_quote_command_v1`
- The existing offer trigger `quote_versions_commercial_eligibility` and `evaluate_commercial_eligibility_v1`

The commercial workspace still uses the same draft, tax, offer and acceptance commands. Its buttons still follow the case-flow primary action. Step 6 has its own panel so a quote can be drafted from an approved recommendation while `service_track` is still `UNDECIDED`. `create_draft` does not write `service_track`.

## Scope and exclusions

Standard wording for the five existing service codes lives in `lib/commercial/scope-templates.ts`, version `SCOPE-2026-10-21.2`. Each service has its own scope and exclusions. The default comes from the published prices, the website service descriptions, and paid-service agreement PS-2026-10-14.2. Guided means ProfileRelaunch prepares the work and the customer submits it. Managed means ProfileRelaunch carries out authorised permitted work, subject to the applicable success-fee terms. The Managed success definition and payment-timing sentences stay the existing database functions. The template repeats them. It does not replace them.

The prices in the template are the final customer prices: Guided Relaunch £99 upfront, Managed Relaunch £299 only after the contractually defined and verified restoration with no upfront service fee, Guided Review £59 upfront, Managed Review £149 on verified removal with no upfront service fee, and Relaunch Guard £9.99 per month per location. No tax is added on top. The wording uses the agreement's statement that ProfileRelaunch is not registered for VAT and does not add VAT. It does not describe the price as a VAT charge.

The Create draft quote form fills Scope and Exclusions from the selected service. Admin does not need to write the standard wording. Admin can edit one quote for the case. Restore standard wording puts the current approved template back into the form and does not call the quote command. A saved quote keeps the exact `scope_text` and `exclusions_text` that were submitted, including the template version line when that wording used one. Changing the template later does not rewrite an existing quote or an accepted agreement. No new table or column is added.

The Step 6 preview shows that stored scope, those exclusions and the template version recorded on them before the offer control.

## Gross price and tax proposal

This step does not change the catalogue, the tax eligibility gate, Stripe, or Production, and it does not add a migration.

The seeded catalogue tax behaviour remains `UNCONFIRMED`. `UNCONFIRMED` still blocks an offer and an acceptance. The purchasing-establishment and country checks in `evaluate_commercial_eligibility_v1` stay required. No tax rate and no customer tax identifier are invented.

The advertised amounts are already the contract totals in `lib/catalogue-seed.ts` and `lib/pricing.ts` (9900, 29900, 5900, 14900 and 999 pence). `EXCLUSIVE` would add tax on top of those amounts, so it is not the treatment for these prices. `INCLUSIVE` cannot be stored without a rate, and this proposal does not create one.

The minimum later change, which still needs separate approval before any database write, is to leave the seed at `UNCONFIRMED` and, only after a verified GB purchasing establishment while the seller position is `NOT_VAT_REGISTERED`, set that quote's tax behaviour to `NOT_APPLICABLE` with determination `UK_DOMESTIC_NOT_VAT_REGISTERED`. The existing money rules then keep tax at 0 and the customer total equal to the advertised amount. An overseas or later-registration sale still waits for its own eligibility decision. A future taxable decision that must keep the same customer total would use `INCLUSIVE` with a rate supplied by that decision, not by this template.

## Completion

Step 6 is complete only when the quote list is complete and the single best quote has status `ACCEPTED`. A draft, an offered quote, an open acceptance link, a declined quote, an expired quote, a superseded quote and a cancelled quote do not finish the step. Two quotes at the same rank are not an authoritative acceptance. An accepted row in an incomplete list is not acceptance.

Saving, reviewing, offering, or issuing a link does not accept the quote.

## Pathway and service track

The current approved Step 5 pathway is shown. It is not the customer's agreement.

- When the track is already Guided or Managed, the quote service follows that track.
- When the track is not chosen and the approval recommends Guided or Managed, the draft may use that recommendation. The track stays not chosen.
- A recommendation that disagrees with the selected track is shown. The selected track is not changed.

## Binding quote

Offering a draft is the binding issuance. The purchasing establishment and the country and tax eligibility checks already on the quote command still apply. A blocked offer returns `eligibility_blocked` and the staff message names those existing checks. This step does not add a country list and does not waive the checks.

An acceptance link still requires the existing verified customer email and verified business authority. The raw token stays out of the stored command. Payment collection and service activation stay on Step 7.

## Assessment database

`admin_journey_05_assessment_dev_v1` was applied to DEV only as `20261019163645`. See `docs/admin/admin-journey-05.md`. It is not applied to Production. The recovered statement is in `supabase/migrations` and must not be replayed.
