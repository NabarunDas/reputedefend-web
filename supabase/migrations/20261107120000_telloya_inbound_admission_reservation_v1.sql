-- Source only. Do not apply 20261107120000 to hosted DEV.
-- Do not apply 20261107120000 to Production.
-- Do not replay 20261107110000. Do not apply 20261107110000 to Production.
-- Opaque inbound admission. The accepted commercial offer supplies the
-- allowance and overage terms. The allocated number supplies the agent.
-- This file does not enable Retell, forwarding, a provider webhook, or a
-- Stripe charge. It does not open service_provisions.state = LIVE. It does
-- not store a transcript, recording, token, caller number, or raw provider body.
-- Lock order, always transaction-scoped and always in this sequence:
-- 1. Body lock: hashtextextended('commercial-usage-body:' || env || ':' || sha)
-- 2. Call lock: hashtext('commercial-usage:' || env || ':' || provider_call_ref)
-- 3. Period lock: hashtextextended('commercial-usage-period:' || subscription || ':' || period_start)
-- A later lock is never taken before an earlier one. Subscription state and
-- period changes take the same period lock, old period before a later period.
-- Expiry uses clock_timestamp(). An expired unbound hold is not an approval.
-- A bound call is not released because the pre-connect timeout has passed.
-- A provider call id is optional and is not treated as guaranteed.
-- service_role has no USAGE on admin_private. The callable paths are the
-- public SECURITY DEFINER functions below.

BEGIN;

CREATE TABLE admin_private.commercial_usage_admissions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  admission_ref text NOT NULL UNIQUE CHECK (admission_ref ~ '^adm_[0-9a-f]{32}$'),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  call_scope text NOT NULL CHECK (call_scope IN ('customer_phone', 'admin_web_qa')),
  provider_call_ref text CHECK (provider_call_ref IS NULL OR provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  to_number text CHECK (to_number IS NULL OR to_number ~ '^\+[1-9][0-9]{7,14}$'),
  agent_ref text CHECK (agent_ref IS NULL OR agent_ref ~ '^[A-Za-z0-9_-]{8,128}$'),
  subscription_id uuid,
  business_id uuid,
  location_id uuid,
  customer_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  decision text NOT NULL CHECK (decision IN ('admitted', 'excluded')),
  state text NOT NULL CHECK (state IN ('reserved', 'bound', 'released', 'expired', 'disconnected')),
  reservation_id uuid REFERENCES admin_private.commercial_usage_reservations (id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason ~ '^[a-z0-9_]{1,64}$'),
  included_minutes_snapshot integer,
  minutes_rollover_snapshot boolean,
  overage_opt_in_snapshot boolean,
  overage_rate_minor_snapshot integer,
  overage_cap_minor_snapshot integer,
  overage_consent_at timestamptz,
  expires_at timestamptz NOT NULL,
  bound_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_admissions_body UNIQUE (environment, body_sha256),
  CONSTRAINT commercial_usage_admissions_shape CHECK (
    (
      decision = 'excluded'
      AND call_scope = 'admin_web_qa'
      AND state = 'released'
      AND subscription_id IS NULL
      AND reservation_id IS NULL
      AND provider_call_ref IS NULL
      AND to_number IS NULL
      AND agent_ref IS NULL
    )
    OR (
      decision = 'admitted'
      AND call_scope = 'customer_phone'
      AND subscription_id IS NOT NULL
      AND business_id IS NOT NULL
      AND location_id IS NOT NULL
      AND customer_id IS NOT NULL
      AND to_number IS NOT NULL
      AND agent_ref IS NOT NULL
      AND period_start IS NOT NULL
      AND period_end > period_start
      AND included_minutes_snapshot IS NOT NULL
      AND minutes_rollover_snapshot = false
      AND (
        (
          overage_opt_in_snapshot = false
          AND overage_cap_minor_snapshot IS NULL
          AND overage_consent_at IS NULL
        )
        OR (
          overage_opt_in_snapshot = true
          AND overage_rate_minor_snapshot IS NOT NULL
          AND overage_cap_minor_snapshot IS NOT NULL
          AND overage_consent_at IS NOT NULL
        )
      )
    )
  )
);

CREATE UNIQUE INDEX commercial_usage_admissions_provider_call_idx
  ON admin_private.commercial_usage_admissions (environment, provider_call_ref)
  WHERE provider_call_ref IS NOT NULL;

CREATE TABLE admin_private.commercial_usage_admission_conflicts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES admin_private.commercial_usage_admissions (id) ON DELETE RESTRICT,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_admission_conflicts_once UNIQUE (admission_id, body_sha256)
);

