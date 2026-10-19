# ADMIN-JOURNEY-06 — Guided quote and contract acceptance

DEV/develop preview only. The route stays behind `devCaseJourneyPreviewEnabled`: `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=develop`, and `SUPABASE_URL` exactly the DEV project `https://rmzozuiamjcclvtgutgd.supabase.co`. Production and every other preview receive not-found before a case is read. Staff access is the existing `requireStaff` check. Case permissions on the quote command are unchanged.

This step does not take a payment, activate a service, send email, or submit anything to Google. Those remain later steps. No new quote API is added. No migration is added for this step.

## What this reuses

- `summariseCommercial` and `commercialQuotesTied` for the quote list
- `quoteServiceForCase` and `currentApprovedPrice` for the service and the price
- `CaseQuoteForm`, `SetDraftTaxForm`, `QuoteActionForm`, `OfferQuoteActionForm` and `RevokeQuoteActionForm`
- `quoteCommand` posting to `/api/operations/quotes`, which calls `admin_quote_command_v1`
- The existing offer trigger `quote_versions_commercial_eligibility` and `evaluate_commercial_eligibility_v1`

The commercial workspace is unchanged. Its buttons still follow the case-flow primary action. Step 6 has its own panel so a quote can be drafted from an approved recommendation while `service_track` is still `UNDECIDED`. `create_draft` does not write `service_track`.

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

`admin_journey_05_assessment_dev_v1` was applied to DEV only. See `docs/admin/admin-journey-05.md`. It is not applied to Production and it is not copied into `supabase/migrations`.
