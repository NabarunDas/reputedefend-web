-- NOT a migration. Do not copy this file into the migration directory.
-- Do not apply it from CI, from this pull request, or on Production.
-- Do not run it until supabase/dev-only/dev_mail_pack_retry_preflight.sql
-- has been read on the DEV project.
--
-- This file schedules only dev-mail-pack-retry-recovery.
-- It does not schedule, unschedule, or replace dev-mail-dispatch-recovery.
-- It does not insert, update, or delete admin_private.dev_mail_dispatch_activation.
-- It does not set DEV_MAIL_DISPATCH_WORKER_ENABLED and it does not send mail.
--
-- Running it again removes every existing dev-mail-pack-retry-recovery row
-- and creates one schedule. It does not leave a second copy.
--
-- Before running it, a reviewer enables pg_cron and pg_net on the DEV project
-- and stores three Supabase Vault secret names. This file does not contain
-- any of those values and it does not read them:
--   dev_mail_pack_retry_url     the develop Admin preview pack-retry route
--   dev_mail_dispatch_bearer    the existing develop worker bearer
--   dev_mail_dispatch_bypass    the existing Vercel automation-bypass credential
-- The URL must be exactly
-- https://profilerelaunch-admin-git-develop-<name>.vercel.app/api/internal/jobs/dev-mail-pack-retry
-- with no query string. The bypass is sent as the x-vercel-protection-bypass
-- header by public.dev_mail_pack_retry_recovery_v1. The wake is an HTTP GET.
-- Deployment protection stays enabled. A 302, 401, timeout, or missing
-- response is a blocked wake, not a successful send.
--
-- When no Guided pack retry is due, that function returns before any HTTP
-- call. A succeeded or delivered pack email is not selected. The delivered
-- pack-ready message for PR-26-MEVY5P is therefore not eligible.

DO $setup$
DECLARE
  v_jobid bigint;
  v_dispatch_before integer;
  v_dispatch_after integer;
  v_activation_before text;
  v_activation_after text;
  v_pack_jobs integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'dev_mail_pack_retry_schedule: pg_cron is not installed';
  END IF;
  IF to_regprocedure('public.dev_mail_pack_retry_recovery_v1()') IS NULL THEN
    RAISE EXCEPTION 'dev_mail_pack_retry_schedule: public.dev_mail_pack_retry_recovery_v1() is not installed';
  END IF;
  IF to_regclass('admin_private.dev_mail_dispatch_activation') IS NULL THEN
    RAISE EXCEPTION 'dev_mail_pack_retry_schedule: general dispatch activation table is missing';
  END IF;

  SELECT count(*)::integer INTO v_dispatch_before
  FROM cron.job
  WHERE jobname = 'dev-mail-dispatch-recovery';

  SELECT coalesce(string_agg(id::text || ':' || active_from::text, ',' ORDER BY id), '')
  INTO v_activation_before
  FROM admin_private.dev_mail_dispatch_activation;

  FOR v_jobid IN
    SELECT jobid FROM cron.job WHERE jobname = 'dev-mail-pack-retry-recovery'
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;

  PERFORM cron.schedule(
    'dev-mail-pack-retry-recovery',
    '*/5 * * * *',
    'SELECT public.dev_mail_pack_retry_recovery_v1()'
  );

  SELECT count(*)::integer INTO v_pack_jobs
  FROM cron.job
  WHERE jobname = 'dev-mail-pack-retry-recovery';
  IF v_pack_jobs IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'dev_mail_pack_retry_schedule: expected one pack retry schedule, found %', v_pack_jobs;
  END IF;

  SELECT count(*)::integer INTO v_dispatch_after
  FROM cron.job
  WHERE jobname = 'dev-mail-dispatch-recovery';
  IF v_dispatch_after IS DISTINCT FROM v_dispatch_before THEN
    RAISE EXCEPTION 'dev_mail_pack_retry_schedule: general dispatch schedule changed';
  END IF;

  SELECT coalesce(string_agg(id::text || ':' || active_from::text, ',' ORDER BY id), '')
  INTO v_activation_after
  FROM admin_private.dev_mail_dispatch_activation;
  IF v_activation_after IS DISTINCT FROM v_activation_before THEN
    RAISE EXCEPTION 'dev_mail_pack_retry_schedule: general dispatch activation changed';
  END IF;
END
$setup$;
