# Admin data model — evidence workspace

This documents the Step 8A evidence tables, the Step 8B additive workspace migration and the Step 8C prepared-pack migration. It does not replace earlier intake, enquiry or workflow models.

Evidence migration filenames match the versions recorded on `profilerelaunch-dev`: `20260918143424` (8A), `20260918153627` (8B), `20260918163150` (8C). Step 8 is complete with live acceptance on 18 September 2026.

Step 9A adds `agreement_versions`, `authorization_records`, `customer_actions`, `location_manager_access` and private action session/challenge/receipt tables. See customer-actions.md. The 9A migration filename matches the version recorded on `profilerelaunch-dev`: `20260928094817`.

Step 9B1 adds `CASE_ACCESS` on `customer_actions`, pack publication columns on `case_prepared_packs`, `PACK_PUBLISHED` / `PACK_UNPUBLISHED` events, and customer pack RPCs. It is LIVE-TESTED COMPLETE. The applied migration is `20260928175738_customer_case_pack_access_v1.sql`.

Step 9B2 adds customer-upload provenance on `case_document_versions` (`submission_source`, `customer_action_id`, `customer_evidence_request_id`), `admin_private.customer_evidence_upload_receipts`, a customer-safe OPEN evidence-request projection on `customer_case_pack_v1`, and service-role RPCs `customer_evidence_begin_v1`, `customer_evidence_upload_version_v1` and `customer_evidence_finalize_v1`. The applied additive migration is `20260929150057_customer_evidence_upload_v1.sql`. Step 9 is LIVE-TESTED COMPLETE.

Step 10 adds `admin_private.job_outbox`, `admin_private.jobs`, `admin_private.job_attempts`, `admin_private.job_worker_heartbeats` and `admin_private.job_command_receipts`, plus service-role promote/claim/complete/fail/heartbeat RPCs and Admin probe/replay/health RPCs. Jobs constrain `attempts <= max_attempts`. Heartbeats store `expected_interval_seconds` and `late_after_seconds` so Admin HEALTHY/LATE uses the worker cadence, not a 10-minute window. The applied migration is `20260929183214_jobs_outbox_operational_health_v1.sql`. Step 10 is COMPLETE / LIVE-TESTED.

Step 11 adds reviewed outbound columns on `public.communications` without rewriting legacy `SENT` as delivered, plus `admin_private.communication_templates`, `communication_delivery_events`, `communication_webhook_events`, `email_suppressions` and `communication_command_receipts`. Delivery includes `ACCEPTANCE_UNKNOWN`, `TRANSIENT_BOUNCE` and `UNDETERMINED_BOUNCE`. Communications snapshot `sender_address` and `link_key_version`. Webhook rows store `provider_occurred_at` and a bounded `bounce_class`. Step 11 communications uniquely index `(provider, provider_message_id)` when both are present. Job/outbox types gain `SEND_EMAIL`. Dedicated `COMMUNICATION_ACCESS` customer actions pin `evidence_request_id` and hold only a SHA-256 capability hash plus the non-secret link-key version. The applied additive migration is `20260929210000_communications_outgoing_mail_v1.sql`. Live delivery remains disabled.

Step 12 adds `public.conversations`, immutable `conversation_messages`, quarantined `conversation_attachments`, inbound receipts, `IMPORT_INBOUND_EMAIL` and `IMPORT_INBOUND_ATTACHMENT`. Attachment rows track `ingestion_status` (`METADATA_RECORDED` / `STORAGE_PENDING` / `STORED` / `CLEAN` / `MALWARE` / `UNSUPPORTED` / `FAILED`) and cannot become `CLEAN` without private storage identity, a clean GuardDuty result and byte validation. Attachment outbox keys stay within the existing Step 10 200-character contract. Receipts store `sender_display` and `provider_occurred_at`. Additive outbound threading columns are `conversation_id`, `reply_to_address`, `in_reply_to`, `references_header` and set-once `rfc_message_id`. The applied additive migration is `20260929221604_incoming_mail_conversations_v1.sql`. DATABASE APPLIED / LIVE INBOUND DISABLED.

