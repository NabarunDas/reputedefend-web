# Admin risk and dependency register — evidence (Step 8A)

| Item | Status | Owner action |
| --- | --- | --- |
| GuardDuty Malware Protection service dependency | Uploads cannot be validated or later downloaded without GuardDuty tags. Refresh is manual in this PR. | Keep GuardDuty enabled on the evidence bucket. Do not disable object tagging. |
| Scanner failure / `FAILED` / `UNSUPPORTED` / `ACCESS_DENIED` | Treated as blocked, not clean. Bytes are not read. Validation stays pending. | Investigate in AWS; do not override tags from the Admin role. |
| Current development bucket on pre-live Admin Production | Admin Production currently uses the existing `AWS_EVIDENCE_BUCKET` / `AWS_EVIDENCE_ROLE_ARN` development resources. | Provision a dedicated production bucket and role before production customer launch. Do not reuse the dev bucket for live customer files. |
| Real production bucket/role before launch | Not created by this PR. | Configure new Vercel production values; keep Preview isolated; do not copy static keys. |
| Background scan / event automation | Deferred. No EventBridge, Lambda, cron or outbox worker in Step 8A. | Step 10 durable jobs should refresh scan status without a browser tab. |
| Additive migration not applied remotely | `20260918140000_admin_evidence_foundation_v1.sql` is in source only. | Apply once to the intended Supabase project after review. Do not replay baseline migrations. |
| Step 8B UI not implemented | No Documents navigation, view/download or review controls. | Implement review/publication only against `NO_THREATS_FOUND` + `VALID`. |
