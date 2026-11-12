BEGIN;
-- Telloya Admin offer-draft selections for the interactive calculator.
-- Source-only. Do not apply this file to DEV or Production without owner approval.
-- Do not edit or replay 20261112120000 or 20261112180000.
-- Stores Admin draft plan/Guard intent against one Telloya onboarding request.
-- This is not a commercial offer, subscription, approved plan, customer quote,
-- email, Stripe object, or Retell action. Official offers still use
-- public.admin_commercial_command_v1('prepare_offer').

CREATE TABLE admin_private.telloya_offer_drafts (
  onboarding_request_id uuid PRIMARY KEY REFERENCES public.onboarding_requests(id) ON DELETE CASCADE,
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  plan_tier text NULL CHECK (plan_tier IS NULL OR plan_tier IN ('basic', 'growth', 'pro', 'custom')),
  proposed_guard_quantity integer NOT NULL DEFAULT 0
    CHECK (proposed_guard_quantity >= 0 AND proposed_guard_quantity <= 50),
  guard_location_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  overage_opt_in boolean NOT NULL DEFAULT false,
  overage_cap_minor integer NULL CHECK (overage_cap_minor IS NULL OR overage_cap_minor > 0),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version > 0),
  actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telloya_offer_drafts_overage_cap_consistency CHECK (
    (overage_opt_in = false AND overage_cap_minor IS NULL)
    OR (overage_opt_in = true)
  ),
  CONSTRAINT telloya_offer_drafts_guard_ids_bounded CHECK (cardinality(guard_location_ids) <= 20)
);

CREATE UNIQUE INDEX telloya_offer_drafts_enquiry_uidx
  ON admin_private.telloya_offer_drafts (enquiry_id);

