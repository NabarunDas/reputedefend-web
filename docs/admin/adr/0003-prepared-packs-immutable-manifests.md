# ADR 0003: Prepared packs are immutable manifests of exact accepted evidence versions

Status: Accepted  
Date: 2026-09-18  
Step: 8C

## Decision

Prepared submission packs are immutable metadata manifests that reference exact accepted evidence versions. They are not generated ZIP or PDF bundles, and they do not duplicate file bytes into another S3 object.

## Context

Step 8A stores one opaque S3 object per document version. Step 8B lets Admin request, review, accept/reject and View/Download those versions after a clean GuardDuty scan and valid content. Step 8C needs a way to freeze “this exact selection of versions is the prepared document pack” without implying payment, customer authority, permission to submit, customer publication or Google submission.

A generated bundle (ZIP/PDF merge, a new pack object in S3, or a third-party viewer package) would copy bytes, lose per-version provenance, and create a second object that can drift from the reviewed originals.

## Alternatives considered

1. **Assemble a ZIP or merged PDF in the Admin runtime and store it in S3.**  
   Rejected: duplicates up to 10 MB per file, creates a new malware-scan surface, and severs the pack from the version rows that carry scan/validation/review state.

2. **Store presigned URLs or storage keys on pack items.**  
   Rejected: URLs are secrets; keys and bucket names must stay server-only. Pack items snapshot only title, filename, content type and size, derived in PostgreSQL from the document/version row.

3. **Treat pack approval as the PREPARATION / READY_TO_SUBMIT workflow gate.**  
   Rejected: those transitions remain prerequisite-blocked. Later stages will combine an approved pack with Guided payment state or Managed verified permission before opening those gates.

## Version provenance

Each pack item points at one `case_document_versions` row. Replacement evidence is a new version, not an overwrite. The pack continues to name the versions that were approved. Individual S3 objects remain the authoritative stored bytes. View/Download reuse the existing evidence access command; this step does not add another S3 route.

## Automatic staleness

If an included version later ceases to be `UPLOADED` + `NO_THREATS_FOUND` + `VALID` + `ACCEPTED` (rejected, superseded, scan or validation change), PostgreSQL marks that **APPROVED** pack `STALE` and writes `PACK_STALE`. The pack is not rebuilt. STALE and SUPERSEDED packs are read-only history. Admin creates a new DRAFT pack.

## No file duplication

No ZIP, merged PDF, extra S3 pack object, customer download link or third-party viewer. Snapshot metadata never includes bucket, key, role ARN, OIDC token, presigned URL or credentials.

## Security implications

- Pack item eligibility is enforced by a BEFORE trigger, not only the UI.
- Snapshots are overwritten from the document/version row; browser-supplied title/filename/type/size are rejected.
- Command and query RPCs are SECURITY DEFINER, empty `search_path`, `service_role` EXECUTE only, live Admin session, case lock, idempotent receipts and optimistic `record_version`.
- Direct table grants remain revoked. RLS is enabled with no browser policies.
- Query output and pack events contain no storage coordinates or URLs.
- After a version is finalised, the application will not mint another presigned POST for that same version/key.

## Operational implications

- At most one DRAFT pack per case (`case_prepared_packs_one_draft_idx`). A second independent `create` returns conflict; a matching idempotent retry still replays. Historical `STALE` / `SUPERSEDED` packs do not occupy that slot. After a DRAFT is APPROVED, a new DRAFT may be created.
- At most one APPROVED pack per case. Approving a newer pack SUPERSEDES the previous APPROVED pack.
- Pack approval does not change `cases.work_stage`, `cases.status` or `service_track`.
- The 8C migration `20260918163150_admin_prepared_packs_v1.sql` is applied to `profilerelaunch-dev` as version `20260918163150`. Database/RLS/RPC/advisor verification completed. Live browser acceptance of prepared packs is still pending. Do not mark all of Step 8 complete.

## Reversibility

The tables and RPCs can be left in place unused, or a later stage can add a bundle generator that still reads the same version IDs after the same eligibility checks. Silent rebuild of a STALE pack would not be compatible with this decision. Enabling PREPARATION / READY_TO_SUBMIT from pack approval alone would also not be compatible.

## Related

- [ADR 0001](0001-s3-guardduty-evidence-storage.md) — private S3 + GuardDuty for bytes.
- [ADR 0002](0002-presigned-s3-read-urls.md) — short-lived GET for Admin View/Download.
