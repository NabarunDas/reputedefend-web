BEGIN;

CREATE TABLE public.case_prepared_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  pack_number integer NOT NULL CHECK (pack_number > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','STALE','SUPERSEDED')),
  approval_note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  record_version integer NOT NULL DEFAULT 1,
  UNIQUE (case_id, pack_number),
  CHECK (status <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND length(btrim(approval_note)) BETWEEN 10 AND 2000)),
  CHECK (status = 'DRAFT' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX case_prepared_packs_case_idx ON public.case_prepared_packs(case_id, pack_number DESC);
CREATE UNIQUE INDEX case_prepared_packs_one_approved_idx ON public.case_prepared_packs(case_id) WHERE status = 'APPROVED';
CREATE UNIQUE INDEX case_prepared_packs_one_draft_idx ON public.case_prepared_packs(case_id) WHERE status = 'DRAFT';

CREATE TABLE public.case_prepared_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.case_prepared_packs(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES public.case_documents(id) ON DELETE RESTRICT,
  version_id uuid NOT NULL REFERENCES public.case_document_versions(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position > 0),
  document_title text NOT NULL CHECK (length(btrim(document_title)) BETWEEN 1 AND 200),
  original_filename text NOT NULL CHECK (length(btrim(original_filename)) BETWEEN 1 AND 255),
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  added_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_id, version_id),
  UNIQUE (pack_id, position)
);
CREATE INDEX case_prepared_pack_items_pack_idx ON public.case_prepared_pack_items(pack_id, position);
CREATE INDEX case_prepared_pack_items_document_idx ON public.case_prepared_pack_items(document_id);
CREATE INDEX case_prepared_pack_items_version_idx ON public.case_prepared_pack_items(version_id);

