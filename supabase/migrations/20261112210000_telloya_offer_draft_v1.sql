BEGIN;
-- Telloya Admin offer-draft selections for the interactive calculator.
-- Source-only. Do not apply this file to DEV or Production without owner approval.
-- Do not edit or replay 20261112120000 or 20261112180000.
-- Stores Admin draft plan/Guard intent against one active Telloya onboarding request.
-- This is not a commercial offer, subscription, approved plan, customer quote,
-- email, Stripe object, or Retell action. Official offers still use
-- public.admin_commercial_command_v1('prepare_offer').
-- overage_opt_in means Admin proposes overage in the draft offer; it is not
-- customer consent or usage authorisation.
-- custom_amount_minor is an internal proposed Custom price only. It is never an
-- approved plan_versions row. Issuing a Custom offer still requires the existing
-- ProfileRelaunch commercial approval path to create a matching approved version.

CREATE TABLE admin_private.telloya_offer_drafts (
  onboarding_request_id uuid PRIMARY KEY REFERENCES public.onboarding_requests(id) ON DELETE CASCADE,
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  plan_tier text NULL CHECK (plan_tier IS NULL OR plan_tier IN ('basic', 'growth', 'pro', 'custom')),
  custom_amount_minor integer NULL CHECK (custom_amount_minor IS NULL OR (custom_amount_minor > 0 AND custom_amount_minor <= 10000000)),
  custom_included_minutes integer NULL CHECK (custom_included_minutes IS NULL OR (custom_included_minutes >= 1 AND custom_included_minutes <= 1000000)),
  custom_requirements text NOT NULL DEFAULT '' CHECK (char_length(custom_requirements) <= 1000),
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
  CONSTRAINT telloya_offer_drafts_guard_ids_bounded CHECK (cardinality(guard_location_ids) <= 20),
  CONSTRAINT telloya_offer_drafts_custom_amount_consistency CHECK (
    (
      plan_tier IS DISTINCT FROM 'custom'
      AND custom_amount_minor IS NULL
      AND custom_included_minutes IS NULL
      AND custom_requirements = ''
    )
    OR (
      plan_tier = 'custom'
      AND custom_amount_minor IS NOT NULL
      AND custom_amount_minor > 0
    )
  )
);

CREATE UNIQUE INDEX telloya_offer_drafts_enquiry_uidx
  ON admin_private.telloya_offer_drafts (enquiry_id);

CREATE TABLE admin_private.telloya_offer_draft_events (
  id bigserial PRIMARY KEY,
  onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests(id) ON DELETE CASCADE,
  enquiry_id uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  from_version integer NOT NULL CHECK (from_version >= 0),
  to_version integer NOT NULL CHECK (to_version > 0),
  before_state jsonb NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telloya_offer_draft_events_version_order CHECK (to_version = from_version + 1)
);

CREATE INDEX telloya_offer_draft_events_enquiry_idx
  ON admin_private.telloya_offer_draft_events (enquiry_id, created_at DESC);

