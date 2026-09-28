BEGIN;

-- Step 9B1: CASE_ACCESS actions + explicit prepared-pack publication + customer read-only pack view.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'customer_actions' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%AGREEMENT_ACCEPTANCE%'
      AND pg_get_constraintdef(c.oid) LIKE '%AUTHORIZATION_REVOCATION%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%agreement_version_id%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%CASE_ACCESS%'
  LOOP
    EXECUTE format('ALTER TABLE public.customer_actions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.customer_actions
  ADD CONSTRAINT customer_actions_kind_check
  CHECK (kind IN ('AGREEMENT_ACCEPTANCE','AUTHORIZATION_REVOCATION','CASE_ACCESS'));

ALTER TABLE public.customer_actions
  ADD CONSTRAINT customer_actions_case_access_scope_check
  CHECK (
    kind <> 'CASE_ACCESS'
    OR (
      agreement_version_id IS NULL
      AND authorization_id IS NULL
      AND case_id IS NOT NULL
      AND customer_id IS NOT NULL
      AND business_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX customer_actions_one_open_case_access_idx
  ON public.customer_actions(case_id)
  WHERE status = 'OPEN' AND kind = 'CASE_ACCESS';

CREATE OR REPLACE FUNCTION admin_private.validate_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.agreement_versions; auth public.authorization_records; c public.customers; cs public.cases;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO c FROM public.customers WHERE id = NEW.customer_id;
    IF c.id IS NULL OR lower(NEW.expected_email_snapshot) IS DISTINCT FROM lower(c.email) THEN
      RAISE EXCEPTION 'Customer action email snapshot does not match the current customer email';
    END IF;
  END IF;
  IF NEW.kind = 'AGREEMENT_ACCEPTANCE' THEN
    IF NEW.agreement_version_id IS NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Agreement acceptance actions require an agreement version and no authorisation';
    END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = NEW.agreement_version_id;
    IF v.id IS NULL
      OR v.case_id IS DISTINCT FROM NEW.case_id
      OR v.customer_id IS DISTINCT FROM NEW.customer_id
      OR v.business_id IS DISTINCT FROM NEW.business_id
      OR v.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced agreement'; END IF;
  ELSIF NEW.kind = 'AUTHORIZATION_REVOCATION' THEN
    IF NEW.authorization_id IS NULL OR NEW.agreement_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'Authorisation revocation actions require an authorisation and no agreement version';
    END IF;
    SELECT * INTO auth FROM public.authorization_records WHERE id = NEW.authorization_id;
    IF auth.id IS NULL
      OR auth.case_id IS DISTINCT FROM NEW.case_id
      OR auth.customer_id IS DISTINCT FROM NEW.customer_id
      OR auth.business_id IS DISTINCT FROM NEW.business_id
      OR auth.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced authorisation'; END IF;
  ELSIF NEW.kind = 'CASE_ACCESS' THEN
    IF NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL OR NEW.case_id IS NULL THEN
      RAISE EXCEPTION 'Case access actions require a case and no agreement or authorisation';
    END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NEW.case_id;
    IF cs.id IS NULL
      OR cs.customer_id IS DISTINCT FROM NEW.customer_id
      OR cs.business_id IS DISTINCT FROM NEW.business_id
      OR cs.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced case'; END IF;
    IF TG_OP = 'INSERT' AND cs.status IN ('CLOSED','CANCELLED') THEN
      RAISE EXCEPTION 'Case access cannot be created for a closed case';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid customer action kind';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION admin_private.validate_customer_action_scope_v1() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.case_prepared_packs
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid,
  ADD COLUMN publication_note text NOT NULL DEFAULT '',
  ADD COLUMN unpublished_at timestamptz,
  ADD COLUMN unpublished_by uuid,
  ADD COLUMN unpublished_reason text NOT NULL DEFAULT '';

ALTER TABLE public.case_prepared_packs
  ADD CONSTRAINT case_prepared_packs_publication_check CHECK (
    (published_at IS NULL AND unpublished_at IS NULL AND published_by IS NULL AND unpublished_by IS NULL
      AND publication_note = '' AND unpublished_reason = '')
    OR (published_at IS NOT NULL AND published_by IS NOT NULL AND length(btrim(publication_note)) BETWEEN 10 AND 2000)
  );

ALTER TABLE public.case_prepared_packs
  ADD CONSTRAINT case_prepared_packs_unpublish_check CHECK (
    unpublished_at IS NULL
    OR (published_at IS NOT NULL AND unpublished_by IS NOT NULL AND length(btrim(unpublished_reason)) BETWEEN 10 AND 2000)
  );

ALTER TABLE public.case_prepared_packs
  ADD CONSTRAINT case_prepared_packs_published_approved_check CHECK (
    published_at IS NULL OR unpublished_at IS NOT NULL OR status = 'APPROVED'
  );

CREATE UNIQUE INDEX case_prepared_packs_one_published_idx
  ON public.case_prepared_packs(case_id)
  WHERE published_at IS NOT NULL AND unpublished_at IS NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'case_prepared_pack_events' AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%PACK_CREATED%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%PACK_PUBLISHED%'
  LOOP
    EXECUTE format('ALTER TABLE public.case_prepared_pack_events DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.case_prepared_pack_events
  ADD CONSTRAINT case_prepared_pack_events_event_check CHECK (event IN (
    'PACK_CREATED','ITEM_ADDED','ITEM_REMOVED','ITEM_MOVED','PACK_APPROVED','PACK_STALE','PACK_SUPERSEDED',
    'PACK_PUBLISHED','PACK_UNPUBLISHED'
  ));

CREATE TABLE admin_private.customer_pack_access_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_private.customer_pack_access_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.customer_pack_access_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.customer_pack_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.customer_pack_access_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.customer_pack_access_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.customer_pack_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.pack_currently_published_v1(p_pack public.case_prepared_packs) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_pack.published_at IS NOT NULL AND p_pack.unpublished_at IS NULL AND p_pack.status = 'APPROVED';
$$;
REVOKE ALL ON FUNCTION admin_private.pack_currently_published_v1(public.case_prepared_packs) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.pack_publishable_v1(p_pack uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE p public.case_prepared_packs; item_count integer;
BEGIN
  IF p_pack IS NULL THEN RETURN false; END IF;
  SELECT * INTO p FROM public.case_prepared_packs WHERE id = p_pack;
  IF p.id IS NULL OR p.status <> 'APPROVED' THEN RETURN false; END IF;
  SELECT count(*)::int INTO item_count FROM public.case_prepared_pack_items WHERE pack_id = p.id;
  IF item_count < 1 THEN RETURN false; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.case_prepared_pack_items i
    INNER JOIN public.case_document_versions v ON v.id = i.version_id
    INNER JOIN public.case_documents d ON d.id = i.document_id
    WHERE i.pack_id = p.id AND (
      d.case_id <> p.case_id OR v.document_id <> d.id
      OR v.upload_status <> 'UPLOADED' OR v.scan_status <> 'NO_THREATS_FOUND'
      OR v.validation_status <> 'VALID' OR v.review_status <> 'ACCEPTED'
      OR v.customer_visible IS DISTINCT FROM true
    )
  );
END; $$;
REVOKE ALL ON FUNCTION admin_private.pack_publishable_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.revoke_case_access_action_v1(p_action uuid, p_reason text, p_details jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions; reason text; details jsonb;
BEGIN
  reason := btrim(coalesce(p_reason, ''));
  IF p_action IS NULL OR length(reason) NOT BETWEEN 10 AND 2000 THEN RETURN false; END IF;
  SELECT * INTO a FROM public.customer_actions
    WHERE id = p_action AND kind = 'CASE_ACCESS' AND status = 'OPEN'
    FOR UPDATE;
  IF a.id IS NULL THEN RETURN false; END IF;
  UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id RETURNING * INTO a;
  details := coalesce(p_details, '{}'::jsonb) || jsonb_build_object('reason', left(reason, 200), 'kind', 'CASE_ACCESS');
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'SYSTEM', NULL, 'ACTION_REVOKED', details);
  DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
  DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION admin_private.revoke_case_access_action_v1(uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.revoke_case_access_on_case_status_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions; reason text; source text;
BEGIN
  IF NEW.status = 'CANCELLED' THEN
    source := 'CASE_CANCELLED';
    reason := 'The case was cancelled.';
  ELSE
    source := 'CASE_CLOSED';
    reason := 'The case was closed.';
  END IF;
  FOR a IN
    SELECT * FROM public.customer_actions
    WHERE case_id = NEW.id AND kind = 'CASE_ACCESS' AND status = 'OPEN'
    FOR UPDATE
  LOOP
    PERFORM admin_private.revoke_case_access_action_v1(a.id, reason, jsonb_build_object('source', source));
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER cases_revoke_case_access
  AFTER UPDATE OF status ON public.cases
  FOR EACH ROW
  WHEN (NEW.status IN ('CLOSED','CANCELLED') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION admin_private.revoke_case_access_on_case_status_v1();
REVOKE ALL ON FUNCTION admin_private.revoke_case_access_on_case_status_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.end_pack_publication_v1(p_pack uuid, p_actor uuid, p_reason text, p_details jsonb)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.case_prepared_packs; reason text;
BEGIN
  reason := btrim(coalesce(p_reason, ''));
  IF p_pack IS NULL OR p_actor IS NULL OR length(reason) NOT BETWEEN 10 AND 2000 THEN RETURN false; END IF;
  UPDATE public.case_prepared_packs
    SET unpublished_at = now(), unpublished_by = p_actor, unpublished_reason = reason
    WHERE id = p_pack AND published_at IS NOT NULL AND unpublished_at IS NULL
    RETURNING * INTO p;
  IF p.id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
  VALUES (
    p.case_id, p.id, p_actor, 'PACK_UNPUBLISHED',
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object('reason', left(reason, 200))
  );
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION admin_private.end_pack_publication_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.stale_approved_packs_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid; pack public.case_prepared_packs;
BEGIN
  IF NEW.upload_status = 'UPLOADED' AND NEW.scan_status = 'NO_THREATS_FOUND' AND NEW.validation_status = 'VALID' AND NEW.review_status = 'ACCEPTED' THEN
    RETURN NEW;
  END IF;
  SELECT auth_user_id INTO actor FROM public.admin_identity WHERE singleton LIMIT 1;
  IF actor IS NULL THEN actor := NEW.created_by; END IF;
  FOR pack IN
    SELECT * FROM public.case_prepared_packs p
    WHERE p.status = 'APPROVED'
      AND EXISTS (SELECT 1 FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id AND i.version_id = NEW.id)
    FOR UPDATE
  LOOP
    PERFORM admin_private.end_pack_publication_v1(
      pack.id, actor, 'Included evidence is no longer eligible for customer access.',
      jsonb_build_object(
        'source', 'AUTO',
        'versionId', NEW.id,
        'scanStatus', NEW.scan_status,
        'validationStatus', NEW.validation_status,
        'reviewStatus', NEW.review_status
      )
    );
    UPDATE public.case_prepared_packs SET status = 'STALE' WHERE id = pack.id AND status = 'APPROVED';
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (
      pack.case_id, pack.id, actor, 'PACK_STALE',
      jsonb_build_object(
        'versionId', NEW.id,
        'scanStatus', NEW.scan_status,
        'validationStatus', NEW.validation_status,
        'reviewStatus', NEW.review_status
      )
    );
  END LOOP;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION admin_private.stale_approved_packs_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.unpublish_on_visibility_loss_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid; pack public.case_prepared_packs;
BEGIN
  IF NEW.customer_visible IS NOT DISTINCT FROM false THEN
    SELECT auth_user_id INTO actor FROM public.admin_identity WHERE singleton LIMIT 1;
    IF actor IS NULL THEN actor := NEW.created_by; END IF;
    FOR pack IN
      SELECT * FROM public.case_prepared_packs p
      WHERE p.published_at IS NOT NULL AND p.unpublished_at IS NULL
        AND EXISTS (SELECT 1 FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id AND i.version_id = NEW.id)
      FOR UPDATE
    LOOP
      PERFORM admin_private.end_pack_publication_v1(
        pack.id, actor, 'An included version is no longer customer-visible.',
        jsonb_build_object('source', 'AUTO', 'versionId', NEW.id, 'customerVisible', false)
      );
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER case_document_versions_unpublish_on_visibility
  AFTER UPDATE OF customer_visible ON public.case_document_versions
  FOR EACH ROW
  WHEN (OLD.customer_visible IS DISTINCT FROM NEW.customer_visible AND NEW.customer_visible = false)
  EXECUTE FUNCTION admin_private.unpublish_on_visibility_loss_v1();
REVOKE ALL ON FUNCTION admin_private.unpublish_on_visibility_loss_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_authorization_command_v1(
  p_token text, p_request uuid, p_case uuid, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; cs public.cases; c public.customers; loc public.locations; fp text; cached jsonb; result jsonb;
  data jsonb; p_kind text; title text; body text; scope text; expires timestamptz; next_no integer;
  v public.agreement_versions; a public.customer_actions; auth public.authorization_records; note text; secret text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL
    OR p_operation NOT IN ('create_agreement_action','revoke_action','create_revocation_action','admin_revoke_authorization','create_case_access_action')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 65536
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  secret := data->>'secretHash';
  data := data - 'secretHash';
  fp := md5(jsonb_build_array(p_case, p_operation, data)::text);
  cached := admin_private.authz_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = p_case FOR UPDATE;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF cs.status IN ('CLOSED','CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO c FROM public.customers WHERE id = cs.customer_id;
  IF p_operation = 'create_agreement_action' THEN
    p_kind := data->>'kind';
    title := btrim(coalesce(data->>'title', ''));
    body := btrim(coalesce(data->>'bodyText', ''));
    scope := btrim(coalesce(data->>'scopeText', ''));
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF p_kind IS NULL OR p_kind NOT IN ('SERVICE_AGREEMENT','CASE_MANAGEMENT_PERMISSION')
      OR length(title) NOT BETWEEN 1 AND 200 OR length(body) NOT BETWEEN 20 AND 50000 OR length(scope) NOT BETWEEN 10 AND 5000
      OR expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF p_kind = 'CASE_MANAGEMENT_PERMISSION' AND cs.service_track IS DISTINCT FROM 'MANAGED' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF cs.location_id IS NOT NULL THEN
      SELECT * INTO loc FROM public.locations WHERE id = cs.location_id;
      IF loc.id IS NULL OR loc.business_id <> cs.business_id THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.customer_actions x
      WHERE x.case_id = cs.id AND x.kind = 'AGREEMENT_ACCEPTANCE' AND x.status = 'OPEN'
        AND x.agreement_version_id IN (SELECT id FROM public.agreement_versions WHERE case_id = cs.id AND agreement_kind = p_kind)
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    SELECT coalesce(max(version_number), 0) + 1 INTO next_no FROM public.agreement_versions WHERE case_id = cs.id AND agreement_kind = p_kind;
    INSERT INTO public.agreement_versions(case_id, customer_id, business_id, location_id, agreement_kind, version_number, title, body_text, scope_text, content_hash, created_by)
    VALUES (cs.id, cs.customer_id, cs.business_id, cs.location_id, p_kind, next_no, title, body, scope,
      admin_private.agreement_content_hash_v1(p_kind, title, body, scope), actor)
    RETURNING * INTO v;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, agreement_version_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, v.id, 'AGREEMENT_ACCEPTANCE', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind, 'agreementKind', p_kind, 'versionNumber', v.version_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer agreement action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id, 'kind', p_kind));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'agreementVersionId', v.id, 'versionNumber', v.version_number, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'revoke_action' THEN
    IF jsonb_typeof(data->'actionId') <> 'string' OR data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'reason', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN SELECT * INTO a FROM public.customer_actions WHERE id = (data->>'actionId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF a.id IS NULL OR a.case_id IS DISTINCT FROM cs.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF a.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_REVOKED', jsonb_build_object('source', 'ADMIN', 'reason', left(note, 200)));
    DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
    DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer action revoked',
      jsonb_build_object('operation', p_operation, 'actionId', a.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'actionStatus', a.status);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'create_revocation_action' THEN
    IF jsonb_typeof(data->'authorizationId') <> 'string' OR secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN SELECT * INTO auth FROM public.authorization_records WHERE id = (data->>'authorizationId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM cs.id OR auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, authorization_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, auth.id, 'AUTHORIZATION_REVOCATION', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind, 'authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Authorization revocation action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'create_case_access_action' THEN
    IF (data - 'expiresAt') <> '{}'::jsonb OR secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF c.id IS NULL OR lower(c.email) = 'admin@profilerelaunch.com' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT admin_private.contact_verified_v1(cs.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = cs.customer_id AND m.business_id = cs.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF cs.location_id IS NOT NULL THEN
      SELECT * INTO loc FROM public.locations WHERE id = cs.location_id;
      IF loc.id IS NULL OR loc.business_id <> cs.business_id THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    END IF;
    SELECT * INTO a FROM public.customer_actions
      WHERE case_id = cs.id AND kind = 'CASE_ACCESS' AND status = 'OPEN'
      FOR UPDATE;
    IF a.id IS NOT NULL THEN
      IF a.expires_at > now() THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
      IF NOT admin_private.revoke_case_access_action_v1(
        a.id,
        'The previous case-access capability expired.',
        jsonb_build_object('source', 'ACTION_EXPIRED')
      ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    END IF;
    INSERT INTO public.customer_actions(customer_id, business_id, location_id, case_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by)
    VALUES (cs.customer_id, cs.business_id, cs.location_id, cs.id, 'CASE_ACCESS', secret, lower(c.email), expires, actor)
    RETURNING * INTO a;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, cs.id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', a.kind));
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Customer case-access action created',
      jsonb_build_object('operation', p_operation, 'actionId', a.id));
    result := jsonb_build_object('status', 'success', 'id', a.id, 'expiresAt', a.expires_at);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result || jsonb_build_object('replay', false);
  END IF;

  IF p_operation = 'admin_revoke_authorization' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    IF jsonb_typeof(data->'authorizationId') <> 'string' OR data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'reason', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT (data ? 'recordVersion') OR jsonb_typeof(data->'recordVersion') <> 'number'
      OR (data->>'recordVersion') ~ '\.' OR (data->>'recordVersion')::integer < 1 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    BEGIN SELECT * INTO auth FROM public.authorization_records WHERE id = (data->>'authorizationId')::uuid FOR UPDATE;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM cs.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF (data->>'recordVersion')::integer IS DISTINCT FROM auth.record_version THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    IF auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.authorization_records
      SET status = 'REVOKED', revoked_at = now(), revoked_by = actor, revocation_reason = note
      WHERE id = auth.id RETURNING * INTO auth;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, cs.id, 'ADMIN', actor, 'AUTHORIZATION_REVOKED', jsonb_build_object('source', 'ADMIN_RECORDED_REVOCATION'));
    PERFORM admin_private.revoke_open_customer_actions_v1(cs.customer_id, cs.business_id, 'Related authorization was revoked.');
    PERFORM admin_private.write_record_audit_v1(actor, 'AUTHORIZATION_CHANGED', 'success', cs.id, p_request, 'case', 'Authorization revoked by Admin',
      jsonb_build_object('operation', p_operation, 'authorizationId', auth.id));
    result := jsonb_build_object('status', 'success', 'id', auth.id, 'authorizationStatus', auth.status, 'recordVersion', auth.record_version);
    INSERT INTO admin_private.authorization_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  RETURN jsonb_build_object('status', 'invalid');
END; $$;
REVOKE ALL ON FUNCTION public.admin_authorization_command_v1(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_authorization_command_v1(text, uuid, uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_prepared_pack_command_v1(
  p_token text, p_request uuid, p_case uuid, p_pack uuid, p_version integer, p_operation text, p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; c public.cases; p public.case_prepared_packs; actor uuid; fp text; cached jsonb; result jsonb;
  data jsonb; target_version uuid; item public.case_prepared_pack_items; doc public.case_documents; ver public.case_document_versions;
  next_no integer; next_pos integer; item_count integer; old_pos integer; new_pos integer; note text;
  prev public.case_prepared_packs; ids uuid[]; idx integer; n integer; i integer;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create','add_item','remove_item','move_item','approve','publish','unpublish')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_case, p_pack, p_version, p_operation, data)::text);
  cached := admin_private.pack_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF c.status IN ('CLOSED','CANCELLED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;

  IF p_operation = 'create' THEN
    IF p_pack IS NOT NULL OR p_version IS NOT NULL OR data <> '{}'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (SELECT 1 FROM public.case_prepared_packs WHERE case_id = c.id AND status = 'DRAFT') THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    SELECT coalesce(max(pack_number), 0) + 1 INTO next_no FROM public.case_prepared_packs WHERE case_id = c.id;
    INSERT INTO public.case_prepared_packs(case_id, pack_number, status, created_by)
    VALUES (c.id, next_no, 'DRAFT', actor) RETURNING * INTO p;
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (c.id, p.id, actor, 'PACK_CREATED', jsonb_build_object('packNumber', p.pack_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack created',
      jsonb_build_object('operation', 'create', 'packId', p.id, 'packNumber', p.pack_number));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packNumber', p.pack_number, 'packStatus', p.status, 'recordVersion', p.record_version);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_pack IS NULL OR p_version IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO p FROM public.case_prepared_packs WHERE id = p_pack FOR UPDATE;
  IF p.id IS NULL OR p.case_id <> c.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p.record_version <> p_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  IF p_operation = 'publish' THEN
    IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'note', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF (data - 'confirmed' - 'note') <> '{}'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.pack_publishable_v1(p.id) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.case_prepared_packs x
      WHERE x.case_id = c.id AND x.id <> p.id AND x.published_at IS NOT NULL AND x.unpublished_at IS NULL
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    UPDATE public.case_prepared_packs
      SET published_at = now(), published_by = actor, publication_note = note,
          unpublished_at = NULL, unpublished_by = NULL, unpublished_reason = ''
      WHERE id = p.id RETURNING * INTO p;
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (c.id, p.id, actor, 'PACK_PUBLISHED', jsonb_build_object('packNumber', p.pack_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack published for customer case access',
      jsonb_build_object('operation', 'publish', 'packId', p.id, 'packNumber', p.pack_number));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packNumber', p.pack_number, 'packStatus', p.status, 'recordVersion', p.record_version, 'published', true);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'unpublish' THEN
    IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'reason', data->>'note', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.end_pack_publication_v1(p.id, actor, note, jsonb_build_object('source', 'ADMIN')) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO p FROM public.case_prepared_packs WHERE id = p.id;
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack unpublished',
      jsonb_build_object('operation', 'unpublish', 'packId', p.id, 'packNumber', p.pack_number));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packNumber', p.pack_number, 'packStatus', p.status, 'recordVersion', p.record_version, 'published', false);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;

  IF p_operation = 'add_item' THEN
    IF data ?| ARRAY['documentTitle','originalFilename','contentType','sizeBytes','storageKey','storageBucket','url']
      OR jsonb_typeof(data->'versionId') <> 'string'
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN target_version := (data->>'versionId')::uuid; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF NOT admin_private.pack_version_eligible_v1(target_version, c.id) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF EXISTS (SELECT 1 FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id AND i.version_id = target_version) THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    SELECT * INTO ver FROM public.case_document_versions WHERE id = target_version;
    SELECT * INTO doc FROM public.case_documents WHERE id = ver.document_id;
    SELECT coalesce(max(position), 0) + 1 INTO next_pos FROM public.case_prepared_pack_items WHERE pack_id = p.id;
    INSERT INTO public.case_prepared_pack_items(
      pack_id, document_id, version_id, position, document_title, original_filename, content_type, size_bytes, added_by
    ) VALUES (
      p.id, doc.id, ver.id, next_pos, doc.title, ver.original_filename, ver.declared_content_type, ver.declared_size_bytes, actor
    ) RETURNING * INTO item;
    UPDATE public.case_prepared_packs SET updated_at = now() WHERE id = p.id RETURNING * INTO p;
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (c.id, p.id, actor, 'ITEM_ADDED', jsonb_build_object('versionId', ver.id, 'documentId', doc.id, 'position', item.position));
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack item added',
      jsonb_build_object('operation', 'add_item', 'packId', p.id, 'versionId', ver.id, 'documentId', doc.id));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'itemId', item.id, 'packStatus', p.status, 'recordVersion', p.record_version);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'remove_item' THEN
    IF jsonb_typeof(data->'versionId') <> 'string' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN target_version := (data->>'versionId')::uuid; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    SELECT * INTO item FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id AND i.version_id = target_version;
    IF item.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    DELETE FROM public.case_prepared_pack_items WHERE id = item.id;
    UPDATE public.case_prepared_pack_items SET position = position + 100000 WHERE pack_id = p.id;
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY position) AS n FROM public.case_prepared_pack_items WHERE pack_id = p.id
    )
    UPDATE public.case_prepared_pack_items i SET position = ordered.n FROM ordered WHERE i.id = ordered.id;
    UPDATE public.case_prepared_packs SET updated_at = now() WHERE id = p.id RETURNING * INTO p;
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (c.id, p.id, actor, 'ITEM_REMOVED', jsonb_build_object('versionId', item.version_id, 'documentId', item.document_id, 'position', item.position));
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack item removed',
      jsonb_build_object('operation', 'remove_item', 'packId', p.id, 'versionId', item.version_id));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packStatus', p.status, 'recordVersion', p.record_version);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'move_item' THEN
    IF jsonb_typeof(data->'versionId') <> 'string' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN target_version := (data->>'versionId')::uuid; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    SELECT * INTO item FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id AND i.version_id = target_version;
    IF item.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    SELECT count(*)::int INTO n FROM public.case_prepared_pack_items WHERE pack_id = p.id;
    old_pos := item.position;
    IF jsonb_typeof(data->'position') = 'number' THEN
      new_pos := (data->>'position')::integer;
    ELSIF data->>'direction' = 'up' THEN
      new_pos := greatest(1, old_pos - 1);
    ELSIF data->>'direction' = 'down' THEN
      new_pos := least(n, old_pos + 1);
    ELSE
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF new_pos < 1 OR new_pos > n THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF new_pos <> old_pos THEN
      SELECT array_agg(i.version_id ORDER BY i.position) INTO ids FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id;
      idx := array_position(ids, target_version);
      ids := ids[1:idx-1] || ids[idx+1:n];
      IF new_pos = 1 THEN ids := ARRAY[target_version] || ids;
      ELSIF new_pos > coalesce(array_length(ids, 1), 0) THEN ids := ids || target_version;
      ELSE ids := ids[1:new_pos-1] || target_version || ids[new_pos:array_length(ids, 1)];
      END IF;
      UPDATE public.case_prepared_pack_items SET position = position + 100000 WHERE pack_id = p.id;
      FOR i IN 1..coalesce(array_length(ids, 1), 0) LOOP
        UPDATE public.case_prepared_pack_items SET position = i WHERE pack_id = p.id AND version_id = ids[i];
      END LOOP;
      INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
      VALUES (c.id, p.id, actor, 'ITEM_MOVED', jsonb_build_object('versionId', target_version, 'from', old_pos, 'to', new_pos));
    END IF;
    UPDATE public.case_prepared_packs SET updated_at = now() WHERE id = p.id RETURNING * INTO p;
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack item moved',
      jsonb_build_object('operation', 'move_item', 'packId', p.id, 'versionId', target_version, 'from', old_pos, 'to', new_pos));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packStatus', p.status, 'recordVersion', p.record_version);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'approve' THEN
    IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    note := btrim(coalesce(data->>'note', ''));
    IF length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT count(*)::int INTO item_count FROM public.case_prepared_pack_items WHERE pack_id = p.id;
    IF item_count < 1 THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.case_prepared_pack_items i
      INNER JOIN public.case_document_versions v ON v.id = i.version_id
      INNER JOIN public.case_documents d ON d.id = i.document_id
      WHERE i.pack_id = p.id AND (
        d.case_id <> c.id OR v.document_id <> d.id
        OR v.upload_status <> 'UPLOADED' OR v.scan_status <> 'NO_THREATS_FOUND'
        OR v.validation_status <> 'VALID' OR v.review_status <> 'ACCEPTED'
      )
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    FOR prev IN SELECT * FROM public.case_prepared_packs WHERE case_id = c.id AND status = 'APPROVED' AND id <> p.id FOR UPDATE LOOP
      PERFORM admin_private.end_pack_publication_v1(
        prev.id, actor, 'This pack was superseded by a later approved pack.',
        jsonb_build_object('source', 'AUTO', 'replacedBy', p.id, 'packNumber', prev.pack_number)
      );
      UPDATE public.case_prepared_packs SET status = 'SUPERSEDED' WHERE id = prev.id AND status = 'APPROVED';
      INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
      VALUES (c.id, prev.id, actor, 'PACK_SUPERSEDED', jsonb_build_object('replacedBy', p.id, 'packNumber', prev.pack_number));
    END LOOP;
    UPDATE public.case_prepared_packs
      SET status = 'APPROVED', approved_by = actor, approved_at = now(), approval_note = note
      WHERE id = p.id RETURNING * INTO p;
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (c.id, p.id, actor, 'PACK_APPROVED', jsonb_build_object('packNumber', p.pack_number, 'itemCount', item_count));
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack approved',
      jsonb_build_object('operation', 'approve', 'packId', p.id, 'packNumber', p.pack_number, 'itemCount', item_count));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packNumber', p.pack_number, 'packStatus', p.status, 'recordVersion', p.record_version);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  RETURN jsonb_build_object('status', 'invalid');
END; $$;
REVOKE ALL ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_prepared_pack_case_v1(p_token text, p_case uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cases; packs jsonb; eligible jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_case IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  IF c.id IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'packNumber', p.pack_number, 'status', p.status, 'approvalNote', p.approval_note,
    'createdAt', p.created_at, 'approvedAt', p.approved_at, 'recordVersion', p.record_version,
    'published', (p.published_at IS NOT NULL AND p.unpublished_at IS NULL),
    'publishedAt', p.published_at, 'publicationNote', p.publication_note,
    'unpublishedAt', p.unpublished_at, 'unpublishedReason', p.unpublished_reason,
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'documentId', i.document_id, 'versionId', i.version_id, 'position', i.position,
        'documentTitle', i.document_title, 'originalFilename', i.original_filename,
        'contentType', i.content_type, 'sizeBytes', i.size_bytes, 'versionNumber', v.version_number,
        'customerVisible', v.customer_visible
      ) ORDER BY i.position), '[]')
      FROM public.case_prepared_pack_items i
      INNER JOIN public.case_document_versions v ON v.id = i.version_id
      WHERE i.pack_id = p.id
    )
  ) ORDER BY p.pack_number DESC), '[]') INTO packs
  FROM (
    SELECT * FROM public.case_prepared_packs WHERE case_id = c.id ORDER BY pack_number DESC LIMIT 20
  ) p;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'documentId', d.id, 'versionId', v.id, 'versionNumber', v.version_number,
    'documentTitle', d.title, 'originalFilename', v.original_filename,
    'contentType', v.declared_content_type, 'sizeBytes', v.declared_size_bytes
  ) ORDER BY d.created_at DESC, v.version_number DESC), '[]') INTO eligible
  FROM public.case_document_versions v
  INNER JOIN public.case_documents d ON d.id = v.document_id
  WHERE d.case_id = c.id
    AND v.upload_status = 'UPLOADED'
    AND v.scan_status = 'NO_THREATS_FOUND'
    AND v.validation_status = 'VALID'
    AND v.review_status = 'ACCEPTED';
  RETURN jsonb_build_object('caseId', c.id, 'packs', packs, 'eligible', eligible);
