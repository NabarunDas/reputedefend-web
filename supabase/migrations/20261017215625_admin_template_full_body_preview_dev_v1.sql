-- ADMIN-TEMPLATE-PREVIEW-01 (DEV ONLY; NOT APPLIED)
-- Existing admin_template_list_v1 verifies a staff session before calling
-- this private serializer. The new body field returns immutable saved template
-- wording, not customer-specific or secret upload links.
-- No template row, status, approval record or communication is changed.
-- Do not deploy this to Production as part of the unfinished Admin journey.
BEGIN;
CREATE OR REPLACE FUNCTION admin_private.template_public_json_v1(p admin_private.communication_templates)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', p.id,
    'key', p.template_key,
    'templateKey', p.template_key,
    'version', p.version,
    'name', p.name,
    'subject', p.subject_template,
    'body', p.body_text_template,
    'status', p.status,
    'approvalSource', p.approval_source,
    'recordVersion', p.record_version,
    'createdAt', p.created_at,
    'approvedAt', p.approved_at,
    'retiredAt', p.retired_at
  ) END;
$function$;

REVOKE ALL ON FUNCTION admin_private.template_public_json_v1(admin_private.communication_templates)
  FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
