-- Harden future Data API object privileges.
-- Existing application objects are unchanged. New public tables, functions and
-- sequences must receive explicit grants in the migration that creates them.
--
-- Supabase is moving existing projects toward revoked automatic Data API
-- grants. Opt in explicitly so a future migration cannot expose a new object
-- merely by forgetting a REVOKE.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