END; $$;
REVOKE ALL ON FUNCTION public.admin_prepared_pack_case_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepared_pack_case_v1(text, uuid) TO service_role;

CREATE FUNCTION admin_private.customer_case_access_action_v1(p_token_hash text)
RETURNS public.customer_actions
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.id IS NULL OR a.kind <> 'CASE_ACCESS' OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN NULL; END IF;
  RETURN a;
END; $$;
REVOKE ALL ON FUNCTION admin_private.customer_case_access_action_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.customer_published_pack_item_v1(p_case uuid, p_version uuid)
RETURNS TABLE (
  pack_id uuid, pack_number integer, published_at timestamptz, item_id uuid, item_position integer,
  document_title text, original_filename text, content_type text, size_bytes bigint,
  version_id uuid, storage_bucket text, storage_key text
)
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.pack_number, p.published_at, i.id, i.position, i.document_title, i.original_filename,
    i.content_type, i.size_bytes, v.id, v.storage_bucket, v.storage_key
  FROM public.case_prepared_packs p
  INNER JOIN public.case_prepared_pack_items i ON i.pack_id = p.id
  INNER JOIN public.case_document_versions v ON v.id = i.version_id
  INNER JOIN public.case_documents d ON d.id = i.document_id
  WHERE p.case_id = p_case
    AND p.status = 'APPROVED'
    AND p.published_at IS NOT NULL
    AND p.unpublished_at IS NULL
    AND i.version_id = p_version
    AND d.case_id = p_case
    AND v.document_id = d.id
    AND v.upload_status = 'UPLOADED'
    AND v.scan_status = 'NO_THREATS_FOUND'
    AND v.validation_status = 'VALID'
    AND v.review_status = 'ACCEPTED'
    AND v.customer_visible IS TRUE
    AND admin_private.pack_publishable_v1(p.id)
  LIMIT 1;
