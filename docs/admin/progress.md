# Admin implementation tracker

The approved plan defines scope, dependencies and acceptance criteria. A code-complete stage is distinct from a configured production service.

| Step | Deliverable | Status |
| --- | --- | --- |
| 1 | Baseline and architecture contract | Repository reviewed; provider inventory pending access |
| 2 | Admin application and domain shell | Merged; user confirms the deployed admin login works |
| 3 | Single admin account and email OTP | Merged; dev account binding verified; user confirms email OTP login works |
| 4 | Authorisation and audit foundation | Merged in PR #87; activity log and audited session commands. See audit-foundation.md |
| 5 | Shared records and client workspace | Implemented: directories, record editing, manual contact verification, verified relationships, private customer projections and read-only duplicate comparison. See client-workspace.md; live browser acceptance pending |
| 6 | Persistent enquiries and triage | Planned |
| 7 | Workflow engine, tasks and cases | Planned |
| 8 | Evidence storage and review | Planned |
| 9 | Agreements and customer actions | Planned |
| 10 | Jobs, outbox and operational health | Planned |
| 11 | Outgoing communications | Planned |
| 12 | Incoming mail and conversations | Planned |
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
