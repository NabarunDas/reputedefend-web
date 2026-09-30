# Stripe payments — Step 14

Status: **DATABASE APPLIED / STRIPE DISABLED / NO MONEY MOVED**

The additive migration `20260930132106_stripe_payments_v1.sql` is applied to `profilerelaunch-dev` exactly once after Step 13 as `20260930132106 stripe_payments_v1`. Live migration history now ends with `20260929233953 catalogue_quotes_orders_v1` then `20260930132106 stripe_payments_v1`. Step 14 exists remotely exactly once. Do not replay it. Do not create another payment migration.

The official Stripe Node SDK `22.6.2` is pinned in the lockfile and uses the SDK-bundled API version `2026-08-26.dahlia`. Stripe itself remains disabled. No Stripe secret, webhook secret, or Vercel production payment variable is configured. The deployed application has created no Stripe Customer, Checkout Session, SetupIntent, PaymentIntent, invoice, subscription or charge. No card was charged. No money moved. Live mode is impossible without a later Finance launch gate.

Step 11 outgoing mail remains disabled. Step 12 inbound mail remains disabled. Cron remains `0 4 * * *`. Worker cadence remains 86400 seconds. Step 16 Guard subscription schema exists as independently applied `20260930180050 guard_subscriptions_billing_v1`. Stripe and Guard live gates remain unset, so no Guard subscription was activated and no Stripe subscription object was created by deployed environments.

## Independent live verification

Independent live verification confirmed:

- Step 14 migration count = 1
- 10 public payment tables are present
- payment private receipt infrastructure is present
- RLS enabled on all Step 14 public financial tables
- anon direct table SELECT = denied
- authenticated direct table SELECT = denied
- service-role direct table SELECT also remains denied by the RPC-only model
- payment SECURITY DEFINER RPCs explicitly deny anon/authenticated execution
- service role has the required RPC execution access

Verified important live invariants include:

- one active payment attempt per obligation
- one open DRAFT/ISSUED invoice per obligation
- one USABLE saved payment method per order
- same Stripe PaymentMethod may be associated with separate orders only through separate order/consent records
- customer payment actions are scoped to exact payment purpose/order/obligation
- receipts require an attempt or invoice source
- payment invoice commercial snapshot is protected
- invoice operational lifecycle is controlled
- payment obligations cannot regress from PAID
- payment attempts cannot regress from SUCCEEDED
- provider object-type binding guard is present
- invoice/Checkout mutual exclusion is present
- stale Guided/recovery actions are revoked when invoice fallback becomes ISSUED
- DRAFT/ISSUED/PAID invoice blocks other collection routes
- `COLLECT_PAYMENT` and `PROCESS_STRIPE_EVENT` are valid Step 10 job types

Current live payment data remains completely empty:

- 0 Stripe customer mappings
- 0 payment consents
- 0 saved payment methods
- 0 success-fee approvals
- 0 payment obligations
- 0 provider operations
- 0 payment attempts
- 0 payment invoices
- 0 payment receipts
- 0 payment ledger entries
- 0 Stripe event receipts
- 0 Step 14 payment jobs

Supabase security advisors show no new Step-14-specific WARN/ERROR. Existing historical project warnings remain outside this PR.

## Managed design

Do **not** authorize a card now and capture weeks later.

Managed flow:

1. Hosted Checkout `mode=setup` with `payment_method_types: ["card"]`. Stripe Node SDK `22.6.2` Checkout `setup_intent_data` has no `usage` field; SetupIntent create defaults usage to `off_session`. The retrieved SetupIntent usage is verified before setup is marked ready. Do not invent an API-version string.
2. Save a reusable payment method
3. Record immutable ProfileRelaunch later-charge consent (`SUCCESS_FEE_CONSENT_V1`)
4. No payment obligation and no charge at setup
5. Perform the service
6. Qualifying evidenced outcome (`RESTORED` or `REMOVED` only) with an accepted same-case `outcome_evidence_version_id`
7. Fresh-auth Admin billing approval
8. Exactly one `SUCCESS_FEE` obligation from the immutable accepted order amount
9. One idempotent off-session PaymentIntent through the Step 10 `COLLECT_PAYMENT` job
10. If authentication is required, leave unpaid and recover on-session through `PAYMENT_RECOVERY`

A saved payment method alone is not authority to charge.

## Guided design

Accepted Guided orders create one `UPFRONT` obligation from the immutable Step 13 order snapshot. Hosted Checkout `mode=payment` with `payment_method_types: ["card"]` uses that amount in GBP minor units. The success return page at `/pay/return` never marks paid. `checkout.session.completed` only binds provider IDs. Canonical collection success is a retrieved PaymentIntent with `status = succeeded`. An unpaid Checkout Session never writes a receipt.

## DATABASE-READY but NOT activated

These capabilities exist in the applied database and application source. They are not activated. Stripe remains disabled and the deployed application has created no test or live Stripe objects.

- Stripe Customer mapping
- Guided hosted Checkout
- Managed SetupIntent / off-session consent
- Success-fee approval
- Off-session collection
- SCA recovery
- Hosted invoice fallback
- Webhook receipt / processing
- Payment ledger
- Receipts
- Case payment-readiness gates

Related source that remains inactive until Stripe is enabled later: provider modes `disabled` (default) and `stripe_test`; Admin `/money` and `/api/webhooks/stripe`; customer payment command `customer_payment_command_v1`; action kinds `GUIDED_PAYMENT`, `MANAGED_PAYMENT_SETUP`, `PAYMENT_RECOVERY`, `INVOICE_PAYMENT`.

## What remains intentionally not live

- Stripe provider remains disabled
- No Stripe API secret configured by this rollout
- No Stripe webhook configured by this rollout
- No Checkout Session, SetupIntent, PaymentIntent, Stripe Customer, Stripe Invoice or Stripe Subscription created
- No card charged and no money moved
- No live mode
- No Guard subscription or monitoring activation
- Step 11 outgoing mail still disabled
- Step 12 inbound mail still disabled
- Cron still `0 4 * * *`
- No refunds, disputes or live Step 16 behaviour. Step 16 is DATABASE APPLIED / STRIPE & GUARD LIVE DISABLED and Stripe remains disabled
- `PREPARATION` / `READY_TO_SUBMIT` remain blocked until later payment/permission/pack gates are used in a live collection
