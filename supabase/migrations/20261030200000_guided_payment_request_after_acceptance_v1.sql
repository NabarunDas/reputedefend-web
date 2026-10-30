BEGIN;

-- Guided payment request after quotation-email acceptance.
-- Secure Action sessions and Customer Portal sessions are different.
-- This function accepts only an unexpired customer_action_sessions row for a
-- completed QUOTE_ACCEPTANCE. It does not call customer_portal_actor_v1, and a
-- portal token hash finds no action session.
-- public.customer_queue_guided_payment_request_v1 keeps its 900-second dispatch
-- hold so a payment completed in that portal visit can cancel the unsent email
-- before the provider is contacted. This action wrapper does not set a hold.
-- The queue body then uses its immediate default. A stored receipt still
-- cancels a queued email that has not had a provider attempt.
-- The body remains authoritative for the order, obligation, duplicate action,
-- paid, authority and snapshot checks. The queue wrapper does not insert an
-- action, queue an email, or mark a payment.
-- Immediate sending stays in the Admin dispatcher. This file does not call a
-- provider, enable the mail worker, or insert an activation row.
-- dev_mail_dispatch_claim_request_v1 leases the communication stored for one
-- queue request. The caller cannot name a communication. The sweep claim
-- public.dev_mail_dispatch_claim_v1 still requires the activation watermark.
-- Source only. Do not apply this file to DEV or Production from this change.