ALTER TABLE admin_private.telloya_offer_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.telloya_offer_draft_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.telloya_offer_drafts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE admin_private.telloya_offer_draft_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.telloya_offer_draft_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

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
  closed_exists boolean := false;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_enquiry_id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;

  SELECT * INTO enquiry FROM public.enquiries WHERE id = p_enquiry_id;
  IF enquiry.id IS NULL OR enquiry.source IS DISTINCT FROM 'telloya' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;

  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id
    AND product_code = 'TELLOYA'
    AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC
  LIMIT 1;

  IF req.id IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.onboarding_requests
      WHERE enquiry_id = enquiry.id AND product_code = 'TELLOYA'
    ) INTO closed_exists;
    IF closed_exists THEN
      RETURN jsonb_build_object('status', 'ready', 'draft', NULL, 'locked', true, 'version', 0);
    END IF;
    RETURN jsonb_build_object('status', 'ready', 'draft', NULL, 'locked', false, 'version', 0);
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
      'customAmountPence', draft.custom_amount_minor,
      'customIncludedMinutes', draft.custom_included_minutes,
      'customRequirements', draft.custom_requirements,
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
  selected_custom_amount integer := NULL;
  selected_custom_minutes integer := NULL;
  selected_custom_requirements text := '';
  selected_proposed_guard integer;
  guard_ids uuid[] := '{}'::uuid[];
  selected_overage_opt_in boolean := false;
  selected_overage_cap integer := NULL;
  selected_notes text := '';
  location_ok integer;
  before_state jsonb := NULL;
  after_state jsonb;
  from_version integer := 0;
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
  IF enquiry.id IS NULL OR enquiry.source IS DISTINCT FROM 'telloya' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'not_telloya');
  END IF;

  SELECT * INTO req FROM public.onboarding_requests
  WHERE enquiry_id = enquiry.id
    AND product_code = 'TELLOYA'
    AND state NOT IN ('CLOSED', 'DECLINED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF req.id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.onboarding_requests
      WHERE enquiry_id = enquiry.id AND product_code = 'TELLOYA'
    ) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'onboarding_closed');
    END IF;
    RETURN jsonb_build_object('status', 'denied', 'reason', 'onboarding_missing');
  END IF;
  IF req.product_code IS DISTINCT FROM 'TELLOYA' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'wrong_product');
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

  IF selected_plan_tier = 'custom' THEN
    IF p_payload ? 'customAmountPence' AND jsonb_typeof(p_payload->'customAmountPence') <> 'null' THEN
      IF jsonb_typeof(p_payload->'customAmountPence') IS DISTINCT FROM 'number'
        OR (p_payload->>'customAmountPence') !~ '^[0-9]+$'
      THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'custom_amount');
      END IF;
      selected_custom_amount := (p_payload->>'customAmountPence')::integer;
      IF selected_custom_amount IS NULL OR selected_custom_amount <= 0 OR selected_custom_amount > 10000000 THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'custom_amount');
      END IF;
    ELSE
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'custom_amount');
    END IF;
    IF p_payload ? 'customIncludedMinutes' AND jsonb_typeof(p_payload->'customIncludedMinutes') <> 'null' THEN
      IF jsonb_typeof(p_payload->'customIncludedMinutes') IS DISTINCT FROM 'number'
        OR (p_payload->>'customIncludedMinutes') !~ '^[0-9]+$'
      THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'custom_minutes');
      END IF;
      selected_custom_minutes := (p_payload->>'customIncludedMinutes')::integer;
      IF selected_custom_minutes IS NULL OR selected_custom_minutes < 1 OR selected_custom_minutes > 1000000 THEN
        RETURN jsonb_build_object('status', 'invalid', 'reason', 'custom_minutes');
      END IF;
    ELSE
      selected_custom_minutes := NULL;
    END IF;
    selected_custom_requirements := left(coalesce(p_payload->>'customRequirements', ''), 1000);
  ELSE
    selected_custom_amount := NULL;
    selected_custom_minutes := NULL;
    selected_custom_requirements := '';
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

  IF draft.onboarding_request_id IS NOT NULL THEN
    from_version := draft.record_version;
    before_state := jsonb_build_object(
      'planTier', draft.plan_tier,
      'customAmountPence', draft.custom_amount_minor,
      'customIncludedMinutes', draft.custom_included_minutes,
      'customRequirements', draft.custom_requirements,
      'proposedGuardQuantity', draft.proposed_guard_quantity,
      'guardLocationIds', to_jsonb(draft.guard_location_ids),
      'overageOptIn', draft.overage_opt_in,
      'overageCapPence', draft.overage_cap_minor,
      'notes', draft.notes,
      'version', draft.record_version
    );
  END IF;

  IF draft.onboarding_request_id IS NULL THEN
    INSERT INTO admin_private.telloya_offer_drafts (
      onboarding_request_id, enquiry_id, plan_tier, custom_amount_minor, custom_included_minutes,
      custom_requirements, proposed_guard_quantity, guard_location_ids, overage_opt_in,
      overage_cap_minor, notes, record_version, actor_id
    ) VALUES (
      req.id, enquiry.id, selected_plan_tier, selected_custom_amount, selected_custom_minutes,
      selected_custom_requirements, selected_proposed_guard, guard_ids, selected_overage_opt_in,
      selected_overage_cap, selected_notes, 1, actor
    )
    RETURNING * INTO draft;
  ELSE
    UPDATE admin_private.telloya_offer_drafts SET
      plan_tier = selected_plan_tier,
      custom_amount_minor = selected_custom_amount,
      custom_included_minutes = selected_custom_minutes,
      custom_requirements = selected_custom_requirements,
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

  after_state := jsonb_build_object(
    'planTier', draft.plan_tier,
    'customAmountPence', draft.custom_amount_minor,
    'customIncludedMinutes', draft.custom_included_minutes,
    'customRequirements', draft.custom_requirements,
    'proposedGuardQuantity', draft.proposed_guard_quantity,
    'guardLocationIds', to_jsonb(draft.guard_location_ids),
    'overageOptIn', draft.overage_opt_in,
    'overageCapPence', draft.overage_cap_minor,
    'notes', draft.notes,
    'version', draft.record_version
  );

  INSERT INTO admin_private.telloya_offer_draft_events (
    onboarding_request_id, enquiry_id, actor_id, from_version, to_version, before_state, after_state
  ) VALUES (
    req.id, enquiry.id, actor, from_version, draft.record_version, before_state, after_state
  );

  result := jsonb_build_object(
    'status', 'success',
    'message', 'Draft offer estimate saved. This is not an official commercial offer and does not record customer consent.',
    'version', draft.record_version,
    'draft', after_state
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
