# PAY-ENV-04 — DEV-only Stripe one-shot

Status: **source and tests only**. Migration `supabase/migrations/20261015230000_dev_stripe_one_shot_v1.sql` is not applied to DEV or Production. `DEV_STRIPE_ONE_SHOT_ENABLED` is not set in Vercel. No queued DEV event has been processed by this change. Production worker, Production data, Stripe credentials and webhook configuration are unchanged.

DEV applied head stays `20261015153000`. Production applied head and AWS ApprovedMigrationHead stay `20261014170000`.

## What this is

The normal job worker runs only when `VERCEL_ENV=production`. Signed sandbox webhooks can therefore sit in the DEV outbox as `PROCESS_STRIPE_EVENT`. This route lets an authenticated Admin process **one selected test-mode event** on the `develop` Preview deployment.

It reuses `processStripeEventHandler`, `job_complete_v1` and `job_fail_v1`. It does not call `job_promote_outbox_v1` or `job_claim_batch_v1`, because those functions take every job type. A new SQL function claims only the selected `PROCESS_STRIPE_EVENT` with `livemode=false`.

Guard, subscription, refund and dispute events are refused before promotion, so they stay queued. A recurring invoice is refused as well, including one whose job type is still `PROCESS_STRIPE_EVENT`. If the handler nevertheless tries a Guard call, that call is not made and the selected job is dead-lettered.

## Prerequisites

Do not start until an independent review has applied the migration to DEV and has explicitly enabled the flag. Until then the endpoint refuses every request.

Required together, and only on Admin Preview for branch `develop`:

- `VERCEL_ENV=preview`
- `VERCEL_GIT_COMMIT_REF=develop`
- `SUPABASE_URL=https://rmzozuiamjcclvtgutgd.supabase.co`
- `AWS_EVIDENCE_BUCKET=profilerelaunch-evidence-dev-01`
- `PAYMENTS_PROVIDER_MODE=stripe_test`
- a real `sk_test_` or `rk_test_` key and the sandbox webhook secret already required for Preview payments
- `STRIPE_LIVE_ACTIVATION` unset
- `DEV_STRIPE_ONE_SHOT_ENABLED=true`

The flag defaults to off. Do not set it in Production. Do not set it while the migration is unapplied. A missing or mismatched value does not fall through to the production worker.

## Operator flow

1. Sign in to the DEV Admin Preview. The action requires a sign-in from the last five minutes.
2. Open `/operations/jobs`.
3. Enter the exact Stripe event id (`evt_…`) and confirm the checkbox.
4. Submit once. The browser sends a new idempotency UUID.
5. Read the jobs page again. One `PROCESS_STRIPE_EVENT` row should move. Email, collection and Guard rows ahead of it must be unchanged.

The endpoint is `POST /api/operations/dev-stripe-reconcile`. It accepts only `eventId` and `confirmed`. It is not a cron route and it is not served on `dev-hooks.profilerelaunch.com`.

## Retries

- The same idempotency key returns the earlier decision and does not claim a second job.
- If the claim succeeded but the request stopped before completion, submit that same key again within the 120-second lease. The handler is safe to repeat: Stripe application is idempotent.
- After the lease expires, use a **new** idempotency key. The expired lease cannot complete the job.
- A retryable provider failure schedules the existing backoff. Wait until that time, then use a new idempotency key.
- A dead-lettered event is not claimed again. Use the existing dead-letter replay on the jobs page, which still requires its own reason and fresh sign-in, and then a new one-shot key.
- Do not mark a receipt processed, and do not mark an order paid, by hand.

## Rollback

Unset `DEV_STRIPE_ONE_SHOT_ENABLED` and redeploy Preview. The endpoint then refuses before any database or Stripe call. Queued outbox rows remain. Unsetting the flag does not reverse a settlement the handler already applied.

## Cost

This adds no Vercel project, domain, cron schedule or Stripe webhook. Each accepted run is one Admin request, one database claim and the provider reads the existing handler already performs. It does not create a charge. Confirm the current Vercel and Stripe plan limits before enabling the flag for a batch of events; process them one at a time.
