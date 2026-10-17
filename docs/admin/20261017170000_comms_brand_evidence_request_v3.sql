-- COMMS-BRAND-01 evidence-request template, version 3.
--
-- UNAPPLIED. Do not run this against DEV or Production from the application change.
-- It is not a file under supabase/migrations and it is not part of the recovery manifest.
--
-- Version 1 and version 2 rows are not updated. Version 2 is already approved in DEV.
-- This insert is version 3 with status DRAFT. The draft command still selects
-- status = 'APPROVED' ORDER BY version DESC LIMIT 1, so version 3 is not used
-- until a separate review approves it.
--
-- Apply this only after the evidence-draft wording migration.
-- A version 3 draft stores branded HTML and plain text. The operator edits the
-- introduction and subject. The document list, button, sign-off and footer are
-- written once. The upload URL is not required to be the last line.
-- The snapshot URL has no #t= fragment. The send worker still adds the token.
--
-- Reply-To is snapshotted only from the server setting profilerelaunch.reply_to
-- or from the revise function's server argument. A browser field is not read.

BEGIN;

CREATE FUNCTION admin_private.customer_email_escape_v1(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $fn$
  SELECT replace(replace(replace(replace(replace(coalesce(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$fn$;

REVOKE ALL ON FUNCTION admin_private.customer_email_escape_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.evidence_request_introduction_v1(p_prose text, p_upload text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $fn$
DECLARE
  paragraph text;
  line text;
  cleaned text := '';
  bullets_only boolean;
BEGIN
  IF p_prose IS NULL THEN RETURN NULL; END IF;
  FOREACH paragraph IN ARRAY regexp_split_to_array(p_prose, E'\\n\\n+') LOOP
    IF p_upload IS NOT NULL AND p_upload <> '' THEN
      paragraph := replace(paragraph, p_upload, '');
    END IF;
    paragraph := btrim(paragraph);
    IF paragraph = '' THEN CONTINUE; END IF;
    IF paragraph = 'Documents requested' OR paragraph LIKE 'Documents requested' || E'\n' || '%' THEN
      EXIT;
    END IF;
    IF paragraph IN (
      'ProfileRelaunch',
      'Supporting documents',
      'Please use the secure button below to upload your documents.',
      'Upload your documents securely',
      'If you''re unsure what to provide or have any questions, simply reply to this email. We''re happy to help.',
      'If you''re unsure what to provide, you can contact our team through the ProfileRelaunch website.',
      'Kind regards,',
      'ProfileRelaunch Support Team',
      'For your security, please never share passwords, verification codes or sign-in credentials.',
      'https://profilerelaunch.com',
      'Restore visibility. Protect your reputation.'
    ) OR paragraph ~ '^Case reference:' THEN
      CONTINUE;
    END IF;
    bullets_only := paragraph <> '';
    FOREACH line IN ARRAY regexp_split_to_array(paragraph, E'\\n') LOOP
      IF btrim(line) = '' THEN CONTINUE; END IF;
      IF btrim(line) !~ '^[-•]\s+\S' THEN bullets_only := false; END IF;
    END LOOP;
    IF bullets_only THEN CONTINUE; END IF;
    cleaned := cleaned || CASE WHEN cleaned = '' THEN '' ELSE E'\n\n' END || paragraph;
  END LOOP;
  IF length(btrim(cleaned)) < 20 THEN RETURN NULL; END IF;
  RETURN cleaned;
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.evidence_request_introduction_v1(text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.evidence_request_plain_text_v1(
  p_case_ref text,
  p_items text[],
  p_upload text,
  p_prose text,
  p_content_version integer,
  p_reply boolean
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $fn$
DECLARE
  item text;
  bullets text := '';
  intro text;
  close text;
BEGIN
  IF p_case_ref IS NULL OR btrim(p_case_ref) = '' OR p_upload IS NULL OR position('#t=' in p_upload) > 0
     OR coalesce(array_length(p_items, 1), 0) NOT BETWEEN 1 AND 20 THEN
    RETURN NULL;
  END IF;
  FOREACH item IN ARRAY p_items LOOP
    IF item IS NULL OR btrim(item) = '' OR length(item) > 200 OR item ~ '[<>]' THEN RETURN NULL; END IF;
    bullets := bullets || '- ' || item || E'\n';
  END LOOP;
  IF coalesce(p_content_version, 1) <= 1 THEN
    intro := E'Hello,\n\nThank you for contacting ProfileRelaunch.\n\nWe\'re reviewing your Google Business Profile enquiry. To help us understand the issue and advise you on the next steps, could you please provide the following information?';
  ELSE
    intro := admin_private.evidence_request_introduction_v1(p_prose, p_upload);
  END IF;
  IF intro IS NULL OR btrim(intro) = '' THEN RETURN NULL; END IF;
  close := CASE WHEN p_reply
    THEN E'If you\'re unsure what to provide or have any questions, simply reply to this email. We\'re happy to help.'
    ELSE E'If you\'re unsure what to provide, you can contact our team through the ProfileRelaunch website.'
  END;
  RETURN 'ProfileRelaunch' || E'\n\nSupporting documents\n\n' || intro
    || E'\n\nDocuments requested\n' || rtrim(bullets, E'\n')
    || E'\n\nPlease use the secure button below to upload your documents.\n\nUpload your documents securely\n'
    || p_upload
    || E'\n\n' || close
    || E'\n\nKind regards,\n\nProfileRelaunch Support Team\n\nCase reference: '
    || btrim(p_case_ref)
    || E'\n\nhttps://profilerelaunch.com\n\nFor your security, please never share passwords, verification codes or sign-in credentials.';
END;
$fn$;

CREATE FUNCTION admin_private.evidence_request_html_v1(
  p_case_ref text,
  p_items text[],
  p_upload text,
  p_prose text,
  p_content_version integer,
  p_reply boolean
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $fn$
DECLARE
  item text;
  items_html text := '';
  paragraph text;
  intro text;
  body_html text := '';
  close text;
  font text := '-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif';
  paragraph_style text;
BEGIN
  intro := admin_private.evidence_request_plain_text_v1(p_case_ref, p_items, p_upload, p_prose, p_content_version, p_reply);
  IF intro IS NULL THEN RETURN NULL; END IF;
  IF coalesce(p_content_version, 1) <= 1 THEN
    intro := E'Hello,\n\nThank you for contacting ProfileRelaunch.\n\nWe\'re reviewing your Google Business Profile enquiry. To help us understand the issue and advise you on the next steps, could you please provide the following information?';
  ELSE
    intro := admin_private.evidence_request_introduction_v1(p_prose, p_upload);
  END IF;
  paragraph_style := 'margin:0 0 16px 0;font-family:' || font || ';font-size:16px;line-height:1.6;color:#10261F;';
  FOREACH item IN ARRAY p_items LOOP
    items_html := items_html || '<li style="margin:0 0 6px 0;">' || admin_private.customer_email_escape_v1(item) || '</li>';
  END LOOP;
  FOREACH paragraph IN ARRAY regexp_split_to_array(intro, E'\\n\\n+') LOOP
    paragraph := btrim(paragraph);
    IF paragraph = '' THEN CONTINUE; END IF;
    body_html := body_html || '<p style="' || paragraph_style || '">' || admin_private.customer_email_escape_v1(paragraph) || '</p>';
  END LOOP;
  close := CASE WHEN p_reply
    THEN 'If you''re unsure what to provide or have any questions, simply reply to this email. We''re happy to help.'
    ELSE 'If you''re unsure what to provide, you can contact our team through the ProfileRelaunch website.'
  END;
  body_html := body_html
    || '<h2 style="margin:0 0 8px 0;font-family:' || font || ';font-size:16px;line-height:1.4;font-weight:700;color:#10261F;">Documents requested</h2>'
    || '<ul style="margin:0 0 16px 0;padding:0 0 0 20px;font-family:' || font || ';font-size:16px;line-height:1.6;color:#10261F;">' || items_html || '</ul>'
    || '<p style="' || paragraph_style || '">Please use the secure button below to upload your documents.</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;border-collapse:collapse;"><tr><td bgcolor="#0a6e3c" style="border-radius:4px;background-color:#0a6e3c;">'
    || '<a href="' || admin_private.customer_email_escape_v1(p_upload) || '" style="display:inline-block;padding:14px 22px;font-family:' || font || ';font-size:16px;line-height:1.4;font-weight:700;color:#ffffff;background-color:#0a6e3c;text-decoration:none;">Upload your documents securely</a>'
    || '</td></tr></table>'
    || '<p style="' || paragraph_style || '">' || admin_private.customer_email_escape_v1(close) || '</p>'
    || '<p style="' || paragraph_style || '">Kind regards,</p>'
    || '<p style="' || paragraph_style || 'font-weight:700;">ProfileRelaunch Support Team</p>';
  RETURN '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Supporting documents</title>'
    || '<style>@media only screen and (max-width:620px){.email-container{width:100%!important;}.email-pad{padding-left:20px!important;padding-right:20px!important;}}</style></head>'
    || '<body style="margin:0;padding:0;background-color:#f7f8f3;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f7f8f3;border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">'
    || '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #A8B8B0;border-collapse:collapse;">'
    || '<tr><td class="email-pad" style="padding:28px 36px 8px 36px;"><img src="https://profilerelaunch.com/brand/profile-relaunch-logo.png" alt="ProfileRelaunch" width="180" height="42" style="display:block;width:180px;height:auto;max-width:100%;border:0;" />'
    || '<p style="margin:8px 0 0 0;font-family:' || font || ';font-size:16px;line-height:1.4;font-weight:700;color:#10261F;">ProfileRelaunch</p></td></tr>'
    || '<tr><td class="email-pad" style="padding:12px 36px 8px 36px;"><h1 style="margin:0;font-family:' || font || ';font-size:22px;line-height:1.35;font-weight:700;color:#10261F;">Supporting documents</h1></td></tr>'
    || '<tr><td class="email-pad" style="padding:16px 36px 8px 36px;">' || body_html || '</td></tr>'
    || '<tr><td class="email-pad" style="padding:20px 36px 28px 36px;border-top:1px solid #A8B8B0;background-color:#f7f8f3;font-family:' || font || ';">'
    || '<p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#5d6d66;">Case reference: ' || admin_private.customer_email_escape_v1(btrim(p_case_ref)) || '</p>'
    || '<p style="margin:0 0 6px 0;font-size:14px;line-height:1.5;font-weight:700;color:#10261F;">ProfileRelaunch</p>'
    || '<p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#5d6d66;">Restore visibility. Protect your reputation.</p>'
    || '<p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;"><a href="https://profilerelaunch.com" style="color:#0a6e3c;text-decoration:underline;">profilerelaunch.com</a></p>'
    || '<p style="margin:0;font-size:12px;line-height:1.5;color:#5d6d66;">For your security, please never share passwords, verification codes or sign-in credentials.</p>'
    || '</td></tr></table></td></tr></table></body></html>';
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.evidence_request_plain_text_v1(text, text[], text, text, integer, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.evidence_request_html_v1(text, text[], text, text, integer, boolean) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.brand_evidence_request_snapshot_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  title text;
  item text;
  items text[] := ARRAY[]::text[];
  upload text;
  public_ref text;
  configured text;
  branded_text text;
  branded_html text;
  wants_reply boolean;
BEGIN
  IF NEW.template_key IS DISTINCT FROM 'EVIDENCE_REQUEST' OR coalesce(NEW.template_version, 0) < 3 OR NEW.lifecycle IS DISTINCT FROM 'DRAFT' THEN
    RETURN NEW;
  END IF;
  SELECT e.title INTO title FROM public.evidence_requests e WHERE e.id = NEW.evidence_request_id;
  IF title IS NULL THEN
    RAISE EXCEPTION 'evidence_request_not_specific' USING ERRCODE = 'P0001';
  END IF;
  FOREACH item IN ARRAY regexp_split_to_array(title, '; ') LOOP
    item := btrim(item);
    IF item = '' OR length(item) > 200 OR item ~ '[<>]' OR lower(item) IN (
      'other', 'other evidence', 'other document', 'other documents', 'evidence', 'document', 'documents',
      'doc', 'docs', 'n/a', 'na', 'none', 'tbd', 'misc', 'miscellaneous', 'something else'
    ) THEN
      RAISE EXCEPTION 'evidence_request_not_specific' USING ERRCODE = 'P0001';
    END IF;
    items := array_append(items, item);
  END LOOP;
  IF coalesce(array_length(items, 1), 0) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'evidence_request_not_specific' USING ERRCODE = 'P0001';
  END IF;
  upload := substring(NEW.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
  IF upload IS NULL
     OR position('#t=' in coalesce(NEW.body_text, '')) > 0
     OR position('#t=' in coalesce(NEW.body_html, '')) > 0
     OR upload IS DISTINCT FROM 'https://' || substring(upload from 'https://([A-Za-z0-9.-]+)') || '/action/' || NEW.customer_action_id::text
     OR (length(NEW.body_text) - length(replace(NEW.body_text, upload, ''))) IS DISTINCT FROM length(upload)
  THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.public_ref INTO public_ref FROM public.cases c WHERE c.id = NEW.case_id;
  IF public_ref IS NULL OR btrim(public_ref) = '' THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  configured := nullif(btrim(coalesce(current_setting('profilerelaunch.reply_to', true), '')), '');
  IF configured IS NOT NULL THEN
    IF length(configured) <= 254 AND configured ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      NEW.reply_to_address := lower(configured);
    ELSE
      NEW.reply_to_address := NULL;
    END IF;
  ELSIF coalesce(NEW.content_version, 1) <= 1 THEN
    NEW.reply_to_address := NULL;
  END IF;
  IF coalesce(NEW.content_version, 1) <= 1 OR position(btrim(public_ref) in coalesce(NEW.subject, '')) = 0 THEN
    IF coalesce(NEW.content_version, 1) > 1
       AND btrim(coalesce(NEW.subject, '')) <> ''
       AND length(btrim(NEW.subject) || ' — ' || btrim(public_ref)) <= 200 THEN
      NEW.subject := btrim(NEW.subject) || ' — ' || btrim(public_ref);
    ELSE
      NEW.subject := 'Supporting documents for your ProfileRelaunch enquiry — ' || btrim(public_ref);
    END IF;
  END IF;
  wants_reply := NEW.reply_to_address IS NOT NULL;
  branded_text := admin_private.evidence_request_plain_text_v1(public_ref, items, upload, NEW.body_text, coalesce(NEW.content_version, 1), wants_reply);
  branded_html := admin_private.evidence_request_html_v1(public_ref, items, upload, NEW.body_text, coalesce(NEW.content_version, 1), wants_reply);
  IF branded_text IS NULL OR branded_html IS NULL
     OR position('#t=' in branded_text) > 0
     OR position('#t=' in branded_html) > 0
     OR (length(branded_text) - length(replace(branded_text, upload, ''))) IS DISTINCT FROM length(upload)
     OR (length(branded_html) - length(replace(branded_html, upload, ''))) IS DISTINCT FROM length(upload)
  THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  NEW.body_text := branded_text;
  NEW.body_html := branded_html;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.brand_evidence_request_snapshot_v1() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS communications_brand_evidence_request_v3 ON public.communications;
CREATE TRIGGER communications_brand_evidence_request_v3
  BEFORE INSERT ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.brand_evidence_request_snapshot_v1();

CREATE OR REPLACE FUNCTION public.admin_communication_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  case_status text;
  result jsonb;
  review_text text;
  review_html text;
  review_key text;
  review_upload text;
  review_html_upload text;
BEGIN
  PERFORM set_config(
    'profilerelaunch.reply_to',
    CASE
      WHEN coalesce(p_payload->>'serverReplyTo', '') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
       AND length(btrim(p_payload->>'serverReplyTo')) <= 254
      THEN lower(btrim(p_payload->>'serverReplyTo'))
      ELSE ''
    END,
    true
  );
  IF btrim(coalesce(p_operation, '')) = 'review'
    AND p_payload IS NOT NULL
    AND jsonb_typeof(p_payload) = 'object'
    AND NULLIF(p_payload->>'communicationId', '') IS NOT NULL
  THEN
    SELECT m.body_text, m.body_html, m.template_key
      INTO review_text, review_html, review_key
      FROM public.communications m
      WHERE m.id = NULLIF(p_payload->>'communicationId', '')::uuid;
    review_upload := substring(coalesce(review_text, '') from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    review_html_upload := substring(coalesce(review_html, '') from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    IF review_key = 'EVIDENCE_REQUEST' AND (
      review_text IS NULL
      OR review_html IS NULL
      OR position('#t=' in review_text) > 0
      OR position('#t=' in review_html) > 0
      OR review_html ~* '<\s*(script|iframe|object|embed)|javascript:|\son[a-z]+\s*='
      OR review_upload IS DISTINCT FROM review_html_upload
      OR (
        review_upload IS NOT NULL
        AND (
          (length(review_text) - length(replace(review_text, review_upload, ''))) IS DISTINCT FROM length(review_upload)
          OR (length(review_html) - length(replace(review_html, review_upload, ''))) IS DISTINCT FROM length(review_upload)
        )
      )
    ) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
  END IF;
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
    IF SQLERRM IN (
      'closed_case_send_refused',
      'superseded_communication_immutable',
      'evidence_request_not_specific',
      'evidence_request_link_invalid'
    ) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    RAISE;
  END;
END;
$fn$;

CREATE FUNCTION public.admin_communication_revise_evidence_draft_v1(
  p_token text,
  p_request uuid,
  p_communication uuid,
  p_version integer,
  p_subject text,
  p_body text,
  p_reply_to text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
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
  reply_to text;
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
  IF p_reply_to IS NULL THEN
    reply_to := NULL;
  ELSIF btrim(p_reply_to) = '' THEN
    reply_to := NULL;
  ELSIF length(btrim(p_reply_to)) <= 254 AND btrim(p_reply_to) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    reply_to := lower(btrim(p_reply_to));
  ELSE
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  fp := md5(jsonb_build_array('revise_evidence_draft', p_communication, p_version, next_subject, next_prose, coalesce(reply_to, ''))::text);
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
  IF p_reply_to IS NULL THEN
    reply_to := row.reply_to_address;
  END IF;

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
    author_id, content_version, record_version, content_locked, link_key_version, reply_to_address
  ) VALUES (
    row.case_id, row.customer_id, row.business_id, row.evidence_request_id, row.customer_action_id,
    'EMAIL', row.communication_type, 'OUTBOUND', row.recipient, next_subject, next_body, next_html,
    'PENDING', 'DRAFT', 'NONE', row.template_key, row.template_version,
    actor, row.content_version + 1, 1, false, row.link_key_version, reply_to
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
    IF SQLERRM IN ('evidence_request_not_specific', 'evidence_request_link_invalid') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    RAISE;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_communication_revise_evidence_draft_v1(
  p_token text,
  p_request uuid,
  p_communication uuid,
  p_version integer,
  p_subject text,
  p_body text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT public.admin_communication_revise_evidence_draft_v1(
    p_token, p_request, p_communication, p_version, p_subject, p_body, NULL::text
  );
$fn$;

REVOKE ALL ON FUNCTION public.admin_communication_revise_evidence_draft_v1(text, uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_communication_revise_evidence_draft_v1(text, uuid, uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_communication_revise_evidence_draft_v1(text, uuid, uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_communication_revise_evidence_draft_v1(text, uuid, uuid, integer, text, text, text) TO service_role;

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES (
  'EVIDENCE_REQUEST',
  3,
  'Evidence request',
  'Supporting documents for your ProfileRelaunch enquiry — {case_ref}',
  E'Hello,\n\nThank you for contacting ProfileRelaunch.\n\nWe\'re reviewing your Google Business Profile enquiry, reference {case_ref}. To help us understand the issue and advise you on the next steps, could you please provide the following information?\n\nDocuments requested\n\n{specific_document}\n\nPlease use the secure button below to upload your documents.\n\n{upload_url}',
  'DRAFT',
  'Proposed branded evidence request. Not approved. Version 2 remains the live approved template.'
);

CREATE OR REPLACE FUNCTION public.admin_case_communications_v1(p_token text, p_case uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  target public.cases;
  verified text;
  verified_suppressed boolean := false;
  total_count integer := 0;
  items jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_case IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO target FROM public.cases WHERE id = p_case;
  IF target.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;

  SELECT verified_value INTO verified
    FROM public.customer_contact_verifications
    WHERE customer_id = target.customer_id AND channel = 'email';
  SELECT EXISTS (
    SELECT 1 FROM admin_private.email_suppressions s
    WHERE s.address_normalized = admin_private.normalize_email_v1(verified)
  ) INTO verified_suppressed;

  SELECT count(*)::integer INTO total_count FROM public.communications WHERE case_id = target.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'caseId', c.case_id,
    'caseReference', target.public_ref,
    'evidenceRequestId', c.evidence_request_id,
    'communicationType', c.communication_type,
    'templateKey', c.template_key,
    'templateVersion', c.template_version,
    'lifecycle', c.lifecycle,
    'deliveryStatus', c.delivery_status,
    'legacyStatus', CASE WHEN c.lifecycle IS NULL THEN c.status ELSE NULL END,
    'recipient', c.recipient,
    'subject', c.subject,
    'bodyText', CASE WHEN position('#t=' in coalesce(c.body_text, '')) > 0 OR position('#t=' in coalesce(c.body_html, '')) > 0 THEN NULL ELSE c.body_text END,
    'bodyHtml', CASE WHEN position('#t=' in coalesce(c.body_text, '')) > 0 OR position('#t=' in coalesce(c.body_html, '')) > 0 THEN NULL ELSE c.body_html END,
    'replyToAddress', c.reply_to_address,
    'provider', c.provider,
    'providerMessageId', c.provider_message_id,
    'lastError', c.error_message,
    'contentLocked', c.content_locked,
    'contentVersion', c.content_version,
    'version', c.record_version,
    'draftedAt', c.created_at,
    'reviewedAt', c.reviewed_at,
    'queuedAt', c.queued_at,
    'firstProviderAttemptAt', c.first_provider_attempt_at,
    'providerAcceptedAt', c.provider_accepted_at,
    'deliveredAt', c.delivered_at,
    'failedAt', c.failed_at,
    'cancelledAt', c.cancelled_at,
    'supersededBy', c.superseded_by,
    'canReplace', (
      c.lifecycle IS NOT NULL
      AND c.delivery_status IN ('BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED')
      AND target.status NOT IN ('CLOSED', 'CANCELLED')
      AND verified IS NOT NULL
      AND admin_private.normalize_email_v1(verified) LIKE '%_@_%.%'
      AND admin_private.normalize_email_v1(verified) <> admin_private.normalize_email_v1(c.recipient)
      AND NOT verified_suppressed
      AND (
        c.template_key IS DISTINCT FROM 'EVIDENCE_REQUEST'
        OR EXISTS (
          SELECT 1 FROM public.evidence_requests er
          WHERE er.id = c.evidence_request_id AND er.case_id = target.id AND er.status = 'OPEN'
        )
      )
    ),
    'eventsTruncated', (
      SELECT count(*) > 24 FROM admin_private.communication_delivery_events de
      WHERE de.communication_id = c.id
    ),
    'events', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'eventType', e.event_type,
        'occurredAt', e.occurred_at,
        'summary', e.summary,
        'providerMessageId', e.provider_message_id
      ) ORDER BY e.occurred_at DESC, e.id DESC), '[]'::jsonb)
      FROM (
        SELECT * FROM admin_private.communication_delivery_events de
        WHERE de.communication_id = c.id
        ORDER BY de.occurred_at DESC, de.id DESC
        LIMIT 24
      ) e
    )
  ) ORDER BY c.updated_at DESC, c.id DESC), '[]'::jsonb) INTO items
  FROM (
    SELECT * FROM public.communications
    WHERE case_id = target.id
    ORDER BY updated_at DESC, id DESC
    LIMIT 100
  ) c;

  RETURN jsonb_build_object(
    'status', 'success',
    'complete', total_count <= 100,
    'total', total_count,
    'returned', jsonb_array_length(items),
    'verifiedEmail', verified,
    'verifiedEmailSuppressed', verified_suppressed,
    'communications', items
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_communication_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_communication_command_v1(text, uuid, text, jsonb, integer) TO service_role;

COMMIT;