Step 13 adds `public.price_versions`, `public.quotes`, immutable `public.quote_versions`, immutable `public.quote_discount_snapshots`, immutable `public.quote_acceptances` and `public.service_orders`. Customer actions gain `QUOTE_ACCEPTANCE` pinned to `quote_version_id`. Approving a future price version schedules the current predecessor `effective_to` to the successor `effective_from` without overlap or gap. New Admin drafts may be approved only when `effective_from` is still in the future. Quotes must use the exact current price; discount snapshots are pinned to that price version. Amounts are integer GBP pence. Seeded prices match `lib/pricing.ts` and remain tax-behaviour `UNCONFIRMED`. The additive migration `20260929233953_catalogue_quotes_orders_v1.sql` is applied to `profilerelaunch-dev` as `20260929233953 catalogue_quotes_orders_v1`. DATABASE APPLIED / LIVE COMMERCIAL DISABLED. See catalogue-quotes-orders.md.

Step 14 adds payment tables and RPCs in `20260930132106_stripe_payments_v1.sql`, applied to `profilerelaunch-dev` exactly once after Step 13 as `20260930132106 stripe_payments_v1`: `stripe_customer_maps`, immutable `payment_consents`, `saved_payment_methods`, `success_fee_approvals`, `payment_obligations`, `provider_operations`, `payment_attempts`, `payment_invoices`, `payment_receipts`, append-only `payment_ledger`, and private `stripe_event_receipts` / `payment_command_receipts`. Customer actions gain `GUIDED_PAYMENT`, `MANAGED_PAYMENT_SETUP`, `PAYMENT_RECOVERY` and `INVOICE_PAYMENT` pinned to `service_order_id` / `payment_obligation_id`. Job types `COLLECT_PAYMENT` and `PROCESS_STRIPE_EVENT` reuse the Step 10 outbox. DATABASE APPLIED / STRIPE DISABLED / NO MONEY MOVED. See stripe-payments.md.

Step 15 adds Guard onboarding/activation tables in applied `20260930164529_guard_onboarding_activation_v1.sql` (`20260930164529 guard_onboarding_activation_v1` exactly once after Step 14): `guard_onboarding_locations`, `guard_coverages`, append-only `guard_coverage_events`, `guard_billing`, `guard_included_offers`, `guard_permissions`, immutable `guard_baselines`, `guard_rota_assignments`, `guard_activation_exceptions`, and private `guard_command_receipts`. Customer actions gain `GUARD_PERMISSION` pinned to `guard_coverage_id` / optional `guard_included_offer_id`. `monitoring_requests` remain intake history. DATABASE APPLIED / LIVE GUARD DISABLED. See guard-onboarding.md.

Step 16 adds applied `20260930180050_guard_subscriptions_billing_v1.sql` after Step 15 (`20260930180050 guard_subscriptions_billing_v1` exactly once): `guard_provider_price_maps`, `guard_continuations`, `guard_subscriptions`, append-only `guard_subscription_events`, `guard_recurring_consents`, `guard_subscription_invoices`, `guard_price_change_offers`, `guard_billing_adjustments`, `guard_refunds`, `guard_disputes`, `guard_reminder_policies`, `guard_reminder_records`, `guard_reconciliation_runs`, `guard_reconciliation_targets`, `guard_reconciliation_issues`, and private `guard_subscription_receipts`. Customer actions gain `GUARD_SUBSCRIPTION_START` and `GUARD_PRICE_CHANGE_ACCEPTANCE`. Coverage origin gains `INCLUDED_CONTINUATION`. Job type `RECONCILE_GUARD_BILLING` reuses the Step 10 outbox. DATABASE APPLIED / STRIPE & GUARD LIVE DISABLED. See guard-subscriptions-billing.md.

Step 17 adds applied `20260930203750_guard_manual_checks_v1.sql` after Step 16 (`20260930203750 guard_manual_checks_v1` exactly once): versioned `guard_check_schedule_versions`, `guard_check_obligations`, append-only `guard_check_obligation_events`, `guard_check_attempts`, immutable `guard_check_observations`, and private `guard_check_receipts`. Job type `MAINTAIN_GUARD_CHECKS` reuses the Step 10 outbox. DATABASE APPLIED / LIVE MONITORING DISABLED. See guard-manual-checks.md.

