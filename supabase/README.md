# Database schema

`migrations/` is the source-controlled schema for ProfileRelaunch.

The architecture is Next.js server → Supabase → PostgreSQL. Browser code must not talk to the database. Privileged access uses `SUPABASE_URL` and `SUPABASE_SECRET_KEY` on the server only.

## Development baseline

The development Supabase project received the Core Data Foundation v1 baseline through the SQL Editor **before** this directory was committed. Do **not** blindly re-run `20260915*_core_data_foundation_v1.sql` against that existing development database.

## Production

Create the future production project from these source-controlled migrations. Do not recreate the schema by clicking around in the Table Editor.

## Later changes

Add a new timestamped file in `migrations/` for every schema change. Do not edit an already-applied baseline in place, and do not let the Table Editor drift away from this directory.

`20260915193000_case_intake_transaction_v1.sql` adds `cases.submission_key` and the `create_case_intake_v1` RPC. Apply it once to development after review. Do not re-run it.

## Case intake transaction

Creating a customer, business, location, case, `CASE_RECEIVED` event and the initial communications happens in **one** PostgreSQL function: `public.create_case_intake_v1(...)`. Email is attempted only after that transaction commits. The Marketing Portal Get Help path uses this RPC when `CASE_PERSISTENCE_ENABLED=true`. Production stays on the existing email-only path while the flag is unset.

`20260916000000_relaunch_guard_data_foundation_v1.sql` adds `monitoring_requests`, `monitoring_request_events`, a nullable `communications.monitoring_request_id`, and `create_monitoring_request_v1`. Relaunch Guard is **not** a case: the RPC does not insert into `cases`, does not generate a public reference, and does not use `case_events`. Apply it once to development after review. Do not re-run it. Do not apply it from application code.

`20260917000000_single_admin_auth_v1.sql` adds the private single-admin identity, challenge counters, opaque session store, auth events and server-only RPCs. Apply once after reviewing `docs/admin/single-admin-auth.md`; then provision and bind the confirmed admin identity using `scripts/admin/bind-admin.sql`. No existing browser policies are broadened. No migration runs from application code.