CREATE FUNCTION admin_private.commercial_usage_admission_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial_usage_evidence_immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.admission_ref IS DISTINCT FROM OLD.admission_ref
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.call_scope IS DISTINCT FROM OLD.call_scope
    OR NEW.body_sha256 IS DISTINCT FROM OLD.body_sha256
    OR NEW.to_number IS DISTINCT FROM OLD.to_number
    OR NEW.agent_ref IS DISTINCT FROM OLD.agent_ref
    OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.decision IS DISTINCT FROM OLD.decision
    OR NEW.included_minutes_snapshot IS DISTINCT FROM OLD.included_minutes_snapshot
    OR NEW.minutes_rollover_snapshot IS DISTINCT FROM OLD.minutes_rollover_snapshot
    OR NEW.overage_opt_in_snapshot IS DISTINCT FROM OLD.overage_opt_in_snapshot
    OR NEW.overage_rate_minor_snapshot IS DISTINCT FROM OLD.overage_rate_minor_snapshot
    OR NEW.overage_cap_minor_snapshot IS DISTINCT FROM OLD.overage_cap_minor_snapshot
    OR NEW.overage_consent_at IS DISTINCT FROM OLD.overage_consent_at
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.provider_call_ref IS NOT NULL AND NEW.provider_call_ref IS DISTINCT FROM OLD.provider_call_ref)
    OR (OLD.reservation_id IS NOT NULL AND NEW.reservation_id IS DISTINCT FROM OLD.reservation_id)
    OR (OLD.bound_at IS NOT NULL AND NEW.bound_at IS DISTINCT FROM OLD.bound_at)
    OR (OLD.released_at IS NOT NULL AND NEW.released_at IS DISTINCT FROM OLD.released_at)
  THEN
    RAISE EXCEPTION 'commercial_usage_evidence_immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'reserved' AND NEW.state IN ('bound', 'released', 'expired', 'disconnected') THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'bound' AND NEW.state IN ('released', 'disconnected') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'commercial_usage_evidence_immutable' USING ERRCODE = '55000';
END;
$fn$;

CREATE TRIGGER commercial_usage_admissions_guard
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_admissions
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_admission_guard_v1();