Step 18 adds applied `20260930222821_guard_alerts_escalation_v1.sql` after Step 17 (`20260930222821 guard_alerts_escalation_v1` exactly once): `guard_alerts`, append-only `guard_alert_observations` / `guard_alert_events`, `guard_alert_cases`, `guard_alert_notifications`, `guard_service_actions`, and private `guard_alert_receipts`. Communications gain nullable `guard_alert_id` and a three-way parent XOR. Template `GUARD_ALERT` v1 is additive. Job type `MAINTAIN_GUARD_ALERTS` reuses the Step 10 outbox. DATABASE APPLIED / LIVE ALERTS & NOTIFICATIONS DISABLED. See guard-alerts-escalation.md.

Step 19 adds applied `20261001092213_admin_dashboard_search_reports_v1.sql` (`20261001092213 admin_dashboard_search_reports_v1` exactly once after Step 18): `public.admin_saved_filters`, private `report_export_receipts` / `report_command_receipts`, audit action `REPORT_CHANGED`, and service-role RPCs `admin_dashboard_today_v1`, `admin_report_summary_v1`, `admin_report_detail_v1`, `admin_global_search_v1`, `admin_saved_filter_list_v1`, `admin_saved_filter_command_v1`, `admin_report_export_v1`, `admin_customer_preview_v1`. Reporting reuses existing authorities through `admin_private.report_rows_v1`. DATABASE APPLIED. See dashboard-search-reports.md.

Step 20 applies `20261001141218_admin_settings_privacy_operations_v1.sql` to `profilerelaunch-dev` exactly once: versioned `public.admin_setting_versions` (`SERVICE_HOURS`, `RESPONSE_TARGETS`, `ALERT_ESCALATION`, `SUPPORTED_MARKETS`), `public.service_response_obligations`, `public.retention_policy_versions`, scoped `public.legal_holds`, `public.privacy_requests` + `public.privacy_request_dispositions`, independent `public.complaints`, richer `public.operational_incidents`, template lifecycle columns on existing `admin_private.communication_templates` (migrated APPROVED/`MIGRATED_EXISTING`), identity-protect trigger, and service-role RPCs `admin_settings_overview_v1`, `admin_settings_list_v1`, `admin_retention_list_v1`, `admin_template_list_v1`, `admin_complaint_list_v1`, `admin_privacy_list_v1`, `admin_incident_list_v1`, `admin_settings_command_v1`, `admin_privacy_export_v1`. Audit actions gain `SETTINGS_CHANGED`, `TEMPLATE_CHANGED`, `PRIVACY_CHANGED`, `COMPLAINT_CHANGED`, `INCIDENT_CHANGED`. No approved service/retention/schedule seeds. DATABASE APPLIED / DESTRUCTIVE PRIVACY ACTIONS DISABLED. See settings-privacy-operations.md.

## Relationships

