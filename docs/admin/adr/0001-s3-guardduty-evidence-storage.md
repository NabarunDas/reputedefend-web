# ADR 0001: Private S3 + GuardDuty for evidence bytes

Status: Accepted  
Date: 2026-09-18  
Step: 8A

## Decision

Use private AWS S3 + GuardDuty Malware Protection for evidence bytes, with Supabase PostgreSQL storing metadata/workflow.

## Context

ProfileRelaunch Admin must store customer evidence for case work. Files can be malicious, spoofed or oversized. The existing AWS evidence bucket, IAM role, Vercel OIDC trust, SSE-S3 encryption, Block Public Access and GuardDuty object tagging are already configured and must not be weakened. Supabase already holds cases, Admin sessions, RLS-protected RPCs and audit. Step 8A needs a durable split between untrusted bytes and trusted workflow state without introducing a Documents UI.

## Alternatives considered

1. **Supabase Storage** for bytes and Postgres for metadata.  
   Rejected for this stage: the already-built AWS path provides private buckets, GuardDuty Malware Protection, IAM conditions that block GetObject until `NO_THREATS_FOUND`, and Vercel OIDC without long-lived keys. Replacing that with Supabase Storage would require a new malware-scanning control plane and would weaken the current clean-only read restriction.

2. **Store bytes in PostgreSQL** (`bytea`).  
   Rejected: 10 MB objects do not belong in the OLTP database; backups, RLS projections and row versions would grow with file content; malware would sit next to customer metadata.

3. **Proxy uploads through Vercel** to S3 or Supabase.  
   Rejected: serverless request limits and the requirement that the 10 MB file never transits the Admin runtime. Presigned POST is the supported browser → S3 path.

4. **Static AWS access keys in Vercel**.  
   Rejected: keys are long-lived, easy to leak into builds/logs, and forbidden by the existing OIDC trust design.

## Consequences — security

- Bytes remain in a private, encrypted, non-public bucket. Object keys contain only opaque UUIDs.
- GuardDuty is a mandatory prerequisite for content validation and any later View/Download.
- The Admin role cannot forge a clean scan by editing tags.
- Postgres constraints prevent `VALID` without `NO_THREATS_FOUND` and prevent `customer_visible` without a clean, valid, accepted version.
- Production fails closed without `AWS_REGION`, `AWS_EVIDENCE_BUCKET` and `AWS_EVIDENCE_ROLE_ARN`, and refuses static access keys.
- Preview must not assume the production OIDC role.

## Consequences — cost and operations

- S3 storage/request charges and GuardDuty Malware Protection charges apply per object.
- Scan completion is not automated in Step 8A; operators refresh status until Step 10 adds durable jobs.
- The current pre-live Admin Production deployment uses the existing development bucket/role. A dedicated production bucket and role are required before customer launch.
- Supabase stores only metadata, so database size stays independent of file bytes.

## Reversibility

Metadata tables can remain if a later decision moves bytes to another private store: `storage_provider` is constrained to `S3` today and can be extended by a reviewed migration. Existing S3 objects would need a planned copy or dual-read period. Switching to Supabase Storage later is possible but would repeat malware-scan and IAM-condition work. Rolling back the Admin app without dropping tables leaves unread versions in `PENDING_UPLOAD` / `PENDING` scan and does not publish documents to customers.