CREATE TABLE public.case_prepared_pack_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  pack_id uuid NOT NULL REFERENCES public.case_prepared_packs(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN (
    'PACK_CREATED','ITEM_ADDED','ITEM_REMOVED','ITEM_MOVED','PACK_APPROVED','PACK_STALE','PACK_SUPERSEDED'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_prepared_pack_events_pack_idx ON public.case_prepared_pack_events(pack_id, id DESC);
CREATE INDEX case_prepared_pack_events_case_idx ON public.case_prepared_pack_events(case_id, id DESC);

CREATE TABLE admin_private.pack_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.case_prepared_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_prepared_pack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_prepared_pack_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.pack_command_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_prepared_packs, public.case_prepared_pack_items, public.case_prepared_pack_events, admin_private.pack_command_receipts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.case_prepared_pack_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.bump_prepared_pack_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.record_version := OLD.record_version + 1; NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER case_prepared_packs_record_version BEFORE UPDATE ON public.case_prepared_packs
FOR EACH ROW EXECUTE FUNCTION admin_private.bump_prepared_pack_version_v1();
REVOKE ALL ON FUNCTION admin_private.bump_prepared_pack_version_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.reject_pack_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Prepared pack events are append-only'; END; $$;
CREATE TRIGGER case_prepared_pack_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.case_prepared_pack_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_pack_event_change_v1();
REVOKE ALL ON FUNCTION admin_private.reject_pack_event_change_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.pack_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text, p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.pack_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.pack_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict');
    END IF;
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION admin_private.pack_receipt_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.pack_version_eligible_v1(p_version uuid, p_case uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v public.case_document_versions; d public.case_documents;
BEGIN
  IF p_version IS NULL OR p_case IS NULL THEN RETURN false; END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = p_version;
  IF v.id IS NULL THEN RETURN false; END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF d.id IS NULL OR d.case_id <> p_case THEN RETURN false; END IF;
  RETURN v.upload_status = 'UPLOADED'
    AND v.scan_status = 'NO_THREATS_FOUND'
    AND v.validation_status = 'VALID'
    AND v.review_status = 'ACCEPTED';
END; $$;
REVOKE ALL ON FUNCTION admin_private.pack_version_eligible_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.enforce_pack_item_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p public.case_prepared_packs; d public.case_documents; v public.case_document_versions;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO p FROM public.case_prepared_packs WHERE id = OLD.pack_id;
    IF p.id IS NULL OR p.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Pack items can only be changed on a draft pack';
    END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO p FROM public.case_prepared_packs WHERE id = NEW.pack_id;
  IF p.id IS NULL OR p.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Pack items can only be changed on a draft pack';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.document_id IS DISTINCT FROM OLD.document_id) THEN
    RAISE EXCEPTION 'Pack item version cannot be changed';
  END IF;
  SELECT * INTO v FROM public.case_document_versions WHERE id = NEW.version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Pack item version is not eligible'; END IF;
  SELECT * INTO d FROM public.case_documents WHERE id = v.document_id;
  IF d.id IS NULL OR d.case_id <> p.case_id OR (NEW.document_id IS DISTINCT FROM d.id) THEN
    RAISE EXCEPTION 'Pack item version is not eligible';
  END IF;
  IF v.upload_status <> 'UPLOADED' OR v.scan_status <> 'NO_THREATS_FOUND' OR v.validation_status <> 'VALID' OR v.review_status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'Pack item version is not eligible';
  END IF;
  NEW.document_id := d.id;
  NEW.document_title := d.title;
  NEW.original_filename := v.original_filename;
  NEW.content_type := v.declared_content_type;
  NEW.size_bytes := v.declared_size_bytes;
  RETURN NEW;
END; $$;
CREATE TRIGGER case_prepared_pack_items_eligibility
  BEFORE INSERT OR UPDATE OR DELETE ON public.case_prepared_pack_items
  FOR EACH ROW EXECUTE FUNCTION admin_private.enforce_pack_item_eligibility_v1();
REVOKE ALL ON FUNCTION admin_private.enforce_pack_item_eligibility_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.stale_approved_packs_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor uuid; pack public.case_prepared_packs;
BEGIN
  IF NEW.upload_status = 'UPLOADED' AND NEW.scan_status = 'NO_THREATS_FOUND' AND NEW.validation_status = 'VALID' AND NEW.review_status = 'ACCEPTED' THEN
    RETURN NEW;
  END IF;
  SELECT auth_user_id INTO actor FROM public.admin_identity WHERE singleton LIMIT 1;
  IF actor IS NULL THEN actor := NEW.created_by; END IF;
  FOR pack IN
    UPDATE public.case_prepared_packs p
      SET status = 'STALE'
      WHERE p.status = 'APPROVED'
        AND EXISTS (SELECT 1 FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id AND i.version_id = NEW.id)
      RETURNING p.*
  LOOP
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
CREATE TRIGGER case_document_versions_stale_packs
  AFTER UPDATE OF upload_status, scan_status, validation_status, review_status ON public.case_document_versions
  FOR EACH ROW
  WHEN (
    OLD.upload_status IS DISTINCT FROM NEW.upload_status
    OR OLD.scan_status IS DISTINCT FROM NEW.scan_status
    OR OLD.validation_status IS DISTINCT FROM NEW.validation_status
    OR OLD.review_status IS DISTINCT FROM NEW.review_status
  )
  EXECUTE FUNCTION admin_private.stale_approved_packs_v1();
REVOKE ALL ON FUNCTION admin_private.stale_approved_packs_v1() FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_prepared_pack_command_v1(
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
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create','add_item','remove_item','move_item','approve')
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

CREATE FUNCTION public.admin_prepared_pack_case_v1(p_token text, p_case uuid)
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
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'documentId', i.document_id, 'versionId', i.version_id, 'position', i.position,
        'documentTitle', i.document_title, 'originalFilename', i.original_filename,
        'contentType', i.content_type, 'sizeBytes', i.size_bytes, 'versionNumber', v.version_number
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

REVOKE ALL ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb),
  public.admin_prepared_pack_case_v1(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb),
  public.admin_prepared_pack_case_v1(text, uuid)
  TO service_role;

COMMIT;
