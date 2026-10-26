BEGIN;

-- PAYMENTS-E2E-POSTCHECKOUT-01. A bounded DEV Preview worker can promote and
-- lease one test-mode settlement PROCESS_STRIPE_EVENT at a time. It does not
-- alter job_promote_outbox_v1 or job_claim_batch_v1, and it does not mark a
-- receipt processed. Source only. Do not apply to DEV or Production from
-- this change. It does not charge a card or edit an existing case.

CREATE FUNCTION public.dev_payment_event_candidates_v1(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE batch integer; events jsonb;
BEGIN
  batch := least(greatest(coalesce(p_limit, 20), 1), 20);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'eventId', picked.event_id,
    'eventType', picked.event_type,
    'objectId', picked.object_id,
    'availableAt', picked.available_at
  ) ORDER BY picked.payment_first, picked.available_at, picked.event_id), '[]'::jsonb)
  INTO events
  FROM (
    SELECT
      o.payload->>'eventId' AS event_id,
      o.payload->>'eventType' AS event_type,
      o.payload->>'objectId' AS object_id,
      o.available_at,
      CASE WHEN o.payload->>'eventType' LIKE 'payment_intent.%' THEN 0 ELSE 1 END AS payment_first
    FROM admin_private.job_outbox o
    JOIN admin_private.stripe_event_receipts r
      ON r.provider_event_id = o.payload->>'eventId'
    WHERE o.topic = 'PROCESS_STRIPE_EVENT'
      AND o.payload->>'livemode' = 'false'
      AND r.livemode IS FALSE
      AND r.event_type = o.payload->>'eventType'
      AND nullif(o.payload->>'objectId', '') IS NOT NULL
      AND r.provider_object_id = o.payload->>'objectId'
      AND o.available_at <= now()
      AND admin_private.dev_stripe_event_family_v1(o.payload->>'eventType') = 'settlement'
      AND o.payload->>'eventType' NOT LIKE 'invoice.%'
      AND o.payload->>'eventType' NOT LIKE 'setup_intent.%'
      AND (
        r.processed IS FALSE
        OR EXISTS (
          SELECT 1 FROM admin_private.jobs finished
          WHERE finished.outbox_id = o.id
            AND (
              (finished.status = 'RUNNING' AND (finished.lease_expires_at IS NULL OR finished.lease_expires_at < now()))
              OR (finished.status IN ('PENDING', 'RETRY') AND finished.scheduled_at <= now())
            )
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM admin_private.jobs j
        WHERE j.outbox_id = o.id
          AND (
            j.status = 'SUCCEEDED'
            OR j.status = 'DEAD_LETTER'
            OR (j.status = 'RUNNING' AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at >= now())
            OR (j.status IN ('PENDING', 'RETRY') AND j.scheduled_at > now())
          )
      )
    ORDER BY payment_first, o.available_at, o.id
    LIMIT batch
  ) picked;
  RETURN jsonb_build_object('status', 'success', 'events', events);
END;
$$;

CREATE FUNCTION public.dev_payment_event_queue_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE n integer; oldest timestamptz;
BEGIN
  SELECT count(*)::int, min(o.available_at)
  INTO n, oldest
  FROM admin_private.job_outbox o
  JOIN admin_private.stripe_event_receipts r
    ON r.provider_event_id = o.payload->>'eventId'
  WHERE o.topic = 'PROCESS_STRIPE_EVENT'
    AND o.payload->>'livemode' = 'false'
    AND r.livemode IS FALSE
    AND r.processed IS FALSE
    AND r.event_type = o.payload->>'eventType'
    AND nullif(o.payload->>'objectId', '') IS NOT NULL
    AND r.provider_object_id = o.payload->>'objectId'
    AND admin_private.dev_stripe_event_family_v1(o.payload->>'eventType') = 'settlement'
    AND o.payload->>'eventType' NOT LIKE 'invoice.%'
    AND o.payload->>'eventType' NOT LIKE 'setup_intent.%'
    AND NOT EXISTS (
      SELECT 1 FROM admin_private.jobs j
      WHERE j.outbox_id = o.id AND j.status = 'SUCCEEDED'
    );
  RETURN jsonb_build_object('status', 'success', 'unprocessed', n, 'oldestAvailableAt', oldest);
END;
$$;

CREATE FUNCTION public.dev_payment_event_claim_v1(
  p_event_id text,
  p_settlement_clear boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_key text;
  outbox admin_private.job_outbox;
  rec admin_private.stripe_event_receipts;
  row admin_private.jobs;
  family text;
  object_id text;
  event_type text;
  token uuid;
  attempt_no integer;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{4,160}$'
    OR length('process-stripe-event:' || p_event_id) > 200
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid'); END IF;

  v_key := 'process-stripe-event:' || p_event_id;
  SELECT * INTO outbox
  FROM admin_private.job_outbox
  WHERE event_key = v_key
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM admin_private.job_outbox WHERE event_key = v_key) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked', 'eventId', p_event_id);
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing', 'eventId', p_event_id);
  END IF;

  IF outbox.topic IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR outbox.payload->>'eventId' IS DISTINCT FROM p_event_id
    OR outbox.payload->>'livemode' IS DISTINCT FROM 'false'
    OR coalesce(outbox.payload->>'eventType', '') = ''
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_stripe_test', 'eventId', p_event_id);
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
    RETURN jsonb_build_object('status', 'denied', 'reason', 'receipt', 'eventId', p_event_id);
  END IF;
  -- A crash after the payment was applied leaves the receipt processed and the
  -- job RUNNING. Reclaim that job. Do not promote a new job for a receipt that
  -- was already applied.
  IF rec.processed IS TRUE AND outbox.promoted_at IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'eventId', p_event_id);
  END IF;

  family := admin_private.dev_stripe_event_family_v1(event_type);
  IF event_type LIKE 'invoice.%' OR event_type LIKE 'setup_intent.%' OR family = 'guard' OR (
    event_type LIKE 'invoice.%' AND EXISTS (
      SELECT 1 FROM public.guard_subscription_invoices g WHERE g.stripe_invoice_id = object_id
    )
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'guard_event', 'eventId', p_event_id, 'eventType', event_type);
  END IF;
  IF family IS DISTINCT FROM 'settlement' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unsupported', 'eventId', p_event_id, 'eventType', event_type);
  END IF;

  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'eventId', p_event_id);
  END IF;
  IF event_type LIKE 'checkout.session.%' AND coalesce(p_settlement_clear, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'status', 'preflight_required',
      'eventId', p_event_id,
      'eventType', event_type,
      'objectId', object_id
    );
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
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', row.status);
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', row.status);
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
      RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
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
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
  END IF;

  token := gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a
  WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING',
        claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-payment-events',
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
  VALUES (row.id, attempt_no, 'dev-payment-events', token, NULL);

  RETURN jsonb_build_object(
    'status', 'success',
    'eventId', p_event_id,
    'eventType', event_type,
    'objectId', object_id,
    'jobId', row.id,
    'jobType', row.job_type,
    'idempotencyKey', row.idempotency_key,
    'payload', row.payload,
    'leaseToken', token,
    'attempts', row.attempts,
    'maxAttempts', row.max_attempts
  );
