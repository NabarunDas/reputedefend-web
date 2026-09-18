# Evidence storage — Steps 8A, 8B and 8C

Step 8A is the private upload/scan foundation. Step 8B adds the Admin evidence workspace: requests, review, visibility recording, and short-lived View/Download. Step 8C adds prepared submission packs as immutable metadata manifests of exact accepted versions. This is not a customer portal, does not generate ZIP/PDF bundles, and does not submit anything to Google.

On 18 September 2026 the owner confirmed the deployed Step 8B Admin evidence flow worked end-to-end, including upload, malware scan/status refresh, View/Download and review.

## Responsibility split

| Concern | System |
| --- | --- |
| Object bytes | Private AWS S3 bucket in `eu-west-2` |
| Malware scanning | GuardDuty Malware Protection for S3, written as object tags |
| Metadata, versions, review and visibility | Supabase PostgreSQL |
| Admin session, CSRF/origin, command API | Admin app on Vercel |
| AWS authentication | Vercel OIDC federation assuming `AWS_EVIDENCE_ROLE_ARN` |
| Admin preview/download | Short-lived S3 presigned GET URLs (≤60 seconds). Bytes are not proxied through Vercel |

Supabase never stores file bytes. S3 never stores customer names, emails, original filenames or case references in the object key. The Admin role cannot read an object until `GuardDutyMalwareScanStatus = NO_THREATS_FOUND`. The application never changes GuardDuty tags.

## As-built control flow

```
Admin browser
  → Admin Next.js on Vercel (session cookie, exact Origin)
    → Supabase (metadata / workflow RPCs; no storage keys in browser-facing case/queue queries)
    → Vercel OIDC → AWS IAM role → S3
         presigned POST (upload)
         GetObjectTagging (finalize / refresh / live re-check before read)
         GetObject (server-side validation after a clean scan only)
         presigned GET ≤60s (Admin View/Download after DB + live tag checks)
      → GuardDuty Malware Protection (object tags)
```

The browser uploads bytes directly to S3. View/Download also go directly to S3 with a server-minted URL. Vercel does not proxy the 10 MB object.

## Environment variables

Required in the Admin Production Vercel project only:

- `AWS_REGION`
- `AWS_EVIDENCE_BUCKET`
- `AWS_EVIDENCE_ROLE_ARN`