```
public.cases
  └── public.evidence_requests (optional staff request for a case)
  └── public.case_documents
        ├── optional evidence_requests
        └── public.case_document_versions (unique document_id + version_number)
              └── storage_key unique, opaque S3 object
  └── public.case_prepared_packs (unique case_id + pack_number; at most one DRAFT and one APPROVED)
        └── public.case_prepared_pack_items (unique pack + version, unique pack + position)
  └── public.agreement_versions (immutable snapshots)
  └── public.authorization_records (ACTIVE / REVIEW_REQUIRED / REVOKED)
  └── public.customer_actions (OPEN / COMPLETED / DECLINED / REVOKED; kinds AGREEMENT_ACCEPTANCE / AUTHORIZATION_REVOCATION / CASE_ACCESS / COMMUNICATION_ACCESS / QUOTE_ACCEPTANCE / GUIDED_PAYMENT / MANAGED_PAYMENT_SETUP / PAYMENT_RECOVERY / INVOICE_PAYMENT / GUARD_PERMISSION / GUARD_SUBSCRIPTION_START / GUARD_PRICE_CHANGE_ACCEPTANCE; secret_hash only; COMMUNICATION_ACCESS also stores immutable evidence_request_id + link_key_version; QUOTE_ACCEPTANCE pins immutable quote_version_id; payment kinds pin service_order_id / payment_obligation_id; GUARD_PERMISSION pins guard_coverage_id and optional guard_included_offer_id; GUARD_SUBSCRIPTION_START pins location/order/coverage or continuation; GUARD_PRICE_CHANGE_ACCEPTANCE pins guard_subscription_id and offer; expired OPEN CASE_ACCESS, COMMUNICATION_ACCESS, QUOTE_ACCEPTANCE, payment and Guard permission actions are terminalised on reissue; CLOSED/CANCELLED revokes CASE_ACCESS and COMMUNICATION_ACCESS)
public.price_versions
public.quotes → public.quote_versions → public.quote_discount_snapshots
public.quote_acceptances → public.service_orders
public.stripe_customer_maps
public.payment_consents → public.saved_payment_methods
public.success_fee_approvals → public.payment_obligations → public.payment_attempts → public.payment_receipts
public.provider_operations
public.payment_invoices
public.payment_ledger
admin_private.stripe_event_receipts
admin_private.payment_command_receipts
public.guard_onboarding_locations
public.guard_coverages → public.guard_coverage_events
public.guard_billing
public.guard_included_offers
public.guard_permissions
public.guard_baselines
public.guard_rota_assignments
public.guard_activation_exceptions
admin_private.guard_command_receipts
public.guard_provider_price_maps
public.guard_continuations
public.guard_subscriptions → public.guard_subscription_events
public.guard_recurring_consents
public.guard_subscription_invoices
public.guard_price_change_offers
public.guard_billing_adjustments → public.guard_refunds
public.guard_disputes
public.guard_reminder_policies → public.guard_reminder_records
public.guard_reconciliation_runs → public.guard_reconciliation_issues
admin_private.guard_subscription_receipts
admin_private.catalogue_command_receipts
admin_private.quote_command_receipts
public.admin_saved_filters
admin_private.report_export_receipts
admin_private.report_command_receipts
public.admin_settings_versions
admin_private.communication_template_drafts
admin_private.settings_command_receipts
public.legal_holds
public.privacy_requests
public.operational_incidents
  └── public.case_prepared_packs publication axis (published_at / unpublished_at; not a pack status)
  └── public.location_manager_access (VERIFIED / REVOKED; Admin-verified)
public.case_document_events  (append-only lifecycle)
public.case_prepared_pack_events  (append-only pack lifecycle)
admin_private.evidence_command_receipts
admin_private.pack_command_receipts
admin_private.customer_evidence_upload_receipts
admin_private.customer_pack_access_receipts
admin_private.job_outbox → admin_private.jobs → admin_private.job_attempts
admin_private.job_worker_heartbeats
admin_private.job_command_receipts
public.communications (legacy PENDING/SENT/FAILED plus optional lifecycle/delivery snapshots)
admin_private.communication_templates
admin_private.communication_delivery_events
admin_private.communication_webhook_events
admin_private.email_suppressions
admin_private.communication_command_receipts
```

Foreign keys to `cases` and `evidence_requests` use `ON DELETE RESTRICT`. Versions never overwrite a previous `storage_key`. At most one version per document may have `customer_visible = true`.

## public.evidence_requests

Staff request for evidence against a case. Step 8B exposes create / fulfill / cancel in Admin. No email is sent.

| Column | Notes |
| --- | --- |
| id | UUID PK |
| case_id | FK `cases` |
| title, request_text | Length-checked |
| status | `OPEN`, `FULFILLED`, `CANCELLED` |
| due_at | nullable |
| created_by, created_at, fulfilled_at | actor from the live Admin session |
| record_version | bumped on update |

## public.case_documents

Logical document. Replacement files add versions, they do not replace this row.

| Column | Notes |
| --- | --- |
| id | UUID PK; used in the S3 key |
| case_id | FK `cases` |
| evidence_request_id | nullable FK |
| title | Length-checked |
| created_by, created_at, updated_at, record_version | |

## public.case_document_versions

One immutable storage object per version.

