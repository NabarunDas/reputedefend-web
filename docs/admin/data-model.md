# Admin data model — evidence foundation

This documents the Step 8A evidence tables and their relationship to existing `public.cases`. It does not replace earlier intake, enquiry or workflow models.

## Relationships

```
public.cases
  └── public.evidence_requests (optional staff request for a case)
  └── public.case_documents
        ├── optional evidence_requests
        └── public.case_document_versions (unique document_id + version_number)
              └── storage_key unique, opaque S3 object
public.case_document_events  (append-only lifecycle)
admin_private.evidence_command_receipts  (idempotent begin/finalize/refresh)
```

Foreign keys to `cases` and `evidence_requests` use `ON DELETE RESTRICT`. Versions never overwrite a previous `storage_key`.

## public.evidence_requests

Staff request for evidence against a case. No UI in Step 8A.

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
| storage_bucket, storage_key | Bucket from server config; unique opaque key |
| upload_status | `PENDING_UPLOAD`, `UPLOADED`, `FAILED` |
| scan_status | GuardDuty mapping |
| scan_checked_at | nullable |
| validation_status / validation_error | Signature result after a clean scan |
| review_status / review_note / reviewed_by / reviewed_at | Unused by Step 8A commands; default `UNREVIEWED` |
| customer_visible | `NOT NULL DEFAULT false` |
| created_by, created_at, uploaded_at, validated_at | |

Checks: `VALID` only if `NO_THREATS_FOUND`; `customer_visible` only if clean + valid + `ACCEPTED`.

## public.case_document_events

Append-only. Events: `UPLOAD_BEGUN`, `UPLOAD_FINALIZED`, `UPLOAD_FAILED`, `SCAN_REFRESHED`. Details are bounded JSON without file bytes, OTPs, AWS tokens, presigned URLs or secrets.

## admin_private.evidence_command_receipts

Follows the existing Admin private receipt pattern: `request_id`, `actor_id`, `fingerprint`, `response`. Matching retries return the stored response; a changed fingerprint conflicts.

## Privileged RPCs

All `SECURITY DEFINER` with empty `search_path`, executable by `service_role` only, and they validate `admin_session_v1` internally. Actor identity is never client-supplied.

- `admin_evidence_begin_v1`
- `admin_evidence_finalize_v1`
- `admin_evidence_refresh_scan_v1`
- `admin_evidence_version_v1` (scoped metadata; missing/wrong-case IDs return `{ missing: true }` with no extra fields)

`admin_audit_list_v1` accepts `EVIDENCE_CHANGED` alongside existing Admin actions.
