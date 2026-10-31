-- NOT a migration. Read-only. Do not apply it as a schema change.
-- Do not run it on Production. Run it in the DEV SQL editor before
-- supabase/dev-only/dev_mail_pack_retry_schedule.sql.
--
-- Every statement below is a SELECT. This file does not schedule a job,
-- write Vault, change an activation row, or call a recovery function.
-- Do not project credential values or a bearer value in these queries.
--
-- Vault names, with no values:
--   dev_mail_pack_retry_url
--     https://profilerelaunch-admin-git-develop-<name>.vercel.app/api/internal/jobs/dev-mail-pack-retry
--   dev_mail_dispatch_bearer
--     the existing develop worker bearer, reused by the pack retry route
--   dev_mail_dispatch_bypass
--     the existing Vercel automation-bypass credential, sent as
--     x-vercel-protection-bypass
--
-- The original pack-ready communication is
-- PR-26-MEVY5P / 437a952d-10ed-497a-b67b-9eebb560c9cd.
-- A delivered message whose SEND_EMAIL job is SUCCEEDED does not match the
-- pack retry shape, so it is not eligible.

-- Catalog. Safe when pg_cron or Vault is absent.
SELECT
  to_regprocedure('public.dev_mail_pack_retry_recovery_v1()') IS NOT NULL AS pack_retry_recovery_installed,
  to_regprocedure('public.dev_mail_dispatch_claim_pack_retry_v1(text)') IS NOT NULL AS pack_retry_claim_installed,
  to_regprocedure('admin_private.dev_mail_pack_retry_due_v1()') IS NOT NULL AS pack_retry_due_installed,
  to_regclass('admin_private.dev_mail_dispatch_activation') IS NOT NULL AS general_activation_table_present,
  EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') AS pg_cron_installed,
  EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') AS vault_installed,
  EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20261031120000'
  ) AS migration_20261031120000_recorded;

-- General dispatch activation. Read the current row. Do not change it.
SELECT id, active_from
FROM admin_private.dev_mail_dispatch_activation
ORDER BY id;

-- Credential names only. Run when vault_installed is true.
-- Return the name column only.
SELECT required.name AS credential_name,
       EXISTS (
         SELECT 1 FROM vault.secrets existing
         WHERE existing.name = required.name
       ) AS named_in_vault
FROM (
  VALUES
    ('dev_mail_pack_retry_url'),
    ('dev_mail_dispatch_bearer'),
    ('dev_mail_dispatch_bypass')
) AS required(name)
ORDER BY required.name;

-- Pack cron and the general cron, side by side. Run when pg_cron_installed
-- is true. This does not unschedule either job.
SELECT jobid,
       jobname,
       schedule,
       active,
       command = 'SELECT public.dev_mail_pack_retry_recovery_v1()' AS pack_retry_command
FROM cron.job
WHERE jobname IN ('dev-mail-pack-retry-recovery', 'dev-mail-dispatch-recovery')
ORDER BY jobname, jobid;

-- Original delivered pack email. matches_pack_retry_shape stays false while
-- the message is delivered and the job is not a due RETRY.
SELECT cs.public_ref,
       c.id AS communication_id,
       c.template_key,
       c.lifecycle,
       c.delivery_status,
       j.status AS job_status,
       (
         c.template_key = 'GUIDED_PACK_READY'
         AND c.lifecycle = 'QUEUED'
         AND c.content_locked IS TRUE
         AND c.first_provider_attempt_at IS NOT NULL
         AND coalesce(c.delivery_status, 'NONE') = 'NONE'
         AND j.status = 'RETRY'
         AND j.scheduled_at <= now()
       ) AS matches_pack_retry_shape
FROM public.communications c
JOIN public.cases cs ON cs.id = c.case_id
LEFT JOIN admin_private.job_outbox o
  ON o.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
 AND o.topic = 'SEND_EMAIL'
 AND o.aggregate_id = c.id
LEFT JOIN admin_private.jobs j
  ON j.outbox_id = o.id
 AND j.job_type = 'SEND_EMAIL'
WHERE cs.public_ref = 'PR-26-MEVY5P'
  AND c.id = '437a952d-10ed-497a-b67b-9eebb560c9cd'
  AND c.template_key = 'GUIDED_PACK_READY';
