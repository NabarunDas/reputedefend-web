# Settings, staff/session operations, templates, privacy, complaints and incidents

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED**

Additive migration: `20261001110000_admin_settings_privacy_v1.sql`

Do not apply this migration from the PR. ChatGPT reviews the SQL independently before Supabase is changed. Do not request Supabase credentials. Do not replay or modify applied Steps 10–19. Do not enable Guard, Stripe, live mail or Google. Cron remains `0 4 * * *`.

## Single staff identity

The product decision from Steps 3–4 is unchanged:

- one staff identity: `admin@profilerelaunch.com`
- no staff levels, invitations, role tables, capability matrices, account deletion, disabling or identity rebinding
- session list, revoke, sign-out and last successful sign-in remain on Security
- Settings shows that identity, session count and a link to Security

The roadmap rule that the last Owner cannot be removed is satisfied structurally: `admin_identity` is a singleton and `admin_private.protect_admin_identity_v1` rejects DELETE, `enabled=false` and `auth_user_id` rebinding.

`admin_private.saved_filter_actor_is_staff_v1` now aliases the existing Admin identity check. There is still only one staff actor.

## Versioned settings

`public.admin_settings_versions` stores `SERVICE_HOURS` and `RETENTION` only.

Lifecycle: `DRAFT` → `APPROVED` → `RETIRED`.

- insert must start as draft `record_version = 1`
- approved facts (payload, key, version, `effective_from`) are immutable
- approve requires a session created in the last five minutes
- `effective_from` must be the current Europe/London day or later; past dates return `retroactive_effective_from`
- the previous `APPROVED` row is retired with `effective_to = new.effective_from`
- current lookup is `[effective_from, effective_to)`
- approved hours never rewrite existing case due dates, Guard obligations or historical reports

Service hours are case/enquiry targets, independent of seven-day Guard monitoring. Retention records the approved policy only. Deletion is not automated.

Secret-shaped keys and values (`secret`, `token`, `password`, `api_key`, `sk_live`, `whsec_`, private keys, OTP material) are rejected. Settings and audit store operation names only.

## Template lifecycle

Drafts live in `admin_private.communication_template_drafts`. Approve inserts the next immutable row in existing `admin_private.communication_templates`.

Allowed keys remain `EVIDENCE_REQUEST`, `CASE_UPDATE`, `CONVERSATION_REPLY`, `GUARD_ALERT`. The send path is unchanged: latest approved version only. Live mail stays disabled.

## Guard schedule drafts

Settings can create and approve `guard_check_schedule_versions` drafts. Approval is not retroactive and retires overlapping open-ended approved ranges at the new `effective_from`. Existing obligations are not rewritten. Live monitoring remains disabled until the separate Guard-check gate is set.

## Privacy and legal holds

`public.legal_holds` are `ACTIVE` or `RELEASED`. Facts are immutable. Release requires five-minute reauth.

`public.privacy_requests` kinds: `ACCESS`, `EXPORT`, `CORRECTION`, `DELETION`.

Statuses: `RECEIVED` → `VERIFIED` / `IN_REVIEW` → `COMPLETED` or `REFUSED`.

- verify requires the customer’s current email to already be verified
- preview stores counts only: receipts, obligations, communications, unsuccessful/open enquiries, hold count
- preview text states that financial receipts, obligations and audit events are retained
- `automatedDeletion` is always false
- completing a deletion while a matching hold is active marks the request `REFUSED` with `legal_hold`
- completion never deletes customers, receipts, obligations or audit events

## Complaints and incidents

Complaints remain `case_tasks.kind = 'COMPLAINT'`. The complaints page is a queue over those tasks. An open complaint still blocks case closure.

`public.operational_incidents` records `WORKER_OUTAGE`, `PROVIDER_FAILURE`, `STAFF_ABSENCE`, `MAIL_FAILURE` or `OTHER`. There is no invented acknowledgement SLA.

## Access

New public tables are RLS-protected with direct CRUD revoked. Public RPCs are `SECURITY DEFINER`, `search_path=''`, and `GRANT EXECUTE` to `service_role` only:

- `admin_settings_overview_v1`
- `admin_settings_list_v1`
- `admin_template_list_v1`
- `admin_complaint_list_v1`
- `admin_privacy_list_v1`
- `admin_incident_list_v1`
- `admin_settings_command_v1`

Audit actions: `SETTINGS_CHANGED`, `TEMPLATE_CHANGED`, `PRIVACY_CHANGED`, `INCIDENT_CHANGED`. Receipts are idempotent on `(request_id, actor_id, fingerprint)`.
