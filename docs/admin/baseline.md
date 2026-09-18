# Admin baseline and architecture decision

Approved scope: `implementation-plan.md`, 25-page source document dated 16 September 2026. This PR starts steps 1–2; it does not claim that OTP or operational modules are complete.

## Repository baseline

- Base: `main`, commit `a83739380718bf1697d5a69ebcf9f24bd0cfbeb9` (merged PR 84).
- No repository `AGENTS.md` was present at that baseline.
- Existing stack: Next.js App Router, React, TypeScript, npm lockfile, Vitest, Supabase server intake and Resend email.
- Preserve the root marketing application, its default commands and deployed configuration.
- Add `apps/admin` as an independent npm workspace and Vercel project. Share domain/server packages only when there is an actual second consumer; no pricing/schema duplication in this stage.
- Keep admin CSS, layout, metadata and test aliases separate. Do not import the marketing header, footer, analytics or customer-facing SEO configuration.
- Staff authentication will use email OTP as approved. It is intentionally **not implemented** in the application shell; every protected route fails closed.

## Existing data contract

| Existing entity | Required preservation |
| --- | --- |
| customers | Reuse IDs and case-insensitive email matching; add verified identity/membership later. |
| businesses and locations | Reuse links; a submitted relationship is not proof of ownership. |
| cases | Preserve database-generated PR/RV references, six-character suffix and snapshots. |
| case_events | Keep historical intake events; add explicit visibility before customer projections. |
| monitoring_requests and events | Keep onboarding distinct from active paid per-location coverage. |
| communications | Preserve PENDING/SENT/FAILED meanings and exactly-one-parent constraint until a reviewed additive migration. |
| intake RPCs | Preserve transaction boundaries, idempotency and persisted recipient/snapshot retry behaviour. |

The current Guard form stores one location and a requested location count. It must not be interpreted as payment or coverage for all requested locations. No staff users, sessions, evidence storage, service orders, subscriptions or payment integration are assumed to exist from intake tables alone.

## Operational inventory still required

No Vercel or Supabase account connector is available in this implementation environment. These are **unverified**, not absent or reset:

- Production/Preview project mapping and intake flag values.
- Applied migration history/schema drift and existing row counts.
- Auth SMTP, public mailbox receipt and current verified sending domain.
- Admin Vercel project, domain/TLS, preview protection and backup plan.

The shell contains no data access, so work can proceed without changing or inferring these settings. Database migrations, auth rollout and live admin launch remain gated on their corresponding verification. Do not recreate the database to make source and runtime appear consistent.

## Validation evidence

Record actual baseline and PR checks in the PR description. A build/test result is not evidence of deployed provider configuration. The bootstrap route tests and production HTTP smoke test must pass before this stage is merged.

## As-built Admin evidence architecture (Step 8A)

Evidence bytes are not stored in Supabase. The live path is:

```
Admin → Vercel OIDC → AWS IAM Role → S3 → GuardDuty
Admin → Supabase metadata
```

The Admin browser never receives AWS long-lived keys or OIDC tokens. Metadata, versions, review state and audit live in PostgreSQL. Object keys are opaque UUIDs. See `evidence-storage.md` and `adr/0001-s3-guardduty-evidence-storage.md`.