END;
$$;

-- Returns a Guard-linked claim to the queue without burning the attempt or
-- dead-lettering it. The receipt stays unprocessed.
CREATE FUNCTION public.dev_payment_event_release_v1(p_job uuid, p_lease uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE row admin_private.jobs; reason text;
BEGIN
  reason := left(btrim(coalesce(p_reason, 'Released without applying a payment.')), 200);
  SELECT * INTO row
  FROM admin_private.jobs
  WHERE id = p_job AND status = 'RUNNING' AND lease_token = p_lease AND lease_owner = 'dev-payment-events'
  FOR UPDATE;
  IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  PERFORM admin_private.finish_job_attempt_v1(row.id, p_lease, 'LEASE_EXPIRED', reason);
  UPDATE admin_private.jobs
    SET status = 'PENDING',
        scheduled_at = now(),
        claimed_at = NULL,
        lease_expires_at = NULL,
        lease_owner = NULL,
        lease_token = NULL,
        attempts = greatest(attempts - 1, 0),
        last_error = NULL,
        updated_at = now(),
        record_version = record_version + 1
    WHERE id = row.id AND status = 'RUNNING' AND lease_token = p_lease;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  RETURN jsonb_build_object('status', 'success', 'jobId', row.id, 'jobStatus', 'PENDING');
END;
$$;

REVOKE ALL ON FUNCTION public.dev_payment_event_candidates_v1(integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dev_payment_event_queue_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dev_payment_event_claim_v1(text, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dev_payment_event_release_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dev_payment_event_candidates_v1(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_payment_event_queue_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_payment_event_claim_v1(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_payment_event_release_v1(uuid, uuid, text) TO service_role;

COMMIT;