CREATE FUNCTION public.customer_action_queue_guided_payment_request_v1(
  p_token_hash text,
  p_request uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess admin_private.customer_action_sessions;
  act public.customer_actions;
  order_id uuid;
  ord public.service_orders;
  payload jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL OR p_payload IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_payload ? 'useCurrentVersion' OR p_payload ? 'actorType' OR p_payload ? 'dispatchHoldSeconds' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions
    WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  SELECT * INTO act FROM public.customer_actions WHERE id = sess.action_id;
  IF act.id IS NULL OR act.kind IS DISTINCT FROM 'QUOTE_ACCEPTANCE' OR act.status IS DISTINCT FROM 'COMPLETED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  BEGIN
    order_id := (p_payload->>'serviceOrderId')::uuid;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF order_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = order_id;
  IF ord.id IS NULL
    OR ord.customer_id IS DISTINCT FROM act.customer_id
    OR ord.case_id IS DISTINCT FROM act.case_id
    OR ord.business_id IS DISTINCT FROM act.business_id
    OR ord.location_id IS DISTINCT FROM act.location_id
    OR ord.quote_version_id IS DISTINCT FROM act.quote_version_id
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quote_acceptances acc
    WHERE acc.id = ord.quote_acceptance_id
      AND acc.quote_version_id = ord.quote_version_id
      AND acc.customer_action_id = act.id
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
  END IF;
  payload := p_payload || jsonb_build_object('useCurrentVersion', true, 'actorType', 'CUSTOMER');
  RETURN admin_private.queue_guided_payment_request_body_v1(sess.auth_user_id, p_request, payload);
END;
$$;

REVOKE ALL ON FUNCTION public.customer_action_queue_guided_payment_request_v1(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_queue_guided_payment_request_v1(text, uuid, jsonb)
  TO service_role;

-- Leases the communication stored for one queue request.
-- The caller cannot name a communication. Portal and action receipts use the
-- same lookup. Held mail, a provider attempt, and an exhausted lease stay
-- refused. This does not check the activation watermark: that watermark still
-- gates public.dev_mail_dispatch_claim_v1, so the sweep cannot send older mail.
-- This function does not call a provider.
CREATE FUNCTION public.dev_mail_dispatch_claim_request_v1(
  p_request uuid,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  receipt jsonb;
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
  IF p_request IS NULL
    OR p_customer_origin IS NULL
    OR p_customer_origin !~ '^https://profilerelaunch-customer-git-develop-[a-z0-9-]+\.vercel\.app$'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'origin');
  END IF;
  SELECT response INTO receipt
  FROM admin_private.communication_command_receipts
  WHERE request_id = p_request;
  IF receipt IS NULL OR receipt->>'status' IS DISTINCT FROM 'success' OR receipt->>'id' IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  BEGIN
    SELECT * INTO comm FROM public.communications
      WHERE id = (receipt->>'id')::uuid
      FOR UPDATE SKIP LOCKED;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.communications WHERE id = (receipt->>'id')::uuid) THEN
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

REVOKE ALL ON FUNCTION public.dev_mail_dispatch_claim_request_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_mail_dispatch_claim_request_v1(uuid, text)
  TO service_role;

-- Records a fixed handover reason for the accepted order. It does not accept
-- a message, an address, or a communication id, and it does not queue or send.
CREATE FUNCTION public.customer_record_guided_payment_handover_v1(
  p_token_hash text,
  p_request uuid,
  p_service_order uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess admin_private.customer_action_sessions;
  act public.customer_actions;
  ord public.service_orders;
  v_customer uuid;
  v_auth uuid;
  v_outcome text;
  v_reason text;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL OR p_service_order IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  v_reason := CASE p_reason
    WHEN 'mail_not_configured' THEN 'Guided payment email was not queued because outgoing mail is not configured'
    WHEN 'queue_denied' THEN 'Guided payment email was not queued'
    WHEN 'queue_unavailable' THEN 'Guided payment email queue could not be confirmed'
    WHEN 'dispatch_not_configured' THEN 'Guided payment email stayed queued because immediate development sending is not configured'
    WHEN 'dispatch_held' THEN 'Guided payment email stayed queued until its dispatch hold ends'
    WHEN 'dispatch_conflict' THEN 'Guided payment email stayed queued because it is already being processed'
    WHEN 'provider_accepted' THEN 'Development payment email was accepted by the provider'
    WHEN 'provider_retryable' THEN 'Development payment email stayed retryable after the provider did not accept it'
    WHEN 'provider_dead' THEN 'Development payment email was not accepted and was not submitted again'
    WHEN 'acceptance_unknown' THEN 'Development payment email was not submitted again because provider acceptance is unknown'
    WHEN 'queued' THEN 'Guided payment email was queued and the provider has not accepted it'
    ELSE NULL
  END;
  IF v_reason IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  v_outcome := CASE
    WHEN p_reason IN ('provider_accepted', 'queued', 'dispatch_held') THEN 'success'
    ELSE 'denied'
  END;
  SELECT * INTO sess FROM admin_private.customer_action_sessions
    WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NOT NULL THEN
    SELECT * INTO act FROM public.customer_actions WHERE id = sess.action_id;
    IF act.id IS NULL OR act.kind IS DISTINCT FROM 'QUOTE_ACCEPTANCE' OR act.status IS DISTINCT FROM 'COMPLETED' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch');
    END IF;
    SELECT candidate.* INTO ord
    FROM public.service_orders candidate
    JOIN public.quote_acceptances acc ON acc.id = candidate.quote_acceptance_id
    WHERE candidate.id = p_service_order
      AND acc.customer_action_id = act.id
      AND acc.quote_version_id = act.quote_version_id
      AND candidate.customer_id = act.customer_id
      AND candidate.case_id = act.case_id;
    IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
    v_auth := sess.auth_user_id;
  ELSE
    SELECT customer_id, auth_user_id INTO v_customer, v_auth
    FROM admin_private.customer_portal_actor_v1(p_token_hash);
    IF v_customer IS NULL OR v_auth IS NULL THEN
      RETURN jsonb_build_object('status', 'unauthorized');
    END IF;
    SELECT * INTO ord FROM public.service_orders WHERE id = p_service_order AND customer_id = v_customer;
    IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'mismatch'); END IF;
  END IF;
  PERFORM admin_private.write_record_audit_v1(
    v_auth, 'COMMUNICATION_CHANGED', v_outcome, ord.case_id, p_request, 'case', v_reason,
    jsonb_build_object('operation', 'guided_payment_handover', 'reason', p_reason)
  );
  RETURN jsonb_build_object('status', 'recorded');
END;
$$;

REVOKE ALL ON FUNCTION public.customer_record_guided_payment_handover_v1(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_record_guided_payment_handover_v1(text, uuid, uuid, text)
  TO service_role;

COMMIT;
