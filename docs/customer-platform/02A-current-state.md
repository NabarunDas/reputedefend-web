# 02A — Current state

Status: **planning only**. No SQL is applied. No Customer Portal UI, Stripe object, Retell agent, or Production setting is changed. Revised against review comments `6559957225` and `6560133090`. The schema facts below are the constraints the other 02A documents now follow.

Reviewed on 1 November 2026 against `develop` commit `bb03642c4e70fb7f7d4b184c48facb49e7eb47cd` (PR #384, the flagged My Products hub). This environment did not open a connection to `profilerelaunch-dev`. The ledger facts below are the committed manifest and history test, not a fresh remote query.

## Migration head

| Fact | Source |
| --- | --- |
| Repository chain head | `20261031160000_customer_portal_idle_timeout_v1.sql` |
| `migrationHead` | last entry of `apps/admin/lib/recovery/manifest.ts` |
| Recorded live DEV ledger | 91 entries, ending at `20261031160000` |
| Why 91 is not the file count | `apps/admin/lib/recovery/history.test.ts` says live DEV still omits three initial foundation entries tracked in issue #190. The synthetic chain includes those files and is not a literal copy of the live ledger. |
| `pendingMigrations()` | empty |
| Production / AWS ApprovedMigrationHead | `20261014170000` |
| Replay | Do not replay `20261031160000`. It updates existing portal session rows and is not applied to Production. |

No migration file in `supabase/migrations/` is newer than `20261031160000`.

## What already exists

ProfileRelaunch already has one customer identity, one business graph, two operational products, and one portal login. It does not have a cross-product subscription or a Telloya database.

### Identity and tenancy

Defined in `supabase/migrations/20260915120000_core_data_foundation_v1.sql` and `20260917183422_admin_client_workspace_v1.sql`.

| Table | Role today |
| --- | --- |
| `public.customers` | One person. `customers_email_lower_idx` is a unique index on `lower(email)`. |
| `public.businesses` | One trading business. No owner column. |
| `public.locations` | Many per business (`locations.business_id`, `ON DELETE RESTRICT`). |
| `public.business_memberships` | Composite primary key `(customer_id, business_id)`. Status is `pending`, `verified`, or `revoked`. Verified requires `verified_at` and `verified_by`. |
| `public.customer_contact_verifications` | Composite primary key `(customer_id, channel)` for `email` or `phone`. |

There is no membership role. One customer can already belong to many businesses, and one business can already have many customer users. The schema allows that. The portal does not yet use it as the access rule for every product.

`admin_private.guard_location_authorized_v1` is the existing membership check: the location's business must have a `verified` membership for that customer. Guard activation also requires `guard_contact_ready_v1` and a verified `location_manager_access` row at `MANAGER` or `OWNER`.

Changing `customers.email` or `phone` runs `customers_invalidate_verification`. That deletes the verification for the channel that changed. An email change also sets verified memberships back to `pending` and writes `MEMBERSHIP_CHANGED`. It does not delete cases, payments, or the membership row. A phone-only change does not demote memberships.

RLS is enabled on these tables. Migrations do not create policies. `anon` and `authenticated` have no direct table access. The apps call service-role RPCs.

### Portal login

`20261003125151_customer_portal_auth_foundation_v1.sql` and `20261031160000_customer_portal_idle_timeout_v1.sql`.

| Piece | Behaviour |
| --- | --- |
| `admin_private.customer_portal_login_challenges` | Hashed pending login, email snapshot, attempt count, expiry, `consumed_at`. |
| `admin_private.customer_portal_sessions` | Hashed token, `customer_id`, `auth_user_id`, email snapshot, eight-hour `expires_at`, idle `last_activity_at`, revocation. |
| `customer_portal_begin_login_v1` | Looks up `lower(email)`. Unknown email, the admin address, or an email that fails `verified_current_email_v1` is ineligible. |
| `customer_portal_finish_otp_v1` | Opens a session only after the Auth user matches the verified email. |
| `customer_portal_session_v1` | Reads a session from `p_token_hash`. It does not take a customer id. |
| App | `apps/customer/lib/portal/http.ts`, `apps/customer/lib/portal/session.ts`. |

The portal session means "this browser completed OTP for this customer's current verified email". It does not grant business membership, case ownership, Guard, or payments. `customers` has no `auth_user_id`. An Auth user alone cannot sign in.

Idle is 30 minutes. Absolute lifetime is eight hours. Sign-out revokes the current token through `customer_portal_sign_out_v1`.

### Recovery

`public.cases` belongs to one `customer_id`, one `business_id`, and one `location_id`. Case types are `PROFILE_RECOVERY` and `REVIEW_PROTECTION`. Commerce is `price_versions` → `quotes` → `quote_versions` → `quote_acceptances` → `service_orders` → `payment_obligations` (`20260929233953_catalogue_quotes_orders_v1.sql`, `20260930132106_stripe_payments_v1.sql`).

Service codes today are `GUIDED_RELAUNCH`, `MANAGED_RELAUNCH`, `GUIDED_REVIEW`, `MANAGED_REVIEW`, and `RELAUNCH_GUARD`. Amounts are integer minor units. Recovery payment is one-off (`UPFRONT`) or success fee, not a subscription.

`customer_portal_dashboard_v1` returns cases for the session customer. It does not list every case of every business that customer belongs to. A second verified member does not automatically see the first member's cases.

### Guard

Guard is already a per-location operational and billing system.

| Authority | Table | What it decides |
| --- | --- | --- |
| Coverage | `guard_coverages` | One non-ended coverage per location. States run from `REQUESTED` through `ACTIVE`, `PAUSED`, `ENDING`, `ENDED`. |
| Paid entitlement | `guard_billing` | One row per coverage. `billing_state` and `paid_through_at`. `invoice.paid` is what sets `CURRENT`. |
| Stripe subscription | `guard_subscriptions` | Per location/coverage. Stripe ids, lifecycle, amount snapshot. Not the monitoring switch. |
| Invoices | `guard_subscription_invoices` | Paid invoice facts. |
| Permission and setup | `guard_permissions`, `guard_baselines`, `guard_rota_assignments`, `location_manager_access` | Required before `guard_activate_v1` can move `READY_TO_ACTIVATE` to `ACTIVE`. |

`docs/admin/guard-subscriptions-billing.md` states that Stripe status is not Guard entitlement and that `guard_billing` remains the local entitlement projection. Checkout return and subscription `active` are not entitlement.

`customer_portal_guard_v1` lists coverages for the session customer. It does not treat "has a portal account" as coverage.

The live coverage origin check does not admit a Complete-funded location. After `20260930180050_guard_subscriptions_billing_v1.sql`, `guard_coverages_basis_origin` allows only:

| Basis | Origin | Required links |
| --- | --- | --- |
| `DIRECT_GUARD` | `DIRECT_GUARD` | A `service_order_id`. No recovery case, managed order, or source included coverage. |
| `DIRECT_GUARD` | `INCLUDED_CONTINUATION` | A `service_order_id` and `source_included_coverage_id`. |
| `INCLUDED` | `INCLUDED_RECOVERY` | `source_recovery_case_id` and `source_managed_order_id`. No direct service order. |

`guard_coverages_included_period` forces an included coverage's window to exactly 30 days from `activated_at`. `guard_billing.entitlement_source` is only `NONE`, `INCLUDED`, or `PROVIDER`. Readiness treats direct Guard as billable only when `billing_state = CURRENT`, `entitlement_source = PROVIDER`, and `paid_through_at > now()`. That `CURRENT`/`PROVIDER` pair is what `guard_apply_invoice_paid_v1` writes. `admin_private.guard_set_billing_entitlement_v1` is not granted to `service_role`. `guard_set_entitlement_checked_v1` refuses `CURRENT` unless the source is `PROVIDER`.

`guard_coverages_one_open_location_idx` and `guard_subscriptions_one_open_location_idx` allow one non-ended coverage and one open subscription per location. A bundle cannot point one subscription column at several of those rows.

So a Complete customer cannot be given Guard coverage, paid-through, or activation with the functions that exist today. Saying otherwise would require forging an included recovery, a Guard invoice, or a call to the privileged billing setter. None of those are acceptable. A later gated change has to add a bundle origin and a bundle paid-through writer. Until that change is applied, Complete does not activate Guard.

`docs/admin/guard-subscriptions-billing.md` already separates a failed renewal from loss of service: if `paid_through_at > now()`, coverage stays operational, and paid-through is monotonic. A Complete preview must not cancel that coverage or shorten that timestamp while the bundle writer does not yet exist.

Customer actions already include `GUARD_PERMISSION`, `GUARD_SUBSCRIPTION_START`, and `GUARD_PRICE_CHANGE_ACCEPTANCE`. Those are scoped links for an existing customer and coverage, not account invitations.

### Payments and mail

- `stripe_customer_maps` is one ProfileRelaunch customer to one Stripe customer. Both sides are unique.
- `admin_private.stripe_event_receipts` deduplicates provider event ids. `payment_receive_stripe_event_v1` returns `duplicate` on replay. Guard apply uses `guard_apply_subscription_event_v1`.
- `provider_operations.idempotency_key` is unique.
- `public.communications` plus `admin_private.job_outbox` topic `SEND_EMAIL` is the mail queue. Dev claim functions include `dev_mail_dispatch_claim_v1` and `admin_dev_send_email_claim_v1`. Outbox `event_key` is unique.
- Admin commands use `admin_private.*_command_receipts` (`request_id`, `actor_id`, `fingerprint`, `response`) and append-only `public.admin_audit_events` through `write_record_audit_v1` / `write_audit_v1`. The actor comes from `admin_session_v1`, not from the browser body.

### Enquiries

`public.enquiries` (`20260917185905_admin_enquiry_triage_v1.sql`) stores a JSON payload. It has no `customer_id` or `business_id`. Conversion through `admin_enquiry_convert_v1` creates either a case or a `monitoring_requests` row and sets `status = converted`. A check allows only one of `case_id` and `monitoring_request_id`.

That path fits Recovery and monitoring intake. It does not fit a Telloya or Complete subscription. Overloading `converted` would force every Telloya enquiry into a case or a monitoring request.

### Phase 1 My Products

PR #384, behind `CUSTOMER_PRODUCTS_HUB_ENABLED` (exact `true` only):

- `/portal` is still the Recovery dashboard.
- `/portal/products` renders `ProductCard` from `apps/customer/lib/portal/products/present.ts`.
- Recovery and Guard cards use the existing dashboard and Guard reads.
- Telloya is a static exploring card with no destination and no entitlement.
- A failed read is `unavailable`, not "unpurchased".
- No purchase, trial, or active badge is shown.

`apps/telloya` is a marketing site. It has no database, login, or entitlement code. Telloya marketing PR #383 is out of scope for this design's file changes.

### Customer action links

`public.customer_actions` (`20260928094817_admin_customer_actions_v1.sql`) holds a SHA-256 secret hash, an expected email snapshot, and an expiry. Kinds are tied to an agreement, authorisation, quote, evidence request, payment, or Guard coverage. The private challenge and session tables are for that one action. They are not a portal login and not an account invitation. An action session must not be accepted as a portal session. The portal route inventory already rejects that substitution.

## Gaps that block multi-product access

These are gaps in the current schema, not a request to replace the tables above.

1. There is no product, plan, subscription, entitlement, or Telloya provisioning table.
2. `price_versions.service_code` cannot name Telloya or Complete. Recovery prices and Guard prices must stay on that catalogue.
3. Portal Recovery and Guard reads key off `customer_id` on the case or coverage. Verified membership is necessary for Guard activation and is not sufficient for portal visibility.
4. Nothing records that a paid invoice is distinct from a live service, except Guard's existing split between `guard_subscriptions`, `guard_billing`, and `guard_coverages.state`. Telloya has no equivalent split.
5. Enquiries cannot point at an onboarding request without either misusing case conversion or adding a new link.
6. There is no hashed, expiring invitation that reuses an existing customer and still refuses to create a session. `admin_contact_verify_v1` stores an administrator evidence string and a non-null `verified_by`. It does not prove the person controls the mailbox. `customer_portal_begin_login_v1`, confirm, resend, attempt, and `customer_portal_finish_otp_v1` all reject that customer through `customer_portal_email_current_v1`, because `verified_current_email_v1` is null. `customer_portal_session_v1` also returns null until a verification row exists. A new customer therefore cannot sign in unless a later OTP success writes that row. Admin approval must not write it.
7. Complete does not exist as data. A bundle cannot be represented by a second Guard subscription without double billing.
8. The Phase 1 hub has nowhere authoritative to read a Telloya or Complete state. Its comment already names the future session-scoped projection.

## What must stay authoritative

| Concern | Keep using |
| --- | --- |
| Who the person is | `customers` plus verified email |
| Who may act for a business | `business_memberships.status = verified` |
| Portal session | `customer_portal_session_v1` from the token hash |
| Recovery work and Recovery money | `cases`, quotes, `service_orders`, `payment_obligations` |
| Guard coverage and monitoring | `guard_coverages` and the readiness/activation functions |
| Guard paid-through | `guard_billing`, fed by `invoice.paid` for provider Guard. Included recovery stays `NOT_REQUIRED` / `INCLUDED` and is 30 days. |
| Guard Stripe subscription | `guard_subscriptions`, one open row per location |
| Stripe customer | `stripe_customer_maps` |
| Mail | `communications` and the `SEND_EMAIL` outbox |
| Admin trace | command receipts and `admin_audit_events` |
