-- Customer commercial payment settlement v1.
-- Repository only. The DEV ledger still contains 102 applied migrations and
-- ends at canonical 20261103230000. This file is not the DEV ledger head.
-- Do not apply 20261104190000 to DEV. Do not apply 20261104190000 to Production.
-- Do not replay 20261103230000.
-- containsDataChange: false. safeToReplay: false.
-- This file records one immutable initial-invoice payment and moves only that
-- subscription from PAYMENT_PENDING to ACTIVE. It does not provision Telloya,
-- activate Guard, grant an entitlement, start overage, or send mail.

CREATE OR REPLACE FUNCTION admin_private.guard_commercial_subscription_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  plan public.plan_versions;
  occupying uuid;
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
    IF OLD.state <> 'DRAFT' AND (
      NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
      OR NEW.tax_amount_minor IS DISTINCT FROM OLD.tax_amount_minor
      OR NEW.cadence_snapshot IS DISTINCT FROM OLD.cadence_snapshot
      OR NEW.terms_ref IS DISTINCT FROM OLD.terms_ref
      OR NEW.grant_kind IS DISTINCT FROM OLD.grant_kind
      OR NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.plan_family IS DISTINCT FROM OLD.plan_family
      OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
    ) THEN
      RAISE EXCEPTION 'accepted commercial snapshots are immutable';
    END IF;
    IF OLD.current_period_end IS NOT NULL AND (
      NEW.current_period_end IS NULL OR NEW.current_period_end < OLD.current_period_end
    ) THEN
      RAISE EXCEPTION 'evidenced commercial period cannot be shortened';
    END IF;
  END IF;

  SELECT * INTO plan FROM public.plan_versions WHERE id = NEW.plan_version_id;
  IF NEW.state <> 'DRAFT' AND (
    TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND (OLD.state = 'DRAFT' OR NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id))
  ) THEN
    IF plan.status <> 'APPROVED' OR plan.terms_ref IS NULL OR char_length(btrim(plan.terms_ref)) = 0 THEN
      RAISE EXCEPTION 'unapproved plan cannot be offered';
    END IF;
    IF NEW.currency IS DISTINCT FROM plan.currency
      OR NEW.cadence_snapshot IS DISTINCT FROM plan.billing_cadence
      OR NEW.terms_ref IS DISTINCT FROM plan.terms_ref
    THEN
      RAISE EXCEPTION 'commercial snapshot must match the approved plan';
    END IF;
    IF NEW.grant_kind = 'BILLABLE' AND (plan.amount_minor IS NULL OR plan.tax_behaviour IS NULL) THEN
      RAISE EXCEPTION 'unpriced plan cannot be offered as billable';
    END IF;
    IF NEW.grant_kind = 'BILLABLE' AND (
      NEW.amount_minor IS DISTINCT FROM plan.amount_minor
      OR NEW.tax_behaviour IS DISTINCT FROM plan.tax_behaviour
    ) THEN
      RAISE EXCEPTION 'billable snapshot must match the approved plan';
    END IF;
    IF NEW.grant_kind = 'NON_BILLABLE_PILOT' AND (
      NEW.amount_minor IS NOT NULL
      OR NEW.tax_behaviour IS NOT NULL
      OR NEW.tax_amount_minor IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'non-billable pilot cannot carry a price';
    END IF;
  END IF;

  IF NEW.grant_kind = 'NON_BILLABLE_PILOT'
    AND NEW.state NOT IN ('DRAFT', 'CANCELED', 'ENDED')
    AND (NEW.pilot_ends_at IS NULL OR NEW.pilot_ends_at <= pg_catalog.now())
  THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'non-billable pilot requires a future end';
    ELSIF OLD.state IS DISTINCT FROM NEW.state OR OLD.pilot_ends_at IS DISTINCT FROM NEW.pilot_ends_at THEN
      RAISE EXCEPTION 'non-billable pilot requires a future end';
    END IF;
  END IF;

  IF NEW.state <> 'DRAFT' AND NOT EXISTS (
    SELECT 1
    FROM public.business_memberships membership
    WHERE membership.customer_id = NEW.customer_id
      AND membership.business_id = NEW.business_id
      AND membership.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'billing customer needs a verified membership before the subscription leaves draft';
  END IF;

  SELECT id INTO occupying
  FROM public.commercial_subscriptions existing
  WHERE existing.business_id = NEW.business_id
    AND existing.id IS DISTINCT FROM NEW.id
    AND existing.state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
  FOR UPDATE;

  IF NEW.state IN ('OFFERED', 'ACCEPTED', 'PAYMENT_PENDING') THEN
    IF occupying IS NOT NULL AND NEW.succeeds_subscription_id IS DISTINCT FROM occupying THEN
      RAISE EXCEPTION 'incoming subscription must succeed the occupying subscription';
    END IF;
    IF occupying IS NULL AND NEW.succeeds_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'succeeds_subscription_id requires an occupying subscription';
    END IF;
  END IF;

  IF NEW.succeeds_subscription_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.commercial_subscriptions predecessor
    WHERE predecessor.id = NEW.succeeds_subscription_id
      AND predecessor.business_id = NEW.business_id
      AND predecessor.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'replacement must stay on the same business';
  END IF;

  IF NEW.stripe_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.stripe_customer_maps mapped
    WHERE mapped.customer_id = NEW.customer_id
      AND mapped.stripe_customer_id = NEW.stripe_customer_id
  ) THEN
    RAISE EXCEPTION 'commercial stripe customer must match stripe_customer_maps';
  END IF;

  IF NEW.stripe_subscription_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.guard_subscriptions guard_row
    WHERE guard_row.stripe_subscription_id = NEW.stripe_subscription_id
  ) THEN
    RAISE EXCEPTION 'commercial stripe subscription must not reuse a Guard subscription';
  END IF;

  IF NEW.grant_kind = 'BILLABLE' AND NEW.state = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'ACTIVE') THEN
    IF coalesce(current_setting('admin_private.commercial_settlement_lease', true), '') = ''
      OR coalesce(current_setting('admin_private.commercial_settlement_event', true), '') = ''
      OR NEW.current_period_start IS NULL
      OR NEW.current_period_end IS NULL
      OR NEW.current_period_end <= NEW.current_period_start
      OR NEW.stripe_customer_id IS NULL
      OR NEW.stripe_subscription_id IS NULL
      OR NEW.cancel_at_period_end
      OR NOT EXISTS (
        SELECT 1
        FROM public.commercial_payment_evidence evidence
        WHERE evidence.subscription_id = NEW.id
          AND evidence.provider_event_id = current_setting('admin_private.commercial_settlement_event', true)
          AND evidence.amount_minor = NEW.amount_minor
          AND evidence.currency = NEW.currency
          AND evidence.period_start = NEW.current_period_start
          AND evidence.period_end = NEW.current_period_end
      )
      OR NOT EXISTS (
        SELECT 1
        FROM admin_private.jobs job
        JOIN admin_private.job_outbox outbox ON outbox.id = job.outbox_id
        WHERE job.status = 'RUNNING'
          AND job.lease_owner = 'dev-payment-events'
          AND job.lease_token::text = current_setting('admin_private.commercial_settlement_lease', true)
          AND job.lease_expires_at >= pg_catalog.now()
          AND outbox.topic = 'PROCESS_STRIPE_EVENT'
          AND outbox.payload->>'eventId' = current_setting('admin_private.commercial_settlement_event', true)
          AND outbox.payload->>'eventType' = 'invoice.paid'
          AND outbox.payload->>'livemode' = 'false'
      )
    THEN
      RAISE EXCEPTION 'billable subscription cannot become active until trusted payment evidence exists';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION admin_private.customer_portal_onboarding_projection_v1(
  p_request_state text,
  p_membership text,
  p_email_verified boolean,
  p_location_count integer,
  p_mark_ready boolean,
  p_subscription_state text,
  p_payment_recorded boolean,
  p_provision_state text,
  p_provision_ready boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  stage text;
  label text;
  waiting text := 'us';
  action_needed boolean := false;
  next_step text;
  completed jsonb := jsonb_build_array('Request received');
  reveal boolean := false;
BEGIN
  IF p_request_state IN ('DECLINED', 'CLOSED') THEN
    RETURN jsonb_build_object(
      'stage', CASE WHEN p_request_state = 'DECLINED' THEN 'declined' ELSE 'closed' END,
      'statusLabel', 'Request closed',
      'waitingFor', 'us',
      'customerActionRequired', false,
      'nextStep', 'This request is closed.',
      'completed', completed,
      'revealBusiness', p_membership = 'verified'
    );
  END IF;

  IF p_membership = 'revoked' THEN
    IF p_request_state IS DISTINCT FROM 'RECEIVED' THEN
      completed := completed || jsonb_build_array('Under review');
    END IF;
    RETURN jsonb_build_object(
      'stage', 'under_review',
      'statusLabel', 'Request in progress',
      'waitingFor', 'us',
      'customerActionRequired', false,
      'nextStep', 'We are reviewing this request.',
      'completed', completed,
      'revealBusiness', false
    );
  END IF;

  IF p_membership = 'pending' THEN
    IF p_request_state IS DISTINCT FROM 'RECEIVED' THEN
      completed := completed || jsonb_build_array('Under review');
    END IF;
    RETURN jsonb_build_object(
      'stage', 'verification',
      'statusLabel', 'Awaiting verification',
      'waitingFor', 'us',
      'customerActionRequired', false,
      'nextStep', 'We are checking that you can act for this business.',
      'completed', completed,
      'revealBusiness', false
    );
  END IF;

  reveal := p_membership = 'verified';
  IF p_request_state IS DISTINCT FROM 'RECEIVED' THEN
    completed := completed || jsonb_build_array('Under review');
  END IF;
  IF p_email_verified THEN
    completed := completed || jsonb_build_array('Email checked');
  END IF;
  IF reveal THEN
    completed := completed || jsonb_build_array('Business authority checked');
    IF coalesce(p_location_count, 0) > 0 THEN
      completed := completed || jsonb_build_array('Locations selected');
    END IF;
  END IF;

  -- Offer recorded follows a linked subscription whose state already holds
  -- an offer. A request marked OFFERED with no subscription does not.
  -- Service setup recorded follows a matching provision that has left
  -- NOT_STARTED. ACTIVE, PROVISIONING, or an unverified LIVE state can show
  -- the current stage and do not complete it. Ready for use still requires
  -- p_provision_ready, which is genuine LIVE evidence at every location.
  IF p_subscription_state IN (
    'OFFERED', 'ACCEPTED', 'PAYMENT_PENDING',
    'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCEL_AT_PERIOD_END'
  ) THEN
    completed := completed || jsonb_build_array('Offer recorded');
  END IF;

  IF p_provision_ready THEN
    stage := 'ready';
    label := 'Ready for use';
    next_step := 'The service is ready to use.';
    completed := completed || jsonb_build_array('Service setup recorded', 'Ready for use');
  ELSIF p_request_state IN ('PROVISIONING', 'READY')
    OR (p_provision_state IS NOT NULL AND p_provision_state <> 'ENDED')
    OR p_subscription_state IN ('ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCEL_AT_PERIOD_END')
  THEN
    stage := 'service_setup';
    label := 'Service setup';
    IF p_provision_state IN (
      'PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED',
      'FORWARDING_REQUIRED', 'TEST_REQUIRED', 'AWAITING_CONFIRMATION',
      'READY_FOR_PROVIDER_VERIFICATION', 'SUSPENDED'
    ) THEN
      completed := completed || jsonb_build_array('Service setup recorded');
    END IF;
    IF p_provision_state = 'AWAITING_CONFIRMATION' THEN
      waiting := 'you';
      action_needed := true;
      next_step := 'We need you to confirm this setup.';
    ELSIF p_subscription_state = 'ACTIVE' AND p_provision_state IS NULL THEN
      next_step := 'Payment is recorded. Service setup has not started.';
    ELSE
      next_step := 'We are setting up the service.';
    END IF;
  ELSIF p_request_state = 'AWAITING_PAYMENT' OR p_subscription_state = 'PAYMENT_PENDING' THEN
    stage := 'awaiting_customer';
    IF p_payment_recorded THEN
      label := 'Payment recorded';
      completed := completed || jsonb_build_array('Payment recorded');
      next_step := 'A payment has been recorded. We are checking it.';
    ELSE
      label := 'Awaiting your payment';
      waiting := 'you';
      action_needed := true;
      next_step := 'A payment step has been recorded. There is no payment button on this page.';
    END IF;
  ELSIF p_subscription_state = 'ACCEPTED' THEN
    stage := 'awaiting_customer';
    label := 'Acceptance recorded';
    next_step := 'Your acceptance is recorded. We will confirm the next step.';
    completed := completed || jsonb_build_array('Acceptance recorded');
  ELSIF p_subscription_state = 'OFFERED' THEN
    stage := 'offer_preparation';
    label := 'Offer prepared';
    next_step := 'An offer has been prepared. There is nothing to accept or pay on this page.';
  ELSIF p_request_state = 'OFFERED' THEN
    stage := 'offer_preparation';
    label := 'Offer being prepared';
    next_step := 'We are preparing the offer. There is nothing to accept or pay yet.';
  ELSIF reveal AND p_email_verified AND p_mark_ready AND coalesce(p_location_count, 0) > 0 AND p_request_state = 'IN_REVIEW' THEN
    stage := 'offer_preparation';
    label := 'Offer being prepared';
    next_step := 'We are preparing the offer. There is nothing to accept or pay yet.';
  ELSIF p_request_state = 'MAILBOX_REQUIRED' AND NOT p_email_verified THEN
    stage := 'verification';
    label := 'Awaiting verification';
    waiting := 'you';
    action_needed := true;
    next_step := 'Confirm the email address on this request. Signing in does not complete that check.';
  ELSIF p_request_state = 'RECEIVED' THEN
    stage := 'received';
    label := 'Request received';
    next_step := 'We have received this request and will review it.';
  ELSE
    stage := 'under_review';
    label := 'Request in progress';
    next_step := 'We are reviewing this request.';
  END IF;

  RETURN jsonb_build_object(
    'stage', stage,
    'statusLabel', label,
    'waitingFor', waiting,
    'customerActionRequired', action_needed,
    'nextStep', next_step,
    'completed', completed,
    'revealBusiness', reveal
  );
END;
$$;


CREATE OR REPLACE FUNCTION admin_private.guard_commercial_payment_evidence_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent public.commercial_subscriptions;
  receipt admin_private.stripe_event_receipts;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'payment evidence is immutable';
  END IF;
  IF coalesce(current_setting('admin_private.commercial_settlement_lease', true), '') = ''
    OR current_setting('admin_private.commercial_settlement_event', true) IS DISTINCT FROM NEW.provider_event_id
    OR coalesce(current_setting('admin_private.commercial_settlement_invoice', true), '') = ''
  THEN
    RAISE EXCEPTION 'paid commercial evidence is disabled until a trusted invoice binding exists';
  END IF;
  SELECT * INTO parent FROM public.commercial_subscriptions WHERE id = NEW.subscription_id;
  IF parent.id IS NULL OR parent.grant_kind IS DISTINCT FROM 'BILLABLE' OR parent.state IS DISTINCT FROM 'PAYMENT_PENDING' THEN
    RAISE EXCEPTION 'paid commercial evidence is disabled until a trusted invoice binding exists';
  END IF;
  IF NEW.amount_minor IS DISTINCT FROM parent.amount_minor OR NEW.currency IS DISTINCT FROM parent.currency THEN
    RAISE EXCEPTION 'payment evidence must match the commercial snapshot';
  END IF;
  IF NEW.period_end <= NEW.period_start THEN
    RAISE EXCEPTION 'paid commercial evidence is disabled until a trusted invoice binding exists';
  END IF;
  SELECT * INTO receipt
  FROM admin_private.stripe_event_receipts
  WHERE provider_event_id = NEW.provider_event_id;
  IF receipt.provider_event_id IS NULL
    OR receipt.processed IS TRUE
    OR receipt.livemode IS DISTINCT FROM false
    OR receipt.event_type IS DISTINCT FROM 'invoice.paid'
    OR receipt.provider_object_id IS DISTINCT FROM current_setting('admin_private.commercial_settlement_invoice', true)
  THEN
    RAISE EXCEPTION 'paid commercial evidence is disabled until a trusted invoice binding exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM admin_private.jobs job
    JOIN admin_private.job_outbox outbox ON outbox.id = job.outbox_id
    WHERE job.status = 'RUNNING'
      AND job.lease_owner = 'dev-payment-events'
      AND job.lease_token::text = current_setting('admin_private.commercial_settlement_lease', true)
      AND job.lease_expires_at >= pg_catalog.now()
      AND outbox.payload->>'eventId' = NEW.provider_event_id
      AND outbox.payload->>'eventType' = 'invoice.paid'
      AND outbox.payload->>'objectId' = receipt.provider_object_id
      AND outbox.payload->>'livemode' = 'false'
  ) THEN
    RAISE EXCEPTION 'paid commercial evidence is disabled until a trusted invoice binding exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_memberships membership
    WHERE membership.customer_id = parent.customer_id
      AND membership.business_id = parent.business_id
      AND membership.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'paid commercial evidence is disabled until a trusted invoice binding exists';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.commercial_payment_evidence existing
    WHERE existing.subscription_id = NEW.subscription_id
      AND existing.period_start < NEW.period_end
      AND NEW.period_start < existing.period_end
  ) THEN
    RAISE EXCEPTION 'payment evidence periods cannot overlap';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.commercial_payment_invoice_claim_v1(
  p_event_id text,
  p_price_id text,
  p_stripe_customer_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  outbox admin_private.job_outbox;
  rec admin_private.stripe_event_receipts;
  row admin_private.jobs;
  event_type text;
  object_id text;
  token uuid;
  attempt_no integer;
  matches integer;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9_]{4,160}$'
    OR length('process-stripe-event:' || p_event_id) > 200
    OR p_price_id IS NULL OR p_price_id !~ '^price_[A-Za-z0-9]+$'
    OR p_stripe_customer_id IS NULL OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$'
  THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid', 'retryable', false); END IF;

  v_key := 'process-stripe-event:' || p_event_id;
  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = v_key FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM admin_private.job_outbox WHERE event_key = v_key) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked', 'eventId', p_event_id, 'retryable', true);
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing', 'eventId', p_event_id, 'retryable', false);
  END IF;
  IF outbox.topic IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR outbox.payload->>'eventId' IS DISTINCT FROM p_event_id
    OR outbox.payload->>'livemode' IS DISTINCT FROM 'false'
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_stripe_test', 'eventId', p_event_id, 'retryable', false);
  END IF;
  event_type := outbox.payload->>'eventType';
  object_id := nullif(outbox.payload->>'objectId', '');
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id FOR UPDATE;
  IF rec.provider_event_id IS NULL OR rec.livemode IS DISTINCT FROM false
    OR rec.event_type IS DISTINCT FROM event_type
    OR object_id IS NULL OR rec.provider_object_id IS DISTINCT FROM object_id
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'receipt', 'eventId', p_event_id, 'retryable', false);
  END IF;
  IF event_type IS DISTINCT FROM 'invoice.paid' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unsupported', 'eventId', p_event_id, 'eventType', event_type, 'retryable', false);
  END IF;
  IF EXISTS (SELECT 1 FROM public.guard_subscription_invoices guard_invoice WHERE guard_invoice.stripe_invoice_id = object_id) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'guard_event', 'eventId', p_event_id, 'retryable', false);
  END IF;
  SELECT count(*)::int INTO matches
  FROM public.commercial_checkout_preparations preparation
  JOIN public.stripe_customer_maps map
    ON map.customer_id = preparation.customer_id
   AND map.livemode = false
   AND map.stripe_customer_id = p_stripe_customer_id
  WHERE preparation.stripe_price_id = p_price_id
    AND preparation.livemode = false
    AND preparation.checkout_session_id IS NOT NULL;
  IF matches = 0 THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'preparation', 'eventId', p_event_id, 'retryable', false);
  END IF;
  IF matches > 1 THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'ambiguous_price', 'eventId', p_event_id, 'retryable', false);
  END IF;
  IF rec.processed IS TRUE AND outbox.promoted_at IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'eventId', p_event_id, 'retryable', false);
  END IF;
  IF outbox.promoted_at IS NULL AND outbox.available_at > pg_catalog.now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'eventId', p_event_id, 'retryable', true);
  END IF;
  IF outbox.promoted_at IS NULL THEN
    INSERT INTO admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
    VALUES (outbox.id, 'PROCESS_STRIPE_EVENT', outbox.event_key, outbox.payload, 'PENDING', outbox.available_at)
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox SET promoted_at = pg_catalog.now(), last_error = NULL
    WHERE id = outbox.id AND promoted_at IS NULL;
  END IF;
  SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id FOR UPDATE;
  IF row.id IS NULL OR row.job_type IS DISTINCT FROM 'PROCESS_STRIPE_EVENT' OR row.idempotency_key IS DISTINCT FROM v_key THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_stripe_test', 'eventId', p_event_id, 'retryable', false);
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'eventId', p_event_id, 'jobId', row.id, 'retryable', false);
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'retryable', false);
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= pg_catalog.now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'eventId', p_event_id, 'jobId', row.id, 'retryable', true);
  END IF;
  IF row.status IN ('PENDING', 'RETRY') AND row.scheduled_at > pg_catalog.now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'eventId', p_event_id, 'jobId', row.id, 'retryable', true);
  END IF;
  IF row.status = 'RUNNING' THEN
    IF row.attempts >= row.max_attempts THEN
      PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'DEAD_LETTER', 'Maximum attempts exhausted after worker lease expiry');
      UPDATE admin_private.jobs
        SET status = 'DEAD_LETTER', dead_lettered_at = pg_catalog.now(), lease_expires_at = NULL,
            lease_owner = NULL, lease_token = NULL, last_error = 'Maximum attempts exhausted after worker lease expiry',
            updated_at = pg_catalog.now(), record_version = row.record_version + 1
        WHERE id = row.id AND status = 'RUNNING';
      RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'retryable', false);
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER', dead_lettered_at = pg_catalog.now(), lease_expires_at = NULL,
          lease_owner = NULL, lease_token = NULL, last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = pg_catalog.now(), record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    RETURN jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'eventId', p_event_id, 'jobId', row.id, 'retryable', false);
  END IF;
  token := pg_catalog.gen_random_uuid();
  SELECT coalesce(max(attempt.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts attempt WHERE attempt.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING', claimed_at = pg_catalog.now(),
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => 120),
        lease_owner = 'dev-payment-events', lease_token = token, attempts = row.attempts + 1,
        updated_at = pg_catalog.now(), record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'eventId', p_event_id, 'retryable', true);
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-payment-events', token, NULL);
  RETURN jsonb_build_object(
    'status', 'success', 'eventId', p_event_id, 'eventType', event_type, 'objectId', object_id,
    'jobId', row.id, 'jobType', row.job_type, 'idempotencyKey', row.idempotency_key,
    'leaseToken', token, 'attempts', row.attempts, 'maxAttempts', row.max_attempts, 'retryable', false
  );
