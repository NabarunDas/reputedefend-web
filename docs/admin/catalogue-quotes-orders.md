# Catalogue, quotes and service orders — Step 13

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED**

This is a source-only commercial foundation. ChatGPT will independently review and apply `20260929233953_catalogue_quotes_orders_v1.sql` later. This PR does not apply the migration, request Supabase credentials, create Stripe objects, charge money, send mail, or activate monitoring.

## What this step implements

- Effective-dated `public.price_versions` with `DRAFT` / `APPROVED` / `RETIRED`
- Immutable `public.quotes` + `public.quote_versions`
- Immutable `public.quote_acceptances` and `public.service_orders`
- Durable Guard discount qualification snapshots
- Explicit tax configuration/snapshot fields
- Admin `/commercial` workspace (Catalogue, Quotes, Orders)
- Customer `QUOTE_ACCEPTANCE` on the existing Step 9 action + OTP flow

It does **not** implement Stripe Checkout, invoices, payment-method storage, Guard coverage/onboarding, live outgoing mail, or live inbound mail.

## Seeded catalogue

The migration seeds one approved current version per service from the already-published `lib/pricing.ts` values. Marketing still renders `lib/pricing.ts`. This PR does not change public prices or CTAs.

| Service code | Display name | Pence | Payment model |
| --- | --- | ---: | --- |
| `GUIDED_RELAUNCH` | Guided Relaunch | 9900 | UPFRONT |
| `MANAGED_RELAUNCH` | Managed Relaunch | 29900 | SUCCESS_FEE |
| `GUIDED_REVIEW` | Guided Review | 5900 | UPFRONT |
| `MANAGED_REVIEW` | Managed Review | 14900 | SUCCESS_FEE |
| `RELAUNCH_GUARD` | Relaunch Guard | 999 | RECURRING_MONTHLY |

Amounts are integer GBP pence. Guard is per location per month. Seeded tax behaviour is `UNCONFIRMED` until Finance configuration is approved.

A later approved public price change must coordinate a new DB price version, website copy, terms/customer copy, and effective date. Do not create two independent current prices.

Approving a future version rolls the current open-ended predecessor forward atomically: `effective_to` becomes the successor `effective_from`. There is no overlap, no gap, and no need to retire today's price to schedule tomorrow's. Retirement remains the command for ending a service without a successor. Approved amounts, currency, tax and payment fields stay immutable.

Admin approval of a newly created draft requires `effective_from > now()`. The timestamp is not rewritten on approval. Seeded historical rows are inserted already approved and are exempt. Immediately effective new prices are not permitted.

`create_draft` and `create_version` must use the exact current price from `admin_private.price_version_current_v1(service, now())`. Status `APPROVED` is not enough. A future approved version cannot be quoted before cutover; the predecessor cannot be quoted after cutover; retired and expired windows are denied. Zero or multiple current prices fail closed.

## Integer pence arithmetic

Canonical calculation is shared by `lib/money.ts` and `admin_private.money_*_v1`:

- `discount = round(standard * bps / 10000)`
- `subtotal = standard - discount`
- exclusive tax: `tax = round(subtotal * rate_bps / 10000)`, `total = subtotal + tax`
- inclusive tax: `tax = round(subtotal * rate_bps / (10000 + rate_bps))`, `total = subtotal`
- `UNCONFIRMED` / `NOT_APPLICABLE`: `tax = 0`, `total = subtotal`

Exact Guard results: `29900 - 20% = 23920` (£239.20), `14900 - 20% = 11920` (£119.20).

## Tax

Supported behaviours: `UNCONFIRMED`, `INCLUSIVE`, `EXCLUSIVE`, `NOT_APPLICABLE`. A quote cannot be offered, issued as a customer action, or accepted while tax is `UNCONFIRMED`. The customer page shows the snapshotted treatment. Later catalogue tax changes do not recalculate accepted quotes. Quote `valid_until` must still be in the future before offer, amendment, or action issuance. A `QUOTE_ACCEPTANCE` expiry later than the quote validity is rejected.

## Guard discount

Policy `PAID_GUARD_MANAGED_20` (`discount_bps = 2000`) applies only to Managed Relaunch/Review when an explicit Admin qualification snapshot proves ACTIVE PAID coverage and the issue does not predate that coverage.

Fail closed. Do not infer paid coverage from a monitoring enquiry, a monitoring request, Guard terms acceptance, or the included 30-day period. Guided services, Guard fees, included/free coverage, inactive/paused coverage, pre-existing issues, and a second discount do not qualify. Discounts do not stack.

A qualification snapshot is pinned to one `price_version_id`. A snapshot for today's current price cannot be applied to tomorrow's successor, and a snapshot recorded against a future price cannot be used before that price becomes current. After cutover, a new qualification is required if the discount is to apply to the new current price. Existing immutable snapshots and accepted quotes are not rewritten.

Once an eligible discount is in an ACCEPTED quote, later Guard cancellation or catalogue changes cannot rewrite it.

Step 15 may later attach authoritative coverage IDs to new snapshots. Historical snapshots stay as written. `future_coverage_id` is reserved for that.

## Customer acceptance

Admin issues `/action/{id}#t={secret}` with kind `QUOTE_ACCEPTANCE` pinned to `quote_version_id`. The raw secret is never stored. OTP, membership, expiry and revocation reuse Step 9. Admin cannot tick “Accepted by customer”. An expired OPEN action is revoked with `ACTION_EXPIRED` before a replacement is created. A still-valid OPEN action is denied rather than duplicated.

Acceptance is one transaction: validate action/session/membership, validate the exact offered unexpired quote version, reject unconfirmed tax, create the acceptance, mark the quote accepted, create exactly one service order, complete the action, write audit. Retries return the same order.

Managed copy states that no fee is charged today and that the success fee becomes collectible only after the defined successful outcome and the later Step 14 payment/consent workflow. Accepting a quote is not card-charge authorisation. Guard acceptance does not start monitoring.

## Service orders

Created only from a valid accepted quote version. One order per accepted version. States:

- Guided: `ACCEPTED_AWAITING_PAYMENT`
- Managed: `ACCEPTED_SUCCESS_FEE`
- Guard: `ACCEPTED_RECURRING`

No Stripe objects, invoices, payment attempts, subscriptions, or success-fee obligations are created. Guided orders still cannot enter `PREPARATION` until Step 14 payment. Managed orders still need Step 9 authorisation. Guard orders do not activate monitoring.

## Admin commands

`admin_catalogue_command_v1` and `admin_quote_command_v1` are service-role SECURITY DEFINER RPCs with fixed `search_path`, idempotency receipts, optimistic `record_version`, and `COMMERCE_CHANGED` audit. Price approval requires a fresh Admin sign-in within five minutes. Browser table writes are denied. RLS is enabled on all new public tables.

## Still blocked / unchanged

- Step 11 live delivery remains disabled
- Step 12 live inbound remains disabled
- Cron remains `0 4 * * *`
- `PREPARATION` and `READY_TO_SUBMIT` remain blocked
- No Stripe, Resend, AWS, DNS, or Vercel production secret changes
- Migration is not applied
