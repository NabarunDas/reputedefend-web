# Customer — Stripe sandbox Preview configuration

DEV-only Preview deployment checkpoint, 15 October 2026.

The environment variable PAYMENTS_PROVIDER_MODE is configured to stripe_test on the develop Preview branch only. The Stripe sandbox API key must be stored as a Sensitive Preview variable and must never appear in source control. Supabase and evidence storage remain strictly DEV. Production payments remain disabled, and there is no customer-facing payment rollout from this checkpoint.

This documentation-only change forces a fresh Vercel Preview build after updating Preview environment variables. Do not copy this setting to Vercel Production or enable STRIPE_LIVE_ACTIVATION.

The Customer Portal remains feature-gated until a separately approved synthetic DEV acceptance/payment test. This file does not enable the portal.

## Sandbox webhook dependency — 15 October 2026

The Customer Preview application requires its own protected STRIPE_WEBHOOK_SECRET configuration even though only the Admin webhook receives Stripe events. The value is managed in Vercel and must match the DEV Stripe endpoint signing secret. Adding the protected secret after a previous READY deployment requires a fresh Preview build; this documentation-only checkpoint does not change runtime code or Production configuration.
