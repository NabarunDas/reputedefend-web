# Customer — DEV Stripe sandbox Preview configuration

15 October 2026 checkpoint. Stripe sandbox API key and webhook signing secret are stored as protected Vercel Preview variables, now restricted to the `develop` Git branch. `PAYMENTS_PROVIDER_MODE=stripe_test` applies to that branch only. The Customer runtime requires both variables even though the Stripe webhook endpoint runs in Admin. This documentation-only checkpoint forces a fresh Customer Preview build after Vercel secret-scope changes.

Customer Portal feature activation remains separately gated; no Production Stripe configuration or live activation was changed. Do not put secret values in Git or app logs.
