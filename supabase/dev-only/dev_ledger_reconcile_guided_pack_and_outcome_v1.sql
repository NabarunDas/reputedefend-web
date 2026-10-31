-- NOT a migration. Do not copy this file into supabase/migrations.
-- Do not run it from CI, from this pull request, or on Production
-- (cxwwekdzkkjjbiyofrov). The only intended target is the DEV SQL editor
-- for profilerelaunch-dev (rmzozuiamjcclvtgutgd).
--
-- Both source files were already executed in that DEV SQL editor. Their
-- canonical versions are absent from supabase_migrations.schema_migrations.
-- This file records those two versions and the complete source SQL that was
-- reviewed. It does not run that SQL. A later change may set appliedToDev
-- only after an independent reviewer has read the verification queries below.
--
-- Before running it, confirm all of the following independently:
--   * The SQL editor session is DEV rmzozuiamjcclvtgutgd, not Production.
--   * 20261030200000 is already recorded, and no other version follows it
--     except, on a rerun, these two canonical versions.
--   * extensions.digest(bytea, text) is already available. This file does
--     not create pgcrypto.
--   * The pack-ready and customer-outcome objects listed in the guards are
--     already installed, including service_role-only execution of the public
--     routines. This file does not create or replace them.
--   * The general dispatch activation row is the one that must stay off.
--     This file reads that table and does not write it.
--   * The pack-only retry schedule, if present, is the one that must stay.
--     This file does not schedule or unschedule anything.
--   * The SHA-256 constants below still match the two repository files.
--
-- The first run inserts 20261031120000 and then 20261031140000. A second run
-- inserts nothing when those rows already hold the same name and the same
-- single statement. A different statement, a different name, a missing
-- predecessor, a missing object, or a hash mismatch aborts the transaction.
-- Earlier ledger rows are not updated or deleted.
--
-- Reviewed source SHA-256, UTF-8 bytes of the repository files:
--   20261031120000  90fb457505352f538ca5553a90d940939e653e912d9dfb4889e0b54fd6d0fd11
--   20261031140000  3f22f59c86b5bed9b67f96165910fc19c981bd9151a789533d34f1540e390d9c

BEGIN;

DO $pr_dev_ledger_reconcile$
DECLARE
  v_pack text := $pr_dev_ledger_pack_source$-- Immediate DEV dispatch for a published Guided pack, and a retry wake for
-- that same pack email when the first provider attempt fails.
--
-- Source only. Do not apply this file to DEV or Production from the pull request.
-- It does not send mail, take a payment, insert an activation row, enable the
-- general worker, or change stored case rows. The sweep claim still requires
-- the activation watermark. These claims do not.
--
-- A case page does not call these functions. Publish calls the pack claim.
-- A due RETRY is claimed by dev_mail_dispatch_claim_pack_retry_v1, which a
-- database schedule may wake. When no pack retry is due, the recovery
-- function returns before any HTTP call. Idle cost, once a reviewer installs
-- the five-minute database schedule, is one count in the DEV database and
-- no Admin or Resend call. This file does not install that schedule.

-- Null when this pack may still send. Stale, unpublished, invalid and
-- superseded packs return a reason and are not leased.
CREATE FUNCTION admin_private.dev_mail_pack_send_reason_v1(p_pack uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.case_prepared_packs;
BEGIN
  SELECT * INTO pack FROM public.case_prepared_packs WHERE id = p_pack;
  IF pack.id IS NULL THEN
    RETURN 'not_queued';
  END IF;
  IF pack.status = 'STALE' THEN
    RETURN 'stale';
  END IF;
  IF pack.status = 'SUPERSEDED' THEN
    RETURN 'superseded';
  END IF;
  IF pack.status IS DISTINCT FROM 'APPROVED' THEN
    RETURN 'invalid';
  END IF;
  IF pack.published_at IS NULL OR pack.unpublished_at IS NOT NULL THEN
    RETURN 'unpublished';
  END IF;
  IF NOT admin_private.pack_publishable_v1(pack.id)
    OR admin_private.guided_pack_materials_reason_v1(pack.id) IS NOT NULL
  THEN
    RETURN 'invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.case_prepared_packs other
    WHERE other.case_id = pack.case_id
      AND other.id <> pack.id
      AND other.status IS DISTINCT FROM 'SUPERSEDED'
      AND other.pack_number > pack.pack_number
  ) OR EXISTS (
    SELECT 1
    FROM public.case_prepared_packs other
    WHERE other.case_id = pack.case_id
      AND other.id <> pack.id
      AND other.published_at IS NOT NULL
      AND other.unpublished_at IS NULL
  ) THEN
    RETURN 'superseded';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_send_reason_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Promotes one existing SEND_EMAIL outbox row and leases its job.
