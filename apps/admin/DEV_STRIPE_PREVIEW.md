# Admin — Stripe sandbox Preview configuration

DEV-only Preview deployment checkpoint, 15 October 2026.

The environment variable PAYMENTS_PROVIDER_MODE is configured to stripe_test on the develop Preview branch only. The Stripe sandbox API key must be stored as a Sensitive Preview variable and must never appear in source control. Supabase and evidence storage remain strictly DEV. Production payments remain disabled, and there is no customer-facing payment rollout from this checkpoint.

This documentation-only change forces a fresh Vercel Preview build after updating Preview environment variables. Do not copy this setting to Vercel Production or enable STRIPE_LIVE_ACTIVATION.

The Admin webhook is restricted to POST /api/webhooks/stripe on dev-hooks.profilerelaunch.com. Its signing secret is stored in Admin Preview only. Webhook HTTP-route validation is a separate gate.
