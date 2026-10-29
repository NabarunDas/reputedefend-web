BEGIN;

-- GUIDED-PACK-MAIL-AUTO-01 shared dispatcher. Not applied on DEV or Production.
-- Do not apply this file from the pull request, and do not replay it after review.
-- It does not send mail, publish a pack, close a case, or take a payment.
-- No row is inserted into dev_mail_dispatch_activation, so nothing already queued
-- becomes eligible. Payment confirmations stay on the DEV payment-event worker.

CREATE TABLE admin_private.dev_mail_dispatch_activation (
  id smallint PRIMARY KEY CHECK (id = 1),
  active_from timestamptz NOT NULL,
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 8 AND 200)
);

ALTER TABLE admin_private.dev_mail_dispatch_activation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.dev_mail_dispatch_activation FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.dev_mail_retry_due_v1(p_outbox uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_private.jobs j
    WHERE j.outbox_id = p_outbox
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RETRY'
      AND j.scheduled_at <= now()
  );
$$;

CREATE FUNCTION admin_private.dev_mail_dispatch_wake_credentials_v1(
  p_url text, p_bearer text, p_bypass text
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_url IS NULL
    OR p_url !~ '^https://profilerelaunch-admin-git-develop-[a-z0-9-]+\.vercel\.app/api/internal/jobs/dev-mail-dispatch$'
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

CREATE OR REPLACE FUNCTION public.dev_mail_dispatch_candidates_v1(p_limit integer, p_customer_origin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  listed jsonb;
BEGIN
  IF p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin', 'communications', '[]'::jsonb);
  END IF;
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 20);
  SELECT coalesce(jsonb_agg(jsonb_build_object('communicationId', picked.id) ORDER BY picked.queued_at NULLS LAST, picked.created_at, picked.id), '[]'::jsonb)
  INTO listed
  FROM (
    SELECT c.id, coalesce(c.queued_at, c.created_at) AS queued_at, c.created_at
    FROM public.communications c
    JOIN admin_private.job_outbox o
      ON o.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
     AND o.topic = 'SEND_EMAIL'
     AND o.aggregate_id = c.id
    JOIN public.cases cs ON cs.id = c.case_id
    JOIN public.customers cu ON cu.id = cs.customer_id
    JOIN admin_private.dev_mail_dispatch_activation gate
      ON coalesce(c.queued_at, c.created_at) >= gate.active_from
    WHERE c.lifecycle = 'QUEUED'
      AND c.content_locked IS TRUE
      AND c.template_key IN (
        'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
        'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION'
      )
      AND admin_private.normalize_email_v1(c.recipient) = admin_private.normalize_email_v1(cu.email)
      AND NOT EXISTS (
        SELECT 1 FROM admin_private.email_suppressions s
        WHERE s.address_normalized = admin_private.normalize_email_v1(c.recipient)
      )
      AND c.delivery_status IS DISTINCT FROM 'PROVIDER_ACCEPTED'
      AND c.delivery_status IS DISTINCT FROM 'DELIVERED'
      AND c.delivery_status IS DISTINCT FROM 'TRANSIENT_BOUNCE'
      AND c.delivery_status IS DISTINCT FROM 'UNDETERMINED_BOUNCE'
      AND c.delivery_status IS DISTINCT FROM 'BOUNCED'
      AND c.delivery_status IS DISTINCT FROM 'COMPLAINED'
      AND c.delivery_status IS DISTINCT FROM 'SUPPRESSED'
      AND c.delivery_status IS DISTINCT FROM 'FAILED'
      AND c.delivery_status IS DISTINCT FROM 'ACCEPTANCE_UNKNOWN'
      AND (
        c.first_provider_attempt_at IS NULL
        OR admin_private.dev_mail_retry_due_v1(o.id)
      )
      AND position('#t=' in coalesce(c.body_text, '')) = 0
      AND position('#t=' in coalesce(c.body_html, '')) = 0
      AND position(p_customer_origin IN coalesce(c.body_text, '')) > 0
      AND (
        c.template_key IS DISTINCT FROM 'GUIDED_PACK_READY'
        OR (
          admin_private.fulfilment_page_count_v1(c.body_text, 'documents') = 1
          AND position(p_customer_origin || '/portal/cases/' IN c.body_text) > 0
        )
      )
    ORDER BY coalesce(c.queued_at, c.created_at) NULLS LAST, c.created_at, c.id
    LIMIT v_limit
  ) picked;
  RETURN jsonb_build_object('status', 'success', 'communications', listed);
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_mail_dispatch_claim_v1(p_communication uuid, p_customer_origin text)
RETURNS jsonb
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
  IF comm.template_key IS NULL OR comm.template_key NOT IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.cases cs
    JOIN public.customers cu ON cu.id = cs.customer_id
    WHERE cs.id = comm.case_id
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
  IF NOT EXISTS (
    SELECT 1 FROM admin_private.dev_mail_dispatch_activation gate
    WHERE coalesce(comm.queued_at, comm.created_at) >= gate.active_from
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'before_activation');
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
  -- A recorded attempt is safe to repeat only when the job itself is a due RETRY.
  -- A live lease stays a conflict. An expired lease without that RETRY stays unsent.
  IF comm.first_provider_attempt_at IS NOT NULL AND EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    JOIN admin_private.job_outbox ob ON ob.id = j.outbox_id
    WHERE ob.event_key = v_key
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
    JOIN admin_private.job_outbox ob ON ob.id = j.outbox_id
    WHERE ob.event_key = v_key
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'DEAD_LETTER'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter');
  END IF;
  IF comm.first_provider_attempt_at IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM admin_private.jobs j
    JOIN admin_private.job_outbox ob ON ob.id = j.outbox_id
    WHERE ob.event_key = v_key
      AND j.job_type = 'SEND_EMAIL'
      AND j.status = 'RETRY'
      AND j.scheduled_at <= now()
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown');
  END IF;

  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  IF position('#t=' in coalesce(comm.body_text, '')) > 0
    OR position('#t=' in coalesce(comm.body_html, '')) > 0
    OR position(p_customer_origin IN coalesce(comm.body_text, '')) = 0
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
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
  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
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
    'leaseToken', token,
    'attemptNumber', row.attempts,
    'attempts', row.attempts,
    'maxAttempts', row.max_attempts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_mail_dispatch_inventory_v1(p_customer_origin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  listed jsonb;
BEGIN
  IF p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin', 'messages', '[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'communicationId', picked.id,
    'templateKey', picked.template_key,
    'eligible', picked.reason = 'eligible',
    'reason', picked.reason
  ) ORDER BY picked.queued_at NULLS LAST, picked.created_at, picked.id), '[]'::jsonb)
  INTO listed
  FROM (
    SELECT c.id, c.template_key, c.queued_at, c.created_at,
      CASE
        WHEN c.template_key = 'PAYMENT_CONFIRMATION' THEN 'payment_worker_owned'
        WHEN c.template_key IS NULL OR c.template_key NOT IN (
          'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
          'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION'
        ) THEN 'template_out_of_scope'
        WHEN admin_private.normalize_email_v1(c.recipient) IS DISTINCT FROM admin_private.normalize_email_v1(cu.email) THEN 'recipient_mismatch'
        WHEN EXISTS (
          SELECT 1 FROM admin_private.email_suppressions s
          WHERE s.address_normalized = admin_private.normalize_email_v1(c.recipient)
        ) THEN 'suppressed'
        WHEN NOT EXISTS (
          SELECT 1 FROM admin_private.dev_mail_dispatch_activation gate
          WHERE coalesce(c.queued_at, c.created_at) >= gate.active_from
        ) THEN 'before_activation'
        WHEN position('#t=' in coalesce(c.body_text, '')) > 0
          OR position(p_customer_origin IN coalesce(c.body_text, '')) = 0
          OR (
            c.template_key = 'GUIDED_PACK_READY'
            AND admin_private.fulfilment_page_count_v1(c.body_text, 'documents') IS DISTINCT FROM 1
          )
          THEN 'origin'
        ELSE 'eligible'
      END AS reason
    FROM public.communications c
    JOIN admin_private.job_outbox o
      ON o.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
     AND o.topic = 'SEND_EMAIL'
     AND o.aggregate_id = c.id
    JOIN public.cases cs ON cs.id = c.case_id
    JOIN public.customers cu ON cu.id = cs.customer_id
    WHERE c.lifecycle = 'QUEUED'
      AND c.content_locked IS TRUE
      AND (
        c.first_provider_attempt_at IS NULL
        OR admin_private.dev_mail_retry_due_v1(o.id)
      )
      AND c.delivery_status IS DISTINCT FROM 'PROVIDER_ACCEPTED'
      AND c.delivery_status IS DISTINCT FROM 'DELIVERED'
      AND c.delivery_status IS DISTINCT FROM 'TRANSIENT_BOUNCE'
      AND c.delivery_status IS DISTINCT FROM 'UNDETERMINED_BOUNCE'
      AND c.delivery_status IS DISTINCT FROM 'BOUNCED'
      AND c.delivery_status IS DISTINCT FROM 'COMPLAINED'
      AND c.delivery_status IS DISTINCT FROM 'SUPPRESSED'
      AND c.delivery_status IS DISTINCT FROM 'FAILED'
      AND c.delivery_status IS DISTINCT FROM 'ACCEPTANCE_UNKNOWN'
    ORDER BY c.queued_at NULLS LAST, c.created_at, c.id
    LIMIT 50
  ) picked;
  RETURN jsonb_build_object('status', 'success', 'messages', listed);