-- The caller has already chosen the communication. This does not insert a
-- communication, does not check the activation watermark, and does not call a
-- provider. p_recent refuses an unattempted message older than two hours
-- unless that message already has a due RETRY job.
CREATE FUNCTION admin_private.dev_mail_lease_queued_send_v1(
  p_communication uuid,
  p_customer_origin text,
  p_recent boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  comm public.communications;
  expected text;
  text_upload text;
  html_upload text;
  text_urls integer;
  html_urls integer;
  outbox admin_private.job_outbox;
  row admin_private.jobs;
  token uuid;
  attempt_no integer;
  v_key text;
  v_link text;
  v_case_ref text;
BEGIN
  IF p_communication IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT * INTO comm
  FROM public.communications
  WHERE id = p_communication
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.communications WHERE id = p_communication) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF comm.lifecycle IS DISTINCT FROM 'QUEUED' OR comm.content_locked IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF comm.template_key = 'PAYMENT_CONFIRMATION' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'payment_worker_owned');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.cases cs
    JOIN public.customers cu ON cu.id = cs.customer_id
    WHERE cs.id = comm.case_id
      AND comm.customer_id = cs.customer_id
      AND admin_private.normalize_email_v1(comm.recipient) = admin_private.normalize_email_v1(cu.email)
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'recipient_mismatch');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions s
    WHERE s.address_normalized = admin_private.normalize_email_v1(comm.recipient)
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'suppressed');
  END IF;
  IF comm.delivery_status IN (
    'PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE',
    'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed');
  END IF;
  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown');
  END IF;
  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT cs.public_ref INTO v_case_ref FROM public.cases cs WHERE cs.id = comm.case_id;
  v_link := admin_private.dev_mail_link_reason_v1(comm.template_key, comm.body_text, comm.body_html, p_customer_origin, v_case_ref);
  IF v_link IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', v_link);
  END IF;
  IF comm.template_key = 'GUIDED_PACK_READY' THEN
    expected := 'documents';
    text_upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    html_upload := substring(coalesce(comm.body_html, '') from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    text_urls := admin_private.fulfilment_page_count_v1(comm.body_text, expected);
    html_urls := admin_private.fulfilment_page_count_v1(comm.body_html, expected);
    IF comm.body_html IS NULL
      OR text_urls IS DISTINCT FROM 1
      OR html_urls IS DISTINCT FROM 1
      OR text_upload IS DISTINCT FROM html_upload
      OR text_upload IS NULL
      OR position(p_customer_origin || '/portal/cases/' IN text_upload) IS DISTINCT FROM 1
      OR right(text_upload, length(expected)) IS DISTINCT FROM expected
      OR position('/action/' in comm.body_text) > 0
      OR position('/action/' in comm.body_html) > 0
    THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
    END IF;
  END IF;
  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = v_key FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF outbox.topic IS DISTINCT FROM 'SEND_EMAIL'
    OR outbox.aggregate_id IS DISTINCT FROM comm.id
    OR outbox.payload->>'communicationId' IS DISTINCT FROM comm.id::text
    OR outbox.payload->>'contentVersion' IS DISTINCT FROM comm.content_version::text
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF p_recent
    AND comm.first_provider_attempt_at IS NULL
    AND coalesce(comm.queued_at, comm.created_at) < now() - interval '2 hours'
    AND NOT EXISTS (
      SELECT 1
      FROM admin_private.jobs j
      WHERE j.outbox_id = outbox.id
        AND j.job_type = 'SEND_EMAIL'
        AND j.status = 'RETRY'
        AND j.scheduled_at <= now()
    )
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;
  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;
  IF comm.first_provider_attempt_at IS NOT NULL AND EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RUNNING'
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at >= now()
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  IF comm.first_provider_attempt_at IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RETRY'
      AND j.scheduled_at <= now()
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RUNNING'
      AND j.lease_expires_at IS NOT NULL
      AND j.lease_expires_at >= now()
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    WHERE j.outbox_id = outbox.id
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'DEAD_LETTER'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter');
  END IF;
  IF outbox.promoted_at IS NULL THEN
    INSERT INTO admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
    VALUES (outbox.id, 'SEND_EMAIL', outbox.event_key, outbox.payload, 'PENDING', outbox.available_at)
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox
      SET promoted_at = now(), last_error = NULL
      WHERE id = outbox.id AND promoted_at IS NULL;
  END IF;
  SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id FOR UPDATE;
  IF row.id IS NULL OR row.job_type IS DISTINCT FROM 'SEND_EMAIL' OR row.idempotency_key IS DISTINCT FROM v_key THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', row.status);
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'jobId', row.id);
  END IF;
  IF row.status IN ('PENDING', 'RETRY') AND row.scheduled_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'jobId', row.id);
  END IF;
  IF row.status = 'RUNNING' THEN
    IF row.attempts >= row.max_attempts THEN
      PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'DEAD_LETTER', 'Maximum attempts exhausted after worker lease expiry');
      UPDATE admin_private.jobs
        SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
            lease_owner = NULL, lease_token = NULL,
            last_error = 'Maximum attempts exhausted after worker lease expiry',
            updated_at = now(), record_version = row.record_version + 1
        WHERE id = row.id AND status = 'RUNNING';
      RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
          lease_owner = NULL, lease_token = NULL,
          last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
  END IF;
  token := extensions.gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING', claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-mail-dispatch', lease_token = token,
        attempts = row.attempts + 1, updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-mail-dispatch', token, NULL);
  RETURN jsonb_build_object(
    'status', 'success',
    'replay', false,
    'jobId', row.id,
    'jobType', row.job_type,
    'idempotencyKey', row.idempotency_key,
    'payload', row.payload,
    'leaseToken', token
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.dev_mail_lease_queued_send_v1(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- The caller names a pack, not a communication. Only the announcement already
-- stored for the current published pack can be leased. A second call does not
-- insert another communication. A succeeded or delivered announcement is not
-- leased again.
CREATE FUNCTION public.dev_mail_dispatch_claim_pack_v1(
  p_pack uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  pack public.case_prepared_packs;
  cs public.cases;
  comm public.communications;
  v_comm uuid;
  v_reason text;
BEGIN
  IF p_pack IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT * INTO pack
  FROM public.case_prepared_packs
  WHERE id = p_pack
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.case_prepared_packs WHERE id = p_pack) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  v_reason := admin_private.dev_mail_pack_send_reason_v1(pack.id);
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', v_reason);
  END IF;
  SELECT communication_id INTO v_comm
  FROM public.guided_pack_announcements
  WHERE pack_id = pack.id;
  IF v_comm IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  SELECT * INTO comm FROM public.communications WHERE id = v_comm;
  SELECT * INTO cs FROM public.cases WHERE id = pack.case_id;
  IF comm.id IS NULL
    OR comm.template_key IS DISTINCT FROM 'GUIDED_PACK_READY'
    OR comm.case_id IS DISTINCT FROM pack.case_id
    OR comm.customer_id IS DISTINCT FROM cs.customer_id
    OR comm.content_locked IS NOT TRUE
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  RETURN admin_private.dev_mail_lease_queued_send_v1(comm.id, p_customer_origin, false);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_pack_v1(uuid, text)
  TO service_role;

-- Due Guided pack retries only. An unattempted message, a succeeded job, a
-- delivered message, and a message whose provider acceptance is unknown are
-- not returned. The caller cannot name a communication.
CREATE FUNCTION admin_private.dev_mail_pack_retry_due_v1()
RETURNS TABLE(communication_id uuid, pack_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, a.pack_id
  FROM public.communications c
  JOIN public.guided_pack_announcements a ON a.communication_id = c.id
  JOIN public.cases cs ON cs.id = c.case_id
  JOIN public.customers cu ON cu.id = cs.customer_id
  JOIN admin_private.job_outbox o
    ON o.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
   AND o.topic = 'SEND_EMAIL'
   AND o.aggregate_id = c.id
  JOIN admin_private.jobs j
    ON j.outbox_id = o.id
   AND j.job_type = 'SEND_EMAIL'
   AND j.status = 'RETRY'
   AND j.scheduled_at <= now()
  WHERE c.template_key = 'GUIDED_PACK_READY'
    AND c.lifecycle = 'QUEUED'
    AND c.content_locked IS TRUE
    AND c.first_provider_attempt_at IS NOT NULL
    AND c.customer_id = cs.customer_id
    AND coalesce(c.delivery_status, 'NONE') = 'NONE'
    AND admin_private.normalize_email_v1(c.recipient) = admin_private.normalize_email_v1(cu.email)
    AND admin_private.dev_mail_pack_send_reason_v1(a.pack_id) IS NULL
    AND admin_private.dev_mail_link_reason_v1(c.template_key, c.body_text, c.body_html, NULL, cs.public_ref) IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(c.recipient)
    )
  ORDER BY j.scheduled_at, c.id
  LIMIT 5;
$$;

REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_retry_due_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.dev_mail_dispatch_claim_pack_retry_v1(
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_comm uuid;
  v_pack uuid;
  v_reason text;
BEGIN
  IF p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT due.communication_id, due.pack_id INTO v_comm, v_pack
  FROM admin_private.dev_mail_pack_retry_due_v1() AS due
  LIMIT 1;
  IF v_comm IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  PERFORM 1
  FROM public.case_prepared_packs
  WHERE id = v_pack
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.case_prepared_packs WHERE id = v_pack) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  v_reason := admin_private.dev_mail_pack_send_reason_v1(v_pack);
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', v_reason);
  END IF;
  RETURN admin_private.dev_mail_lease_queued_send_v1(v_comm, p_customer_origin, true);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_pack_retry_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_pack_retry_v1(text)
  TO service_role;

CREATE FUNCTION admin_private.dev_mail_pack_retry_wake_credentials_v1(
  p_url text, p_bearer text, p_bypass text
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_url IS NULL
    OR p_url !~ '^https://profilerelaunch-admin-git-develop-[a-z0-9-]+\.vercel\.app/api/internal/jobs/dev-mail-pack-retry$'
  THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_url');
  END IF;
  IF p_bearer IS NULL OR length(p_bearer) < 32 OR p_bearer ~ '[[:space:]]' OR position(p_bearer IN p_url) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_bearer');
  END IF;
  IF p_bypass IS NULL OR length(p_bypass) < 32 OR p_bypass ~ '[[:space:]]' OR position(p_bypass IN p_url) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_bypass');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_retry_wake_credentials_v1(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- The last pg_net request id for a pack retry. A queued request is not
-- provider acceptance. This row is not the general worker request.
CREATE TABLE admin_private.dev_mail_pack_retry_http (
  id smallint PRIMARY KEY CHECK (id = 1),
  request_id bigint NOT NULL,
  requested_at timestamptz NOT NULL
);
ALTER TABLE admin_private.dev_mail_pack_retry_http ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.dev_mail_pack_retry_http FROM PUBLIC, anon, authenticated, service_role;

-- Empty retry set returns before any network call. pg_net and Vault stay optional.
-- A succeeded or delivered pack email is not eligible, so it is not woken.
CREATE FUNCTION public.dev_mail_pack_retry_recovery_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
  v_url text;
  v_bearer text;
  v_bypass text;
  v_http integer;
  v_timed boolean;
  v_error text;
  v_found boolean;
  v_stored bigint;
  v_request bigint;
  v_requested timestamptz;
  v_credentials jsonb;
BEGIN
  SELECT count(*) INTO n FROM admin_private.dev_mail_pack_retry_due_v1();
  IF n = 0 THEN
    RETURN jsonb_build_object('status', 'success', 'eligible', 0, 'wake', 'not_needed');
  END IF;
  IF NOT (
      EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_net')
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'net' AND p.proname = 'http_get'
      )
    )
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault')
  THEN
    RETURN jsonb_build_object('status', 'success', 'eligible', n, 'wake', 'not_configured');
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_url USING 'dev_mail_pack_retry_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_bearer USING 'dev_mail_dispatch_bearer';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_bypass USING 'dev_mail_dispatch_bypass';
  v_credentials := admin_private.dev_mail_pack_retry_wake_credentials_v1(v_url, v_bearer, v_bypass);
  IF coalesce(v_credentials->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object('status', 'success', 'eligible', n, 'wake', 'not_configured', 'reason', v_credentials->>'reason');
  END IF;
  SELECT h.request_id, h.requested_at INTO v_stored, v_requested
  FROM admin_private.dev_mail_pack_retry_http h
  WHERE h.id = 1;
  IF v_stored IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'net' AND c.relname = '_http_response'
  ) THEN
    v_found := false;
    EXECUTE 'SELECT status_code, timed_out, error_msg, true FROM net._http_response WHERE id = $1'
      INTO v_http, v_timed, v_error, v_found USING v_stored;
    IF v_found IS NOT TRUE THEN
      IF v_requested > now() - interval '2 minutes' THEN
        RETURN jsonb_build_object('status', 'pending', 'eligible', n, 'wake', 'in_flight', 'requestId', v_stored);
      END IF;
      DELETE FROM admin_private.dev_mail_pack_retry_http WHERE id = 1;
      RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'missing', 'requestId', v_stored);
    END IF;
    IF coalesce(v_timed, false) THEN
      DELETE FROM admin_private.dev_mail_pack_retry_http WHERE id = 1;
      RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'timed_out', 'requestId', v_stored);
    END IF;
    IF v_error IS NOT NULL OR v_http IS NULL OR v_http >= 400 OR v_http IN (301, 302, 303, 307, 308) THEN
      DELETE FROM admin_private.dev_mail_pack_retry_http WHERE id = 1;
      RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'blocked', 'httpStatus', v_http, 'requestId', v_stored);
    END IF;
    DELETE FROM admin_private.dev_mail_pack_retry_http WHERE id = 1;
  END IF;
  BEGIN
    EXECUTE 'SELECT net.http_get(url := $1, headers := $2, timeout_milliseconds := $3)'
      INTO v_request
      USING v_url,
        jsonb_build_object(
          'Authorization', 'Bearer ' || v_bearer,
          'Content-Type', 'application/json',
          'x-vercel-protection-bypass', v_bypass
        ),
        5000;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'failed');
  END;
  IF v_request IS NULL THEN
    RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'failed');
  END IF;
  INSERT INTO admin_private.dev_mail_pack_retry_http(id, request_id, requested_at)
  VALUES (1, v_request, now())
  ON CONFLICT (id) DO UPDATE
    SET request_id = EXCLUDED.request_id, requested_at = EXCLUDED.requested_at;
  RETURN jsonb_build_object('status', 'pending', 'eligible', n, 'wake', 'requested', 'requestId', v_request);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'failed');
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_pack_retry_recovery_v1()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_pack_retry_recovery_v1()
  TO service_role;

