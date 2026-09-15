-- Relaunch Guard Data Foundation v1
-- Persistent onboarding records for monitoring requests.
--
-- Relaunch Guard is NOT a case. Do not create PR/RV cases, a GUARD case_type,
-- public Guard references, or case_events from this migration.
--
-- Do not execute this file automatically from application code.
-- The owner applies it manually after review.

-- ---------------------------------------------------------------------------
-- monitoring_requests
-- REQUESTED means the customer asked to start onboarding, not that
-- monitoring is active.
-- ---------------------------------------------------------------------------

CREATE TABLE public.monitoring_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  submission_key uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'REQUESTED',
  number_of_locations integer NOT NULL,
  source text NOT NULL DEFAULT 'START_MONITORING',
  intake_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms_accepted_at timestamptz NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitoring_requests_submission_key_key UNIQUE (submission_key),
  CONSTRAINT monitoring_requests_status_allowed CHECK (
    status IN (
      'REQUESTED',
      'AWAITING_PAYMENT',
      'AWAITING_AUTHORIZATION',
      'ACTIVE',
      'PAUSED',
      'CANCELLED'
    )
  ),
  CONSTRAINT monitoring_requests_number_of_locations_range CHECK (
    number_of_locations >= 1 AND number_of_locations <= 1000
  ),
  CONSTRAINT monitoring_requests_source_allowed CHECK (source = 'START_MONITORING')
);

CREATE INDEX monitoring_requests_customer_id_idx
  ON public.monitoring_requests (customer_id);

CREATE INDEX monitoring_requests_business_id_idx
  ON public.monitoring_requests (business_id);

CREATE INDEX monitoring_requests_location_id_idx
  ON public.monitoring_requests (location_id);

CREATE INDEX monitoring_requests_status_idx
  ON public.monitoring_requests (status);

CREATE INDEX monitoring_requests_created_at_idx
  ON public.monitoring_requests (created_at DESC);

CREATE TRIGGER monitoring_requests_set_updated_at
  BEFORE UPDATE ON public.monitoring_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- monitoring_request_events
-- ---------------------------------------------------------------------------

CREATE TABLE public.monitoring_request_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  monitoring_request_id uuid NOT NULL REFERENCES public.monitoring_requests (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'SYSTEM',
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monitoring_request_events_event_type_not_blank CHECK (length(btrim(event_type)) > 0)
);

