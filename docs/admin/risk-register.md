# Admin risk and dependency register — evidence (Steps 8A, 8B and 8C)

| Item | Status | Owner action |
| --- | --- | --- |
| GuardDuty Malware Protection service dependency | Uploads cannot be validated or downloaded without GuardDuty tags. Refresh is still manual. | Keep GuardDuty enabled on the evidence bucket. Do not disable object tagging. |
| Scanner failure / `FAILED` / `UNSUPPORTED` / `ACCESS_DENIED` | Treated as blocked, not clean. Bytes are not read. Validation stays pending. | Investigate in AWS; do not override tags from the Admin role. |
| Live tag missing after a previously clean DB row | View/Download fail closed; no presigned GET is issued. | Refresh scan status; do not override the database to force a download. |
| Current development bucket on pre-live Admin Production | Admin Production currently uses the existing `AWS_EVIDENCE_BUCKET` / `AWS_EVIDENCE_ROLE_ARN` development resources. | Provision a dedicated production bucket and role before production customer launch. Do not reuse the dev bucket for live customer files. |
| Real production bucket/role before launch | Not created by this PR. | Configure new Vercel production values; keep Preview isolated; do not copy static keys. |
| Background scan / event automation | Deferred. No EventBridge, Lambda, cron or outbox worker in Step 8B. | Step 10 durable jobs should refresh scan status without a browser tab. |
| Step 8A migration | `20260918143424_admin_evidence_foundation_v1.sql` applied to `profilerelaunch-dev` as version `20260918143424`. Repository filename matches that recorded version. SQL content is unchanged. Do not modify or replay it. | None for 8A. |
| Step 8B additive migration | `20260918153627_admin_evidence_workspace_v1.sql` applied to `profilerelaunch-dev` as version `20260918153627`. Repository filename matches that recorded version. SQL content is unchanged. On 18 September 2026 the owner confirmed the deployed Step 8B Admin evidence flow worked end-to-end, including upload, malware scan/status refresh, View/Download and review. | None for 8B. |
| Step 8C additive migration | `20260918163150_admin_prepared_packs_v1.sql` applied to `profilerelaunch-dev` as version `20260918163150`. Step 8 live acceptance confirmed 18 September 2026. | None for 8C. Do not replay. |
| Step 9A additive migration not applied remotely | `20260918171515_admin_customer_actions_v1.sql` is in source only. | Apply once after review. Do not replay 8A–8C. Do not enable PREPARATION/READY_TO_SUBMIT from authorisation readiness alone. |
| Customer action secret leakage | Raw secret lives in a URL fragment and a one-time Admin copy response. | Exchange immediately; store SHA-256 only; revoke and reissue if the copy is lost. |
| Customer Vercel project | Not created by this PR. | Create a separate customer deployment later; set `CUSTOMER_ORIGIN` on Admin and Customer; never share cookies via `Domain=.profilerelaunch.com`. |
| Pack approval vs workflow gates | An approved pack is not payment, permission or Google submission. Those gates stay disabled. | Later stages combine approved pack + Guided payment or Managed verified permission. |
| STALE packs | Included evidence changes mark the APPROVED pack STALE. History is not rebuilt. | Create a new DRAFT pack. Do not use a STALE pack for submission.
| Presigned GET leakage window | A View/Download URL works for up to 60 seconds if copied. | Keep expiry at 60s; never persist URLs; treat leaked URLs as time-bounded access. |
