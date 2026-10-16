-- ADMIN-JOURNEY-02 proposed database change.
-- NOT a migration. Do not copy this file into supabase/migrations and do not
-- apply it to DEV or Production from this pull request. It is reviewed here
-- and exercised only inside the local PGlite test, which rolls the writes back.
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