| Column | Notes |
| --- | --- |
| id | UUID PK; used in the S3 key |
| document_id | FK documents |
| version_number | > 0, unique per document |
| original_filename | Stored as metadata only; never used in the S3 key |
| declared_content_type / declared_size_bytes | Allowlisted MIME; 1..10485760 |
| storage_provider | Fixed `S3` |
| storage_bucket, storage_key | Bucket from server config; unique opaque key. **Not** returned by browser-facing case/queue queries |
| upload_status | `PENDING_UPLOAD`, `UPLOADED`, `FAILED` |
| scan_status | GuardDuty mapping |
| scan_checked_at | nullable |
| validation_status / validation_error | Signature result after a clean scan |
| review_status / review_note / reviewed_by / reviewed_at | Set by Step 8B review commands |
| customer_visible | `NOT NULL DEFAULT false`; explicit `set_visibility` only |
| submission_source | `ADMIN` or `CUSTOMER`; existing rows default to `ADMIN` |
| customer_action_id | NULL for Admin uploads; CASE_ACCESS action for customer uploads |
| customer_evidence_request_id | NULL for Admin uploads; the OPEN request the customer answered |
| record_version | Optimistic concurrency; bumped on every update |
| created_by, created_at, uploaded_at, validated_at | |

Checks: `VALID` only if `NO_THREATS_FOUND`; `customer_visible` only if clean + valid + `ACCEPTED`. Partial unique index: one visible version per `document_id`. At most one active `CUSTOMER` version per evidence request (`PENDING_UPLOAD` or `UPLOADED`). Historical `FAILED` customer attempts do not occupy that slot. Customer provenance columns are server-controlled and never accepted from the browser.

There is no content hash column. `declared_size_bytes` and `declared_content_type` are the only object attributes the database can compare against storage, so after a restore a reconciliation match proves structure rather than bytes. Adding a checksum is a Step 22B prerequisite for proving byte-level evidence integrity. See database-restore-runbook.md.

## public.case_document_events

Append-only. Events: `UPLOAD_BEGUN`, `UPLOAD_FINALIZED`, `UPLOAD_FAILED`, `SCAN_REFRESHED`, `REVIEW_ACCEPTED`, `REVIEW_REJECTED`, `VERSION_SUPERSEDED`, `VISIBILITY_CHANGED`, `ACCESS_VIEWED`, `ACCESS_DOWNLOADED`. Details are bounded JSON without file bytes, OTPs, AWS tokens, presigned URLs or secrets. Covering index on `version_id`.

## admin_private.evidence_command_receipts

Follows the existing Admin private receipt pattern: `request_id`, `actor_id`, `fingerprint`, `response`. Matching retries return the stored response; a changed fingerprint conflicts.

## Privileged RPCs

All `SECURITY DEFINER` with empty `search_path`, executable by `service_role` only, and they validate `admin_session_v1` internally. Actor identity is never client-supplied.

Step 8A:

- `admin_evidence_begin_v1`
- `admin_evidence_finalize_v1`
- `admin_evidence_refresh_scan_v1`
- `admin_evidence_version_v1` (server-only scoped metadata including storage coordinates; missing/wrong-case IDs return `{ missing: true }` with no extra fields)

Step 8B:

- `admin_evidence_case_v1` — UI-safe case evidence graph (no bucket/key/URLs)
- `admin_evidence_queue_v1` — bounded global queue
- `admin_evidence_request_v1` — create / fulfill / cancel
- `admin_evidence_review_v1` — accept / reject / set_visibility
- `admin_evidence_access_v1` — records view/download; does not return a URL

`admin_audit_list_v1` accepts `EVIDENCE_CHANGED` and `AUTHORIZATION_CHANGED` alongside existing Admin actions.

## Step 9A agreements, actions and Manager access

Immutable `agreement_versions` snapshots (`content_hash` is SHA-256 / 64 lowercase hex), current `authorization_records` (`ACTIVE` / `REVIEW_REQUIRED` / `REVOKED`) with an immutable accepted scope including `location_id`, `customer_actions` with `secret_hash` only, Admin-verified `location_manager_access`, append-only events with `actor_type`, and private `customer_action_sessions` / `customer_action_challenges` / command receipts. See customer-actions.md. The 9A migration filename matches `profilerelaunch-dev` version `20260928094817`.

Privileged RPCs:

