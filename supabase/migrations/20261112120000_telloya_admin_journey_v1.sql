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
  status text NOT NULL CHECK (status IN ('REQUESTED','APPROVED','DECLINED','NOTED')),
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

CREATE FUNCTION admin_private.telloya_linked_offer_v1(p_subscription uuid)
RETURNS TABLE(request_id uuid, enquiry_id uuid, enquiry_ref text, customer_id uuid, demo_completed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT request.id, enquiry.id, enquiry.public_ref, request.customer_id,
    EXISTS (
      SELECT 1 FROM admin_private.telloya_admin_demos AS demo
      WHERE demo.enquiry_id = enquiry.id AND demo.status = 'COMPLETED'
    )
  FROM public.onboarding_requests AS request
  JOIN public.enquiries AS enquiry ON enquiry.id = request.enquiry_id
  JOIN public.commercial_subscriptions AS sub ON sub.id = request.commercial_subscription_id
  WHERE request.commercial_subscription_id = p_subscription
    AND request.state NOT IN ('DECLINED', 'CLOSED')
    AND request.product_code = 'TELLOYA'
    AND request.customer_id = sub.customer_id
    AND enquiry.source = 'telloya'
    AND enquiry.public_ref ~ '^TY-[0-9]{2}-[A-Z2-9]{6}$';
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_linked_offer_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.telloya_gbp_v1(p_minor integer) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT '£' || pg_catalog.btrim(pg_catalog.to_char(p_minor / 100, 'FM999999990')) || '.' || pg_catalog.lpad((pg_catalog.abs(p_minor) % 100)::text, 2, '0');
$fn$;

REVOKE ALL ON FUNCTION admin_private.telloya_gbp_v1(integer) FROM PUBLIC, anon, authenticated, service_role;

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
  IF NOT EXISTS (
    SELECT 1 FROM admin_private.telloya_linked_offer_v1(v_sub.id) AS linked
    WHERE linked.customer_id = v_customer
  ) THEN
    RETURN jsonb_build_object('status', 'ineligible');
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
  p_decision text,
  p_plan uuid,
  p_locations uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid;
  v_row admin_private.telloya_offer_amendments;
  v_sub public.commercial_subscriptions;
  v_link record;
  v_plan public.plan_versions;
  v_conditions public.commercial_plan_conditions;
  v_current uuid[];
  v_next uuid[];
  v_covered integer;
  v_telloya_limit integer;
  v_guard integer;
  v_amount integer;
  v_new uuid;
  v_ref text;
  v_attempt integer;
  v_billed integer;
BEGIN
  v_actor := admin_private.telloya_admin_demo_actor_v1(p_token);
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  IF p_request IS NULL OR p_amendment IS NULL OR p_expected_version IS NULL
     OR p_decision NOT IN ('REVISED','NOTED','DECLINED') THEN
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
  IF v_sub.id IS NULL OR v_sub.customer_id IS DISTINCT FROM v_row.customer_id THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  SELECT * INTO v_link FROM admin_private.telloya_linked_offer_v1(v_sub.id) AS linked
  WHERE linked.customer_id = v_row.customer_id;
  IF v_link.request_id IS NULL THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  IF v_sub.state IS DISTINCT FROM 'OFFERED' THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  IF p_decision = 'DECLINED' THEN
    UPDATE admin_private.telloya_offer_amendments
    SET status = 'DECLINED', decided_at = pg_catalog.now(), decided_by = v_actor, record_version = record_version + 1
    WHERE id = v_row.id;
    PERFORM admin_private.write_record_audit_v1(
      v_actor, 'COMMERCE_CHANGED', 'success', v_sub.id, p_request, 'commercial_subscription',
      'Declined a Telloya amendment. The open offer is unchanged.',
      jsonb_build_object('enquiryId', v_link.enquiry_id, 'enquiryRef', v_link.enquiry_ref, 'decision', 'DECLINED')
    );
    RETURN jsonb_build_object('status', 'recorded', 'decision', 'DECLINED', 'version', v_row.record_version + 1, 'subscriptionId', v_sub.id);
  END IF;
  IF p_decision = 'NOTED' THEN
    UPDATE admin_private.telloya_offer_amendments
    SET status = 'NOTED', decided_at = pg_catalog.now(), decided_by = v_actor, record_version = record_version + 1
    WHERE id = v_row.id;
    PERFORM admin_private.onboarding_event_v1(
      v_link.request_id, v_actor, p_request, 'note_amendment', 'OFFERED', 'OFFERED',
      'Recorded a Telloya request that does not change the commercial offer.',
      jsonb_build_object('enquiryId', v_link.enquiry_id, 'enquiryRef', v_link.enquiry_ref, 'amendmentId', v_row.id)
    );
    PERFORM admin_private.write_record_audit_v1(
      v_actor, 'COMMERCE_CHANGED', 'success', v_sub.id, p_request, 'commercial_subscription',
      'Recorded a Telloya configuration request. The open offer is unchanged.',
      jsonb_build_object('enquiryId', v_link.enquiry_id, 'enquiryRef', v_link.enquiry_ref, 'decision', 'NOTED')
    );
    RETURN jsonb_build_object('status', 'recorded', 'decision', 'NOTED', 'version', v_row.record_version + 1, 'subscriptionId', v_sub.id);
  END IF;
  IF NOT v_link.demo_completed THEN
    RETURN jsonb_build_object('status', 'demonstration_not_completed');
  END IF;
  IF p_plan IS NULL OR p_locations IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_locations) AS listed(id) GROUP BY listed.id HAVING count(*) > 1) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT coalesce(array_agg(chosen.location_id ORDER BY chosen.location_id), ARRAY[]::uuid[])
  INTO v_current
  FROM admin_private.commercial_offer_guard_locations AS chosen
  WHERE chosen.subscription_id = v_sub.id;
  SELECT coalesce(array_agg(listed.id ORDER BY listed.id), ARRAY[]::uuid[])
  INTO v_next
  FROM unnest(p_locations) AS listed(id);
  IF v_sub.plan_version_id = p_plan AND v_current = v_next THEN
    RETURN jsonb_build_object('status', 'unchanged', 'subscriptionId', v_sub.id, 'amountMinor', v_sub.amount_minor);
  END IF;
  SELECT * INTO v_plan FROM public.plan_versions WHERE id = p_plan;
  SELECT * INTO v_conditions FROM public.commercial_plan_conditions
  WHERE plan_version_id = v_plan.id AND status = 'APPROVED';
  SELECT count(*)::integer INTO v_covered
  FROM admin_private.onboarding_request_locations
  WHERE onboarding_request_id = v_link.request_id;
  SELECT pieces.quantity_limit INTO v_telloya_limit
  FROM public.plan_components AS pieces
  WHERE pieces.plan_version_id = v_plan.id AND pieces.component_code = 'TELLOYA';
  v_guard := coalesce(cardinality(v_next), 0);
  IF v_plan.id IS NULL OR v_plan.product_code IS DISTINCT FROM 'TELLOYA' OR v_plan.status IS DISTINCT FROM 'APPROVED'
     OR v_plan.amount_minor IS NULL OR v_plan.currency IS DISTINCT FROM 'GBP'
     OR v_plan.billing_cadence IS DISTINCT FROM 'MONTH' OR v_plan.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
     OR v_plan.terms_ref IS NULL OR v_plan.effective_from > pg_catalog.now()
     OR (v_plan.effective_to IS NOT NULL AND v_plan.effective_to <= pg_catalog.now())
     OR v_conditions.id IS NULL OR v_conditions.tier_code IS DISTINCT FROM v_plan.tier_code
     OR v_conditions.base_amount_minor IS DISTINCT FROM v_plan.amount_minor
     OR v_telloya_limit IS NULL OR v_covered IS DISTINCT FROM v_telloya_limit
     OR EXISTS (
       SELECT 1 FROM public.plan_components AS pieces
       WHERE pieces.plan_version_id = v_plan.id AND pieces.component_code = 'GUARD'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.commercial_agreement_versions AS agreement
       WHERE agreement.product_code = 'TELLOYA' AND agreement.version_ref = v_plan.terms_ref AND agreement.status = 'APPROVED'
     )
  THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured');
  END IF;
  IF v_guard > 0 AND (
    v_conditions.guard_unit_amount_minor IS DISTINCT FROM 999
    OR EXISTS (
      SELECT 1 FROM unnest(v_next) AS picked(location_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.locations AS location
        WHERE location.id = picked.location_id AND location.business_id = v_sub.business_id
      )
    )
  ) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'guard');
  END IF;
  v_amount := v_plan.amount_minor + CASE WHEN v_guard > 0 THEN 999 * v_guard ELSE 0 END;
  FOR v_attempt IN 1..8 LOOP
    v_ref := admin_private.commercial_public_ref_v1();
    BEGIN
      INSERT INTO public.commercial_subscriptions(
        public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
        amount_minor, currency, tax_behaviour, tax_amount_minor, cadence_snapshot, terms_ref
      ) VALUES (
        v_ref, v_sub.customer_id, v_sub.business_id, 'VOICE', v_plan.id, 'BILLABLE', 'DRAFT',
        v_amount, v_plan.currency, v_plan.tax_behaviour, NULL, v_plan.billing_cadence, v_plan.terms_ref
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
  SELECT v_new, pieces.component_code, pieces.quantity_limit, pieces.quantity_limit
  FROM public.plan_components AS pieces
  WHERE pieces.plan_version_id = v_plan.id;
  IF v_guard > 0 THEN
    INSERT INTO public.commercial_subscription_items(subscription_id, component_code, quantity, quantity_limit_snapshot)
    VALUES (v_new, 'GUARD', v_guard, v_guard);
    INSERT INTO admin_private.commercial_offer_guard_locations(subscription_id, location_id)
    SELECT v_new, picked.location_id FROM unnest(v_next) AS picked(location_id);
  END IF;
  v_billed := admin_private.commercial_billable_amount_v1(v_new);
  IF v_billed IS DISTINCT FROM v_amount THEN
    RAISE EXCEPTION 'telloya_revision_amount' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.commercial_subscriptions
  SET state = 'CANCELED', canceled_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE id = v_sub.id AND state = 'OFFERED';
  INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
  VALUES (v_sub.id, v_actor, p_request, 'OFFERED', 'CANCELED', 'Replaced after an approved Telloya amendment');
  UPDATE public.commercial_subscriptions SET state = 'OFFERED', updated_at = pg_catalog.now() WHERE id = v_new;
  INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
  VALUES (v_new, v_actor, p_request, 'DRAFT', 'OFFERED', 'Issued the revised Telloya offer');
  UPDATE public.onboarding_requests
  SET commercial_subscription_id = v_new
  WHERE id = v_link.request_id AND commercial_subscription_id = v_sub.id;
  PERFORM admin_private.onboarding_event_v1(
    v_link.request_id, v_actor, p_request, 'revise_offer', 'OFFERED', 'OFFERED',
    'Issued a revised Telloya offer for the same enquiry.',
    jsonb_build_object(
      'enquiryId', v_link.enquiry_id, 'enquiryRef', v_link.enquiry_ref,
      'previousSubscriptionId', v_sub.id, 'subscriptionId', v_new,
      'planVersionId', v_plan.id, 'amountMinor', v_amount, 'guardLocationCount', v_guard
    )
  );
  UPDATE admin_private.telloya_offer_amendments
  SET status = 'APPROVED', revision_subscription_id = v_new, decided_at = pg_catalog.now(), decided_by = v_actor, record_version = record_version + 1
  WHERE id = v_row.id;
  PERFORM admin_private.write_record_audit_v1(
    v_actor, 'COMMERCE_CHANGED', 'success', v_new, p_request, 'commercial_subscription',
    'Issued a revised Telloya offer. The previous offer is canceled.',
    jsonb_build_object('enquiryId', v_link.enquiry_id, 'enquiryRef', v_link.enquiry_ref, 'previousSubscriptionId', v_sub.id, 'amountMinor', v_amount)
  );
  RETURN jsonb_build_object(
    'status', 'recorded', 'decision', 'REVISED', 'version', v_row.record_version + 1,
    'subscriptionId', v_new, 'offerRef', v_ref, 'amountMinor', v_amount, 'guardLocationCount', v_guard
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.telloya_offer_revision_v1(text, uuid, uuid, integer, text, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_revision_v1(text, uuid, uuid, integer, text, uuid, uuid[]) TO service_role;

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
  'Your Telloya proposal',
  'The live Telloya offer email is composed by the server from the stored subscription.',
  'DRAFT',
  'Catalogue row for the server-composed Telloya offer email. Approval uses the settings command.'
);

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
  v_link record;
  v_email text;
  v_existing public.communications;
  v_tier text;
  v_minutes integer;
  v_plan_amount integer;
  v_guard integer;
  v_template_version integer;
  v_plan_label text;
  v_minutes_text text;
  v_guard_text text;
  v_price text;
  v_href text;
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
  SELECT * INTO v_sub FROM public.commercial_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  SELECT * INTO v_existing
  FROM public.communications
  WHERE commercial_subscription_id = p_subscription AND template_key = 'TELLOYA_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED'
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'replay', 'communicationId', v_existing.id, 'deliveryStatus', v_existing.delivery_status);
  END IF;
  SELECT * INTO v_link FROM admin_private.telloya_linked_offer_v1(v_sub.id) AS linked;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'ineligible');
  END IF;
  IF v_sub.state IS DISTINCT FROM 'OFFERED' THEN
    RETURN jsonb_build_object('status', 'offer_not_open');
  END IF;
  IF v_sub.record_version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('status', 'stale_version', 'version', v_sub.record_version);
  END IF;
  IF v_link.demo_completed IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'demonstration_not_completed');
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_private.telloya_offer_amendments AS amendment
    WHERE amendment.subscription_id = v_sub.id AND amendment.status = 'REQUESTED'
  ) THEN
    RETURN jsonb_build_object('status', 'amendment_pending');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships AS membership
    WHERE membership.customer_id = v_sub.customer_id
      AND membership.business_id = v_sub.business_id
      AND membership.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'authority');
  END IF;
  IF v_sub.public_ref !~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT admin_private.normalize_email_v1(email) INTO v_email FROM public.customers WHERE id = v_sub.customer_id;
  IF v_email IS NULL OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT version INTO v_template_version
  FROM admin_private.communication_templates
  WHERE template_key = 'TELLOYA_OFFER' AND status = 'APPROVED'
  ORDER BY version DESC
  LIMIT 1;
  IF v_template_version IS NULL THEN
    RETURN jsonb_build_object('status', 'template_unapproved');
  END IF;
  SELECT chosen.tier_code, chosen.included_minutes, chosen.amount_minor
  INTO v_tier, v_minutes, v_plan_amount
  FROM (
    SELECT plan.tier_code, conditions.included_minutes, plan.amount_minor
    FROM public.plan_versions AS plan
    JOIN public.commercial_plan_conditions AS conditions
      ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
    WHERE plan.id = v_sub.plan_version_id AND plan.product_code = 'TELLOYA' AND plan.status = 'APPROVED'
    LIMIT 1
  ) AS chosen;
  SELECT count(*)::integer INTO v_guard
  FROM admin_private.commercial_offer_guard_locations AS chosen
  WHERE chosen.subscription_id = v_sub.id;
  v_plan_label := CASE v_tier
    WHEN 'BASIC' THEN 'Basic'
    WHEN 'GROWTH' THEN 'Growth'
    WHEN 'PRO' THEN 'Pro'
    WHEN 'CUSTOM' THEN 'Custom'
    ELSE NULL
  END;
  IF v_plan_label IS NULL OR v_plan_amount IS NULL OR v_sub.amount_minor IS DISTINCT FROM v_plan_amount + (999 * v_guard) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured');
  END IF;
  IF v_sub.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
     OR EXISTS (
       SELECT 1 FROM public.plan_versions AS plan
       WHERE plan.id = v_sub.plan_version_id
         AND plan.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
     ) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'tax');
  END IF;
  IF v_sub.terms_ref IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.commercial_agreement_versions AS agreement
    WHERE agreement.product_code = 'TELLOYA'
      AND agreement.version_ref = v_sub.terms_ref
      AND agreement.status = 'APPROVED'
  ) THEN
    RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'agreement');
  END IF;
  v_minutes_text := CASE WHEN v_minutes IS NULL THEN 'confirmed in the quotation' ELSE v_minutes::text END;
  v_guard_text := CASE
    WHEN v_guard = 0 THEN 'not included'
    ELSE v_guard::text || CASE WHEN v_guard = 1 THEN ' location' ELSE ' locations' END
      || ' at ' || admin_private.telloya_gbp_v1(999) || ' each (' || admin_private.telloya_gbp_v1(999 * v_guard) || ')'
  END;
  v_price := admin_private.telloya_gbp_v1(v_sub.amount_minor);
  v_href := p_origin || '/portal/onboarding/offer/' || v_sub.public_ref;
  v_subject := 'Your Telloya proposal — ' || v_link.enquiry_ref;
  v_text := 'Enquiry ' || v_link.enquiry_ref
    || E'\nPlan: ' || v_plan_label
    || E'\nMonthly price: ' || v_price
    || E'\nIncluded minutes: ' || v_minutes_text
    || E'\nGuard add-ons: ' || v_guard_text
    || E'\nReview your offer'
    || E'\n' || v_href
    || E'\nThis link is not a payment link.';
  v_html := '<p>Enquiry ' || admin_private.telloya_offer_html_v1(v_link.enquiry_ref) || '</p>'
    || '<p>Plan: ' || admin_private.telloya_offer_html_v1(v_plan_label) || '</p>'
    || '<p>Monthly price: ' || admin_private.telloya_offer_html_v1(v_price) || '</p>'
    || '<p>Included minutes: ' || admin_private.telloya_offer_html_v1(v_minutes_text) || '</p>'
    || '<p>Guard add-ons: ' || admin_private.telloya_offer_html_v1(v_guard_text) || '</p>'
    || '<p><a href="' || admin_private.telloya_offer_html_v1(v_href) || '">Review your offer</a></p>'
    || '<p>This link is not a payment link.</p>';
  BEGIN
    INSERT INTO public.communications(
      case_id, customer_id, business_id, commercial_subscription_id,
      channel, communication_type, direction, recipient, subject, body_text, body_html,
      status, lifecycle, delivery_status, template_key, template_version,
      author_id, reviewer_id, reviewed_at, queued_at, sender_address, reply_to_address,
      content_version, record_version, content_locked, link_key_version
    ) VALUES (
      NULL, v_sub.customer_id, v_sub.business_id, v_sub.id,
      'EMAIL', 'TELLOYA_OFFER', 'OUTBOUND', v_email, v_subject, v_text, v_html,
      'PENDING', 'QUEUED', 'NONE', 'TELLOYA_OFFER', v_template_version,
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
      jsonb_build_object('operation', 'queue_telloya_offer', 'enquiryRef', v_link.enquiry_ref)
    );
    RETURN jsonb_build_object('status', 'queued', 'communicationId', v_comm.id, 'deliveryStatus', v_comm.delivery_status);
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.communications
    WHERE commercial_subscription_id = p_subscription AND template_key = 'TELLOYA_OFFER' AND lifecycle IS DISTINCT FROM 'CANCELLED'
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'replay', 'communicationId', v_existing.id, 'deliveryStatus', v_existing.delivery_status);
    END IF;
    RAISE;
  END;
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
    'state', v_sub.state, 'version', v_sub.record_version, 'amendments', v_amendments,
    'planVersionId', v_sub.plan_version_id, 'amountMinor', v_sub.amount_minor,
    'emailQueued', EXISTS (
      SELECT 1 FROM public.communications AS mail
      WHERE mail.commercial_subscription_id = v_sub.id
        AND mail.template_key = 'TELLOYA_OFFER'
        AND mail.lifecycle IS DISTINCT FROM 'CANCELLED'
    ),
    'agreementAccepted', v_sub.state IN ('ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END'),
    'paymentStatus', CASE
      WHEN v_sub.state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
        OR EXISTS (SELECT 1 FROM public.commercial_payment_evidence AS evidence WHERE evidence.subscription_id = v_sub.id)
        THEN 'paid'
      WHEN v_sub.state = 'PAYMENT_PENDING' THEN 'verifying'
      ELSE 'none'
    END,
    'provisionState', (
      SELECT provision.state
      FROM public.service_provisions AS provision
      JOIN public.product_entitlements AS entitlement ON entitlement.id = provision.entitlement_id
      WHERE entitlement.commercial_subscription_id = v_sub.id
      ORDER BY provision.updated_at DESC
      LIMIT 1
    ),
    'tier', (SELECT tier_code FROM public.plan_versions WHERE id = v_sub.plan_version_id),
    'enquiryRef', (
      SELECT enquiry.public_ref FROM public.onboarding_requests AS request
      JOIN public.enquiries AS enquiry ON enquiry.id = request.enquiry_id
      WHERE request.commercial_subscription_id = v_sub.id
      ORDER BY request.created_at DESC LIMIT 1
    ),
    'plans', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', plan.id, 'tier', plan.tier_code,
        'label', CASE plan.tier_code WHEN 'BASIC' THEN 'Basic' WHEN 'GROWTH' THEN 'Growth' WHEN 'PRO' THEN 'Pro' WHEN 'CUSTOM' THEN 'Custom' ELSE plan.tier_code END,
        'amountMinor', plan.amount_minor, 'includedMinutes', conditions.included_minutes, 'locationCap', pieces.quantity_limit
      ) ORDER BY plan.tier_code, plan.amount_minor), '[]'::jsonb)
      FROM public.plan_versions AS plan
      JOIN public.commercial_plan_conditions AS conditions
        ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
      JOIN public.plan_components AS pieces
        ON pieces.plan_version_id = plan.id AND pieces.component_code = 'TELLOYA'
      WHERE plan.product_code = 'TELLOYA' AND plan.status = 'APPROVED'
        AND plan.amount_minor IS NOT NULL AND plan.effective_from <= pg_catalog.now()
        AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
        AND pieces.quantity_limit = (
          SELECT count(*)::integer FROM admin_private.onboarding_request_locations AS chosen
          JOIN public.onboarding_requests AS request ON request.id = chosen.onboarding_request_id
          WHERE request.commercial_subscription_id = v_sub.id AND request.state NOT IN ('DECLINED', 'CLOSED')
        )
    ),
    'locations', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', location.id, 'name', location.location_name,
        'selected', EXISTS (
          SELECT 1 FROM admin_private.commercial_offer_guard_locations AS chosen
          WHERE chosen.subscription_id = v_sub.id AND chosen.location_id = location.id
        )
      ) ORDER BY location.location_name), '[]'::jsonb)
      FROM public.locations AS location
      WHERE location.business_id = v_sub.business_id
    )
  );
