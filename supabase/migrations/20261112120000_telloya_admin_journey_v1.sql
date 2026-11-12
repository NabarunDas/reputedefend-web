BEGIN;
-- Telloya admin journey records for an offline demonstration.
-- Do not apply this file to DEV or Production.
-- It does not call Retell, send email, create a Stripe object, or change an enquiry row.
-- The demonstration actor is the verified staff session. A client-supplied actor is not accepted.
-- Demonstration rows cascade with the enquiry so a booked demonstration does not block 90-day deletion.
-- This file does not enable destructive deletion and does not insert a retention hold.
-- Offers stay on public.commercial_subscriptions. This file does not create a second offer ledger.

CREATE TABLE admin_private.telloya_admin_demos (
  enquiry_id uuid PRIMARY KEY REFERENCES public.enquiries(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('NOT_BOOKED','BOOKED','COMPLETED')),
  scheduled_at timestamptz,
  timezone text NOT NULL DEFAULT '' CHECK (length(timezone) <= 80),
  completed_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  idempotency_key text NOT NULL DEFAULT '' CHECK (length(idempotency_key) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'BOOKED') = (scheduled_at IS NOT NULL) OR status = 'COMPLETED'),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK (status <> 'NOT_BOOKED' OR (scheduled_at IS NULL AND completed_at IS NULL))
);

