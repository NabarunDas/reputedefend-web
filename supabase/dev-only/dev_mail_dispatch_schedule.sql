-- NOT a migration. Do not copy this file into the migration directory.
-- Do not apply it from CI, from this pull request, or on Production.
--
-- The five-minute check runs inside the existing DEV Supabase database.
-- When the eligible count is zero, dev_mail_dispatch_recovery_v1 returns
-- without calling the Admin preview, Vercel, or Resend.
--
-- Before running this script, a reviewer enables pg_cron and pg_net on the
-- DEV project and stores three Supabase Vault secrets. This file does not
-- contain any of those values:
--   dev_mail_dispatch_url      the develop Admin preview dispatch route
--   dev_mail_dispatch_bearer   the develop worker secret
--   dev_mail_dispatch_bypass   the Vercel automation protection bypass
-- The URL must be exactly
-- https://profilerelaunch-admin-git-develop-<name>.vercel.app/api/internal/jobs/dev-mail-dispatch
-- with no query string. The bypass is sent as the x-vercel-protection-bypass
-- header. The wake is an HTTP GET, the same method as the Admin route.
-- Deployment protection stays enabled. A 302, 401, timeout, or missing
-- response is a blocked wake, not a successful send. Queuing the GET is
-- not provider acceptance.
--
-- Also insert the single activation row only after the pending-email
-- inventory has been read. Mail queued before active_from is not claimed.
-- That includes the pack-ready message already queued for PR-26-GHNLB9.

SELECT cron.schedule(
  'dev-mail-dispatch-recovery',
  '*/5 * * * *',
  $$SELECT public.dev_mail_dispatch_recovery_v1()$$
);
