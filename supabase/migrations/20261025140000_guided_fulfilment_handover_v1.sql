BEGIN;

-- GUIDED-FULFILMENT handover. Source only. Do not apply to DEV or Production
-- from this change. It does not send mail, charge a card, or edit an existing case.
-- GUIDED_PAYMENT_REQUEST is allowed so this check stays a superset of the
-- unmerged payment-request migration. This file does not insert that template.

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY'
  ) AND template_version >= 1)
);
ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY'
  ));

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES
  ('PAYMENT_CONFIRMATION', 1, 'Payment received',
   'Payment received for your ProfileRelaunch order',
   'The live payment email is composed by the server from the settled receipt.',
   'DRAFT', 'Catalogue row for the server-composed payment confirmation.'),
  ('GUIDED_PACK_READY', 1, 'Submission pack ready',
   'Your submission pack is ready',
   'The live pack email is composed by the server when an approved Guided pack is published.',
   'DRAFT', 'Catalogue row for the server-composed pack handover email.');
UPDATE admin_private.communication_templates
SET status = 'APPROVED', approval_source = 'MIGRATED_EXISTING',
    reason = 'Server-composed snapshot. The approved row documents the key and is not the live email.',
    record_version = record_version + 1
WHERE template_key IN ('PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY') AND version = 1 AND status = 'DRAFT';