- `admin_case_authorization_v1` / `admin_case_authorization_readiness_v1`
- `admin_authorization_command_v1` — create agreement action, revoke open action, issue customer revocation action, Admin emergency revoke, create case-access action
- `admin_manager_access_command_v1` — verify / revoke
- `customer_action_exchange_v1`, `customer_action_begin_otp_v1`, `customer_action_confirm_otp_sent_v1`, `customer_action_attempt_otp_v1`, `customer_action_finish_otp_v1`, `customer_action_session_v1`, `customer_action_command_v1`
- `customer_case_pack_v1` — customer-safe published pack plus OPEN evidence-request projection (no storage coordinates)
- `customer_case_pack_version_v1` — server-only published-pack version including storage coordinates
- `customer_case_pack_access_v1` — records customer View/Download; does not return a URL
- `customer_evidence_begin_v1` — request-scoped customer upload begin; service_role only
- `customer_evidence_upload_version_v1` — server-only customer upload version lookup
- `customer_evidence_finalize_v1` — `PENDING_UPLOAD` → `UPLOADED` only; request stays OPEN

## public.case_prepared_packs

Immutable-after-approval manifest for a case. Status: `DRAFT`, `APPROVED`, `STALE`, `SUPERSEDED`. Publication is separate: `published_at`, `published_by`, `publication_note`, `unpublished_at`, `unpublished_by`, `unpublished_reason`. Currently published means `published_at IS NOT NULL AND unpublished_at IS NULL` and status remains `APPROVED`. `UNIQUE (case_id, pack_number)`. Partial unique indexes: at most one `DRAFT`, one `APPROVED`, and one currently published pack per case. Optimistic `record_version`. Approval note 10–2000 characters when `APPROVED`. Historical `STALE` / `SUPERSEDED` packs do not occupy those slots.

## public.case_prepared_pack_items

Exact version membership. Snapshot columns (`document_title`, `original_filename`, `content_type`, `size_bytes`) are filled by a BEFORE trigger from the document/version row. Never stores bucket, key, URL, OIDC token or credentials. Insert/update/delete allowed only while the pack is `DRAFT` and the version is uploaded, clean, valid and `ACCEPTED`.

## public.case_prepared_pack_events

Append-only. Events: `PACK_CREATED`, `ITEM_ADDED`, `ITEM_REMOVED`, `ITEM_MOVED`, `PACK_APPROVED`, `PACK_STALE`, `PACK_SUPERSEDED`, `PACK_PUBLISHED`, `PACK_UNPUBLISHED`. Details are bounded JSON without file bytes, storage coordinates, tokens or URLs.

Step 8C / 9B1 RPCs:

- `admin_prepared_pack_command_v1` — create / add_item / remove_item / move_item / approve / publish / unpublish
- `admin_prepared_pack_case_v1` — UI-safe packs (latest 20) plus eligible accepted versions; no bucket/key/URLs

An AFTER UPDATE trigger on version upload/scan/validation/review marks affected `APPROVED` packs `STALE` when included evidence is no longer eligible. The pack is not rebuilt.

RLS is enabled with no direct policies on evidence or pack tables. That is intentional: browser/table access is denied and service access is through these RPCs. Do not add broad policies only to silence the advisor. The Step 8B migration adds the `version_id` covering index requested by the performance advisor. Step 8C did not add a new warning-level advisor finding attributable to prepared packs.

# Google Business Profile integration readiness (Step 21)

These three tables are deployed to `profilerelaunch-dev` through the applied migration
`supabase/migrations/20261001175315_google_integration_readiness_v1.sql`. Live verification
found zero OAuth-state, provider-connection and provider-event rows immediately after
application. Google OAuth/API execution remains disabled in code. See google-integration-readiness.md.

## public.provider_oauth_states

One row per connect attempt. Stores the SHA-256 hash of the OAuth state, never the state
itself, so a reader of this table cannot replay an authorization. Bound to `actor_id` and to
`session_binding`, a one-way hash of the initiating session. `redirect_uri` must be
`https://`. `expires_at` must be after `created_at` and the begin function caps the window
at one hour. Single use is enforced by `consumed_at`, paired with an `outcome` of
`ACCEPTED`, `REJECTED` or `CANCELLED` and a `rejection_reason` constrained to a fixed
vocabulary, so no browser or provider text can be stored. A trigger refuses to rewrite a
consumed row, refuses to change the state hash, actor, session binding, redirect URI,
expiry or creation time, and refuses to delete a state that is still live.