-- The first failure schedules RETRY one minute later. This trigger does not
-- send mail. While that retry is not yet due, recovery returns not_needed.
CREATE FUNCTION admin_private.dev_mail_pack_retry_wake_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.job_type IS DISTINCT FROM 'SEND_EMAIL' OR NEW.status IS DISTINCT FROM 'RETRY' THEN
    RETURN NEW;
  END IF;
  PERFORM public.dev_mail_pack_retry_recovery_v1();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.dev_mail_pack_retry_wake_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER dev_mail_pack_retry_wake
  AFTER UPDATE OF status ON admin_private.jobs
  FOR EACH ROW
  WHEN (NEW.status = 'RETRY' AND OLD.status IS DISTINCT FROM 'RETRY' AND NEW.job_type = 'SEND_EMAIL')
  EXECUTE FUNCTION admin_private.dev_mail_pack_retry_wake_v1();

NOTIFY pgrst, 'reload schema';
$pr_dev_ledger_pack_source$;
  v_outcome text := $pr_dev_ledger_outcome_source$BEGIN;

-- Guided customer handover and Google-outcome reporting. Source only.
-- Do not apply this file to DEV or Production from this change.
-- It does not send mail, charge a card, close a case, or edit a stored outcome.
-- A customer report is not written as a ProfileRelaunch case_submissions row.

ALTER TABLE public.guided_customer_reports
  ADD COLUMN outcome text,
  ADD COLUMN decided_on date,
  ADD COLUMN evidence_document_id uuid;

ALTER TABLE public.guided_customer_reports
  DROP CONSTRAINT guided_customer_reports_kind_check;
ALTER TABLE public.guided_customer_reports
  DROP CONSTRAINT guided_customer_reports_shape_check;

ALTER TABLE public.guided_customer_reports
  ADD CONSTRAINT guided_customer_reports_kind_check
  CHECK (kind IN ('CORRECTION', 'GOOGLE_SUBMISSION', 'GOOGLE_OUTCOME'));

ALTER TABLE public.guided_customer_reports
  ADD CONSTRAINT guided_customer_reports_evidence_fk
  FOREIGN KEY (evidence_document_id) REFERENCES public.case_documents(id) ON DELETE RESTRICT;

