-- ADMIN-JOURNEY-03A proposed wording revision. NOT APPLIED.
-- Do not copy this file into supabase/migrations.
-- Do not apply it to DEV or Production without a separate approval.
-- The guided journey does not call this function. Step 3 still shows the
-- approved template snapshot and does not offer an editor.
--
-- Why this is separate from admin_communication_command_v1:
--   draft renders communication_templates. {specific_document} is
--   evidence_requests.title. The browser cannot supply subject or body.
--   review sets content_locked and the server sender. It does not accept
--   wording. The snapshot trigger rejects content changes after that lock.
--   queue refuses a different recipient, subject or body.
--   resend_draft re-renders the same template after a failed delivery.
-- There is no safe parameter on the current RPC for staff wording.
--
-- This proposal, once approved, would add one operation:
--   an unlocked EVIDENCE_REQUEST draft is superseded, not edited in place;
--   a new DRAFT row keeps the same evidence request and the same
--   COMMUNICATION_ACCESS action;
--   staff may supply plain-text prose only;
--   the upload URL is copied from the current snapshot and must already
--   name that action, with no #t= token;
--   recipient is copied from the current row;
--   sender stays unset until the existing review operation;
--   nothing is queued or sent.
-- Reviewed rows stay immutable. A later change is another replacement.

CREATE OR REPLACE FUNCTION public.admin_communication_revise_evidence_draft_v1(
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
  subject text;
  prose text;
  upload text;
  body text;
  html text;
  created public.communications;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  subject := btrim(coalesce(p_subject, ''));
  prose := btrim(coalesce(p_body, ''));
  IF p_request IS NULL OR p_communication IS NULL OR p_version IS NULL
     OR length(subject) NOT BETWEEN 1 AND 200
     OR length(prose) NOT BETWEEN 20 AND 4000
     OR subject ~* '<[^>]+>' OR prose ~* '<[^>]+>'
     OR position('#t=' in subject) > 0 OR position('#t=' in prose) > 0
     OR subject ~* 'https?://' OR prose ~* 'https?://'
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  fp := md5(jsonb_build_array('revise_evidence_draft', p_communication, p_version, subject, prose)::text);
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
  IF NOT EXISTS (
    SELECT 1 FROM public.evidence_requests
    WHERE id = row.evidence_request_id AND case_id = cs.id AND status = 'OPEN'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.customer_actions
    WHERE id = row.customer_action_id AND kind = 'COMMUNICATION_ACCESS' AND status = 'OPEN'
      AND evidence_request_id = row.evidence_request_id AND case_id = cs.id
  ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF EXISTS (
    SELECT 1 FROM public.communications other
    WHERE other.case_id = row.case_id AND other.template_key = 'EVIDENCE_REQUEST'
      AND other.lifecycle IS DISTINCT FROM 'CANCELLED' AND other.superseded_by IS NULL
      AND other.id <> row.id
  ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;

  upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f-]{36}');
  IF upload IS NULL OR position('#t=' in coalesce(row.body_text, '')) > 0
     OR upload <> substring(upload from 'https://[A-Za-z0-9.-]+') || '/action/' || row.customer_action_id::text
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  body := prose || E'\n\n' || upload;
  IF length(body) > 5000 OR position('#t=' in body) > 0 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  html := '<p>' || replace(admin_private.escape_html_v1(body), E'\n', '<br />') || '</p>';

  INSERT INTO public.communications(
    case_id, customer_id, business_id, evidence_request_id, customer_action_id,
    channel, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version,
    author_id, content_version, record_version, content_locked, link_key_version
  ) VALUES (
    row.case_id, row.customer_id, row.business_id, row.evidence_request_id, row.customer_action_id,
    'EMAIL', row.communication_type, 'OUTBOUND', row.recipient, subject, body, html,
    'PENDING', 'DRAFT', 'NONE', row.template_key, row.template_version,
    actor, row.content_version + 1, 1, false, row.link_key_version
  ) RETURNING * INTO created;

  UPDATE public.communications
    SET superseded_by = created.id, updated_at = now(), record_version = record_version + 1
    WHERE id = row.id AND lifecycle = 'DRAFT' AND content_locked IS FALSE AND record_version = p_version;
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
