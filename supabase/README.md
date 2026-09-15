# Database schema

`migrations/` is the source-controlled schema for ProfileRelaunch.

The architecture is Next.js server → Supabase → PostgreSQL. Browser code must not talk to the database. Privileged access uses `SUPABASE_URL` and `SUPABASE_SECRET_KEY` on the server only.

## Development baseline

The development Supabase project received the Core Data Foundation v1 baseline through the SQL Editor **before** this directory was committed. Do **not** blindly re-run `20260915*_core_data_foundation_v1.sql` against that existing development database.

## Production

Create the future production project from these source-controlled migrations. Do not recreate the schema by clicking around in the Table Editor.

## Later changes

Add a new timestamped file in `migrations/` for every schema change. Do not edit an already-applied baseline in place, and do not let the Table Editor drift away from this directory.

## Case intake transaction (next phase)

Creating a customer, business, location, case, `CASE_RECEIVED` event and the initial communication must happen as **one** durable database transaction before email is attempted.

Do not implement that as a sequence of unrelated browser writes or as a pretend multi-request “transaction” from the Supabase JS client. The next phase may use a PostgreSQL RPC/function (or another genuinely atomic server/database mechanism). That choice is not locked in here.
