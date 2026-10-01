-- Legacy object inspection: public.set_case_public_ref and public.rls_auto_enable
--
-- READ-ONLY. Every statement in this file returns rows. Nothing here creates,
-- alters or drops anything, and nothing here is executed by the application,
-- by a migration, by a build or by a deploy. A person pastes it into a SQL
-- console against the database being inspected and reads the output.
--
-- Neither object is created by any file under supabase/migrations. Both exist
-- on profilerelaunch-dev. Step 1 created public.cases_assign_public_ref, which
-- is the hardened, search_path-pinned function the repository relies on.
--
-- Read all five sections before deciding anything. Section 5 describes what a
-- removal would do; it does not perform one, and it does not use CASCADE.

\echo '== 1. Does each object exist, and what is it? =='

select
  n.nspname                                   as schema,
  p.proname                                   as name,
  pg_get_function_identity_arguments(p.oid)   as arguments,
  case p.prokind
    when 'f' then 'function'
    when 'p' then 'procedure'
    when 'a' then 'aggregate'
    when 'w' then 'window'
  end                                         as kind,
  p.prosecdef                                 as security_definer,
  p.proconfig                                 as settings,
  pg_get_userbyid(p.proowner)                 as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_case_public_ref', 'rls_auto_enable', 'cases_assign_public_ref')
order by p.proname;

-- An empty result for set_case_public_ref and rls_auto_enable means this
-- database does not carry them, and there is nothing to decide. A row for
-- cases_assign_public_ref is expected: that one is created by Step 1 and must
-- not be removed.


\echo '== 2. Which triggers call them? =='

select
  c.relname                     as table_name,
  t.tgname                      as trigger_name,
  p.proname                     as function_name,
  not t.tgenabled = 'D'         as enabled,
  pg_get_triggerdef(t.oid)      as definition
from pg_trigger t
join pg_proc p      on p.oid = t.tgfoid
join pg_class c     on c.oid = t.tgrelid
join pg_namespace n on n.oid = p.pronamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and p.proname in ('set_case_public_ref', 'rls_auto_enable')
order by c.relname, t.tgname;

-- A row here is the important case. It means a table is still wired to the
-- legacy function, so dropping the function would break writes to that table.
-- Compare the trigger definition with what the repository migrations create
-- before concluding anything.


\echo '== 3. Is either used as an event trigger? =='

select
  evtname                       as event_trigger_name,
  evtevent                      as event,
  evtenabled <> 'D'             as enabled,
  p.proname                     as function_name
from pg_event_trigger e
join pg_proc p      on p.oid = e.evtfoid
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_case_public_ref', 'rls_auto_enable')
order by evtname;

-- rls_auto_enable reads like an event trigger helper. An enabled event trigger
-- affects DDL across the whole database, so a row here means the object is not
-- inert and removing it changes how future DDL behaves.


\echo '== 4. What else depends on them? =='

select
  dependent_ns.nspname          as dependent_schema,
  dependent.relname             as dependent_object,
  dependent.relkind             as dependent_kind,
  p.proname                     as function_name
from pg_depend d
join pg_proc p              on p.oid = d.refobjid
join pg_namespace n         on n.oid = p.pronamespace
join pg_class dependent     on dependent.oid = d.objid
join pg_namespace dependent_ns on dependent_ns.oid = dependent.relnamespace
where d.refclassid = 'pg_proc'::regclass
  and n.nspname = 'public'
  and p.proname in ('set_case_public_ref', 'rls_auto_enable')
order by dependent_ns.nspname, dependent.relname;

-- Any row is a dependency CASCADE would remove silently. Do not drop through
-- it. A dependency means something in the live schema is not described by the
-- repository, and that has to be understood before anything is removed.


\echo '== 5. What would removal consist of? =='

select
  format('DROP FUNCTION %I.%I(%s);', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    as statement_that_would_be_run,
  'RESTRICT is the default. It fails if anything depends on the function, which is the intended behaviour.'
    as note
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('set_case_public_ref', 'rls_auto_enable')
order by p.proname;

-- This section prints the statement. It does not run it, and the printed form
-- carries no CASCADE.
--
-- Before running anything printed above:
--   1. Sections 2, 3 and 4 must all be empty for that object.
--   2. The database must be the one chosen as production, with the strategy
--      decision already recorded.
--   3. Under Strategy A the object will not exist at all, so there is nothing
--      to remove and this file should return nothing in section 1.
--   4. Record the inspection output, the decision and the reason in the
--      release record, including a decision to leave the object in place.
--
-- If a dependency exists, stop. Removing it is a separate, reviewed piece of
-- work, not a cutover step.