CREATE TABLE admin_private.telloya_admin_demo_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_private.telloya_admin_demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_admin_demo_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.telloya_admin_demos, admin_private.telloya_admin_demo_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.telloya_admin_demo_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.telloya_admin_demo_actor_v1(p_token text) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_session jsonb;
BEGIN
  v_session := public.admin_session_v1(p_token);
  IF v_session IS NULL OR v_session->>'userId' IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (v_session->>'userId')::uuid;
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_admin_demo_actor_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.telloya_admin_demo_transition_v1(
  p_token text,
  p_enquiry_id uuid,
  p_expected_version integer,
  p_status text,
  p_at timestamptz,
  p_timezone text,
  p_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_source text;
  v_status text;
  v_version integer;
  v_key text;
  v_scheduled timestamptz;
  v_completed timestamptz;
  v_note text := coalesce(p_note, '');
  v_zone text := coalesce(p_timezone, '');
BEGIN
  IF p_enquiry_id IS NULL OR p_expected_version IS NULL OR p_status IS NULL
     OR length(coalesce(p_idempotency_key, '')) < 8 OR length(p_idempotency_key) > 120
     OR length(v_note) > 500 OR length(v_zone) > 80 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_status NOT IN ('NOT_BOOKED', 'BOOKED', 'COMPLETED') THEN
    RETURN jsonb_build_object('status', 'invalid_transition');
  END IF;
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_enquiry_id::text));
  SELECT source INTO v_source FROM public.enquiries WHERE id = p_enquiry_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing_enquiry');
  END IF;
  IF v_source IS DISTINCT FROM 'telloya' THEN
    RETURN jsonb_build_object('status', 'not_telloya');
  END IF;
  SELECT status, record_version, idempotency_key, scheduled_at, completed_at
    INTO v_status, v_version, v_key, v_scheduled, v_completed
  FROM admin_private.telloya_admin_demos
  WHERE enquiry_id = p_enquiry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    v_status := 'NOT_BOOKED';
    v_version := 0;
    v_key := '';
  END IF;
  IF v_key <> '' AND v_key = p_idempotency_key THEN
    RETURN jsonb_build_object('status', 'replay', 'demo_status', v_status, 'version', v_version);
  END IF;
  IF v_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('status', 'stale_version', 'version', v_version);
  END IF;
  IF NOT (
    (v_status = 'NOT_BOOKED' AND p_status = 'BOOKED' AND p_at IS NOT NULL)
    OR (v_status = 'BOOKED' AND p_status = 'COMPLETED' AND p_at IS NOT NULL)
    OR (v_status = 'BOOKED' AND p_status = 'NOT_BOOKED')
  ) THEN
    RETURN jsonb_build_object('status', 'invalid_transition', 'demo_status', v_status);
  END IF;
  IF p_status = 'BOOKED' AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_zone
  ) THEN
    RETURN jsonb_build_object('status', 'invalid_timezone');
  END IF;
  IF p_status = 'BOOKED' THEN
    v_scheduled := p_at;
    v_completed := NULL;
  ELSIF p_status = 'COMPLETED' THEN
    v_completed := p_at;
  ELSE
    v_scheduled := NULL;
    v_completed := NULL;
    v_zone := '';
  END IF;
  IF v_version = 0 THEN
    INSERT INTO admin_private.telloya_admin_demos(
      enquiry_id, status, scheduled_at, timezone, completed_at, note, record_version, idempotency_key
    ) VALUES (
      p_enquiry_id, p_status, v_scheduled, v_zone, v_completed, v_note, 1, p_idempotency_key
    );
  ELSE
    UPDATE admin_private.telloya_admin_demos
    SET status = p_status,
        scheduled_at = v_scheduled,
        timezone = CASE WHEN p_status = 'NOT_BOOKED' THEN '' ELSE v_zone END,
        completed_at = v_completed,
        note = v_note,
        record_version = record_version + 1,
        idempotency_key = p_idempotency_key,
        updated_at = pg_catalog.now()
    WHERE enquiry_id = p_enquiry_id;
  END IF;
  INSERT INTO admin_private.telloya_admin_demo_events(enquiry_id, actor_id, previous_status, new_status, note)
  VALUES (p_enquiry_id, v_actor, v_status, p_status, v_note);
  RETURN jsonb_build_object('status', 'recorded', 'demo_status', p_status, 'version', v_version + 1, 'previous_status', v_status);
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_admin_demo_transition_v1(text, uuid, integer, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.telloya_admin_demo_transition_v1(
  p_token text,
  p_enquiry_id uuid,
  p_expected_version integer,
  p_status text,
  p_at timestamptz,
  p_timezone text,
  p_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.telloya_admin_demo_transition_v1(
    p_token, p_enquiry_id, p_expected_version, p_status, p_at, p_timezone, p_note, p_idempotency_key
  );
$fn$;

REVOKE ALL ON FUNCTION public.telloya_admin_demo_transition_v1(text, uuid, integer, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_admin_demo_transition_v1(text, uuid, integer, text, timestamptz, text, text, text) TO service_role;

CREATE FUNCTION public.telloya_admin_demo_v1(p_token text, p_enquiry_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_source text;
  v_row admin_private.telloya_admin_demos;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT source INTO v_source FROM public.enquiries WHERE id = p_enquiry_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing_enquiry');
  END IF;
  IF v_source IS DISTINCT FROM 'telloya' THEN
    RETURN jsonb_build_object('status', 'not_telloya');
  END IF;
  SELECT * INTO v_row FROM admin_private.telloya_admin_demos WHERE enquiry_id = p_enquiry_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'ready', 'demo_status', 'NOT_BOOKED', 'version', 0,
      'scheduled_at', NULL, 'completed_at', NULL, 'timezone', '', 'note', ''
    );
  END IF;
  RETURN jsonb_build_object(
    'status', 'ready', 'demo_status', v_row.status, 'version', v_row.record_version,
    'scheduled_at', v_row.scheduled_at, 'completed_at', v_row.completed_at,
    'timezone', v_row.timezone, 'note', v_row.note
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_admin_demo_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_admin_demo_v1(text, uuid) TO service_role;

CREATE TABLE admin_private.telloya_offer_mail_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  mail_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE admin_private.telloya_offer_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  request_text text NOT NULL CHECK (char_length(btrim(request_text)) BETWEEN 1 AND 1000),
  status text NOT NULL CHECK (status IN ('REQUESTED','APPROVED','DECLINED')),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  revision_subscription_id uuid REFERENCES public.commercial_subscriptions(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  CHECK (status = 'REQUESTED' OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)),
  CHECK (status <> 'APPROVED' OR revision_subscription_id IS NOT NULL)
);

CREATE UNIQUE INDEX telloya_offer_amendments_one_open
  ON admin_private.telloya_offer_amendments (subscription_id)
  WHERE status = 'REQUESTED';

ALTER TABLE admin_private.telloya_offer_mail_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_offer_amendments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.telloya_offer_mail_control, admin_private.telloya_offer_amendments FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.telloya_block_accept_during_amendment_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF NEW.state = 'ACCEPTED' AND OLD.state IS DISTINCT FROM 'ACCEPTED' AND EXISTS (
    SELECT 1 FROM admin_private.telloya_offer_amendments
    WHERE subscription_id = NEW.id AND status = 'REQUESTED'
  ) THEN
    RAISE EXCEPTION 'telloya_amendment_pending' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_block_accept_during_amendment_v1() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER commercial_subscriptions_telloya_amendment
  BEFORE UPDATE ON public.commercial_subscriptions
  FOR EACH ROW EXECUTE FUNCTION admin_private.telloya_block_accept_during_amendment_v1();

CREATE FUNCTION public.telloya_offer_amendment_v1(
  p_token_hash text,
  p_request uuid,
  p_selector text,
  p_message text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_session jsonb;
  v_customer uuid;
  v_sub public.commercial_subscriptions;
  v_existing admin_private.telloya_offer_amendments;
  v_message text := btrim(coalesce(p_message, ''));
BEGIN
  v_session := admin_private.customer_portal_session_v1(p_token_hash);
  IF v_session IS NULL OR v_session->>'customerId' IS NULL THEN
    RETURN NULL;
  END IF;
  v_customer := (v_session->>'customerId')::uuid;
  IF p_request IS NULL OR p_selector IS NULL OR p_selector !~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
     OR char_length(v_message) NOT BETWEEN 1 AND 1000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO v_existing FROM admin_private.telloya_offer_amendments WHERE request_id = p_request;
  IF FOUND THEN
    IF v_existing.customer_id IS DISTINCT FROM v_customer OR v_existing.request_text IS DISTINCT FROM v_message THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'replay', 'amendmentId', v_existing.id, 'version', v_existing.record_version);
  END IF;
  SELECT * INTO v_sub FROM public.commercial_subscriptions WHERE public_ref = p_selector FOR UPDATE;
  IF NOT FOUND OR v_sub.customer_id IS DISTINCT FROM v_customer THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF v_sub.state IS DISTINCT FROM 'OFFERED' THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  INSERT INTO admin_private.telloya_offer_amendments(
    request_id, subscription_id, customer_id, request_text, status, idempotency_key
  ) VALUES (
    p_request, v_sub.id, v_customer, v_message, 'REQUESTED', p_request::text
  ) RETURNING * INTO v_existing;
  RETURN jsonb_build_object('status', 'recorded', 'amendmentId', v_existing.id, 'version', v_existing.record_version, 'subscriptionVersion', v_sub.record_version);
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_amendment_v1(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_amendment_v1(text, uuid, text, text) TO service_role;

CREATE FUNCTION public.telloya_offer_revision_v1(
  p_token text,
  p_request uuid,
  p_amendment uuid,
  p_expected_version integer,
  p_decision text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_row admin_private.telloya_offer_amendments;
  v_sub public.commercial_subscriptions;
  v_new uuid;
  v_ref text;
  v_attempt integer;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_amendment IS NULL OR p_expected_version IS NULL OR p_decision NOT IN ('APPROVED','DECLINED') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO v_row FROM admin_private.telloya_offer_amendments WHERE id = p_amendment FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF v_row.record_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('status', 'stale_version', 'version', v_row.record_version);
  END IF;
  IF v_row.status IS DISTINCT FROM 'REQUESTED' THEN
    RETURN jsonb_build_object('status', 'replay', 'decision', v_row.status, 'version', v_row.record_version, 'subscriptionId', v_row.revision_subscription_id);
  END IF;
  SELECT * INTO v_sub FROM public.commercial_subscriptions WHERE id = v_row.subscription_id FOR UPDATE;
  IF v_sub.state IS DISTINCT FROM 'OFFERED' THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  IF p_decision = 'DECLINED' THEN
    UPDATE admin_private.telloya_offer_amendments
    SET status = 'DECLINED', decided_at = pg_catalog.now(), decided_by = v_actor, record_version = record_version + 1
    WHERE id = v_row.id;
    RETURN jsonb_build_object('status', 'recorded', 'decision', 'DECLINED', 'version', v_row.record_version + 1);
  END IF;
  UPDATE public.commercial_subscriptions
  SET state = 'CANCELED', canceled_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE id = v_sub.id AND state = 'OFFERED';
  INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
  VALUES (v_sub.id, v_actor, p_request, 'OFFERED', 'CANCELED', 'Replaced by an approved Telloya amendment');
  FOR v_attempt IN 1..8 LOOP
    v_ref := admin_private.commercial_public_ref_v1();
    BEGIN
      INSERT INTO public.commercial_subscriptions(
        public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, tax_amount_minor, cadence_snapshot, terms_ref
      ) VALUES (
        v_ref, v_sub.customer_id, v_sub.business_id, v_sub.plan_family, v_sub.plan_version_id, v_sub.grant_kind, 'DRAFT',
        v_sub.amount_minor, v_sub.currency, v_sub.tax_behaviour, v_sub.tax_amount_minor, v_sub.cadence_snapshot, v_sub.terms_ref
      ) RETURNING id INTO v_new;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_new := NULL;
    END;
  END LOOP;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'telloya_revision_ref_exhausted' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
  SELECT v_new, item.component_code, item.quantity, item.quantity_limit_snapshot
  FROM public.commercial_subscription_items AS item
  WHERE item.subscription_id = v_sub.id;
  UPDATE public.commercial_subscriptions SET state = 'OFFERED', updated_at = pg_catalog.now() WHERE id = v_new;
  INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
  VALUES (v_new, v_actor, p_request, 'DRAFT', 'OFFERED', 'Approved Telloya amendment');
  UPDATE public.onboarding_requests
  SET commercial_subscription_id = v_new
  WHERE commercial_subscription_id = v_sub.id;
  UPDATE admin_private.telloya_offer_amendments
  SET status = 'APPROVED', revision_subscription_id = v_new, decided_at = pg_catalog.now(), decided_by = v_actor, record_version = record_version + 1
  WHERE id = v_row.id;
  RETURN jsonb_build_object('status', 'recorded', 'decision', 'APPROVED', 'version', v_row.record_version + 1, 'subscriptionId', v_new, 'offerRef', v_ref);
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_revision_v1(text, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_revision_v1(text, uuid, uuid, integer, text) TO service_role;

ALTER TABLE public.communications
  ADD COLUMN commercial_subscription_id uuid;

ALTER TABLE public.communications
  ADD CONSTRAINT communications_telloya_subscription_fk
  FOREIGN KEY (commercial_subscription_id) REFERENCES public.commercial_subscriptions(id) ON DELETE RESTRICT;

ALTER TABLE public.communications DROP CONSTRAINT communications_invitation_case_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_invitation_case_check CHECK (
  (
    template_key IS DISTINCT FROM 'CUSTOMER_PORTAL_INVITATION'
    AND template_key IS DISTINCT FROM 'TELLOYA_OFFER'
    AND case_id IS NOT NULL
    AND invitation_request_id IS NULL
    AND invitation_generation IS NULL
    AND commercial_subscription_id IS NULL
  )
  OR (
    template_key = 'CUSTOMER_PORTAL_INVITATION'
    AND case_id IS NULL
    AND customer_id IS NOT NULL
    AND invitation_request_id IS NOT NULL
    AND invitation_generation BETWEEN 1 AND 3
    AND link_key_version >= 1
    AND commercial_subscription_id IS NULL
  )
  OR (
    template_key = 'TELLOYA_OFFER'
    AND case_id IS NULL
    AND customer_id IS NOT NULL
    AND business_id IS NOT NULL
    AND commercial_subscription_id IS NOT NULL
    AND invitation_request_id IS NULL
    AND invitation_generation IS NULL
    AND link_key_version >= 1
  )
);

ALTER TABLE public.communications DROP CONSTRAINT communications_exactly_one_parent;
ALTER TABLE public.communications ADD CONSTRAINT communications_exactly_one_parent CHECK (
  (
    template_key IS DISTINCT FROM 'CUSTOMER_PORTAL_INVITATION'
    AND template_key IS DISTINCT FROM 'TELLOYA_OFFER'
    AND num_nonnulls(case_id, monitoring_request_id, guard_alert_id) = 1
  )
  OR (
    template_key = 'CUSTOMER_PORTAL_INVITATION'
    AND num_nonnulls(case_id, monitoring_request_id, guard_alert_id) = 0
    AND invitation_request_id IS NOT NULL
  )
  OR (
    template_key = 'TELLOYA_OFFER'
    AND num_nonnulls(case_id, monitoring_request_id, guard_alert_id) = 0
    AND commercial_subscription_id IS NOT NULL
  )
);

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION',
    'CUSTOMER_PORTAL_INVITATION', 'TELLOYA_OFFER'
  ) AND template_version >= 1)
);

ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION',
    'CUSTOMER_PORTAL_INVITATION', 'TELLOYA_OFFER'
  ));

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES (
  'TELLOYA_OFFER', 1, 'Telloya offer',
  'Your Telloya proposal {public_ref}',
  'The live Telloya offer email is composed by the server from the stored subscription.',
  'DRAFT',
  'Catalogue row for the server-composed Telloya offer email.'
);

UPDATE admin_private.communication_templates
SET status = 'APPROVED', approval_source = 'MIGRATED_EXISTING',
    reason = 'Server-composed snapshot. The approved row documents the key and is not the live email.',
    record_version = record_version + 1
WHERE template_key = 'TELLOYA_OFFER' AND version = 1 AND status = 'DRAFT';

CREATE UNIQUE INDEX communications_one_telloya_offer_idx
  ON public.communications (commercial_subscription_id)
  WHERE template_key = 'TELLOYA_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED';

CREATE FUNCTION admin_private.telloya_offer_html_v1(p_value text) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT replace(replace(replace(replace(replace(coalesce(p_value, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_offer_html_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.telloya_offer_mail_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_expected_version integer,
  p_origin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_enabled boolean := false;
  v_sub public.commercial_subscriptions;
  v_email text;
  v_existing public.communications;
  v_ref text;
  v_link text;
  v_subject text;
  v_text text;
  v_html text;
  v_comm public.communications;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_subscription IS NULL OR p_expected_version IS NULL
     OR p_origin IS NULL OR p_origin !~ '^https://[a-z0-9.-]+$'
     OR (p_origin !~ '^https://([a-z0-9-]+\.)*(profilerelaunch\.com|telloya\.com)$' AND p_origin <> 'https://localhost') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT control.mail_enabled INTO v_enabled FROM admin_private.telloya_offer_mail_control AS control LIMIT 1;
  IF COALESCE(v_enabled, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'mail_disabled');
  END IF;
  SELECT * INTO v_existing
  FROM public.communications
  WHERE commercial_subscription_id = p_subscription AND template_key = 'TELLOYA_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED'
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'replay', 'communicationId', v_existing.id, 'deliveryStatus', v_existing.delivery_status);
  END IF;
  SELECT * INTO v_sub FROM public.commercial_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF NOT FOUND OR v_sub.state IS DISTINCT FROM 'OFFERED' THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  IF v_sub.record_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('status', 'stale_version', 'version', v_sub.record_version);
  END IF;
  IF v_sub.public_ref !~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT admin_private.normalize_email_v1(email) INTO v_email FROM public.customers WHERE id = v_sub.customer_id;
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  v_ref := admin_private.telloya_offer_html_v1(v_sub.public_ref);
  v_link := p_origin || '/portal/onboarding/offer/' || v_sub.public_ref;
  v_subject := 'Your Telloya proposal — ' || v_sub.public_ref;
  v_text := 'Review your offer and subscribe' || E'\n' || v_link || E'\nThis link is not a payment link.';
  v_html := '<p>' || admin_private.telloya_offer_html_v1('Review your offer and subscribe') || '</p><p><a href="' || admin_private.telloya_offer_html_v1(v_link) || '">' || v_ref || '</a></p><p>This link is not a payment link.</p>';
  INSERT INTO public.communications(
    case_id, customer_id, business_id, commercial_subscription_id,
    channel, communication_type, direction, recipient, subject, body_text, body_html,
    status, lifecycle, delivery_status, template_key, template_version,
    author_id, reviewer_id, reviewed_at, queued_at, sender_address, reply_to_address,
    content_version, record_version, content_locked, link_key_version
  ) VALUES (
    NULL, v_sub.customer_id, v_sub.business_id, v_sub.id,
    'EMAIL', 'TELLOYA_OFFER', 'OUTBOUND', v_email, v_subject, v_text, v_html,
    'PENDING', 'QUEUED', 'NONE', 'TELLOYA_OFFER', 1,
    v_actor, v_actor, pg_catalog.now(), pg_catalog.now(), 'support@profilerelaunch.com', 'support@profilerelaunch.com',
    1, 1, true, 1
  ) RETURNING * INTO v_comm;
  PERFORM admin_private.enqueue_outbox_v1(
    'send-email:' || v_comm.id::text || ':v' || v_comm.content_version::text,
    'SEND_EMAIL', 'communication', v_comm.id,
    jsonb_build_object('communicationId', v_comm.id, 'contentVersion', v_comm.content_version)
  );
  PERFORM admin_private.append_delivery_event_v1(v_comm.id, 'QUEUED', 'Telloya offer email queued for the provider. Queued is not delivered.');
  PERFORM admin_private.write_record_audit_v1(
    v_actor, 'COMMUNICATION_CHANGED', 'success', v_comm.id, p_request, 'communication',
    'Queued a Telloya offer email. The provider has not accepted it.',
    jsonb_build_object('operation', 'queue_telloya_offer')
  );
  RETURN jsonb_build_object('status', 'queued', 'communicationId', v_comm.id, 'deliveryStatus', v_comm.delivery_status);
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_mail_v1(text, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_mail_v1(text, uuid, uuid, integer, text) TO service_role;

CREATE FUNCTION public.telloya_offer_admin_v1(p_token text, p_enquiry uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_sub public.commercial_subscriptions;
  v_amendments jsonb;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT sub.* INTO v_sub
  FROM public.onboarding_requests AS request
  JOIN public.commercial_subscriptions AS sub ON sub.id = request.commercial_subscription_id
  WHERE request.enquiry_id = p_enquiry AND request.state NOT IN ('DECLINED', 'CLOSED')
  ORDER BY request.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_offer');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', amendment.id, 'status', amendment.status, 'version', amendment.record_version, 'text', amendment.request_text
  ) ORDER BY amendment.created_at), '[]'::jsonb)
  INTO v_amendments
  FROM admin_private.telloya_offer_amendments AS amendment
  WHERE amendment.subscription_id = v_sub.id OR amendment.revision_subscription_id = v_sub.id;
  RETURN jsonb_build_object(
    'status', 'ready', 'subscriptionId', v_sub.id, 'offerRef', v_sub.public_ref,
    'state', v_sub.state, 'version', v_sub.record_version, 'amendments', v_amendments
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_admin_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_admin_v1(text, uuid) TO service_role;

COMMIT;