ALTER TABLE public.guided_customer_reports
  ADD CONSTRAINT guided_customer_reports_shape_check CHECK (
    (kind = 'CORRECTION' AND submitted_on IS NULL AND google_reference IS NULL AND task_id IS NOT NULL
      AND outcome IS NULL AND decided_on IS NULL AND evidence_document_id IS NULL)
    OR (
      kind = 'GOOGLE_SUBMISSION' AND submitted_on IS NOT NULL
      AND outcome IS NULL AND decided_on IS NULL AND evidence_document_id IS NULL
      AND (
        google_reference IS NULL
        OR (
          length(btrim(google_reference)) BETWEEN 1 AND 200
          AND google_reference ~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          AND position('http' IN lower(google_reference)) = 0
        )
      )
    )
    OR (
      kind = 'GOOGLE_OUTCOME' AND submitted_on IS NULL AND decided_on IS NOT NULL AND task_id IS NOT NULL
      AND outcome IN ('STILL_WAITING', 'REINSTATED', 'NOT_REINSTATED', 'MORE_INFORMATION', 'OTHER')
      AND (
        google_reference IS NULL
        OR (
          length(btrim(google_reference)) BETWEEN 1 AND 200
          AND google_reference ~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          AND position('http' IN lower(google_reference)) = 0
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.customer_portal_case_documents_v1(p_token_hash text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid; cs public.cases;
  b public.businesses; loc public.locations; body jsonb; p public.case_prepared_packs;
  ord public.service_orders; pack_json jsonb; selectors jsonb; reason text;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO b FROM public.businesses WHERE id = cs.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = cs.location_id AND business_id = cs.business_id;
  IF b.id IS NULL OR loc.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  body := admin_private.customer_portal_case_evidence_v1(cs.id);
  reason := admin_private.guided_settlement_reason_v1(cs.id);
  pack_json := NULL;
  IF cs.service_track = 'GUIDED' AND reason IS NOT NULL THEN
    body := jsonb_set(body, '{documents}', '[]'::jsonb);
  ELSIF cs.service_track = 'GUIDED' AND reason IS NULL THEN
    SELECT * INTO p FROM public.case_prepared_packs
    WHERE case_id = cs.id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
    LIMIT 1;
    IF p.id IS NOT NULL AND admin_private.pack_publishable_v1(p.id) THEN
      SELECT * INTO ord FROM public.service_orders candidate
      WHERE candidate.case_id = cs.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
        AND candidate.payment_model = 'UPFRONT';
      SELECT coalesce(jsonb_agg('pd-' || i.position::text ORDER BY i.position), '[]'::jsonb) INTO selectors
      FROM public.case_prepared_pack_items i
      INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
      WHERE i.pack_id = p.id AND r.role = 'INSTRUCTIONS';
      pack_json := jsonb_build_object(
        'title', CASE ord.service_code WHEN 'GUIDED_REVIEW' THEN 'Guided Review submission pack' ELSE 'Guided Relaunch submission pack' END,
        'serviceName', CASE ord.service_code WHEN 'GUIDED_REVIEW' THEN 'Guided Review' ELSE 'Guided Relaunch' END,
        'packNumber', p.pack_number,
        'instructions', 'You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you.',
        'instructionSelectors', coalesce(selectors, '[]'::jsonb),
        'customerSubmitted', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION'
        ),
        'correctionRequested', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          INNER JOIN public.case_tasks task ON task.id = report.task_id
          WHERE report.pack_id = p.id AND report.kind = 'CORRECTION' AND task.status = 'OPEN'
        )
,
        'outcomeReported', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_OUTCOME'
        ),
        'outcomeReviewed', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          INNER JOIN public.case_tasks task ON task.id = report.task_id
          WHERE report.id = (
            SELECT latest.id FROM public.guided_customer_reports latest
            WHERE latest.pack_id = p.id AND latest.kind = 'GOOGLE_OUTCOME'
            ORDER BY latest.created_at DESC, latest.id DESC
            LIMIT 1
          )
          AND task.status <> 'OPEN'
        )
      );
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'case', jsonb_build_object(
      'reference', cs.public_ref,
      'caseType', cs.case_type,
      'serviceTrack', cs.service_track,
      'businessName', b.display_name,
      'locationName', loc.location_name
    ),
    'requests', body->'requests',
    'submissions', body->'submissions',
    'documents', body->'documents',
    'pack', pack_json
  );
END; $$;


