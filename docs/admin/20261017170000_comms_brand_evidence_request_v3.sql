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
-- Apply this only after the evidence-draft wording migration. The trigger below
-- rewrites body_text and body_html on INSERT when template_version >= 3.
-- Older rows, and new drafts of version 1 or 2, are left as stored.
-- The snapshot URL has no #t= fragment. The send worker still adds the token.

BEGIN;

CREATE FUNCTION admin_private.evidence_request_plain_text_v1(
  p_case_ref text,
  p_items text[],
  p_upload text,
  p_prose text,
  p_content_version integer
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  item text;
  bullets text := '';
  intro text;
BEGIN
  IF p_case_ref IS NULL OR btrim(p_case_ref) = '' OR p_upload IS NULL OR coalesce(array_length(p_items, 1), 0) < 1 THEN
    RETURN NULL;
  END IF;
  FOREACH item IN ARRAY p_items LOOP
    bullets := bullets || '- ' || item || E'\n';
  END LOOP;
  IF coalesce(p_content_version, 1) <= 1 THEN
    intro := E'Hello,\n\nThank you for contacting ProfileRelaunch.\n\nWe\'re reviewing your Google Business Profile enquiry. To help us understand the issue and advise you on the next steps, could you please provide the following information?';
  ELSE
    intro := btrim(coalesce(p_prose, ''));
  END IF;
  RETURN btrim(intro) || E'\n\nDocuments requested\n' || btrim(bullets)
    || E'\n\nPlease use the secure button below to upload your documents.\n\nUpload your documents securely\n'
    || p_upload
    || E'\n\nIf you\'re unsure what to provide, you can contact our team through the ProfileRelaunch website.\n\nKind regards,\n\nProfileRelaunch Support Team\n\nCase reference: '
    || btrim(p_case_ref)
    || E'\nhttps://profilerelaunch.com\nFor your security, please never share passwords, verification codes or sign-in credentials.';
END;
$$;

CREATE FUNCTION admin_private.evidence_request_html_v1(
  p_case_ref text,
  p_items text[],
  p_upload text,
  p_prose text,
  p_content_version integer
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  item text;
  items_html text := '';
  paragraph text;
  source text;
  body_html text := '';
BEGIN
  IF admin_private.evidence_request_plain_text_v1(p_case_ref, p_items, p_upload, p_prose, p_content_version) IS NULL
     OR position('#t=' in p_upload) > 0 THEN
    RETURN NULL;
  END IF;
  FOREACH item IN ARRAY p_items LOOP
    items_html := items_html || '<li style="margin:0 0 6px 0;">' || admin_private.escape_html_v1(item) || '</li>';
  END LOOP;
  IF coalesce(p_content_version, 1) <= 1 THEN
    source := E'Hello,\n\nThank you for contacting ProfileRelaunch.\n\nWe\'re reviewing your Google Business Profile enquiry. To help us understand the issue and advise you on the next steps, could you please provide the following information?';
  ELSE
    source := btrim(coalesce(p_prose, ''));
  END IF;
  FOREACH paragraph IN ARRAY regexp_split_to_array(source, E'\\n\\n+') LOOP
    paragraph := btrim(paragraph);
    IF paragraph = '' THEN CONTINUE; END IF;
    body_html := body_html || '<p style="margin:0 0 16px 0;font-family:-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.6;color:#10261F;">'
      || admin_private.escape_html_v1(paragraph) || '</p>';
  END LOOP;
  body_html := body_html
    || '<h2 style="margin:0 0 8px 0;font-size:16px;color:#10261F;">Documents requested</h2><ul style="margin:0 0 16px 0;padding:0 0 0 20px;">' || items_html || '</ul>'
    || '<p style="margin:0 0 16px 0;font-family:-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.6;color:#10261F;">Please use the secure button below to upload your documents.</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#0a6e3c" style="background-color:#0a6e3c;border-radius:4px;">'
    || '<a href="' || admin_private.escape_html_v1(p_upload) || '" style="display:inline-block;padding:14px 22px;font-weight:700;color:#ffffff;background-color:#0a6e3c;text-decoration:none;">Upload your documents securely</a>'
    || '</td></tr></table>'
    || '<p style="margin:16px 0;font-family:-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.6;color:#10261F;">If you''re unsure what to provide, you can contact our team through the ProfileRelaunch website.</p>'
    || '<p style="margin:0 0 16px 0;font-family:-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.6;color:#10261F;">Kind regards,</p>'
    || '<p style="margin:0 0 16px 0;font-family:-apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, Helvetica, Arial, sans-serif;font-size:16px;line-height:1.6;font-weight:700;color:#10261F;">ProfileRelaunch Support Team</p>';
  RETURN '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Supporting documents</title>'
    || '<style>@media only screen and (max-width:620px){.email-container{width:100%!important;}.email-pad{padding-left:20px!important;padding-right:20px!important;}}</style></head>'
    || '<body style="margin:0;padding:0;background-color:#f7f8f3;">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f7f8f3;border-collapse:collapse;"><tr><td align="center" style="padding:24px 12px;">'
    || '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #A8B8B0;border-collapse:collapse;">'
    || '<tr><td class="email-pad" style="padding:28px 36px 8px 36px;"><img src="https://profilerelaunch.com/brand/profile-relaunch-logo.png" alt="ProfileRelaunch" width="180" height="42" style="display:block;width:180px;height:auto;max-width:100%;border:0;" />'
    || '<p style="margin:8px 0 0 0;font-weight:700;color:#10261F;">ProfileRelaunch</p></td></tr>'
    || '<tr><td class="email-pad" style="padding:12px 36px 8px 36px;"><h1 style="margin:0;font-size:22px;line-height:1.35;color:#10261F;">Supporting documents</h1></td></tr>'
    || '<tr><td class="email-pad" style="padding:16px 36px 8px 36px;">' || body_html || '</td></tr>'
    || '<tr><td class="email-pad" style="padding:20px 36px 28px 36px;border-top:1px solid #A8B8B0;background-color:#f7f8f3;">'
    || '<p style="margin:0 0 6px 0;font-size:13px;color:#5d6d66;">Case reference: ' || admin_private.escape_html_v1(btrim(p_case_ref)) || '</p>'
    || '<p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:#10261F;">ProfileRelaunch</p>'
    || '<p style="margin:0 0 8px 0;font-size:13px;"><a href="https://profilerelaunch.com" style="color:#0a6e3c;">profilerelaunch.com</a></p>'
    || '<p style="margin:0;font-size:12px;color:#5d6d66;">For your security, please never share passwords, verification codes or sign-in credentials.</p>'
    || '</td></tr></table></td></tr></table></body></html>';
END;
$$;

REVOKE ALL ON FUNCTION admin_private.evidence_request_plain_text_v1(text, text[], text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.evidence_request_html_v1(text, text[], text, text, integer) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.brand_evidence_request_snapshot_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  title text;
  item text;
  items text[] := ARRAY[]::text[];
  upload text;
  public_ref text;
  prose text;
  branded_text text;
  branded_html text;
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
    IF item = '' OR lower(item) IN (
      'other', 'other evidence', 'other document', 'other documents', 'evidence', 'document', 'documents',
      'doc', 'docs', 'n/a', 'na', 'none', 'tbd', 'misc', 'miscellaneous', 'something else'
    ) THEN
      RAISE EXCEPTION 'evidence_request_not_specific' USING ERRCODE = 'P0001';
    END IF;
    items := array_append(items, item);
  END LOOP;
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
  prose := btrim(regexp_replace(coalesce(NEW.body_text, ''), E'\\s*' || upload || E'\\s*$', ''));
  branded_text := admin_private.evidence_request_plain_text_v1(public_ref, items, upload, prose, coalesce(NEW.content_version, 1));
  branded_html := admin_private.evidence_request_html_v1(public_ref, items, upload, prose, coalesce(NEW.content_version, 1));
  IF branded_text IS NULL OR branded_html IS NULL
     OR position('#t=' in branded_text) > 0
     OR position('#t=' in branded_html) > 0
  THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF public_ref IS NULL OR btrim(public_ref) = '' THEN
    RAISE EXCEPTION 'evidence_request_link_invalid' USING ERRCODE = 'P0001';
  END IF;
  -- A new draft uses the preferred subject. A later plain-text edit keeps the
  -- subject the operator saved when that subject already names the case.
  IF coalesce(NEW.content_version, 1) <= 1 OR position(btrim(public_ref) in coalesce(NEW.subject, '')) = 0 THEN
    IF coalesce(NEW.content_version, 1) > 1
       AND btrim(coalesce(NEW.subject, '')) <> ''
       AND length(btrim(NEW.subject) || ' — ' || btrim(public_ref)) <= 200 THEN
      NEW.subject := btrim(NEW.subject) || ' — ' || btrim(public_ref);
    ELSE
      NEW.subject := 'Supporting documents for your ProfileRelaunch enquiry — ' || btrim(public_ref);
    END IF;
  END IF;
  NEW.body_text := branded_text;
  NEW.body_html := branded_html;
  NEW.reply_to_address := NULL;
  RETURN NEW;
END;
$$;

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
$$;

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

REVOKE ALL ON FUNCTION public.admin_communication_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_communication_command_v1(text, uuid, text, jsonb, integer) TO service_role;

COMMIT;
