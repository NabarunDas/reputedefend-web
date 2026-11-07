-- Source only. Do not apply 20261107110000 to hosted DEV.
-- Do not apply 20261107110000 to Production.
-- Usage evidence for an existing commercial subscription. No new subscription,
-- payment, invoice, or catalogue table. No Stripe charge. No seed data.
-- Lead personal data stays on public.telloya_voice_leads. This ledger stores
-- duration and period evidence, not a transcript, recording, or raw webhook body.
-- service_role has no USAGE on admin_private. The callable path is the public
-- SECURITY DEFINER functions below. Do not grant schema USAGE.
-- Internal Admin web-call QA is stored with call_scope admin_web_qa and is
-- excluded from the customer-second total. Unused minutes do not roll over.
-- call_started reserves the subscription period. call_ended writes duration
-- once, including when the call ends after that period renews. call_analyzed
-- stores a receipt only. A different hash for the same event is a conflict and
-- does not add another billable call. Corrections are append-only.

BEGIN;

CREATE TABLE admin_private.commercial_usage_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  provider_call_ref text NOT NULL CHECK (provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  call_scope text NOT NULL CHECK (call_scope IN ('customer_phone', 'admin_web_qa')),
  subscription_id uuid REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  business_id uuid REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  duration_quality text NOT NULL CHECK (duration_quality IN ('confirmed', 'missing')),
  ended_at timestamptz,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  included_minutes_snapshot integer CHECK (included_minutes_snapshot IS NULL OR included_minutes_snapshot >= 0),
  minutes_rollover_snapshot boolean NOT NULL DEFAULT false CHECK (minutes_rollover_snapshot = false),
  overage_opt_in_snapshot boolean NOT NULL,
  overage_rate_minor_snapshot integer CHECK (overage_rate_minor_snapshot IS NULL OR overage_rate_minor_snapshot >= 0),
  overage_cap_minor_snapshot integer CHECK (overage_cap_minor_snapshot IS NULL OR overage_cap_minor_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_events_call UNIQUE (environment, provider_call_ref),
  CONSTRAINT commercial_usage_events_customer_shape CHECK (
    (
      call_scope = 'admin_web_qa'
      AND subscription_id IS NULL
      AND business_id IS NULL
      AND location_id IS NULL
    )
    OR (
      call_scope = 'customer_phone'
      AND subscription_id IS NOT NULL
      AND business_id IS NOT NULL
      AND location_id IS NOT NULL
      AND period_start IS NOT NULL
      AND period_end IS NOT NULL
      AND period_end > period_start
    )
  ),
  CONSTRAINT commercial_usage_events_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT,
  CONSTRAINT commercial_usage_events_duration_shape CHECK (
    (duration_quality = 'missing' AND duration_seconds IS NULL)
    OR (duration_quality = 'confirmed' AND duration_seconds IS NOT NULL)
  )
);

CREATE TABLE admin_private.commercial_usage_corrections (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES admin_private.commercial_usage_events (id) ON DELETE RESTRICT,
  duration_seconds integer NOT NULL CHECK (duration_seconds >= 0),
  reason text NOT NULL CHECK (reason ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE admin_private.commercial_usage_reservations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  provider_call_ref text NOT NULL CHECK (provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  business_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  reserved_seconds integer NOT NULL CHECK (reserved_seconds = 60),
  state text NOT NULL CHECK (state IN ('open', 'released', 'consumed')),
  included_minutes_snapshot integer NOT NULL CHECK (included_minutes_snapshot >= 0),
  overage_opt_in_snapshot boolean NOT NULL,
  overage_rate_minor_snapshot integer CHECK (overage_rate_minor_snapshot IS NULL OR overage_rate_minor_snapshot >= 0),
  overage_cap_minor_snapshot integer CHECK (overage_cap_minor_snapshot IS NULL OR overage_cap_minor_snapshot >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_reservations_call UNIQUE (environment, provider_call_ref),
  CONSTRAINT commercial_usage_reservations_period CHECK (period_end > period_start),
  CONSTRAINT commercial_usage_reservations_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT
);

CREATE TABLE admin_private.commercial_usage_receipts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  event_type text NOT NULL CHECK (event_type IN ('call_started', 'call_ended', 'call_analyzed')),
  provider_call_ref text NOT NULL CHECK (provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_receipts_identity UNIQUE (environment, event_type, provider_call_ref)
);

CREATE TABLE admin_private.commercial_usage_receipt_conflicts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES admin_private.commercial_usage_receipts (id) ON DELETE RESTRICT,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_receipt_conflicts_once UNIQUE (receipt_id, body_sha256)
);

CREATE TABLE admin_private.telloya_lead_legal_holds (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.telloya_voice_leads (id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  released_at timestamptz
);

CREATE FUNCTION admin_private.commercial_usage_reject_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'commercial_usage_evidence_immutable' USING ERRCODE = '55000';
END;
$fn$;

CREATE TRIGGER commercial_usage_events_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_events
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE TRIGGER commercial_usage_corrections_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_corrections
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE TRIGGER commercial_usage_receipts_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_receipts
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE TRIGGER commercial_usage_receipt_conflicts_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_receipt_conflicts
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE FUNCTION admin_private.commercial_usage_reservation_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial_usage_evidence_immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.provider_call_ref IS DISTINCT FROM OLD.provider_call_ref
    OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end IS DISTINCT FROM OLD.period_end
    OR NEW.reserved_seconds IS DISTINCT FROM OLD.reserved_seconds
    OR NEW.included_minutes_snapshot IS DISTINCT FROM OLD.included_minutes_snapshot
    OR NEW.overage_opt_in_snapshot IS DISTINCT FROM OLD.overage_opt_in_snapshot
    OR NEW.overage_rate_minor_snapshot IS DISTINCT FROM OLD.overage_rate_minor_snapshot
    OR NEW.overage_cap_minor_snapshot IS DISTINCT FROM OLD.overage_cap_minor_snapshot
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'commercial_usage_evidence_immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF OLD.state = 'open' AND NEW.state IN ('consumed', 'released') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'commercial_usage_evidence_immutable' USING ERRCODE = '55000';
END;
$fn$;

CREATE TRIGGER commercial_usage_reservations_guard
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_reservations
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reservation_guard_v1();

CREATE FUNCTION admin_private.commercial_usage_customer_seconds_v1(
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
  SELECT coalesce(pg_catalog.sum(
    CASE
      WHEN correction.duration_seconds IS NOT NULL THEN correction.duration_seconds
      ELSE event.duration_seconds
    END
  ), 0::bigint)::integer
  FROM admin_private.commercial_usage_events AS event
  LEFT JOIN LATERAL (
    SELECT correction.duration_seconds
    FROM admin_private.commercial_usage_corrections AS correction
    WHERE correction.event_id = event.id
    ORDER BY correction.created_at DESC, correction.id DESC
    LIMIT 1
  ) AS correction ON true
  WHERE event.subscription_id = p_subscription_id
    AND event.call_scope = 'customer_phone'
    AND event.period_start = p_period_start
    AND event.period_end = p_period_end
    AND coalesce(correction.duration_seconds, event.duration_seconds) IS NOT NULL;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_open_reservation_seconds_v1(
  p_subscription_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
  SELECT coalesce(pg_catalog.sum(reserved_seconds), 0::bigint)::integer
  FROM admin_private.commercial_usage_reservations
  WHERE subscription_id = p_subscription_id
    AND period_start = p_period_start
    AND period_end = p_period_end
    AND state = 'open';
$fn$;

CREATE FUNCTION admin_private.commercial_usage_apply_event_v1(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_environment text;
  v_event_type text;
  v_call_ref text;
  v_scope text;
  v_subscription uuid;
  v_business uuid;
  v_location uuid;
  v_ended timestamptz;
  v_duration integer;
  v_quality text;
  v_hash text;
  v_included integer;
  v_overage boolean;
  v_rate integer;
  v_cap integer;
  v_subscription_row public.commercial_subscriptions%ROWTYPE;
  v_reservation admin_private.commercial_usage_reservations%ROWTYPE;
  v_receipt admin_private.commercial_usage_receipts%ROWTYPE;
  v_existing admin_private.commercial_usage_events%ROWTYPE;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_event_id uuid;
  v_outside boolean := false;
BEGIN
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected');
  END IF;

  BEGIN
    v_environment := p_event->>'environment';
    v_event_type := p_event->>'eventType';
    v_call_ref := p_event->>'providerCallRef';
    v_scope := p_event->>'callScope';
    v_hash := p_event->>'bodySha256';
    v_quality := p_event->>'durationQuality';
    IF NULLIF(p_event->>'subscriptionId', '') IS NOT NULL THEN
      v_subscription := (p_event->>'subscriptionId')::uuid;
    END IF;
    IF NULLIF(p_event->>'businessId', '') IS NOT NULL THEN
      v_business := (p_event->>'businessId')::uuid;
    END IF;
    IF NULLIF(p_event->>'locationId', '') IS NOT NULL THEN
      v_location := (p_event->>'locationId')::uuid;
    END IF;
    IF NULLIF(p_event->>'endedAt', '') IS NOT NULL THEN
      v_ended := (p_event->>'endedAt')::timestamptz;
    END IF;
    IF p_event ? 'durationSeconds' AND pg_catalog.jsonb_typeof(p_event->'durationSeconds') IS DISTINCT FROM 'null' THEN
      IF (p_event->>'durationSeconds') !~ '^[0-9]+$' THEN
        RETURN pg_catalog.jsonb_build_object('status', 'rejected');
      END IF;
      v_duration := (p_event->>'durationSeconds')::integer;
    END IF;
    IF p_event ? 'includedMinutes' AND pg_catalog.jsonb_typeof(p_event->'includedMinutes') IS DISTINCT FROM 'null' THEN
      IF (p_event->>'includedMinutes') !~ '^[0-9]+$' THEN
        RETURN pg_catalog.jsonb_build_object('status', 'rejected');
      END IF;
      v_included := (p_event->>'includedMinutes')::integer;
    END IF;
    IF NULLIF(p_event->>'overageOptIn', '') IS NOT NULL THEN
      v_overage := (p_event->>'overageOptIn')::boolean;
    END IF;
    IF p_event ? 'overageRateMinor' AND pg_catalog.jsonb_typeof(p_event->'overageRateMinor') IS DISTINCT FROM 'null' THEN
      IF (p_event->>'overageRateMinor') !~ '^[0-9]+$' THEN
        RETURN pg_catalog.jsonb_build_object('status', 'rejected');
      END IF;
      v_rate := (p_event->>'overageRateMinor')::integer;
    END IF;
    IF p_event ? 'overageCapMinor' AND pg_catalog.jsonb_typeof(p_event->'overageCapMinor') IS DISTINCT FROM 'null' THEN
      IF (p_event->>'overageCapMinor') !~ '^[0-9]+$' THEN
        RETURN pg_catalog.jsonb_build_object('status', 'rejected');
      END IF;
      v_cap := (p_event->>'overageCapMinor')::integer;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RETURN pg_catalog.jsonb_build_object('status', 'rejected');
  END;

  IF v_environment NOT IN ('dev', 'production')
    OR v_event_type NOT IN ('call_started', 'call_ended', 'call_analyzed')
    OR v_scope NOT IN ('customer_phone', 'admin_web_qa')
    OR v_call_ref IS NULL
    OR v_call_ref !~ '^[A-Za-z0-9_-]{1,128}$'
    OR v_hash IS NULL
    OR v_hash !~ '^[0-9a-f]{64}$'
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected');
  END IF;

  IF v_event_type = 'call_ended' AND (
    v_quality NOT IN ('confirmed', 'missing')
    OR (v_quality = 'confirmed' AND v_duration IS NULL)
    OR (v_quality = 'missing' AND v_duration IS NOT NULL)
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected');
  END IF;

  IF v_scope = 'admin_web_qa' THEN
    v_subscription := NULL;
    v_business := NULL;
    v_location := NULL;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('commercial-usage:' || v_environment || ':' || v_call_ref)::bigint
  );

  IF v_scope = 'customer_phone' THEN
    SELECT * INTO v_subscription_row
    FROM public.commercial_subscriptions
    WHERE id = v_subscription;
    IF NOT FOUND OR v_subscription_row.business_id IS DISTINCT FROM v_business THEN
      RETURN pg_catalog.jsonb_build_object('status', 'denied');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.locations
      WHERE id = v_location AND business_id = v_business
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO v_reservation
    FROM admin_private.commercial_usage_reservations
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
    IF FOUND AND (
      v_reservation.subscription_id IS DISTINCT FROM v_subscription
      OR v_reservation.business_id IS DISTINCT FROM v_business
      OR v_reservation.location_id IS DISTINCT FROM v_location
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'denied');
    END IF;
  END IF;

  SELECT * INTO v_receipt
  FROM admin_private.commercial_usage_receipts
  WHERE environment = v_environment
    AND event_type = v_event_type
    AND provider_call_ref = v_call_ref;
  IF FOUND THEN
    SELECT id INTO v_event_id
    FROM admin_private.commercial_usage_events
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
    IF v_receipt.body_sha256 = v_hash THEN
      RETURN pg_catalog.jsonb_build_object('status', 'replay', 'eventId', v_event_id);
    END IF;
    INSERT INTO admin_private.commercial_usage_receipt_conflicts(receipt_id, body_sha256)
    VALUES (v_receipt.id, v_hash)
    ON CONFLICT (receipt_id, body_sha256) DO NOTHING;
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'eventId', v_event_id);
  END IF;

  IF v_event_type = 'call_started' AND v_scope = 'customer_phone' AND v_reservation.id IS NULL THEN
    SELECT id INTO v_event_id
    FROM admin_private.commercial_usage_events
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
    IF v_event_id IS NULL AND (
      v_subscription_row.current_period_start IS NULL
      OR v_subscription_row.current_period_end IS NULL
      OR v_subscription_row.current_period_end <= v_subscription_row.current_period_start
      OR v_included IS NULL
      OR v_overage IS NULL
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'unattributed');
    END IF;
  END IF;

  IF v_event_type = 'call_ended' AND v_scope = 'customer_phone' AND v_reservation.id IS NULL THEN
    IF v_subscription_row.current_period_start IS NULL
      OR v_subscription_row.current_period_end IS NULL
      OR v_subscription_row.current_period_end <= v_subscription_row.current_period_start
    THEN
      RETURN pg_catalog.jsonb_build_object('status', 'unattributed');
    END IF;
    v_outside := v_ended IS NOT NULL AND (
      v_ended < v_subscription_row.current_period_start
      OR v_ended >= v_subscription_row.current_period_end
    );
    IF v_outside THEN
      INSERT INTO admin_private.commercial_usage_receipts(
        environment, event_type, provider_call_ref, body_sha256
      ) VALUES (v_environment, v_event_type, v_call_ref, v_hash);
      RETURN pg_catalog.jsonb_build_object('status', 'unattributed');
    END IF;
    IF v_included IS NULL OR v_overage IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('status', 'rejected');
    END IF;
  END IF;

  INSERT INTO admin_private.commercial_usage_receipts(
    environment, event_type, provider_call_ref, body_sha256
  ) VALUES (v_environment, v_event_type, v_call_ref, v_hash);

  v_event_id := NULL;

  IF v_event_type = 'call_started' AND v_scope = 'customer_phone' AND v_reservation.id IS NULL THEN
    SELECT id INTO v_event_id
    FROM admin_private.commercial_usage_events
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
    IF v_event_id IS NULL THEN
      INSERT INTO admin_private.commercial_usage_reservations(
        environment, provider_call_ref, subscription_id, location_id, business_id,
        period_start, period_end, reserved_seconds, state,
        included_minutes_snapshot, overage_opt_in_snapshot,
        overage_rate_minor_snapshot, overage_cap_minor_snapshot
      ) VALUES (
        v_environment, v_call_ref, v_subscription, v_location, v_business,
        v_subscription_row.current_period_start, v_subscription_row.current_period_end,
        60, 'open', v_included, v_overage, v_rate, v_cap
      );
      v_period_start := v_subscription_row.current_period_start;
      v_period_end := v_subscription_row.current_period_end;
    END IF;
    v_event_id := NULL;
  ELSIF v_reservation.id IS NOT NULL THEN
    v_period_start := v_reservation.period_start;
    v_period_end := v_reservation.period_end;
  END IF;

  IF v_event_type = 'call_ended' THEN
    SELECT * INTO v_existing
    FROM admin_private.commercial_usage_events
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'eventId', v_existing.id);
    END IF;
    IF v_scope = 'customer_phone' AND v_reservation.id IS NOT NULL THEN
      v_period_start := v_reservation.period_start;
      v_period_end := v_reservation.period_end;
      v_included := v_reservation.included_minutes_snapshot;
      v_overage := v_reservation.overage_opt_in_snapshot;
      v_rate := v_reservation.overage_rate_minor_snapshot;
      v_cap := v_reservation.overage_cap_minor_snapshot;
    ELSIF v_scope = 'customer_phone' THEN
      v_period_start := v_subscription_row.current_period_start;
      v_period_end := v_subscription_row.current_period_end;
    END IF;
    INSERT INTO admin_private.commercial_usage_events(
      environment, provider_call_ref, call_scope, subscription_id, business_id, location_id,
      period_start, period_end, duration_seconds, duration_quality, ended_at, body_sha256,
      included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
      overage_rate_minor_snapshot, overage_cap_minor_snapshot
    ) VALUES (
      v_environment, v_call_ref, v_scope, v_subscription, v_business, v_location,
      v_period_start, v_period_end, v_duration, v_quality, v_ended, v_hash,
      CASE WHEN v_scope = 'customer_phone' THEN v_included ELSE NULL END,
      false,
      coalesce(CASE WHEN v_scope = 'customer_phone' THEN v_overage ELSE false END, false),
      CASE WHEN v_scope = 'customer_phone' THEN v_rate ELSE NULL END,
      CASE WHEN v_scope = 'customer_phone' THEN v_cap ELSE NULL END
    )
    RETURNING id INTO v_event_id;
    IF v_reservation.id IS NOT NULL AND v_reservation.state = 'open' THEN
      UPDATE admin_private.commercial_usage_reservations
      SET state = 'consumed'
      WHERE id = v_reservation.id AND state = 'open';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'accepted',
    'eventId', v_event_id,
    'periodStart', v_period_start,
    'periodEnd', v_period_end
  );
END;
$fn$;

CREATE FUNCTION admin_private.commercial_usage_correct_v1(
  p_environment text,
  p_provider_call_ref text,
  p_duration_seconds integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_environment NOT IN ('dev', 'production')
    OR p_provider_call_ref IS NULL
    OR p_provider_call_ref !~ '^[A-Za-z0-9_-]{1,128}$'
    OR p_duration_seconds IS NULL
    OR p_duration_seconds < 0
    OR p_reason IS NULL
    OR p_reason !~ '^[a-z0-9_]{1,64}$'
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('commercial-usage:' || p_environment || ':' || p_provider_call_ref)::bigint
  );
  SELECT id INTO v_event_id
  FROM admin_private.commercial_usage_events
  WHERE environment = p_environment AND provider_call_ref = p_provider_call_ref;
  IF v_event_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'missing');
  END IF;
  INSERT INTO admin_private.commercial_usage_corrections(event_id, duration_seconds, reason)
  VALUES (v_event_id, p_duration_seconds, p_reason);
  RETURN pg_catalog.jsonb_build_object('status', 'accepted', 'eventId', v_event_id);
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_redact_expired_leads_v1(p_now timestamptz)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  redacted integer;
BEGIN
  UPDATE public.telloya_voice_leads AS lead
  SET caller_name = NULL,
      callback_number = NULL,
      service_requested = NULL,
      job_location = NULL,
      callback_window = NULL,
      summary = 'redacted',
      updated_at = p_now
  WHERE lead.created_at < p_now - interval '90 days'
    AND lead.summary IS DISTINCT FROM 'redacted'
    AND NOT EXISTS (
      SELECT 1
      FROM admin_private.telloya_lead_legal_holds AS hold
      WHERE hold.lead_id = lead.id
        AND hold.released_at IS NULL
    );
  GET DIAGNOSTICS redacted = ROW_COUNT;
  RETURN redacted;
END;
$fn$;

CREATE FUNCTION admin_private.telloya_voice_hold_lead_v1(p_lead_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_hold_id uuid;
BEGIN
  IF p_lead_id IS NULL OR p_reason IS NULL OR p_reason !~ '^[a-z0-9_]{1,64}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.telloya_voice_leads WHERE id = p_lead_id) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'missing');
  END IF;
  INSERT INTO admin_private.telloya_lead_legal_holds(lead_id, reason)
  VALUES (p_lead_id, p_reason)
  ON CONFLICT (lead_id) DO NOTHING
  RETURNING id INTO v_hold_id;
  IF v_hold_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'replay');
  END IF;
  RETURN pg_catalog.jsonb_build_object('status', 'accepted', 'holdId', v_hold_id);
END;
$fn$;

CREATE FUNCTION public.commercial_usage_apply_event_v1(jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_apply_event_v1($1);
$fn$;

CREATE FUNCTION public.commercial_usage_correct_v1(text, text, integer, text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_correct_v1($1, $2, $3, $4);
$fn$;

CREATE FUNCTION public.commercial_usage_customer_seconds_v1(uuid, timestamptz, timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_customer_seconds_v1($1, $2, $3);
$fn$;

CREATE FUNCTION public.commercial_usage_open_reservation_seconds_v1(uuid, timestamptz, timestamptz)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_open_reservation_seconds_v1($1, $2, $3);
$fn$;

CREATE FUNCTION public.telloya_voice_redact_expired_leads_v1(timestamptz)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_redact_expired_leads_v1($1);
$fn$;

CREATE FUNCTION public.telloya_voice_hold_lead_v1(uuid, text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_voice_hold_lead_v1($1, $2);
$fn$;

ALTER TABLE admin_private.commercial_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_receipt_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_lead_legal_holds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  admin_private.commercial_usage_events,
  admin_private.commercial_usage_corrections,
  admin_private.commercial_usage_reservations,
  admin_private.commercial_usage_receipts,
  admin_private.commercial_usage_receipt_conflicts,
  admin_private.telloya_lead_legal_holds
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  admin_private.commercial_usage_reject_mutation_v1(),
  admin_private.commercial_usage_reservation_guard_v1(),
  admin_private.commercial_usage_customer_seconds_v1(uuid, timestamptz, timestamptz),
  admin_private.commercial_usage_open_reservation_seconds_v1(uuid, timestamptz, timestamptz),
  admin_private.commercial_usage_apply_event_v1(jsonb),
  admin_private.commercial_usage_correct_v1(text, text, integer, text),
  admin_private.telloya_voice_redact_expired_leads_v1(timestamptz),
  admin_private.telloya_voice_hold_lead_v1(uuid, text),
  public.commercial_usage_apply_event_v1(jsonb),
  public.commercial_usage_correct_v1(text, text, integer, text),
  public.commercial_usage_customer_seconds_v1(uuid, timestamptz, timestamptz),
  public.commercial_usage_open_reservation_seconds_v1(uuid, timestamptz, timestamptz),
  public.telloya_voice_redact_expired_leads_v1(timestamptz),
  public.telloya_voice_hold_lead_v1(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.commercial_usage_apply_event_v1(jsonb),
  public.commercial_usage_correct_v1(text, text, integer, text),
  public.commercial_usage_customer_seconds_v1(uuid, timestamptz, timestamptz),
  public.commercial_usage_open_reservation_seconds_v1(uuid, timestamptz, timestamptz),
  public.telloya_voice_redact_expired_leads_v1(timestamptz),
  public.telloya_voice_hold_lead_v1(uuid, text)
TO service_role;

COMMENT ON FUNCTION public.commercial_usage_apply_event_v1(jsonb) IS
  'Server role only. Records a usage receipt. call_started reserves the current subscription period. call_ended writes immutable duration evidence for that reserved period. call_analyzed stores no duration and no lead text.';
COMMENT ON FUNCTION public.commercial_usage_correct_v1(text, text, integer, text) IS
  'Server role only. Appends a duration correction. The original usage row stays unchanged.';
COMMENT ON FUNCTION public.commercial_usage_customer_seconds_v1(uuid, timestamptz, timestamptz) IS
  'Server role only. Customer-phone seconds for one subscription and period. Admin web QA is excluded.';
COMMENT ON FUNCTION public.telloya_voice_redact_expired_leads_v1(timestamptz) IS
  'Server role only. Clears lead personal fields after 90 days unless a legal hold is open. Usage rows stay.';
COMMENT ON FUNCTION public.telloya_voice_hold_lead_v1(uuid, text) IS
  'Server role only. Opens a legal hold so lead redaction leaves that lead in place.';

COMMIT;
