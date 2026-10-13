# SEC-03 — DEV database migration and live acceptance (13 October 2026)

## Scope and source

- Project: `profilerelaunch-dev` (`rmzozuiamjcclvtgutgd`).
- Source PR: [#176](https://github.com/NabarunDas/reputedefend-web/pull/176).
- Reviewed SQL: `supabase/migrations/20261013153000_public_request_rate_limit_v1.sql`.
- Canonical migration version: `20261013153000`, name `public_request_rate_limit_v1`.
- **Production was not altered.** Production head at last read-only check:
  `20261004223358 data_api_default_privileges_hardening_v1`.

## Controlled application

Preflight confirmed DEV head `20261010200000 customer_action_otp_limits_v1`,
SEC-03 table/RPC absent, and baseline counts: 2 Auth users, 2 cases,
5 customer actions.

The connected Supabase `apply_migration` operation ran the exact reviewed
SEC-03 source SQL **once** on DEV and returned success. Supabase assigned an
automatic migration version `20261013190305`; that single new migration
ledger row was guardedly updated to the repository's canonical version
`20261013153000`, without re-executing SQL. The ledger then showed SEC-03
followed by SEC-02.

## Verified live results

| Test | Result |
| --- | --- |
| `admin_private.public_rate_limit_buckets` exists | PASS |
| `public.consume_public_rate_limit_v1(text)` exists | PASS |
| Retention index `public_rate_limit_buckets_updated_at_idx` exists | PASS |
| Private table RLS enabled, zero policies | PASS — intentional deny-by-default |
| `anon` and `authenticated` denied function EXECUTE | PASS |
| `service_role` allowed function EXECUTE | PASS |
| `service_role` denied direct table SELECT | PASS |
| Actual RPC executed under `SET LOCAL ROLE service_role` | PASS |
| A single test client allowed 8 requests per 10 minutes then limited | PASS |
| Other client independently allowed | PASS |
| Invalid client hash rejected | PASS |
| 16 concurrent DEV RPC calls sharing another key | PASS — 8 allowed / 8 limited |
| Previous client bucket stored exactly 8 hit timestamps | PASS |
| 40 stale rows, first cleanup removes 32 | PASS |
| Second cleanup removes remaining 8 | PASS |
| Bucket with recent hit preserved despite old `updated_at` | PASS |
| Stale-row cleanup test transaction rolled back | PASS |
| Four standalone synthetic rate-limit probe rows deleted afterward | PASS |
| Auth users / cases / customer actions versus preflight | UNCHANGED |

The live PostgreSQL cleanup test used a single transaction with assertions
and `ROLLBACK`. No customer data was used. Live concurrency results were
verified with sixteen separate simultaneous Supabase SQL requests.

Supabase security advisor reports the **informational** rule
`rls_enabled_no_policy` for the new private bucket table. Its lack of RLS
policies is intentional because only the SECURITY DEFINER service-role RPC
should modify it. Role permissions were independently verified; do not add
an open RLS policy simply to silence this finding.

## Release boundary

This acceptance is **DEV database only**. PR #176 remains unmerged, because
merging it would promote revised marketing routes to Production immediately.
Production lacks **both** SEC-02 (`20261010200000`) and SEC-03
(`20261013153000`) schema changes.

Before any Production merge:

1. Confirm fresh Production backup and no incompatible active release.
2. Prepare and separately approve Production migrations SEC-02 and SEC-03
   **in order** without replaying earlier migrations.
3. Stage a coordinated AWS CodeBuild `ApprovedMigrationHead` change from
   `20261004223358` to `20261013153000`, protecting the 4h RPO while
   avoiding a mismatch between Production head and its pinned backup policy.
4. Apply and verify Production SQL and permissions. Execute the approved AWS
   head update at the coordinated point and confirm a genuine backup.
5. Only then merge PR #176 and verify real Production forms after deployment.

No Production SQL, AWS configuration, feature gate or Vercel environment
variable was changed by this DEV rollout.