CREATE TRIGGER commercial_usage_admission_conflicts_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_admission_conflicts
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE FUNCTION admin_private.commercial_usage_admission_view_v1(
  p_row admin_private.commercial_usage_admissions
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $fn$
BEGIN
  IF p_row.decision = 'excluded' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'replay',
      'decision', 'excluded',
      'reason', 'internal_admin_web_call',
      'billable', false,
      'admissionRef', p_row.admission_ref
    );
  END IF;
  IF p_row.state = 'bound'
    OR (
      p_row.state = 'reserved'
      AND p_row.bound_at IS NULL
      AND p_row.expires_at > pg_catalog.clock_timestamp()
    )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'replay',
      'decision', 'admitted',
      'reason', p_row.reason,
      'billable', true,
      'admissionRef', p_row.admission_ref,
      'agentRef', p_row.agent_ref,
      'reserveSeconds', 60,
      'providerCallRef', p_row.provider_call_ref
    );
  END IF;
  IF p_row.state = 'expired'
    OR (
      p_row.state = 'reserved'
      AND p_row.bound_at IS NULL
      AND p_row.expires_at <= pg_catalog.clock_timestamp()
    )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'replay',
      'decision', p_row.decision,
      'reason', 'admission_expired',
      'billable', false,
      'admissionRef', p_row.admission_ref,
      'state', 'expired'
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'status', 'replay',
    'decision', p_row.decision,
    'reason', 'admission_closed',
    'billable', false,
    'admissionRef', p_row.admission_ref,
    'state', p_row.state
  );
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_lock_period_v1(
  p_subscription uuid,
  p_period_start timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF p_subscription IS NULL OR p_period_start IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'commercial-usage-period:' || p_subscription::text || ':' || p_period_start::text,
    0
  ));
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_release_expired_admissions_v1(
  p_subscription uuid,
  p_now timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_row admin_private.commercial_usage_admissions%ROWTYPE;
  v_period timestamptz;
  v_clock timestamptz := pg_catalog.clock_timestamp();
BEGIN
  -- p_now is not an expiry authority. The database clock is.
  -- The caller already holds the billing-period lock. This sweep does not take
  -- another advisory lock, so it cannot invert the call-then-period order.
  SELECT current_period_start INTO v_period
  FROM public.commercial_subscriptions
  WHERE id = p_subscription;
  FOR v_row IN
    SELECT *
    FROM admin_private.commercial_usage_admissions
    WHERE subscription_id = p_subscription
      AND period_start IS NOT DISTINCT FROM v_period
      AND state = 'reserved'
      AND bound_at IS NULL
      AND expires_at <= v_clock
  LOOP
    SELECT * INTO v_row
    FROM admin_private.commercial_usage_admissions
    WHERE id = v_row.id
    FOR UPDATE;
    IF v_row.state IS DISTINCT FROM 'reserved'
      OR v_row.bound_at IS NOT NULL
      OR v_row.expires_at > pg_catalog.clock_timestamp()
    THEN
      CONTINUE;
    END IF;
    IF v_row.provider_call_ref IS NOT NULL AND EXISTS (
      SELECT 1 FROM admin_private.commercial_usage_events AS event
      WHERE event.environment = v_row.environment
        AND event.provider_call_ref = v_row.provider_call_ref
    ) THEN
      UPDATE admin_private.commercial_usage_admissions
      SET state = 'bound', bound_at = pg_catalog.clock_timestamp()
      WHERE id = v_row.id AND state = 'reserved';
      CONTINUE;
    END IF;
    IF v_row.reservation_id IS NOT NULL THEN
      UPDATE admin_private.commercial_usage_reservations
      SET state = 'released'
      WHERE id = v_row.reservation_id AND state = 'open';
    END IF;
    UPDATE admin_private.commercial_usage_admissions
    SET state = 'expired', released_at = pg_catalog.clock_timestamp()
    WHERE id = v_row.id AND state = 'reserved';
  END LOOP;
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_finish_replay_v1(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_row admin_private.commercial_usage_admissions%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM admin_private.commercial_usage_admissions
  WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'unknown_admission', 'billable', false);
  END IF;
  IF v_row.decision = 'admitted' AND v_row.subscription_id IS NOT NULL AND v_row.period_start IS NOT NULL THEN
    IF v_row.provider_call_ref IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('commercial-usage:' || v_row.environment || ':' || v_row.provider_call_ref)::bigint);
    END IF;
    PERFORM admin_private.commercial_usage_lock_period_v1(v_row.subscription_id, v_row.period_start);
    SELECT * INTO v_row
    FROM admin_private.commercial_usage_admissions
    WHERE id = p_id
    FOR UPDATE;
    IF v_row.state = 'reserved'
      AND v_row.bound_at IS NULL
      AND v_row.expires_at <= pg_catalog.clock_timestamp()
    THEN
      IF v_row.provider_call_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM admin_private.commercial_usage_events AS event
        WHERE event.environment = v_row.environment
          AND event.provider_call_ref = v_row.provider_call_ref
      ) THEN
        UPDATE admin_private.commercial_usage_admissions
        SET state = 'bound', bound_at = pg_catalog.clock_timestamp()
        WHERE id = v_row.id AND state = 'reserved';
      ELSE
        IF v_row.reservation_id IS NOT NULL THEN
          UPDATE admin_private.commercial_usage_reservations
          SET state = 'released'
          WHERE id = v_row.reservation_id AND state = 'open';
        END IF;
        UPDATE admin_private.commercial_usage_admissions
        SET state = 'expired', released_at = pg_catalog.clock_timestamp()
        WHERE id = v_row.id AND state = 'reserved';
      END IF;
      SELECT * INTO v_row FROM admin_private.commercial_usage_admissions WHERE id = p_id;
    END IF;
  END IF;
  RETURN admin_private.commercial_usage_admission_view_v1(v_row);
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_reserve_inbound_v1(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_environment text;
  v_call_ref text;
  v_scope text;
  v_number text;
  v_now timestamptz;
  v_hash text;
  v_quoted text;
  v_asserted_subscription uuid;
  v_asserted_business uuid;
  v_asserted_location uuid;
  v_owner admin_private.commercial_provider_number_owners%ROWTYPE;
  v_subscription public.commercial_subscriptions%ROWTYPE;
  v_existing admin_private.commercial_usage_admissions%ROWTYPE;
  v_provision_state text;
  v_terms jsonb;
  v_included integer;
  v_overage boolean;
  v_rate integer;
  v_cap integer;
  v_plan uuid;
  v_consent timestamptz;
  v_confirmed integer;
  v_open integer;
  v_holds integer;
  v_committed integer;
  v_included_seconds integer;
  v_overage_seconds integer;
  v_minutes integer;
  v_raw integer;
  v_reason text;
  v_locked_period timestamptz;
  v_admission_ref text;
  v_admission_id uuid;
  v_reservation_id uuid;
BEGIN
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  BEGIN
    v_environment := p_event->>'environment';
    v_call_ref := NULLIF(p_event->>'providerCallRef', '');
    v_scope := p_event->>'callScope';
    v_number := NULLIF(p_event->>'toNumber', '');
    v_hash := p_event->>'bodySha256';
    v_quoted := NULLIF(p_event->>'quotedAdmissionRef', '');
    IF NULLIF(p_event->>'now', '') IS NOT NULL THEN
      v_now := (p_event->>'now')::timestamptz;
    END IF;
    IF NULLIF(p_event->>'assertedSubscriptionId', '') IS NOT NULL THEN
      v_asserted_subscription := (p_event->>'assertedSubscriptionId')::uuid;
    END IF;
    IF NULLIF(p_event->>'assertedBusinessId', '') IS NOT NULL THEN
      v_asserted_business := (p_event->>'assertedBusinessId')::uuid;
    END IF;
    IF NULLIF(p_event->>'assertedLocationId', '') IS NOT NULL THEN
      v_asserted_location := (p_event->>'assertedLocationId')::uuid;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END;

  IF v_environment NOT IN ('dev', 'production')
    OR v_scope NOT IN ('customer_phone', 'admin_web_qa')
    OR v_hash IS NULL
    OR v_hash !~ '^[0-9a-f]{64}$'
    OR v_now IS NULL
    OR (v_call_ref IS NOT NULL AND v_call_ref !~ '^[A-Za-z0-9_-]{1,128}$')
    OR (v_quoted IS NOT NULL AND v_quoted !~ '^adm_[0-9a-f]{32}$')
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'commercial-usage-body:' || v_environment || ':' || v_hash, 0
  ));

  IF v_quoted IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM admin_private.commercial_usage_admissions
    WHERE admission_ref = v_quoted
    FOR UPDATE;
    IF NOT FOUND OR v_existing.environment IS DISTINCT FROM v_environment THEN
      RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'unknown_admission', 'billable', false);
    END IF;
    IF v_existing.body_sha256 = v_hash THEN
      RETURN admin_private.commercial_usage_finish_replay_v1(v_existing.id);
    END IF;
    INSERT INTO admin_private.commercial_usage_admission_conflicts(admission_id, body_sha256)
    VALUES (v_existing.id, v_hash)
    ON CONFLICT (admission_id, body_sha256) DO NOTHING;
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'billable', false, 'admissionRef', v_existing.admission_ref);
  END IF;

  IF v_call_ref IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('commercial-usage:' || v_environment || ':' || v_call_ref)::bigint);
    SELECT * INTO v_existing
    FROM admin_private.commercial_usage_admissions
    WHERE environment = v_environment AND provider_call_ref = v_call_ref
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing.body_sha256 = v_hash THEN
        RETURN admin_private.commercial_usage_finish_replay_v1(v_existing.id);
      END IF;
      INSERT INTO admin_private.commercial_usage_admission_conflicts(admission_id, body_sha256)
      VALUES (v_existing.id, v_hash)
      ON CONFLICT (admission_id, body_sha256) DO NOTHING;
      RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'billable', false, 'admissionRef', v_existing.admission_ref);
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM admin_private.commercial_usage_admissions
  WHERE environment = v_environment AND body_sha256 = v_hash
  FOR UPDATE;
  IF FOUND THEN
    RETURN admin_private.commercial_usage_finish_replay_v1(v_existing.id);
  END IF;

  IF v_scope = 'admin_web_qa' THEN
    v_admission_ref := 'adm_' || replace(extensions.gen_random_uuid()::text, '-', '');
    INSERT INTO admin_private.commercial_usage_admissions(
      admission_ref, environment, call_scope, body_sha256, decision, state, reason, expires_at, released_at
    ) VALUES (
      v_admission_ref, v_environment, 'admin_web_qa', v_hash, 'excluded', 'released',
      'internal_admin_web_call', v_now, v_now
    );
    RETURN pg_catalog.jsonb_build_object(
      'status', 'excluded',
      'reason', 'internal_admin_web_call',
      'billable', false,
      'admissionRef', v_admission_ref
    );
  END IF;

  IF v_number IS NULL OR v_number !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  SELECT * INTO v_owner
  FROM admin_private.commercial_provider_number_owners
  WHERE provider = 'telloya_voice'
    AND e164 = v_number
    AND environment = v_environment;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'unknown_number', 'billable', false);
  END IF;

  IF (v_asserted_subscription IS NOT NULL AND v_asserted_subscription IS DISTINCT FROM v_owner.subscription_id)
    OR (v_asserted_business IS NOT NULL AND v_asserted_business IS DISTINCT FROM v_owner.business_id)
    OR (v_asserted_location IS NOT NULL AND v_asserted_location IS DISTINCT FROM v_owner.location_id)
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'cross_tenant', 'billable', false);
  END IF;

  SELECT * INTO v_subscription
  FROM public.commercial_subscriptions
  WHERE id = v_owner.subscription_id
    AND business_id = v_owner.business_id
    AND customer_id = v_owner.customer_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_absent', 'billable', false);
  END IF;
  IF v_subscription.state IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'PAYMENT_PENDING', 'PAST_DUE') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_unpaid', 'billable', false);
  END IF;
  IF v_subscription.state NOT IN ('ACTIVE', 'CANCEL_AT_PERIOD_END') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_inactive', 'billable', false);
  END IF;

  SELECT provision.state INTO v_provision_state
  FROM public.service_provisions AS provision
  JOIN public.product_entitlements AS entitlement
    ON entitlement.id = provision.entitlement_id
  WHERE provision.business_id = v_owner.business_id
    AND provision.location_id = v_owner.location_id
    AND entitlement.commercial_subscription_id = v_owner.subscription_id
    AND entitlement.component_code = 'TELLOYA'
    AND entitlement.business_id = v_owner.business_id
    AND entitlement.location_id = v_owner.location_id
    AND entitlement.state = 'ELIGIBLE'
  ORDER BY CASE WHEN provision.state = 'LIVE' THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_provision_state IS DISTINCT FROM 'LIVE' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'provision_inactive', 'billable', false);
  END IF;

  IF v_subscription.current_period_start IS NULL
    OR v_subscription.current_period_end IS NULL
    OR v_subscription.current_period_end <= v_subscription.current_period_start
    OR v_now < v_subscription.current_period_start
    OR v_now >= v_subscription.current_period_end
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'invalid_billing_period', 'billable', false);
  END IF;

  v_locked_period := v_subscription.current_period_start;
  PERFORM admin_private.commercial_usage_lock_period_v1(v_subscription.id, v_locked_period);
  SELECT * INTO v_subscription
  FROM public.commercial_subscriptions
  WHERE id = v_owner.subscription_id
    AND business_id = v_owner.business_id
    AND customer_id = v_owner.customer_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_absent', 'billable', false);
  END IF;
  IF v_subscription.current_period_start IS NOT NULL
    AND v_subscription.current_period_start IS DISTINCT FROM v_locked_period
    AND v_locked_period IS NOT NULL
    AND v_subscription.current_period_start::text >= v_locked_period::text
  THEN
    PERFORM admin_private.commercial_usage_lock_period_v1(v_subscription.id, v_subscription.current_period_start);
    SELECT * INTO v_subscription
    FROM public.commercial_subscriptions
    WHERE id = v_owner.subscription_id
      AND business_id = v_owner.business_id
      AND customer_id = v_owner.customer_id;
  END IF;
  IF NOT FOUND OR v_subscription.state IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'PAYMENT_PENDING', 'PAST_DUE') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_unpaid', 'billable', false);
  END IF;
  IF v_subscription.state NOT IN ('ACTIVE', 'CANCEL_AT_PERIOD_END') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_inactive', 'billable', false);
  END IF;
  SELECT provision.state INTO v_provision_state
  FROM public.service_provisions AS provision
  JOIN public.product_entitlements AS entitlement
    ON entitlement.id = provision.entitlement_id
  WHERE provision.business_id = v_owner.business_id
    AND provision.location_id = v_owner.location_id
    AND entitlement.commercial_subscription_id = v_owner.subscription_id
    AND entitlement.component_code = 'TELLOYA'
    AND entitlement.business_id = v_owner.business_id
    AND entitlement.location_id = v_owner.location_id
    AND entitlement.state = 'ELIGIBLE'
  ORDER BY CASE WHEN provision.state = 'LIVE' THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_provision_state IS DISTINCT FROM 'LIVE' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'provision_inactive', 'billable', false);
  END IF;
  IF v_subscription.current_period_start IS NULL
    OR v_subscription.current_period_end IS NULL
    OR v_subscription.current_period_end <= v_subscription.current_period_start
    OR v_now < v_subscription.current_period_start
    OR v_now >= v_subscription.current_period_end
    OR v_subscription.current_period_start IS DISTINCT FROM v_locked_period
      AND v_subscription.current_period_start::text < v_locked_period::text
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'invalid_billing_period', 'billable', false);
  END IF;
  PERFORM admin_private.commercial_usage_release_expired_admissions_v1(v_subscription.id, pg_catalog.clock_timestamp());

  v_terms := admin_private.commercial_usage_load_acceptance_v1(v_subscription.id, v_owner.business_id, p_event);
  IF v_terms->>'status' IS DISTINCT FROM 'ok' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'denied',
      'reason', coalesce(v_terms->>'reason', 'acceptance_absent'),
      'billable', false
    );
  END IF;
  v_included := (v_terms->>'includedMinutes')::integer;
  v_overage := (v_terms->>'overageOptIn')::boolean;
  v_rate := (v_terms->>'overageRateMinor')::integer;
  v_cap := (v_terms->>'overageCapMinor')::integer;
  v_plan := (v_terms->>'planVersionId')::uuid;
  IF NULLIF(v_terms->>'overageConsentAt', '') IS NOT NULL THEN
    v_consent := (v_terms->>'overageConsentAt')::timestamptz;
  END IF;
  IF v_included IS NULL OR v_plan IS NULL OR coalesce((v_terms->>'minutesRollover')::boolean, false) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'acceptance_inconsistent', 'billable', false);
  END IF;

  v_confirmed := admin_private.commercial_usage_customer_seconds_v1(
    v_subscription.id, v_subscription.current_period_start, v_subscription.current_period_end
  );
  v_open := admin_private.commercial_usage_open_reservation_seconds_v1(
    v_subscription.id, v_subscription.current_period_start, v_subscription.current_period_end
  );
  SELECT coalesce(pg_catalog.count(*)::integer, 0) * 60 INTO v_holds
  FROM admin_private.commercial_usage_admissions
  WHERE subscription_id = v_subscription.id
    AND period_start = v_subscription.current_period_start
    AND period_end = v_subscription.current_period_end
    AND state = 'reserved'
    AND reservation_id IS NULL
    AND expires_at > pg_catalog.clock_timestamp();
  v_committed := v_confirmed + v_open + v_holds;
  v_included_seconds := v_included * 60;
  IF v_committed + 60 <= v_included_seconds THEN
    v_reason := 'allow_included';
  ELSIF NOT v_overage THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'allowance_exhausted', 'billable', false);
  ELSIF v_rate IS DISTINCT FROM 25 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'overage_rate_not_accepted', 'billable', false);
  ELSIF v_cap IS NULL OR v_cap < 1 OR v_consent IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'spending_cap_missing', 'billable', false);
  ELSE
    v_overage_seconds := v_committed + 60 - v_included_seconds;
    v_minutes := (v_overage_seconds + 59) / 60;
    v_raw := v_minutes * 25;
    IF v_raw > v_cap THEN
      RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'spending_cap_exhausted', 'billable', false);
    END IF;
    v_reason := 'allow_overage';
  END IF;

  v_admission_ref := 'adm_' || replace(extensions.gen_random_uuid()::text, '-', '');
  IF v_call_ref IS NOT NULL THEN
    INSERT INTO admin_private.commercial_usage_reservations(
      environment, provider_call_ref, subscription_id, location_id, business_id,
      period_start, period_end, reserved_seconds, state, plan_version_id,
      included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
      overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
    ) VALUES (
      v_environment, v_call_ref, v_subscription.id, v_owner.location_id, v_owner.business_id,
      v_subscription.current_period_start, v_subscription.current_period_end,
      60, 'open', v_plan, v_included, false, v_overage, v_rate, v_cap, v_consent
    )
    RETURNING id INTO v_reservation_id;
  END IF;

  INSERT INTO admin_private.commercial_usage_admissions(
    admission_ref, environment, call_scope, provider_call_ref, body_sha256, to_number, agent_ref,
    subscription_id, business_id, location_id, customer_id, period_start, period_end,
    decision, state, reservation_id, reason, included_minutes_snapshot, minutes_rollover_snapshot,
    overage_opt_in_snapshot, overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at,
    expires_at
  ) VALUES (
    v_admission_ref, v_environment, 'customer_phone', v_call_ref, v_hash, v_number, v_owner.agent_ref,
    v_subscription.id, v_owner.business_id, v_owner.location_id, v_owner.customer_id,
    v_subscription.current_period_start, v_subscription.current_period_end,
    'admitted', 'reserved', v_reservation_id, v_reason, v_included, false,
    v_overage, v_rate, v_cap, v_consent,
    pg_catalog.clock_timestamp() + interval '10 minutes'
  )
  RETURNING id INTO v_admission_id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'admitted',
    'reason', v_reason,
    'reserveSeconds', 60,
    'billable', true,
    'admissionRef', v_admission_ref,
    'agentRef', v_owner.agent_ref,
    'providerCallRef', v_call_ref
  );
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_bind_inbound_admission_v1(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_environment text;
  v_call_ref text;
  v_number text;
  v_quoted text;
  v_now timestamptz;
  v_owner admin_private.commercial_provider_number_owners%ROWTYPE;
  v_row admin_private.commercial_usage_admissions%ROWTYPE;
  v_reservation admin_private.commercial_usage_reservations%ROWTYPE;
  v_reservation_id uuid;
BEGIN
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;
  BEGIN
    v_environment := p_event->>'environment';
    v_call_ref := NULLIF(p_event->>'providerCallRef', '');
    v_number := NULLIF(p_event->>'toNumber', '');
    v_quoted := NULLIF(p_event->>'admissionRef', '');
    IF NULLIF(p_event->>'now', '') IS NOT NULL THEN
      v_now := (p_event->>'now')::timestamptz;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END;
  IF v_environment NOT IN ('dev', 'production')
    OR v_call_ref IS NULL
    OR v_call_ref !~ '^[A-Za-z0-9_-]{1,128}$'
    OR v_number IS NULL
    OR v_number !~ '^\+[1-9][0-9]{7,14}$'
    OR v_now IS NULL
    OR (v_quoted IS NOT NULL AND v_quoted !~ '^adm_[0-9a-f]{32}$')
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('commercial-usage:' || v_environment || ':' || v_call_ref)::bigint);

  IF v_quoted IS NOT NULL THEN
    SELECT * INTO v_row
    FROM admin_private.commercial_usage_admissions
    WHERE admission_ref = v_quoted AND environment = v_environment;
  ELSE
    SELECT * INTO v_row
    FROM admin_private.commercial_usage_admissions
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
  END IF;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unbound', 'reason', 'correlation_unverified', 'billable', false);
  END IF;
  PERFORM admin_private.commercial_usage_lock_period_v1(v_row.subscription_id, v_row.period_start);
  SELECT * INTO v_row
  FROM admin_private.commercial_usage_admissions
  WHERE id = v_row.id
  FOR UPDATE;
  IF v_row.decision IS DISTINCT FROM 'admitted' OR v_row.to_number IS DISTINCT FROM v_number THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'cross_tenant', 'billable', false, 'admissionRef', v_row.admission_ref);
  END IF;
  IF v_row.provider_call_ref IS NOT NULL AND v_row.provider_call_ref IS DISTINCT FROM v_call_ref THEN
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'billable', false, 'admissionRef', v_row.admission_ref);
  END IF;
  IF v_row.state = 'reserved'
    AND v_row.bound_at IS NULL
    AND v_row.expires_at <= pg_catalog.clock_timestamp()
  THEN
    IF v_row.provider_call_ref IS NOT NULL AND EXISTS (
      SELECT 1 FROM admin_private.commercial_usage_events AS event
      WHERE event.environment = v_row.environment AND event.provider_call_ref = v_row.provider_call_ref
    ) THEN
      UPDATE admin_private.commercial_usage_admissions
      SET state = 'bound', bound_at = pg_catalog.clock_timestamp()
      WHERE id = v_row.id AND state = 'reserved';
    ELSE
      IF v_row.reservation_id IS NOT NULL THEN
        UPDATE admin_private.commercial_usage_reservations
        SET state = 'released'
        WHERE id = v_row.reservation_id AND state = 'open';
      END IF;
      UPDATE admin_private.commercial_usage_admissions
      SET state = 'expired', released_at = pg_catalog.clock_timestamp()
      WHERE id = v_row.id AND state = 'reserved';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'denied', 'reason', 'admission_expired', 'billable', false, 'admissionRef', v_row.admission_ref
    );
  END IF;
  IF v_row.state NOT IN ('reserved', 'bound') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'admission_closed', 'billable', false, 'admissionRef', v_row.admission_ref);
  END IF;

  SELECT * INTO v_owner
  FROM admin_private.commercial_provider_number_owners
  WHERE provider = 'telloya_voice' AND e164 = v_number AND environment = v_environment;
  IF NOT FOUND
    OR v_owner.subscription_id IS DISTINCT FROM v_row.subscription_id
    OR v_owner.business_id IS DISTINCT FROM v_row.business_id
    OR v_owner.location_id IS DISTINCT FROM v_row.location_id
    OR v_owner.customer_id IS DISTINCT FROM v_row.customer_id
    OR v_owner.agent_ref IS DISTINCT FROM v_row.agent_ref
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'cross_tenant', 'billable', false, 'admissionRef', v_row.admission_ref);
  END IF;

  IF v_row.state = 'bound' AND v_row.provider_call_ref = v_call_ref THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'replay',
      'decision', 'bound',
      'billable', true,
      'admissionRef', v_row.admission_ref,
      'agentRef', v_row.agent_ref,
      'providerCallRef', v_call_ref
    );
  END IF;

  v_reservation_id := v_row.reservation_id;
  IF v_reservation_id IS NULL THEN
    BEGIN
      INSERT INTO admin_private.commercial_usage_reservations(
        environment, provider_call_ref, subscription_id, location_id, business_id,
        period_start, period_end, reserved_seconds, state, plan_version_id,
        included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
        overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
      )
      SELECT
        v_row.environment, v_call_ref, v_row.subscription_id, v_row.location_id, v_row.business_id,
        v_row.period_start, v_row.period_end, 60, 'open', acceptance.plan_version_id,
        v_row.included_minutes_snapshot, false, v_row.overage_opt_in_snapshot,
        v_row.overage_rate_minor_snapshot, v_row.overage_cap_minor_snapshot, v_row.overage_consent_at
      FROM public.commercial_offer_acceptances AS acceptance
      WHERE acceptance.subscription_id = v_row.subscription_id
      RETURNING id INTO v_reservation_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_reservation
        FROM admin_private.commercial_usage_reservations
        WHERE environment = v_environment AND provider_call_ref = v_call_ref;
        IF NOT FOUND
          OR v_reservation.subscription_id IS DISTINCT FROM v_row.subscription_id
          OR v_reservation.business_id IS DISTINCT FROM v_row.business_id
          OR v_reservation.location_id IS DISTINCT FROM v_row.location_id
          OR v_reservation.period_start IS DISTINCT FROM v_row.period_start
          OR v_reservation.period_end IS DISTINCT FROM v_row.period_end
        THEN
          RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'billable', false, 'admissionRef', v_row.admission_ref);
        END IF;
        v_reservation_id := v_reservation.id;
    END;
  END IF;
  IF v_reservation_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'acceptance_absent', 'billable', false, 'admissionRef', v_row.admission_ref);
  END IF;

  UPDATE admin_private.commercial_usage_admissions
  SET provider_call_ref = v_call_ref,
      reservation_id = v_reservation_id,
      state = 'bound',
      bound_at = pg_catalog.clock_timestamp()
  WHERE id = v_row.id AND state = 'reserved';

  RETURN pg_catalog.jsonb_build_object(
    'status', 'bound',
    'billable', true,
    'admissionRef', v_row.admission_ref,
    'agentRef', v_row.agent_ref,
    'providerCallRef', v_call_ref,
    'reserveSeconds', 60
  );
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_release_inbound_admissions_v1(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_environment text;
  v_mode text;
  v_now timestamptz;
  v_quoted text;
  v_call_ref text;
  v_row admin_private.commercial_usage_admissions%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload');
  END IF;
  BEGIN
    v_environment := p_event->>'environment';
    v_mode := p_event->>'mode';
    v_quoted := NULLIF(p_event->>'admissionRef', '');
    v_call_ref := NULLIF(p_event->>'providerCallRef', '');
    IF NULLIF(p_event->>'now', '') IS NOT NULL THEN
      v_now := (p_event->>'now')::timestamptz;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
      RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload');
  END;
  IF v_environment NOT IN ('dev', 'production')
    OR v_mode NOT IN ('expire', 'disconnect')
    OR v_now IS NULL
    OR (v_quoted IS NOT NULL AND v_quoted !~ '^adm_[0-9a-f]{32}$')
    OR (v_call_ref IS NOT NULL AND v_call_ref !~ '^[A-Za-z0-9_-]{1,128}$')
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload');
  END IF;

  IF v_mode = 'expire' AND v_quoted IS NULL AND v_call_ref IS NULL THEN
    FOR v_row IN
      SELECT * FROM admin_private.commercial_usage_admissions
      WHERE environment = v_environment
        AND state = 'reserved'
        AND bound_at IS NULL
        AND expires_at <= pg_catalog.clock_timestamp()
      ORDER BY subscription_id::text, period_start::text, id::text
    LOOP
      PERFORM admin_private.commercial_usage_lock_period_v1(v_row.subscription_id, v_row.period_start);
      SELECT * INTO v_row
      FROM admin_private.commercial_usage_admissions
      WHERE id = v_row.id
      FOR UPDATE;
      IF v_row.state IS DISTINCT FROM 'reserved'
        OR v_row.bound_at IS NOT NULL
        OR v_row.expires_at > pg_catalog.clock_timestamp()
      THEN
        CONTINUE;
      END IF;
      IF v_row.provider_call_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM admin_private.commercial_usage_events AS event
        WHERE event.environment = v_row.environment AND event.provider_call_ref = v_row.provider_call_ref
      ) THEN
        UPDATE admin_private.commercial_usage_admissions
        SET state = 'bound', bound_at = pg_catalog.clock_timestamp()
        WHERE id = v_row.id AND state = 'reserved';
        CONTINUE;
      END IF;
      IF v_row.reservation_id IS NOT NULL THEN
        UPDATE admin_private.commercial_usage_reservations
        SET state = 'released'
        WHERE id = v_row.reservation_id AND state = 'open';
      END IF;
      UPDATE admin_private.commercial_usage_admissions
      SET state = 'expired', released_at = pg_catalog.clock_timestamp()
      WHERE id = v_row.id AND state = 'reserved';
      v_count := v_count + 1;
    END LOOP;
    RETURN pg_catalog.jsonb_build_object('status', 'expired', 'released', v_count);
  END IF;

  SELECT * INTO v_row
  FROM admin_private.commercial_usage_admissions
  WHERE environment = v_environment
    AND (
      (v_quoted IS NOT NULL AND admission_ref = v_quoted)
      OR (v_quoted IS NULL AND provider_call_ref = v_call_ref)
    );
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'unknown_admission');
  END IF;
  IF v_row.provider_call_ref IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('commercial-usage:' || v_row.environment || ':' || v_row.provider_call_ref)::bigint);
  END IF;
  PERFORM admin_private.commercial_usage_lock_period_v1(v_row.subscription_id, v_row.period_start);
  SELECT * INTO v_row
  FROM admin_private.commercial_usage_admissions
  WHERE id = v_row.id
  FOR UPDATE;
  IF v_row.provider_call_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM admin_private.commercial_usage_events AS event
    WHERE event.environment = v_row.environment AND event.provider_call_ref = v_row.provider_call_ref
  ) THEN
    IF v_row.state = 'reserved' THEN
      UPDATE admin_private.commercial_usage_admissions
      SET state = 'bound', bound_at = pg_catalog.clock_timestamp()
      WHERE id = v_row.id AND state = 'reserved';
    END IF;
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'usage_evidence_present', 'admissionRef', v_row.admission_ref);
  END IF;
  IF v_mode = 'expire' AND NOT (
    v_row.state = 'reserved' AND v_row.bound_at IS NULL AND v_row.expires_at <= pg_catalog.clock_timestamp()
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'replay', 'reason', v_row.state, 'admissionRef', v_row.admission_ref);
  END IF;
  IF v_row.state NOT IN ('reserved', 'bound') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'replay', 'reason', v_row.state, 'admissionRef', v_row.admission_ref);
  END IF;
  IF v_mode = 'expire' AND v_row.state = 'bound' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'replay', 'reason', 'bound', 'admissionRef', v_row.admission_ref);
  END IF;
  IF v_row.reservation_id IS NOT NULL THEN
    UPDATE admin_private.commercial_usage_reservations
    SET state = 'released'
    WHERE id = v_row.reservation_id AND state = 'open';
  END IF;
  UPDATE admin_private.commercial_usage_admissions
  SET state = CASE WHEN v_mode = 'expire' THEN 'expired' ELSE 'disconnected' END,
      released_at = pg_catalog.clock_timestamp()
  WHERE id = v_row.id AND state IN ('reserved', 'bound');
  RETURN pg_catalog.jsonb_build_object(
    'status', CASE WHEN v_mode = 'expire' THEN 'expired' ELSE 'disconnected' END,
    'admissionRef', v_row.admission_ref,
    'billable', false
  );