ALTER TABLE admin_private.telloya_offer_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.telloya_offer_drafts FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.telloya_offer_draft_v1(
  p_token text,
  p_enquiry_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  enquiry public.enquiries;
  req public.onboarding_requests;
  draft admin_private.telloya_offer_drafts;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_enquiry_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  SELECT * INTO enquiry FROM public.enquiries WHERE id = p_enquiry_id;
  IF enquiry.id IS NULL OR coalesce(enquiry.payload->>'source', '') <> 'telloya' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id AND product_code = 'TELLOYA'
  ORDER BY created_at DESC
  LIMIT 1;

  IF req.id IS NULL THEN
    RETURN jsonb_build_object('status', 'ready', 'draft', NULL, 'locked', false);
  END IF;

  SELECT * INTO draft FROM admin_private.telloya_offer_drafts
  WHERE onboarding_request_id = req.id;

  RETURN jsonb_build_object(
    'status', 'ready',
    'locked', req.commercial_subscription_id IS NOT NULL,
    'onboardingRequestId', req.id,
    'version', coalesce(draft.record_version, 0),
    'draft', CASE WHEN draft.onboarding_request_id IS NULL THEN NULL ELSE jsonb_build_object(
      'planTier', draft.plan_tier,
      'proposedGuardQuantity', draft.proposed_guard_quantity,
      'guardLocationIds', to_jsonb(draft.guard_location_ids),
      'overageOptIn', draft.overage_opt_in,
      'overageCapPence', draft.overage_cap_minor,
      'notes', draft.notes,
      'version', draft.record_version,
      'updatedAt', draft.updated_at
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.telloya_offer_draft_command_v1(
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
  draft admin_private.telloya_offer_drafts;
  expected integer;
  selected_plan_tier text;
  selected_proposed_guard integer;
  guard_ids uuid[] := '{}'::uuid[];
  selected_overage_opt_in boolean := false;
  selected_overage_cap integer := NULL;
  selected_notes text := '';
  location_ok integer;
  result jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;

  IF p_request IS NULL OR p_operation IS DISTINCT FROM 'save'
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

  PERFORM pg_advisory_xact_lock(hashtextextended('telloya-offer-draft:' || (p_payload->>'enquiryId'), 0));
  SELECT * INTO enquiry FROM public.enquiries WHERE id = (p_payload->>'enquiryId')::uuid FOR UPDATE;
  IF enquiry.id IS NULL OR coalesce(enquiry.payload->>'source', '') <> 'telloya' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_telloya');
  END IF;

  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id AND product_code = 'TELLOYA'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF req.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'onboarding_missing');
  END IF;
  IF req.commercial_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'offer_locked');
  END IF;

  expected := coalesce((p_payload->>'expectedVersion')::integer, -1);
  IF expected < 0 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  SELECT * INTO draft FROM admin_private.telloya_offer_drafts
  WHERE onboarding_request_id = req.id
  FOR UPDATE;
  IF draft.onboarding_request_id IS NULL AND expected <> 0 THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'stale_version');
  END IF;
  IF draft.onboarding_request_id IS NOT NULL AND draft.record_version <> expected THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'stale_version');
  END IF;

  IF jsonb_typeof(p_payload->'planTier') = 'null' OR p_payload->>'planTier' IS NULL OR btrim(p_payload->>'planTier') = '' THEN
    selected_plan_tier := NULL;
  ELSE
    selected_plan_tier := lower(btrim(p_payload->>'planTier'));
    IF selected_plan_tier NOT IN ('basic', 'growth', 'pro', 'custom') THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'plan_tier');
    END IF;
  END IF;

  selected_proposed_guard := coalesce((p_payload->>'proposedGuardQuantity')::integer, 0);
  IF selected_proposed_guard < 0 OR selected_proposed_guard > 50 THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'guard_quantity');
  END IF;

  IF jsonb_typeof(p_payload->'guardLocationIds') = 'array' THEN
    SELECT coalesce(array_agg(value::uuid), '{}'::uuid[])
      INTO guard_ids
    FROM jsonb_array_elements_text(p_payload->'guardLocationIds') AS value;
    IF cardinality(guard_ids) > 20 THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'guard_locations');
    END IF;
    IF cardinality(guard_ids) > 0 THEN
      IF req.business_id IS NULL THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'business_required');
      END IF;
      SELECT count(*)::integer INTO location_ok
      FROM public.locations location
      WHERE location.business_id = req.business_id
        AND location.id = ANY (guard_ids);
      IF location_ok <> cardinality(guard_ids) THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'guard_location_mismatch');
      END IF;
      selected_proposed_guard := cardinality(guard_ids);
    END IF;
  END IF;

  selected_overage_opt_in := coalesce((p_payload->>'overageOptIn')::boolean, false);
  IF selected_overage_opt_in THEN
    IF p_payload ? 'overageCapPence' AND jsonb_typeof(p_payload->'overageCapPence') <> 'null' THEN
      selected_overage_cap := (p_payload->>'overageCapPence')::integer;
      IF selected_overage_cap IS NULL OR selected_overage_cap <= 0 THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'overage_cap');
      END IF;
    END IF;
  ELSE
    selected_overage_cap := NULL;
  END IF;

  selected_notes := left(coalesce(p_payload->>'notes', ''), 1000);

  IF draft.onboarding_request_id IS NULL THEN
    INSERT INTO admin_private.telloya_offer_drafts (
      onboarding_request_id, enquiry_id, plan_tier, proposed_guard_quantity,
      guard_location_ids, overage_opt_in, overage_cap_minor, notes, record_version, actor_id
    ) VALUES (
      req.id, enquiry.id, selected_plan_tier, selected_proposed_guard,
      guard_ids, selected_overage_opt_in, selected_overage_cap, selected_notes, 1, actor
    )
    RETURNING * INTO draft;
  ELSE
    UPDATE admin_private.telloya_offer_drafts SET
      plan_tier = selected_plan_tier,
      proposed_guard_quantity = selected_proposed_guard,
      guard_location_ids = guard_ids,
      overage_opt_in = selected_overage_opt_in,
      overage_cap_minor = selected_overage_cap,
      notes = selected_notes,
      record_version = draft.record_version + 1,
      actor_id = actor,
      updated_at = now()
    WHERE onboarding_request_id = req.id
    RETURNING * INTO draft;
  END IF;

  result := jsonb_build_object(
    'status', 'success',
    'message', 'Draft offer estimate saved. This is not an official commercial offer.',
    'version', draft.record_version,
    'draft', jsonb_build_object(
      'planTier', draft.plan_tier,
      'proposedGuardQuantity', draft.proposed_guard_quantity,
      'guardLocationIds', to_jsonb(draft.guard_location_ids),
      'overageOptIn', draft.overage_opt_in,
      'overageCapPence', draft.overage_cap_minor,
      'notes', draft.notes,
      'version', draft.record_version
    )
  );
  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.telloya_offer_draft_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_draft_v1(text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.telloya_offer_draft_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telloya_offer_draft_command_v1(text, uuid, text, jsonb) TO service_role;

COMMIT;