`customer_id` is `NOT NULL` and a `location_id` requires a `business_id`.
`admin_private.provider_scope_fault_v1` additionally proves that any business has a
`verified` row in `business_memberships` for that customer and that any location has that
business as its `locations.business_id`, so an attempt cannot be aimed across customers.

## public.provider_connections

One stored authorization. Holds `token_ciphertext`, `token_iv`, `token_auth_tag` and
`encryption_key_version` for an AES-256-GCM payload encrypted in the server process. The
encryption key is never stored here. No plaintext token is stored, and a CHECK constraint
rejects a ciphertext that still looks like an OAuth token (`ya29.%` or `1//%`). Also holds
`granted_scopes`, `token_expires_at`, `status` (`CONNECTED`, `REVOKED`, `EXPIRED`,
`AUTH_REQUIRED`), `connected_at`, `revoked_at`, `last_success_at`, `last_error_code`
constrained to the ten normalised failure codes, `last_error_at` and optimistic
`record_version`. A partial unique index allows one non-revoked connection per provider and
target. It carries the same scope rules as the state table: `customer_id` is `NOT NULL`, a
location requires a business, and `provider_scope_fault_v1` re-proves the chain before a
token is stored.

A trigger makes the connection identity write-once — `customer_id`, `business_id`,
`location_id`, `account_ref`, `granted_scopes`, `token_expires_at`, ciphertext, IV, auth
tag, key version, `connected_at` and `created_by` — leaving only `status`, `revoked_at`,
the last normalised error and `record_version` mutable. It refuses to reopen a revoked
connection, requires a version increment on update, and forbids DELETE. `granted_scopes`
and `token_expires_at` are immutable rather than lifecycle metadata because this build has
no token exchange; a controlled refresh operation arrives with live activation.

## public.provider_connection_events

Append-only lifecycle history: `CONNECTION_INITIATED`, `CALLBACK_REJECTED`,
`CONNECTION_ESTABLISHED`, `AUTHORIZATION_REVOKED`, `REAUTHORIZATION_REQUIRED`,
`PROVIDER_FALLBACK_ACTIVATED`, `CONNECTION_DISCONNECTED`. `detail` is constrained by CHECK
to a fixed vocabulary of lifecycle classifications, terminal callback reasons and the ten
normalised failure codes, so a code, token, browser reason or provider body cannot be
written even by a caller that bypassed the functions. A trigger blocks UPDATE and DELETE
outright.

Step 21 RPCs:

- `admin_integration_status_v1` — Admin-safe connection projection, live connection count,
  pending connect count, last success and the twenty most recent events
- `admin_integration_command_v1` — `begin_connect`, `consume_state`, `cancel_connect`,
  `store_connection`, `revoke_connection`, `disconnect_connection`, `record_fault`

`admin_private.provider_connection_public_json_v1` is the only projection used by those
RPCs and deliberately omits ciphertext, IV, auth tag and key version, so no response can
return token material. Both public RPCs require a fresh re-authentication, audit as
`INTEGRATION_CHANGED` with only the operation, provider and a rejection reason drawn from
the fixed vocabulary in the details, and map integration statuses onto the existing audit
outcome vocabulary rather than widening it. An unrecognised reason is dropped rather than
audited. The migration's only change to an existing object is adding `INTEGRATION_CHANGED`
to the audit action check.

`provider_oauth_consume_v1` is the single terminal operation for an attempt. It takes an
optional reason from the four-value terminal set and refuses anything else with
`reason_not_normalised`. Actor, session binding and exact redirect are verified before any
terminal mutation, and that binding is authoritative regardless of what the callback
carried: a caller that fails it gets `context_mismatch` or `redirect_mismatch` and sets no
`consumed_at`, no outcome, no rejection reason and no event, so one session can neither
consume nor cancel another's attempt and the rightful session can still finish it. Expiry
is evaluated only after binding passes. `provider_oauth_cancel_v1` is a thin wrapper over
it carrying `cancelled_by_admin`.

RLS is enabled on all three tables with no direct policies and all CRUD revoked from
`PUBLIC`, `anon`, `authenticated` and `service_role`. The public RPCs are granted to
`service_role` only.

`guard_check_observations.capture_method` is unchanged and still accepts only `MANUAL`, so
no provider-sourced observation can be persisted by this step.
