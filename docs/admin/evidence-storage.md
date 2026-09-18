# Evidence storage — Step 8A technical design

Step 8A only. This document is the as-built contract for private evidence bytes and metadata. It does not describe a Documents UI, customer publication, prepared packs or download routes. Those belong to Step 8B.

## Responsibility split

| Concern | System |
| --- | --- |
| Object bytes | Private AWS S3 bucket in `eu-west-2` |
| Malware scanning | GuardDuty Malware Protection for S3, written as object tags |
| Metadata, versions, review and visibility | Supabase PostgreSQL |
| Admin session, CSRF/origin, command API | Admin app on Vercel |
| AWS authentication | Vercel OIDC federation assuming `AWS_EVIDENCE_ROLE_ARN` |

Supabase never stores file bytes. S3 never stores customer names, emails, original filenames or case references in the object key. The Admin role cannot read an object until `GuardDutyMalwareScanStatus = NO_THREATS_FOUND`. The application never changes GuardDuty tags.

## As-built control flow

```
Admin browser
  → Admin Next.js on Vercel (session cookie, exact Origin)
    → Supabase (metadata / workflow RPCs)
    → Vercel OIDC → AWS IAM role → S3 (presigned POST, GetObjectTagging, clean GetObject)
      → GuardDuty Malware Protection (object tags)
```

The browser uploads bytes directly to S3. Vercel does not proxy the 10 MB object.

## Environment variables

Required in the Admin Production Vercel project only:

- `AWS_REGION`
- `AWS_EVIDENCE_BUCKET`
- `AWS_EVIDENCE_ROLE_ARN`

Do not set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` or `AWS_SESSION_TOKEN`. Production fails closed if a required variable is missing or if static keys are present. Preview and local environments must not silently use the production role: `VERCEL_ENV` other than `production` disables the adapter, and tests inject a mock S3 adapter.

This PR does not create or modify AWS infrastructure or Vercel project settings. The existing production OIDC trust is already restricted to `owner:clientcove:project:profilerelaunch-admin:environment:production`.

## Object-key model

```
cases/{case_uuid}/documents/{document_uuid}/versions/{version_uuid}
```

IDs are server-generated UUIDs. Replacement uploads insert a new version row and a new key. Previous objects are never overwritten.

## Upload sequence

1. Admin POST `/api/evidence/command` with `operation: "begin"`, bounded JSON, a UUID idempotency key, a live Admin session and the configured Origin.
2. The server validates extension, declared MIME and size (`1..10_485_760` bytes).
3. `admin_evidence_begin_v1` creates `case_documents` / `case_document_versions` / an append-only event / an audit row / an idempotency receipt.
4. The server creates a presigned POST (maximum 5 minutes) constrained to the exact key, exact `Content-Type` and `content-length-range` 1..10485760.
5. The browser POSTs the file to S3.
6. Admin POST `operation: "finalize"`. The server uses GetObjectTagging only (GetObject/HeadObject are blocked before a clean scan). On success: `upload_status=UPLOADED`, `scan_status=PENDING`, `validation_status=PENDING`.

## GuardDuty sequence

There is no polling job, EventBridge handler or cron in this PR. Step 10 will add durable jobs later.

1. Admin POST `operation: "refresh_scan"`.
2. GetObjectTagging reads `GuardDutyMalwareScanStatus`.
3. Missing tag → remain `PENDING`.
4. Documented non-clean values (`THREATS_FOUND`, `UNSUPPORTED`, `ACCESS_DENIED`, `FAILED`) stay blocked. GetObject is not attempted. Validation stays `PENDING`.
5. Unknown tag values map to `FAILED` and are not treated as safe.
6. `NO_THREATS_FOUND` permits GetObject under the existing clean-only IAM permission. The server then checks the actual file signature (PDF/JPEG/PNG/WebP) or DOCX ZIP structure via `fflate`.
7. Content success → `validation_status=VALID`. Otherwise `INVALID` or `ERROR`.

View/Download (Step 8B) may be offered only when `scan_status=NO_THREATS_FOUND` AND `validation_status=VALID`. A clean file is not accepted evidence. `customer_visible` defaults to false and is not set by these commands.

## State model

Keep these independent:

| Axis | Values |
| --- | --- |
| Upload | `PENDING_UPLOAD`, `UPLOADED`, `FAILED` |
| Malware scan | `PENDING`, `NO_THREATS_FOUND`, `THREATS_FOUND`, `UNSUPPORTED`, `ACCESS_DENIED`, `FAILED` |
| Content validation | `PENDING`, `VALID`, `INVALID`, `ERROR` |
| Business review | `UNREVIEWED`, `ACCEPTED`, `REJECTED`, `SUPERSEDED` |

`VALID` requires `NO_THREATS_FOUND`. Customer visibility requires a clean scan, valid content and `ACCEPTED` review. Step 8A never sets review or customer visibility.

## Failure behaviour

| Failure | Behaviour |
| --- | --- |
| Missing Admin session / wrong Origin | 401 / 403, no DB write, no presigned POST |
| Unknown case or cross-case IDs | Conflict/missing; no metadata leakage |
| Type/size rejected | 400; no object key minted |
| Missing AWS configuration or static keys | 503; fail closed |
| Presigned POST expired or unused | Finalize probe fails; version remains `PENDING_UPLOAD` |
| Object missing at finalize | 409; upload is not marked complete |
| Scanner not finished | Refresh leaves `PENDING` |
| Scanner blocked/failed | Status stored; bytes not read |
| Signature mismatch after clean scan | `validation_status=INVALID` |
| Audit insert failure | Transaction rolls back documents, versions and events |
| Idempotent retry | Same fingerprint returns the committed result; a new five-minute POST may be minted for `begin` |

## Allowed files

Maximum 10,485,760 bytes. Types: PDF, JPEG, PNG, WebP, DOCX. Rejected initially include `.doc`, `.docm`, `.xls`, `.xlsx`, `.zip`, `.rar`, `.7z`, `.svg`, `.html`, `.js`, `.exe`. Extension, declared MIME and post-scan signature must agree. Filename extension alone is not trusted.

## Future Step 8B dependency

Step 8B may add Documents navigation, review controls, clean-object preview/download and customer publication. It must reuse this command/storage contract, the clean-only IAM permission and `retrieveCleanEvidence`. It must not add a download route that bypasses `NO_THREATS_FOUND` + `VALID`, and it must not make uploads customer-visible by default.
