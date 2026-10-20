BEGIN;

-- ADMIN-JOURNEY-E2E-04. Not applied to DEV (rmzozuiamjcclvtgutgd) or Production (cxwwekdzkkjjbiyofrov).
-- Do not apply this migration from the pull request. Independent review applies it to DEV only.
-- Do not replay 20261020150000 or any earlier applied migration.
-- customer_portal_case_v1 returns outcomeCode only for a finished CLOSED or CANCELLED case
-- whose stored outcome matches the case type and the terminal status.
-- An open or reopened case returns null even when an internal outcome is already stored.
-- The JSON shape, session check, ownership filter, timeline helper and grants stay as they are.
-- CREATE OR REPLACE keeps the existing owner. EXECUTE remains service_role only.

CREATE OR REPLACE FUNCTION public.customer_portal_case_v1(
  p_token_hash text,
  p_reference text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  sess jsonb;
  v_customer uuid;
  v_email text;
  v_case_id uuid;
  v_case jsonb;
  v_events jsonb;
  v_count integer;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN RETURN NULL; END IF;
  BEGIN
    v_customer := (sess->>'customerId')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
  v_email := sess->>'email';
  IF v_customer IS NULL OR v_email IS NULL OR length(btrim(v_email)) = 0 THEN
    RETURN NULL;
  END IF;

  -- A reference that does not exist and a reference owned by someone else
  -- return the same object. An ill-formed reference does too. Neither result
  -- says why.
  IF p_reference IS NULL OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT
    c.id,
    jsonb_build_object(
      'reference', c.public_ref,
      'caseType', c.case_type,
      'serviceTrack', c.service_track,
      'businessName', b.display_name,
      'locationName', l.location_name,
      'status', c.status,
      'workStage', c.work_stage,
      'submittedAt', c.submitted_at,
      'closedAt', c.closed_at,
      'attentionItems', admin_private.customer_portal_case_attention_v1(v_customer, v_email, c.id, pg_catalog.now()),
      'outcomeCode', CASE
        WHEN c.status = 'CLOSED' AND c.work_stage = 'FINISHED' AND c.closed_at IS NOT NULL
          AND c.case_type = 'PROFILE_RECOVERY' AND c.outcome IN ('RESTORED', 'PARTIALLY_RESTORED', 'NOT_RESTORED') THEN c.outcome
        WHEN c.status = 'CLOSED' AND c.work_stage = 'FINISHED' AND c.closed_at IS NOT NULL
          AND c.case_type = 'REVIEW_PROTECTION' AND c.outcome IN ('REMOVED', 'NOT_REMOVED', 'RESPONSE_RECOMMENDED') THEN c.outcome
        WHEN c.status = 'CANCELLED' AND c.work_stage = 'FINISHED' AND c.closed_at IS NOT NULL
          AND c.case_type IN ('PROFILE_RECOVERY', 'REVIEW_PROTECTION') AND c.outcome = 'WITHDRAWN' THEN 'WITHDRAWN'
        ELSE NULL
      END
    )
  INTO v_case_id, v_case
  FROM public.cases c
  JOIN public.businesses b ON b.id = c.business_id
  JOIN public.locations l ON l.id = c.location_id AND l.business_id = c.business_id
  WHERE c.public_ref = p_reference
    AND c.customer_id = v_customer;

  IF v_case_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_events := admin_private.customer_portal_case_timeline_v1(v_case_id, v_customer);
  v_count := jsonb_array_length(v_events);

  RETURN jsonb_build_object(
    'found', true,
    'case', v_case,
    'timeline', coalesce((
      SELECT jsonb_agg(elem ORDER BY ord)
      FROM jsonb_array_elements(v_events) WITH ORDINALITY AS t(elem, ord)
      WHERE ord <= 20
    ), '[]'::jsonb),
    'timelineTruncated', v_count > 20
  );
END;
$$;


COMMENT ON FUNCTION public.customer_portal_case_v1(text, text) IS
  'One owned customer case, or {found:false}. Invalid portal sessions return NULL. outcomeCode is set only for a finished CLOSED or CANCELLED case with a coherent outcome. No case id is accepted or returned.';

REVOKE ALL ON FUNCTION public.customer_portal_case_v1(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_case_v1(text, text) TO service_role;

COMMIT;
