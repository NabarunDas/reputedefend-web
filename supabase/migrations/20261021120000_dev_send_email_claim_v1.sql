BEGIN;

-- DEV-MAIL-01 Phase B. Claims one SEND_EMAIL job for an authenticated Admin.
-- This function belongs to the shared canonical chain so DEV and Production
-- can later carry the same schema. Applying the chain to Production creates
-- the function and does not enable mail, the scheduled worker, a route, or a
-- communication change. EXECUTE is limited to service_role. The Admin route
-- calls it only on the develop Preview pinned to the DEV Supabase project.
-- A same-key replay returns the stored result without a lease. An evidence
-- request is claimed only when plain text and HTML each contain exactly one
-- upload URL for the supplied customer portal and the stored action id.
-- It does not alter the batch promote or batch claim functions.
-- Source only until an independent review applies it to DEV. Do not apply it
-- to Production as part of this change.

CREATE FUNCTION public.admin_dev_send_email_claim_v1(
  p_token text,
  p_request uuid,
  p_communication uuid,
  p_confirmed boolean,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  current_status text;
  v_key text;
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
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'reauth_required', NULL, p_request, 'job',
      'DEV email processing requires a fresh sign-in',
      jsonb_build_object('operation', 'dev_send_email')
    );
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_communication IS NULL OR coalesce(p_confirmed, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO comm FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF comm.id IS NULL OR comm.lifecycle IS DISTINCT FROM 'QUEUED' OR comm.content_locked IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array('dev_send_email', p_communication)::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    current_status := NULL;
    IF cached ? 'jobId' THEN
      SELECT j.status INTO current_status FROM admin_private.jobs j WHERE j.id = (cached->>'jobId')::uuid;
    END IF;
    RETURN (cached - 'leaseToken')
      || jsonb_build_object('replay', true, 'currentJobStatus', current_status)
      || '{"leaseToken":null}'::jsonb;
  END IF;

  IF comm.template_key = 'EVIDENCE_REQUEST' THEN
    expected := coalesce(p_customer_origin, '') || '/action/' || coalesce(comm.customer_action_id::text, '');
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
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing left an evidence request whose upload link is not the development customer portal',
        jsonb_build_object('operation', 'dev_send_email', 'reason', 'origin')
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'origin');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  END IF;

  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = v_key FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM admin_private.job_outbox WHERE event_key = v_key) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF outbox.topic IS DISTINCT FROM 'SEND_EMAIL'
    OR outbox.aggregate_id IS DISTINCT FROM comm.id
    OR outbox.payload->>'communicationId' IS DISTINCT FROM comm.id::text
    OR outbox.payload->>'contentVersion' IS DISTINCT FROM comm.content_version::text
  THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV email processing refused a job that is not the queued communication',
      jsonb_build_object('operation', 'dev_send_email', 'reason', 'not_send_email')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
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
    result := jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'jobId', row.id);
  END IF;
  IF comm.delivery_status IN ('PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE') THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' OR comm.first_provider_attempt_at IS NOT NULL THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
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
      result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
          lease_owner = NULL, lease_token = NULL,
          last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  token := gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING', claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-send-email', lease_token = token,
        attempts = row.attempts + 1, updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-send-email', token, NULL);

  result := jsonb_build_object(
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
  PERFORM admin_private.write_record_audit_v1(
    actor, 'OPERATIONS_CHANGED', 'success', row.id, p_request, 'job',
    'DEV email processing claimed one queued communication',
    jsonb_build_object('operation', 'dev_send_email', 'jobType', 'SEND_EMAIL')
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dev_send_email_claim_v1(text, uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_dev_send_email_claim_v1(text, uuid, uuid, boolean, text)
  TO service_role;

COMMIT;