CREATE OR REPLACE FUNCTION public.customer_portal_guided_handover_v1(
  p_token_hash text, p_request uuid, p_reference text, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_customer uuid; v_auth uuid; v_email text; v_case uuid;
  cs public.cases; p public.case_prepared_packs; fp text; cached jsonb; result jsonb;
  note text; reference text; submitted date; decided date; task_id uuid;
  outcome text; selector text; evidence_request uuid; evidence_id uuid;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_operation NOT IN ('request_correction', 'report_submission', 'report_outcome')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_reference, p_operation, p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT response INTO cached FROM admin_private.guided_handover_receipts
  WHERE request_id = p_request AND actor_id = v_auth AND fingerprint = fp;
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF EXISTS (SELECT 1 FROM admin_private.guided_handover_receipts WHERE request_id = p_request) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer FOR UPDATE;
  IF cs.id IS NULL OR cs.service_track IS DISTINCT FROM 'GUIDED' OR cs.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF admin_private.guided_settlement_reason_v1(cs.id) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unavailable');
  END IF;
  SELECT * INTO p FROM public.case_prepared_packs
  WHERE case_id = cs.id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
  LIMIT 1;
  IF p.id IS NULL OR NOT admin_private.pack_publishable_v1(p.id) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  note := btrim(coalesce(p_data->>'note', ''));
  IF length(note) NOT BETWEEN 10 AND 2000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'request_correction' THEN
    IF (p_data - 'note') <> '{}'::jsonb OR p_data ? 'submittedOn' OR p_data ? 'googleReference' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.guided_customer_reports report
      INNER JOIN public.case_tasks task ON task.id = report.task_id
      WHERE report.pack_id = p.id AND report.kind = 'CORRECTION' AND task.status = 'OPEN'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.case_tasks(
      case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy
    ) VALUES (
      cs.id, 'Review a correction to the Guided pack', 'ADMIN', 'FOLLOW_UP', now() + interval '2 days',
      'The customer asked for a correction before submitting the pack to Google', 'Europe/London', 'MANUAL_QUEUE'
    ) RETURNING id INTO task_id;
    INSERT INTO public.guided_customer_reports(case_id, customer_id, pack_id, kind, note, task_id)
    VALUES (cs.id, cs.customer_id, p.id, 'CORRECTION', note, task_id);
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility)
    VALUES (cs.id, v_auth, 'CUSTOMER_CORRECTION', note, 'CUSTOMER');
    result := jsonb_build_object('status', 'success', 'kind', 'CORRECTION');
  ELSIF p_operation = 'report_submission' THEN
    IF (p_data - 'note' - 'submittedOn' - 'googleReference') <> '{}'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    reference := nullif(btrim(coalesce(p_data->>'googleReference', '')), '');
    BEGIN submitted := (p_data->>'submittedOn')::date; EXCEPTION WHEN OTHERS THEN submitted := NULL; END;
    IF submitted IS NULL OR submitted > current_date OR submitted < DATE '2020-01-01'
      OR (
        reference IS NOT NULL AND (
          reference !~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          OR position('http' IN lower(reference)) > 0
        )
      )
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (SELECT 1 FROM public.guided_customer_reports report WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION') THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    INSERT INTO public.case_tasks(
      case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy
    ) VALUES (
      cs.id, 'Review the customer''s Google submission report', 'ADMIN', 'FOLLOW_UP', now() + interval '2 days',
      'The customer reported that they submitted the Guided pack to Google', 'Europe/London', 'MANUAL_QUEUE'
    ) RETURNING id INTO task_id;
    INSERT INTO public.guided_customer_reports(
      case_id, customer_id, pack_id, kind, note, submitted_on, google_reference, task_id
    ) VALUES (cs.id, cs.customer_id, p.id, 'GOOGLE_SUBMISSION', note, submitted, reference, task_id);
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
    VALUES (
      cs.id, v_auth, 'CUSTOMER_REPORTED_SUBMISSION', note, 'CUSTOMER',
      jsonb_build_object('recordedBy', 'customer', 'profileRelaunchSubmitted', false)
    );
    result := jsonb_build_object('status', 'success', 'kind', 'GOOGLE_SUBMISSION');
  ELSE
    IF (p_data - 'note' - 'outcome' - 'decidedOn' - 'googleReference' - 'evidenceSelector') <> '{}'::jsonb
      OR NOT (p_data ? 'outcome' AND p_data ? 'decidedOn')
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.guided_customer_reports report
      WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION'
    ) THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'submission'); END IF;
    outcome := p_data->>'outcome';
    IF outcome NOT IN ('STILL_WAITING', 'REINSTATED', 'NOT_REINSTATED', 'MORE_INFORMATION', 'OTHER') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    reference := nullif(btrim(coalesce(p_data->>'googleReference', '')), '');
    BEGIN decided := (p_data->>'decidedOn')::date; EXCEPTION WHEN OTHERS THEN decided := NULL; END;
    IF decided IS NULL OR decided > current_date OR decided < DATE '2020-01-01'
      OR (
        reference IS NOT NULL AND (
          reference !~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          OR position('http' IN lower(reference)) > 0
        )
      )
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    evidence_id := NULL;
    IF p_data ? 'evidenceSelector' THEN
      selector := btrim(coalesce(p_data->>'evidenceSelector', ''));
      evidence_request := admin_private.customer_portal_evidence_selector_v1(cs.id, selector);
      IF evidence_request IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      SELECT d.id INTO evidence_id
      FROM public.case_documents d
      INNER JOIN public.case_document_versions v ON v.document_id = d.id
      WHERE d.case_id = cs.id
        AND d.evidence_request_id = evidence_request
        AND v.customer_evidence_request_id = evidence_request
        AND v.submission_source = 'CUSTOMER'
        AND v.upload_status = 'UPLOADED'
        AND v.uploaded_at IS NOT NULL
      ORDER BY v.uploaded_at DESC, v.id DESC
      LIMIT 1;
      IF evidence_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    END IF;
    SELECT task.id INTO task_id
    FROM public.case_tasks task
    INNER JOIN public.guided_customer_reports report ON report.task_id = task.id
    WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_OUTCOME' AND task.status = 'OPEN'
    LIMIT 1;
    IF task_id IS NULL THEN
      INSERT INTO public.case_tasks(
        case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy
      ) VALUES (
        cs.id, 'Review the customer''s Google outcome report', 'ADMIN', 'FOLLOW_UP', now() + interval '2 days',
        'The customer reported a Google outcome for the Guided pack', 'Europe/London', 'MANUAL_QUEUE'
      ) RETURNING id INTO task_id;
    END IF;
    INSERT INTO public.guided_customer_reports(
      case_id, customer_id, pack_id, kind, note, google_reference, task_id, outcome, decided_on, evidence_document_id
    ) VALUES (
      cs.id, cs.customer_id, p.id, 'GOOGLE_OUTCOME', note, reference, task_id, outcome, decided, evidence_id
    );
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
    VALUES (
      cs.id, v_auth, 'CUSTOMER_REPORTED_OUTCOME', note, 'CUSTOMER',
      jsonb_build_object('outcome', outcome, 'verified', false, 'recordedBy', 'customer')
    );
    result := jsonb_build_object('status', 'success', 'kind', 'GOOGLE_OUTCOME', 'outcome', outcome);
  END IF;
  INSERT INTO admin_private.guided_handover_receipts VALUES (p_request, v_auth, fp, result, now());
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.customer_portal_case_documents_v1(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_case_documents_v1(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION admin_private.fulfilment_snapshot_reason_v1(
  p_case uuid, p_template text, p_subject text, p_text text, p_html text, p_origin text
) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  c public.cases;
  ord public.service_orders;
  page text;
  button text;
  expected text;
  amount_label text;
  service_name text;
  stripped text;
  settlement text;
BEGIN
  settlement := admin_private.guided_settlement_reason_v1(p_case);
  IF settlement IS NOT NULL THEN RETURN settlement; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT';
  service_name := CASE ord.service_code WHEN 'GUIDED_RELAUNCH' THEN 'Guided Relaunch' ELSE 'Guided Review' END;
  amount_label := '£' || (ord.amount_minor / 100)::text || '.' || lpad((ord.amount_minor % 100)::text, 2, '0') || ' GBP';
  IF p_template = 'PAYMENT_CONFIRMATION' THEN
    page := 'payments';
    button := 'View your receipt';
  ELSIF p_template IN ('GUIDED_PACK_READY', 'GUIDED_COMPLETION') THEN
    page := 'documents';
    button := 'View your completed pack';
  ELSE
    RETURN 'template';
  END IF;
  expected := p_origin || '/portal/cases/' || c.public_ref || '/' || page;
  IF p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 8 AND 200
    OR position(c.public_ref IN p_subject) = 0
    OR (p_template = 'PAYMENT_CONFIRMATION' AND position(ord.public_ref IN p_subject) = 0)
    OR position(service_name IN coalesce(p_text, '')) = 0
    OR position(amount_label IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_html, '')) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN coalesce(p_text, '')) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN coalesce(p_text, '')) = 0
    OR position('#t=' IN coalesce(p_subject, '') || coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('/action/' IN coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('pi_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR position('cus_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR admin_private.fulfilment_page_count_v1(p_text, page) IS DISTINCT FROM 1
    OR admin_private.fulfilment_page_count_v1(p_html, page) IS DISTINCT FROM 1
    OR position(expected IN coalesce(p_text, '')) = 0
    OR position(expected IN coalesce(p_html, '')) = 0
    OR position('reply to this email' IN lower(coalesce(p_text, ''))) = 0
    OR position('reply to this email' IN lower(coalesce(p_html, ''))) = 0
  THEN RETURN 'snapshot'; END IF;
  IF p_template IN ('GUIDED_PACK_READY', 'GUIDED_COMPLETION') AND position(
    'You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you.'
    IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  IF p_template = 'GUIDED_COMPLETION' AND position(
    'Relaunch Guard is optional. This email does not enrol you.' IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  IF p_template = 'GUIDED_COMPLETION' AND position(
    'Your ' || service_name || ' service is complete. Your submission pack remains available in your account. You can tell us when you''ve submitted it to Google and update us when you hear back.'
    IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_text, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_html, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_guided_fulfilment_close_v1(
  p_token text, p_request uuid, p_case uuid, p_version integer, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  s jsonb;
  c public.cases;
  r admin_private.case_command_receipts;
  actor uuid;
  fp text;
  note text;
  summary text;
  pack uuid;
  published integer;
  mail jsonb;
  comm uuid;
  result jsonb;
  now_time timestamptz := now();
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_data IS NULL
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 65536
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_data - ARRAY['note','summary','subject','bodyText','bodyHtml','fromAddress','replyTo','customerOrigin','sendEnabled'] <> '{}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  note := p_data->>'note';
  summary := p_data->>'summary';
  IF note IS NULL OR length(btrim(note)) NOT BETWEEN 10 AND 1000
    OR summary IS NULL OR length(btrim(summary)) NOT BETWEEN 10 AND 2000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  actor := (s->>'userId')::uuid;
  fp := md5(jsonb_build_array(p_case, p_version, 'guided_close', p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = actor AND r.fingerprint = fp THEN RETURN r.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL OR c.workflow_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF c.status = 'CANCELLED' THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'cancelled'); END IF;
  IF c.status = 'CLOSED' THEN
    IF c.service_track IS DISTINCT FROM 'GUIDED' OR c.outcome IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.guided_service_deliveries delivery WHERE delivery.case_id = c.id)
    THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'closed'); END IF;
    mail := admin_private.queue_guided_completion_v1(c.id, actor, p_data);
    IF mail->>'status' NOT IN ('success', 'not_sent') THEN
      RAISE EXCEPTION 'fulfilment_email:%', coalesce(mail->>'reason', 'mail') USING ERRCODE = 'P0001';
    END IF;
    comm := NULLIF(mail->>'id', '')::uuid;
    IF comm IS NOT NULL THEN
      UPDATE public.guided_service_deliveries
        SET communication_id = comm
        WHERE case_id = c.id AND communication_id IS NULL;
    END IF;
    result := jsonb_build_object(
      'status', 'success',
      'id', c.id,
      'completionEmail', CASE WHEN mail->>'replay' = 'true' THEN 'already_queued' ELSE mail->>'status' END,
      'recovered', true
    );
    INSERT INTO admin_private.case_command_receipts VALUES (p_request, actor, fp, result, now_time);
    RETURN result;
  END IF;
  IF c.service_track IS DISTINCT FROM 'GUIDED' THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'not_guided'); END IF;
  IF c.outcome IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'outcome_recorded'); END IF;
  IF admin_private.guided_settlement_reason_v1(c.id) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', admin_private.guided_settlement_reason_v1(c.id));
  END IF;
  IF EXISTS (
      SELECT 1 FROM public.case_tasks task
      WHERE task.case_id = c.id AND task.status = 'OPEN'
        AND NOT EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          WHERE report.task_id = task.id
            AND report.case_id = c.id
            AND report.kind IN ('GOOGLE_SUBMISSION', 'GOOGLE_OUTCOME')
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.case_submissions a
      WHERE a.case_id = c.id AND NOT EXISTS (SELECT 1 FROM public.case_submission_results b WHERE b.submission_id = a.id)
    )
  THEN RETURN jsonb_build_object('status', 'open_work'); END IF;
  SELECT count(*)::int INTO published FROM public.case_prepared_packs p
  WHERE p.case_id = c.id AND p.status = 'APPROVED' AND p.published_at IS NOT NULL AND p.unpublished_at IS NULL;
  IF published IS DISTINCT FROM 1 THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'pack'); END IF;
  SELECT p.id INTO pack FROM public.case_prepared_packs p
  WHERE p.case_id = c.id AND p.status = 'APPROVED' AND p.published_at IS NOT NULL AND p.unpublished_at IS NULL
    AND admin_private.pack_publishable_v1(p.id);
  IF pack IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'pack'); END IF;
  mail := admin_private.queue_guided_completion_v1(c.id, actor, p_data);
  IF mail->>'status' NOT IN ('success', 'not_sent') THEN
    RAISE EXCEPTION 'fulfilment_email:%', coalesce(mail->>'reason', 'mail') USING ERRCODE = 'P0001';
  END IF;
  comm := NULLIF(mail->>'id', '')::uuid;
  INSERT INTO public.guided_service_deliveries(case_id, pack_id, communication_id)
  VALUES (c.id, pack, comm)
  ON CONFLICT (case_id) DO UPDATE
    SET pack_id = EXCLUDED.pack_id,
        communication_id = COALESCE(EXCLUDED.communication_id, public.guided_service_deliveries.communication_id);
  UPDATE public.cases
    SET status = 'CLOSED', work_stage = 'FINISHED', closure_summary = summary,
        closed_at = now_time, next_action = '', next_action_at = NULL
  WHERE id = c.id;
  INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
  VALUES (
    c.id, actor, 'close', note, 'INTERNAL',
    jsonb_build_object('fulfilment', 'guided_preparation', 'summary', summary, 'packId', pack)
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'CASE_CHANGED', 'success', c.id, p_request, 'case', note,
    jsonb_build_object('operation', 'guided_close', 'previousVersion', p_version)
  );
  result := jsonb_build_object('status', 'success', 'id', c.id, 'completionEmail', mail->>'status');
  INSERT INTO admin_private.case_command_receipts VALUES (p_request, actor, fp, result, now_time);
  RETURN result;
EXCEPTION
  WHEN raise_exception THEN
    IF left(SQLERRM, 17) = 'fulfilment_email:' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', substr(SQLERRM, 18));
    END IF;
    RAISE;
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;


CREATE OR REPLACE FUNCTION admin_private.customer_portal_case_timeline_v1(
  p_case_id uuid,
  p_customer_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT coalesce((
    SELECT jsonb_agg(
      jsonb_build_object('code', code, 'occurredAt', occurred_at)
      ORDER BY occurred_at DESC, ordinal, source_id
    )
    FROM (
      SELECT code, occurred_at, ordinal, source_id
      FROM (
        SELECT
          'CASE_RECEIVED'::text AS code,
          c.submitted_at AS occurred_at,
          1 AS ordinal,
          c.id AS source_id
        FROM public.cases c
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'EVIDENCE_SUBMITTED', v.uploaded_at, 2, v.id
        FROM public.cases c
        JOIN public.case_document_versions v ON v.submission_source = 'CUSTOMER'
          AND v.upload_status = 'UPLOADED'
          AND v.uploaded_at IS NOT NULL
        JOIN public.case_documents d ON d.id = v.document_id AND d.case_id = c.id
        JOIN public.evidence_requests r ON r.id = v.customer_evidence_request_id AND r.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND (d.evidence_request_id IS NULL OR d.evidence_request_id = r.id)

        UNION ALL
        SELECT 'EVIDENCE_ACCEPTED', v.reviewed_at, 3, v.id
        FROM public.cases c
        JOIN public.case_document_versions v ON v.submission_source = 'CUSTOMER'
          AND v.review_status = 'ACCEPTED'
          AND v.reviewed_at IS NOT NULL
        JOIN public.case_documents d ON d.id = v.document_id AND d.case_id = c.id
        JOIN public.evidence_requests r ON r.id = v.customer_evidence_request_id AND r.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND (d.evidence_request_id IS NULL OR d.evidence_request_id = r.id)

        UNION ALL
        SELECT 'QUOTE_ACCEPTED', qa.accepted_at, 4, qa.id
        FROM public.cases c
        JOIN public.quote_versions qv ON qv.case_id = c.id AND qv.customer_id = c.customer_id
        JOIN public.quotes q ON q.id = qv.quote_id AND q.case_id = c.id AND q.customer_id = c.customer_id
        JOIN public.quote_acceptances qa ON qa.quote_version_id = qv.id AND qa.quote_id = q.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 'SERVICE_AGREEMENT_ACCEPTED'
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 'CASE_PERMISSION_CONFIRMED'
          END,
          ar.accepted_at,
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 5
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 6
          END,
          ar.id
        FROM public.cases c
        JOIN public.authorization_records ar
          ON ar.case_id = c.id
         AND ar.customer_id = c.customer_id
         AND ar.authorization_kind IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 'SERVICE_AGREEMENT_WITHDRAWN'
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 'CASE_PERMISSION_WITHDRAWN'
          END,
          ar.revoked_at,
          CASE ar.authorization_kind
            WHEN 'SERVICE_AGREEMENT' THEN 7
            WHEN 'CASE_MANAGEMENT_PERMISSION' THEN 8
          END,
          ar.id
        FROM public.cases c
        JOIN public.authorization_records ar
          ON ar.case_id = c.id
         AND ar.customer_id = c.customer_id
         AND ar.authorization_kind IN ('SERVICE_AGREEMENT', 'CASE_MANAGEMENT_PERMISSION')
         AND ar.revoked_at IS NOT NULL
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'PAYMENT_RECEIVED', rc.paid_at, 9, rc.id
        FROM public.cases c
        JOIN public.payment_receipts rc ON rc.customer_id = c.customer_id
        JOIN public.payment_obligations ob
          ON ob.id = rc.obligation_id
         AND ob.customer_id = c.customer_id
         AND ob.case_id = c.id
         AND ob.service_order_id = rc.service_order_id
        JOIN public.service_orders so
          ON so.id = rc.service_order_id
         AND so.customer_id = c.customer_id
         AND so.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'SUBMITTED_TO_GOOGLE', s.submitted_at, 10, s.id
        FROM public.cases c
        JOIN public.case_submissions s ON s.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id

        UNION ALL
        SELECT 'GOOGLE_DECISION_RECORDED', sr.created_at, 11, s.id
        FROM public.cases c
        JOIN public.case_submissions s ON s.case_id = c.id
        JOIN public.case_submission_results sr ON sr.submission_id = s.id AND sr.result = 'DECIDED'
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id


        UNION ALL
        SELECT 'PACK_PUBLISHED', p.published_at, 14, p.id
        FROM public.cases c
        JOIN public.case_prepared_packs p ON p.case_id = c.id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.service_track = 'GUIDED'
          AND p.status = 'APPROVED'
          AND p.published_at IS NOT NULL
          AND p.unpublished_at IS NULL
          AND admin_private.pack_publishable_v1(p.id)

        UNION ALL
        SELECT 'NOTIFICATION_DELIVERED', comm.delivered_at, 15, comm.id
        FROM public.cases c
        JOIN public.communications comm
          ON comm.case_id = c.id
         AND comm.customer_id = c.customer_id
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND comm.template_key = 'GUIDED_PACK_READY'
          AND comm.lifecycle IS DISTINCT FROM 'CANCELLED'
          AND comm.delivery_status = 'DELIVERED'
          AND comm.delivered_at IS NOT NULL

        UNION ALL
        SELECT
          CASE c.status
            WHEN 'CLOSED' THEN 'CASE_COMPLETED'
            WHEN 'CANCELLED' THEN 'CASE_CANCELLED'
          END,
          c.closed_at,
          CASE c.status WHEN 'CLOSED' THEN 12 ELSE 13 END,
          c.id
        FROM public.cases c
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.closed_at IS NOT NULL
          AND c.status IN ('CLOSED', 'CANCELLED')

        UNION ALL
        SELECT 'CUSTOMER_REPORTED_SUBMISSION', report.created_at, 16, report.id
        FROM public.cases c
        JOIN public.guided_customer_reports report
          ON report.case_id = c.id AND report.customer_id = c.customer_id AND report.kind = 'GOOGLE_SUBMISSION'
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.service_track = 'GUIDED'

        UNION ALL
        SELECT 'CUSTOMER_REPORTED_OUTCOME', report.created_at, 17, report.id
        FROM public.cases c
        JOIN public.guided_customer_reports report
          ON report.case_id = c.id AND report.customer_id = c.customer_id AND report.kind = 'GOOGLE_OUTCOME'
        WHERE c.id = p_case_id
          AND c.customer_id = p_customer_id
          AND c.service_track = 'GUIDED'

      ) raw
      WHERE code IS NOT NULL AND occurred_at IS NOT NULL
      ORDER BY occurred_at DESC, ordinal, source_id
      LIMIT 21
    ) limited
  ), '[]'::jsonb);
$$;



CREATE FUNCTION public.admin_guided_report_review_v1(
  p_token text, p_request uuid, p_case uuid, p_version integer, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  s jsonb;
  c public.cases;
  t public.case_tasks;
  r admin_private.case_command_receipts;
  actor uuid;
  fp text;
  note text;
  result jsonb;
  now_time timestamptz := now();
  before_status text;
  before_outcome text;
  before_closed timestamptz;
  after_status text;
  after_outcome text;
  after_closed timestamptz;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_data IS NULL
    OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 16000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF p_data - ARRAY['note','taskId','status'] <> '{}'::jsonb
    OR p_data->>'status' IS NULL OR p_data->>'status' NOT IN ('DONE', 'CANCELLED')
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  note := p_data->>'note';
  IF note IS NULL OR length(btrim(note)) NOT BETWEEN 10 AND 1000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  actor := (s->>'userId')::uuid;
  fp := md5(jsonb_build_array(p_case, p_version, 'review_guided_report', p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = actor AND r.fingerprint = fp THEN RETURN r.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL OR c.workflow_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF c.service_track IS DISTINCT FROM 'GUIDED' OR c.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  SELECT * INTO t FROM public.case_tasks
  WHERE id = (p_data->>'taskId')::uuid AND case_id = c.id AND status = 'OPEN';
  IF t.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.guided_customer_reports report
    WHERE report.task_id = t.id AND report.case_id = c.id
  ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  before_status := c.status;
  before_outcome := c.outcome;
  before_closed := c.closed_at;
  UPDATE public.case_tasks
    SET status = p_data->>'status', resolution = note, resolved_at = now_time
    WHERE id = t.id AND status = 'OPEN';
  UPDATE public.cases SET workflow_version = workflow_version WHERE id = c.id;
  SELECT status, outcome, closed_at INTO after_status, after_outcome, after_closed
  FROM public.cases WHERE id = c.id;
  IF after_status IS DISTINCT FROM before_status OR after_outcome IS DISTINCT FROM before_outcome
    OR after_closed IS DISTINCT FROM before_closed
  THEN
    RAISE EXCEPTION 'guided_report_review:case' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
  VALUES (
    c.id, actor, 'review_guided_report', note, 'INTERNAL',
    jsonb_build_object('taskId', t.id, 'status', p_data->>'status', 'reopened', false)
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'CASE_CHANGED', 'success', c.id, p_request, 'case', note,
    jsonb_build_object('operation', 'review_guided_report', 'taskId', t.id, 'previousVersion', p_version)
  );
  result := jsonb_build_object('status', 'success', 'id', c.id);
  INSERT INTO admin_private.case_command_receipts VALUES (p_request, actor, fp, result, now_time);
  RETURN result;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;

COMMENT ON FUNCTION admin_private.customer_portal_case_timeline_v1(uuid, uuid) IS
  'At most 21 customer-safe timeline codes for one owned case, newest first. A customer-reported Guided submission is not a ProfileRelaunch case submission. A customer-reported Google outcome is not an independently verified decision.';

NOTIFY pgrst, 'reload schema';

COMMIT;
$pr_dev_ledger_outcome_source$;
  v_pack_hash text;
  v_outcome_hash text;
  v_pack_name text;
  v_outcome_name text;
  v_pack_statements text[];
  v_outcome_statements text[];
  v_earlier_before text;
  v_earlier_after text;
  v_activation_before text;
  v_activation_after text;
  v_cron_before text;
  v_cron_after text;
  v_inserted integer;
BEGIN
  IF to_regprocedure('extensions.digest(bytea, text)') IS NULL THEN
    RAISE EXCEPTION 'dev ledger reconcile: extensions.digest(bytea, text) is absent';
  END IF;
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'dev ledger reconcile: supabase_migrations.schema_migrations is absent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
  THEN
    RAISE EXCEPTION 'dev ledger reconcile: anon, authenticated, or service_role is absent';
  END IF;

  v_pack_hash := encode(extensions.digest(convert_to(v_pack, 'UTF8'), 'sha256'), 'hex');
  v_outcome_hash := encode(extensions.digest(convert_to(v_outcome, 'UTF8'), 'sha256'), 'hex');
  IF v_pack_hash IS DISTINCT FROM '90fb457505352f538ca5553a90d940939e653e912d9dfb4889e0b54fd6d0fd11' THEN
    RAISE EXCEPTION 'dev ledger reconcile: pack source hash % does not match the reviewed file', v_pack_hash;
  END IF;
  IF v_outcome_hash IS DISTINCT FROM '3f22f59c86b5bed9b67f96165910fc19c981bd9151a789533d34f1540e390d9c' THEN
    RAISE EXCEPTION 'dev ledger reconcile: outcome source hash % does not match the reviewed file', v_outcome_hash;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261030200000'
  ) THEN
    RAISE EXCEPTION 'dev ledger reconcile: predecessor 20261030200000 is not recorded';
  END IF;
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version > '20261030200000'
      AND version NOT IN ('20261031120000', '20261031140000')
  ) THEN
    RAISE EXCEPTION 'dev ledger reconcile: an unexpected version follows 20261030200000';
  END IF;

  IF to_regprocedure('admin_private.dev_mail_pack_send_reason_v1(uuid)') IS NULL
    OR to_regprocedure('admin_private.dev_mail_lease_queued_send_v1(uuid, text, boolean)') IS NULL
    OR to_regprocedure('public.dev_mail_dispatch_claim_pack_v1(uuid, text)') IS NULL
    OR to_regprocedure('admin_private.dev_mail_pack_retry_due_v1()') IS NULL
    OR to_regprocedure('public.dev_mail_dispatch_claim_pack_retry_v1(text)') IS NULL
    OR to_regprocedure('admin_private.dev_mail_pack_retry_wake_credentials_v1(text, text, text)') IS NULL
    OR to_regprocedure('public.dev_mail_pack_retry_recovery_v1()') IS NULL
    OR to_regprocedure('admin_private.dev_mail_pack_retry_wake_v1()') IS NULL
    OR to_regclass('admin_private.dev_mail_pack_retry_http') IS NULL
    OR to_regclass('admin_private.dev_mail_dispatch_activation') IS NULL
  THEN
    RAISE EXCEPTION 'dev ledger reconcile: pack dispatch objects are not fully installed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE NOT trigger.tgisinternal
      AND trigger.tgname = 'dev_mail_pack_retry_wake'
      AND namespace.nspname = 'admin_private'
      AND relation.relname = 'jobs'
  ) THEN
    RAISE EXCEPTION 'dev ledger reconcile: pack retry wake trigger is not installed';
  END IF;
  IF has_function_privilege('anon', 'public.dev_mail_dispatch_claim_pack_v1(uuid, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.dev_mail_dispatch_claim_pack_v1(uuid, text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.dev_mail_dispatch_claim_pack_retry_v1(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.dev_mail_dispatch_claim_pack_retry_v1(text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.dev_mail_pack_retry_recovery_v1()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.dev_mail_pack_retry_recovery_v1()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.dev_mail_dispatch_claim_pack_v1(uuid, text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.dev_mail_dispatch_claim_pack_retry_v1(text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.dev_mail_pack_retry_recovery_v1()', 'EXECUTE')
    OR has_function_privilege('service_role', 'admin_private.dev_mail_pack_send_reason_v1(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'admin_private.dev_mail_pack_send_reason_v1(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'dev ledger reconcile: pack routine privileges do not match the reviewed grants';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'admin_private'
      AND relation.relname = 'dev_mail_pack_retry_http'
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'dev ledger reconcile: pack retry http table is missing row security';
  END IF;

  IF to_regclass('public.guided_customer_reports') IS NULL
    OR to_regprocedure('public.customer_portal_case_documents_v1(text, text)') IS NULL
    OR to_regprocedure('public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb)') IS NULL
    OR to_regprocedure('admin_private.fulfilment_snapshot_reason_v1(uuid, text, text, text, text, text)') IS NULL
    OR to_regprocedure('public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)') IS NULL
    OR to_regprocedure('admin_private.customer_portal_case_timeline_v1(uuid, uuid)') IS NULL
    OR to_regprocedure('public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)') IS NULL
  THEN
    RAISE EXCEPTION 'dev ledger reconcile: customer outcome objects are not fully installed';
  END IF;
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guided_customer_reports'
      AND (
        (column_name = 'outcome' AND udt_name = 'text')
        OR (column_name = 'decided_on' AND udt_name = 'date')
        OR (column_name = 'evidence_document_id' AND udt_name = 'uuid')
      )
  ) IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'dev ledger reconcile: guided outcome columns are missing or have another type';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.guided_customer_reports'::regclass
      AND conname = 'guided_customer_reports_kind_check'
      AND pg_get_constraintdef(oid) LIKE '%GOOGLE_OUTCOME%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.guided_customer_reports'::regclass
      AND conname = 'guided_customer_reports_shape_check'
      AND pg_get_constraintdef(oid) LIKE '%GOOGLE_OUTCOME%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.guided_customer_reports'::regclass
      AND conname = 'guided_customer_reports_evidence_fk'
      AND pg_get_constraintdef(oid) LIKE '%case_documents%'
  ) THEN
    RAISE EXCEPTION 'dev ledger reconcile: guided outcome constraints are missing';
  END IF;
  IF has_function_privilege('anon', 'public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.customer_portal_case_documents_v1(text, text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.customer_portal_case_documents_v1(text, text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_guided_report_review_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.admin_guided_fulfilment_close_v1(text, uuid, uuid, integer, jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.customer_portal_case_documents_v1(text, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'dev ledger reconcile: outcome routine privileges do not match the reviewed grants';
  END IF;

  PERFORM 1
  FROM supabase_migrations.schema_migrations
  WHERE version <= '20261030200000'
  FOR UPDATE;

  SELECT coalesce(string_agg(
    version || E'\n' || name || E'\n' || coalesce(array_to_string(statements, E'\n'), ''),
    E'\n====\n' ORDER BY version
  ), '')
  INTO v_earlier_before
  FROM supabase_migrations.schema_migrations
  WHERE version < '20261031120000';

  SELECT coalesce(string_agg(id::text || ':' || coalesce(active_from::text, ''), ',' ORDER BY id), '')
  INTO v_activation_before
  FROM admin_private.dev_mail_dispatch_activation;

  v_cron_before := '';
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT coalesce(string_agg(jobid::text || ':' || jobname || ':' || schedule || ':' || active::text, ',' ORDER BY jobid), '')
    INTO v_cron_before
    FROM cron.job;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
  SELECT '20261031120000', 'guided_pack_ready_dispatch_v1', ARRAY[v_pack]::text[]
  WHERE NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261031120000'
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT name, statements INTO v_pack_name, v_pack_statements
  FROM supabase_migrations.schema_migrations
  WHERE version = '20261031120000';
  IF v_pack_name IS DISTINCT FROM 'guided_pack_ready_dispatch_v1'
    OR v_pack_statements IS DISTINCT FROM ARRAY[v_pack]::text[]
  THEN
    RAISE EXCEPTION 'dev ledger reconcile: 20261031120000 is already recorded with different history';
  END IF;
  IF v_inserted IS DISTINCT FROM 0 AND v_inserted IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'dev ledger reconcile: pack history insert changed % rows', v_inserted;
  END IF;

  INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
  SELECT '20261031140000', 'guided_customer_outcome_v1', ARRAY[v_outcome]::text[]
  WHERE NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261031140000'
  );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  SELECT name, statements INTO v_outcome_name, v_outcome_statements
  FROM supabase_migrations.schema_migrations
  WHERE version = '20261031140000';
  IF v_outcome_name IS DISTINCT FROM 'guided_customer_outcome_v1'
    OR v_outcome_statements IS DISTINCT FROM ARRAY[v_outcome]::text[]
  THEN
    RAISE EXCEPTION 'dev ledger reconcile: 20261031140000 is already recorded with different history';
  END IF;
  IF v_inserted IS DISTINCT FROM 0 AND v_inserted IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'dev ledger reconcile: outcome history insert changed % rows', v_inserted;
  END IF;

  SELECT coalesce(string_agg(
    version || E'\n' || name || E'\n' || coalesce(array_to_string(statements, E'\n'), ''),
    E'\n====\n' ORDER BY version
  ), '')
  INTO v_earlier_after
  FROM supabase_migrations.schema_migrations
  WHERE version < '20261031120000';
  IF v_earlier_after IS DISTINCT FROM v_earlier_before THEN
    RAISE EXCEPTION 'dev ledger reconcile: an earlier history entry changed';
  END IF;

  SELECT coalesce(string_agg(id::text || ':' || coalesce(active_from::text, ''), ',' ORDER BY id), '')
  INTO v_activation_after
  FROM admin_private.dev_mail_dispatch_activation;
  IF v_activation_after IS DISTINCT FROM v_activation_before THEN
    RAISE EXCEPTION 'dev ledger reconcile: general dispatch activation changed';
  END IF;

  v_cron_after := '';
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT coalesce(string_agg(jobid::text || ':' || jobname || ':' || schedule || ':' || active::text, ',' ORDER BY jobid), '')
    INTO v_cron_after
    FROM cron.job;
  END IF;
  IF v_cron_after IS DISTINCT FROM v_cron_before THEN
    RAISE EXCEPTION 'dev ledger reconcile: a scheduled job changed';
  END IF;
END
$pr_dev_ledger_reconcile$;

COMMIT;

-- Read-only. These queries do not write. Run them after the transaction
-- above, in the same DEV SQL editor session. hash_matches_reviewed_source
-- must be true for both rows, statement_count must be 1, and the version
-- list must be the predecessor followed by the two canonical versions.

SELECT version,
       name,
       array_length(statements, 1) AS statement_count,
       octet_length(convert_to(statements[1], 'UTF8')) AS statement_bytes,
       encode(extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex') AS statement_sha256,
       encode(extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex') = CASE version
         WHEN '20261031120000' THEN '90fb457505352f538ca5553a90d940939e653e912d9dfb4889e0b54fd6d0fd11'
         WHEN '20261031140000' THEN '3f22f59c86b5bed9b67f96165910fc19c981bd9151a789533d34f1540e390d9c'
       END AS hash_matches_reviewed_source
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261031120000', '20261031140000')
ORDER BY version;

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '20261030200000'
ORDER BY version;
