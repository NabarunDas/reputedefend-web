# Admin implementation tracker

The approved plan defines scope, dependencies and acceptance criteria. A code-complete stage is distinct from a configured production service.

| Step | Deliverable | Status |
| --- | --- | --- |
| 1 | Baseline and architecture contract | Repository reviewed; provider inventory pending access |
| 2 | Admin application and domain shell | Merged; user confirms the deployed admin login works |
| 3 | Single admin account and email OTP | Merged; dev account binding verified; user confirms email OTP login works |
| 4 | Authorisation and audit foundation | Merged in PR #87; activity log and audited session commands. See audit-foundation.md |
| 5 | Shared records and client workspace | Merged in PR #88: directories, record editing, manual contact verification, verified relationships, private customer projections and read-only duplicate comparison. See client-workspace.md; live browser acceptance pending |
| 6 | Persistent enquiries and triage | Merged in PR #89; migration applied to connected dev project. Queue, phone intake, follow-ups, notification outcomes and audited conversion. See enquiry-triage.md; authenticated browser acceptance pending |
| 7 | Workflow engine, tasks and cases | Implemented: controlled transitions, Guided/Managed tracks, tasks, notes, external submission records, closure/reopen and customer preview. Later payment/permission/pack gates remain disabled. See case-workflows.md; authenticated browser acceptance pending |
| 8 | Evidence storage and review | COMPLETE — live acceptance confirmed 18 September 2026 on profilerelaunch-dev: upload, GuardDuty scan, validation, Admin View/Download, evidence review, prepared-pack creation, multiple accepted items, pack approval, approved pack read-only behaviour, new DRAFT after approval, automatic APPROVED → STALE when included evidence became ineligible, and PREPARATION / READY_TO_SUBMIT remained blocked. See evidence-storage.md |
| 9 | Agreements and customer actions | COMPLETE / LIVE-TESTED. For case PR-26-6CKR5M the readiness projection reached `authorizationReady=true` (`managedTrack`, verified email, verified business authority, accepted service agreement, active case-management permission, verified Manager access). Step 9B1 live View/Download of a published pack passed, including customer OTP, CASE_ACCESS and the customer S3 read role. Step 9B2 live customer evidence upload passed: request-driven browser POST to S3, Customer `s3:PutObject`, GuardDuty scan, Admin validation/review, and evidence-request fulfilment. Applied migrations: `20260928094817` (9A), `20260928175738` (9B1), `20260929150057` (9B2). `PREPARATION` / `READY_TO_SUBMIT` remain blocked. See customer-actions.md |
| 10 | Jobs, outbox and operational health | COMPLETE / LIVE-TESTED. Applied migration `20260929183214_jobs_outbox_operational_health_v1.sql`. Production worker is enabled with protected Cron auth, provider mode remains disabled, cadence is daily/Hobby-compatible, and a live `SYSTEM_HEALTH_PROBE` completed successfully with a healthy heartbeat and one successful job attempt. No live Resend/Stripe/Google adapters. `PREPARATION` / `READY_TO_SUBMIT` remain blocked. See jobs-outbox.md |
| 11 | Outgoing communications | DATABASE APPLIED / LIVE DELIVERY DISABLED. Additive migration `20260929210000_communications_outgoing_mail_v1.sql` is applied to `profilerelaunch-dev` exactly once after Step 10. Live outgoing customer email remains disabled: Resend webhook is not configured, `JOB_PROVIDER_MODE` remains disabled, `COMMUNICATIONS_SEND_ENABLED` is unset, Cron remains daily (`0 4 * * *`), and no live outbound-email acceptance test has occurred. No real customer email is sent. Marketing enquiry intake is unchanged. `PREPARATION` / `READY_TO_SUBMIT` remain blocked. See communications-outgoing-mail.md |
| 12 | Incoming mail and conversations | DATABASE APPLIED / LIVE INBOUND DISABLED. Additive migration `20260929221604_incoming_mail_conversations_v1.sql` is applied to `profilerelaunch-dev` exactly once after Step 11. Schema, inbound receipts, conversation RPCs, `IMPORT_INBOUND_EMAIL` and `IMPORT_INBOUND_ATTACHMENT` exist remotely. Live inbound remains disabled: Resend Receiving is not configured, the inbound webhook secret and inbound subdomain/DNS are not configured, inbound AWS placeholders are unset, and no live inbound email has been received. Root-domain MX is unchanged. Outgoing Step 11 remains live-delivery-disabled. Cron remains daily. `PREPARATION` / `READY_TO_SUBMIT` remain blocked. See incoming-mail-conversations.md |
| 13 | Catalogue, quotes and orders | Planned |
| 14 | Upfront and success-fee payments | Planned |
| 15 | Guard onboarding and activation | Planned |
| 16 | Subscriptions, cancellation and refunds | Planned |
| 17 | Manual checks, rota and baselines | Planned |
| 18 | Alerts and linked cases | Planned |
| 19 | Dashboard, search and reports | Planned |
| 20 | Settings, staff and privacy operations | Planned |
| 21 | Google integration readiness | Planned; live activation depends on API access |
| 22 | Migration rehearsal and recovery | Planned |
| 23 | End to end acceptance and security | Planned |
| 24 | Production cutover and signoff | Planned |

The approved account is admin@profilerelaunch.com only, with no staff levels. Step 3 adds real OTP and opaque server sessions; live activation must follow single-admin-auth.md. The customer portal remains a separate application with shared records and independently verified customer membership.
