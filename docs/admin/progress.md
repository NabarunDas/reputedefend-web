# Admin implementation tracker

The approved plan defines scope, dependencies and acceptance criteria. A code-complete stage is distinct from a configured production service.

| Step | Deliverable | Status |
| --- | --- | --- |
| 1 | Baseline and architecture contract | Repository reviewed; provider inventory pending access |
| 2 | Admin application and domain shell | Implemented on codex/admin-foundation; Vercel/DNS setup pending |
| 3 | Staff schema and OTP access | Next |
| 4 | Authorisation and audit foundation | Planned |
| 5 | Shared records and client workspace | Planned |
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

Next PR must implement real OTP and staff membership; it must not simply open the bootstrap boundary or introduce a demo session. The customer portal remains a separate application with shared records and independently verified customer membership.
