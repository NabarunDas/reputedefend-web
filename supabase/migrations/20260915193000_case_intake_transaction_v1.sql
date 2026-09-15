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
  internal_communication_status text
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

  SELECT
    c.id,
    c.public_ref,
    c.case_type,
    c.customer_id,
    c.business_id,
    c.location_id
  INTO
    v_case_id,
    v_public_ref,
    v_case_type,
    v_customer_id,
    v_business_id,
    v_location_id
  FROM public.cases c
  WHERE c.submission_key = p_submission_key;

  IF v_case_id IS NOT NULL THEN
    SELECT id, status
    INTO v_customer_comm_id, v_customer_comm_status
    FROM public.communications
    WHERE case_id = v_case_id AND communication_type = 'CASE_RECEIVED_CUSTOMER'
    ORDER BY created_at
    LIMIT 1;

    SELECT id, status
    INTO v_internal_comm_id, v_internal_comm_status
    FROM public.communications
    WHERE case_id = v_case_id AND communication_type = 'CASE_RECEIVED_INTERNAL'
    ORDER BY created_at
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
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE lower(email) = lower(v_email)
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    BEGIN
      INSERT INTO public.customers (full_name, email, phone)
      VALUES (v_full_name, v_email, v_phone)
      RETURNING id INTO v_customer_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_customer_id
      FROM public.customers
      WHERE lower(email) = lower(v_email)
      LIMIT 1;
    END;
  END IF;

  UPDATE public.customers
  SET
    full_name = v_full_name,
    phone = CASE WHEN v_phone IS NOT NULL THEN v_phone ELSE phone END
  WHERE id = v_customer_id;

  SELECT COUNT(DISTINCT b.id)
  INTO v_match_count
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id
  WHERE c.customer_id = v_customer_id
    AND public._intake_norm_text(b.display_name) = public._intake_norm_text(v_business_name)
    AND public._intake_norm_text(l.country) = public._intake_norm_text(v_country)
    AND (
      public._intake_norm_url(v_website) IS NULL
      OR public._intake_norm_url(b.website_url) IS NULL
      OR public._intake_norm_url(b.website_url) = public._intake_norm_url(v_website)
    );

  IF v_match_count = 1 THEN
    SELECT DISTINCT b.id
    INTO v_business_id
    FROM public.cases c
    JOIN public.businesses b ON b.id = c.business_id
    JOIN public.locations l ON l.id = c.location_id
    WHERE c.customer_id = v_customer_id
      AND public._intake_norm_text(b.display_name) = public._intake_norm_text(v_business_name)
      AND public._intake_norm_text(l.country) = public._intake_norm_text(v_country)
      AND (
        public._intake_norm_url(v_website) IS NULL
        OR public._intake_norm_url(b.website_url) IS NULL
        OR public._intake_norm_url(b.website_url) = public._intake_norm_url(v_website)
      );

    IF v_website IS NOT NULL THEN
      UPDATE public.businesses
      SET website_url = COALESCE(website_url, v_website)
      WHERE id = v_business_id;
    END IF;
  ELSE
    INSERT INTO public.businesses (display_name, website_url)
    VALUES (v_business_name, v_website)
    RETURNING id INTO v_business_id;
  END IF;

  IF v_profile_url IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_match_count
    FROM public.locations loc
    WHERE loc.business_id = v_business_id
      AND public._intake_norm_url(loc.business_profile_url) = public._intake_norm_url(v_profile_url);

    IF v_match_count = 1 THEN
      SELECT loc.id
      INTO v_location_id
      FROM public.locations loc
      WHERE loc.business_id = v_business_id
        AND public._intake_norm_url(loc.business_profile_url) = public._intake_norm_url(v_profile_url);
    ELSE
      INSERT INTO public.locations (business_id, country, business_profile_url)
      VALUES (v_business_id, v_country, v_profile_url)
      RETURNING id INTO v_location_id;
    END IF;
  ELSE
    SELECT COUNT(*)
    INTO v_match_count
    FROM public.locations loc
    WHERE loc.business_id = v_business_id
      AND public._intake_norm_text(loc.country) = public._intake_norm_text(v_country);

    IF v_match_count = 1 THEN
      SELECT loc.id
      INTO v_location_id
      FROM public.locations loc
      WHERE loc.business_id = v_business_id
        AND public._intake_norm_text(loc.country) = public._intake_norm_text(v_country);
    ELSE
      INSERT INTO public.locations (business_id, country, business_profile_url)
      VALUES (v_business_id, v_country, v_profile_url)
      RETURNING id INTO v_location_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.cases (
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
      coalesce(p_intake_snapshot, '{}'::jsonb),
      now(),
      now(),
      now()
    )
    RETURNING id, public_ref, case_type
    INTO v_case_id, v_public_ref, v_case_type;
  EXCEPTION WHEN unique_violation THEN
    SELECT
      c.id,
      c.public_ref,
      c.case_type,
      c.customer_id,
      c.business_id,
      c.location_id
    INTO
      v_case_id,
      v_public_ref,
      v_case_type,
      v_customer_id,
      v_business_id,
      v_location_id
    FROM public.cases c
    WHERE c.submission_key = p_submission_key;

    SELECT id, status
    INTO v_customer_comm_id, v_customer_comm_status
    FROM public.communications
    WHERE case_id = v_case_id AND communication_type = 'CASE_RECEIVED_CUSTOMER'
    ORDER BY created_at
    LIMIT 1;

    SELECT id, status
    INTO v_internal_comm_id, v_internal_comm_status
    FROM public.communications
    WHERE case_id = v_case_id AND communication_type = 'CASE_RECEIVED_INTERNAL'
    ORDER BY created_at
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
    RETURN NEXT;
    RETURN;
  END;

  INSERT INTO public.case_events (case_id, event_type, actor_type, event_data)
  VALUES (
    v_case_id,
    'CASE_RECEIVED',
    'SYSTEM',
    jsonb_build_object('source', 'GET_HELP', 'case_type', p_case_type)
  );

  INSERT INTO public.communications (
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
  RETURNING id, status INTO v_customer_comm_id, v_customer_comm_status;

  INSERT INTO public.communications (
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
  RETURNING id, status INTO v_internal_comm_id, v_internal_comm_status;

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
