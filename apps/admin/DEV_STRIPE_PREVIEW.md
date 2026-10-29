# Admin — DEV Stripe sandbox Preview configuration

15 October 2026 checkpoint. Stripe sandbox API key and webhook signing secret are stored as protected Vercel Preview variables, now restricted to the `develop` Git branch. `PAYMENTS_PROVIDER_MODE=stripe_test` applies to that branch only. This document records configuration state and forces a fresh Admin Preview build; it never includes actual secret values, changes Production configuration or activates live payments.

`POST /api/webhooks/stripe` remains the Stripe route on `dev-hooks.profilerelaunch.com`, and only while `VERCEL_ENV=preview`. The same host also forwards exactly `POST /api/webhooks/resend` when that deployment is Preview, `VERCEL_GIT_COMMIT_REF` is `develop`, and `SUPABASE_URL` is the DEV project `rmzozuiamjcclvtgutgd`. Every other path and method on that host stays 404. The Resend handler still verifies the Svix signature before any database call. Do not configure the live Resend endpoint, store `RESEND_WEBHOOK_SECRET`, or turn the mail worker on from this note.

## PAY-ENV-04 controlled manual acceptance — 16 October 2026

The reviewed additive PAY-ENV-04 claim SQL is installed **DEV only** at canonical version `20261015230000`, with source record merged as PR #204. The later observed DEV head is `20261019163645` and does not change this file. For the one-event operator smoke test only, the Admin Vercel **Preview / develop** variable `DEV_STRIPE_ONE_SHOT_ENABLED=true` was explicitly enabled after review. It is not enabled in Production or Customer, does not activate cron, and cannot bypass same-origin or fresh Admin session checks. The test event must be synthetic and `livemode=false`.

This DEV-only documentation change refreshes Admin Preview after Vercel configuration. Once the one-event proof is recorded, change the flag to `false` and redeploy to close the manual action. The normal job worker stays disabled in Preview. No secrets, Stripe object data or event payloads are included here.

## PAY-ENV-04 manual gate closed after one-event smoke — 16 October 2026

A fresh Admin-session operator submitted the synthetic test-mode £0 Stripe `invoice.paid` event `evt_1UQtMwBq7gpSHBmBepodqkmq` through the audited one-shot UI. DEV Supabase job `28d5beba-5b7e-4516-afdc-9f596fc8637d` reported `SUCCEEDED` after one attempt; the selected Stripe event was promoted while the other three remained unpromoted. The branch-scoped Admin Preview `DEV_STRIPE_ONE_SHOT_ENABLED` was changed to `false` immediately afterward. This documentation-only commit triggers a refreshed Admin DEV Preview build **with the manual gate OFF**, preserving all Production isolation. No invoice, customer data or payment credentials are committed.
