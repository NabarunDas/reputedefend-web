-- ADMIN-PACK-STEP8. A draft item can change role without being removed.
-- Approval of a Guided pack still requires exactly one completed statement
-- and exactly one customer submission instructions document.
--
-- Source only. This file is not applied to DEV or Production. Applying it does
-- not change a live pack, publish a pack, send email or collect a payment.

BEGIN;

ALTER TABLE public.case_prepared_pack_events DROP CONSTRAINT case_prepared_pack_events_event_check;
ALTER TABLE public.case_prepared_pack_events
  ADD CONSTRAINT case_prepared_pack_events_event_check CHECK (event IN (
    'PACK_CREATED','ITEM_ADDED','ITEM_REMOVED','ITEM_MOVED','ITEM_ROLE_CHANGED','PACK_APPROVED','PACK_STALE','PACK_SUPERSEDED',
    'PACK_PUBLISHED','PACK_UNPUBLISHED'
  ));

CREATE OR REPLACE FUNCTION public.admin_prepared_pack_command_v1(
  p_token text, p_request uuid, p_case uuid, p_pack uuid, p_version integer, p_operation text, p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; c public.cases; p public.case_prepared_packs; actor uuid; fp text; cached jsonb; result jsonb;
  data jsonb; target_version uuid; item public.case_prepared_pack_items; doc public.case_documents; ver public.case_document_versions;
  next_no integer; next_pos integer; item_count integer; old_pos integer; new_pos integer; note text;
  prev public.case_prepared_packs; ids uuid[]; idx integer; n integer; i integer;
  commercial text; mail jsonb; materials text; previous_role text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create','add_item','remove_item','move_item','set_item_role','approve','publish','unpublish','send_pack_email')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
    OR (p_operation IN ('publish', 'send_pack_email') AND octet_length(p_data::text) > 65536)
    OR (p_operation NOT IN ('publish', 'send_pack_email') AND octet_length(p_data::text) > 4096)
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_case, p_pack, p_version, p_operation, data)::text);
  cached := admin_private.pack_receipt_v1(actor, p_request, fp, NULL);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF c.status = 'CANCELLED' OR (c.status = 'CLOSED' AND c.service_track IS DISTINCT FROM 'GUIDED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;

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
    IF (data - 'confirmed' - 'note' - 'subject' - 'bodyText' - 'bodyHtml' - 'fromAddress' - 'replyTo' - 'customerOrigin' - 'sendEnabled') <> '{}'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    commercial := admin_private.guided_settlement_reason_v1(c.id);
    IF commercial IS NOT NULL AND commercial IS DISTINCT FROM 'not_guided' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', commercial);
    END IF;
    materials := admin_private.pack_publication_block_v1(p.id);
    IF materials IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', materials); END IF;
    IF EXISTS (
      SELECT 1 FROM public.case_prepared_packs x
      WHERE x.case_id = c.id AND x.id <> p.id AND x.published_at IS NOT NULL AND x.unpublished_at IS NULL
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    PERFORM admin_private.grant_pack_customer_visibility_v1(p.id, actor);
    IF NOT admin_private.pack_publishable_v1(p.id) THEN
      RAISE EXCEPTION 'pack_visibility';
    END IF;
    UPDATE public.case_prepared_packs
      SET published_at = now(), published_by = actor, publication_note = note,
          unpublished_at = NULL, unpublished_by = NULL, unpublished_reason = ''
      WHERE id = p.id RETURNING * INTO p;
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (c.id, p.id, actor, 'PACK_PUBLISHED', jsonb_build_object('packNumber', p.pack_number, 'customerVisibility', 'established'));
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack published for customer case access',
      jsonb_build_object('operation', 'publish', 'packId', p.id, 'packNumber', p.pack_number, 'customerVisibility', 'established'));
    mail := admin_private.queue_guided_pack_ready_v1(c.id, p.id, actor, data);
    IF mail->>'status' IS DISTINCT FROM 'success' AND mail->>'status' IS DISTINCT FROM 'skipped' THEN
      RAISE EXCEPTION 'guided_pack_mail:%', coalesce(mail->>'reason', 'mail');
    END IF;
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packNumber', p.pack_number, 'packStatus', p.status, 'recordVersion', p.record_version, 'published', true, 'packEmail', mail->>'status');
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

  IF p_operation = 'send_pack_email' THEN
    IF (data - 'subject' - 'bodyText' - 'bodyHtml' - 'fromAddress' - 'replyTo' - 'customerOrigin' - 'sendEnabled') <> '{}'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF p.status IS DISTINCT FROM 'APPROVED' OR p.published_at IS NULL OR p.unpublished_at IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    commercial := admin_private.guided_settlement_reason_v1(c.id);
    IF commercial IS NOT NULL AND commercial IS DISTINCT FROM 'not_guided' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', commercial);
    END IF;
    materials := admin_private.guided_pack_materials_reason_v1(p.id);
    IF materials IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', materials); END IF;
    IF NOT admin_private.pack_publishable_v1(p.id) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF EXISTS (SELECT 1 FROM public.guided_pack_announcements existing WHERE existing.pack_id = p.id) THEN
      result := jsonb_build_object('status', 'success', 'id', p.id, 'packNumber', p.pack_number, 'packStatus', p.status, 'recordVersion', p.record_version, 'published', true, 'packEmail', 'already_queued');
      INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    IF data->>'sendEnabled' IS DISTINCT FROM 'true' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'send_disabled');
    END IF;
    mail := admin_private.queue_guided_pack_ready_v1(c.id, p.id, actor, data);
    IF mail->>'status' IS DISTINCT FROM 'success' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', coalesce(mail->>'reason', 'mail'));
    END IF;
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMUNICATION_CHANGED', 'success', c.id, p_request, 'case', 'Queued the pack-ready email. The provider has not accepted it.',
      jsonb_build_object('operation', 'send_pack_email', 'packId', p.id, 'communicationId', mail->>'id'));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'packNumber', p.pack_number, 'packStatus', p.status, 'recordVersion', p.record_version, 'published', true, 'packEmail', 'success');
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;

  IF p_operation = 'set_item_role' THEN
    IF data ?| ARRAY['documentTitle','originalFilename','contentType','sizeBytes','storageKey','storageBucket','url']
      OR jsonb_typeof(data->'versionId') <> 'string'
      OR (data - 'versionId' - 'role') <> '{}'::jsonb
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN target_version := (data->>'versionId')::uuid; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF coalesce(data->>'role', '') NOT IN ('DELIVERABLE', 'EVIDENCE', 'INSTRUCTIONS') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    SELECT * INTO item FROM public.case_prepared_pack_items i WHERE i.pack_id = p.id AND i.version_id = target_version;
    IF item.id IS NULL OR item.pack_id IS DISTINCT FROM p.id THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    SELECT r.role INTO previous_role FROM public.guided_pack_item_roles r WHERE r.item_id = item.id;
    IF previous_role IS NOT DISTINCT FROM data->>'role' THEN
      result := jsonb_build_object('status', 'success', 'id', p.id, 'itemId', item.id, 'packStatus', p.status, 'recordVersion', p.record_version);
      INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    INSERT INTO public.guided_pack_item_roles(item_id, role) VALUES (item.id, data->>'role')
    ON CONFLICT (item_id) DO UPDATE SET role = EXCLUDED.role;
    UPDATE public.case_prepared_packs SET updated_at = now() WHERE id = p.id RETURNING * INTO p;
    INSERT INTO public.case_prepared_pack_events(case_id, pack_id, actor_id, event, details)
    VALUES (c.id, p.id, actor, 'ITEM_ROLE_CHANGED', jsonb_build_object(
      'versionId', item.version_id, 'documentId', item.document_id, 'previousRole', previous_role, 'role', data->>'role'
    ));
    PERFORM admin_private.write_record_audit_v1(actor, 'EVIDENCE_CHANGED', 'success', c.id, p_request, 'case', 'Prepared pack item role changed',
      jsonb_build_object('operation', 'set_item_role', 'packId', p.id, 'versionId', item.version_id, 'documentId', item.document_id, 'previousRole', previous_role, 'role', data->>'role'));
    result := jsonb_build_object('status', 'success', 'id', p.id, 'itemId', item.id, 'packStatus', p.status, 'recordVersion', p.record_version);
    INSERT INTO admin_private.pack_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'add_item' THEN
    IF data ?| ARRAY['documentTitle','originalFilename','contentType','sizeBytes','storageKey','storageBucket','url']
      OR jsonb_typeof(data->'versionId') <> 'string'
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    BEGIN target_version := (data->>'versionId')::uuid; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF data ? 'role' AND coalesce(data->>'role', '') NOT IN ('DELIVERABLE', 'EVIDENCE', 'INSTRUCTIONS') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
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
    IF data ? 'role' THEN
      INSERT INTO public.guided_pack_item_roles(item_id, role) VALUES (item.id, data->>'role');
    END IF;
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
    IF item_count < 1 THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'empty'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.case_prepared_pack_items i
      INNER JOIN public.case_document_versions v ON v.id = i.version_id
      INNER JOIN public.case_documents d ON d.id = i.document_id
      WHERE i.pack_id = p.id AND (
        d.case_id <> c.id OR v.document_id <> d.id
        OR v.upload_status <> 'UPLOADED' OR v.scan_status <> 'NO_THREATS_FOUND'
        OR v.validation_status <> 'VALID' OR v.review_status <> 'ACCEPTED'
      )
    ) THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'version'); END IF;
    materials := admin_private.guided_pack_materials_reason_v1(p.id);
    IF materials IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', materials); END IF;
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
EXCEPTION
  WHEN raise_exception THEN
    IF left(SQLERRM, 17) = 'guided_pack_mail:' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', substr(SQLERRM, 18));
    END IF;
    IF SQLERRM = 'pack_visibility' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'version');
    END IF;
    RAISE;
END; $$;
REVOKE ALL ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb) TO service_role;

COMMIT;
