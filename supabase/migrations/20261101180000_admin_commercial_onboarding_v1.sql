-- CUSTOMER-PLATFORM-02C Admin onboarding commands.
-- Forward-only. Not applied to DEV. Do not apply it to Production.
-- appliedToDev stays false until a human applies this file.
--
-- This file adds Admin commands and an append-only onboarding history.
-- It does not send mail, does not write a contact verification,
-- does not create a portal session, does not create an Auth user,
-- does not insert an invitation, and does not convert the enquiry into a
-- Recovery case or a Guard monitoring request. A billable offer is inserted
-- only from an already approved priced plan, with each component's own
-- approved quantity. No price is seeded here. Declining a prepared offer
-- withdraws that offer in the same transaction.

BEGIN;

CREATE TABLE admin_private.onboarding_request_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests (id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  request_id uuid,
  operation text NOT NULL CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer'
  )),
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (octet_length(details::text) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX onboarding_request_events_parent_idx
  ON admin_private.onboarding_request_events (onboarding_request_id, id DESC);

CREATE UNIQUE INDEX onboarding_request_events_request_idx
  ON admin_private.onboarding_request_events (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE admin_private.onboarding_request_locations (
  onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (onboarding_request_id, location_id)
);

ALTER TABLE admin_private.onboarding_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.onboarding_request_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_private.onboarding_request_events, admin_private.onboarding_request_locations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.onboarding_request_events_id_seq
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER onboarding_request_events_append_only
  BEFORE UPDATE OR DELETE ON admin_private.onboarding_request_events
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE FUNCTION admin_private.commercial_request_uuid_v1(p_request uuid, p_suffix text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (
    substr(md5(p_request::text || ':' || p_suffix), 1, 8) || '-' ||
    substr(md5(p_request::text || ':' || p_suffix), 9, 4) || '-' ||
    '4' || substr(md5(p_request::text || ':' || p_suffix), 14, 3) || '-' ||
    'a' || substr(md5(p_request::text || ':' || p_suffix), 18, 3) || '-' ||
    substr(md5(p_request::text || ':' || p_suffix), 21, 12)
  )::uuid;
$$;

CREATE FUNCTION admin_private.commercial_enquiry_text_v1(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(p_payload->>'service', '') || ' ' || coalesce(p_payload->>'subject', '') || ' ' || coalesce(p_payload->>'details', ''));
$$;

CREATE FUNCTION admin_private.commercial_explicit_product_v1(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_payload->>'product', ''))) = 'complete' THEN 'COMPLETE'
    WHEN lower(btrim(coalesce(p_payload->>'product', ''))) = 'telloya' THEN 'TELLOYA'
    WHEN upper(btrim(coalesce(p_payload->>'product_interest', ''))) = 'COMPLETE' THEN 'COMPLETE'
    WHEN upper(btrim(coalesce(p_payload->>'product_interest', ''))) = 'TELLOYA' THEN 'TELLOYA'
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.commercial_enquiry_supported_v1(p_payload jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_payload->>'email', '') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND lower(coalesce(p_payload->>'service', '')) NOT IN ('profile-recovery', 'profile-access', 'review-protection', 'monitoring')
    AND (
      admin_private.commercial_explicit_product_v1(p_payload) IS NOT NULL
      OR admin_private.commercial_enquiry_text_v1(p_payload) ~ '(^|[^[:alnum:]])(telloya|complete)([^[:alnum:]]|$)'
    );
$$;

CREATE FUNCTION admin_private.commercial_product_hint_v1(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN admin_private.commercial_explicit_product_v1(p_payload) IS NOT NULL
      THEN admin_private.commercial_explicit_product_v1(p_payload)
    WHEN lower(coalesce(p_payload->>'service', '')) ~ '^complete([^[:alnum:]]|$)' THEN 'COMPLETE'
    WHEN lower(coalesce(p_payload->>'service', '')) ~ '^telloya([^[:alnum:]]|$)' THEN 'TELLOYA'
    WHEN admin_private.commercial_enquiry_text_v1(p_payload) ~ '(^|[^[:alnum:]])complete([^[:alnum:]]|$)'
      AND admin_private.commercial_enquiry_text_v1(p_payload) !~ '(^|[^[:alnum:]])telloya([^[:alnum:]]|$)' THEN 'COMPLETE'
    WHEN admin_private.commercial_enquiry_text_v1(p_payload) ~ '(^|[^[:alnum:]])telloya([^[:alnum:]]|$)'
      AND admin_private.commercial_enquiry_text_v1(p_payload) !~ '(^|[^[:alnum:]])complete([^[:alnum:]]|$)' THEN 'TELLOYA'
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.commercial_public_ref_v1()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  body text := '';
  index integer;
  roll integer;
BEGIN
  FOR roll IN 1..6 LOOP
    index := 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32);
    body := body || substr(alphabet, index, 1);
  END LOOP;
  RETURN 'VC-' || to_char(pg_catalog.now() AT TIME ZONE 'UTC', 'YY') || '-' || body;
END;
$$;

CREATE FUNCTION admin_private.onboarding_event_v1(
  p_onboarding uuid,
  p_actor uuid,
  p_request uuid,
  p_operation text,
  p_from text,
  p_to text,
  p_reason text,
  p_details jsonb
) RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO admin_private.onboarding_request_events(
    onboarding_request_id, actor_id, request_id, operation, from_state, to_state, reason, details
  ) VALUES (
    p_onboarding, p_actor, p_request, p_operation, p_from, p_to, p_reason, coalesce(p_details, '{}'::jsonb)
  );
$$;

CREATE FUNCTION admin_private.ensure_commercial_product_v1(p_code text)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.product_catalogue(code, name, kind, status)
  VALUES (
    p_code,
    CASE p_code WHEN 'TELLOYA' THEN 'Telloya' ELSE 'Complete' END,
    CASE p_code WHEN 'TELLOYA' THEN 'STANDALONE' ELSE 'BUNDLE' END,
    'DRAFT'
  )
  ON CONFLICT (code) DO NOTHING;
END;
$$;

CREATE FUNCTION public.admin_commercial_command_v1(
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
      SELECT * INTO plan FROM public.plan_versions
      WHERE product_code = req.product_code AND status = 'APPROVED'
        AND amount_minor IS NOT NULL AND tax_behaviour = 'NOT_APPLICABLE'
        AND terms_ref IS NOT NULL AND effective_from <= pg_catalog.now()
        AND (effective_to IS NULL OR effective_to > pg_catalog.now())
      ORDER BY version_number
      LIMIT 1;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'terms_unconfigured', 'id', enquiry.id, 'requestId', req.id);
      END IF;
      IF (SELECT count(*) FROM public.plan_versions
          WHERE product_code = req.product_code AND status = 'APPROVED'
            AND amount_minor IS NOT NULL AND tax_behaviour = 'NOT_APPLICABLE'
            AND terms_ref IS NOT NULL AND effective_from <= pg_catalog.now()
            AND (effective_to IS NULL OR effective_to > pg_catalog.now())) > 1
      THEN RETURN jsonb_build_object('status', 'terms_unconfigured', 'id', enquiry.id, 'requestId', req.id); END IF;
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
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'quantities', 'id', enquiry.id, 'requestId', req.id);
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
          plan.amount_minor, plan.currency, plan.tax_behaviour, NULL, plan.billing_cadence, plan.terms_ref,
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
    UPDATE public.commercial_subscriptions SET state = 'OFFERED' WHERE id = opened_subscription;
    UPDATE public.onboarding_requests
    SET commercial_subscription_id = opened_subscription, state = 'OFFERED'
    WHERE id = req.id
    RETURNING * INTO req;
    INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
    VALUES (opened_subscription, actor, p_request, 'DRAFT', 'OFFERED', note);
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'prepare_offer', previous, 'OFFERED', note,
      jsonb_build_object('planVersionId', plan.id, 'amountMinor', plan.amount_minor, 'taxBehaviour', plan.tax_behaviour, 'invitationSent', false, 'paymentRecorded', false));
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

