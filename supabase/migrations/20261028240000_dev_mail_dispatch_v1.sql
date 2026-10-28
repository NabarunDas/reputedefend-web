BEGIN;

-- GUIDED-PACK-MAIL-AUTO-01. Not applied on DEV or Production.
-- Do not apply this file from the pull request, and do not replay it after review.
-- It does not send mail, publish a pack, close a case, or take a payment.
-- The general job promoter and the general claim stay unchanged.
-- This claim leases one SEND_EMAIL row for the develop mail dispatcher.

CREATE FUNCTION public.dev_mail_dispatch_candidates_v1(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  listed jsonb;
BEGIN
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 20);
  SELECT coalesce(jsonb_agg(jsonb_build_object('communicationId', picked.id) ORDER BY picked.queued_at NULLS LAST, picked.created_at, picked.id), '[]'::jsonb)
  INTO listed
  FROM (
    SELECT c.id, c.queued_at, c.created_at
    FROM public.communications c
    JOIN admin_private.job_outbox o
      ON o.event_key = 'send-email:' || c.id::text || ':v' || c.content_version::text
     AND o.topic = 'SEND_EMAIL'
     AND o.aggregate_id = c.id
    WHERE c.lifecycle = 'QUEUED'
      AND c.content_locked IS TRUE
      AND c.template_key IN (
        'EVIDENCE_REQUEST', 'QUOTE_OFFER', 'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION'
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
      AND c.first_provider_attempt_at IS NULL
      AND o.available_at <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM admin_private.jobs job
        WHERE job.outbox_id = o.id
          AND (
            job.job_type IS DISTINCT FROM 'SEND_EMAIL'
            OR job.status IN ('SUCCEEDED', 'DEAD_LETTER')
            OR (
              job.status = 'RUNNING'
              AND job.lease_expires_at IS NOT NULL
              AND job.lease_expires_at >= now()
            )
          )
      )
    ORDER BY c.queued_at NULLS LAST, c.created_at, c.id
    LIMIT v_limit
  ) picked;
  RETURN jsonb_build_object('status', 'success', 'communications', listed);
END;
$$;

