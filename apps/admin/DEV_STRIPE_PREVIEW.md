# Admin — DEV Stripe sandbox Preview configuration

15 October 2026 checkpoint. Stripe sandbox API key and webhook signing secret are stored as protected Vercel Preview variables, now restricted to the `develop` Git branch. `PAYMENTS_PROVIDER_MODE=stripe_test` applies to that branch only. This document records configuration state and forces a fresh Admin Preview build; it never includes actual secret values, changes Production configuration or activates live payments.

Only `POST /api/webhooks/stripe` may reach the DEV webhook handler via `dev-hooks.profilerelaunch.com`. Verify HTTP routing and signed event delivery separately before marking sandbox end-to-end tested.