END;
$$;

-- Empty queue returns before any network call. pg_net and Vault are optional.
CREATE FUNCTION public.dev_mail_dispatch_recovery_v1()
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
  v_credentials jsonb;
BEGIN
  SELECT count(*) INTO n
  FROM public.communications c
  JOIN admin_private.job_outbox o
    ON o.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
   AND o.topic = 'SEND_EMAIL'
   AND o.aggregate_id = c.id
  JOIN public.cases cs ON cs.id = c.case_id
  JOIN public.customers cu ON cu.id = cs.customer_id
  JOIN admin_private.dev_mail_dispatch_activation gate
    ON coalesce(c.queued_at, c.created_at) >= gate.active_from
  WHERE c.lifecycle = 'QUEUED'
    AND c.content_locked IS TRUE
    AND c.template_key IN (
      'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
      'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION'
    )
    AND admin_private.normalize_email_v1(c.recipient) = admin_private.normalize_email_v1(cu.email)
    AND (
      c.first_provider_attempt_at IS NULL
      OR EXISTS (
        SELECT 1 FROM admin_private.jobs j
        WHERE j.outbox_id = o.id
          AND j.job_type = 'SEND_EMAIL'
          AND j.status = 'RETRY'
          AND j.scheduled_at <= now()
      )
    )
    AND c.delivery_status IS DISTINCT FROM 'PROVIDER_ACCEPTED'
    AND c.delivery_status IS DISTINCT FROM 'DELIVERED'
    AND c.delivery_status IS DISTINCT FROM 'ACCEPTANCE_UNKNOWN'
    AND position('#t=' in coalesce(c.body_text, '')) = 0
    AND position('https://profilerelaunch-customer-git-develop-' IN coalesce(c.body_text, '')) > 0
    AND (
      c.template_key IS DISTINCT FROM 'GUIDED_PACK_READY'
      OR admin_private.fulfilment_page_count_v1(c.body_text, 'documents') = 1
    )
    AND NOT EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(c.recipient)
    );
  IF n = 0 THEN
    RETURN jsonb_build_object('status', 'success', 'eligible', 0, 'wake', 'not_needed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_net')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault')
  THEN
    RETURN jsonb_build_object('status', 'success', 'eligible', n, 'wake', 'not_configured');
  END IF;
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_url USING 'dev_mail_dispatch_url';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_bearer USING 'dev_mail_dispatch_bearer';
  EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_bypass USING 'dev_mail_dispatch_bypass';
  v_credentials := admin_private.dev_mail_dispatch_wake_credentials_v1(v_url, v_bearer, v_bypass);
  IF coalesce(v_credentials->>'ok', 'false') <> 'true' THEN
    RETURN jsonb_build_object('status', 'success', 'eligible', n, 'wake', 'not_configured', 'reason', v_credentials->>'reason');
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'net' AND c.relname = '_http_response'
  ) THEN
    EXECUTE 'SELECT status_code FROM net._http_response WHERE url = $1 ORDER BY created DESC LIMIT 1'
      INTO v_http USING v_url;
    IF v_http IN (301, 302, 303, 307, 308, 401, 403) THEN
      RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'blocked', 'httpStatus', v_http);
    END IF;
  END IF;
  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 5000)'
      USING v_url,
        jsonb_build_object(
          'Authorization', 'Bearer ' || v_bearer,
          'Content-Type', 'application/json',
          'x-vercel-protection-bypass', v_bypass
        ),
        '{"source":"recovery"}'::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'failed');
  END;
  RETURN jsonb_build_object('status', 'pending', 'eligible', n, 'wake', 'requested');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'blocked', 'eligible', n, 'wake', 'failed');
