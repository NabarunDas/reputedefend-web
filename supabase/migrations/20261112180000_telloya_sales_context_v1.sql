BEGIN;
-- Telloya sales-context composite after a completed offline demonstration.
-- Source-only. Do not apply this file to DEV or Production without owner approval.
-- Do not edit or replay 20261112120000.
-- Reuses public.admin_commercial_command_v1 and the shared onboarding/commercial
-- records. It does not send email, create a Stripe object, contact Retell, or
-- prepare a paid offer. Business and location are linked only with matching
-- evidence or an explicit Admin confirmation. A sole unrelated business or
-- location is never selected automatically.
-- Nested reauth_required aborts the bootstrap subtransaction so classify or
-- customer writes cannot commit when recent Admin sign-in is required.

CREATE OR REPLACE FUNCTION admin_private.telloya_sales_context_norm_v1(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g')));
$$;

CREATE OR REPLACE FUNCTION public.telloya_sales_context_command_v1(
  p_token text,
  p_request uuid,
  p_operation text,
  p_payload jsonb
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
  demo admin_private.telloya_admin_demos;
  note text := 'Automatic Telloya sales context after a completed offline demonstration.';
  enquiry_name text;
  enquiry_website text;
  enquiry_location text;
  enquiry_country text;
  mailbox text;
  candidate_count integer := 0;
  matched_customer uuid;
  matched_business uuid;
  matched_location uuid;
  membership public.business_memberships;
  nested jsonb;
  version integer := 0;
  evidence_count integer := 0;
  result jsonb;
  create_name text;
  create_country text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN (
      'bootstrap', 'confirm_business', 'confirm_location', 'create_location'
    )
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 8000
    OR jsonb_typeof(p_payload->'enquiryId') IS DISTINCT FROM 'string'
    OR (p_payload->>'enquiryId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  fingerprint := md5(jsonb_build_object('operation', p_operation, 'payload', p_payload)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO receipt FROM admin_private.commercial_command_receipts WHERE request_id = p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.fingerprint = fingerprint THEN RETURN receipt.response; END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('onboarding:' || (p_payload->>'enquiryId'), 0));
  SELECT * INTO enquiry FROM public.enquiries WHERE id = (p_payload->>'enquiryId')::uuid FOR UPDATE;
  IF enquiry.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF enquiry.source IS DISTINCT FROM 'telloya' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_telloya');
  END IF;
  SELECT * INTO demo FROM admin_private.telloya_admin_demos WHERE enquiry_id = enquiry.id;
  IF demo.enquiry_id IS NULL OR demo.status IS DISTINCT FROM 'COMPLETED' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'demonstration_not_completed');
  END IF;

  enquiry_name := admin_private.telloya_sales_context_norm_v1(enquiry.payload->>'businessName');
  enquiry_website := admin_private.telloya_sales_context_norm_v1(enquiry.payload->>'websiteUrl');
  enquiry_location := admin_private.telloya_sales_context_norm_v1(enquiry.payload->>'locations');
  enquiry_country := nullif(admin_private.telloya_sales_context_norm_v1(enquiry.payload->>'country'), '');
  IF enquiry_country IS NULL THEN enquiry_country := 'united kingdom'; END IF;
  mailbox := lower(btrim(coalesce(enquiry.payload->>'email', '')));

  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF req.id IS NOT NULL THEN version := req.record_version; END IF;

  IF p_operation = 'bootstrap' THEN
    BEGIN
      IF req.id IS NULL THEN
        nested := public.admin_commercial_command_v1(
          p_token,
          admin_private.commercial_request_uuid_v1(p_request, 'classify'),
          'classify',
          jsonb_build_object('enquiryId', enquiry.id, 'product', 'TELLOYA', 'reason', note),
          0
        );
        IF nested->>'status' = 'reauth_required' THEN
          RAISE EXCEPTION 'telloya_sales_context reauth' USING ERRCODE = 'P0001';
        END IF;
        IF nested->>'status' IS DISTINCT FROM 'success' THEN
          RAISE EXCEPTION 'telloya_sales_context abort' USING ERRCODE = 'P0001';
        END IF;
        SELECT * INTO req FROM public.onboarding_requests
        WHERE enquiry_id = enquiry.id AND state NOT IN ('CLOSED', 'DECLINED')
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
        version := req.record_version;
      ELSIF req.product_code IS DISTINCT FROM 'TELLOYA' THEN
        result := jsonb_build_object('status', 'conflict', 'reason', 'product', 'exception', 'resolve_customer');
        INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
        VALUES (p_request, actor, fingerprint, result);
        RETURN result;
      END IF;

      IF req.customer_id IS NULL THEN
        SELECT count(*) INTO candidate_count FROM public.customers WHERE lower(email) = mailbox;
        IF candidate_count > 1 THEN
          RAISE EXCEPTION 'telloya_sales_context abort' USING ERRCODE = 'P0001';
        END IF;
        IF candidate_count = 1 THEN
          SELECT id INTO matched_customer FROM public.customers WHERE lower(email) = mailbox;
          nested := public.admin_commercial_command_v1(
            p_token,
            admin_private.commercial_request_uuid_v1(p_request, 'match_customer'),
            'match_customer',
            jsonb_build_object('enquiryId', enquiry.id, 'customerId', matched_customer, 'reason', note),
            version
          );
        ELSE
          nested := public.admin_commercial_command_v1(
            p_token,
            admin_private.commercial_request_uuid_v1(p_request, 'match_customer'),
            'match_customer',
            jsonb_build_object('enquiryId', enquiry.id, 'create', true, 'reason', note),
            version
          );
        END IF;
        IF nested->>'status' = 'reauth_required' THEN
          RAISE EXCEPTION 'telloya_sales_context reauth' USING ERRCODE = 'P0001';
        END IF;
        IF nested->>'status' IS DISTINCT FROM 'success' THEN
          RAISE EXCEPTION 'telloya_sales_context abort' USING ERRCODE = 'P0001';
        END IF;
        SELECT * INTO req FROM public.onboarding_requests WHERE id = req.id FOR UPDATE;
        version := req.record_version;
      END IF;

      IF req.business_id IS NULL THEN
        SELECT count(*) INTO evidence_count
        FROM public.business_memberships m
        JOIN public.businesses b ON b.id = m.business_id
        WHERE m.customer_id = req.customer_id
          AND m.status IS DISTINCT FROM 'revoked'
          AND (
            (enquiry_name <> '' AND admin_private.telloya_sales_context_norm_v1(b.display_name) = enquiry_name)
            OR (enquiry_website <> '' AND admin_private.telloya_sales_context_norm_v1(b.website_url) = enquiry_website)
          );
        IF evidence_count > 1 THEN
          result := jsonb_build_object(
            'status', 'success',
            'exception', 'resolve_business',
            'message', 'More than one business matches the enquiry evidence. Confirm the business before continuing.',
            'version', version
          );
          INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
          VALUES (p_request, actor, fingerprint, result);
          RETURN result;
        END IF;
        IF evidence_count = 1 THEN
          SELECT b.id INTO matched_business
          FROM public.business_memberships m
          JOIN public.businesses b ON b.id = m.business_id
          WHERE m.customer_id = req.customer_id
            AND m.status IS DISTINCT FROM 'revoked'
            AND (
              (enquiry_name <> '' AND admin_private.telloya_sales_context_norm_v1(b.display_name) = enquiry_name)
              OR (enquiry_website <> '' AND admin_private.telloya_sales_context_norm_v1(b.website_url) = enquiry_website)
            )
          LIMIT 1;
          SELECT * INTO membership FROM public.business_memberships
          WHERE customer_id = req.customer_id AND business_id = matched_business;
          nested := public.admin_commercial_command_v1(
            p_token,
            admin_private.commercial_request_uuid_v1(p_request, 'match_business'),
            'match_business',
            jsonb_build_object(
              'enquiryId', enquiry.id,
              'businessId', matched_business,
              'membership', CASE WHEN membership.status = 'verified' THEN 'verified' ELSE 'pending' END,
              'reason', note
            ),
            version
          );
        ELSIF NOT EXISTS (
          SELECT 1 FROM public.business_memberships m
          WHERE m.customer_id = req.customer_id AND m.status IS DISTINCT FROM 'revoked'
        ) THEN
          -- Creating a membership requires the existing Admin recent-sign-in gate.
          -- Check before the nested write so an expired privilege never leaves
          -- classify/customer rows from this bootstrap.
          IF (s->>'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
            RAISE EXCEPTION 'telloya_sales_context reauth' USING ERRCODE = 'P0001';
          END IF;
          nested := public.admin_commercial_command_v1(
            p_token,
            admin_private.commercial_request_uuid_v1(p_request, 'match_business'),
            'match_business',
            jsonb_build_object(
              'enquiryId', enquiry.id,
              'create', true,
              'name', coalesce(nullif(btrim(enquiry.payload->>'businessName'), ''), 'Telloya business'),
              'website', CASE
                WHEN coalesce(btrim(enquiry.payload->>'websiteUrl'), '') = '' THEN ''
                WHEN btrim(enquiry.payload->>'websiteUrl') ~* '^https?://' THEN left(btrim(enquiry.payload->>'websiteUrl'), 2048)
                ELSE left('https://' || btrim(enquiry.payload->>'websiteUrl'), 2048)
              END,
              'membership', 'pending',
              'reason', note
            ),
            version
          );
        ELSE
          result := jsonb_build_object(
            'status', 'success',
            'exception', 'confirm_business_authority',
            'message', 'Confirm the business. An existing membership is not selected without matching enquiry evidence.',
            'version', version
          );
          INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
          VALUES (p_request, actor, fingerprint, result);
          RETURN result;
        END IF;
        IF nested->>'status' = 'reauth_required' THEN
          RAISE EXCEPTION 'telloya_sales_context reauth' USING ERRCODE = 'P0001';
        END IF;
        IF nested->>'status' IS DISTINCT FROM 'success' THEN
          IF nested->>'reason' = 'revoked' THEN
            RAISE EXCEPTION 'telloya_sales_context revoked' USING ERRCODE = 'P0001';
          END IF;
          RAISE EXCEPTION 'telloya_sales_context abort' USING ERRCODE = 'P0001';
        END IF;
        SELECT * INTO req FROM public.onboarding_requests WHERE id = req.id FOR UPDATE;
        version := req.record_version;
      END IF;

      IF req.business_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admin_private.onboarding_request_locations WHERE onboarding_request_id = req.id
      ) THEN
        SELECT count(*) INTO evidence_count
        FROM public.locations l
        WHERE l.business_id = req.business_id
          AND enquiry_location <> ''
          AND admin_private.telloya_sales_context_norm_v1(l.location_name) = enquiry_location;
        IF evidence_count = 1 THEN
          SELECT l.id INTO matched_location
          FROM public.locations l
          WHERE l.business_id = req.business_id
            AND enquiry_location <> ''
            AND admin_private.telloya_sales_context_norm_v1(l.location_name) = enquiry_location
          LIMIT 1;
          nested := public.admin_commercial_command_v1(
            p_token,
            admin_private.commercial_request_uuid_v1(p_request, 'select_locations'),
            'select_locations',
            jsonb_build_object('enquiryId', enquiry.id, 'locationIds', jsonb_build_array(matched_location), 'reason', note),
            version
          );
          IF nested->>'status' = 'reauth_required' THEN
            RAISE EXCEPTION 'telloya_sales_context reauth' USING ERRCODE = 'P0001';
          END IF;
          IF nested->>'status' IS DISTINCT FROM 'success' THEN
            RAISE EXCEPTION 'telloya_sales_context abort' USING ERRCODE = 'P0001';
          END IF;
          SELECT * INTO req FROM public.onboarding_requests WHERE id = req.id FOR UPDATE;
          version := req.record_version;
        ELSE
          result := jsonb_build_object(
            'status', 'success',
            'exception', 'confirm_operating_location',
            'message', 'Confirm the operating location. Enquiry location text is not a verified service address.',
            'version', version
          );
          INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
          VALUES (p_request, actor, fingerprint, result);
          RETURN result;
        END IF;
      END IF;

      result := jsonb_build_object(
        'status', 'success',
        'message', 'Telloya offer workspace is ready for review. No offer email was sent.',
        'version', version
      );
      INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
      VALUES (p_request, actor, fingerprint, result);
      RETURN result;
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM = 'telloya_sales_context reauth' THEN
          RETURN jsonb_build_object('status', 'reauth_required');
        END IF;
        IF SQLERRM = 'telloya_sales_context revoked' THEN
          RETURN jsonb_build_object('status', 'denied', 'reason', 'revoked', 'exception', 'revoked_membership');
        END IF;
        IF SQLERRM <> 'telloya_sales_context abort' THEN RAISE; END IF;
        RETURN jsonb_build_object(
          'status', 'conflict',
          'exception', 'resolve_customer',
          'message', 'Telloya sales context could not be prepared safely. Resolve the customer or reload the enquiry.'
        );
    END;
  END IF;

  IF req.id IS NULL OR req.product_code IS DISTINCT FROM 'TELLOYA' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  version := req.record_version;

  IF p_operation = 'confirm_business' THEN
    IF jsonb_typeof(p_payload->'businessId') IS DISTINCT FROM 'string'
      OR (p_payload->>'businessId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    matched_business := (p_payload->>'businessId')::uuid;
    SELECT * INTO membership FROM public.business_memberships
    WHERE customer_id = req.customer_id AND business_id = matched_business;
    IF NOT FOUND OR membership.status = 'revoked' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'revoked', 'exception', 'revoked_membership');
    END IF;
    nested := public.admin_commercial_command_v1(
      p_token,
      admin_private.commercial_request_uuid_v1(p_request, 'confirm_business'),
      'match_business',
      jsonb_build_object(
        'enquiryId', enquiry.id,
        'businessId', matched_business,
        'membership', CASE WHEN membership.status = 'verified' THEN 'verified' ELSE 'pending' END,
        'reason', note
      ),
      version
    );
  ELSIF p_operation = 'confirm_location' THEN
    IF jsonb_typeof(p_payload->'locationId') IS DISTINCT FROM 'string'
      OR (p_payload->>'locationId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    nested := public.admin_commercial_command_v1(
      p_token,
      admin_private.commercial_request_uuid_v1(p_request, 'confirm_location'),
      'select_locations',
      jsonb_build_object(
        'enquiryId', enquiry.id,
        'locationIds', jsonb_build_array((p_payload->>'locationId')::uuid),
        'reason', note
      ),
      version
    );
  ELSE
    create_name := coalesce(nullif(btrim(p_payload->>'locationName'), ''), nullif(btrim(enquiry.payload->>'locations'), ''), 'Primary location');
    create_country := coalesce(nullif(btrim(p_payload->>'country'), ''), nullif(btrim(enquiry.payload->>'country'), ''), 'United Kingdom');
    nested := public.admin_commercial_command_v1(
      p_token,
      admin_private.commercial_request_uuid_v1(p_request, 'create_location'),
      'select_locations',
      jsonb_build_object(
        'enquiryId', enquiry.id,
        'locationIds', '[]'::jsonb,
        'create', true,
        'locationName', left(create_name, 200),
        'country', left(create_country, 100),
        'reason', note
      ),
      version
    );
  END IF;

  IF nested->>'status' = 'success' THEN
    result := jsonb_build_object(
      'status', 'success',
      'message', 'Telloya offer workspace is ready for review. No offer email was sent.',
      'version', nested->'version'
    );
  ELSE
    result := nested;
  END IF;
  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.telloya_sales_context_norm_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.telloya_sales_context_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_sales_context_command_v1(text, uuid, text, jsonb) TO service_role;

COMMIT;