Do not set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` or `AWS_SESSION_TOKEN`. Production fails closed if a required variable is missing or if static keys are present. Preview and local environments must not silently use the production role: `VERCEL_ENV` other than `production` disables the adapter, and tests inject a mock S3 adapter.

This PR does not create or modify AWS infrastructure or Vercel project settings.

## Object-key model

```
cases/{case_uuid}/documents/{document_uuid}/versions/{version_uuid}
```

IDs are server-generated UUIDs. Replacement uploads insert a new version row and a new key. Previous objects are never overwritten.

## Upload sequence

Unchanged from Step 8A: `begin` → browser POST to S3 → `finalize` → `refresh_scan` (manual). There is still no polling job, EventBridge handler or cron.

After `admin_evidence_begin_v1` returns a version ID, the command loads that version through `admin_evidence_version_v1`. A presigned POST is minted only when `upload_status = PENDING_UPLOAD`. Retrying `begin` before finalisation may mint a new short-lived URL for the same pending transaction. After `FINALIZE` / `UPLOADED` (or `FAILED` / any other non-pending status) the application returns a conflict and does not mint another URL for that version or storage key. A replacement file is a new document version.

## View / Download sequence (Step 8B)

1. Admin POST `/api/evidence/command` with `operation: "view"` or `"download"`, a UUID idempotency key, live session and exact Origin. The browser does not send bucket, key, role or S3 action.
2. Server loads the version through `admin_evidence_version_v1` (case-scoped). Cross-case IDs return missing/conflict without metadata.
3. Stored `storage_bucket` must equal `AWS_EVIDENCE_BUCKET`. Mismatch → 503, no S3 call, no URL.
4. Require `upload_status=UPLOADED`, `scan_status=NO_THREATS_FOUND`, `validation_status=VALID`.
5. Re-read the live GuardDuty object tag. Missing or non-clean tags → no URL.
6. `view` is allowed only for PDF/JPEG/PNG/WebP (inline Content-Disposition). DOCX view is rejected server-side.
7. `download` is allowed for every currently accepted type, including DOCX (attachment Content-Disposition).
8. Mint a presigned GET with expiry ≤ 60 seconds. Filenames are sanitised for RFC Content-Disposition; CR/LF/control characters are not placed in headers.
9. Record `ACCESS_VIEWED` / `ACCESS_DOWNLOADED` and Admin audit **without** storing the URL.
10. Return the URL in the HTTP response only. It is never written to the database, audit, events or logs.

## Review sequence

`accept` / `reject` / `set_visibility` require a live Admin session, exact case ownership, a supporting note and the expected `record_version`.

- Accept is allowed only for uploaded + clean + valid files. Accepting a newer version supersedes other `ACCEPTED` versions of the same logical document, clears their `customer_visible` flag, and writes `VERSION_SUPERSEDED`. The newly accepted version is **not** made customer visible.
- Reject is allowed for the same clean+valid files. Rejecting a previously accepted version requires an explicit UI confirmation. Rejected versions are not customer visible.
- `SUPERSEDED` is terminal.
- `set_visibility=true` requires clean + valid + `ACCEPTED`. `false` may be applied to an existing non-superseded version. At most one version per document may be `customer_visible`. Visibility is recorded for **future** customer access; no customer download endpoint exists.

## Evidence requests

Internal operational records only. `create` / `fulfill` / `cancel` write Admin audit. Creating a request does not send an email.

## Browser-facing queries

- `admin_evidence_case_v1` — requests, documents and versions for one case. No `storage_bucket`, `storage_key`, AWS role, OIDC or presigned URLs.
- `admin_evidence_queue_v1` — bounded global queue (default `needs_review`, maximum 50+1 rows, cursor). No storage keys.

`admin_evidence_version_v1` remains a **server-only** lookup used by upload/access commands and still includes storage coordinates. It is not used to render the Documents or case evidence pages.

## State model

Keep these independent:

| Axis | Values |
| --- | --- |
| Upload | `PENDING_UPLOAD`, `UPLOADED`, `FAILED` |
| Malware scan | `PENDING`, `NO_THREATS_FOUND`, `THREATS_FOUND`, `UNSUPPORTED`, `ACCESS_DENIED`, `FAILED` |
| Content validation | `PENDING`, `VALID`, `INVALID`, `ERROR` |
| Business review | `UNREVIEWED`, `ACCEPTED`, `REJECTED`, `SUPERSEDED` |

`VALID` requires `NO_THREATS_FOUND`. Customer visibility requires a clean scan, valid content and `ACCEPTED` review. View/Download require the same clean+valid pair **and** a live `NO_THREATS_FOUND` tag.

## Allowed files

Maximum 10,485,760 bytes. Types: PDF, JPEG, PNG, WebP, DOCX. Previewable: PDF/JPEG/PNG/WebP. DOCX View is disabled with “Preview not available for this file type”; DOCX Download remains available when clean + valid.

## Prepared packs (Step 8C)

Packs live on the case evidence page only. Approval means: the Admin has approved this exact selection of evidence versions as the prepared document pack. It does not mean payment received, customer agreement, authority granted, ready to submit, submitted to Google, or customer portal access.

- `create` / `add_item` / `remove_item` / `move_item` / `approve` go through `admin_prepared_pack_command_v1`. A case may have at most one `DRAFT` and at most one `APPROVED` pack. A second independent `create` while a draft exists returns conflict; a matching idempotent retry still replays.
- Items are allowed only when the pack is `DRAFT` and the version is `UPLOADED` + `NO_THREATS_FOUND` + `VALID` + `ACCEPTED` for the same case. PostgreSQL overwrites snapshot title/filename/type/size from the version row.
- Approving requires at least one item, a 10–2000 character note and an explicit confirmation. A previous `APPROVED` pack for the case becomes `SUPERSEDED`.
- If included evidence later fails those checks, that `APPROVED` pack becomes `STALE`. The pack is not rebuilt.
- View/Download reuse `/api/evidence/command`. No ZIP, merged PDF, extra S3 pack object or new access route.
- `admin_case_command_v1` still returns `prerequisite` for `PREPARATION` and `READY_TO_SUBMIT`. Pack approval does not change case stage, status or service track.

## Future work

Customer publication, payment/permission gates and Google submission remain later stages. Do not mark all of Step 8 complete until Step 8C is reviewed, merged, migrated and live accepted.