END;
$fn$;

CREATE FUNCTION public.commercial_usage_reserve_inbound_v1(jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_reserve_inbound_v1($1);
$fn$;

CREATE FUNCTION public.commercial_usage_bind_inbound_admission_v1(jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_bind_inbound_admission_v1($1);
$fn$;

CREATE FUNCTION public.commercial_usage_release_inbound_admissions_v1(jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_release_inbound_admissions_v1($1);
$fn$;

CREATE FUNCTION admin_private.commercial_usage_lock_subscription_periods_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_old timestamptz;
  v_new timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.state IS DISTINCT FROM OLD.state
    OR NEW.current_period_start IS DISTINCT FROM OLD.current_period_start
    OR NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
  ) THEN
    v_old := OLD.current_period_start;
    v_new := NEW.current_period_start;
    IF v_old IS NOT NULL AND v_new IS NOT NULL AND v_new::text < v_old::text THEN
      PERFORM admin_private.commercial_usage_lock_period_v1(OLD.id, v_new);
      PERFORM admin_private.commercial_usage_lock_period_v1(OLD.id, v_old);
    ELSE
      PERFORM admin_private.commercial_usage_lock_period_v1(OLD.id, v_old);
      IF v_new IS DISTINCT FROM v_old THEN
        PERFORM admin_private.commercial_usage_lock_period_v1(OLD.id, v_new);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER commercial_subscriptions_usage_period_lock
  BEFORE UPDATE ON public.commercial_subscriptions
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_lock_subscription_periods_v1();

ALTER TABLE admin_private.commercial_usage_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_admission_conflicts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  admin_private.commercial_usage_admissions,
  admin_private.commercial_usage_admission_conflicts
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  admin_private.commercial_usage_admission_guard_v1(),
  admin_private.commercial_usage_admission_view_v1(admin_private.commercial_usage_admissions),
  admin_private.commercial_usage_lock_period_v1(uuid, timestamptz),
  admin_private.commercial_usage_lock_subscription_periods_v1(),
  admin_private.commercial_usage_finish_replay_v1(uuid),
  admin_private.commercial_usage_release_expired_admissions_v1(uuid, timestamptz),
  admin_private.commercial_usage_reserve_inbound_v1(jsonb),
  admin_private.commercial_usage_bind_inbound_admission_v1(jsonb),
  admin_private.commercial_usage_release_inbound_admissions_v1(jsonb),
  public.commercial_usage_reserve_inbound_v1(jsonb),
  public.commercial_usage_bind_inbound_admission_v1(jsonb),
  public.commercial_usage_release_inbound_admissions_v1(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.commercial_usage_reserve_inbound_v1(jsonb),
  public.commercial_usage_bind_inbound_admission_v1(jsonb),
  public.commercial_usage_release_inbound_admissions_v1(jsonb)
TO service_role;

COMMENT ON FUNCTION public.commercial_usage_reserve_inbound_v1(jsonb) IS
  'Server role only. Reserves one customer minute from the accepted offer for the number owner. The admission reference is generated here. An identical body replays that admission until the database clock expires an unbound hold. A different body cannot reuse it. A provider call id is stored only when the webhook supplies one. The caller number is not an identity.';

COMMENT ON FUNCTION public.commercial_usage_bind_inbound_admission_v1(jsonb) IS
  'Server role only. Links one open admission to a later provider call id when that id was stored at admission or the later event echoes the admission reference and the number owner still matches. An unmatched event does not create a reservation.';

COMMENT ON FUNCTION public.commercial_usage_release_inbound_admissions_v1(jsonb) IS
  'Server role only. Releases an unbound hold that the database clock has expired, or a disconnected admission that has no usage event. It does not delete usage evidence and it does not release a bound call because the pre-connect timeout elapsed.';

COMMIT;
