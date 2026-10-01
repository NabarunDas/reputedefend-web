# Operator SQL

SQL in this directory is for a person to read, paste into a SQL console and run
deliberately. None of it is a migration, none of it is imported by application
code, and none of it is wired into any build, start, test or deploy path.

Two rules apply to everything here.

**Read-only by default.** A script in this directory either returns rows or it
does nothing. Where a statement would change the database, it is present as a
commented example with the reasoning next to it, so that running the file as
written cannot alter anything.

**No blind `CASCADE`.** A dependency that `CASCADE` would silently remove is
the most important thing these scripts are trying to surface. If the inspection
reports a dependent object, that is a finding to understand, not an obstacle to
drop through.

## Files

| File | Purpose |
| --- | --- |
| `legacy-object-inspection.sql` | Reports whether `public.set_case_public_ref` and `public.rls_auto_enable` exist on the connected database, what depends on them, and what dropping them would remove. Changes nothing. |

## Why `legacy-object-inspection.sql` exists

Neither object is created by any file under `supabase/migrations`. Both exist on
`profilerelaunch-dev`, which is itself evidence that the development database
carries history the repository does not describe — the same finding as the
migration ledger starting three migrations later than the repository chain.

Step 1 created `public.cases_assign_public_ref`, which is the hardened,
`search_path`-pinned function the repository actually relies on for public case
references. `public.set_case_public_ref` appears to be its unmanaged
predecessor, and `public.rls_auto_enable` appears to be an event trigger helper
from the same era. Neither is called from application code.

Whether they can be removed depends on which database becomes production:

- Under Strategy A, production is built from the canonical chain and neither
  object is ever created, which closes the question by construction.
- Under Strategy B, the development database is promoted and both objects come
  with it. Run this inspection against it, read the dependency output, and
  decide each object individually.

Record the inspection output and the decision in the release record. Do not run
anything from here as part of a cutover step without having read its output
first.
