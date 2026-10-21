BEGIN;

-- Preliminary evidence upload for a COMMUNICATION_ACCESS action.
-- Admin Step 2 is preliminary screening. It does not verify business
-- authority, and an evidence request may be sent before that verification
-- exists. A customer who has verified control of the action email may
-- exchange that one unexpired action and upload its open evidence request.
-- A revoked business relationship still denies the action.
-- CASE_ACCESS, quotes, agreements, payments and Guard keep the verified
-- membership requirement. This action does not reveal published pack files
-- or any other case.
-- Source review only. Do not apply this file to DEV or Production from this
-- change. It does not rewrite communications, customer actions, or sent email.

CREATE OR REPLACE FUNCTION admin_private.customer_action_eligible_v1(p_action public.customer_actions)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  c public.customers; b public.businesses; loc public.locations; cs public.cases;
  qv public.quote_versions; q public.quotes; ord public.service_orders; ob public.payment_obligations;
  cov public.guard_coverages; off public.guard_included_offers; sub public.guard_subscriptions;
  offer public.guard_price_change_offers; cont public.guard_continuations;
BEGIN
  IF p_action.id IS NULL OR p_action.status <> 'OPEN' THEN RETURN false; END IF;
  IF p_action.expires_at IS NOT NULL AND p_action.expires_at <= now() THEN RETURN false; END IF;
  IF p_action.revoked_at IS NOT NULL THEN RETURN false; END IF;
  IF lower(p_action.expected_email_snapshot) = 'admin@profilerelaunch.com' THEN RETURN false; END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_action.customer_id;
  IF c.id IS NULL OR lower(c.email) IS DISTINCT FROM lower(p_action.expected_email_snapshot) THEN RETURN false; END IF;
  IF NOT admin_private.contact_verified_v1(c.id, 'email') THEN RETURN false; END IF;
  IF p_action.kind = 'COMMUNICATION_ACCESS' THEN
    IF EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'revoked'
    ) THEN RETURN false; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'verified'
    ) THEN RETURN false; END IF;
  END IF;
  SELECT * INTO b FROM public.businesses WHERE id = p_action.business_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF p_action.location_id IS NOT NULL THEN
    SELECT * INTO loc FROM public.locations WHERE id = p_action.location_id;
    IF loc.id IS NULL OR loc.business_id <> p_action.business_id THEN RETURN false; END IF;
  END IF;
  IF p_action.case_id IS NOT NULL THEN
    SELECT * INTO cs FROM public.cases WHERE id = p_action.case_id;
    IF cs.id IS NULL OR cs.customer_id <> p_action.customer_id OR cs.business_id <> p_action.business_id THEN RETURN false; END IF;
    IF p_action.location_id IS NOT NULL AND cs.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF cs.status IN ('CLOSED','CANCELLED') THEN RETURN false; END IF;
  END IF;
  IF p_action.kind = 'AGREEMENT_ACCEPTANCE' AND EXISTS (
    SELECT 1 FROM public.agreement_versions v
    WHERE v.id = p_action.agreement_version_id AND v.agreement_kind = 'CASE_MANAGEMENT_PERMISSION'
  ) AND (cs.id IS NULL OR cs.service_track IS DISTINCT FROM 'MANAGED') THEN
    RETURN false;
  END IF;
  IF p_action.kind = 'QUOTE_ACCEPTANCE' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id;
    SELECT * INTO q FROM public.quotes WHERE id = qv.quote_id;
    IF qv.id IS NULL OR q.id IS NULL OR qv.status <> 'OFFERED' OR q.status <> 'OFFERED' THEN RETURN false; END IF;
    IF qv.valid_until <= now() THEN RETURN false; END IF;
    IF qv.customer_id IS DISTINCT FROM p_action.customer_id OR qv.business_id IS DISTINCT FROM p_action.business_id
      OR qv.location_id IS DISTINCT FROM p_action.location_id OR qv.case_id IS DISTINCT FROM p_action.case_id
    THEN RETURN false; END IF;
  END IF;
  IF p_action.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM p_action.customer_id THEN RETURN false; END IF;
    IF p_action.payment_obligation_id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = p_action.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state = 'VOID' THEN RETURN false; END IF;
    END IF;
    IF p_action.kind = 'INVOICE_PAYMENT' THEN
      IF p_action.payment_invoice_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.payment_invoices i
        WHERE i.id = p_action.payment_invoice_id AND i.obligation_id = p_action.payment_obligation_id
          AND i.status IN ('ISSUED','PAID')
      ) THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_PERMISSION' THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id;
    IF cov.id IS NULL OR cov.state IN ('ENDED') THEN RETURN false; END IF;
    IF cov.customer_id IS DISTINCT FROM p_action.customer_id OR cov.business_id IS DISTINCT FROM p_action.business_id
      OR cov.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF NOT admin_private.guard_location_authorized_v1(cov.customer_id, cov.business_id, cov.location_id) THEN
      RETURN false;
    END IF;
    IF cov.coverage_basis = 'INCLUDED' THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = p_action.guard_included_offer_id;
      IF off.id IS NULL OR off.status NOT IN ('ELIGIBLE','OFFERED') OR off.coverage_id IS DISTINCT FROM cov.id THEN
        RETURN false;
      END IF;
      IF NOT admin_private.included_guard_eligible_v1(
        cov.customer_id, cov.business_id, cov.location_id, cov.source_recovery_case_id, cov.source_managed_order_id
      ) THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_SUBSCRIPTION_START' THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.state <> 'ACCEPTED_RECURRING' THEN RETURN false; END IF;
    IF NOT admin_private.guard_location_authorized_v1(p_action.customer_id, p_action.business_id, p_action.location_id) THEN
      RETURN false;
    END IF;
    IF p_action.guard_coverage_id IS NOT NULL THEN
      SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id;
      IF cov.id IS NULL OR cov.state = 'ENDED' OR cov.coverage_basis <> 'DIRECT_GUARD' THEN RETURN false; END IF;
    END IF;
    IF p_action.guard_continuation_id IS NOT NULL THEN
      SELECT * INTO cont FROM public.guard_continuations WHERE id = p_action.guard_continuation_id;
      IF cont.id IS NULL OR cont.status NOT IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED') THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_PRICE_CHANGE_ACCEPTANCE' THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = p_action.guard_subscription_id;
    SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = p_action.guard_price_change_offer_id;
    IF sub.id IS NULL OR offer.id IS NULL OR offer.status <> 'OFFERED' THEN RETURN false; END IF;
    IF sub.customer_id IS DISTINCT FROM p_action.customer_id OR sub.location_id IS DISTINCT FROM p_action.location_id THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION admin_private.customer_action_eligible_v1(public.customer_actions) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_case_pack_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions;
  cs public.cases; b public.businesses; loc public.locations; p public.case_prepared_packs; items jsonb; requests jsonb;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  requests := admin_private.customer_open_evidence_requests_v1(a.case_id, a.id);
  IF a.kind = 'COMMUNICATION_ACCESS' THEN
    RETURN jsonb_build_object(
      'kind', a.kind,
      'caseReference', cs.public_ref,
      'businessName', b.display_name,
      'locationName', loc.location_name,
      'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
      'pack', NULL,
      'evidenceRequests', requests
    );
  END IF;
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
      'pack', NULL,
      'evidenceRequests', requests
    );
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'versionId', d.version_id,
    'position', d.item_position,
    'documentTitle', d.document_title,
    'originalFilename', d.original_filename,
    'contentType', d.content_type,
    'sizeBytes', d.size_bytes
  ) ORDER BY d.item_position), '[]') INTO items
  FROM admin_private.customer_published_pack_documents_v1(a.case_id) d;
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
    ),
    'evidenceRequests', requests
  );
END; $$;

CREATE OR REPLACE FUNCTION public.customer_case_pack_version_v1(p_token_hash text, p_version uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.customer_actions; item record;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL OR p_version IS NULL OR a.kind = 'COMMUNICATION_ACCESS' THEN RETURN NULL; END IF;
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

CREATE OR REPLACE FUNCTION public.customer_case_pack_access_v1(p_token_hash text, p_request uuid, p_version uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; item record;
  d public.case_documents; v public.case_document_versions; fp text; cached jsonb; result jsonb; event_name text;
BEGIN
  a := admin_private.customer_case_access_action_v1(p_token_hash);
  IF a.id IS NULL OR a.kind = 'COMMUNICATION_ACCESS' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
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
