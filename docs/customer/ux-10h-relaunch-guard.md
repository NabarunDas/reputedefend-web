# UX-10H — Relaunch Guard in the Customer Portal

Complete in source and applied to `profilerelaunch-dev`. The Customer Portal stays disabled.

## Routes

- `/portal/guard` lists every Guard coverage owned by the authenticated portal customer.
- `/portal/guard/[selector]` opens one owned location.

The selector is `gd-` plus the SHA-256 hex of the coverage id, computed by `admin_private.customer_portal_guard_selector_v1`. It is not stored and it is not authority. Each request resolves it again against the portal session customer. A selector that belongs to someone else, and a selector that does not exist, both return `{ found: false }`.

Navigation now links Dashboard, Cases, Documents, Payments, and Relaunch Guard. Account stays unavailable. Messages are not added.

Guard customer actions have no case, so they are not case attention items. They appear on the Guard pages.

## Customer-safe projection

`public.customer_portal_guard_v1` and `public.customer_portal_guard_location_v1` return computed JSON. There is no second stored status.

Where the existing rows support it, a location shows the business and location names, a customer sentence for the stored coverage state, the arrangement (directly purchased, included from a recovery service, or a paid continuation), permission, whether monitoring is active, activation and included-end dates, billing and subscription sentences, the stored recurring amount and currency, period and cancellation sentences, the latest completed check, a customer-safe monitoring sentence, whether an issue is under review, and any eligible customer action.

Monitoring sentences are only: No issue detected; Change detected — being reviewed; Profile unavailable — being reviewed; Check incomplete. Profile availability is three-state: available, unavailable, or unknown. Unknown is `null` and is not described as unavailable. An open or acknowledged alert is shown as “ProfileRelaunch is reviewing a detected issue.”

A recorded cancellation request that the provider has not confirmed says the request is awaiting confirmation. The page says cancellation is scheduled only when `cancel_at_period_end` is true. `UNDO_PERIOD_END` stays a request awaiting confirmation until the existing provider-confirmation path clears that intent. While it is pending, the portal offers neither another period-end cancellation nor another undo.

The page may say that Guard is monitored according to the active service arrangement. It does not state a check time, a response time, or any other operating commitment.

## Ownership

Every read and command starts from `admin_private.customer_portal_actor_v1`. The customer id, authenticated user id, and verified email come from that session. The browser cannot choose them. Coverage, actions, and subscriptions are matched to that customer, location, and business in SQL. The same business or location name on another customer grants nothing. A bad, expired, or revoked session returns SQL NULL. An action bound to an earlier email is not found after the verified email changes.

## Actions supported

The portal exposes only existing customer actions, and only for an owned location:

- `GUARD_PERMISSION` accept and decline, using `GUARD_PERMISSION_V1` and the existing permission helpers.
- `GUARD_SUBSCRIPTION_START` recurring-consent acceptance, then checkout, recovery, period-end cancellation, undo, and immediate-cancellation review only when that action is already bound to the subscription, is still within its existing window, and `admin_private.customer_portal_guard_subscription_capabilities_v1` says the current lifecycle makes the operation meaningful. Checkout is limited to `PENDING_CUSTOMER`, `PENDING_PROVIDER`, and `INCOMPLETE`. Recovery is only `PAST_DUE`. A pending `UNDO_PERIOD_END` intent closes period-end cancellation and undo. `CANCELED` and `ENDED` expose none of these mutations. The portal command checks the same helper again. The emailed command does not use it.
- `GUARD_PRICE_CHANGE_ACCEPTANCE` accept and decline, using the stored notice. No response is not acceptance.

Permission decline now lives in `admin_private.decline_guard_permission_v1`. Checkout, recovery, and cancellation now live in `admin_private.customer_guard_subscription_apply_v1`. `public.customer_guard_subscription_command_v1` and `admin_private.customer_action_command_core_v1` delegate to those helpers. The emailed command still accepts its existing `subscriptionId` fallback. The portal command rejects `subscriptionId`, `customerId`, and `coverageId`.

Checkout preparation does not mark billing current and does not activate a subscription. When Guard subscriptions are disabled, checkout returns HTTP 503 and does not describe a successful payment. Immediate cancellation remains a review request. The page says a refund is not promised.

## Capability deliberately not exposed

There is no portal control for an owned subscription that does not already have a bound, unexpired `GUARD_SUBSCRIPTION_START` action. Period-end cancellation, undo, immediate-cancellation review, and payment recovery are not available merely because the customer owns the coverage. Recovery is offered only when that bound subscription is already `PAST_DUE`.

The portal does not activate Guard, pause or resume coverage, assign rota, record a baseline, verify access, record or retry a check, change a schedule, or create, acknowledge, resolve, dismiss, or escalate an alert. It does not approve refunds, reconcile billing, change provider mappings, or edit customer identity.

## Boundaries

`CUSTOMER_PORTAL_ENABLED` stays unset. `GUARD_ACTIVATION_ENABLED`, `GUARD_SUBSCRIPTIONS_ENABLED`, `GUARD_REFUNDS_ENABLED`, `GUARD_CHECKS_ENABLED`, `GUARD_ALERTS_ENABLED`, `GUARD_ALERT_NOTIFICATIONS_ENABLED`, `GOOGLE_BUSINESS_PROFILE_API_ENABLED`, and `JOB_WORKER_ENABLED` stay unset. No cron, Google API, live Stripe, or outgoing mail change is included. Prices, tax treatment, and refund decisions are unchanged. Production readiness decisions are unchanged. The ledger discrepancy stays blocked. Guard operating decisions stay blocked.

## Migration and grants

`supabase/migrations/20261004000625_customer_portal_relaunch_guard_v1.sql` is additive. It creates no table and no index. It was applied to `profilerelaunch-dev` on 2026-10-04 after independent review. Supabase MCP initially registered `20261004074806`; that single history row was aligned to the repository version `20261004000625` without replaying the schema.

Applied development head and repository head are both `20261004000625_customer_portal_relaunch_guard_v1.sql`. `pendingMigrations()` is empty.

Public functions, granted only to `service_role`:

- `public.customer_portal_guard_v1(text)`
- `public.customer_portal_guard_location_v1(text, text)`
- `public.customer_portal_guard_command_v1(text, uuid, text, text, text, jsonb)`

Private helpers, not executable by `PUBLIC`, `anon`, `authenticated`, or `service_role`:

- `admin_private.customer_portal_guard_selector_v1(uuid)`
- `admin_private.decline_guard_permission_v1(...)`
- `admin_private.customer_guard_subscription_apply_v1(...)`
- `admin_private.customer_portal_guard_location_body_v1(...)`

`admin_private.customer_action_command_core_v1` is replaced and remains private. Customer projections are parsed in TypeScript and fail closed on an unexpected key. Internal UUIDs and provider ids are not part of the page response.

## Tests

`apps/admin/lib/customer-portal/relaunch-guard.database.test.ts` covers ownership, shared location names, session failure, a changed verified email, permission accept and decline including the emailed path, replay, a rejected client subscription id, checkout preparation that does not mark billing current, a customer-safe check outcome, and grants.

`apps/customer/lib/portal/guard/command.test.ts` covers the disabled portal gate, forged identifiers, consent and permission messages, a disabled checkout, price responses, and a signed-out session.

`apps/customer/app/portal/guard/guard-view.test.tsx` covers the customer wording, the empty state, explicit permission confirmation, and separate price accept and decline controls.
