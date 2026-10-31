-- Immediate DEV dispatch for a published Guided pack, and a retry wake for
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
