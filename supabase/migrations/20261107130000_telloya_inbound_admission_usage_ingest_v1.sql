-- Source only. Do not apply 20261107130000 to hosted DEV.
-- Do not apply 20261107130000 to Production.
-- Do not replay 20261107120000. Do not apply 20261107120000 to Production.
-- Do not replay 20261107110000. Do not apply 20261107110000 to Production.
-- One transaction binds an admitted call and records its later provider event.
-- An unmatched call records a non-personal diagnostic and no billable usage.
-- This file does not enable Retell, forwarding, a provider webhook, or a
-- Stripe charge. It does not store a transcript, recording, token, caller
-- number, or raw provider body.
-- Lock order, always transaction-scoped and always in this sequence:
-- 1. Body lock: hashtextextended('commercial-usage-body:' || env || ':' || sha)
-- 2. Call lock: hashtext('commercial-usage:' || env || ':' || provider_call_ref)
-- 3. Period lock: hashtextextended('commercial-usage-period:' || subscription || ':' || period_start)
-- 4. Admission row lock: FOR UPDATE, only after the period lock.
-- The admission row supplies the customer, business, location, subscription,
-- period, and accepted terms. Caller-supplied tenant identifiers are compared
-- and then discarded. They are never the billing identity.

BEGIN;

CREATE TABLE admin_private.commercial_usage_ingest_diagnostics (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  event_type text NOT NULL CHECK (event_type IN ('call_started', 'call_ended', 'call_analyzed')),
  provider_call_ref text NOT NULL CHECK (provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (reason ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_ingest_diagnostics_once UNIQUE (environment, event_type, provider_call_ref, body_sha256)
);

CREATE TRIGGER commercial_usage_ingest_diagnostics_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_ingest_diagnostics
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE FUNCTION admin_private.commercial_usage_ingest_diagnostic_v1(
  p_environment text,
  p_event_type text,
  p_call_ref text,
  p_hash text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO admin_private.commercial_usage_ingest_diagnostics(
    environment, event_type, provider_call_ref, body_sha256, reason
  ) VALUES (
    p_environment, p_event_type, p_call_ref, p_hash, p_reason
  )
  ON CONFLICT (environment, event_type, provider_call_ref, body_sha256) DO NOTHING
  RETURNING id INTO v_id;
  RETURN pg_catalog.jsonb_build_object(
    'status', CASE WHEN v_id IS NULL THEN 'replay' ELSE 'denied' END,
    'reason', p_reason,
    'billable', false
  );
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_ingest_inbound_admission_v1(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_environment text;
  v_event_type text;
  v_call_ref text;
  v_number text;
  v_quoted text;
  v_hash text;
  v_quality text;
  v_duration integer;
  v_ended timestamptz;
  v_asserted_subscription uuid;
  v_asserted_business uuid;
  v_asserted_location uuid;
  v_asserted_customer uuid;
  v_caller_name text;
  v_callback text;
  v_service text;
  v_window text;
  v_summary text;
  v_row admin_private.commercial_usage_admissions%ROWTYPE;
  v_owner admin_private.commercial_provider_number_owners%ROWTYPE;
  v_reservation admin_private.commercial_usage_reservations%ROWTYPE;
  v_receipt admin_private.commercial_usage_receipts%ROWTYPE;
  v_existing admin_private.commercial_usage_events%ROWTYPE;
  v_plan uuid;
  v_reservation_id uuid;
  v_event_id uuid;
  v_lead_id uuid;
BEGIN
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  BEGIN
    v_environment := p_event->>'environment';
    v_event_type := p_event->>'eventType';
    v_call_ref := NULLIF(p_event->>'providerCallRef', '');
    v_number := NULLIF(p_event->>'toNumber', '');
    v_quoted := NULLIF(p_event->>'admissionRef', '');
    v_hash := NULLIF(p_event->>'bodySha256', '');
    v_quality := NULLIF(p_event->>'durationQuality', '');
    v_caller_name := NULLIF(p_event->>'callerName', '');
    v_callback := NULLIF(p_event->>'callbackNumber', '');
    v_service := NULLIF(p_event->>'serviceRequested', '');
    v_window := NULLIF(p_event->>'callbackWindow', '');
    v_summary := NULLIF(p_event->>'summary', '');
    IF p_event ? 'durationSeconds' AND pg_catalog.jsonb_typeof(p_event->'durationSeconds') IS DISTINCT FROM 'null' THEN
      IF (p_event->>'durationSeconds') !~ '^[0-9]+$' THEN
        RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
      END IF;
      v_duration := (p_event->>'durationSeconds')::integer;
    END IF;
    IF NULLIF(p_event->>'endedAt', '') IS NOT NULL THEN
      v_ended := (p_event->>'endedAt')::timestamptz;
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
    IF NULLIF(p_event->>'assertedCustomerId', '') IS NOT NULL THEN
      v_asserted_customer := (p_event->>'assertedCustomerId')::uuid;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END;

  IF v_environment NOT IN ('dev', 'production')
    OR v_event_type NOT IN ('call_started', 'call_ended', 'call_analyzed')
    OR v_call_ref IS NULL
    OR v_call_ref !~ '^[A-Za-z0-9_-]{1,128}$'
    OR v_hash IS NULL
    OR v_hash !~ '^[0-9a-f]{64}$'
    OR (v_quoted IS NOT NULL AND v_quoted !~ '^adm_[0-9a-f]{32}$')
    OR (v_number IS NOT NULL AND v_number !~ '^\+[1-9][0-9]{7,14}$')
    OR (v_caller_name IS NOT NULL AND pg_catalog.char_length(v_caller_name) > 120)
    OR (v_service IS NOT NULL AND pg_catalog.char_length(v_service) > 280)
    OR (v_window IS NOT NULL AND pg_catalog.char_length(v_window) > 120)
    OR (v_summary IS NOT NULL AND pg_catalog.char_length(v_summary) > 600)
    OR (v_callback IS NOT NULL AND v_callback !~ '^\+[0-9]{8,15}$')
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  IF v_event_type = 'call_ended' AND (
    v_quality IS NULL
    OR v_quality NOT IN ('confirmed', 'missing')
    OR (v_quality = 'confirmed' AND v_duration IS NULL)
    OR (v_quality = 'missing' AND v_duration IS NOT NULL)
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;
  IF v_event_type <> 'call_ended' THEN
    v_duration := NULL;
    v_quality := NULL;
    v_ended := NULL;
  END IF;
  IF v_event_type <> 'call_analyzed' THEN
    v_caller_name := NULL;
    v_callback := NULL;
    v_service := NULL;
    v_window := NULL;
    v_summary := NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'commercial-usage-body:' || v_environment || ':' || v_hash, 0
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(
    'commercial-usage:' || v_environment || ':' || v_call_ref
  )::bigint);

  IF v_quoted IS NOT NULL THEN
    SELECT * INTO v_row
    FROM admin_private.commercial_usage_admissions
    WHERE admission_ref = v_quoted AND environment = v_environment;
  ELSE
    SELECT * INTO v_row
    FROM admin_private.commercial_usage_admissions
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
  END IF;
  IF NOT FOUND OR v_row.decision IS DISTINCT FROM 'admitted' OR v_row.subscription_id IS NULL THEN
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'unmatched_admission'
    );
  END IF;

  PERFORM admin_private.commercial_usage_lock_period_v1(v_row.subscription_id, v_row.period_start);
  SELECT * INTO v_row
  FROM admin_private.commercial_usage_admissions
  WHERE id = v_row.id
  FOR UPDATE;

  IF v_row.environment IS DISTINCT FROM v_environment
    OR v_row.decision IS DISTINCT FROM 'admitted'
    OR v_row.to_number IS NULL
    OR v_number IS NULL
    OR v_row.to_number IS DISTINCT FROM v_number
    OR (v_asserted_subscription IS NOT NULL AND v_asserted_subscription IS DISTINCT FROM v_row.subscription_id)
    OR (v_asserted_business IS NOT NULL AND v_asserted_business IS DISTINCT FROM v_row.business_id)
    OR (v_asserted_location IS NOT NULL AND v_asserted_location IS DISTINCT FROM v_row.location_id)
    OR (v_asserted_customer IS NOT NULL AND v_asserted_customer IS DISTINCT FROM v_row.customer_id)
  THEN
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'cross_tenant'
    );
  END IF;

  IF v_row.provider_call_ref IS NOT NULL AND v_row.provider_call_ref IS DISTINCT FROM v_call_ref THEN
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'call_conflict'
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM admin_private.commercial_usage_admissions AS other
    WHERE other.environment = v_environment
      AND other.provider_call_ref = v_call_ref
      AND other.id IS DISTINCT FROM v_row.id
  ) THEN
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'call_conflict'
    );
  END IF;

  IF v_row.state = 'disconnected' THEN
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'admission_disconnected'
    );
  END IF;
  IF v_row.state = 'reserved'
    AND v_row.bound_at IS NULL
    AND v_row.expires_at <= pg_catalog.clock_timestamp()
    AND NOT EXISTS (
      SELECT 1 FROM admin_private.commercial_usage_events AS event
      WHERE event.environment = v_environment AND event.provider_call_ref = v_call_ref
    )
  THEN
    IF v_row.reservation_id IS NOT NULL THEN
      UPDATE admin_private.commercial_usage_reservations
      SET state = 'released'
      WHERE id = v_row.reservation_id AND state = 'open';
    END IF;
    UPDATE admin_private.commercial_usage_admissions
    SET state = 'expired', released_at = pg_catalog.clock_timestamp()
    WHERE id = v_row.id AND state = 'reserved';
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'admission_expired'
    );
  END IF;
  IF v_row.state NOT IN ('reserved', 'bound') THEN
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash,
      CASE WHEN v_row.state = 'expired' THEN 'admission_expired' ELSE 'admission_closed' END
    );
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
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'cross_tenant'
    );
  END IF;

  v_reservation_id := v_row.reservation_id;
  IF v_reservation_id IS NOT NULL THEN
    SELECT * INTO v_reservation
    FROM admin_private.commercial_usage_reservations
    WHERE id = v_reservation_id;
  ELSE
    SELECT * INTO v_reservation
    FROM admin_private.commercial_usage_reservations
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
    v_reservation_id := v_reservation.id;
  END IF;
  IF v_reservation.id IS NOT NULL AND (
    v_reservation.environment IS DISTINCT FROM v_environment
    OR v_reservation.provider_call_ref IS DISTINCT FROM v_call_ref
    OR v_reservation.subscription_id IS DISTINCT FROM v_row.subscription_id
    OR v_reservation.business_id IS DISTINCT FROM v_row.business_id
    OR v_reservation.location_id IS DISTINCT FROM v_row.location_id
    OR v_reservation.period_start IS DISTINCT FROM v_row.period_start
    OR v_reservation.period_end IS DISTINCT FROM v_row.period_end
    OR v_reservation.reserved_seconds IS DISTINCT FROM 60
    OR v_reservation.included_minutes_snapshot IS DISTINCT FROM v_row.included_minutes_snapshot
    OR v_reservation.overage_opt_in_snapshot IS DISTINCT FROM v_row.overage_opt_in_snapshot
  ) THEN
    RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
      v_environment, v_event_type, v_call_ref, v_hash, 'call_conflict'
    );
  END IF;

  IF v_reservation.id IS NULL THEN
    SELECT acceptance.plan_version_id INTO v_plan
    FROM public.commercial_offer_acceptances AS acceptance
    WHERE acceptance.subscription_id = v_row.subscription_id;
    IF v_plan IS NULL THEN
      RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
        v_environment, v_event_type, v_call_ref, v_hash, 'acceptance_absent'
      );
    END IF;
    BEGIN
      INSERT INTO admin_private.commercial_usage_reservations(
        environment, provider_call_ref, subscription_id, location_id, business_id,
        period_start, period_end, reserved_seconds, state, plan_version_id,
        included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
        overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
      ) VALUES (
        v_environment, v_call_ref, v_row.subscription_id, v_row.location_id, v_row.business_id,
        v_row.period_start, v_row.period_end, 60, 'open', v_plan,
        v_row.included_minutes_snapshot, false, v_row.overage_opt_in_snapshot,
        v_row.overage_rate_minor_snapshot, v_row.overage_cap_minor_snapshot, v_row.overage_consent_at
      )
      RETURNING id INTO v_reservation_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_reservation
        FROM admin_private.commercial_usage_reservations
        WHERE environment = v_environment AND provider_call_ref = v_call_ref;
        IF NOT FOUND
          OR v_reservation.subscription_id IS DISTINCT FROM v_row.subscription_id
          OR v_reservation.period_start IS DISTINCT FROM v_row.period_start
          OR v_reservation.period_end IS DISTINCT FROM v_row.period_end
        THEN
          RETURN admin_private.commercial_usage_ingest_diagnostic_v1(
            v_environment, v_event_type, v_call_ref, v_hash, 'call_conflict'
          );
        END IF;
        v_reservation_id := v_reservation.id;
    END;
    SELECT * INTO v_reservation
    FROM admin_private.commercial_usage_reservations
    WHERE id = v_reservation_id;
  END IF;

  IF v_row.state = 'reserved' THEN
    UPDATE admin_private.commercial_usage_admissions
    SET provider_call_ref = v_call_ref,
        reservation_id = v_reservation_id,
        state = 'bound',
        bound_at = pg_catalog.clock_timestamp()
    WHERE id = v_row.id AND state = 'reserved';
  END IF;

  SELECT * INTO v_receipt
  FROM admin_private.commercial_usage_receipts
  WHERE environment = v_environment
    AND event_type = v_event_type
    AND provider_call_ref = v_call_ref;
  SELECT id INTO v_event_id
  FROM admin_private.commercial_usage_events
  WHERE environment = v_environment AND provider_call_ref = v_call_ref;
  IF v_receipt.id IS NOT NULL THEN
    IF v_receipt.body_sha256 = v_hash THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'replay',
        'reason', 'duplicate_delivery',
        'billable', false,
        'admissionRef', v_row.admission_ref,
        'eventId', v_event_id,
        'periodStart', v_row.period_start,
        'periodEnd', v_row.period_end
      );
    END IF;
    INSERT INTO admin_private.commercial_usage_receipt_conflicts(receipt_id, body_sha256)
    VALUES (v_receipt.id, v_hash)
    ON CONFLICT (receipt_id, body_sha256) DO NOTHING;
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'billable', false,
      'admissionRef', v_row.admission_ref,
      'eventId', v_event_id
    );
  END IF;

  INSERT INTO admin_private.commercial_usage_receipts(
    environment, event_type, provider_call_ref, body_sha256
  ) VALUES (
    v_environment, v_event_type, v_call_ref, v_hash
  );

  IF v_event_type = 'call_ended' THEN
    IF v_event_id IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'billable', false,
        'admissionRef', v_row.admission_ref,
        'eventId', v_event_id
      );
    END IF;
    INSERT INTO admin_private.commercial_usage_events(
      environment, provider_call_ref, call_scope, subscription_id, business_id, location_id,
      plan_version_id, period_start, period_end, duration_seconds, duration_quality, ended_at, body_sha256,
      included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
      overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
    ) VALUES (
      v_environment, v_call_ref, 'customer_phone', v_row.subscription_id, v_row.business_id, v_row.location_id,
      v_reservation.plan_version_id, v_row.period_start, v_row.period_end, v_duration, v_quality, v_ended, v_hash,
      v_row.included_minutes_snapshot, false, v_row.overage_opt_in_snapshot,
      v_row.overage_rate_minor_snapshot, v_row.overage_cap_minor_snapshot, v_row.overage_consent_at
    )
    RETURNING id INTO v_event_id;
    UPDATE admin_private.commercial_usage_reservations
    SET state = 'consumed'
    WHERE id = v_reservation.id AND state = 'open';
  ELSIF v_event_type = 'call_analyzed' AND v_summary IS NOT NULL THEN
    INSERT INTO public.telloya_voice_leads(
      environment, business_id, location_id, provider_call_ref,
      callback_number, caller_name, service_requested, callback_window,
      summary, incomplete, call_status, finalised, finalised_by,
      provider_error, created_at
    )
    SELECT
      v_environment, v_row.business_id, v_row.location_id, v_call_ref,
      v_callback, v_caller_name, v_service, v_window,
      v_summary, false, 'completed', true, 'analysis',
      false, pg_catalog.clock_timestamp()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.telloya_voice_leads AS lead
      WHERE lead.environment = v_environment AND lead.provider_call_ref = v_call_ref
    )
    RETURNING id INTO v_lead_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'accepted',
    'billable', true,
    'admissionRef', v_row.admission_ref,
    'providerCallRef', v_call_ref,
    'eventId', v_event_id,
    'reservationId', v_reservation.id,
    'reserveSeconds', 60,
    'periodStart', v_row.period_start,
    'periodEnd', v_row.period_end,
    'leadId', v_lead_id
  );
END;
$fn$;

CREATE FUNCTION public.commercial_usage_ingest_inbound_admission_v1(jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_ingest_inbound_admission_v1($1);
$fn$;

ALTER TABLE admin_private.commercial_usage_ingest_diagnostics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE admin_private.commercial_usage_ingest_diagnostics
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  admin_private.commercial_usage_ingest_diagnostic_v1(text, text, text, text, text),
  admin_private.commercial_usage_ingest_inbound_admission_v1(jsonb),
  public.commercial_usage_ingest_inbound_admission_v1(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.commercial_usage_ingest_inbound_admission_v1(jsonb)
TO service_role;

COMMENT ON FUNCTION public.commercial_usage_ingest_inbound_admission_v1(jsonb) IS
  'Server role only. Binds one admitted call and records call_started, call_ended, or call_analyzed in the same transaction. The admission row supplies the tenant, period, and accepted terms. An unmatched call stores a non-personal diagnostic and no billable usage. It does not create a Stripe charge.';

COMMIT;
