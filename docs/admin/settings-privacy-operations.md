# Settings, staff/session operations, template lifecycle, privacy, complaints and incidents

Status: **SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / DESTRUCTIVE PRIVACY ACTIONS DISABLED**

Additive migration: `20261001111259_admin_settings_privacy_operations_v1.sql`

Generated with `npx supabase migration new admin_settings_privacy_operations_v1`. Do not apply this migration from the PR. ChatGPT reviews the SQL independently before Supabase is changed. Do not request Supabase credentials. Do not replay or modify applied Steps 10–19. Do not enable Guard, Stripe, live mail or Google. Cron remains `0 4 * * *`. `PRIVACY_DELETION_ENABLED` remains unset.

## Single staff identity

The product decision from Steps 3–4 is unchanged:

- one staff identity: `admin@profilerelaunch.com`
- no staff levels, invitations, role tables, capability matrices, account deletion, disabling or identity rebinding
- Settings Account & sessions reuses `admin_identity`, `admin_sessions`, `admin_auth_events`, `admin_list_sessions_v1`, `admin_revoke_session_v1` and the existing sign-out-all flow
- the portal exposes no remove/disable/rebind command

The roadmap rule that the last Owner cannot be removed is satisfied structurally: `admin_identity` is a singleton and `admin_private.protect_admin_identity_v1` rejects DELETE, `enabled=false` and `auth_user_id` rebinding.

`admin_private.saved_filter_actor_is_staff_v1` aliases the existing Admin identity check. There is still only one staff actor.

Current operating model has one Admin account; no backup staff account exists.

## Fresh authority

Sensitive Admin operations require the current Admin session to have been created within the previous five minutes. Otherwise the command returns `reauth_required`. Fresh email OTP remains reauthentication. There is no second authentication mechanism.

Fresh auth is required for approving or retiring settings, retention policies, communication templates and Guard check schedules; creating or releasing a legal hold; verifying privacy identity manually; reviewing a privacy disposition; generating a privacy export; completing privacy deletion/disposition; and executing eligible deletion. Approval may start at the current instant (a two-minute clock-skew allowance) but cannot start in the past.

## Versioned settings

`public.admin_setting_versions` stores bounded keys only:

- `SERVICE_HOURS`
- `RESPONSE_TARGETS`
- `ALERT_ESCALATION`
- `SUPPORTED_MARKETS`

Lifecycle: `DRAFT` → `APPROVED` → `RETIRED`.

- insert must start as draft `record_version = 1`
- approved facts (payload, key, version, `effective_from`) are immutable
- approved versions cannot return to DRAFT
- current lookup is `[effective_from, effective_to)`
- at most one applicable approved range per key
- no approved production seeds are created
- the UI shows `Not configured` when no approved version exists

Service hours are Europe/London structured weekly windows with explicit weekend and bank-holiday policy. Bank holidays cannot be excluded without configured dates. DST uses timezone conversion, not a fixed UTC offset. Response targets are separate from Guard monitoring windows and require an approved service-hours version. No two-hour response promise is invented.

`public.service_response_obligations` snapshots due dates only for work created after an approved policy is effective. Changing a later policy does not rewrite an existing obligation. If no approved policy exists, no obligation is created. Step 19 raw first-response reporting is unchanged.

## Guard schedule and rota

Settings reuses `public.guard_check_schedule_versions` and `public.guard_rota_assignments`. No parallel schedule or rota authority is created. No production clock windows are seeded. Approval is not retroactive and must not manufacture past obligations. Existing Step 17 obligations stay pinned to their schedule snapshot.

Rota assignment always binds to the current Admin identity. A different assignee is rejected. No Guard activation, checks, alerts or jobs are enabled by this step.

## Communication templates

Existing `admin_private.communication_templates` rows are migrated as:

- `status = APPROVED`
- `approval_source = MIGRATED_EXISTING`
- historical `created_at` retained
- `approved_by` may be NULL only for these pre-Step 20 templates

New approvals must set `approval_source = ADMIN` and `approved_by` to the active Admin. Approved content is immutable. Draft and retired versions are never selected for new drafts, even if their version number is higher. If no APPROVED template exists, send paths fail closed. Step 11 delivery remains disabled. Historical communications stay pinned to `template_key`, `template_version` and snapshotted rendered content.

## Retention, legal holds and privacy

`public.retention_policy_versions` is per category:

- `UNSUCCESSFUL_ENQUIRIES`
- `CASE_EVIDENCE`
- `FINANCIAL_RECORDS`
- `CONSENT_RECORDS`
- `SECURITY_LOGS`

Modes: `RETAIN_FOR_PERIOD`, `RETAIN_INDEFINITELY`, `MANUAL_REVIEW`. NULL is not an approved decision. The UI shows `Retention policy not approved` until an Owner approves a version. No deletion automation may operate without a current APPROVED policy.

`public.legal_holds` are immutable-history `ACTIVE` / `RELEASED` records with a real customer, business, case or category scope. An active hold is a hard `deletion_blocked` condition in the database, not only a UI warning. Released holds remain as history.

`public.privacy_requests` and `public.privacy_request_dispositions` track ACCESS / EXPORT / CORRECTION / DELETION through a strict transition matrix. Identity must be `VERIFIED_CONTACT` or `VERIFIED_MANUAL` before export or deletion. Manual verification requires fresh auth and a meaningful evidence note. A phone conversation alone is not enough.

Deletion preview separates eligible, retained, hold-blocked, no-policy-blocked, external-storage and manual-review records. Financial, audit and consent history are not hidden. There is no generic cascade delete.

Physical deletion is application-gated by server-only `PRIVACY_DELETION_ENABLED` exactly `"true"`. Default/unset is disabled. Previews and review still work. The only automated candidate, when the gate is later enabled, is an unsuccessful enquiry that is not converted, has no case or monitoring request, has elapsed approved retention, has no applicable hold, and belongs to a verified deletion request. Case evidence requiring S3 delete remains `BLOCKED_EXTERNAL_DELETION`. Execution re-checks all conditions and is idempotent. Audit stores request id, category, action, count and outcome — never deleted content or full PII.

Exports use an allowlist, Step 19 CSV formula neutralisation, `Cache-Control: no-store`, and metadata-only receipts. They are not emailed.

## Complaints and incidents

`public.complaints` is an independent durable work item. It may reference a customer, case or enquiry but does not disappear when a case closes. States: OPEN → ACKNOWLEDGED / RESOLVED / CANCELLED. Terminal rows are immutable. No automatic refund, credit, payment cancellation or case outcome change.

`public.operational_incidents` records WORKER_OUTAGE, PROVIDER_FAILURE, MONITORING_GAP, EMAIL, BILLING, SECURITY, PRIVACY or OTHER. There is no invented incident SLA. Resolution does not restart providers, enable Guard, send customer email, refund money or fabricate missed checks.

## System configuration

Settings shows safe Enabled/Disabled/Configured/Not configured labels only. It does not display environment-variable values, secrets, API keys or webhook material, and it cannot toggle live gates. Google remains Not configured. Step 21 is out of scope.

## Access

New public tables are RLS-protected with direct CRUD revoked from PUBLIC, anon, authenticated and service_role. Public RPCs are `SECURITY DEFINER`, `search_path=''`, and `GRANT EXECUTE` to `service_role` only.
