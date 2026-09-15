-- Case Intake Transaction v1
-- Adds submission idempotency and the atomic create_case_intake_v1 RPC.
-- Do not edit the already-applied Core Data Foundation baseline.
-- Do not apply this file automatically from application code.

ALTER TABLE public.cases
  ADD COLUMN submission_key uuid;

CREATE UNIQUE INDEX cases_submission_key_uidx
  ON public.cases (submission_key)
  WHERE submission_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public._intake_norm_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(lower(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'))), '');
$$;

CREATE OR REPLACE FUNCTION public._intake_norm_url(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN nullif(lower(btrim(p_value)), '') IS NULL THEN NULL
    ELSE regexp_replace(lower(btrim(p_value)), '/+$', '')
  END;
$$;

CREATE OR REPLACE FUNCTION public.create_case_intake_v1(
  p_submission_key uuid,
  p_case_type text,
  p_issue_subtype text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_business_name text,
  p_country text,
  p_website_url text,
  p_business_profile_url text,
  p_review_url text,
  p_issue_description text,
  p_information_accurate boolean,
  p_privacy_accepted boolean,
  p_intake_snapshot jsonb,
  p_internal_recipient text
)
RETURNS TABLE (
  case_id uuid,
  public_ref text,
  case_type text,
  customer_id uuid,
  business_id uuid,
  location_id uuid,
  customer_communication_id uuid,
  internal_communication_id uuid,
  was_existing boolean,
  customer_communication_status text,
  internal_communication_status text,
  intake_snapshot jsonb,
  customer_communication_recipient text,
  internal_communication_recipient text
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
  v_profile_url text := nullif(btrim(coalesce(p_business_profile_url, '')), '');
  v_review_url text := nullif(btrim(coalesce(p_review_url, '')), '');
  v_details text := btrim(coalesce(p_issue_description, ''));
  v_internal text := btrim(coalesce(p_internal_recipient, ''));
  v_subtype text := nullif(btrim(coalesce(p_issue_subtype, '')), '');
  v_snapshot jsonb := coalesce(p_intake_snapshot, '{}'::jsonb);
  v_persisted_snapshot jsonb;
  v_customer_id uuid;
  v_business_id uuid;
  v_location_id uuid;
  v_case_id uuid;
  v_public_ref text;
  v_case_type text;
  v_customer_comm_id uuid;
  v_internal_comm_id uuid;
  v_customer_comm_status text;
  v_internal_comm_status text;
  v_customer_recipient text;
  v_internal_recipient text;
  v_match_count integer;
BEGIN
  IF p_submission_key IS NULL THEN
    RAISE EXCEPTION 'invalid_intake';
  END IF;
  IF p_case_type NOT IN ('PROFILE_RECOVERY', 'REVIEW_PROTECTION') THEN
    RAISE EXCEPTION 'invalid_intake';
  END IF;
  IF v_full_name = '' OR v_email = '' OR v_business_name = '' OR v_country = '' OR v_details = '' OR v_internal = '' THEN
    RAISE EXCEPTION 'invalid_intake';
  END IF;
  IF p_information_accurate IS NOT TRUE OR p_privacy_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'invalid_intake';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_submission_key::text, 0)
  );

  SELECT
    existing_case.id,
    existing_case.public_ref,
    existing_case.case_type,
    existing_case.customer_id,
    existing_case.business_id,
    existing_case.location_id,
    existing_case.intake_snapshot
  INTO
    v_case_id,
    v_public_ref,
    v_case_type,
    v_customer_id,
    v_business_id,
    v_location_id,
    v_persisted_snapshot
  FROM public.cases AS existing_case
  WHERE existing_case.submission_key = p_submission_key;

  IF v_case_id IS NOT NULL THEN
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
    WHERE customer_comm.case_id = v_case_id
      AND customer_comm.communication_type = 'CASE_RECEIVED_CUSTOMER'
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
    WHERE internal_comm.case_id = v_case_id
      AND internal_comm.communication_type = 'CASE_RECEIVED_INTERNAL'
    ORDER BY internal_comm.created_at
    LIMIT 1;

    case_id := v_case_id;
    public_ref := v_public_ref;
    case_type := v_case_type;
    customer_id := v_customer_id;
    business_id := v_business_id;
    location_id := v_location_id;
    customer_communication_id := v_customer_comm_id;
    internal_communication_id := v_internal_comm_id;
    was_existing := true;
    customer_communication_status := v_customer_comm_status;
    internal_communication_status := v_internal_comm_status;
    intake_snapshot := v_snapshot;
    customer_communication_recipient := v_customer_recipient;
    internal_communication_recipient := v_internal_recipient;
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
  FROM public.cases AS prior_case
  JOIN public.businesses AS matched_business ON matched_business.id = prior_case.business_id
  JOIN public.locations AS matched_location ON matched_location.id = prior_case.location_id
  WHERE prior_case.customer_id = v_customer_id
    AND public._intake_norm_text(matched_business.display_name) = public._intake_norm_text(v_business_name)
    AND public._intake_norm_text(matched_location.country) = public._intake_norm_text(v_country)
    AND (
      public._intake_norm_url(v_website) IS NULL
      OR public._intake_norm_url(matched_business.website_url) IS NULL
      OR public._intake_norm_url(matched_business.website_url) = public._intake_norm_url(v_website)
    );

  IF v_match_count = 1 THEN
    SELECT DISTINCT matched_business.id
    INTO v_business_id
    FROM public.cases AS prior_case
    JOIN public.businesses AS matched_business ON matched_business.id = prior_case.business_id
    JOIN public.locations AS matched_location ON matched_location.id = prior_case.location_id
    WHERE prior_case.customer_id = v_customer_id
      AND public._intake_norm_text(matched_business.display_name) = public._intake_norm_text(v_business_name)
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

  IF v_profile_url IS NOT NULL THEN
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
  ELSE
    SELECT COUNT(*)
    INTO v_match_count
    FROM public.locations AS matched_location
    WHERE matched_location.business_id = v_business_id
      AND public._intake_norm_text(matched_location.country) = public._intake_norm_text(v_country);

    IF v_match_count = 1 THEN
      SELECT matched_location.id
      INTO v_location_id
      FROM public.locations AS matched_location
      WHERE matched_location.business_id = v_business_id
        AND public._intake_norm_text(matched_location.country) = public._intake_norm_text(v_country);
    ELSE
      INSERT INTO public.locations AS new_location (business_id, country, business_profile_url)
      VALUES (v_business_id, v_country, v_profile_url)
      RETURNING new_location.id INTO v_location_id;
    END IF;
  END IF;

  INSERT INTO public.cases AS created_case (
    submission_key,
    case_type,
    issue_subtype,
    status,
    customer_id,
    business_id,
    location_id,
    source,
    issue_description,
    review_url,
    intake_snapshot,
    information_accurate_at,
    privacy_accepted_at,
    submitted_at
  )
  VALUES (
    p_submission_key,
    p_case_type,
    v_subtype,
    'RECEIVED',
    v_customer_id,
    v_business_id,
    v_location_id,
    'GET_HELP',
    v_details,
    v_review_url,
    v_snapshot,
    now(),
    now(),
    now()
  )
  RETURNING
    created_case.id,
    created_case.public_ref,
    created_case.case_type,
    created_case.intake_snapshot
  INTO
    v_case_id,
    v_public_ref,
    v_case_type,
    v_snapshot;

  INSERT INTO public.case_events AS received_event (case_id, event_type, actor_type, event_data)
  VALUES (
    v_case_id,
    'CASE_RECEIVED',
    'SYSTEM',
    jsonb_build_object('source', 'GET_HELP', 'case_type', p_case_type)
  );

  INSERT INTO public.communications AS customer_comm (
    case_id,
    channel,
    communication_type,
    direction,
    recipient,
    status
  )
  VALUES (
    v_case_id,
    'EMAIL',
    'CASE_RECEIVED_CUSTOMER',
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
    channel,
    communication_type,
    direction,
    recipient,
    status
  )
  VALUES (
    v_case_id,
    'EMAIL',
    'CASE_RECEIVED_INTERNAL',
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

  case_id := v_case_id;
  public_ref := v_public_ref;
  case_type := v_case_type;
  customer_id := v_customer_id;
  business_id := v_business_id;
  location_id := v_location_id;
  customer_communication_id := v_customer_comm_id;
  internal_communication_id := v_internal_comm_id;
  was_existing := false;
  customer_communication_status := v_customer_comm_status;
  internal_communication_status := v_internal_comm_status;
  intake_snapshot := v_snapshot;
  customer_communication_recipient := v_customer_recipient;
  internal_communication_recipient := v_internal_recipient;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._intake_norm_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._intake_norm_url(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_case_intake_v1(
  uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text
) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public._intake_norm_text(text) FROM anon;
    REVOKE ALL ON FUNCTION public._intake_norm_url(text) FROM anon;
    REVOKE ALL ON FUNCTION public.create_case_intake_v1(
      uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text
    ) FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public._intake_norm_text(text) FROM authenticated;
    REVOKE ALL ON FUNCTION public._intake_norm_url(text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.create_case_intake_v1(
      uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text
    ) FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.create_case_intake_v1(
      uuid, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean, jsonb, text
    ) TO service_role;
  END IF;
END;
$$;