CREATE TABLE public.guided_pack_item_roles (
  item_id uuid PRIMARY KEY REFERENCES public.case_prepared_pack_items(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('DELIVERABLE', 'EVIDENCE', 'INSTRUCTIONS'))
);
CREATE TABLE public.guided_payment_confirmations (
  receipt_id uuid PRIMARY KEY REFERENCES public.payment_receipts(id) ON DELETE RESTRICT,
  communication_id uuid NOT NULL UNIQUE REFERENCES public.communications(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.guided_pack_announcements (
  pack_id uuid PRIMARY KEY REFERENCES public.case_prepared_packs(id) ON DELETE RESTRICT,
  communication_id uuid NOT NULL UNIQUE REFERENCES public.communications(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.guided_customer_reports (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  pack_id uuid NOT NULL REFERENCES public.case_prepared_packs(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('CORRECTION', 'GOOGLE_SUBMISSION')),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 10 AND 2000),
  submitted_on date,
  google_reference text,
  task_id uuid REFERENCES public.case_tasks(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guided_customer_reports_shape_check CHECK (
    (kind = 'CORRECTION' AND submitted_on IS NULL AND google_reference IS NULL AND task_id IS NOT NULL)
    OR (
      kind = 'GOOGLE_SUBMISSION' AND submitted_on IS NOT NULL AND task_id IS NULL
      AND (
        google_reference IS NULL
        OR (
          length(btrim(google_reference)) BETWEEN 1 AND 200
          AND google_reference ~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          AND position('http' IN lower(google_reference)) = 0
        )
      )
    )
  )
);
CREATE UNIQUE INDEX guided_customer_reports_one_submission_idx
  ON public.guided_customer_reports (pack_id) WHERE kind = 'GOOGLE_SUBMISSION';
CREATE TABLE admin_private.guided_handover_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guided_pack_item_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guided_payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guided_pack_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guided_customer_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guided_handover_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guided_pack_item_roles, public.guided_payment_confirmations,
  public.guided_pack_announcements, public.guided_customer_reports,
  admin_private.guided_handover_receipts
  FROM PUBLIC, anon, authenticated, service_role;

-- NULL means the Guided upfront order is settled. not_guided means this gate does not apply.
CREATE FUNCTION admin_private.guided_settlement_reason_v1(p_case uuid)
RETURNS text
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  c public.cases;
  ord public.service_orders;
  ob public.payment_obligations;
  receipt public.payment_receipts;
  orders integer;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  IF c.id IS NULL THEN RETURN 'order'; END IF;
  IF c.service_track IS DISTINCT FROM 'GUIDED' THEN RETURN 'not_guided'; END IF;
  SELECT count(*)::int INTO orders FROM public.service_orders candidate
  WHERE candidate.case_id = c.id
    AND candidate.customer_id = c.customer_id
    AND candidate.business_id = c.business_id
    AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT'
    AND (candidate.location_id IS NULL OR candidate.location_id = c.location_id);
  IF orders IS DISTINCT FROM 1 THEN RETURN 'order'; END IF;
  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id
    AND candidate.customer_id = c.customer_id
    AND candidate.business_id = c.business_id
    AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT'
    AND (candidate.location_id IS NULL OR candidate.location_id = c.location_id);
  IF ord.currency IS DISTINCT FROM 'GBP'
    OR ord.payment_model IS DISTINCT FROM 'UPFRONT'
    OR ord.tax_behaviour NOT IN ('INCLUSIVE', 'NOT_APPLICABLE')
    OR NOT EXISTS (
      SELECT 1
      FROM public.quote_acceptances qa
      INNER JOIN public.quote_versions qv ON qv.id = qa.quote_version_id
      WHERE qa.id = ord.quote_acceptance_id
        AND qv.id = ord.quote_version_id
        AND qa.quote_id = ord.quote_id
        AND qv.quote_id = ord.quote_id
        AND qv.status = 'ACCEPTED'
        AND qv.customer_id = c.customer_id
        AND qv.business_id = c.business_id
        AND qv.case_id = c.id
        AND (qv.location_id IS NULL OR qv.location_id = c.location_id)
        AND (ord.location_id IS NULL OR ord.location_id = c.location_id)
        AND qv.service_code = ord.service_code
        AND qv.payment_model = 'UPFRONT'
        AND qv.currency = 'GBP'
        AND qa.currency = 'GBP'
        AND qv.tax_behaviour = ord.tax_behaviour
        AND qa.tax_behaviour = ord.tax_behaviour
        AND qv.total_amount_minor = ord.amount_minor
        AND qa.total_amount_minor = ord.amount_minor
        AND qv.tax_amount_minor = ord.tax_amount_minor
        AND qa.tax_amount_minor = ord.tax_amount_minor
        AND qv.standard_amount_minor = qv.discount_amount_minor + qv.quoted_subtotal_minor
        AND (
          (qv.discount_policy_id = 'NONE' AND qv.discount_bps = 0 AND qv.discount_amount_minor = 0)
          OR (
            qv.discount_policy_id = 'PAID_GUARD_MANAGED_20'
            AND qv.discount_bps = 2000
            AND qv.service_code IN ('MANAGED_RELAUNCH', 'MANAGED_REVIEW')
          )
        )
    )
  THEN RETURN 'order'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = c.customer_id AND m.business_id = c.business_id AND m.status = 'verified'
  ) OR NOT admin_private.contact_verified_v1(c.customer_id, 'email')
  THEN RETURN 'authority'; END IF;
  IF (SELECT count(*)::int FROM public.payment_obligations obligation
      WHERE obligation.service_order_id = ord.id AND obligation.kind = 'UPFRONT' AND obligation.state <> 'VOID')
    IS DISTINCT FROM 1
  THEN RETURN 'unpaid'; END IF;
  SELECT * INTO ob FROM public.payment_obligations obligation
  WHERE obligation.service_order_id = ord.id AND obligation.kind = 'UPFRONT' AND obligation.state <> 'VOID';
  IF ob.id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.payment_obligations obligation
      WHERE obligation.service_order_id = ord.id AND obligation.kind = 'UPFRONT' AND obligation.state = 'VOID'
    ) THEN RETURN 'refunded'; END IF;
    RETURN 'unpaid';
  END IF;
  IF ob.state IS DISTINCT FROM 'PAID' OR ob.customer_id IS DISTINCT FROM c.customer_id
    OR ob.case_id IS DISTINCT FROM c.id OR ob.amount_minor IS DISTINCT FROM ord.amount_minor
    OR ob.currency IS DISTINCT FROM 'GBP'
  THEN RETURN 'unpaid'; END IF;
  IF (SELECT count(*)::int FROM public.payment_receipts candidate WHERE candidate.obligation_id = ob.id) IS DISTINCT FROM 1
  THEN RETURN 'receipt'; END IF;
  SELECT * INTO receipt FROM public.payment_receipts WHERE obligation_id = ob.id;
  IF receipt.id IS NULL OR receipt.amount_minor IS DISTINCT FROM ob.amount_minor
    OR receipt.currency IS DISTINCT FROM 'GBP' OR receipt.customer_id IS DISTINCT FROM c.customer_id
    OR receipt.service_order_id IS DISTINCT FROM ord.id
    OR receipt.tax_behaviour IS DISTINCT FROM ord.tax_behaviour
    OR receipt.tax_amount_minor IS DISTINCT FROM ord.tax_amount_minor
  THEN RETURN 'receipt'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.guided_settlement_reason_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- NULL means a Guided pack has one staff-authored statement and one staff-authored
-- instruction document. Other tracks are not judged here.
CREATE FUNCTION admin_private.guided_pack_materials_reason_v1(p_pack uuid)
RETURNS text
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  p public.case_prepared_packs;
  track text;
  deliverables integer;
  instructions integer;
  untagged integer;
  bad_author integer;
  bad_evidence integer;
BEGIN
  SELECT * INTO p FROM public.case_prepared_packs WHERE id = p_pack;
  IF p.id IS NULL THEN RETURN 'pack'; END IF;
  SELECT service_track INTO track FROM public.cases WHERE id = p.case_id;
  IF track IS DISTINCT FROM 'GUIDED' THEN RETURN NULL; END IF;
  SELECT count(*)::int INTO untagged
  FROM public.case_prepared_pack_items i
  LEFT JOIN public.guided_pack_item_roles r ON r.item_id = i.id
  WHERE i.pack_id = p.id AND r.item_id IS NULL;
  IF untagged > 0 THEN RETURN 'role'; END IF;
  SELECT count(*)::int INTO deliverables
  FROM public.case_prepared_pack_items i
  INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
  WHERE i.pack_id = p.id AND r.role = 'DELIVERABLE';
  SELECT count(*)::int INTO instructions
  FROM public.case_prepared_pack_items i
  INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
  WHERE i.pack_id = p.id AND r.role = 'INSTRUCTIONS';
  IF deliverables IS DISTINCT FROM 1 THEN RETURN 'deliverable'; END IF;
  IF instructions IS DISTINCT FROM 1 THEN RETURN 'instructions'; END IF;
  IF (
    SELECT i.document_id FROM public.case_prepared_pack_items i
    INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
    WHERE i.pack_id = p.id AND r.role = 'DELIVERABLE'
  ) IS NOT DISTINCT FROM (
    SELECT i.document_id FROM public.case_prepared_pack_items i
    INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
    WHERE i.pack_id = p.id AND r.role = 'INSTRUCTIONS'
  ) THEN RETURN 'document'; END IF;
  SELECT count(*)::int INTO bad_author
  FROM public.case_prepared_pack_items i
  INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
  INNER JOIN public.case_document_versions v ON v.id = i.version_id
  INNER JOIN public.case_documents d ON d.id = i.document_id
  WHERE i.pack_id = p.id
    AND r.role IN ('DELIVERABLE', 'INSTRUCTIONS')
    AND (
      v.submission_source IS DISTINCT FROM 'ADMIN'
      OR v.customer_evidence_request_id IS NOT NULL
      OR d.case_id IS DISTINCT FROM p.case_id
    );
  IF bad_author > 0 THEN RETURN 'author'; END IF;
  SELECT count(*)::int INTO bad_evidence
  FROM public.case_prepared_pack_items i
  INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
  INNER JOIN public.case_document_versions v ON v.id = i.version_id
  INNER JOIN public.case_documents d ON d.id = i.document_id
  WHERE i.pack_id = p.id
    AND r.role = 'EVIDENCE'
    AND (
      d.case_id IS DISTINCT FROM p.case_id
      OR v.submission_source NOT IN ('ADMIN', 'CUSTOMER')
      OR (v.submission_source = 'CUSTOMER' AND v.customer_evidence_request_id IS NULL)
    );
  IF bad_evidence > 0 THEN RETURN 'evidence'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.guided_pack_materials_reason_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.pack_publishable_v1(p_pack uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE p public.case_prepared_packs; item_count integer; reason text;
BEGIN
  IF p_pack IS NULL THEN RETURN false; END IF;
  SELECT * INTO p FROM public.case_prepared_packs WHERE id = p_pack;
  IF p.id IS NULL OR p.status <> 'APPROVED' THEN RETURN false; END IF;
  SELECT count(*)::int INTO item_count FROM public.case_prepared_pack_items WHERE pack_id = p.id;
  IF item_count < 1 THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.case_prepared_pack_items i
    INNER JOIN public.case_document_versions v ON v.id = i.version_id
    INNER JOIN public.case_documents d ON d.id = i.document_id
    WHERE i.pack_id = p.id AND (
      d.case_id <> p.case_id OR v.document_id <> d.id
      OR v.upload_status <> 'UPLOADED' OR v.scan_status <> 'NO_THREATS_FOUND'
      OR v.validation_status <> 'VALID' OR v.review_status <> 'ACCEPTED'
      OR v.customer_visible IS DISTINCT FROM true
    )
  ) THEN RETURN false; END IF;
  IF admin_private.guided_pack_materials_reason_v1(p.id) IS NOT NULL THEN RETURN false; END IF;
  reason := admin_private.guided_settlement_reason_v1(p.case_id);
  RETURN reason IS NULL OR reason = 'not_guided';
END; $$;
REVOKE ALL ON FUNCTION admin_private.pack_publishable_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION admin_private.customer_published_pack_documents_v1(p_case uuid)
RETURNS TABLE (
  pack_id uuid, pack_number integer, published_at timestamptz, item_id uuid, item_position integer,
  document_title text, original_filename text, content_type text, size_bytes bigint,
  version_id uuid, storage_bucket text, storage_key text
)
LANGUAGE sql STABLE SET search_path='' AS $$
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
    AND d.case_id = p_case
    AND v.document_id = d.id
    AND v.upload_status = 'UPLOADED'
    AND v.scan_status = 'NO_THREATS_FOUND'
    AND v.validation_status = 'VALID'
    AND v.review_status = 'ACCEPTED'
    AND v.customer_visible IS TRUE
    AND admin_private.pack_publishable_v1(p.id);
$$;
REVOKE ALL ON FUNCTION admin_private.customer_published_pack_documents_v1(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.fulfilment_page_count_v1(p_body text, p_page text)
RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_page NOT IN ('payments', 'documents') OR p_body IS NULL THEN 0
    ELSE (
      SELECT count(*)::int FROM regexp_matches(
        p_body,
        'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/' || p_page,
        'g'
      )
    )
  END;
$$;
REVOKE ALL ON FUNCTION admin_private.fulfilment_page_count_v1(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.fulfilment_snapshot_reason_v1(
  p_case uuid, p_template text, p_subject text, p_text text, p_html text, p_origin text
) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  c public.cases;
  ord public.service_orders;
  page text;
  button text;
  expected text;
  amount_label text;
  service_name text;
  stripped text;
  settlement text;
BEGIN
  settlement := admin_private.guided_settlement_reason_v1(p_case);
  IF settlement IS NOT NULL THEN RETURN settlement; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT';
  service_name := CASE ord.service_code WHEN 'GUIDED_RELAUNCH' THEN 'Guided Relaunch' ELSE 'Guided Review' END;
  amount_label := '£' || (ord.amount_minor / 100)::text || '.' || lpad((ord.amount_minor % 100)::text, 2, '0') || ' GBP';
  IF p_template = 'PAYMENT_CONFIRMATION' THEN
    page := 'payments';
    button := 'View your receipt';
  ELSIF p_template = 'GUIDED_PACK_READY' THEN
    page := 'documents';
    button := 'View your completed pack';
  ELSE
    RETURN 'template';
  END IF;
  expected := p_origin || '/portal/cases/' || c.public_ref || '/' || page;
  IF p_origin !~ '^https://[A-Za-z0-9.-]+$'
    OR p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 8 AND 200
    OR position(c.public_ref IN p_subject) = 0
    OR (p_template = 'PAYMENT_CONFIRMATION' AND position(ord.public_ref IN p_subject) = 0)
    OR position(service_name IN coalesce(p_text, '')) = 0
    OR position(amount_label IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_html, '')) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN coalesce(p_text, '')) = 0
    OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN coalesce(p_text, '')) = 0
    OR position('#t=' IN coalesce(p_subject, '') || coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('/action/' IN coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('pi_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR position('cus_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR admin_private.fulfilment_page_count_v1(p_text, page) IS DISTINCT FROM 1
    OR admin_private.fulfilment_page_count_v1(p_html, page) IS DISTINCT FROM 1
    OR position(expected IN coalesce(p_text, '')) = 0
    OR position(expected IN coalesce(p_html, '')) = 0
    OR position('reply to this email' IN lower(coalesce(p_text, ''))) = 0
    OR position('reply to this email' IN lower(coalesce(p_html, ''))) = 0
  THEN RETURN 'snapshot'; END IF;
  IF p_template = 'GUIDED_PACK_READY' AND position(
    'You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you.'
    IN coalesce(p_text, '')
  ) = 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_text, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_html, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.fulfilment_snapshot_reason_v1(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.protect_fulfilment_email_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE reason text; upload text; origin text;
BEGIN
  IF NEW.template_key IS NULL OR NEW.template_key NOT IN ('PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY') THEN
    RETURN NEW;
  END IF;
  IF NEW.lifecycle IS DISTINCT FROM 'QUEUED' OR NEW.content_locked IS NOT TRUE OR NEW.template_version IS DISTINCT FROM 1
    OR NEW.case_id IS NULL
  THEN
    RAISE EXCEPTION 'fulfilment_email:invalid' USING ERRCODE = 'P0001';
  END IF;
  upload := substring(NEW.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
  origin := regexp_replace(coalesce(upload, ''), '/portal/cases/.*$', '');
  reason := admin_private.fulfilment_snapshot_reason_v1(
    NEW.case_id, NEW.template_key, NEW.subject, NEW.body_text, NEW.body_html, origin
  );
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION 'fulfilment_email:%', reason USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.protect_fulfilment_email_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS communications_fulfilment_email_guard ON public.communications;
CREATE TRIGGER communications_fulfilment_email_guard
  BEFORE INSERT ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.protect_fulfilment_email_v1();

CREATE FUNCTION admin_private.queue_fulfilment_email_v1(
  p_case uuid, p_template text, p_actor uuid, p_subject text, p_text text, p_html text,
  p_from text, p_reply text, p_origin text
) RETURNS uuid
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  c public.cases;
  customer public.customers;
  comm public.communications;
  reply_to text;
BEGIN
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  SELECT * INTO customer FROM public.customers WHERE id = c.customer_id;
  reply_to := NULLIF(btrim(coalesce(p_reply, '')), '');
  INSERT INTO public.communications(
    case_id, customer_id, business_id, channel, communication_type, direction, recipient,
    subject, body_text, body_html, status, lifecycle, delivery_status, template_key, template_version,
    author_id, reviewer_id, reviewed_at, queued_at, sender_address, reply_to_address,
    content_version, record_version, content_locked
  ) VALUES (
    c.id, c.customer_id, c.business_id, 'EMAIL', p_template, 'OUTBOUND',
    admin_private.normalize_email_v1(customer.email),
    p_subject, p_text, p_html, 'PENDING', 'QUEUED', 'NONE', p_template, 1,
    p_actor, p_actor, now(), now(), lower(btrim(p_from)), reply_to,
    1, 1, true
  ) RETURNING * INTO comm;
  PERFORM admin_private.enqueue_outbox_v1(
    'send-email:' || comm.id::text || ':v' || comm.content_version::text,
    'SEND_EMAIL', 'communication', comm.id,
    jsonb_build_object('communicationId', comm.id, 'contentVersion', comm.content_version)
  );
  PERFORM admin_private.append_delivery_event_v1(comm.id, 'QUEUED', 'Customer email queued for the provider');
  RETURN comm.id;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.queue_fulfilment_email_v1(uuid, text, uuid, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.payment_confirmation_context_v1(p_payment_intent text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  receipt public.payment_receipts;
  ord public.service_orders;
  c public.cases;
  reason text;
BEGIN
  IF p_payment_intent IS NULL OR p_payment_intent !~ '^pi_[A-Za-z0-9_]+$' THEN
    RETURN jsonb_build_object('status', 'not_applicable');
  END IF;
  SELECT * INTO receipt FROM public.payment_receipts WHERE stripe_payment_intent_id = p_payment_intent;
  IF receipt.id IS NULL THEN RETURN jsonb_build_object('status', 'not_applicable'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = receipt.service_order_id;
  IF ord.id IS NULL OR ord.service_code NOT IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW') OR ord.payment_model IS DISTINCT FROM 'UPFRONT' THEN
    RETURN jsonb_build_object('status', 'not_applicable');
  END IF;
  SELECT * INTO c FROM public.cases WHERE id = ord.case_id;
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'not_applicable'); END IF;
  reason := admin_private.guided_settlement_reason_v1(c.id);
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('status', 'not_applicable', 'reason', reason); END IF;
  RETURN jsonb_build_object(
    'status', 'applicable',
    'receiptId', receipt.id,
    'caseId', c.id,
    'caseRef', c.public_ref,
    'orderRef', ord.public_ref,
    'amountMinor', ord.amount_minor,
    'currency', 'GBP',
    'serviceCode', ord.service_code,
    'serviceName', CASE ord.service_code WHEN 'GUIDED_RELAUNCH' THEN 'Guided Relaunch' ELSE 'Guided Review' END,
    'alreadyQueued', EXISTS (SELECT 1 FROM public.guided_payment_confirmations existing WHERE existing.receipt_id = receipt.id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.payment_confirmation_context_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_confirmation_context_v1(text) TO service_role;

CREATE FUNCTION public.payment_queue_confirmation_v1(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  receipt public.payment_receipts;
  ord public.service_orders;
  c public.cases;
  existing public.guided_payment_confirmations;
  reason text;
  comm uuid;
  reply_to text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR p_payload->>'sendEnabled' IS DISTINCT FROM 'true'
    OR p_payload->>'paymentIntentId' IS NULL
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO receipt FROM public.payment_receipts
  WHERE stripe_payment_intent_id = p_payload->>'paymentIntentId' FOR UPDATE;
  IF receipt.id IS NULL THEN RETURN jsonb_build_object('status', 'not_applicable'); END IF;
  SELECT * INTO existing FROM public.guided_payment_confirmations WHERE receipt_id = receipt.id;
  IF existing.receipt_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'id', existing.communication_id, 'replay', true);
  END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = receipt.service_order_id;
  SELECT * INTO c FROM public.cases WHERE id = ord.case_id;
  IF c.id IS NULL OR ord.service_code NOT IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW') THEN
    RETURN jsonb_build_object('status', 'not_applicable');
  END IF;
  reply_to := NULLIF(lower(btrim(coalesce(p_payload->>'replyTo', ''))), '');
  IF reply_to IS NULL OR length(reply_to) > 254 OR reply_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'reply_to');
  END IF;
  reason := admin_private.fulfilment_snapshot_reason_v1(
    c.id, 'PAYMENT_CONFIRMATION', p_payload->>'subject', p_payload->>'bodyText', p_payload->>'bodyHtml', p_payload->>'customerOrigin'
  );
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', reason); END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.email_suppressions sup
    JOIN public.customers customer ON customer.id = c.customer_id
    WHERE sup.address_normalized = admin_private.normalize_email_v1(customer.email)
  ) THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'suppressed'); END IF;
  comm := admin_private.queue_fulfilment_email_v1(
    c.id, 'PAYMENT_CONFIRMATION', c.customer_id, p_payload->>'subject', p_payload->>'bodyText', p_payload->>'bodyHtml',
    p_payload->>'fromAddress', reply_to, p_payload->>'customerOrigin'
  );
  INSERT INTO public.guided_payment_confirmations(receipt_id, communication_id) VALUES (receipt.id, comm);
  PERFORM admin_private.write_record_audit_v1(
    c.customer_id, 'COMMUNICATION_CHANGED', 'success', comm, extensions.gen_random_uuid(), 'communication',
    'Queued the payment confirmation. The provider has not accepted it.',
    jsonb_build_object('operation', 'payment_confirmation', 'receiptId', receipt.id)
  );
  RETURN jsonb_build_object('status', 'success', 'id', comm, 'replay', false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO existing FROM public.guided_payment_confirmations WHERE receipt_id = receipt.id;
    IF existing.receipt_id IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'success', 'id', existing.communication_id, 'replay', true);
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  WHEN raise_exception THEN
    IF left(SQLERRM, 17) = 'fulfilment_email:' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', substr(SQLERRM, 18));
    END IF;
    RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.payment_queue_confirmation_v1(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_queue_confirmation_v1(jsonb) TO service_role;

CREATE FUNCTION admin_private.queue_guided_pack_ready_v1(
  p_case uuid, p_pack uuid, p_actor uuid, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE
  existing public.guided_pack_announcements;
  keys text[] := ARRAY['subject', 'bodyText', 'bodyHtml', 'fromAddress', 'customerOrigin', 'sendEnabled'];
  present integer;
  reason text;
  comm uuid;
  reply_to text;
BEGIN
  SELECT * INTO existing FROM public.guided_pack_announcements WHERE pack_id = p_pack;
  IF existing.pack_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'id', existing.communication_id, 'replay', true);
  END IF;
  SELECT count(*)::int INTO present FROM unnest(keys) key WHERE p_data ? key;
  IF present = 0 THEN RETURN jsonb_build_object('status', 'skipped'); END IF;
  IF present IS DISTINCT FROM array_length(keys, 1) OR p_data->>'sendEnabled' IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  reply_to := NULLIF(lower(btrim(coalesce(p_data->>'replyTo', ''))), '');
  IF reply_to IS NULL OR length(reply_to) > 254 OR reply_to !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'reply_to');
  END IF;
  reason := admin_private.fulfilment_snapshot_reason_v1(
    p_case, 'GUIDED_PACK_READY', p_data->>'subject', p_data->>'bodyText', p_data->>'bodyHtml', p_data->>'customerOrigin'
  );
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', reason); END IF;
  comm := admin_private.queue_fulfilment_email_v1(
    p_case, 'GUIDED_PACK_READY', p_actor, p_data->>'subject', p_data->>'bodyText', p_data->>'bodyHtml',
    p_data->>'fromAddress', reply_to, p_data->>'customerOrigin'
  );
  INSERT INTO public.guided_pack_announcements(pack_id, communication_id) VALUES (p_pack, comm);
  RETURN jsonb_build_object('status', 'success', 'id', comm, 'replay', false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO existing FROM public.guided_pack_announcements WHERE pack_id = p_pack;
    IF existing.pack_id IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'success', 'id', existing.communication_id, 'replay', true);
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  WHEN raise_exception THEN
    IF left(SQLERRM, 17) = 'fulfilment_email:' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', substr(SQLERRM, 18));
    END IF;
    RAISE;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.queue_guided_pack_ready_v1(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_guided_pack_mail_context_v1(p_token text, p_case uuid, p_pack uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  c public.cases;
  p public.case_prepared_packs;
  ord public.service_orders;
  reason text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  SELECT * INTO p FROM public.case_prepared_packs WHERE id = p_pack AND case_id = p_case;
  IF c.id IS NULL OR p.id IS NULL THEN RETURN jsonb_build_object('status', 'not_applicable'); END IF;
  reason := admin_private.guided_settlement_reason_v1(c.id);
  IF reason = 'not_guided' THEN RETURN jsonb_build_object('status', 'not_guided'); END IF;
  IF reason IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', reason); END IF;
  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
    AND candidate.payment_model = 'UPFRONT';
  RETURN jsonb_build_object(
    'status', 'applicable',
    'caseRef', c.public_ref,
    'orderRef', ord.public_ref,
    'amountMinor', ord.amount_minor,
    'currency', 'GBP',
    'serviceCode', ord.service_code,
    'serviceName', CASE ord.service_code WHEN 'GUIDED_RELAUNCH' THEN 'Guided Relaunch' ELSE 'Guided Review' END
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_guided_pack_mail_context_v1(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_guided_pack_mail_context_v1(text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_prepared_pack_command_v1(
  p_token text, p_request uuid, p_case uuid, p_pack uuid, p_version integer, p_operation text, p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; c public.cases; p public.case_prepared_packs; actor uuid; fp text; cached jsonb; result jsonb;
  data jsonb; target_version uuid; item public.case_prepared_pack_items; doc public.case_documents; ver public.case_document_versions;
  next_no integer; next_pos integer; item_count integer; old_pos integer; new_pos integer; note text;
  prev public.case_prepared_packs; ids uuid[]; idx integer; n integer; i integer;
  commercial text; mail jsonb; materials text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_case IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create','add_item','remove_item','move_item','approve','publish','unpublish','send_pack_email')
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
    IF (data - 'confirmed' - 'note' - 'subject' - 'bodyText' - 'bodyHtml' - 'fromAddress' - 'replyTo' - 'customerOrigin' - 'sendEnabled') <> '{}'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    commercial := admin_private.guided_settlement_reason_v1(c.id);
    IF commercial IS NOT NULL AND commercial IS DISTINCT FROM 'not_guided' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', commercial);
    END IF;
    materials := admin_private.guided_pack_materials_reason_v1(p.id);
    IF materials IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', materials); END IF;
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
    RAISE;
END; $$;
REVOKE ALL ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prepared_pack_command_v1(text, uuid, uuid, uuid, integer, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.communication_load_send_v1(p_communication uuid, p_content_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.communications; origin text; upload text;
BEGIN
  IF p_communication IS NULL OR p_content_version IS NULL OR p_content_version < 1 THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO row FROM public.communications WHERE id = p_communication;
  IF row.id IS NULL OR row.lifecycle IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.lifecycle <> 'QUEUED' OR row.content_locked IS NOT TRUE OR row.content_version <> p_content_version
    OR btrim(coalesce(row.recipient, '')) = '' OR btrim(coalesce(row.subject, '')) = ''
    OR btrim(coalesce(row.body_text, '')) = '' OR btrim(coalesce(row.sender_address, '')) = ''
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF row.template_key IN ('EVIDENCE_REQUEST', 'QUOTE_OFFER') THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f-]{36}');
    IF upload IS NULL OR position('#t=' in row.body_text) > 0 OR position('#t=' in coalesce(row.body_html, '')) > 0 THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    origin := regexp_replace(upload, '/action/.*$', '');
  ELSIF row.template_key = 'GUIDED_PAYMENT_REQUEST' THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/payments');
    IF upload IS NULL
      OR position('#t=' in row.body_text) > 0
      OR position('#t=' in coalesce(row.body_html, '')) > 0
      OR position('/action/' in row.body_text) > 0
      OR position('/action/' in coalesce(row.body_html, '')) > 0
    THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    origin := regexp_replace(upload, '/portal/cases/.*$', '');
  ELSIF row.template_key IN ('PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY') THEN
    upload := substring(row.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    IF upload IS NULL OR position('#t=' in row.body_text) > 0 OR position('#t=' in coalesce(row.body_html, '')) > 0
      OR position('/action/' in row.body_text) > 0 OR position('/action/' in coalesce(row.body_html, '')) > 0
    THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    origin := regexp_replace(upload, '/portal/cases/.*$', '');
  END IF;
  RETURN jsonb_build_object(
    'status', 'success',
    'communicationId', row.id,
    'lifecycle', row.lifecycle,
    'deliveryStatus', coalesce(row.delivery_status, 'NONE'),
    'contentVersion', row.content_version,
    'contentLocked', row.content_locked,
    'recipient', row.recipient,
    'subject', row.subject,
    'bodyText', row.body_text,
    'bodyHtml', row.body_html,
    'templateKey', row.template_key,
    'customerActionId', row.customer_action_id,
    'customerOrigin', origin,
    'senderAddress', row.sender_address,
    'replyToAddress', row.reply_to_address,
    'inReplyTo', row.in_reply_to,
    'referencesHeader', row.references_header,
    'rfcMessageId', row.rfc_message_id,
    'linkKeyVersion', row.link_key_version,
    'firstProviderAttemptAt', row.first_provider_attempt_at,
    'suppressed', EXISTS (
      SELECT 1 FROM admin_private.email_suppressions s
      WHERE s.address_normalized = admin_private.normalize_email_v1(row.recipient)
    )
  );
END; $$;

REVOKE ALL ON FUNCTION public.communication_load_send_v1(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.communication_load_send_v1(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_dev_send_email_claim_v1(
  p_token text,
  p_request uuid,
  p_communication uuid,
  p_confirmed boolean,
  p_customer_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fp text;
  cached jsonb;
  current_status text;
  v_key text;
  comm public.communications;
  expected text;
  text_upload text;
  html_upload text;
  text_urls integer;
  html_urls integer;
  outbox admin_private.job_outbox;
  row admin_private.jobs;
  token uuid;
  attempt_no integer;
  case_ref text;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'reauth_required', NULL, p_request, 'job',
      'DEV email processing requires a sign-in within the last 30 minutes',
      jsonb_build_object('operation', 'dev_send_email')
    );
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_communication IS NULL OR coalesce(p_confirmed, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO comm FROM public.communications WHERE id = p_communication FOR UPDATE;
  IF comm.id IS NULL OR comm.lifecycle IS DISTINCT FROM 'QUEUED' OR comm.content_locked IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  v_key := 'send-email:' || comm.id::text || ':v' || comm.content_version::text;
  IF length(v_key) > 200 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array('dev_send_email', p_communication)::text);
  cached := admin_private.job_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    current_status := NULL;
    IF cached ? 'jobId' THEN
      SELECT j.status INTO current_status FROM admin_private.jobs j WHERE j.id = (cached->>'jobId')::uuid;
    END IF;
    RETURN (cached - 'leaseToken')
      || jsonb_build_object('replay', true, 'currentJobStatus', current_status)
      || '{"leaseToken":null}'::jsonb;
  END IF;

  IF comm.template_key IN ('EVIDENCE_REQUEST', 'QUOTE_OFFER') THEN
    expected := coalesce(p_customer_origin, '') || '/action/' || coalesce(comm.customer_action_id::text, '');
    text_upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    html_upload := substring(coalesce(comm.body_html, '') from 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}');
    SELECT count(*)::integer INTO text_urls
      FROM regexp_matches(comm.body_text, 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    SELECT count(*)::integer INTO html_urls
      FROM regexp_matches(coalesce(comm.body_html, ''), 'https://[A-Za-z0-9.-]+/action/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g');
    IF comm.body_html IS NULL
      OR text_urls IS DISTINCT FROM 1
      OR html_urls IS DISTINCT FROM 1
      OR text_upload IS DISTINCT FROM expected
      OR html_upload IS DISTINCT FROM expected
      OR position('#t=' in comm.body_text) > 0
      OR position('#t=' in coalesce(comm.body_html, '')) > 0
    THEN
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing left an evidence request whose upload link is not the development customer portal',
        jsonb_build_object('operation', 'dev_send_email', 'reason', 'origin')
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'origin');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  ELSIF comm.template_key = 'GUIDED_PAYMENT_REQUEST' THEN
    SELECT cs.public_ref INTO case_ref FROM public.cases cs WHERE cs.id = comm.case_id;
    expected := coalesce(p_customer_origin, '') || '/portal/cases/' || coalesce(case_ref, '') || '/payments';
    IF comm.body_html IS NULL
      OR case_ref IS NULL
      OR position(expected IN comm.body_text) = 0
      OR position(expected IN comm.body_html) = 0
      OR (length(comm.body_text) - length(replace(comm.body_text, expected, ''))) IS DISTINCT FROM length(expected)
      OR (length(comm.body_html) - length(replace(comm.body_html, expected, ''))) IS DISTINCT FROM length(expected)
      OR position('#t=' IN comm.body_text) > 0
      OR position('#t=' IN comm.body_html) > 0
      OR position('/action/' IN comm.body_text) > 0
      OR position('/action/' IN comm.body_html) > 0
    THEN
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing left a payment request whose portal link is not the development customer portal',
        jsonb_build_object('operation', 'dev_send_email', 'reason', 'origin')
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'origin');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  END IF;

  IF comm.template_key IN ('PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY') THEN
    expected := CASE comm.template_key WHEN 'PAYMENT_CONFIRMATION' THEN 'payments' ELSE 'documents' END;
    text_upload := substring(comm.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    html_upload := substring(coalesce(comm.body_html, '') from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/(?:payments|documents)');
    text_urls := admin_private.fulfilment_page_count_v1(comm.body_text, expected);
    html_urls := admin_private.fulfilment_page_count_v1(comm.body_html, expected);
    IF comm.body_html IS NULL
      OR text_urls IS DISTINCT FROM 1
      OR html_urls IS DISTINCT FROM 1
      OR text_upload IS DISTINCT FROM html_upload
      OR text_upload IS NULL
      OR position(coalesce(p_customer_origin, '') || '/portal/cases/' IN text_upload) IS DISTINCT FROM 1
      OR right(text_upload, length(expected)) IS DISTINCT FROM expected
      OR position('#t=' in comm.body_text) > 0
      OR position('#t=' in comm.body_html) > 0
      OR position('/action/' in comm.body_text) > 0
      OR position('/action/' in comm.body_html) > 0
    THEN
      PERFORM admin_private.write_record_audit_v1(
        actor, 'OPERATIONS_CHANGED', 'denied', comm.id, p_request, 'communication',
        'DEV email processing left a customer page that is not the confirmed portal',
        jsonb_build_object('operation', 'dev_send_email', 'reason', 'origin')
      );
      result := jsonb_build_object('status', 'denied', 'reason', 'origin');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
  END IF;

  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = v_key FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM admin_private.job_outbox WHERE event_key = v_key) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'locked');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_queued');
  END IF;
  IF outbox.topic IS DISTINCT FROM 'SEND_EMAIL'
    OR outbox.aggregate_id IS DISTINCT FROM comm.id
    OR outbox.payload->>'communicationId' IS DISTINCT FROM comm.id::text
    OR outbox.payload->>'contentVersion' IS DISTINCT FROM comm.content_version::text
  THEN
    PERFORM admin_private.write_record_audit_v1(
      actor, 'OPERATIONS_CHANGED', 'denied', outbox.id, p_request, 'job',
      'DEV email processing refused a job that is not the queued communication',
      jsonb_build_object('operation', 'dev_send_email', 'reason', 'not_send_email')
    );
    result := jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF outbox.promoted_at IS NULL AND outbox.available_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
  END IF;

  IF outbox.promoted_at IS NULL THEN
    INSERT INTO admin_private.jobs(outbox_id, job_type, idempotency_key, payload, status, scheduled_at)
    VALUES (outbox.id, 'SEND_EMAIL', outbox.event_key, outbox.payload, 'PENDING', outbox.available_at)
    ON CONFLICT (outbox_id) DO NOTHING;
    UPDATE admin_private.job_outbox
      SET promoted_at = now(), last_error = NULL
      WHERE id = outbox.id AND promoted_at IS NULL;
  END IF;

  SELECT * INTO row FROM admin_private.jobs WHERE outbox_id = outbox.id FOR UPDATE;
  IF row.id IS NULL OR row.job_type IS DISTINCT FROM 'SEND_EMAIL' OR row.idempotency_key IS DISTINCT FROM v_key THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'not_send_email');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'SUCCEEDED' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'DEAD_LETTER' THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status = 'RUNNING' AND row.lease_expires_at IS NOT NULL AND row.lease_expires_at >= now() THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased', 'jobId', row.id);
  END IF;
  IF comm.delivery_status IN ('PROVIDER_ACCEPTED', 'DELIVERED', 'TRANSIENT_BOUNCE', 'UNDETERMINED_BOUNCE') THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'already_processed', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF comm.delivery_status = 'ACCEPTANCE_UNKNOWN' OR comm.first_provider_attempt_at IS NOT NULL THEN
    result := jsonb_build_object('status', 'denied', 'reason', 'acceptance_unknown', 'jobId', row.id, 'jobStatus', row.status);
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;
  IF row.status IN ('PENDING', 'RETRY') AND row.scheduled_at > now() THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready', 'jobId', row.id);
  END IF;

  IF row.status = 'RUNNING' THEN
    IF row.attempts >= row.max_attempts THEN
      PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'DEAD_LETTER', 'Maximum attempts exhausted after worker lease expiry');
      UPDATE admin_private.jobs
        SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
            lease_owner = NULL, lease_token = NULL,
            last_error = 'Maximum attempts exhausted after worker lease expiry',
            updated_at = now(), record_version = row.record_version + 1
        WHERE id = row.id AND status = 'RUNNING';
      result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
      INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    PERFORM admin_private.finish_job_attempt_v1(row.id, row.lease_token, 'LEASE_EXPIRED', 'Lease expired before completion');
  ELSIF row.attempts >= row.max_attempts THEN
    UPDATE admin_private.jobs
      SET status = 'DEAD_LETTER', dead_lettered_at = now(), lease_expires_at = NULL,
          lease_owner = NULL, lease_token = NULL,
          last_error = 'Maximum attempts exhausted after worker lease expiry',
          updated_at = now(), record_version = row.record_version + 1
      WHERE id = row.id AND status IN ('PENDING', 'RETRY');
    result := jsonb_build_object('status', 'denied', 'reason', 'dead_letter', 'jobId', row.id, 'jobStatus', 'DEAD_LETTER');
    INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  token := gen_random_uuid();
  SELECT coalesce(max(a.attempt_number), 0) + 1 INTO attempt_no
  FROM admin_private.job_attempts a WHERE a.job_id = row.id;
  UPDATE admin_private.jobs
    SET status = 'RUNNING', claimed_at = now(),
        lease_expires_at = now() + make_interval(secs => 120),
        lease_owner = 'dev-send-email', lease_token = token,
        attempts = row.attempts + 1, updated_at = now(),
        record_version = row.record_version + 1
    WHERE id = row.id AND attempts < max_attempts
    RETURNING * INTO row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'leased');
  END IF;
  INSERT INTO admin_private.job_attempts(job_id, attempt_number, lease_owner, lease_token, deployment_id)
  VALUES (row.id, attempt_no, 'dev-send-email', token, NULL);

  result := jsonb_build_object(
    'status', 'success',
    'replay', false,
    'jobId', row.id,
    'jobType', row.job_type,
    'idempotencyKey', row.idempotency_key,
    'payload', row.payload,
    'leaseToken', token,
    'attemptNumber', row.attempts,
    'attempts', row.attempts,
    'maxAttempts', row.max_attempts
  );
  PERFORM admin_private.write_record_audit_v1(
    actor, 'OPERATIONS_CHANGED', 'success', row.id, p_request, 'job',
    'DEV email processing claimed one queued communication',
    jsonb_build_object('operation', 'dev_send_email', 'jobType', 'SEND_EMAIL')
  );
  INSERT INTO admin_private.job_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dev_send_email_claim_v1(text, uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_dev_send_email_claim_v1(text, uuid, uuid, boolean, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.customer_portal_case_documents_v1(p_token_hash text, p_reference text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_customer uuid; v_auth uuid; v_email text; v_case uuid; cs public.cases;
  b public.businesses; loc public.locations; body jsonb; p public.case_prepared_packs;
  ord public.service_orders; pack_json jsonb; selectors jsonb; reason text;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer;
  IF cs.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO b FROM public.businesses WHERE id = cs.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = cs.location_id AND business_id = cs.business_id;
  IF b.id IS NULL OR loc.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  body := admin_private.customer_portal_case_evidence_v1(cs.id);
  reason := admin_private.guided_settlement_reason_v1(cs.id);
  pack_json := NULL;
  IF cs.service_track = 'GUIDED' AND reason IS NOT NULL THEN
    body := jsonb_set(body, '{documents}', '[]'::jsonb);
  ELSIF cs.service_track = 'GUIDED' AND reason IS NULL THEN
    SELECT * INTO p FROM public.case_prepared_packs
    WHERE case_id = cs.id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
    LIMIT 1;
    IF p.id IS NOT NULL AND admin_private.pack_publishable_v1(p.id) THEN
      SELECT * INTO ord FROM public.service_orders candidate
      WHERE candidate.case_id = cs.id AND candidate.service_code IN ('GUIDED_RELAUNCH', 'GUIDED_REVIEW')
        AND candidate.payment_model = 'UPFRONT';
      SELECT coalesce(jsonb_agg('pd-' || i.position::text ORDER BY i.position), '[]'::jsonb) INTO selectors
      FROM public.case_prepared_pack_items i
      INNER JOIN public.guided_pack_item_roles r ON r.item_id = i.id
      WHERE i.pack_id = p.id AND r.role = 'INSTRUCTIONS';
      pack_json := jsonb_build_object(
        'title', CASE ord.service_code WHEN 'GUIDED_REVIEW' THEN 'Guided Review submission pack' ELSE 'Guided Relaunch submission pack' END,
        'serviceName', CASE ord.service_code WHEN 'GUIDED_REVIEW' THEN 'Guided Review' ELSE 'Guided Relaunch' END,
        'packNumber', p.pack_number,
        'instructions', 'You submit this pack to Google yourself. ProfileRelaunch does not submit Guided work and does not sign in to Google for you.',
        'instructionSelectors', coalesce(selectors, '[]'::jsonb),
        'customerSubmitted', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION'
        ),
        'correctionRequested', EXISTS (
          SELECT 1 FROM public.guided_customer_reports report
          INNER JOIN public.case_tasks task ON task.id = report.task_id
          WHERE report.pack_id = p.id AND report.kind = 'CORRECTION' AND task.status = 'OPEN'
        )
      );
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'case', jsonb_build_object(
      'reference', cs.public_ref,
      'caseType', cs.case_type,
      'serviceTrack', cs.service_track,
      'businessName', b.display_name,
      'locationName', loc.location_name
    ),
    'requests', body->'requests',
    'submissions', body->'submissions',
    'documents', body->'documents',
    'pack', pack_json
  );
END; $$;

CREATE FUNCTION public.customer_portal_guided_handover_v1(
  p_token_hash text, p_request uuid, p_reference text, p_operation text, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_customer uuid; v_auth uuid; v_email text; v_case uuid;
  cs public.cases; p public.case_prepared_packs; fp text; cached jsonb; result jsonb;
  note text; reference text; submitted date; task_id uuid;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL THEN RETURN NULL; END IF;
  IF p_request IS NULL OR p_operation NOT IN ('request_correction', 'report_submission')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  fp := md5(jsonb_build_array(p_reference, p_operation, p_data)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT response INTO cached FROM admin_private.guided_handover_receipts
  WHERE request_id = p_request AND actor_id = v_auth AND fingerprint = fp;
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  IF EXISTS (SELECT 1 FROM admin_private.guided_handover_receipts WHERE request_id = p_request) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO cs FROM public.cases WHERE id = v_case AND customer_id = v_customer FOR UPDATE;
  IF cs.id IS NULL OR cs.service_track IS DISTINCT FROM 'GUIDED' OR cs.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF admin_private.guided_settlement_reason_v1(cs.id) IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'unavailable');
  END IF;
  SELECT * INTO p FROM public.case_prepared_packs
  WHERE case_id = cs.id AND status = 'APPROVED' AND published_at IS NOT NULL AND unpublished_at IS NULL
  LIMIT 1;
  IF p.id IS NULL OR NOT admin_private.pack_publishable_v1(p.id) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  note := btrim(coalesce(p_data->>'note', ''));
  IF length(note) NOT BETWEEN 10 AND 2000 OR (p_data - 'note' - 'submittedOn' - 'googleReference') <> '{}'::jsonb THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_operation = 'request_correction' THEN
    IF p_data ? 'submittedOn' OR p_data ? 'googleReference' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.guided_customer_reports report
      INNER JOIN public.case_tasks task ON task.id = report.task_id
      WHERE report.pack_id = p.id AND report.kind = 'CORRECTION' AND task.status = 'OPEN'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.case_tasks(
      case_id, title, owner, kind, due_at, deadline_source, deadline_timezone, reminder_policy
    ) VALUES (
      cs.id, 'Review a correction to the Guided pack', 'ADMIN', 'FOLLOW_UP', now() + interval '2 days',
      'The customer asked for a correction before submitting the pack to Google', 'Europe/London', 'MANUAL_QUEUE'
    ) RETURNING id INTO task_id;
    INSERT INTO public.guided_customer_reports(case_id, customer_id, pack_id, kind, note, task_id)
    VALUES (cs.id, cs.customer_id, p.id, 'CORRECTION', note, task_id);
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility)
    VALUES (cs.id, v_auth, 'CUSTOMER_CORRECTION', note, 'CUSTOMER');
    result := jsonb_build_object('status', 'success', 'kind', 'CORRECTION');
  ELSE
    reference := nullif(btrim(coalesce(p_data->>'googleReference', '')), '');
    BEGIN submitted := (p_data->>'submittedOn')::date; EXCEPTION WHEN OTHERS THEN submitted := NULL; END;
    IF submitted IS NULL OR submitted > current_date OR submitted < DATE '2020-01-01'
      OR (
        reference IS NOT NULL AND (
          reference !~ '^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,198}$'
          OR position('http' IN lower(reference)) > 0
        )
      )
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (SELECT 1 FROM public.guided_customer_reports report WHERE report.pack_id = p.id AND report.kind = 'GOOGLE_SUBMISSION') THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    INSERT INTO public.guided_customer_reports(
      case_id, customer_id, pack_id, kind, note, submitted_on, google_reference
    ) VALUES (cs.id, cs.customer_id, p.id, 'GOOGLE_SUBMISSION', note, submitted, reference);
    INSERT INTO public.case_work_events(case_id, actor_id, event, note, visibility)
    VALUES (cs.id, v_auth, 'CUSTOMER_REPORTED_SUBMISSION', note, 'CUSTOMER');
    result := jsonb_build_object('status', 'success', 'kind', 'GOOGLE_SUBMISSION');
  END IF;
  INSERT INTO admin_private.guided_handover_receipts VALUES (p_request, v_auth, fp, result, now());
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.customer_portal_case_documents_v1(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_case_documents_v1(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_guided_handover_v1(text, uuid, text, text, jsonb) TO service_role;

COMMIT;