END; $$;
REVOKE ALL ON FUNCTION admin_private.customer_published_pack_item_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.customer_case_pack_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions;
  cs public.cases; b public.businesses; loc public.locations; p public.case_prepared_packs; items jsonb;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  SELECT * INTO p FROM public.case_prepared_packs
    WHERE case_id = a.case_id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
    LIMIT 1;
  IF p.id IS NULL OR NOT admin_private.pack_publishable_v1(p.id) THEN
    RETURN jsonb_build_object(
      'kind', a.kind,
      'caseReference', cs.public_ref,
      'businessName', b.display_name,
      'locationName', loc.location_name,
      'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
      'pack', NULL
    );
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'versionId', i.version_id,
    'position', i.position,
    'documentTitle', i.document_title,
    'originalFilename', i.original_filename,
    'contentType', i.content_type,
    'sizeBytes', i.size_bytes
  ) ORDER BY i.position), '[]') INTO items
  FROM public.case_prepared_pack_items i
  INNER JOIN public.case_document_versions v ON v.id = i.version_id
  WHERE i.pack_id = p.id
    AND v.customer_visible IS TRUE
    AND v.upload_status = 'UPLOADED'
    AND v.scan_status = 'NO_THREATS_FOUND'
    AND v.validation_status = 'VALID'
    AND v.review_status = 'ACCEPTED';
  RETURN jsonb_build_object(
    'kind', a.kind,
    'caseReference', cs.public_ref,
    'businessName', b.display_name,
    'locationName', loc.location_name,
    'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
    'pack', jsonb_build_object(
      'packNumber', p.pack_number,
      'publishedAt', p.published_at,
      'items', items
    )
  );
