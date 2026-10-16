-- ADMIN-JOURNEY-03A proposed record. NOT APPLIED.
-- Do not copy this file into supabase/migrations.
-- Do not apply it to DEV or Production without a separate approval.
-- The guided journey does not call this function. An empty checklist is not this decision.
--
-- Minimal record: one INTERNAL case_work_events row, event EVIDENCE_NOT_REQUIRED,
-- written by the staff session, with a 10–1000 character reason, the existing
-- CASE_CHANGED audit, and the existing case-command idempotency receipt.
-- It does not change work_stage, evidence_requests, communications, or email.
-- A reopen newer than the event means it no longer completes anything.
-- Step 4 must not treat this row as accepted evidence or as a fulfilled request.

CREATE OR REPLACE FUNCTION public.admin_case_journey_no_documents_v1(
  p_token text,
  p_request uuid,
  p_case uuid,
  p_version integer,
  p_note text
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
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  note := btrim(coalesce(p_note, ''));
  IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL
     OR length(note) < 10 OR length(coalesce(p_note, '')) > 1000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fp := md5(jsonb_build_array(p_case, p_version, 'EVIDENCE_NOT_REQUIRED', note)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = (s->>'userId')::uuid AND r.fingerprint = fp THEN RETURN r.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF c.workflow_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF c.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility, details)
  VALUES (
    c.id, (s->>'userId')::uuid, 'EVIDENCE_NOT_REQUIRED', note, 'INTERNAL',
    jsonb_build_object('outcome', 'NONE_REQUIRED')
  );
  PERFORM admin_private.write_record_audit_v1(
    (s->>'userId')::uuid, 'CASE_CHANGED', 'success', c.id, p_request, 'case', note,
    jsonb_build_object('operation', 'journey_no_documents', 'outcome', 'NONE_REQUIRED', 'previousVersion', p_version)
  );
  UPDATE public.cases SET workflow_version = workflow_version WHERE id = c.id;
  result := jsonb_build_object('status', 'success', 'id', c.id, 'outcome', 'NONE_REQUIRED');
  INSERT INTO admin_private.case_command_receipts(request_id, actor_id, fingerprint, response, created_at)
  VALUES (p_request, (s->>'userId')::uuid, fp, result, now());
  RETURN result;
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status', 'conflict');
END;
$$;

-- Intentionally no GRANT here. A later approved migration would revoke from
-- PUBLIC, anon and authenticated, and grant execute to service_role only.