END;
$fn$;

ALTER TABLE admin_private.onboarding_request_events
  DROP CONSTRAINT onboarding_request_events_operation_check;
ALTER TABLE admin_private.onboarding_request_events
  ADD CONSTRAINT onboarding_request_events_operation_check CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer',
    'issue_invitation', 'resend_invitation', 'revoke_invitation',
    'begin_setup', 'confirm_preferences', 'confirm_ai_configuration',
    'record_number_allocation', 'record_forwarding_instructions', 'verify_agent_test_call',
    'revise_offer', 'note_amendment'
  ));

REVOKE ALL ON FUNCTION public.telloya_offer_admin_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_admin_v1(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_commercial_command_v1(
  p_token text,
  p_request uuid,
  p_operation text,
  p_payload jsonb,
  p_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fingerprint text;
  receipt admin_private.commercial_command_receipts;
  enquiry public.enquiries;
  req public.onboarding_requests;
  previous text;
  outcome text := 'success';
  result jsonb;
  note text;
  chosen_product text;
  mailbox text;
  matched_customer uuid;
  supplied_customer uuid;
  matched_business uuid;
  supplied_business uuid;
  membership public.business_memberships;
  membership_status text;
  saved jsonb;
  location_ids uuid[] := ARRAY[]::uuid[];
  created_location uuid;
  email_verified boolean := false;
  occupying uuid;
  plan public.plan_versions;
  opened_subscription uuid;
  opened_ref text;
  attempt integer;
  covered integer;
  piece record;
  ready boolean;
  membership_exists boolean := false;
  preserved_membership text;
  live_offer public.commercial_subscriptions;
  telloya_limit integer;
  guard_limit integer;
  component_count integer;
  plan_count integer;
  chosen_conditions public.commercial_plan_conditions;
  composed_amount integer;
  guard_ids uuid[] := ARRAY[]::uuid[];
  addon_count integer := 0;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_version IS NULL OR p_version < 0 OR p_operation IS NULL
    OR p_operation NOT IN (
      'classify', 'review', 'match_customer', 'match_business', 'select_locations',
      'mark_ready', 'decline', 'prepare_offer'
    )
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 8000
    OR jsonb_typeof(p_payload->'enquiryId') IS DISTINCT FROM 'string'
    OR (p_payload->>'enquiryId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
    OR char_length(btrim(p_payload->>'reason')) NOT BETWEEN 10 AND 1000
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  note := btrim(p_payload->>'reason');
  fingerprint := md5(jsonb_build_object('operation', p_operation, 'payload', p_payload, 'version', p_version)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO receipt FROM admin_private.commercial_command_receipts WHERE request_id = p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.fingerprint = fingerprint THEN RETURN receipt.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('onboarding:' || (p_payload->>'enquiryId'), 0));
  SELECT * INTO enquiry FROM public.enquiries WHERE id = (p_payload->>'enquiryId')::uuid FOR UPDATE;
  IF enquiry.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF p_operation = 'classify' THEN
    chosen_product := p_payload->>'product';
    IF chosen_product IS NULL OR chosen_product NOT IN ('TELLOYA', 'COMPLETE') OR p_version <> 0 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF enquiry.status NOT IN ('new', 'open', 'waiting')
      OR NOT admin_private.commercial_enquiry_supported_v1(enquiry.payload)
    THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF req.id IS NOT NULL THEN
      IF req.product_code IS DISTINCT FROM chosen_product THEN RETURN jsonb_build_object('status', 'conflict', 'reason', 'product'); END IF;
      result := jsonb_build_object('status', 'success', 'id', enquiry.id, 'requestId', req.id, 'version', req.record_version, 'existing', true);
      INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
      VALUES (p_request, actor, fingerprint, result);
      RETURN result;
    END IF;
    PERFORM admin_private.ensure_commercial_product_v1(chosen_product);
    mailbox := lower(btrim(enquiry.payload->>'email'));
    INSERT INTO public.onboarding_requests(enquiry_id, email_snapshot, product_code, plan_family, state)
    VALUES (enquiry.id, mailbox, chosen_product, 'VOICE', 'RECEIVED')
    RETURNING * INTO req;
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'classify', NULL, 'RECEIVED', note,
      jsonb_build_object('product', chosen_product, 'invitationSent', false));
    result := jsonb_build_object('status', 'success', 'id', enquiry.id, 'requestId', req.id, 'version', req.record_version);
    INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
    VALUES (p_request, actor, fingerprint, result);
    RETURN result;
  END IF;

  IF req.id IS NULL OR req.record_version IS DISTINCT FROM p_version THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;
  previous := req.state;
  email_verified := admin_private.contact_verified_v1(req.customer_id, 'email');
  IF p_operation IN ('review', 'match_customer', 'match_business', 'select_locations', 'mark_ready')
    AND (req.commercial_subscription_id IS NOT NULL OR req.state = 'OFFERED')
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'frozen');
  END IF;

  IF p_operation = 'review' THEN
    IF req.state = 'DECLINED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF req.state = 'RECEIVED' THEN
      UPDATE public.onboarding_requests SET state = 'IN_REVIEW' WHERE id = req.id RETURNING * INTO req;
    END IF;
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'review', previous, req.state, note, '{}'::jsonb);
  ELSIF p_operation = 'match_customer' THEN
    IF req.state IN ('DECLINED', 'CLOSED', 'OFFERED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    mailbox := req.email_snapshot;
    SELECT customers.id INTO matched_customer FROM public.customers AS customers WHERE lower(customers.email) = mailbox;
    IF p_payload ? 'customerId' AND jsonb_typeof(p_payload->'customerId') <> 'null' THEN
      IF (p_payload->>'customerId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      supplied_customer := (p_payload->>'customerId')::uuid;
      IF matched_customer IS NULL OR matched_customer IS DISTINCT FROM supplied_customer THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
    ELSIF matched_customer IS NULL THEN
      IF coalesce(p_payload->>'create', '') <> 'true' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      IF req.customer_id IS NOT NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      BEGIN
        saved := public.admin_record_save_v1(
          p_token, 'client', NULL, 0,
          jsonb_build_object(
            'name', btrim(enquiry.payload->>'fullName'),
            'email', mailbox,
            'phone', coalesce(enquiry.payload->>'phone', '')
          ),
          note,
          admin_private.commercial_request_uuid_v1(p_request, 'customer')
        );
        IF saved->>'status' = 'success' THEN
          matched_customer := (saved->>'id')::uuid;
        ELSIF saved->>'status' = 'conflict' THEN
          RAISE EXCEPTION 'commercial nested refused' USING ERRCODE = 'P0001';
        ELSE
          RAISE EXCEPTION 'commercial nested refused' USING ERRCODE = 'P0001';
        END IF;
      EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM <> 'commercial nested refused' THEN RAISE; END IF;
          IF saved->>'status' = 'conflict' THEN
            SELECT customers.id INTO matched_customer FROM public.customers AS customers WHERE lower(customers.email) = mailbox;
          END IF;
          IF matched_customer IS NULL THEN RETURN saved; END IF;
      END;
    END IF;
    IF matched_customer IS NULL OR (req.customer_id IS NOT NULL AND req.customer_id IS DISTINCT FROM matched_customer) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    email_verified := admin_private.contact_verified_v1(matched_customer, 'email');
    UPDATE public.onboarding_requests
    SET customer_id = matched_customer,
        state = CASE WHEN email_verified THEN 'IN_REVIEW' ELSE 'MAILBOX_REQUIRED' END
    WHERE id = req.id
    RETURNING * INTO req;
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'match_customer', previous, req.state, note,
      jsonb_build_object('customerId', matched_customer, 'emailVerified', email_verified, 'invitationSent', false));
  ELSIF p_operation = 'match_business' THEN
    IF req.customer_id IS NULL OR req.state IN ('DECLINED', 'CLOSED', 'OFFERED') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    membership_status := coalesce(p_payload->>'membership', 'pending');
    IF membership_status NOT IN ('pending', 'verified') THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    matched_business := NULL;
    IF p_payload ? 'businessId' AND jsonb_typeof(p_payload->'businessId') <> 'null' THEN
      IF (p_payload->>'businessId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      supplied_business := (p_payload->>'businessId')::uuid;
      IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = supplied_business) THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      matched_business := supplied_business;
    ELSIF coalesce(p_payload->>'create', '') = 'true' THEN
      IF jsonb_typeof(p_payload->'name') IS DISTINCT FROM 'string'
        OR char_length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 200
        OR jsonb_typeof(p_payload->'website') IS DISTINCT FROM 'string'
        OR ((p_payload->>'website') <> '' AND (p_payload->>'website') !~ '^https?://[^[:space:]]+$')
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    ELSE
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF matched_business IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.onboarding_requests other
      WHERE other.business_id = matched_business AND other.plan_family = 'VOICE'
        AND other.state NOT IN ('CLOSED', 'DECLINED') AND other.id <> req.id
    ) THEN RETURN jsonb_build_object('status', 'conflict', 'reason', 'business'); END IF;
    membership_exists := false;
    IF matched_business IS NOT NULL THEN
      SELECT * INTO membership FROM public.business_memberships
      WHERE customer_id = req.customer_id AND business_id = matched_business;
      membership_exists := FOUND;
    END IF;
    IF membership_exists AND membership.status = 'revoked' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'revoked');
    END IF;
    IF membership_exists THEN
      preserved_membership := membership.status;
    ELSE
      IF (s->>'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
        RETURN jsonb_build_object('status', 'reauth_required');
      END IF;
      IF membership_status = 'verified'
        AND NOT (
          admin_private.contact_verified_v1(req.customer_id, 'email')
          OR admin_private.contact_verified_v1(req.customer_id, 'phone')
        )
      THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'membership'); END IF;
      preserved_membership := membership_status;
      BEGIN
        IF matched_business IS NULL THEN
          saved := public.admin_record_save_v1(
            p_token, 'business', NULL, 0,
            jsonb_build_object('name', btrim(p_payload->>'name'), 'website', p_payload->>'website'),
            note,
            admin_private.commercial_request_uuid_v1(p_request, 'business')
          );
          IF saved->>'status' IS DISTINCT FROM 'success' THEN
            RAISE EXCEPTION 'commercial nested refused' USING ERRCODE = 'P0001';
          END IF;
          matched_business := (saved->>'id')::uuid;
          IF EXISTS (
            SELECT 1 FROM public.onboarding_requests other
            WHERE other.business_id = matched_business AND other.plan_family = 'VOICE'
              AND other.state NOT IN ('CLOSED', 'DECLINED') AND other.id <> req.id
          ) THEN
            saved := jsonb_build_object('status', 'conflict', 'reason', 'business');
            RAISE EXCEPTION 'commercial nested refused' USING ERRCODE = 'P0001';
          END IF;
        END IF;
        saved := public.admin_membership_save_v1(
          p_token, req.customer_id, matched_business, 0, preserved_membership, note,
          admin_private.commercial_request_uuid_v1(p_request, 'membership')
        );
        IF saved->>'status' IS DISTINCT FROM 'success' THEN
          RAISE EXCEPTION 'commercial nested refused' USING ERRCODE = 'P0001';
        END IF;
      EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM <> 'commercial nested refused' THEN RAISE; END IF;
          RETURN saved;
      END;
    END IF;
    UPDATE public.onboarding_requests SET business_id = matched_business WHERE id = req.id RETURNING * INTO req;
    DELETE FROM admin_private.onboarding_request_locations
    WHERE onboarding_request_id = req.id
      AND location_id IN (SELECT locations.id FROM public.locations AS locations WHERE locations.business_id IS DISTINCT FROM matched_business);
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'match_business', previous, req.state, note,
      jsonb_build_object('businessId', matched_business, 'membership', preserved_membership, 'emailVerified', admin_private.contact_verified_v1(req.customer_id, 'email')));
  ELSIF p_operation = 'select_locations' THEN
    IF req.business_id IS NULL OR req.state IN ('DECLINED', 'CLOSED') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    location_ids := ARRAY[]::uuid[];
    IF p_payload ? 'locationIds' AND jsonb_typeof(p_payload->'locationIds') = 'array' THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_payload->'locationIds') AS value
        WHERE value !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      ) THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[]) INTO location_ids
      FROM jsonb_array_elements_text(p_payload->'locationIds') AS value;
    ELSIF coalesce(p_payload->>'create', '') <> 'true' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF coalesce(cardinality(location_ids), 0) > 0 AND EXISTS (
      SELECT 1 FROM unnest(location_ids) AS picked(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.locations location
        WHERE location.id = picked.id AND location.business_id = req.business_id
      )
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF coalesce(p_payload->>'create', '') = 'true' THEN
      IF jsonb_typeof(p_payload->'locationName') IS DISTINCT FROM 'string'
        OR char_length(coalesce(p_payload->>'locationName', '')) > 200
        OR jsonb_typeof(p_payload->'country') IS DISTINCT FROM 'string'
        OR char_length(btrim(p_payload->>'country')) NOT BETWEEN 1 AND 100
        OR coalesce(cardinality(location_ids), 0) + 1 > 20
      THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      BEGIN
        saved := public.admin_record_save_v1(
          p_token, 'location', NULL, 0,
          jsonb_build_object(
            'name', coalesce(p_payload->>'locationName', ''),
            'country', btrim(p_payload->>'country'),
            'profileUrl', '',
            'businessId', req.business_id
          ),
          note,
          admin_private.commercial_request_uuid_v1(p_request, 'location')
        );
        IF saved->>'status' IS DISTINCT FROM 'success' THEN
          RAISE EXCEPTION 'commercial nested refused' USING ERRCODE = 'P0001';
        END IF;
        created_location := (saved->>'id')::uuid;
      EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
          IF SQLERRM <> 'commercial nested refused' THEN RAISE; END IF;
          RETURN saved;
      END;
      location_ids := location_ids || created_location;
    END IF;
    IF location_ids IS NULL OR cardinality(location_ids) < 1 OR cardinality(location_ids) > 20 THEN
      RAISE EXCEPTION 'location selection failed its own checks';
    END IF;
    DELETE FROM admin_private.onboarding_request_locations
    WHERE onboarding_request_id = req.id AND NOT (location_id = ANY(location_ids));
    INSERT INTO admin_private.onboarding_request_locations(onboarding_request_id, location_id)
    SELECT req.id, picked.id FROM unnest(location_ids) AS picked(id)
    ON CONFLICT DO NOTHING;
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'select_locations', previous, req.state, note,
      jsonb_build_object('locationCount', cardinality(location_ids)));
  ELSIF p_operation = 'mark_ready' THEN
    IF req.customer_id IS NULL OR req.business_id IS NULL OR req.state IN ('DECLINED', 'CLOSED') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM admin_private.onboarding_request_locations WHERE onboarding_request_id = req.id
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT status INTO membership_status FROM public.business_memberships
    WHERE customer_id = req.customer_id AND business_id = req.business_id;
    IF membership_status IS NULL OR membership_status = 'revoked' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', CASE WHEN membership_status = 'revoked' THEN 'revoked' ELSE 'membership' END);
    END IF;
    email_verified := admin_private.contact_verified_v1(req.customer_id, 'email');
    IF req.state IN ('RECEIVED', 'IN_REVIEW', 'MAILBOX_REQUIRED') THEN
      UPDATE public.onboarding_requests
      SET state = CASE WHEN email_verified THEN 'IN_REVIEW' ELSE 'MAILBOX_REQUIRED' END
      WHERE id = req.id
      RETURNING * INTO req;
    END IF;
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'mark_ready', previous, req.state, note,
      jsonb_build_object('invitationSent', false, 'emailVerified', email_verified, 'membership', membership_status));
  ELSIF p_operation = 'decline' THEN
    IF char_length(note) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF req.state = 'DECLINED' THEN
      result := jsonb_build_object('status', 'success', 'id', enquiry.id, 'requestId', req.id, 'version', req.record_version, 'existing', true);
      INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
      VALUES (p_request, actor, fingerprint, result);
      RETURN result;
    END IF;
    IF req.commercial_subscription_id IS NOT NULL THEN
      SELECT * INTO live_offer FROM public.commercial_subscriptions WHERE id = req.commercial_subscription_id FOR UPDATE;
      IF live_offer.id IS NULL OR live_offer.state IS DISTINCT FROM 'OFFERED' THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'offer_state');
      END IF;
      UPDATE public.commercial_subscriptions
      SET state = 'CANCELED', canceled_at = pg_catalog.now()
      WHERE id = live_offer.id AND state = 'OFFERED';
      IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict', 'reason', 'offer'); END IF;
      INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
      VALUES (live_offer.id, actor, p_request, 'OFFERED', 'CANCELED', note);
    END IF;
    UPDATE public.onboarding_requests SET state = 'DECLINED', decline_reason = note WHERE id = req.id RETURNING * INTO req;
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'decline', previous, 'DECLINED', note,
      jsonb_build_object('invitationSent', false, 'offerWithdrawn', live_offer.id IS NOT NULL));
  ELSIF p_operation = 'prepare_offer' THEN
    IF enquiry.source = 'telloya' AND req.product_code IN ('TELLOYA', 'COMPLETE') AND NOT EXISTS (
      SELECT 1 FROM admin_private.telloya_admin_demos AS demo
      WHERE demo.enquiry_id = enquiry.id AND demo.status = 'COMPLETED'
    ) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'demonstration_not_completed');
    END IF;
    IF req.customer_id IS NULL OR req.business_id IS NULL OR req.state IN ('DECLINED', 'CLOSED') THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT status INTO membership_status FROM public.business_memberships
    WHERE customer_id = req.customer_id AND business_id = req.business_id;
    IF membership_status IS DISTINCT FROM 'verified' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT count(*) INTO covered FROM admin_private.onboarding_request_locations WHERE onboarding_request_id = req.id;
    IF covered < 1 THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF req.commercial_subscription_id IS NOT NULL THEN
      result := jsonb_build_object('status', 'success', 'id', enquiry.id, 'requestId', req.id, 'version', req.record_version, 'existing', true);
      INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response) VALUES (p_request, actor, fingerprint, result);
      RETURN result;
    END IF;
    IF p_payload ? 'planVersionId' AND jsonb_typeof(p_payload->'planVersionId') <> 'null' THEN
      IF (p_payload->>'planVersionId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      SELECT * INTO plan FROM public.plan_versions WHERE id = (p_payload->>'planVersionId')::uuid;
    ELSE
      SELECT count(*) INTO plan_count FROM public.plan_versions
      WHERE product_code = req.product_code AND status = 'APPROVED'
        AND amount_minor IS NOT NULL AND tax_behaviour = 'NOT_APPLICABLE'
        AND terms_ref IS NOT NULL AND effective_from <= pg_catalog.now()
        AND (effective_to IS NULL OR effective_to > pg_catalog.now());
      IF plan_count = 0 THEN
        RETURN jsonb_build_object('status', 'terms_unconfigured', 'id', enquiry.id, 'requestId', req.id);
      END IF;
      IF plan_count IS DISTINCT FROM 1 OR EXISTS (
        SELECT 1 FROM public.plan_versions tiered
        WHERE tiered.product_code = req.product_code AND tiered.status = 'APPROVED'
          AND tiered.tier_code IS NOT NULL
          AND tiered.amount_minor IS NOT NULL AND tiered.tax_behaviour = 'NOT_APPLICABLE'
          AND tiered.terms_ref IS NOT NULL AND tiered.effective_from <= pg_catalog.now()
          AND (tiered.effective_to IS NULL OR tiered.effective_to > pg_catalog.now())
      ) THEN
        RETURN jsonb_build_object('status', 'tier_required', 'id', enquiry.id, 'requestId', req.id);
      END IF;
      SELECT * INTO plan FROM public.plan_versions
      WHERE product_code = req.product_code AND status = 'APPROVED'
        AND tier_code IS NULL
        AND amount_minor IS NOT NULL AND tax_behaviour = 'NOT_APPLICABLE'
        AND terms_ref IS NOT NULL AND effective_from <= pg_catalog.now()
        AND (effective_to IS NULL OR effective_to > pg_catalog.now());
      IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'terms_unconfigured', 'id', enquiry.id, 'requestId', req.id);
      END IF;
    END IF;
    SELECT * INTO chosen_conditions FROM public.commercial_plan_conditions
    WHERE plan_version_id = plan.id AND status = 'APPROVED';
    IF plan.tier_code IS NOT NULL AND chosen_conditions.id IS NOT NULL
      AND chosen_conditions.tier_code IS DISTINCT FROM plan.tier_code THEN
      RETURN jsonb_build_object('status', 'tier_mismatch', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF plan.id IS NULL OR plan.product_code IS DISTINCT FROM req.product_code OR plan.status IS DISTINCT FROM 'APPROVED'
      OR plan.amount_minor IS NULL OR plan.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
      OR plan.terms_ref IS NULL OR plan.effective_from > pg_catalog.now()
      OR (plan.effective_to IS NOT NULL AND plan.effective_to <= pg_catalog.now())
    THEN RETURN jsonb_build_object('status', 'terms_unconfigured', 'id', enquiry.id, 'requestId', req.id); END IF;
    SELECT count(*) INTO component_count FROM public.plan_components AS pieces WHERE pieces.plan_version_id = plan.id;
    SELECT pieces.quantity_limit INTO telloya_limit FROM public.plan_components AS pieces
    WHERE pieces.plan_version_id = plan.id AND pieces.component_code = 'TELLOYA';
    SELECT pieces.quantity_limit INTO guard_limit FROM public.plan_components AS pieces
    WHERE pieces.plan_version_id = plan.id AND pieces.component_code = 'GUARD';
    IF req.product_code = 'TELLOYA' AND (component_count IS DISTINCT FROM 1 OR telloya_limit IS NULL OR guard_limit IS NOT NULL) THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'components', 'id', enquiry.id, 'requestId', req.id);
    ELSIF req.product_code = 'COMPLETE' AND (component_count IS DISTINCT FROM 2 OR telloya_limit IS NULL OR guard_limit IS NULL) THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'components', 'id', enquiry.id, 'requestId', req.id);
    ELSIF req.product_code NOT IN ('TELLOYA', 'COMPLETE') THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'components', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF covered IS DISTINCT FROM telloya_limit THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'locations', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF chosen_conditions.id IS NULL OR chosen_conditions.status IS DISTINCT FROM 'APPROVED' THEN
      RETURN jsonb_build_object(
        'status', 'terms_unconfigured',
        'reason', CASE WHEN plan.tier_code = 'CUSTOM' THEN 'quotation' ELSE 'conditions' END,
        'id', enquiry.id, 'requestId', req.id
      );
    END IF;
    IF plan.tier_code IS NOT NULL AND chosen_conditions.tier_code IS DISTINCT FROM plan.tier_code THEN
      RETURN jsonb_build_object('status', 'tier_mismatch', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF plan.currency IS DISTINCT FROM 'GBP'
      OR plan.billing_cadence IS DISTINCT FROM 'MONTH'
      OR plan.amount_minor IS NULL
      OR plan.amount_minor <= 0
      OR (
        req.product_code = 'TELLOYA'
        AND (
          chosen_conditions.base_amount_minor IS DISTINCT FROM plan.amount_minor
          OR (
            chosen_conditions.guard_unit_amount_minor IS NOT NULL
            AND chosen_conditions.guard_unit_amount_minor IS DISTINCT FROM 999
          )
        )
      )
      OR (
        req.product_code = 'COMPLETE'
        AND (
          chosen_conditions.guard_unit_amount_minor IS NULL
          OR chosen_conditions.base_amount_minor
            + chosen_conditions.guard_unit_amount_minor * guard_limit
            IS DISTINCT FROM plan.amount_minor
        )
      )
    THEN
      RETURN jsonb_build_object(
        'status', 'terms_unconfigured',
        'reason', CASE WHEN plan.tier_code = 'CUSTOM' AND plan.amount_minor IS NULL THEN 'quotation' ELSE 'price' END,
        'id', enquiry.id, 'requestId', req.id
      );
    END IF;
    IF plan.terms_ref IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.commercial_agreement_versions agreement
      WHERE agreement.product_code = plan.product_code
        AND agreement.version_ref = plan.terms_ref
        AND agreement.status = 'APPROVED'
    ) THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'agreement', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    addon_count := 0;
    guard_ids := ARRAY[]::uuid[];
    IF p_payload ? 'guardLocationIds' AND jsonb_typeof(p_payload->'guardLocationIds') = 'array' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(p_payload->'guardLocationIds') AS listed(value)
        WHERE listed.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      SELECT coalesce(array_agg(DISTINCT listed.value::uuid), ARRAY[]::uuid[])
      INTO guard_ids
      FROM jsonb_array_elements_text(p_payload->'guardLocationIds') AS listed(value);
      addon_count := coalesce(cardinality(guard_ids), 0);
    ELSIF p_payload ? 'guardLocationIds' AND p_payload->'guardLocationIds' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF addon_count > 999 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF addon_count > 0 AND EXISTS (
      SELECT 1
      FROM unnest(guard_ids) AS picked(location_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.locations location
        WHERE location.id = picked.location_id
          AND location.business_id = req.business_id
      )
    ) THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'guard', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF req.product_code = 'COMPLETE' AND addon_count > 0 THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'guard', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF req.product_code = 'TELLOYA' AND addon_count > 0
      AND chosen_conditions.guard_unit_amount_minor IS DISTINCT FROM 999
    THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'price', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    composed_amount := plan.amount_minor;
    IF req.product_code = 'TELLOYA' AND addon_count > 0 THEN
      composed_amount := plan.amount_minor + 999 * addon_count;
    END IF;
    SELECT id INTO occupying FROM public.commercial_subscriptions
    WHERE business_id = req.business_id AND state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
    LIMIT 1;
    IF EXISTS (
      SELECT 1 FROM public.commercial_subscriptions
      WHERE business_id = req.business_id AND state IN ('OFFERED', 'ACCEPTED', 'PAYMENT_PENDING')
    ) THEN RETURN jsonb_build_object('status', 'conflict', 'reason', 'offer'); END IF;
    FOR attempt IN 1..8 LOOP
      opened_ref := admin_private.commercial_public_ref_v1();
      BEGIN
        INSERT INTO public.commercial_subscriptions(
          public_ref, customer_id, business_id, plan_family, plan_version_id, grant_kind, state,
          amount_minor, currency, tax_behaviour, tax_amount_minor, cadence_snapshot, terms_ref,
          succeeds_subscription_id
        ) VALUES (
          opened_ref, req.customer_id, req.business_id, 'VOICE', plan.id, 'BILLABLE', 'DRAFT',
          composed_amount, plan.currency, plan.tax_behaviour, NULL, plan.billing_cadence, plan.terms_ref,
          occupying
        ) RETURNING id INTO opened_subscription;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        opened_subscription := NULL;
      END;
    END LOOP;
    IF opened_subscription IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    FOR piece IN
      SELECT pieces.component_code, pieces.quantity_limit
      FROM public.plan_components AS pieces
      WHERE pieces.plan_version_id = plan.id
    LOOP
      INSERT INTO public.commercial_subscription_items(
        subscription_id, component_code, quantity, quantity_limit_snapshot
      ) VALUES (opened_subscription, piece.component_code, piece.quantity_limit, piece.quantity_limit);
    END LOOP;
    IF req.product_code = 'TELLOYA' AND addon_count > 0 THEN
      INSERT INTO public.commercial_subscription_items(
        subscription_id, component_code, quantity, quantity_limit_snapshot
      ) VALUES (opened_subscription, 'GUARD', addon_count, addon_count);
      INSERT INTO admin_private.commercial_offer_guard_locations(subscription_id, location_id)
      SELECT opened_subscription, picked.location_id
      FROM unnest(guard_ids) AS picked(location_id);
    END IF;
    UPDATE public.commercial_subscriptions SET state = 'OFFERED' WHERE id = opened_subscription;
    UPDATE public.onboarding_requests
    SET commercial_subscription_id = opened_subscription, state = 'OFFERED'
    WHERE id = req.id
    RETURNING * INTO req;
    INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
    VALUES (opened_subscription, actor, p_request, 'DRAFT', 'OFFERED', note);
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'prepare_offer', previous, 'OFFERED', note,
      jsonb_build_object('planVersionId', plan.id, 'tierCode', plan.tier_code, 'amountMinor', composed_amount, 'guardLocationCount', addon_count, 'taxBehaviour', plan.tax_behaviour, 'invitationSent', false, 'paymentRecorded', false));
  ELSE
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF req.record_version IS NOT DISTINCT FROM p_version THEN
    UPDATE public.onboarding_requests
    SET updated_at = pg_catalog.now()
    WHERE id = req.id
    RETURNING * INTO req;
  END IF;

  result := jsonb_build_object('status', outcome, 'id', enquiry.id, 'requestId', req.id, 'version', req.record_version);
  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, result);
  RETURN result;
END;
$$;

COMMIT;