END;
$$;

CREATE FUNCTION public.commercial_payment_settle_initial_invoice_v1(
  p_job uuid,
  p_lease uuid,
  p_facts jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  outbox admin_private.job_outbox;
  rec admin_private.stripe_event_receipts;
  job admin_private.jobs;
  prep public.commercial_checkout_preparations;
  sub public.commercial_subscriptions;
  acc public.commercial_offer_acceptances;
  plan public.plan_versions;
  event_id text;
  invoice_id text;
  session_id text;
  stripe_customer text;
  stripe_subscription text;
  stripe_price text;
  amount_paid integer;
  amount_due integer;
  quantity integer;
  line_count integer;
  discount_minor integer;
  tax_minor integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  matches integer;
BEGIN
  IF p_job IS NULL OR p_lease IS NULL OR p_facts IS NULL OR jsonb_typeof(p_facts) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid', 'retryable', false);
  END IF;
  event_id := p_facts->>'eventId';
  invoice_id := p_facts->>'invoiceId';
  IF event_id IS NULL OR event_id !~ '^evt_[A-Za-z0-9_]{4,160}$' OR invoice_id IS NULL OR invoice_id !~ '^in_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid', 'retryable', false);
  END IF;

  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = 'process-stripe-event:' || event_id FOR UPDATE;
  IF outbox.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing', 'retryable', false);
  END IF;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = event_id FOR UPDATE;
  SELECT * INTO job FROM admin_private.jobs WHERE id = p_job FOR UPDATE;
  IF job.id IS NULL OR job.outbox_id IS DISTINCT FROM outbox.id THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'lease', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_payment_evidence evidence
    WHERE evidence.provider_event_id = event_id
  ) AND rec.processed IS TRUE AND job.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status', 'already_processed', 'reason', 'event', 'retryable', false);
  END IF;
  IF job.status IS DISTINCT FROM 'RUNNING'
    OR job.lease_token IS DISTINCT FROM p_lease
    OR job.lease_owner IS DISTINCT FROM 'dev-payment-events'
    OR job.lease_expires_at IS NULL
    OR job.lease_expires_at < pg_catalog.now()
    OR job.job_type IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR job.idempotency_key IS DISTINCT FROM 'process-stripe-event:' || event_id
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'lease', 'retryable', false);
  END IF;
  IF outbox.topic IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR outbox.payload->>'eventId' IS DISTINCT FROM event_id
    OR outbox.payload->>'eventType' IS DISTINCT FROM 'invoice.paid'
    OR outbox.payload->>'livemode' IS DISTINCT FROM 'false'
    OR outbox.payload->>'objectId' IS DISTINCT FROM invoice_id
    OR rec.provider_event_id IS NULL
    OR rec.event_type IS DISTINCT FROM 'invoice.paid'
    OR rec.livemode IS DISTINCT FROM false
    OR rec.provider_object_id IS DISTINCT FROM invoice_id
    OR rec.processed IS TRUE
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'receipt', 'retryable', false);
  END IF;
  IF EXISTS (SELECT 1 FROM public.guard_subscription_invoices guard_invoice WHERE guard_invoice.stripe_invoice_id = invoice_id) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'guard_event', 'retryable', false);
  END IF;

  IF p_facts->>'checkoutSessionId' IS NULL OR (p_facts->>'checkoutSessionId') !~ '^cs_[A-Za-z0-9][A-Za-z0-9_]{7,248}$'
    OR p_facts->>'stripeCustomerId' IS NULL OR (p_facts->>'stripeCustomerId') !~ '^cus_[A-Za-z0-9]+$'
    OR p_facts->>'stripeSubscriptionId' IS NULL OR (p_facts->>'stripeSubscriptionId') !~ '^sub_[A-Za-z0-9]+$'
    OR p_facts->>'checkoutSubscriptionId' IS NULL OR (p_facts->>'checkoutSubscriptionId') !~ '^sub_[A-Za-z0-9]+$'
    OR p_facts->>'stripePriceId' IS NULL OR (p_facts->>'stripePriceId') !~ '^price_[A-Za-z0-9]+$'
    OR p_facts->>'currency' IS NULL
    OR p_facts->>'invoiceStatus' IS NULL OR p_facts->>'billingReason' IS NULL
    OR p_facts->>'subscriptionStatus' IS NULL
    OR jsonb_typeof(p_facts->'livemode') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'automaticTax') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'trial') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'refunded') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'disputed') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'cancelAtPeriodEnd') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'schedulePresent') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'subscriptionLivemode') IS DISTINCT FROM 'boolean'
    OR coalesce(p_facts->>'amountPaidMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'amountDueMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'quantity', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'lineCount', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'discountMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'taxMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'subscriptionQuantity', '') !~ '^[0-9]+$'
    OR p_facts->>'periodStart' IS NULL OR p_facts->>'periodEnd' IS NULL
    OR p_facts->>'subscriptionCustomerId' IS NULL
    OR p_facts->>'subscriptionPriceId' IS NULL
    OR p_facts->>'subscriptionPeriodStart' IS NULL
    OR p_facts->>'subscriptionPeriodEnd' IS NULL
  THEN
    RETURN jsonb_build_object('status', 'pending', 'reason', 'provider_incomplete', 'retryable', true);
  END IF;
  IF lower(p_facts->>'currency') IS DISTINCT FROM 'gbp' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'currency', 'retryable', false);
  END IF;
  IF p_facts->>'checkoutSubscriptionId' IS DISTINCT FROM p_facts->>'stripeSubscriptionId' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;

  BEGIN
    v_period_start := (p_facts->>'periodStart')::timestamptz;
    v_period_end := (p_facts->>'periodEnd')::timestamptz;
    IF (p_facts->>'subscriptionPeriodStart')::timestamptz IS DISTINCT FROM v_period_start
      OR (p_facts->>'subscriptionPeriodEnd')::timestamptz IS DISTINCT FROM v_period_end
    THEN
      RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
    END IF;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
  END;
  IF v_period_end <= v_period_start THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
  END IF;

  amount_paid := (p_facts->>'amountPaidMinor')::integer;
  amount_due := (p_facts->>'amountDueMinor')::integer;
  quantity := (p_facts->>'quantity')::integer;
  line_count := (p_facts->>'lineCount')::integer;
  discount_minor := (p_facts->>'discountMinor')::integer;
  tax_minor := (p_facts->>'taxMinor')::integer;
  session_id := p_facts->>'checkoutSessionId';
  stripe_customer := p_facts->>'stripeCustomerId';
  stripe_subscription := p_facts->>'stripeSubscriptionId';
  stripe_price := p_facts->>'stripePriceId';

  IF (p_facts->>'livemode')::boolean OR (p_facts->>'subscriptionLivemode')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'livemode', 'retryable', false);
  END IF;
  IF p_facts->>'invoiceStatus' IS DISTINCT FROM 'paid' THEN
    IF p_facts->>'invoiceStatus' = 'open' THEN
      RETURN jsonb_build_object('status', 'pending', 'reason', 'invoice_unpaid', 'retryable', true);
    END IF;
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'payment_failed', 'retryable', false);
  END IF;
  IF (p_facts->>'refunded')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'refund', 'retryable', false);
  END IF;
  IF (p_facts->>'disputed')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'dispute', 'retryable', false);
  END IF;
  IF (p_facts->>'trial')::boolean OR p_facts->>'subscriptionStatus' = 'trialing' THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'trial', 'retryable', false);
  END IF;
  IF (p_facts->>'automaticTax')::boolean OR tax_minor <> 0 OR discount_minor <> 0 THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'tax', 'retryable', false);
  END IF;
  IF quantity <> 1 OR (p_facts->>'subscriptionQuantity')::integer <> 1 OR line_count <> 1 THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'quantity', 'retryable', false);
  END IF;
  IF p_facts->>'billingReason' IS DISTINCT FROM 'subscription_create' THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'billing_reason', 'retryable', false);
  END IF;
  IF (p_facts->>'cancelAtPeriodEnd')::boolean OR (p_facts->>'schedulePresent')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription_change', 'retryable', false);
  END IF;
  IF p_facts->>'subscriptionStatus' IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;
  IF p_facts->>'subscriptionCustomerId' IS DISTINCT FROM stripe_customer THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF p_facts->>'subscriptionPriceId' IS DISTINCT FROM stripe_price
    OR amount_paid <> amount_due OR amount_paid <= 0
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'amount', 'retryable', false);
  END IF;

  SELECT count(*)::int INTO matches
  FROM public.commercial_checkout_preparations preparation
  WHERE preparation.stripe_price_id = stripe_price
    AND preparation.livemode = false
    AND preparation.checkout_session_id = session_id;
  IF matches = 0 THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'preparation', 'retryable', false);
  END IF;
  IF matches > 1 THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'ambiguous_price', 'retryable', false);
  END IF;
  SELECT preparation.* INTO prep
  FROM public.commercial_checkout_preparations preparation
  WHERE preparation.stripe_price_id = stripe_price
    AND preparation.livemode = false
    AND preparation.checkout_session_id = session_id
  FOR UPDATE OF preparation;
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_customer_maps map
    WHERE map.customer_id = prep.customer_id
      AND map.stripe_customer_id = stripe_customer
      AND map.livemode = false
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  PERFORM 1
  FROM public.commercial_subscriptions locked
  WHERE locked.business_id = prep.business_id
  ORDER BY locked.id
  FOR UPDATE;
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = prep.subscription_id;
  SELECT * INTO acc FROM public.commercial_offer_acceptances WHERE id = prep.acceptance_id FOR UPDATE;
  SELECT * INTO plan FROM public.plan_versions WHERE id = sub.plan_version_id;

  IF sub.id IS NULL OR acc.id IS NULL OR plan.id IS NULL
    OR acc.subscription_id IS DISTINCT FROM sub.id
    OR acc.customer_id IS DISTINCT FROM prep.customer_id
    OR acc.business_id IS DISTINCT FROM prep.business_id
    OR sub.customer_id IS DISTINCT FROM prep.customer_id
    OR sub.business_id IS DISTINCT FROM prep.business_id
    OR acc.plan_version_id IS DISTINCT FROM sub.plan_version_id
    OR acc.amount_minor IS DISTINCT FROM prep.amount_minor
    OR acc.amount_minor IS DISTINCT FROM sub.amount_minor
    OR acc.currency IS DISTINCT FROM 'GBP'
    OR sub.currency IS DISTINCT FROM 'GBP'
    OR acc.cadence IS DISTINCT FROM 'MONTH'
    OR sub.cadence_snapshot IS DISTINCT FROM 'MONTH'
    OR acc.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
    OR sub.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
    OR sub.grant_kind IS DISTINCT FROM 'BILLABLE'
    OR plan.status IS DISTINCT FROM 'APPROVED'
    OR plan.currency IS DISTINCT FROM 'GBP'
    OR plan.billing_cadence IS DISTINCT FROM 'MONTH'
    OR plan.amount_minor IS DISTINCT FROM acc.amount_minor
    OR plan.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
    OR plan.product_code IS DISTINCT FROM acc.product_code
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'snapshot', 'retryable', false);
  END IF;
  IF acc.product_code = 'TELLOYA' AND acc.guard_quantity <> 0 THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'guard_quantity', 'retryable', false);
  END IF;
  IF acc.product_code = 'COMPLETE' AND acc.guard_quantity < 0 THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'guard_quantity', 'retryable', false);
  END IF;
  IF amount_paid IS DISTINCT FROM acc.amount_minor THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'amount', 'retryable', false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships membership
    WHERE membership.customer_id = sub.customer_id
      AND membership.business_id = sub.business_id
      AND membership.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'membership', 'retryable', false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_customer_maps map
    WHERE map.customer_id = sub.customer_id
      AND map.stripe_customer_id = stripe_customer
      AND map.livemode = false
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF sub.stripe_customer_id IS NOT NULL AND sub.stripe_customer_id IS DISTINCT FROM stripe_customer THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF sub.stripe_subscription_id IS NOT NULL AND sub.stripe_subscription_id IS DISTINCT FROM stripe_subscription THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_subscriptions other_sub
    WHERE other_sub.stripe_subscription_id = stripe_subscription AND other_sub.id <> sub.id
  ) OR EXISTS (
    SELECT 1 FROM public.guard_subscriptions guard_row
    WHERE guard_row.stripe_subscription_id = stripe_subscription
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;
  IF sub.state = 'ACTIVE' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'prior_settlement', 'retryable', false);
  END IF;
  IF sub.state IN ('CANCELED', 'ENDED', 'PAST_DUE', 'PAUSED', 'CANCEL_AT_PERIOD_END') OR sub.cancel_at_period_end THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'cancellation', 'retryable', false);
  END IF;
  IF sub.state IS DISTINCT FROM 'PAYMENT_PENDING' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription_state', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_subscriptions occupying
    WHERE occupying.business_id = sub.business_id
      AND occupying.id <> sub.id
      AND occupying.state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'occupying', 'retryable', false);
  END IF;
  IF sub.succeeds_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'replacement', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_payment_evidence evidence
    WHERE evidence.subscription_id = sub.id
      AND evidence.period_start < v_period_end
      AND v_period_start < evidence.period_end
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
  END IF;

  PERFORM set_config('admin_private.commercial_settlement_lease', p_lease::text, true);
  PERFORM set_config('admin_private.commercial_settlement_event', event_id, true);
  PERFORM set_config('admin_private.commercial_settlement_invoice', invoice_id, true);

  INSERT INTO public.commercial_payment_evidence(
    subscription_id, period_start, period_end, amount_minor, currency, provider_event_id
  ) VALUES (
    sub.id, v_period_start, v_period_end, acc.amount_minor, 'GBP', event_id
  );
  UPDATE public.commercial_subscriptions
    SET state = 'ACTIVE',
        stripe_customer_id = stripe_customer,
        stripe_subscription_id = stripe_subscription,
        current_period_start = v_period_start,
        current_period_end = v_period_end
    WHERE id = sub.id AND state = 'PAYMENT_PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial settlement did not activate the locked subscription';
  END IF;
  INSERT INTO public.commercial_subscription_events(subscription_id, request_id, from_state, to_state, reason)
  VALUES (sub.id, p_job, 'PAYMENT_PENDING', 'ACTIVE', 'verified_initial_invoice');
  UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = event_id AND processed IS FALSE;
  UPDATE admin_private.jobs
    SET status = 'SUCCEEDED', completed_at = pg_catalog.now(), lease_expires_at = NULL,
        lease_owner = NULL, lease_token = NULL, last_error = NULL,
        updated_at = pg_catalog.now(), record_version = job.record_version + 1
    WHERE id = job.id AND status = 'RUNNING' AND lease_token = p_lease;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial settlement lost the job lease';
  END IF;
  PERFORM admin_private.finish_job_attempt_v1(job.id, p_lease, 'SUCCEEDED', NULL);
  RETURN jsonb_build_object('status', 'settled', 'reason', 'paid_invoice', 'retryable', false, 'state', 'ACTIVE');
