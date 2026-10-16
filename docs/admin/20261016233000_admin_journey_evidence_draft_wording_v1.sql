-- ADMIN-JOURNEY-03B evidence-draft wording. NOT APPLIED to DEV or Production.
-- This file is migration-ready. Copy it into supabase/migrations only after
-- a separate approval, then record it in the recovery manifest as pending
-- until that deployment. Do not apply it from this pull request.
--
-- Corrections to proposed-admin-journey-03a-draft-wording.sql:
--   subject and body are not used as PL/pgSQL variable names
--   staff prose cannot contain HTML, a scheme, www., or a #t= token
--   the stored upload URL must occur once and must name the same action
--   a superseded draft cannot be rewritten, reviewed, or queued
--   the public command wrapper returns denied for that refusal
--   PUBLIC, anon, and authenticated lose execute in this same file

BEGIN;

CREATE FUNCTION admin_private.protect_superseded_communication_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.superseded_by IS NULL THEN RETURN NEW; END IF;
  IF NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.body_html IS DISTINCT FROM OLD.body_html
     OR NEW.recipient IS DISTINCT FROM OLD.recipient
     OR NEW.sender_address IS DISTINCT FROM OLD.sender_address
     OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
     OR NEW.customer_action_id IS DISTINCT FROM OLD.customer_action_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.template_key IS DISTINCT FROM OLD.template_key
     OR NEW.template_version IS DISTINCT FROM OLD.template_version
     OR NEW.content_version IS DISTINCT FROM OLD.content_version
     OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
     OR NEW.lifecycle IN ('REVIEWED', 'QUEUED')
  THEN
    RAISE EXCEPTION 'superseded_communication_immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.protect_superseded_communication_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER communications_protect_superseded
  BEFORE UPDATE ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.protect_superseded_communication_v1();

CREATE OR REPLACE FUNCTION public.admin_communication_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  case_status text;
  result jsonb;
BEGIN
  IF btrim(coalesce(p_operation, '')) = 'queue'
    AND p_payload IS NOT NULL
    AND jsonb_typeof(p_payload) = 'object'
    AND NULLIF(p_payload->>'communicationId', '') IS NOT NULL
  THEN
    SELECT c.status INTO case_status
      FROM public.communications m
      JOIN public.cases c ON c.id = m.case_id
      WHERE m.id = NULLIF(p_payload->>'communicationId', '')::uuid
      FOR UPDATE OF c;
    IF case_status IN ('CLOSED', 'CANCELLED') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  END IF;
  BEGIN
    result := admin_private.admin_communication_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
    RETURN result;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM IN ('closed_case_send_refused', 'superseded_communication_immutable') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    RAISE;
  END;
END;
$$;

