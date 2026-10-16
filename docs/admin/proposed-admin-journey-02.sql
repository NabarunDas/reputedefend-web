-- ADMIN-JOURNEY-02 source SQL / DEV deployment record.
-- Reviewed and applied ONLY to profilerelaunch-dev on 2026-10-16 as tracked
-- Supabase migration 20261016175917_admin_journey_02_dev_intake_review_screening_v1.
-- This historical source is intentionally outside the shared supabase/migrations
-- chain. Do not reapply to DEV, and do not apply to Production without separate
-- approval and a Production-specific release plan. Local PGlite tests use this
-- function body with local, disposable test data.
--
-- Adds two functions. It does not alter cases, case_work_events, audit actions,
-- intake, email verification, membership, or the case-flow transition matrix.
-- Staff identity comes from the existing session. The client cannot name the actor.

CREATE OR REPLACE FUNCTION public.admin_case_journey_decision_v1(
  p_token text,
  p_request uuid,
  p_case uuid,
  p_version integer,
  p_kind text,
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  c public.cases;
  r admin_private.case_command_receipts;
  fp text;
  result jsonb;
  note text;
  outcome text;
  event_name text;
  details jsonb;
  now_time timestamptz := now();
  review_outcome text;
  review_at timestamptz;
  submitted_name text;
  submitted_email text;
  submitted_country text;
  submitted_website text;
  submitted_profile text;
  current_name text;
  current_email text;
  current_country text;
  current_website text;
  current_profile text;
  left_country text;
  right_country text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_kind IS NULL
     OR p_kind NOT IN ('intake', 'verification')
     OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
     OR octet_length(p_data::text) > 8000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  note := p_data->>'note';
  outcome := p_data->>'outcome';
  IF note IS NULL OR length(btrim(note)) < 10 OR length(note) > 1000 OR outcome IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF p_kind = 'intake' THEN
    IF p_data - ARRAY['note', 'outcome', 'nextAction'] <> '{}'::jsonb
       OR outcome NOT IN ('REVIEWED', 'INCOMPLETE') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF outcome = 'REVIEWED' AND coalesce(p_data->>'nextAction', '') <> '' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF outcome = 'INCOMPLETE' AND coalesce(length(btrim(p_data->>'nextAction')), 0) NOT BETWEEN 3 AND 200 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    event_name := 'INTAKE_REVIEW';
    details := jsonb_build_object('outcome', outcome, 'nextAction', coalesce(p_data->>'nextAction', ''));
  ELSE
    IF p_data - ARRAY['note', 'outcome', 'source', 'listing', 'website', 'discrepancy', 'reason'] <> '{}'::jsonb
       OR outcome NOT IN ('PRELIMINARY_COMPLETE', 'FURTHER_INFORMATION', 'LISTING_UNAVAILABLE', 'DUPLICATE_REVIEW', 'ESCALATE')
       OR coalesce(length(btrim(p_data->>'source')), 0) NOT BETWEEN 3 AND 200
       OR coalesce(length(btrim(p_data->>'reason')), 0) NOT BETWEEN 10 AND 1000
       OR p_data->>'listing' IS NULL
       OR p_data->>'listing' NOT IN ('ACCESSIBLE', 'SUSPENDED_OR_MISSING', 'NOT_SUPPLIED')
       OR p_data->>'website' IS NULL
       OR p_data->>'website' NOT IN ('PRESENT', 'NONE')
       OR jsonb_typeof(p_data->'discrepancy') IS DISTINCT FROM 'boolean' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF (p_data->>'discrepancy')::boolean AND outcome <> 'ESCALATE' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF outcome = 'LISTING_UNAVAILABLE' AND p_data->>'listing' <> 'SUSPENDED_OR_MISSING' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    event_name := 'BUSINESS_VERIFICATION';
    details := jsonb_build_object(
      'outcome', outcome,
      'source', btrim(p_data->>'source'),
      'listing', p_data->>'listing',
      'website', p_data->>'website',
      'discrepancy', p_data->'discrepancy',
      'reason', btrim(p_data->>'reason')
    );
  END IF;

  fp := md5(jsonb_build_array(p_case, p_version, p_kind, p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = (s->>'userId')::uuid AND r.fingerprint = fp THEN
      RETURN r.response;
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL OR c.workflow_version <> p_version THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF c.status IN ('CLOSED', 'CANCELLED') THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  -- A recorded website or profile URL must not be stored as absent unless the
  -- operator marks the discrepancy and escalates. A saved profile URL is not
  -- treated as an accessible listing; suspended or missing remains valid.
  IF p_kind = 'verification' AND NOT (outcome = 'ESCALATE' AND coalesce((p_data->>'discrepancy')::boolean, false)) THEN
    IF p_data->>'website' = 'NONE' AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = c.business_id AND btrim(coalesce(b.website_url, '')) <> ''
    ) THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF p_data->>'listing' = 'NOT_SUPPLIED' AND EXISTS (
      SELECT 1 FROM public.locations l
      WHERE l.id = c.location_id AND btrim(coalesce(l.business_profile_url, '')) <> ''
    ) THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
  END IF;
  IF p_kind = 'verification' AND outcome = 'PRELIMINARY_COMPLETE' THEN
    SELECT e.details->>'outcome', e.created_at INTO review_outcome, review_at
    FROM public.case_work_events e
    WHERE e.case_id = c.id AND e.event = 'INTAKE_REVIEW'
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1;
    IF review_outcome IS DISTINCT FROM 'REVIEWED' OR EXISTS (
      SELECT 1 FROM public.case_work_events reopened
      WHERE reopened.case_id = c.id AND reopened.event = 'reopen' AND reopened.created_at > review_at
    ) THEN
      RETURN jsonb_build_object('status', 'prerequisite');
    END IF;
    SELECT u.email, b.display_name, b.website_url, l.country, l.business_profile_url
      INTO current_email, current_name, current_website, current_country, current_profile
    FROM public.customers u
    JOIN public.businesses b ON b.id = c.business_id
    JOIN public.locations l ON l.id = c.location_id
    WHERE u.id = c.customer_id;
    submitted_name := btrim(coalesce(c.intake_snapshot->>'businessName', ''));
    submitted_email := btrim(coalesce(c.intake_snapshot->>'email', ''));
    submitted_country := btrim(coalesce(c.intake_snapshot->>'country', ''));
    submitted_website := regexp_replace(lower(btrim(coalesce(c.intake_snapshot->>'websiteUrl', ''))), '/+$', '');
    submitted_profile := regexp_replace(lower(btrim(coalesce(c.intake_snapshot->>'businessProfileUrl', ''))), '/+$', '');
    current_website := regexp_replace(lower(btrim(coalesce(current_website, ''))), '/+$', '');
    current_profile := regexp_replace(lower(btrim(coalesce(current_profile, ''))), '/+$', '');
    left_country := lower(regexp_replace(regexp_replace(submitted_country, '\.', '', 'g'), '\s+', ' ', 'g'));
    right_country := lower(regexp_replace(regexp_replace(btrim(coalesce(current_country, '')), '\.', '', 'g'), '\s+', ' ', 'g'));
    IF left_country IN ('gb', 'uk', 'united kingdom') THEN left_country := 'gb'; END IF;
    IF right_country IN ('gb', 'uk', 'united kingdom') THEN right_country := 'gb'; END IF;
    IF (submitted_name <> '' AND lower(submitted_name) IS DISTINCT FROM lower(btrim(coalesce(current_name, ''))))
       OR (submitted_email <> '' AND lower(submitted_email) IS DISTINCT FROM lower(btrim(coalesce(current_email, ''))))
       OR (submitted_country <> '' AND left_country IS DISTINCT FROM right_country)
       OR (submitted_website <> '' AND submitted_website IS DISTINCT FROM current_website)
       OR (submitted_profile <> '' AND submitted_profile IS DISTINCT FROM current_profile) THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
  END IF;
  IF p_kind = 'verification' AND outcome = 'PRELIMINARY_COMPLETE' AND EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = c.customer_id AND m.business_id = c.business_id AND m.status = 'revoked'
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
  VALUES (c.id, (s->>'userId')::uuid, event_name, note, 'INTERNAL', details);
  PERFORM admin_private.write_record_audit_v1(
    (s->>'userId')::uuid, 'CASE_CHANGED', 'success', c.id, p_request, 'case', note,
    jsonb_build_object('operation', 'journey_' || p_kind, 'outcome', outcome, 'previousVersion', p_version)
  );
  UPDATE public.cases SET workflow_version = workflow_version WHERE id = c.id;
  result := jsonb_build_object('status', 'success', 'id', c.id, 'outcome', outcome);
  INSERT INTO admin_private.case_command_receipts(request_id, actor_id, fingerprint, response, created_at)
  VALUES (p_request, (s->>'userId')::uuid, fp, result, now_time);
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict');
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_case_journey_intake_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.cases;
  events jsonb;
  snapshot jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_case IS NULL THEN
    RETURN jsonb_build_object('missing', true);
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  IF c.id IS NULL THEN
    RETURN jsonb_build_object('missing', true);
  END IF;
  snapshot := jsonb_build_object(
    'fullName', left(coalesce(c.intake_snapshot->>'fullName', ''), 200),
    'email', left(coalesce(c.intake_snapshot->>'email', ''), 254),
    'businessName', left(coalesce(c.intake_snapshot->>'businessName', ''), 200),
    'country', left(coalesce(c.intake_snapshot->>'country', ''), 100),
    'phone', left(coalesce(c.intake_snapshot->>'phone', ''), 40),
    'websiteUrl', left(coalesce(c.intake_snapshot->>'websiteUrl', ''), 2048),
    'businessProfileUrl', left(coalesce(c.intake_snapshot->>'businessProfileUrl', ''), 2048),
    'reviewUrl', left(coalesce(c.intake_snapshot->>'reviewUrl', ''), 2048),
    'details', left(coalesce(c.intake_snapshot->>'details', ''), 4000)
  );
  IF snapshot->>'businessName' = '' OR snapshot->>'details' = '' THEN
    snapshot := NULL;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'event', x.event,
    'createdAt', x.created_at,
    'details', x.details
  ) ORDER BY x.created_at, x.id), '[]'::jsonb)
  INTO events
  FROM (
    SELECT id, event, created_at, details
    FROM public.case_work_events
    WHERE case_id = p_case AND event IN ('INTAKE_REVIEW', 'BUSINESS_VERIFICATION', 'reopen')
    ORDER BY created_at DESC, id DESC
    LIMIT 200
  ) x;
  RETURN jsonb_build_object('openedAt', c.created_at, 'snapshot', snapshot, 'events', events);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_case_journey_decision_v1(text, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_case_journey_intake_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_case_journey_decision_v1(text, uuid, uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_journey_intake_v1(text, uuid) TO service_role;
