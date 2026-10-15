BEGIN;

-- PAY-ENV-04: one selected test-mode PROCESS_STRIPE_EVENT, claimed by an
-- authenticated Admin. This does not alter job_promote_outbox_v1 or
-- job_claim_batch_v1. Those functions still accept every job type. This
-- migration is source only until an independent review applies it to DEV.

CREATE FUNCTION admin_private.dev_stripe_event_family_v1(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path=''
AS $$
  SELECT CASE
    WHEN p_type IN (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.expired',
      'checkout.session.async_payment_failed',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.requires_action',
      'payment_intent.canceled',
      'setup_intent.succeeded',
      'invoice.paid',
      'invoice.finalized',
      'invoice.payment_failed'
    ) THEN 'settlement'
    WHEN p_type LIKE 'customer.subscription.%'
      OR p_type LIKE 'refund.%'
      OR p_type LIKE 'charge.dispute.%'
      OR p_type IN ('charge.refunded', 'charge.refund.updated')
      OR p_type LIKE 'invoice.%'
      OR p_type LIKE 'setup_intent.%'
      OR p_type LIKE 'checkout.session.%'
    THEN 'guard'
    ELSE 'unsupported'
  END;
$$;

REVOKE ALL ON FUNCTION admin_private.dev_stripe_event_family_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_dev_stripe_one_shot_claim_v1(
  p_token text,
  p_request uuid,
  p_event_id text,
  p_confirmed boolean,
  p_preflight_clear boolean DEFAULT false
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
  outbox admin_private.job_outbox;
  rec admin_private.stripe_event_receipts;
  row admin_private.jobs;
  family text;
  object_id text;
  event_type text;
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
      'DEV Stripe one-shot requires a fresh sign-in',
      jsonb_build_object('operation', 'dev_stripe_one_shot')
    );
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR coalesce(p_confirmed, false) IS NOT TRUE
    OR p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{4,160}$'
    OR length('process-stripe-event:' || p_event_id) > 200
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  v_key := 'process-stripe-event:' || p_event_id;
  fp := md5(jsonb_build_array('dev_stripe_one_shot', p_event_id)::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    current_status := NULL;
    IF cached ? 'jobId' THEN
      SELECT j.status INTO current_status
      FROM admin_private.jobs j
      WHERE j.id = (cached->>'jobId')::uuid;
    END IF;
    RETURN cached || jsonb_build_object('replay', true, 'currentJobStatus', current_status);
  END IF;

  SELECT * INTO outbox
  FROM admin_private.job_outbox
  WHERE event_key = v_key
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM admin_private.job_outbox WHERE event_key = v_key) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing');
  END IF;

  -- A matching key with any other topic is refused without an update.
  IF outbox.topic IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR outbox.payload->>'eventId' IS DISTINCT FROM p_event_id
    OR outbox.payload->>'livemode' IS DISTINCT FROM 'false'
    OR coalesce(outbox.payload->>'eventType', '') = ''
  THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot refused an event that is not a test-mode Stripe job',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'not_stripe_test')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'not_stripe_test', 'eventId', p_event_id);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  event_type := outbox.payload->>'eventType';
  object_id := nullif(outbox.payload->>'objectId', '');
  SELECT * INTO rec
  FROM admin_private.stripe_event_receipts
  WHERE provider_event_id = p_event_id
  FOR UPDATE;
  IF rec.provider_event_id IS NULL OR rec.livemode IS DISTINCT FROM false
    OR rec.event_type IS DISTINCT FROM event_type
    OR object_id IS NULL OR rec.provider_object_id IS DISTINCT FROM object_id
  THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot refused an event whose receipt does not match',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'receipt')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'receipt', 'eventId', p_event_id);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  family := admin_private.dev_stripe_event_family_v1(event_type);
  IF family = 'guard' OR (
    event_type LIKE 'invoice.%' AND EXISTS (
      SELECT 1 FROM public.guard_subscription_invoices g WHERE g.stripe_invoice_id = object_id
    )
  ) THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot left a Guard-linked event queued',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'guard_event', 'eventType', event_type)
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'guard_event', 'eventId', p_event_id, 'eventType', event_type);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF family IS DISTINCT FROM 'settlement' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV Stripe one-shot refused an unsupported event type',
      jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'reason', 'unsupported', 'eventType', event_type)
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'unsupported', 'eventId', p_event_id, 'eventType', event_type);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF event_type LIKE 'checkout.session.%' OR event_type LIKE 'invoice.%' OR event_type LIKE 'setup_intent.%' THEN
    IF coalesce(p_preflight_clear, false) IS DISTINCT FROM true THEN
      RETURN jsonb_build_object(
        'status', 'preflight_required',
        'eventId', p_event_id,
        'eventType', event_type,
        'objectId', object_id
      );
    END IF;
  END IF;

  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'eventId', p_event_id);
  END IF;

  IF outbox.promoted_at IS NULL THEN
    INSERT INTO admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
    VALUES (outbox.id, 'PROCESS_STRIPE_EVENT', outbox.event_key, outbox.payload, 'PENDING', outbox.available_at)
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox
      SET promoted_at = now(), last_error = NULL
      WHERE id = outbox.id AND promoted_at IS NULL;
  END IF;

  SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id FOR UPDATE;
  IF row.id IS NULL OR row.job_type IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR row.idempotency_key IS DISTINCT FROM v_key
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_stripe_test', 'eventId', p_event_id);
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'eventId', p_event_id, 'jobId', row.id);
  END IF;
  IF row.status IN ('PENDING', 'RETRY') AND row.scheduled_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'eventId', p_event_id, 'jobId', row.id);
  END IF;

  IF row.status = 'RUNNING' THEN
    IF row.attempts >= row.max_attempts THEN
      PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'DEAD_LETTER', 'Maximum attempts exhausted after worker lease expiry');
      UPDATE admin_private.jobs
        SET status = 'DEAD_LETTER',
            dead_lettered_at = now(),
            lease_expires_at = NULL,
            lease_owner = NULL,
            lease_token = NULL,
            last_error = 'Maximum attempts exhausted after worker lease expiry',
            updated_at = now(),
            record_version = row.record_version + 1
        WHERE id = row.id AND status = 'RUNNING';
      result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER',
          dead_lettered_at = now(),
          lease_expires_at = NULL,
          lease_owner = NULL,
          lease_token = NULL,
          last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = now(),
          record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  token := gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a
  WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING',
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-stripe-one-shot',
        lease_token = token,
        attempts = row.attempts + 1,
        updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'eventId', p_event_id);
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-stripe-one-shot', token, NULL);

  result := jsonb_build_object(
    'status', 'success',
    'replay', false,
    'eventId', p_event_id,
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
    'DEV Stripe one-shot claimed one test-mode event',
    jsonb_build_object('operation', 'dev_stripe_one_shot', 'eventId', p_event_id, 'eventType', event_type, 'jobType', 'PROCESS_STRIPE_EVENT')
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dev_stripe_one_shot_claim_v1(text, uuid, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_dev_stripe_one_shot_claim_v1(text, uuid, text, boolean, boolean)
  TO service_role;

COMMIT;