CREATE FUNCTION public.admin_communication_revise_evidence_draft_v1(
  p_token text,
  p_request uuid,
  p_communication uuid,
  p_version integer,
  p_subject text,
  p_body text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  row public.communications;
  cs public.cases;
  req public.evidence_requests;
  action public.customer_actions;
  next_subject text;
  next_prose text;
  upload text;
  next_body text;
  next_html text;
  created public.communications;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  next_subject := btrim(coalesce(p_subject, ''));
  next_prose := btrim(coalesce(p_body, ''));
  IF p_request IS NULL OR p_communication IS NULL OR p_version IS NULL
     OR length(next_subject) NOT BETWEEN 1 AND 200
     OR length(next_prose) NOT BETWEEN 20 AND 4000
     OR next_subject ~ '[[:cntrl:]]'
     OR next_prose ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]'
     OR next_subject ~ '[<>]' OR next_prose ~ '[<>]'
     OR position('#t=' in next_subject) > 0 OR position('#t=' in next_prose) > 0
     OR next_subject ~* 'https?://' OR next_prose ~* 'https?://'
     OR next_subject ~* 'javascript:' OR next_prose ~* 'javascript:'
     OR next_subject ~* 'data:' OR next_prose ~* 'data:'
     OR next_subject ~* 'www\.' OR next_prose ~* 'www\.'
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  fp := md5(jsonb_build_array('revise_evidence_draft', p_communication, p_version, next_subject, next_prose)::text);
  cached := admin_private.communication_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  SELECT * INTO row FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF row.id IS NULL OR row.lifecycle IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.record_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF row.lifecycle <> 'DRAFT' OR row.content_locked IS TRUE
     OR row.template_key <> 'EVIDENCE_REQUEST'
     OR row.evidence_request_id IS NULL OR row.customer_action_id IS NULL
     OR row.superseded_by IS NOT NULL
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;

  SELECT * INTO cs FROM public.cases WHERE id = row.case_id FOR UPDATE;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF cs.status IN ('CLOSED', 'CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO req FROM public.evidence_requests
    WHERE id = row.evidence_request_id AND case_id = cs.id AND status = 'OPEN'
    FOR UPDATE;
  SELECT * INTO action FROM public.customer_actions
    WHERE id = row.customer_action_id AND kind = 'COMMUNICATION_ACCESS' AND status = 'OPEN'
      AND evidence_request_id = req.id AND case_id = cs.id AND expires_at > now()
    FOR UPDATE;
  IF req.id IS NULL OR action.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.communications other
    WHERE other.case_id = row.case_id AND other.template_key = 'EVIDENCE_REQUEST'
      AND other.lifecycle IS DISTINCT FROM 'CANCELLED' AND other.superseded_by IS NULL
      AND other.id <> row.id
  ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;

  upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
  IF upload IS NULL OR position('#t=' in coalesce(row.body_text, '')) > 0
     OR position('#t=' in coalesce(row.body_html, '')) > 0
     OR upload IS DISTINCT FROM 'https://' || substring(upload from 'https://([A-Za-z0-9.-]+)') || '/action/' || row.customer_action_id::text
     OR (length(row.body_text) - length(replace(row.body_text, upload, ''))) IS DISTINCT FROM length(upload)
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  next_body := next_prose || E'\n\n' || upload;
  IF length(next_body) > 5000 OR position('#t=' in next_body) > 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  next_html := '<p>' || replace(admin_private.escape_html_v1(next_body), E'\n', '<br />') || '</p>';

  INSERT INTO public.communications(
    case_id, customer_id, business_id, evidence_request_id, customer_action_id,
    channel, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version,
    author_id, content_version, record_version, content_locked, link_key_version
  ) VALUES (
    row.case_id, row.customer_id, row.business_id, row.evidence_request_id, row.customer_action_id,
    'EMAIL', row.communication_type, 'OUTBOUND', row.recipient, next_subject, next_body, next_html,
    'PENDING', 'DRAFT', 'NONE', row.template_key, row.template_version,
    actor, row.content_version + 1, 1, false, row.link_key_version
  ) RETURNING * INTO created;

  UPDATE public.communications
    SET superseded_by = created.id, updated_at = now(), record_version = record_version + 1
    WHERE id = row.id AND lifecycle = 'DRAFT' AND content_locked IS FALSE
      AND superseded_by IS NULL AND record_version = p_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revise_draft_conflict' USING ERRCODE = 'P0001';
  END IF;

  result := jsonb_build_object(
    'status', 'success', 'id', created.id, 'version', created.record_version,
    'lifecycle', 'DRAFT', 'contentVersion', created.content_version, 'supersedes', row.id
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'COMMUNICATION_CHANGED', 'success', created.id, p_request, 'communication',
    'Replaced an unlocked evidence-request draft with staff wording',
    jsonb_build_object(
      'operation', 'revise_evidence_draft', 'previousId', row.id,
      'evidenceRequestId', row.evidence_request_id, 'contentVersion', created.content_version
    )
  );
  INSERT INTO admin_private.communication_command_receipts(request_id, actor_id, fingerprint, response, created_at)
  VALUES (p_request, actor, fp, result, now());
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict');
  WHEN raise_exception THEN
    IF SQLERRM = 'revise_draft_conflict' THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_communication_revise_evidence_draft_v1(text, uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_communication_revise_evidence_draft_v1(text, uuid, uuid, integer, text, text) TO service_role;

COMMIT;