END; $$;

CREATE FUNCTION public.customer_case_pack_version_v1(p_token_hash text, p_version uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions; item record;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL OR p_version IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO item FROM admin_private.customer_published_pack_item_v1(a.case_id, p_version);
  IF item.version_id IS NULL OR NOT admin_private.pack_publishable_v1(item.pack_id) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'versionId', item.version_id,
    'documentTitle', item.document_title,
    'originalFilename', item.original_filename,
    'contentType', item.content_type,
    'sizeBytes', item.size_bytes,
    'storageBucket', item.storage_bucket,
    'storageKey', item.storage_key
  );
END; $$;

CREATE FUNCTION public.customer_case_pack_access_v1(p_token_hash text, p_request uuid, p_version uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; item record;
  d public.case_documents; v public.case_document_versions; fp text; cached jsonb; result jsonb; event_name text;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_request IS NULL OR p_version IS NULL OR p_action IS NULL OR p_action NOT IN ('view','download') THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  fp := md5(jsonb_build_array(a.id, p_version, p_action)::text);
  cached := admin_private.customer_pack_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO item FROM admin_private.customer_published_pack_item_v1(a.case_id, p_version);
  IF item.version_id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF NOT admin_private.pack_publishable_v1(item.pack_id) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO item FROM admin_private.customer_published_pack_item_v1(a.case_id, p_version);
  IF item.version_id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = item.version_id;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF p_action = 'view' AND v.declared_content_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  event_name := CASE p_action WHEN 'view' THEN 'ACCESS_VIEWED' ELSE 'ACCESS_DOWNLOADED' END;
  INSERT INTO public.case_document_events(case_id, document_id, version_id, actor_id, event, details)
  VALUES (a.case_id, d.id, v.id, sess.auth_user_id, event_name, jsonb_build_object(
    'source', 'CUSTOMER_CASE_ACCESS', 'contentType', v.declared_content_type
  ));
  PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'EVIDENCE_CHANGED', 'success', a.case_id, p_request, 'case',
    CASE p_action WHEN 'view' THEN 'Customer viewed a published pack file' ELSE 'Customer downloaded a published pack file' END,
    jsonb_build_object('operation', p_action, 'source', 'CUSTOMER_CASE_ACCESS', 'versionId', v.id));
  result := jsonb_build_object('status', 'success', 'versionId', v.id, 'action', p_action);
  INSERT INTO admin_private.customer_pack_access_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.customer_case_pack_v1(text),
  public.customer_case_pack_version_v1(text, uuid),
  public.customer_case_pack_access_v1(text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_case_pack_v1(text),
  public.customer_case_pack_version_v1(text, uuid),
  public.customer_case_pack_access_v1(text, uuid, uuid, text)
  TO service_role;

COMMIT;