END;
$$;

REVOKE ALL ON FUNCTION public.commercial_payment_invoice_claim_v1(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commercial_payment_settle_initial_invoice_v1(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commercial_payment_invoice_claim_v1(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.commercial_payment_settle_initial_invoice_v1(uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.customer_portal_products_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base jsonb;
  sess jsonb;
  customer uuid;
  paid record;
  businesses jsonb;
  rebuilt jsonb;
  entry jsonb;
  found boolean;
BEGIN
  base := admin_private.customer_portal_products_v1(p_token_hash);
  IF base IS NULL OR coalesce(base #>> '{reads,telloya}', '') IS DISTINCT FROM 'ok' THEN
    RETURN base;
  END IF;
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN
    RETURN base;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  businesses := coalesce(base -> 'businesses', '[]'::jsonb);
  FOR paid IN
    SELECT business.display_name AS business_name
    FROM public.commercial_subscriptions subscription
    JOIN public.businesses business ON business.id = subscription.business_id
    JOIN public.business_memberships membership
      ON membership.business_id = subscription.business_id
     AND membership.customer_id = customer
     AND membership.status = 'verified'
    JOIN public.commercial_subscription_items item
      ON item.subscription_id = subscription.id
     AND item.component_code = 'TELLOYA'
    WHERE subscription.state = 'ACTIVE'
      AND subscription.grant_kind = 'BILLABLE'
      AND EXISTS (
        SELECT 1 FROM public.commercial_payment_evidence evidence
        WHERE evidence.subscription_id = subscription.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.product_entitlements entitlement
        WHERE entitlement.commercial_subscription_id = subscription.id
          AND entitlement.state IN ('PENDING', 'ELIGIBLE')
      )
  LOOP
    found := false;
    rebuilt := '[]'::jsonb;
    FOR entry IN SELECT value FROM jsonb_array_elements(businesses) AS listed(value)
    LOOP
      IF entry ->> 'businessName' = paid.business_name THEN
        found := true;
        IF coalesce(entry #>> '{telloya,status}', '') IN ('not_subscribed', 'pending')
          AND jsonb_array_length(coalesce(entry #> '{telloya,locations}', '[]'::jsonb)) = 0
        THEN
          entry := jsonb_set(entry, '{telloya}', jsonb_build_object(
            'status', 'pending',
            'locations', jsonb_build_array(jsonb_build_object(
              'locationName', paid.business_name,
              'status', 'pending',
              'nextStep', 'Payment is recorded. Telloya setup has not started.'
            ))
          ), true);
        END IF;
      END IF;
      rebuilt := rebuilt || jsonb_build_array(entry);
    END LOOP;
    IF NOT found THEN
      rebuilt := rebuilt || jsonb_build_array(jsonb_build_object(
        'businessName', paid.business_name,
        'telloya', jsonb_build_object(
          'status', 'pending',
          'locations', jsonb_build_array(jsonb_build_object(
            'locationName', paid.business_name,
            'status', 'pending',
            'nextStep', 'Payment is recorded. Telloya setup has not started.'
          ))
        ),
        'guard', jsonb_build_object('status', 'not_subscribed', 'locations', '[]'::jsonb)
      ));
    END IF;
    businesses := rebuilt;
  END LOOP;
  RETURN jsonb_set(base, '{businesses}', businesses, true);
END;
$$;

COMMENT ON FUNCTION public.customer_portal_products_v1(text) IS
  'Read-only Customer Portal products projection. Accepts only a portal session token hash. A paid commercial subscription without a provision stays pending and is not described as a live service.';

REVOKE ALL ON FUNCTION public.customer_portal_products_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_products_v1(text) TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.commercial_payment_evidence FROM PUBLIC, anon, authenticated, service_role;
