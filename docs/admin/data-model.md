# Admin data model — evidence workspace

This documents the Step 8A evidence tables, the Step 8B additive workspace migration and the Step 8C prepared-pack migration. It does not replace earlier intake, enquiry or workflow models.

Evidence migration filenames match the versions recorded on `profilerelaunch-dev`: `20260918143424` (8A), `20260918153627` (8B), `20260918163150` (8C). Step 8 is complete with live acceptance on 18 September 2026.

Step 9A adds `agreement_versions`, `authorization_records`, `customer_actions`, `location_manager_access` and private action session/challenge/receipt tables. See customer-actions.md. The 9A migration is source-only until applied after review.

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
  └── public.customer_actions (OPEN / COMPLETED / DECLINED / REVOKED; secret_hash only)
  └── public.location_manager_access (VERIFIED / REVOKED; Admin-verified)
public.case_document_events  (append-only lifecycle)
public.case_prepared_pack_events  (append-only pack lifecycle)
admin_private.evidence_command_receipts
admin_private.pack_command_receipts
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
| record_version | Optimistic concurrency; bumped on every update |
| created_by, created_at, uploaded_at, validated_at | |

Checks: `VALID` only if `NO_THREATS_FOUND`; `customer_visible` only if clean + valid + `ACCEPTED`. Partial unique index: one visible version per `document_id`.

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

Immutable `agreement_versions` snapshots, current `authorization_records` (`ACTIVE` / `REVIEW_REQUIRED` / `REVOKED`), `customer_actions` with `secret_hash` only, Admin-verified `location_manager_access`, and private `customer_action_sessions` / `customer_action_challenges` / command receipts. See customer-actions.md. The 9A migration is source-only until applied after review.

Privileged RPCs:

- `admin_case_authorization_v1` / `admin_case_authorization_readiness_v1`
- `admin_authorization_command_v1` — create agreement action, revoke open action, issue customer revocation action, Admin emergency revoke
- `admin_manager_access_command_v1` — verify / revoke
- `customer_action_exchange_v1`, `customer_action_begin_otp_v1`, `customer_action_attempt_otp_v1`, `customer_action_finish_otp_v1`, `customer_action_session_v1`, `customer_action_command_v1`

## public.case_prepared_packs

Immutable-after-approval manifest for a case. Status: `DRAFT`, `APPROVED`, `STALE`, `SUPERSEDED`. `UNIQUE (case_id, pack_number)`. Partial unique indexes: at most one `DRAFT` and at most one `APPROVED` pack per case. Optimistic `record_version`. Approval note 10–2000 characters when `APPROVED`. Historical `STALE` / `SUPERSEDED` packs do not occupy those slots.

## public.case_prepared_pack_items

Exact version membership. Snapshot columns (`document_title`, `original_filename`, `content_type`, `size_bytes`) are filled by a BEFORE trigger from the document/version row. Never stores bucket, key, URL, OIDC token or credentials. Insert/update/delete allowed only while the pack is `DRAFT` and the version is uploaded, clean, valid and `ACCEPTED`.

## public.case_prepared_pack_events

Append-only. Events: `PACK_CREATED`, `ITEM_ADDED`, `ITEM_REMOVED`, `ITEM_MOVED`, `PACK_APPROVED`, `PACK_STALE`, `PACK_SUPERSEDED`. Details are bounded JSON without file bytes, storage coordinates, tokens or URLs.

Step 8C RPCs:

- `admin_prepared_pack_command_v1` — create / add_item / remove_item / move_item / approve
- `admin_prepared_pack_case_v1` — UI-safe packs (latest 20) plus eligible accepted versions; no bucket/key/URLs

An AFTER UPDATE trigger on version upload/scan/validation/review marks affected `APPROVED` packs `STALE` when included evidence is no longer eligible. The pack is not rebuilt.

RLS is enabled with no direct policies on evidence or pack tables. That is intentional: browser/table access is denied and service access is through these RPCs. Do not add broad policies only to silence the advisor. The Step 8B migration adds the `version_id` covering index requested by the performance advisor. Step 8C did not add a new warning-level advisor finding attributable to prepared packs.
