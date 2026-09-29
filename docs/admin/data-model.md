# Admin data model — evidence workspace

This documents the Step 8A evidence tables, the Step 8B additive workspace migration and the Step 8C prepared-pack migration. It does not replace earlier intake, enquiry or workflow models.

Evidence migration filenames match the versions recorded on `profilerelaunch-dev`: `20260918143424` (8A), `20260918153627` (8B), `20260918163150` (8C). Step 8 is complete with live acceptance on 18 September 2026.

Step 9A adds `agreement_versions`, `authorization_records`, `customer_actions`, `location_manager_access` and private action session/challenge/receipt tables. See customer-actions.md. The 9A migration filename matches the version recorded on `profilerelaunch-dev`: `20260928094817`.

Step 9B1 adds `CASE_ACCESS` on `customer_actions`, pack publication columns on `case_prepared_packs`, `PACK_PUBLISHED` / `PACK_UNPUBLISHED` events, and customer pack RPCs. It is LIVE-TESTED COMPLETE. The applied migration is `20260928175738_customer_case_pack_access_v1.sql`.

Step 9B2 adds customer-upload provenance on `case_document_versions` (`submission_source`, `customer_action_id`, `customer_evidence_request_id`), `admin_private.customer_evidence_upload_receipts`, a customer-safe OPEN evidence-request projection on `customer_case_pack_v1`, and service-role RPCs `customer_evidence_begin_v1`, `customer_evidence_upload_version_v1` and `customer_evidence_finalize_v1`. The applied additive migration is `20260929150057_customer_evidence_upload_v1.sql`. Step 9 is LIVE-TESTED COMPLETE.

Step 10 adds `admin_private.job_outbox`, `admin_private.jobs`, `admin_private.job_attempts`, `admin_private.job_worker_heartbeats` and `admin_private.job_command_receipts`, plus service-role promote/claim/complete/fail/heartbeat RPCs and Admin probe/replay/health RPCs. Jobs constrain `attempts <= max_attempts`. Heartbeats store `expected_interval_seconds` and `late_after_seconds` so Admin HEALTHY/LATE uses the worker cadence, not a 10-minute window. The applied migration is `20260929183214_jobs_outbox_operational_health_v1.sql`. Step 10 is COMPLETE / LIVE-TESTED.

Step 11 adds reviewed outbound columns on `public.communications` without rewriting legacy `SENT` as delivered, plus `admin_private.communication_templates`, `communication_delivery_events`, `communication_webhook_events`, `email_suppressions` and `communication_command_receipts`. Delivery includes `ACCEPTANCE_UNKNOWN`, `TRANSIENT_BOUNCE` and `UNDETERMINED_BOUNCE`. Communications snapshot `sender_address` and `link_key_version`. Webhook rows store `provider_occurred_at` and a bounded `bounce_class`. Step 11 communications uniquely index `(provider, provider_message_id)` when both are present. Job/outbox types gain `SEND_EMAIL`. Dedicated `COMMUNICATION_ACCESS` customer actions pin `evidence_request_id` and hold only a SHA-256 capability hash plus the non-secret link-key version. The applied additive migration is `20260929210000_communications_outgoing_mail_v1.sql`. Live delivery remains disabled.

Step 12 adds `public.conversations`, immutable `conversation_messages`, quarantined `conversation_attachments`, inbound receipts, `IMPORT_INBOUND_EMAIL` and `IMPORT_INBOUND_ATTACHMENT`. Attachment rows track `ingestion_status` (`METADATA_RECORDED` / `STORAGE_PENDING` / `STORED` / `CLEAN` / `MALWARE` / `UNSUPPORTED` / `FAILED`) and cannot become `CLEAN` without private storage identity, a clean GuardDuty result and byte validation. Receipts store `sender_display` and `provider_occurred_at`. Additive outbound threading columns are `conversation_id`, `reply_to_address`, `in_reply_to`, `references_header` and set-once `rfc_message_id`. The local migration is `20260929221604_incoming_mail_conversations_v1.sql`. It is not remotely applied.

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
  └── public.customer_actions (OPEN / COMPLETED / DECLINED / REVOKED; kinds AGREEMENT_ACCEPTANCE / AUTHORIZATION_REVOCATION / CASE_ACCESS / COMMUNICATION_ACCESS; secret_hash only; COMMUNICATION_ACCESS also stores immutable evidence_request_id + link_key_version; expired OPEN CASE_ACCESS and COMMUNICATION_ACCESS are terminalised on reissue; CLOSED/CANCELLED revokes CASE_ACCESS and COMMUNICATION_ACCESS)
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