CREATE FUNCTION public.admin_commercial_onboarding_v1(p_token text, p_enquiry uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  enquiry public.enquiries;
  req public.onboarding_requests;
  supported boolean;
  hint text;
  mailbox text;
  customer jsonb;
  candidates jsonb := '[]'::jsonb;
  businesses jsonb;
  locations jsonb;
  history jsonb;
  membership_status text;
  email_verified boolean := false;
  contact_verified boolean := false;
  location_count integer := 0;
  terms_configured boolean := false;
  plan_count integer := 0;
  telloya_limit integer;
  guard_count integer := 0;
  invitation_ready boolean := false;
  outstanding jsonb := '[]'::jsonb;
  step text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_enquiry IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  SELECT * INTO enquiry FROM public.enquiries WHERE id = p_enquiry;
  IF enquiry.id IS NULL THEN RETURN jsonb_build_object('missing', true); END IF;
  supported := enquiry.status IN ('new', 'open', 'waiting', 'closed')
    AND admin_private.commercial_enquiry_supported_v1(enquiry.payload);
  hint := admin_private.commercial_product_hint_v1(enquiry.payload);
  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC LIMIT 1;
  IF req.id IS NULL THEN
    SELECT * INTO req FROM public.onboarding_requests
    WHERE enquiry_id = enquiry.id AND state = 'DECLINED'
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF req.id IS NOT NULL THEN supported := true; END IF;
  IF NOT supported AND req.id IS NULL THEN
    RETURN jsonb_build_object('supported', false);
  END IF;
  mailbox := lower(btrim(enquiry.payload->>'email'));
  IF req.customer_id IS NOT NULL THEN
    email_verified := admin_private.contact_verified_v1(req.customer_id, 'email');
    contact_verified := email_verified OR admin_private.contact_verified_v1(req.customer_id, 'phone');
    SELECT jsonb_build_object(
      'id', c.id, 'name', c.full_name, 'emailVerified', email_verified, 'version', c.record_version
    ) INTO customer FROM public.customers c WHERE c.id = req.customer_id;
    SELECT status INTO membership_status FROM public.business_memberships
    WHERE customer_id = req.customer_id AND business_id = req.business_id;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.full_name, 'emailVerified', admin_private.contact_verified_v1(c.id, 'email')
    )), '[]'::jsonb) INTO candidates
    FROM public.customers c WHERE lower(c.email) = mailbox;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'name', b.display_name, 'membership', m.status, 'membershipVersion', m.record_version
  ) ORDER BY b.display_name), '[]'::jsonb)
  INTO businesses
  FROM public.business_memberships m
  JOIN public.businesses b ON b.id = m.business_id
  WHERE req.customer_id IS NOT NULL AND m.customer_id = req.customer_id;
  SELECT count(*) INTO location_count FROM admin_private.onboarding_request_locations WHERE onboarding_request_id = req.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'name', coalesce(l.location_name, b.display_name), 'country', l.country,
    'selected', EXISTS (
      SELECT 1 FROM admin_private.onboarding_request_locations selected
      WHERE selected.onboarding_request_id = req.id AND selected.location_id = l.id
    )
  ) ORDER BY l.location_name), '[]'::jsonb)
  INTO locations
  FROM public.locations l
  JOIN public.businesses b ON b.id = l.business_id
  WHERE req.business_id IS NOT NULL AND l.business_id = req.business_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id::text, 'operation', event.operation, 'fromState', event.from_state,
    'toState', event.to_state, 'reason', event.reason, 'createdAt', event.created_at
  ) ORDER BY event.id DESC), '[]'::jsonb)
  INTO history
  FROM (
    SELECT * FROM admin_private.onboarding_request_events
    WHERE onboarding_request_id = req.id
    ORDER BY id DESC LIMIT 50
  ) event;
  terms_configured := EXISTS (
    SELECT 1 FROM public.plan_versions plan
    WHERE req.product_code IS NOT NULL AND plan.product_code = req.product_code AND plan.status = 'APPROVED'
      AND plan.amount_minor IS NOT NULL AND plan.tax_behaviour = 'NOT_APPLICABLE' AND plan.terms_ref IS NOT NULL
      AND plan.effective_from <= pg_catalog.now()
      AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
  );
  invitation_ready := req.id IS NOT NULL AND req.state NOT IN ('DECLINED', 'CLOSED') AND EXISTS (
    SELECT 1 FROM admin_private.onboarding_request_events ready
    WHERE ready.onboarding_request_id = req.id AND ready.operation = 'mark_ready'
      AND NOT EXISTS (
        SELECT 1 FROM admin_private.onboarding_request_events later
        WHERE later.onboarding_request_id = req.id AND later.id > ready.id
          AND later.operation IN ('match_customer', 'match_business', 'select_locations', 'decline')
      )
  );
  IF req.id IS NULL OR req.state = 'DECLINED' THEN step := 'classify';
  ELSIF req.customer_id IS NULL THEN step := 'customer';
  ELSIF req.business_id IS NULL THEN step := 'business';
  ELSIF location_count = 0 THEN step := 'locations';
  ELSE step := 'next';
  END IF;
  IF step = 'classify' THEN
    outstanding := outstanding || jsonb_build_array('Choose Telloya or Complete and open the onboarding request.');
  END IF;
  IF step = 'customer' THEN
    outstanding := outstanding || jsonb_build_array('Match the customer who uses this email. A second customer is not created when that email already exists.');
  END IF;
  IF req.customer_id IS NOT NULL AND NOT email_verified THEN
    outstanding := outstanding || jsonb_build_array('The customer email is not verified. Admin approval does not verify it and does not send an invitation.');
  END IF;
  IF step = 'business' THEN
    outstanding := outstanding || jsonb_build_array('Match the business. Pending authority is not verified authority.');
  END IF;
  IF req.business_id IS NOT NULL AND membership_status IS DISTINCT FROM 'verified' THEN
    outstanding := outstanding || jsonb_build_array(
      CASE membership_status
        WHEN 'revoked' THEN 'Business authority has been withdrawn. Withdrawn authority cannot receive an invitation.'
        ELSE 'Business authority is still pending. Pending is not verified authority.'
      END
    );
  END IF;
  IF step = 'locations' THEN
    outstanding := outstanding || jsonb_build_array('Choose the locations this product will cover.');
  END IF;
  IF step = 'next' AND NOT terms_configured THEN
    outstanding := outstanding || jsonb_build_array('Commercial terms not yet configured. No approved price is offered.');
  END IF;
  IF step = 'next' AND terms_configured AND req.commercial_subscription_id IS NULL THEN
    SELECT count(*) INTO plan_count FROM public.plan_versions plan
    WHERE plan.product_code = req.product_code AND plan.status = 'APPROVED'
      AND plan.amount_minor IS NOT NULL AND plan.tax_behaviour = 'NOT_APPLICABLE' AND plan.terms_ref IS NOT NULL
      AND plan.effective_from <= pg_catalog.now()
      AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now());
    IF plan_count = 1 THEN
      SELECT component.quantity_limit INTO telloya_limit
      FROM public.plan_components component
      JOIN public.plan_versions plan ON plan.id = component.plan_version_id
      WHERE plan.product_code = req.product_code AND plan.status = 'APPROVED'
        AND plan.amount_minor IS NOT NULL AND plan.tax_behaviour = 'NOT_APPLICABLE' AND plan.terms_ref IS NOT NULL
        AND plan.effective_from <= pg_catalog.now()
        AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
        AND component.component_code = 'TELLOYA';
      SELECT count(*) INTO guard_count
      FROM public.plan_components component
      JOIN public.plan_versions plan ON plan.id = component.plan_version_id
      WHERE plan.product_code = req.product_code AND plan.status = 'APPROVED'
        AND component.component_code = 'GUARD'
        AND plan.amount_minor IS NOT NULL AND plan.tax_behaviour = 'NOT_APPLICABLE' AND plan.terms_ref IS NOT NULL
        AND plan.effective_from <= pg_catalog.now()
        AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now());
      IF telloya_limit IS NULL OR (req.product_code = 'COMPLETE' AND guard_count IS DISTINCT FROM 1) OR (req.product_code = 'TELLOYA' AND guard_count <> 0) THEN
        outstanding := outstanding || jsonb_build_array('This plan does not include the required components. No price is offered.');
      ELSIF location_count IS DISTINCT FROM telloya_limit THEN
        outstanding := outstanding || jsonb_build_array('The selected locations do not match the approved Telloya quantity. Guard is not given that same quantity. No price is offered.');
      END IF;
    END IF;
  END IF;
  IF step = 'next' AND NOT invitation_ready THEN
    outstanding := outstanding || jsonb_build_array(
      CASE WHEN email_verified
        THEN 'Record that this request is ready for a later invitation. This step does not send email. The customer can use the existing verified login.'
        ELSE 'Record that this request is ready for a later invitation. This step does not send email, because mailbox proof is not available yet.'
      END
    );
  END IF;
  IF invitation_ready AND NOT email_verified THEN
    outstanding := outstanding || jsonb_build_array('Ready for invitation is recorded. No invitation email has been sent.');
  END IF;
  RETURN jsonb_build_object(
    'supported', true,
    'productHint', hint,
    'step', step,
    'termsConfigured', terms_configured,
    'invitationReady', invitation_ready,
    'invitationSent', false,
    'emailVerified', email_verified,
    'contactVerified', contact_verified,
    'membership', membership_status,
    'outstanding', outstanding,
    'nextAction', outstanding->>0,
    'request', CASE WHEN req.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', req.id, 'product', req.product_code, 'state', req.state, 'version', req.record_version,
      'customerId', req.customer_id, 'businessId', req.business_id,
      'declineReason', req.decline_reason, 'subscriptionId', req.commercial_subscription_id
    ) END,
    'customer', customer,
    'candidates', candidates,
    'businesses', coalesce(businesses, '[]'::jsonb),
    'locations', coalesce(locations, '[]'::jsonb),
    'history', coalesce(history, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_request_uuid_v1(uuid, text),
  admin_private.commercial_enquiry_text_v1(jsonb),
  admin_private.commercial_explicit_product_v1(jsonb),
  admin_private.commercial_enquiry_supported_v1(jsonb),
  admin_private.commercial_product_hint_v1(jsonb),
  admin_private.commercial_public_ref_v1(),
  admin_private.onboarding_event_v1(uuid, uuid, uuid, text, text, text, text, jsonb),
  admin_private.ensure_commercial_product_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_commercial_command_v1(text, uuid, text, jsonb, integer),
  public.admin_commercial_onboarding_v1(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_commercial_command_v1(text, uuid, text, jsonb, integer),
  public.admin_commercial_onboarding_v1(text, uuid) TO service_role;

COMMIT;
