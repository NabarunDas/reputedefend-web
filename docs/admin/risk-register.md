# Admin risk and dependency register — evidence (Steps 8A and 8B)

| Item | Status | Owner action |
| --- | --- | --- |
| GuardDuty Malware Protection service dependency | Uploads cannot be validated or downloaded without GuardDuty tags. Refresh is still manual. | Keep GuardDuty enabled on the evidence bucket. Do not disable object tagging. |
| Scanner failure / `FAILED` / `UNSUPPORTED` / `ACCESS_DENIED` | Treated as blocked, not clean. Bytes are not read. Validation stays pending. | Investigate in AWS; do not override tags from the Admin role. |
| Live tag missing after a previously clean DB row | View/Download fail closed; no presigned GET is issued. | Refresh scan status; do not override the database to force a download. |
| Current development bucket on pre-live Admin Production | Admin Production currently uses the existing `AWS_EVIDENCE_BUCKET` / `AWS_EVIDENCE_ROLE_ARN` development resources. | Provision a dedicated production bucket and role before production customer launch. Do not reuse the dev bucket for live customer files. |
| Real production bucket/role before launch | Not created by this PR. | Configure new Vercel production values; keep Preview isolated; do not copy static keys. |
| Background scan / event automation | Deferred. No EventBridge, Lambda, cron or outbox worker in Step 8B. | Step 10 durable jobs should refresh scan status without a browser tab. |
| Step 8A migration | `20260918140000_admin_evidence_foundation_v1.sql` applied to `profilerelaunch-dev`. Do not modify or replay it. | None for 8A. |
| Step 8B additive migration not applied remotely | `20260918180000_admin_evidence_workspace_v1.sql` is in source only. | Apply once to the intended Supabase project after review. Do not replay the 8A migration. |
| Step 8C prepared packs | Not implemented. Customer publication, pack assembly and Google submission remain later work. | Implement pack controls only against accepted, clean, valid versions. |
| Presigned GET leakage window | A View/Download URL works for up to 60 seconds if copied. | Keep expiry at 60s; never persist URLs; treat leaked URLs as time-bounded access. |
