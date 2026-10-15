# PAY-ENV-01 — Stripe DEV and Production lanes

Status: source only. `supabase/migrations/20261015153000_payment_lane_isolation_v1.sql` has not been applied to DEV or Production. This document does not activate payments, the Customer Portal, Guard or email, and it does not change Vercel, AWS or Stripe.

AWS ApprovedMigrationHead stays `20261014170000`. DEV applied head stays `20261015140000`. Production applied head stays `20261014170000`.

No Stripe secret belongs in Git, a `NEXT_PUBLIC_` variable, a log line or a database row. The values below are names and prefixes only.

## What the code now does

`VERCEL_ENV` selects the lane. `NODE_ENV=production` on a Vercel Preview build does not.

| Lane | `VERCEL_ENV` | Accepted `PAYMENTS_PROVIDER_MODE` | Accepted secret prefix | Expected Stripe `livemode` |
| --- | --- | --- | --- | --- |
| Local tests and development | unset, and `NODE_ENV` is not `production` | `stripe_test` | `sk_test_` or `rk_test_` | false |
| Preview | `preview` or `development` | `stripe_test` | `sk_test_` or `rk_test_` | false |
| Production | `production` | `stripe_live`, and only with `STRIPE_LIVE_ACTIVATION=enabled` | `sk_live_` or `rk_live_` | true |
| Anything else, including `NODE_ENV=production` with no `VERCEL_ENV` | unrecognised | none | none | payments stay disabled |

There is no fallback from a rejected Production configuration into test mode, and no fallback from a rejected Preview configuration into live mode. A live key on Preview never constructs a Stripe client.

On Preview and Production, `SUPABASE_URL`, `AWS_EVIDENCE_BUCKET` and `STRIPE_WEBHOOK_SECRET` must all be present and belong to that lane. A missing pin, a foreign pin, or a webhook secret that does not begin with `whsec_` disables Stripe. Local tests may omit those pins.

| Lane | Supabase project | Evidence bucket |
| --- | --- | --- |
| Preview / DEV | `rmzozuiamjcclvtgutgd` | `profilerelaunch-evidence-dev-01` |
| Production | `cxwwekdzkkjjbiyofrov` | `profilerelaunch-evidence-prod-euw2-337909767363` |

Local development does not apply those pins. Webhook signing secrets are separate per endpoint and must begin with `whsec_`. Checkout and hosted-invoice URLs stay on `checkout.stripe.com` and `invoice.stripe.com` in both lanes. A URL on those hosts is not proof of account or mode; the server still checks the retrieved object, customer, order, `livemode` and metadata.

Commercial behaviour stays as agreed. Guided payment is upfront. A Managed success fee is a hosted invoice due 14 days after Stripe finalises it, and only after verified success. Approving that fee does not queue `COLLECT_PAYMENT`. An old queued `COLLECT_PAYMENT` job fails closed and does not create a PaymentIntent, even when a saved card exists. Guard recurring consent and authorised subscription billing stay in place. Legal acceptance, tax, disputed-payment and commercial eligibility gates stay in force. The paid-service catalogue stays inoperative.

Stripe is not called unless the database lane agrees with the process. Production `stripe_live` requires an explicit `stripe_live` row from `admin_set_payment_provider_lane_v1`. No row, or a `stripe_test` row, blocks every Production Stripe call and does not create a provider operation or invoice. Preview accepts no row or an explicit `stripe_test` row, and refuses a `stripe_live` row. A webhook whose `livemode` does not match that lane is denied before a receipt is stored, and a repeat of the same event and the same `livemode` stays a duplicate.

Idempotency keys are unique inside one database and are sent to one Stripe account. DEV and Production use different Supabase projects and different Stripe accounts, so a customer id or provider row from one lane is never reused in the other.

## Database migration, when an operator later applies it

Do not apply this migration from the pull request. After independent review, a later change window can apply `20261015153000_payment_lane_isolation_v1.sql` to the target project. It is additive. It does not seed a lane and it does not call the setter.

