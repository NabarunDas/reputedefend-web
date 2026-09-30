# Stripe payments — Step 14

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / STRIPE DISABLED**

The additive migration `20260930132106_stripe_payments_v1.sql` is source-only. Do not apply it from this PR. The official Stripe Node SDK `22.6.2` is pinned in the lockfile and uses the SDK-bundled API version `2026-08-26.dahlia`. No Stripe secret, webhook secret, or Vercel production payment variable is configured. No Stripe Customer, Checkout Session, SetupIntent, PaymentIntent, invoice, subscription or charge was created against Stripe. No money moved. Live mode is impossible without a later Finance launch gate.

Step 11 outgoing mail remains disabled. Step 12 inbound mail remains disabled. Cron remains `0 4 * * *`. Worker cadence remains 86400 seconds. Guard subscriptions are not implemented.

## Managed design

Do **not** authorize a card now and capture weeks later.

Managed flow:

1. Hosted Checkout `mode=setup`. Stripe Node SDK `22.6.2` Checkout `setup_intent_data` has no `usage` field; SetupIntent create defaults usage to `off_session`, which is the intended later-charge use. Do not invent an API-version string.
2. Save a reusable payment method
3. Record immutable ProfileRelaunch later-charge consent (`SUCCESS_FEE_CONSENT_V1`)
4. No payment obligation and no charge at setup
5. Perform the service
6. Qualifying evidenced outcome (`RESTORED` or `REMOVED` only)
7. Fresh-auth Admin billing approval
8. Exactly one `SUCCESS_FEE` obligation from the immutable accepted order amount
9. One idempotent off-session PaymentIntent through the Step 10 `COLLECT_PAYMENT` job
10. If authentication is required, leave unpaid and recover on-session through `PAYMENT_RECOVERY`

A saved payment method alone is not authority to charge.

## Guided design

Accepted Guided orders create one `UPFRONT` obligation from the immutable Step 13 order snapshot. Hosted Checkout `mode=payment` uses that amount in GBP minor units. The success return page at `/pay/return` never marks paid. Only a signed webhook / `PROCESS_STRIPE_EVENT` reconciliation can mark `PAID` and write a receipt.

## What exists in source

- Provider modes `disabled` (default) and `stripe_test`
- `PaymentProvider` / `StripePaymentProvider` / `FakePaymentProvider`
- Stripe Customer mapping, consent, saved payment-method metadata, obligations, billing approvals, attempts, provider operations, ledger, invoices, receipts, Stripe event receipts
- Admin RPCs `admin_payment_command_v1`, `admin_payment_list_v1`, plus service-role apply/collect helpers
- Customer payment command `customer_payment_command_v1`
- Action kinds `GUIDED_PAYMENT`, `MANAGED_PAYMENT_SETUP`, `PAYMENT_RECOVERY`
- Job types `COLLECT_PAYMENT`, `PROCESS_STRIPE_EVENT`
- Admin `/money` and `/api/webhooks/stripe`
- Case gates: Guided `PREPARATION` requires a provider-confirmed paid UPFRONT obligation; Managed `PREPARATION` requires consent + usable payment method + existing authorization readiness; `READY_TO_SUBMIT` still requires a published pack

## What is intentionally not live

- Migration not applied
- No Stripe secrets configured
- No webhook registered
- No real or test Stripe objects created from deployed environments
- No live mode
- No Guard subscription or monitoring activation
- No refunds, disputes or Step 15/16 behaviour