CREATE INDEX monitoring_request_events_request_id_created_at_idx
  ON public.monitoring_request_events (monitoring_request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- communications: one parent — a case XOR a monitoring request
-- ---------------------------------------------------------------------------

ALTER TABLE public.communications
  ADD COLUMN monitoring_request_id uuid REFERENCES public.monitoring_requests (id) ON DELETE CASCADE;

ALTER TABLE public.communications
  ALTER COLUMN case_id DROP NOT NULL;

ALTER TABLE public.communications
  ADD CONSTRAINT communications_exactly_one_parent
  CHECK (num_nonnulls(case_id, monitoring_request_id) = 1);

CREATE INDEX communications_monitoring_request_id_idx
  ON public.communications (monitoring_request_id);

-- ---------------------------------------------------------------------------
-- RLS — enabled, with no anon/authenticated policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.monitoring_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_request_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.monitoring_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.monitoring_request_events FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.monitoring_requests FROM anon;
    REVOKE ALL ON TABLE public.monitoring_request_events FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.monitoring_requests FROM authenticated;
    REVOKE ALL ON TABLE public.monitoring_request_events FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON TABLE public.monitoring_requests TO service_role;
    GRANT ALL ON TABLE public.monitoring_request_events TO service_role;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic onboarding RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_monitoring_request_v1(
  p_submission_key uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_business_name text,
  p_country text,
  p_website_url text,
  p_business_profile_url text,
  p_number_of_locations integer,
  p_terms_accepted boolean,
  p_intake_snapshot jsonb,
  p_internal_recipient text
)
RETURNS TABLE (
  monitoring_request_id uuid,
  customer_id uuid,
  business_id uuid,
  location_id uuid,
  status text,
  number_of_locations integer,
  was_existing boolean,
  customer_communication_id uuid,
  customer_communication_status text,
  customer_communication_recipient text,
  internal_communication_id uuid,
  internal_communication_status text,
  internal_communication_recipient text,
  intake_snapshot jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_business_name text := btrim(coalesce(p_business_name, ''));
  v_country text := btrim(coalesce(p_country, ''));
  v_website text := nullif(btrim(coalesce(p_website_url, '')), '');
  v_profile_url text := btrim(coalesce(p_business_profile_url, ''));
  v_internal text := btrim(coalesce(p_internal_recipient, ''));
  v_snapshot jsonb := coalesce(p_intake_snapshot, '{}'::jsonb);
  v_persisted_snapshot jsonb;
  v_customer_id uuid;
  v_business_id uuid;
  v_location_id uuid;
  v_request_id uuid;
  v_status text;
  v_locations integer;
  v_customer_comm_id uuid;
  v_internal_comm_id uuid;
  v_customer_comm_status text;
  v_internal_comm_status text;
  v_customer_recipient text;
  v_internal_recipient text;
  v_match_count integer;
BEGIN
  IF p_submission_key IS NULL THEN
    RAISE EXCEPTION 'invalid_monitoring_request';
  END IF;
  IF v_full_name = '' OR v_email = '' OR v_business_name = '' OR v_country = '' OR v_profile_url = '' OR v_internal = '' THEN
    RAISE EXCEPTION 'invalid_monitoring_request';
  END IF;
  IF p_number_of_locations IS NULL OR p_number_of_locations < 1 OR p_number_of_locations > 1000 THEN
    RAISE EXCEPTION 'invalid_monitoring_request';
  END IF;
  IF p_terms_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'invalid_monitoring_request';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_submission_key::text, 0)
  );

  SELECT
    existing_request.id,
    existing_request.customer_id,
    existing_request.business_id,
    existing_request.location_id,
    existing_request.status,
    existing_request.number_of_locations,
    existing_request.intake_snapshot
  INTO
    v_request_id,
    v_customer_id,
    v_business_id,
    v_location_id,
    v_status,
    v_locations,
    v_persisted_snapshot
  FROM public.monitoring_requests AS existing_request
  WHERE existing_request.submission_key = p_submission_key;

  IF v_request_id IS NOT NULL THEN
    v_snapshot := v_persisted_snapshot;
    SELECT
      customer_comm.id,
      customer_comm.status,
      customer_comm.recipient
    INTO
      v_customer_comm_id,
      v_customer_comm_status,
      v_customer_recipient
    FROM public.communications AS customer_comm
    WHERE customer_comm.monitoring_request_id = v_request_id
      AND customer_comm.communication_type = 'MONITORING_REQUEST_RECEIVED_CUSTOMER'
    ORDER BY customer_comm.created_at
    LIMIT 1;

    SELECT
      internal_comm.id,
      internal_comm.status,
      internal_comm.recipient
    INTO
      v_internal_comm_id,
      v_internal_comm_status,
      v_internal_recipient
    FROM public.communications AS internal_comm
    WHERE internal_comm.monitoring_request_id = v_request_id
      AND internal_comm.communication_type = 'MONITORING_REQUEST_RECEIVED_INTERNAL'
    ORDER BY internal_comm.created_at
    LIMIT 1;

    monitoring_request_id := v_request_id;
    customer_id := v_customer_id;
    business_id := v_business_id;
    location_id := v_location_id;
    status := v_status;
    number_of_locations := v_locations;
    was_existing := true;
    customer_communication_id := v_customer_comm_id;
    customer_communication_status := v_customer_comm_status;
    customer_communication_recipient := v_customer_recipient;
    internal_communication_id := v_internal_comm_id;
    internal_communication_status := v_internal_comm_status;
    internal_communication_recipient := v_internal_recipient;
    intake_snapshot := v_snapshot;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT existing_customer.id INTO v_customer_id
  FROM public.customers AS existing_customer
  WHERE lower(existing_customer.email) = lower(v_email)
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    BEGIN
      INSERT INTO public.customers AS new_customer (full_name, email, phone)
      VALUES (v_full_name, v_email, v_phone)
      RETURNING new_customer.id INTO v_customer_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT existing_customer.id INTO v_customer_id
      FROM public.customers AS existing_customer
      WHERE lower(existing_customer.email) = lower(v_email)
      LIMIT 1;
    END;
  END IF;

  UPDATE public.customers AS matched_customer
  SET
    full_name = v_full_name,
    phone = CASE WHEN v_phone IS NOT NULL THEN v_phone ELSE matched_customer.phone END
  WHERE matched_customer.id = v_customer_id;

  SELECT COUNT(DISTINCT matched_business.id)
  INTO v_match_count
  FROM (
    SELECT prior_case.business_id, prior_case.location_id
    FROM public.cases AS prior_case
    WHERE prior_case.customer_id = v_customer_id
    UNION ALL
    SELECT prior_request.business_id, prior_request.location_id
    FROM public.monitoring_requests AS prior_request
    WHERE prior_request.customer_id = v_customer_id
  ) AS prior_link
  JOIN public.businesses AS matched_business ON matched_business.id = prior_link.business_id
  JOIN public.locations AS matched_location ON matched_location.id = prior_link.location_id
  WHERE public._intake_norm_text(matched_business.display_name) = public._intake_norm_text(v_business_name)
    AND public._intake_norm_text(matched_location.country) = public._intake_norm_text(v_country)
    AND (
      public._intake_norm_url(v_website) IS NULL
      OR public._intake_norm_url(matched_business.website_url) IS NULL
      OR public._intake_norm_url(matched_business.website_url) = public._intake_norm_url(v_website)
    );

  IF v_match_count = 1 THEN
    SELECT DISTINCT matched_business.id
    INTO v_business_id
    FROM (
      SELECT prior_case.business_id, prior_case.location_id
      FROM public.cases AS prior_case
      WHERE prior_case.customer_id = v_customer_id
      UNION ALL
      SELECT prior_request.business_id, prior_request.location_id
      FROM public.monitoring_requests AS prior_request
      WHERE prior_request.customer_id = v_customer_id
    ) AS prior_link
    JOIN public.businesses AS matched_business ON matched_business.id = prior_link.business_id
    JOIN public.locations AS matched_location ON matched_location.id = prior_link.location_id
    WHERE public._intake_norm_text(matched_business.display_name) = public._intake_norm_text(v_business_name)
      AND public._intake_norm_text(matched_location.country) = public._intake_norm_text(v_country)
      AND (
        public._intake_norm_url(v_website) IS NULL
        OR public._intake_norm_url(matched_business.website_url) IS NULL
        OR public._intake_norm_url(matched_business.website_url) = public._intake_norm_url(v_website)
      );

    IF v_website IS NOT NULL THEN
      UPDATE public.businesses AS matched_business
      SET website_url = COALESCE(matched_business.website_url, v_website)
      WHERE matched_business.id = v_business_id;
    END IF;
  ELSE
    INSERT INTO public.businesses AS new_business (display_name, website_url)
    VALUES (v_business_name, v_website)
    RETURNING new_business.id INTO v_business_id;
  END IF;

  SELECT COUNT(*)
  INTO v_match_count
  FROM public.locations AS matched_location
  WHERE matched_location.business_id = v_business_id
    AND public._intake_norm_url(matched_location.business_profile_url) = public._intake_norm_url(v_profile_url);

  IF v_match_count = 1 THEN
    SELECT matched_location.id
    INTO v_location_id
    FROM public.locations AS matched_location
    WHERE matched_location.business_id = v_business_id
      AND public._intake_norm_url(matched_location.business_profile_url) = public._intake_norm_url(v_profile_url);
  ELSE
    INSERT INTO public.locations AS new_location (business_id, country, business_profile_url)
    VALUES (v_business_id, v_country, v_profile_url)
    RETURNING new_location.id INTO v_location_id;
  END IF;

  INSERT INTO public.monitoring_requests AS created_request (
    submission_key,
    customer_id,
    business_id,
    location_id,
    status,
    number_of_locations,
    source,
    intake_snapshot,
    terms_accepted_at,
    submitted_at
  )
  VALUES (
    p_submission_key,
    v_customer_id,
    v_business_id,
    v_location_id,
    'REQUESTED',
    p_number_of_locations,
    'START_MONITORING',
    v_snapshot,
    now(),
    now()
  )
  RETURNING
    created_request.id,
    created_request.status,
    created_request.number_of_locations,
    created_request.intake_snapshot
  INTO
    v_request_id,
    v_status,
    v_locations,
    v_snapshot;

  INSERT INTO public.monitoring_request_events AS received_event (
    monitoring_request_id,
    event_type,
    actor_type,
    event_data
  )
  VALUES (
    v_request_id,
    'MONITORING_REQUEST_RECEIVED',
    'SYSTEM',
    jsonb_build_object('source', 'START_MONITORING')
  );

  INSERT INTO public.communications AS customer_comm (
    case_id,
    monitoring_request_id,
    channel,
    communication_type,
    direction,
    recipient,
    status
  )
  VALUES (
    NULL,
    v_request_id,
    'EMAIL',
    'MONITORING_REQUEST_RECEIVED_CUSTOMER',
    'OUTBOUND',
    v_email,
    'PENDING'
  )
  RETURNING
    customer_comm.id,
    customer_comm.status,
    customer_comm.recipient
  INTO
    v_customer_comm_id,
    v_customer_comm_status,
    v_customer_recipient;

  INSERT INTO public.communications AS internal_comm (
    case_id,
    monitoring_request_id,
    channel,
    communication_type,
    direction,
    recipient,
    status
  )
  VALUES (
    NULL,
    v_request_id,
    'EMAIL',
    'MONITORING_REQUEST_RECEIVED_INTERNAL',
    'OUTBOUND',
    v_internal,
    'PENDING'
  )
  RETURNING
    internal_comm.id,
    internal_comm.status,
    internal_comm.recipient
  INTO
    v_internal_comm_id,
    v_internal_comm_status,
    v_internal_recipient;

  monitoring_request_id := v_request_id;
  customer_id := v_customer_id;
  business_id := v_business_id;
  location_id := v_location_id;
  status := v_status;
  number_of_locations := v_locations;
  was_existing := false;
  customer_communication_id := v_customer_comm_id;
  customer_communication_status := v_customer_comm_status;
  customer_communication_recipient := v_customer_recipient;
  internal_communication_id := v_internal_comm_id;
  internal_communication_status := v_internal_comm_status;
  internal_communication_recipient := v_internal_recipient;
  intake_snapshot := v_snapshot;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_monitoring_request_v1(
  uuid, text, text, text, text, text, text, text, integer, boolean, jsonb, text
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.create_monitoring_request_v1(
      uuid, text, text, text, text, text, text, text, integer, boolean, jsonb, text
    ) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.create_monitoring_request_v1(
      uuid, text, text, text, text, text, text, text, integer, boolean, jsonb, text
    ) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.create_monitoring_request_v1(
      uuid, text, text, text, text, text, text, text, integer, boolean, jsonb, text
    ) TO service_role;
  END IF;
END;
$$;
