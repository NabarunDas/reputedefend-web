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

Standard wording for the five existing service codes lives in `lib/commercial/scope-templates.ts`, version `SCOPE-2026-10-21.3`. Each service has its own scope and exclusions. The default comes from the published prices, the website service descriptions, and paid-service agreement PS-2026-10-14.2. Guided means ProfileRelaunch prepares the work and the customer submits it. Managed means ProfileRelaunch carries out authorised permitted work, subject to the applicable success-fee terms. The Managed success definition and payment-timing sentences stay the existing database functions. The template repeats them. It does not replace them.

The prices in the template are the final customer prices: Guided Relaunch £99 upfront, Managed Relaunch £299 only after the contractually defined and verified restoration with no upfront service fee, Guided Review £59 upfront, Managed Review £149 on verified removal with no upfront service fee, and Relaunch Guard £9.99 per month per location. New drafts say “Total price, inclusive of any applicable taxes.” and “No additional taxes or mandatory fees charged by ProfileRelaunch.” The frozen agreement still carries its section 12 disclosure. That sentence is not copied into the standard quote wording. A saved quote keeps the wording it was stored with.

The Create draft quote form fills Scope and Exclusions from the selected service. Admin does not need to write the standard wording. Admin can edit one quote for the case. Restore standard wording puts the current approved template back into the form and does not call the quote command. A saved quote keeps the exact `scope_text` and `exclusions_text` that were submitted, including the template version line when that wording used one. Changing the template later does not rewrite an existing quote or an accepted agreement. No new table or column is added.

The Step 6 preview shows that stored scope, those exclusions and the template version recorded on them before the offer control.

## Gross customer price

The seeded catalogue tax behaviour remains `UNCONFIRMED`. `UNCONFIRMED` still blocks an offer and an acceptance. The purchasing-establishment and country checks in `evaluate_commercial_eligibility_v1` stay required. No tax rate and no customer tax identifier are invented. Catalogue amounts stay 9900, 29900, 5900, 14900 and 999 pence.

`supabase/migrations/20261021210000_gross_customer_price_v1.sql` is source only. It has not been applied to DEV or Production, and this change does not apply it. Separate approval is still required before either database receives it. Production and AWS ApprovedMigrationHead stay `20261014170000`. The applied DEV head is `20261021155147`.

On a database that has received that file, a new or repriced quote for one of the five services must keep `total_amount_minor` equal to `quoted_subtotal_minor`. Exclusive tax is rejected. Inclusive tax, when a real rate exists, is calculated inside that same total. Not applicable and unconfirmed keep zero tax and a null rate. A stored draft whose exclusive tax sits above the advertised amount cannot be newly offered or accepted. That check does not rewrite the stored row. Cancelling or superseding it leaves the money columns as they were. An already accepted contract stays unchanged. Starting a payment for an open over-gross order is refused and does not change the order or the quote. An update that does not enter `OFFERED` or `ACCEPTED`, and does not change the money fields, does not rewrite an accepted quote. The UK not-registered treatment stays the existing internal determination `UK_DOMESTIC_NOT_VAT_REGISTERED` with quote tax `NOT_APPLICABLE`. It is not the customer-facing sentence. Stripe still charges the order amount copied from that quote total.

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