Until a lane row exists, expected `livemode` stays false. That matches DEV. It is not enough for Production: `stripe_live` stays unable to call Stripe until `admin_set_payment_provider_lane_v1` has recorded `stripe_live` on that database. Inserts and updates that carry the other `livemode` fail with `livemode_mismatch`. Webhook functions deny a mismatched event without inserting a receipt and without marking it processed, so the same event can be delivered again after the lane is corrected. A repeat of the same event id and the same `livemode` stays a duplicate. Checkout, invoice, customer and Guard commands that would create a provider object refuse with `lane_mismatch` when the declared livemode does not match the row. `payment_collect_prepare_v1` always returns `off_session_retired` and does not change the obligation.

`public.admin_set_payment_provider_lane_v1` is granted only to `service_role`. It accepts `stripe_test` or `stripe_live`. It refuses when any provider, customer-map, Guard or webhook-receipt row already has the other `livemode`. An empty payment ledger can be set either way. The migration does not call it.

## Sandbox configuration (Preview / DEV), after review

Do this only in the Vercel Preview environment of the Admin and Customer apps. Do not put these variables on Marketing.

1. Confirm the Preview project uses Supabase DEV `rmzozuiamjcclvtgutgd` and evidence bucket `profilerelaunch-evidence-dev-01`.
2. Apply the lane migration to DEV only after the review that authorises it. Leave the lane unset, or set `stripe_test` through `admin_set_payment_provider_lane_v1` while every existing payment row is still test mode. Do not call it with `stripe_live` on DEV.
3. In the Stripe sandbox, register one webhook endpoint on the Preview Admin origin. Subscribe the event types the existing handlers already consume. Copy that endpoint's signing secret into Preview `STRIPE_WEBHOOK_SECRET`.
4. Put the sandbox secret key in Preview `STRIPE_SECRET_KEY`. It must use the `sk_test_` or `rk_test_` prefix.
5. Set Preview `PAYMENTS_PROVIDER_MODE` to `stripe_test`.
6. Leave `STRIPE_LIVE_ACTIVATION` unset. Preview ignores it.
7. Redeploy Preview. Settings should show the payment provider as a test configuration. A signed sandbox event should be stored once, and a repeated delivery should be a duplicate. A live-mode event must be rejected before any database write.

## Production configuration, only after the later release gates

Do not perform these steps in this change. Production payments stay off until legal acceptance, tax, commercial eligibility, the backup head, the live merchant account and an explicit activation decision are all in place. Production Supabase is still behind the DEV commercial migrations. Do not enable live payments before those gates.

When that later window exists, and only in the Vercel Production environment of Admin and Customer:

1. Confirm Production uses Supabase `cxwwekdzkkjjbiyofrov` and evidence bucket `profilerelaunch-evidence-prod-euw2-337909767363`.
2. Apply the lane migration to Production only after its own reviewed window. Production must not contain DEV provider rows.
3. On an empty Production payment ledger, call `admin_set_payment_provider_lane_v1` with `stripe_live`. If any row has `livemode` false, the call is denied and must stay denied.
4. In the live Stripe account, register a separate webhook on the Production Admin origin. Its signing secret is Production `STRIPE_WEBHOOK_SECRET`, not the sandbox secret.
5. Put the live secret key in Production `STRIPE_SECRET_KEY`. It must use the `sk_live_` or `rk_live_` prefix.
6. Set Production `PAYMENTS_PROVIDER_MODE` to `stripe_live`.
7. Set Production `STRIPE_LIVE_ACTIVATION` to `enabled`. Either value alone leaves payments disabled.
8. Redeploy Production. A test-mode key, a test-mode event, the DEV Supabase URL or the DEV evidence bucket must leave the provider disabled and must not write a live object into the database.

Rollback of the application gate is to unset `PAYMENTS_PROVIDER_MODE` and redeploy. That stops new charges. It does not reverse a charge already made.
