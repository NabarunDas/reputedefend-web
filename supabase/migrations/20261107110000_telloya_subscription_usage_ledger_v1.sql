-- Source only. Do not apply 20261107110000 to hosted DEV.
-- Do not apply 20261107110000 to Production.
-- Usage evidence for an existing commercial subscription. No new subscription,
-- payment, invoice, or catalogue table. No Stripe charge. No seed data.
-- Lead personal data stays on public.telloya_voice_leads. This ledger stores
-- duration and period evidence, not a transcript, recording, or raw webhook body.
-- Internal Admin web-call QA is stored with call_scope admin_web_qa and is
-- excluded from the customer-second total. Unused minutes do not roll over.

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
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_reservations_call UNIQUE (environment, provider_call_ref),
  CONSTRAINT commercial_usage_reservations_period CHECK (period_end > period_start),
  CONSTRAINT commercial_usage_reservations_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT
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

CREATE FUNCTION admin_private.commercial_usage_record_v1(
  p_environment text,
  p_provider_call_ref text,
  p_call_scope text,
  p_subscription_id uuid,
  p_business_id uuid,
  p_location_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_duration_seconds integer,
  p_duration_quality text,
  p_ended_at timestamptz,
  p_body_sha256 text,
  p_included_minutes integer,
  p_overage_opt_in boolean,
  p_overage_rate_minor integer,
  p_overage_cap_minor integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  existing admin_private.commercial_usage_events%ROWTYPE;
  subscription public.commercial_subscriptions%ROWTYPE;
  reservation admin_private.commercial_usage_reservations%ROWTYPE;
  inserted_id uuid;
BEGIN
  IF p_call_scope NOT IN ('customer_phone', 'admin_web_qa')
    OR p_duration_quality NOT IN ('confirmed', 'missing')
    OR p_environment NOT IN ('dev', 'production') THEN
    RAISE EXCEPTION 'commercial_usage_rejected' USING ERRCODE = '22023';
  END IF;
  IF p_call_scope = 'customer_phone' AND p_subscription_id IS NOT NULL THEN
    SELECT * INTO subscription FROM public.commercial_subscriptions WHERE id = p_subscription_id;
    IF NOT FOUND OR subscription.business_id IS DISTINCT FROM p_business_id THEN
      RAISE EXCEPTION 'commercial_usage_rejected' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO reservation
    FROM admin_private.commercial_usage_reservations
    WHERE environment = p_environment AND provider_call_ref = p_provider_call_ref;
    IF p_period_start IS DISTINCT FROM subscription.current_period_start
      OR p_period_end IS DISTINCT FROM subscription.current_period_end THEN
      IF NOT FOUND
        OR reservation.period_start IS DISTINCT FROM p_period_start
        OR reservation.period_end IS DISTINCT FROM p_period_end THEN
        RAISE EXCEPTION 'commercial_usage_period_rejected' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF p_ended_at IS NOT NULL AND (p_ended_at < p_period_start OR p_ended_at >= p_period_end) THEN
      RAISE EXCEPTION 'commercial_usage_period_rejected' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO existing
  FROM admin_private.commercial_usage_events
  WHERE environment = p_environment AND provider_call_ref = p_provider_call_ref;
  IF FOUND THEN
    IF existing.body_sha256 = p_body_sha256 THEN
      RETURN pg_catalog.jsonb_build_object('status', 'replay', 'eventId', existing.id);
    END IF;
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'eventId', existing.id);
  END IF;

  INSERT INTO admin_private.commercial_usage_events (
    environment, provider_call_ref, call_scope, subscription_id, business_id, location_id,
    period_start, period_end, duration_seconds, duration_quality, ended_at, body_sha256,
    included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
    overage_rate_minor_snapshot, overage_cap_minor_snapshot
  ) VALUES (
    p_environment, p_provider_call_ref, p_call_scope, p_subscription_id, p_business_id, p_location_id,
    p_period_start, p_period_end, p_duration_seconds, p_duration_quality, p_ended_at, p_body_sha256,
    p_included_minutes, false, p_overage_opt_in, p_overage_rate_minor, p_overage_cap_minor
  )
  RETURNING id INTO inserted_id;
  RETURN pg_catalog.jsonb_build_object('status', 'accepted', 'eventId', inserted_id);
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

ALTER TABLE admin_private.commercial_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_lead_legal_holds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  admin_private.commercial_usage_events,
  admin_private.commercial_usage_corrections,
  admin_private.commercial_usage_reservations,
  admin_private.telloya_lead_legal_holds
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  admin_private.commercial_usage_customer_seconds_v1(uuid, timestamptz, timestamptz),
  admin_private.commercial_usage_record_v1(text, text, text, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, timestamptz, text, integer, boolean, integer, integer),
  admin_private.telloya_voice_redact_expired_leads_v1(timestamptz)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  admin_private.commercial_usage_customer_seconds_v1(uuid, timestamptz, timestamptz),
  admin_private.commercial_usage_record_v1(text, text, text, uuid, uuid, uuid, timestamptz, timestamptz, integer, text, timestamptz, text, integer, boolean, integer, integer),
  admin_private.telloya_voice_redact_expired_leads_v1(timestamptz)
TO service_role;

COMMIT;