END;
$$;

CREATE FUNCTION admin_private.dev_mail_dispatch_wake_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.topic IS DISTINCT FROM 'SEND_EMAIL' THEN
    RETURN NEW;
  END IF;
  PERFORM public.dev_mail_dispatch_recovery_v1();
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER dev_mail_dispatch_wake
  AFTER INSERT ON admin_private.job_outbox
  FOR EACH ROW EXECUTE FUNCTION admin_private.dev_mail_dispatch_wake_v1();

CREATE FUNCTION public.dev_mail_dispatch_readiness_v1()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_activation boolean := false;
  v_schedule boolean := false;
  v_worker boolean := false;
  v_credentials boolean := false;
  v_url text;
  v_bearer text;
  v_bypass text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM admin_private.dev_mail_dispatch_activation
    WHERE active_from <= now()
  ) INTO v_activation;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE $sql$
      SELECT EXISTS (
        SELECT 1 FROM cron.job
        WHERE jobname = 'dev-mail-dispatch-recovery'
          AND schedule = '*/5 * * * *'
          AND command LIKE '%dev_mail_dispatch_recovery_v1%'
      )
    $sql$ INTO v_schedule;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM admin_private.job_worker_heartbeats hb
    WHERE hb.worker_name = 'dev-mail-dispatch'
      AND hb.environment = 'preview'
      AND hb.last_success_at IS NOT NULL
      AND hb.last_success_at >= now() - make_interval(secs => hb.late_after_seconds)
  ) INTO v_worker;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'vault') THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_url USING 'dev_mail_dispatch_url';
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_bearer USING 'dev_mail_dispatch_bearer';
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1' INTO v_bypass USING 'dev_mail_dispatch_bypass';
    v_credentials := coalesce(
      admin_private.dev_mail_dispatch_wake_credentials_v1(v_url, v_bearer, v_bypass)->>'ok',
      'false'
    ) = 'true';
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'automatic', v_activation AND v_schedule AND v_worker AND v_credentials,
    'activation', v_activation,
    'schedule', v_schedule,
    'workerHealthy', v_worker,
    'credentials', v_credentials
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'status', 'unavailable',
    'automatic', false,
    'activation', false,
    'schedule', false,
    'workerHealthy', false,
    'credentials', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_candidates_v1(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_v1(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_mail_dispatch_inventory_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_mail_dispatch_recovery_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_private.dev_mail_dispatch_wake_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.dev_mail_retry_due_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.dev_mail_dispatch_wake_credentials_v1(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_mail_dispatch_readiness_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_candidates_v1(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_inventory_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_recovery_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_readiness_v1() TO service_role;
GRANT EXECUTE ON FUNCTION admin_private.dev_mail_dispatch_wake_credentials_v1(text, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