CREATE FUNCTION public.dev_mail_dispatch_claim_v1(p_communication uuid, p_customer_origin text)
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
  case_ref text;
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
  IF comm.template_key IS NULL OR comm.template_key NOT IN (
    'EVIDENCE_REQUEST', 'QUOTE_OFFER', 'GUIDED_PAYMENT_REQUEST', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
  END IF;
  IF comm.delivery_status IN (
    'PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE',
    'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed');
  END IF;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' OR comm.first_provider_attempt_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown');
  END IF;

  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  IF comm.template_key IN ('EVIDENCE_REQUEST', 'QUOTE_OFFER') THEN
    expected := p_customer_origin || '/action/' || coalesce(comm.customer_action_id::text, '');
    text_upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    html_upload := substring(coalesce(comm.body_html, '') from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    SELECT count(*)::integer INTO text_urls
      FROM regexp_matches(comm.body_text, 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    SELECT count(*)::integer INTO html_urls
      FROM regexp_matches(coalesce(comm.body_html, ''), 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    IF comm.body_html IS NULL
      OR text_urls IS DISTINCT FROM 1
      OR html_urls IS DISTINCT FROM 1
      OR text_upload IS DISTINCT FROM expected
      OR html_upload IS DISTINCT FROM expected
      OR position('#t=' in comm.body_text) > 0
      OR position('#t=' in coalesce(comm.body_html, '')) > 0
    THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
    END IF;
  ELSIF comm.template_key = 'GUIDED_PAYMENT_REQUEST' THEN
    SELECT cs.public_ref INTO case_ref FROM public.cases cs WHERE cs.id = comm.case_id;
    expected := p_customer_origin || '/portal/cases/' || coalesce(case_ref, '') || '/payments';
    IF comm.body_html IS NULL
      OR case_ref IS NULL
      OR position(expected IN comm.body_text) = 0
      OR position(expected IN comm.body_html) = 0
      OR (length(comm.body_text) - length(replace(comm.body_text, expected, ''))) IS DISTINCT FROM length(expected)
      OR (length(comm.body_html) - length(replace(comm.body_html, expected, ''))) IS DISTINCT FROM length(expected)
      OR position('#t=' IN comm.body_text) > 0
      OR position('#t=' IN comm.body_html) > 0
      OR position('/action/' IN comm.body_text) > 0
      OR position('/action/' IN comm.body_html) > 0
    THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
    END IF;
  ELSE
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
      OR position('#t=' in comm.body_text) > 0
      OR position('#t=' in comm.body_html) > 0
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

CREATE FUNCTION public.admin_pack_notification_status_v1(
  p_token text,
  p_case uuid,
  p_cadence_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  cadence integer;
  comm public.communications;
  outbox admin_private.job_outbox;
  row admin_private.jobs;
  hb admin_private.job_worker_heartbeats;
  phase text;
  promoted boolean;
  worker_seen boolean;
  worker_late boolean;
  stalled boolean;
  processing boolean;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_case IS NULL OR NOT EXISTS (SELECT 1 FROM public.cases WHERE id = p_case) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  cadence := coalesce(p_cadence_seconds, 300);
  IF cadence < 60 OR cadence > 300 THEN cadence := 300; END IF;

  SELECT * INTO comm
  FROM public.communications
  WHERE case_id = p_case
    AND template_key = 'GUIDED_PACK_READY'
    AND lifecycle IS DISTINCT FROM 'CANCELLED'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  SELECT * INTO hb
  FROM admin_private.job_worker_heartbeats
  WHERE worker_name = 'dev-mail-dispatch' AND environment = 'preview';
  worker_seen := hb.id IS NOT NULL AND hb.last_success_at IS NOT NULL;
  worker_late := NOT worker_seen
    OR hb.last_success_at < now() - make_interval(secs => greatest(hb.late_after_seconds, cadence));

  IF comm.id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'success',
      'phase', 'none',
      'communicationId', NULL,
      'templateKey', NULL,
      'lifecycle', NULL,
      'deliveryStatus', NULL,
      'jobStatus', NULL,
      'promoted', false,
      'workerName', 'dev-mail-dispatch',
      'workerLate', worker_late,
      'workerSeen', worker_seen,
      'stalled', false
    );
  END IF;

  SELECT * INTO outbox
  FROM admin_private.job_outbox
  WHERE event_key = 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF outbox.id IS NOT NULL THEN
    SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id;
  END IF;
  promoted := outbox.promoted_at IS NOT NULL;
  processing := row.status = 'RUNNING'
    AND row.lease_expires_at IS NOT NULL
    AND row.lease_expires_at >= now();

  IF comm.delivery_status = 'DELIVERED' THEN phase := 'delivered';
  ELSIF comm.delivery_status = 'PROVIDER_ACCEPTED' THEN phase := 'provider_accepted';
  ELSIF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' THEN phase := 'acceptance_unknown';
  ELSIF comm.delivery_status = 'SUPPRESSED' THEN phase := 'blocked';
  ELSIF comm.delivery_status IN ('BOUNCED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE', 'COMPLAINED', 'FAILED') THEN phase := 'failed';
  ELSIF processing THEN phase := 'processing';
  ELSIF comm.lifecycle = 'QUEUED' AND (comm.delivery_status IS NULL OR comm.delivery_status = 'NONE') THEN phase := 'queued';
  ELSE phase := 'acceptance_unknown';
  END IF;

  stalled := phase = 'queued' AND (
    worker_late
    OR outbox.id IS NULL
    OR (promoted IS NOT TRUE AND outbox.available_at <= now() - make_interval(secs => cadence))
    OR (row.status IN ('PENDING', 'RETRY') AND row.scheduled_at <= now() - make_interval(secs => cadence))
  );

  RETURN jsonb_build_object(
    'status', 'success',
    'phase', phase,
    'communicationId', comm.id,
    'templateKey', comm.template_key,
    'lifecycle', comm.lifecycle,
    'deliveryStatus', comm.delivery_status,
    'jobStatus', row.status,
    'promoted', promoted,
    'workerName', 'dev-mail-dispatch',
    'workerLate', worker_late,
    'workerSeen', worker_seen,
    'stalled', stalled
  );
END;
$$;

CREATE FUNCTION public.admin_worker_heartbeats_v1(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  listed jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'workerName', hb.worker_name,
    'environment', hb.environment,
    'status', CASE
      WHEN hb.last_started_at IS NULL AND hb.last_success_at IS NULL THEN 'NEVER_RUN'
      WHEN coalesce(hb.last_started_at, hb.updated_at) >= now() - make_interval(secs => hb.late_after_seconds) THEN 'HEALTHY'
      ELSE 'LATE'
    END,
    'lastStartedAt', hb.last_started_at,
    'lastCompletedAt', hb.last_completed_at,
    'lastSuccessAt', hb.last_success_at,
    'lastError', hb.last_error,
    'expectedIntervalSeconds', hb.expected_interval_seconds,
    'lateAfterSeconds', hb.late_after_seconds
  ) ORDER BY hb.worker_name, hb.environment), '[]'::jsonb)
  INTO listed
  FROM admin_private.job_worker_heartbeats hb;
  RETURN jsonb_build_object('status', 'success', 'workers', listed);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_candidates_v1(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_v1(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_pack_notification_status_v1(text, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_worker_heartbeats_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_candidates_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_pack_notification_status_v1(text, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_worker_heartbeats_v1(text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
