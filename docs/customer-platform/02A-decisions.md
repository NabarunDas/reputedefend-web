# 02A — Decisions

Status: **needed before 02B**. Each item has a recommended default so implementation can start without another open-ended design. A different choice should be written down here before the migration.

The recommendations follow the schema that is already on `develop` at `bb03642c`. They do not approve a price.

## D1. Where Guard billing lives

**Recommended:** `guard_subscriptions`, `guard_subscription_invoices`, and `guard_billing` remain the only Guard money and paid-through records. The commercial subscription never stores a Guard Stripe subscription id.

**If rejected:** a second Guard ledger will diverge from `invoice.paid` and from `guard_activate_v1`. Do not reject this without a replacement for those functions.

## D2. What the commercial subscription is allowed to sell

**Recommended:** `TELLOYA` and `COMPLETE` only. Recovery stays on cases and `payment_obligations`. Standalone Guard stays on Guard.

**If rejected:** extending `price_versions.service_code` is the alternative for a one-off, not for a bundle. A bundle still needs component rows.

## D3. What a second member of a business can see

**Recommended:** Telloya setup and live/paused status for that business. Not Recovery cases belonging to another customer. Not Guard or Telloya invoice amounts, Stripe ids, or call content. Guard operational status for a location is unchanged until a PR explicitly changes `customer_portal_guard_v1`.

**If rejected:** widening case visibility changes `customer_portal_dashboard_v1` and needs its own threat review. Do not hide that inside the commercial migration.

## D4. How an existing customer is recognised

**Recommended:** `lower(email)` on `customers`, then `verified_current_email_v1`. The same portal OTP is the only way to get a session. Admin approval creates neither an Auth session nor a portal session.

**If rejected:** a parallel invitation login would be a second authentication authority. Do not add one.

## D5. Prices, trial length, and Complete's Guard cap

**Recommended:** no numeric default. `plan_versions.amount_minor` stays null and cannot be offered until a named approver sets it. Trial cadence is allowed only with an explicit `trial_days` on that version. Complete's Guard `quantity_limit` is likewise unset until approved. This document does not choose £ amounts or a location count.

**If rejected:** seeding `lib/pricing.ts` into Telloya would publish an unverified price. Do not do that.

## D6. Who may grant a trial or waive payment

**Recommended:** only an admin command with `admin_session_v1`, a reason, and `trial_ends_at`. There is no silent trial. A checkout redirect cannot grant it.

**If rejected:** a self-serve trial needs a separate abuse review. It is not part of 02B–02F.

## D7. Enquiry conversion

**Recommended:** Telloya and Complete requests store `enquiries.id` and do not call `admin_enquiry_convert_v1`. The case-or-monitoring XOR stays as it is.

**If rejected:** adding a third conversion target means a new migration of `enquiries` checks and the admin convert form. That is easy to get wrong. Leave it out of 02B.

## D8. Invitation secret

**Recommended:** the email can be sent with no capability secret: "sign in with this verified address". If a secret is used, store only a hash, expire it in 7 days, single unconsumed row per request, and exchange it only after OTP. No `next` parameter.

**If rejected:** a secret that logs the person in is a second session issuer. Do not ship that.

## D9. When the UI may say Active

**Recommended:** only Telloya provision `LIVE` after the ten checks, or Guard coverage `ACTIVE` under the current readiness function. Commercial `ACTIVE` is displayed as paid or trial, with the setup step if the service is not live.

**If rejected:** showing Active at `invoice.paid` repeats the mistake Guard's own docs already forbid.

## D10. Complete double charge

**Recommended:** block a second open commercial subscription per business. Block a second non-ended Guard coverage per location (already true). Do not mark Complete's Guard item reconciled until the existing Guard cancel or credit command has succeeded.

**If rejected:** customers with a live Guard subscription will pay twice. Do not reject this for a launch shortcut.

## D11. First migration contents

**Recommended:** 02B is tables, constraints, RLS, and revokes only. No backfill, no update of existing rows, no portal change, DEV only, not Production.

**If rejected:** putting RPCs and UI in the same migration makes rollback a data migration. Keep them separate.

## D12. Phase 1 hub

**Recommended:** do not modify PR #384's components in 02B–02F. `customer_portal_products_v1` is written to feed `presentProducts` later. `/portal` is not retargeted at My Products in this programme.

**If rejected:** a hub rewrite before the read exists will show fixture states to real customers. The Phase 1 code already forbids that.

## Acceptance

02B is unblocked when D1–D4 and D7–D12 are accepted as recommended, and D5–D6 are accepted as "no price and no silent trial". D5 does not need a number before the empty schema. It needs a number before 02G and before any offer command will succeed.
