-- Phase 03A-02 customer commercial offer read and acceptance.
-- Additive repository source only. Not applied to DEV. Not applied to Production.
-- Do not replay this file. It does not rewrite an applied migration.
-- It does not seed a plan, an agreement, a price, a subscription, an acceptance,
-- an entitlement, a payment, or a provision. It does not send mail.
--
-- Recovery case agreements and paid-service acceptances stay unused. A Telloya
-- or Complete acceptance is not a Recovery case agreement.
-- terms_ref on a plan is not an agreement body. Acceptance requires an APPROVED
-- row in commercial_agreement_versions for that product and version_ref.
-- This file does not approve any agreement or plan.
--
-- onboarding_requests has no ACCEPTED state. A valid acceptance moves the
-- linked commercial subscription from OFFERED to ACCEPTED and leaves the
-- request state unchanged. Customer progress reads the subscription.

BEGIN;

CREATE FUNCTION admin_private.commercial_agreement_confirmations_ok_v1(p_confirmations jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_confirmations IS NOT NULL
    AND jsonb_typeof(p_confirmations) = 'array'
    AND (
      SELECT count(*) = count(DISTINCT item ->> 'key')
      FROM jsonb_array_elements(p_confirmations) AS item
    )
    AND (
      SELECT coalesce(bool_and(
        jsonb_typeof(item) = 'object'
        AND (SELECT count(*) FROM jsonb_object_keys(item)) = 2
        AND item ? 'key'
        AND item ? 'label'
        AND jsonb_typeof(item -> 'key') = 'string'
        AND jsonb_typeof(item -> 'label') = 'string'
        AND (item ->> 'key') ~ '^[a-z][a-z0-9_]{0,31}$'
        AND char_length(btrim(item ->> 'label')) BETWEEN 10 AND 160
      ), true)
      FROM jsonb_array_elements(p_confirmations) AS item
    );
$$;

CREATE FUNCTION admin_private.commercial_agreement_hash_v1(
  p_product text,
  p_version_ref text,
  p_title text,
  p_body text,
  p_cancellation text,
  p_confirmations jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(convert_to(
    p_product || E'\n' || p_version_ref || E'\n' || p_title || E'\n'
      || p_body || E'\n' || p_cancellation || E'\n' || p_confirmations::text,
    'UTF8'
  ), 'sha256'), 'hex');
$$;

CREATE TABLE public.commercial_agreement_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_code text NOT NULL REFERENCES public.product_catalogue (code) ON DELETE RESTRICT,
  version_ref text NOT NULL CHECK (char_length(btrim(version_ref)) BETWEEN 1 AND 200),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body_text text NOT NULL CHECK (char_length(btrim(body_text)) BETWEEN 20 AND 50000),
  cancellation_text text NOT NULL CHECK (char_length(btrim(cancellation_text)) BETWEEN 10 AND 5000),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  required_confirmations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'RETIRED')),
  approved_by uuid,
  approved_at timestamptz,
  retired_by uuid,
  retired_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_agreement_versions_product_ref_unique UNIQUE (product_code, version_ref),
  CONSTRAINT commercial_agreement_versions_confirmations_ok CHECK (
    admin_private.commercial_agreement_confirmations_ok_v1(required_confirmations)
  ),
  CONSTRAINT commercial_agreement_versions_status_actor CHECK (
    (status = 'DRAFT' AND approved_at IS NULL AND approved_by IS NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (status = 'APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (status = 'RETIRED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND retired_at IS NOT NULL AND retired_by IS NOT NULL)
  )
);

CREATE FUNCTION admin_private.protect_commercial_agreement_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial agreement versions are not deleted';
  END IF;
  IF admin_private.commercial_agreement_hash_v1(
    NEW.product_code, NEW.version_ref, NEW.title, NEW.body_text, NEW.cancellation_text, NEW.required_confirmations
  ) IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'commercial agreement hash does not match the approved text';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.product_code IS DISTINCT FROM OLD.product_code
    OR NEW.version_ref IS DISTINCT FROM OLD.version_ref
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.body_text IS DISTINCT FROM OLD.body_text
    OR NEW.cancellation_text IS DISTINCT FROM OLD.cancellation_text
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.required_confirmations IS DISTINCT FROM OLD.required_confirmations
    OR NEW.id IS DISTINCT FROM OLD.id
  ) THEN
    RAISE EXCEPTION 'commercial agreement text is immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('APPROVED', 'RETIRED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'APPROVED' AND NEW.status = 'RETIRED') THEN
      RAISE EXCEPTION 'commercial agreement status cannot move backwards';
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.now();
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER commercial_agreement_versions_protect
BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_agreement_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_commercial_agreement_v1();

-- Approved commercial conditions for one plan version. Marketing prices are not
-- inserted here. Approval of a row is a separate business decision. A Telloya
-- tier is Basic, Growth, Pro, or Custom. Guard is optional coverage on that
-- plan, not another AI tier. Additional usage is offered only when a rate is
-- recorded. No spending cap is stored on the plan.
CREATE FUNCTION admin_private.commercial_plan_conditions_hash_v1(
  p_tier text,
  p_minutes integer,
  p_rollover boolean,
  p_base integer,
  p_guard integer,
  p_overage integer
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(convert_to(
    coalesce(p_tier, '') || E'\n'
      || coalesce(p_minutes::text, '') || E'\n'
      || coalesce(p_rollover::text, '') || E'\n'
      || coalesce(p_base::text, '') || E'\n'
      || coalesce(p_guard::text, '') || E'\n'
      || coalesce(p_overage::text, ''),
    'UTF8'
  ), 'sha256'), 'hex');
$$;

CREATE TABLE public.commercial_plan_conditions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  plan_version_id uuid NOT NULL UNIQUE REFERENCES public.plan_versions (id) ON DELETE RESTRICT,
  tier_code text NOT NULL CHECK (tier_code IN ('BASIC', 'GROWTH', 'PRO', 'CUSTOM')),
  tier_label text NOT NULL CHECK (tier_label IN ('Basic', 'Growth', 'Pro', 'Custom')),
  included_minutes integer,
  minutes_rollover boolean NOT NULL,
  base_amount_minor integer NOT NULL CHECK (base_amount_minor > 0),
  guard_unit_amount_minor integer,
  overage_rate_minor integer,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'RETIRED')),
  approved_by uuid,
  approved_at timestamptz,
  retired_by uuid,
  retired_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_plan_conditions_tier_label CHECK (
    (tier_code = 'BASIC' AND tier_label = 'Basic')
    OR (tier_code = 'GROWTH' AND tier_label = 'Growth')
    OR (tier_code = 'PRO' AND tier_label = 'Pro')
    OR (tier_code = 'CUSTOM' AND tier_label = 'Custom')
  ),
  CONSTRAINT commercial_plan_conditions_minutes CHECK (
    (tier_code = 'CUSTOM' AND (included_minutes IS NULL OR included_minutes > 0))
    OR (tier_code <> 'CUSTOM' AND included_minutes IS NOT NULL AND included_minutes > 0)
  ),
  CONSTRAINT commercial_plan_conditions_guard_rate CHECK (
    guard_unit_amount_minor IS NULL OR guard_unit_amount_minor > 0
  ),
  CONSTRAINT commercial_plan_conditions_overage_rate CHECK (
    overage_rate_minor IS NULL OR overage_rate_minor > 0
  ),
  CONSTRAINT commercial_plan_conditions_status_actor CHECK (
    (status = 'DRAFT' AND approved_at IS NULL AND approved_by IS NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (status = 'APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (status = 'RETIRED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND retired_at IS NOT NULL AND retired_by IS NOT NULL)
  )
);

CREATE FUNCTION admin_private.protect_commercial_plan_conditions_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commercial plan conditions are not deleted';
  END IF;
  IF admin_private.commercial_plan_conditions_hash_v1(
    NEW.tier_code, NEW.included_minutes, NEW.minutes_rollover, NEW.base_amount_minor,
    NEW.guard_unit_amount_minor, NEW.overage_rate_minor
  ) IS DISTINCT FROM NEW.content_hash THEN
    RAISE EXCEPTION 'commercial plan conditions hash does not match';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id
    OR NEW.tier_code IS DISTINCT FROM OLD.tier_code
    OR NEW.tier_label IS DISTINCT FROM OLD.tier_label
    OR NEW.included_minutes IS DISTINCT FROM OLD.included_minutes
    OR NEW.minutes_rollover IS DISTINCT FROM OLD.minutes_rollover
    OR NEW.base_amount_minor IS DISTINCT FROM OLD.base_amount_minor
    OR NEW.guard_unit_amount_minor IS DISTINCT FROM OLD.guard_unit_amount_minor
    OR NEW.overage_rate_minor IS DISTINCT FROM OLD.overage_rate_minor
    OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
    OR NEW.id IS DISTINCT FROM OLD.id
  ) THEN
    RAISE EXCEPTION 'commercial plan conditions are immutable';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('APPROVED', 'RETIRED') AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'APPROVED' AND NEW.status = 'RETIRED') THEN
      RAISE EXCEPTION 'commercial plan conditions cannot move backwards';
    END IF;
  END IF;
  NEW.updated_at := pg_catalog.now();
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER commercial_plan_conditions_protect
BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_plan_conditions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_commercial_plan_conditions_v1();

CREATE TABLE public.commercial_offer_acceptances (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  subscription_id uuid NOT NULL UNIQUE REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  product_code text NOT NULL CHECK (product_code IN ('TELLOYA', 'COMPLETE')),
  plan_version_id uuid NOT NULL REFERENCES public.plan_versions (id) ON DELETE RESTRICT,
  agreement_version_id uuid NOT NULL REFERENCES public.commercial_agreement_versions (id) ON DELETE RESTRICT,
  agreement_version_ref text NOT NULL,
  agreement_content_hash text NOT NULL CHECK (agreement_content_hash ~ '^[a-f0-9]{64}$'),
  agreement_title text NOT NULL,
  agreement_body text NOT NULL,
  cancellation_text text NOT NULL,
  terms_snapshot jsonb NOT NULL CHECK (jsonb_typeof(terms_snapshot) = 'object'),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency = 'GBP'),
  tax_behaviour text NOT NULL CHECK (tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE')),
  tax_amount_minor integer,
  cadence text NOT NULL CHECK (cadence IN ('MONTH', 'YEAR', 'ONCE')),
  subscription_record_version integer NOT NULL CHECK (subscription_record_version >= 1),
  recurring_consent_at timestamptz,
  plan_tier text NOT NULL CHECK (plan_tier IN ('Basic', 'Growth', 'Pro', 'Custom')),
  included_minutes integer,
  minutes_rollover boolean NOT NULL,
  base_amount_minor integer NOT NULL CHECK (base_amount_minor > 0),
  guard_included boolean NOT NULL,
  guard_unit_amount_minor integer,
  guard_quantity integer NOT NULL CHECK (guard_quantity >= 0),
  overage_permitted boolean NOT NULL,
  overage_rate_minor integer,
  overage_opt_in boolean NOT NULL,
  overage_cap_minor integer,
  overage_consent_at timestamptz,
  conditions_id uuid NOT NULL REFERENCES public.commercial_plan_conditions (id) ON DELETE RESTRICT,
  conditions_record_version integer NOT NULL CHECK (conditions_record_version >= 1),
  confirmations jsonb NOT NULL CHECK (jsonb_typeof(confirmations) = 'object'),
  email_snapshot text NOT NULL,
  actor_customer_id uuid NOT NULL,
  auth_user_id uuid NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_offer_acceptances_tax_shape CHECK (
    (tax_behaviour = 'NOT_APPLICABLE' AND tax_amount_minor IS NULL)
    OR (tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE') AND tax_amount_minor IS NOT NULL AND tax_amount_minor >= 0)
  ),
  CONSTRAINT commercial_offer_acceptances_recurring_consent CHECK (
    (cadence = 'ONCE' AND recurring_consent_at IS NULL)
    OR (cadence IN ('MONTH', 'YEAR') AND recurring_consent_at IS NOT NULL)
  ),
  CONSTRAINT commercial_offer_acceptances_guard_shape CHECK (
    (guard_included = false AND guard_quantity = 0)
    OR (guard_included = true AND guard_quantity > 0 AND guard_unit_amount_minor IS NOT NULL AND guard_unit_amount_minor > 0)
  ),
  CONSTRAINT commercial_offer_acceptances_overage_decision CHECK (
    (
      overage_opt_in = false
      AND overage_cap_minor IS NULL
      AND overage_consent_at IS NULL
    )
    OR (
      overage_opt_in = true
      AND overage_permitted = true
      AND overage_rate_minor IS NOT NULL
      AND overage_rate_minor > 0
      AND overage_cap_minor IS NOT NULL
      AND overage_cap_minor > 0
      AND overage_consent_at IS NOT NULL
    )
  ),
  CONSTRAINT commercial_offer_acceptances_price_composition CHECK (
    base_amount_minor + CASE
      WHEN guard_included THEN guard_unit_amount_minor * guard_quantity
      ELSE 0
    END = amount_minor
  )
);

CREATE FUNCTION admin_private.protect_commercial_offer_acceptance_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'commercial offer acceptance is immutable';
END;
$$;

CREATE TRIGGER commercial_offer_acceptances_immutable
BEFORE UPDATE OR DELETE ON public.commercial_offer_acceptances
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_commercial_offer_acceptance_v1();

CREATE TABLE admin_private.customer_commercial_command_receipts (
  request_id uuid PRIMARY KEY,
  customer_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (char_length(fingerprint) BETWEEN 1 AND 8000),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.commercial_agreement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_plan_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_offer_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.customer_commercial_command_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_agreement_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commercial_plan_conditions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commercial_offer_acceptances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE admin_private.customer_commercial_command_receipts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION admin_private.commercial_offer_services_v1(p_subscription uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(named.service ORDER BY named.sort_order), '[]'::jsonb)
  FROM (
    SELECT
      CASE item.component_code WHEN 'TELLOYA' THEN 'Telloya' ELSE 'Relaunch Guard' END AS service,
      CASE item.component_code WHEN 'TELLOYA' THEN 0 ELSE 1 END AS sort_order
    FROM public.commercial_subscription_items AS item
    WHERE item.subscription_id = p_subscription
  ) AS named;
$$;

CREATE FUNCTION admin_private.commercial_offer_locations_v1(p_request uuid, p_business uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(picked.location_name ORDER BY picked.location_name, picked.id), '[]'::jsonb)
  FROM (
    SELECT location.id, location.location_name
    FROM admin_private.onboarding_request_locations AS selected
    JOIN public.locations AS location
      ON location.id = selected.location_id
     AND location.business_id = p_business
    WHERE selected.onboarding_request_id = p_request
      AND location.location_name IS NOT NULL
      AND btrim(location.location_name) <> ''
  ) AS picked;
$$;

CREATE FUNCTION admin_private.commercial_offer_classify_v1(p_customer uuid, p_subscription uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sub public.commercial_subscriptions;
  plan public.plan_versions;
  agreement public.commercial_agreement_versions;
  conditions public.commercial_plan_conditions;
  req public.onboarding_requests;
  membership text;
  business_name text;
  locations jsonb;
  services jsonb;
  kind text;
  total_minor integer;
  guard_quantity integer;
  conditions_view jsonb;
BEGIN
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_subscription;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM p_customer THEN
    RETURN jsonb_build_object('kind', 'unavailable');
  END IF;
  SELECT status INTO membership
  FROM public.business_memberships
  WHERE customer_id = p_customer AND business_id = sub.business_id;
  IF membership IS DISTINCT FROM 'verified' THEN
    RETURN jsonb_build_object('kind', 'unavailable', 'reason', 'authority');
  END IF;
  SELECT * INTO req
  FROM public.onboarding_requests
  WHERE commercial_subscription_id = sub.id
    AND customer_id = p_customer
    AND business_id = sub.business_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;
  IF req.id IS NULL OR req.product_code NOT IN ('TELLOYA', 'COMPLETE') THEN
    RETURN jsonb_build_object('kind', 'unavailable');
  END IF;
  SELECT display_name INTO business_name FROM public.businesses WHERE id = sub.business_id;
  locations := admin_private.commercial_offer_locations_v1(req.id, sub.business_id);
  services := admin_private.commercial_offer_services_v1(sub.id);
  SELECT * INTO plan FROM public.plan_versions WHERE id = sub.plan_version_id;

  IF sub.state = 'CANCELED' OR sub.state = 'ENDED' OR req.state IN ('DECLINED', 'CLOSED') THEN
    kind := 'withdrawn';
  ELSIF sub.state = 'ACCEPTED' THEN
    kind := 'accepted';
  ELSIF sub.state IS DISTINCT FROM 'OFFERED' THEN
    kind := 'unavailable';
  ELSIF plan.id IS NULL THEN
    kind := 'unavailable';
  ELSIF plan.status = 'RETIRED' THEN
    kind := 'superseded';
  ELSIF plan.effective_to IS NOT NULL AND plan.effective_to <= pg_catalog.now() THEN
    kind := 'expired';
  ELSIF plan.status IS DISTINCT FROM 'APPROVED'
    OR plan.product_code IS DISTINCT FROM req.product_code
    OR plan.effective_from > pg_catalog.now()
    OR plan.amount_minor IS DISTINCT FROM sub.amount_minor
    OR plan.tax_behaviour IS DISTINCT FROM sub.tax_behaviour
    OR plan.billing_cadence IS DISTINCT FROM sub.cadence_snapshot
    OR plan.terms_ref IS DISTINCT FROM sub.terms_ref
    OR plan.currency IS DISTINCT FROM sub.currency
    OR sub.grant_kind IS DISTINCT FROM 'BILLABLE'
  THEN
    kind := 'changed';
  ELSE
    SELECT * INTO agreement
    FROM public.commercial_agreement_versions
    WHERE product_code = plan.product_code
      AND version_ref = plan.terms_ref
      AND status = 'APPROVED';
    IF agreement.id IS NULL THEN
      kind := 'terms_pending';
    ELSE
      SELECT * INTO conditions
      FROM public.commercial_plan_conditions
      WHERE plan_version_id = plan.id
        AND status = 'APPROVED';
      SELECT coalesce(sum(item.quantity), 0) INTO guard_quantity
      FROM public.commercial_subscription_items AS item
      WHERE item.subscription_id = sub.id
        AND item.component_code = 'GUARD';
      IF conditions.id IS NULL THEN
        kind := 'conditions_pending';
      ELSIF guard_quantity > 0 AND conditions.guard_unit_amount_minor IS NULL THEN
        kind := 'changed';
      ELSIF conditions.base_amount_minor
        + coalesce(conditions.guard_unit_amount_minor, 0) * guard_quantity
        IS DISTINCT FROM sub.amount_minor THEN
        kind := 'changed';
      ELSE
        kind := 'eligible';
        conditions_view := jsonb_build_object(
          'tier', conditions.tier_label,
          'includedMinutes', to_jsonb(conditions.included_minutes),
          'minutesRollover', conditions.minutes_rollover,
          'baseAmountMinor', conditions.base_amount_minor,
          'guardIncluded', guard_quantity > 0,
          'guardUnitMinor', to_jsonb(conditions.guard_unit_amount_minor),
          'guardQuantity', guard_quantity,
          'overagePermitted', conditions.overage_rate_minor IS NOT NULL,
          'overageRateMinor', to_jsonb(conditions.overage_rate_minor)
        );
      END IF;
    END IF;
  END IF;

  IF kind = 'accepted' THEN
    RETURN (
      SELECT jsonb_build_object(
        'kind', 'accepted',
        'offerRef', sub.public_ref,
        'offerVersion', acceptance.subscription_record_version,
        'product', CASE acceptance.product_code WHEN 'TELLOYA' THEN 'Telloya' ELSE 'Complete' END,
        'productCode', acceptance.product_code,
        'businessName', acceptance.terms_snapshot ->> 'businessName',
        'locations', coalesce(acceptance.terms_snapshot -> 'locations', '[]'::jsonb),
        'services', coalesce(acceptance.terms_snapshot -> 'services', '[]'::jsonb),
        'priceMinor', acceptance.amount_minor,
        'currency', acceptance.currency,
        'taxBehaviour', acceptance.tax_behaviour,
        'taxMinor', acceptance.tax_amount_minor,
        'totalMinor', CASE
          WHEN acceptance.tax_behaviour = 'EXCLUSIVE' THEN acceptance.amount_minor + acceptance.tax_amount_minor
          ELSE acceptance.amount_minor
        END,
        'cadence', acceptance.cadence,
        'recurring', acceptance.cadence <> 'ONCE',
        'agreement', jsonb_build_object(
          'title', acceptance.agreement_title,
          'body', acceptance.agreement_body,
          'cancellation', acceptance.cancellation_text,
          'versionRef', acceptance.agreement_version_ref,
          'confirmations', coalesce(acceptance.terms_snapshot -> 'confirmations', '[]'::jsonb)
        ),
        'conditions', jsonb_build_object(
          'tier', acceptance.plan_tier,
          'includedMinutes', to_jsonb(acceptance.included_minutes),
          'minutesRollover', acceptance.minutes_rollover,
          'baseAmountMinor', acceptance.base_amount_minor,
          'guardIncluded', acceptance.guard_included,
          'guardUnitMinor', to_jsonb(acceptance.guard_unit_amount_minor),
          'guardQuantity', acceptance.guard_quantity,
          'overagePermitted', acceptance.overage_permitted,
          'overageRateMinor', to_jsonb(acceptance.overage_rate_minor),
          'overageOptIn', acceptance.overage_opt_in,
          'overageCapMinor', to_jsonb(acceptance.overage_cap_minor)
        ),
        'agreementHash', acceptance.agreement_content_hash,
        'acceptedAt', acceptance.accepted_at,
        'subscriptionId', sub.id
      )
      FROM public.commercial_offer_acceptances AS acceptance
      WHERE acceptance.subscription_id = sub.id
        AND acceptance.customer_id = p_customer
    );
  END IF;

  total_minor := CASE
    WHEN sub.tax_behaviour = 'EXCLUSIVE' THEN sub.amount_minor + coalesce(sub.tax_amount_minor, 0)
    ELSE sub.amount_minor
  END;

  RETURN jsonb_build_object(
    'kind', kind,
    'offerRef', sub.public_ref,
    'offerVersion', sub.record_version,
    'product', CASE req.product_code WHEN 'TELLOYA' THEN 'Telloya' ELSE 'Complete' END,
    'productCode', req.product_code,
    'businessName', business_name,
    'locations', locations,
    'services', services,
    'priceMinor', CASE WHEN kind = 'eligible' THEN sub.amount_minor ELSE NULL END,
    'currency', CASE WHEN kind = 'eligible' THEN sub.currency ELSE NULL END,
    'taxBehaviour', CASE WHEN kind = 'eligible' THEN sub.tax_behaviour ELSE NULL END,
    'taxMinor', CASE WHEN kind = 'eligible' THEN to_jsonb(sub.tax_amount_minor) ELSE 'null'::jsonb END,
    'totalMinor', CASE WHEN kind = 'eligible' THEN total_minor ELSE NULL END,
    'cadence', CASE WHEN kind = 'eligible' THEN sub.cadence_snapshot ELSE NULL END,
    'recurring', CASE WHEN kind = 'eligible' THEN sub.cadence_snapshot <> 'ONCE' ELSE NULL END,
    'agreement', CASE WHEN kind = 'eligible' THEN jsonb_build_object(
      'title', agreement.title,
      'body', agreement.body_text,
      'cancellation', agreement.cancellation_text,
      'versionRef', agreement.version_ref,
      'confirmations', agreement.required_confirmations
    ) ELSE NULL END,
    'conditions', CASE WHEN kind = 'eligible' THEN conditions_view ELSE NULL END,
    'conditionsId', CASE WHEN kind = 'eligible' THEN conditions.id ELSE NULL END,
    'conditionsVersion', CASE WHEN kind = 'eligible' THEN conditions.record_version ELSE NULL END,
    'agreementHash', CASE WHEN kind = 'eligible' THEN agreement.content_hash ELSE NULL END,
    'agreementId', CASE WHEN kind = 'eligible' THEN agreement.id ELSE NULL END,
    'planVersionId', sub.plan_version_id,
    'subscriptionId', sub.id
  );
END;
$$;

CREATE FUNCTION admin_private.commercial_offer_customer_view_v1(p_classified jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  kind text;
  agreement jsonb;
BEGIN
  IF p_classified IS NULL OR p_classified ->> 'kind' IS NULL OR p_classified ->> 'kind' = 'unavailable' THEN
    IF p_classified ->> 'reason' = 'authority' THEN
      RETURN jsonb_build_object(
        'status', 'unavailable',
        'reason', 'authority',
        'nextStep', 'You are not authorised to review this offer.'
      );
    END IF;
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  kind := p_classified ->> 'kind';
  IF kind = 'eligible' THEN
    agreement := p_classified -> 'agreement';
    agreement := agreement - 'contentHash';
    RETURN jsonb_build_object(
      'status', 'ready',
      'offerRef', p_classified ->> 'offerRef',
      'offerVersion', p_classified -> 'offerVersion',
      'product', p_classified ->> 'product',
      'businessName', p_classified ->> 'businessName',
      'locations', p_classified -> 'locations',
      'services', p_classified -> 'services',
      'priceMinor', p_classified -> 'priceMinor',
      'currency', p_classified ->> 'currency',
      'taxBehaviour', p_classified ->> 'taxBehaviour',
      'taxMinor', p_classified -> 'taxMinor',
      'totalMinor', p_classified -> 'totalMinor',
      'cadence', p_classified ->> 'cadence',
      'recurring', p_classified -> 'recurring',
      'agreement', agreement,
      'conditions', p_classified -> 'conditions',
      'nextStep', 'Accept the agreement to record this offer. Payment and service setup follow separately.'
    );
  END IF;
  IF kind = 'accepted' THEN
    agreement := p_classified -> 'agreement';
    RETURN jsonb_build_object(
      'status', 'accepted',
      'offerRef', p_classified ->> 'offerRef',
      'product', p_classified ->> 'product',
      'businessName', p_classified ->> 'businessName',
      'locations', p_classified -> 'locations',
      'services', p_classified -> 'services',
      'priceMinor', p_classified -> 'priceMinor',
      'currency', p_classified ->> 'currency',
      'taxBehaviour', p_classified ->> 'taxBehaviour',
      'taxMinor', p_classified -> 'taxMinor',
      'totalMinor', p_classified -> 'totalMinor',
      'cadence', p_classified ->> 'cadence',
      'recurring', p_classified -> 'recurring',
      'agreement', agreement,
      'conditions', p_classified -> 'conditions',
      'acceptedAt', p_classified ->> 'acceptedAt',
      'nextStep', 'This offer is accepted. Payment and service setup follow separately. Nothing has been paid and the service has not started.'
    );
  END IF;
  IF kind = 'terms_pending' THEN
    RETURN jsonb_build_object(
      'status', 'terms_pending',
      'offerRef', p_classified ->> 'offerRef',
      'product', p_classified ->> 'product',
      'businessName', p_classified ->> 'businessName',
      'locations', p_classified -> 'locations',
      'nextStep', 'The agreement for this offer is not available yet. It cannot be accepted until that agreement is approved.'
    );
  END IF;
  IF kind = 'conditions_pending' THEN
    RETURN jsonb_build_object(
      'status', 'conditions_pending',
      'offerRef', p_classified ->> 'offerRef',
      'product', p_classified ->> 'product',
      'businessName', p_classified ->> 'businessName',
      'locations', p_classified -> 'locations',
      'nextStep', 'The commercial terms for this offer are not available yet. It cannot be accepted until those terms are approved.'
    );
  END IF;
  IF kind IN ('withdrawn', 'expired', 'changed', 'superseded') THEN
    RETURN jsonb_build_object(
      'status', kind,
      'offerRef', p_classified ->> 'offerRef',
      'product', p_classified ->> 'product',
      'businessName', p_classified ->> 'businessName',
      'nextStep', CASE kind
        WHEN 'withdrawn' THEN 'This offer has been withdrawn. It cannot be accepted.'
        WHEN 'expired' THEN 'This offer has expired. It cannot be accepted.'
        WHEN 'superseded' THEN 'This offer has been replaced. It cannot be accepted.'
        ELSE 'This offer has changed. Refresh the page before doing anything else. It has not been accepted.'
      END
    );
  END IF;
  RETURN jsonb_build_object('status', 'unavailable');
END;
$$;

CREATE FUNCTION public.customer_portal_commercial_offer_v1(p_token_hash text, p_selector text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess jsonb;
  customer uuid;
  sub_id uuid;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL OR (sess ->> 'customerId') IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  IF p_selector IS NULL OR p_selector !~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT id INTO sub_id FROM public.commercial_subscriptions WHERE public_ref = p_selector;
  IF sub_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN admin_private.commercial_offer_customer_view_v1(
    admin_private.commercial_offer_classify_v1(customer, sub_id)
  );
END;
$$;

CREATE FUNCTION public.customer_portal_commercial_offer_command_v1(
  p_token_hash text,
  p_request uuid,
  p_selector text,
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess jsonb;
  customer uuid;
  actor uuid;
  email text;
  sub public.commercial_subscriptions;
  classified jsonb;
  fingerprint text;
  prior admin_private.customer_commercial_command_receipts;
  expected_confirmations jsonb;
  submitted_confirmations jsonb;
  result jsonb;
  acceptance_id uuid;
  accepted_stamp timestamptz;
  locked_plan public.plan_versions;
  locked_conditions public.commercial_plan_conditions;
  submitted_conditions jsonb;
  overage_opt_in boolean;
  overage_cap integer;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL OR (sess ->> 'customerId') IS NULL OR (sess ->> 'authUserId') IS NULL OR (sess ->> 'email') IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  actor := (sess ->> 'authUserId')::uuid;
  email := sess ->> 'email';
  IF p_request IS NULL OR p_selector IS NULL OR p_selector !~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF (
    SELECT count(*) FROM jsonb_object_keys(p_data)
  ) <> 10
    OR NOT (
      p_data ? 'offerVersion' AND p_data ? 'priceMinor' AND p_data ? 'taxBehaviour'
      AND p_data ? 'taxMinor' AND p_data ? 'cadence' AND p_data ? 'agreementRef'
      AND p_data ? 'agreementAccepted' AND p_data ? 'recurringConsent' AND p_data ? 'confirmations'
      AND p_data ? 'conditions'
    )
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fingerprint := p_selector || '|' || p_data::text;
  SELECT * INTO prior
  FROM admin_private.customer_commercial_command_receipts
  WHERE request_id = p_request;
  IF prior.request_id IS NOT NULL THEN
    IF prior.customer_id IS DISTINCT FROM customer OR prior.fingerprint IS DISTINCT FROM fingerprint THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN prior.response;
  END IF;

  SELECT * INTO sub
  FROM public.commercial_subscriptions
  WHERE public_ref = p_selector
  FOR UPDATE;
  IF sub.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('commercial-offer:' || sub.id::text, 1));
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = sub.id FOR UPDATE;
  -- Lock order: this subscription, then its plan_versions row, then the approved
  -- commercial_plan_conditions row, then the approved agreement. A retirement or
  -- amendment locks plan_versions and does not lock a subscription before that
  -- plan row, so the two transactions cannot deadlock. A retirement that commits
  -- before this plan lock is visible to the recheck below.
  SELECT * INTO locked_plan
  FROM public.plan_versions
  WHERE id = sub.plan_version_id
  FOR UPDATE;
  classified := admin_private.commercial_offer_classify_v1(customer, sub.id);
  IF classified IS NULL OR classified ->> 'kind' IS NULL OR classified ->> 'kind' = 'unavailable' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF classified ->> 'kind' IS DISTINCT FROM 'eligible' AND classified ->> 'kind' IS DISTINCT FROM 'accepted' THEN
    result := jsonb_build_object('status', classified ->> 'kind', 'offerRef', classified ->> 'offerRef');
    INSERT INTO admin_private.customer_commercial_command_receipts(request_id, customer_id, fingerprint, response)
    VALUES (p_request, customer, fingerprint, result);
    RETURN result;
  END IF;

  IF jsonb_typeof(p_data -> 'offerVersion') <> 'number'
    OR jsonb_typeof(p_data -> 'priceMinor') <> 'number'
    OR jsonb_typeof(p_data -> 'taxBehaviour') <> 'string'
    OR jsonb_typeof(p_data -> 'cadence') <> 'string'
    OR jsonb_typeof(p_data -> 'agreementRef') <> 'string'
    OR jsonb_typeof(p_data -> 'agreementAccepted') <> 'boolean'
    OR jsonb_typeof(p_data -> 'recurringConsent') <> 'boolean'
    OR jsonb_typeof(p_data -> 'confirmations') <> 'object'
    OR (p_data ->> 'agreementAccepted')::boolean IS DISTINCT FROM true
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF classified ->> 'kind' = 'accepted' THEN
    SELECT coalesce(jsonb_object_agg(item ->> 'key', true), '{}'::jsonb)
    INTO expected_confirmations
    FROM jsonb_array_elements(coalesce(classified -> 'agreement' -> 'confirmations', '[]'::jsonb)) AS item;
    IF (p_data ->> 'offerVersion')::integer IS DISTINCT FROM (classified ->> 'offerVersion')::integer
      OR (p_data ->> 'priceMinor')::integer IS DISTINCT FROM (classified ->> 'priceMinor')::integer
      OR p_data ->> 'taxBehaviour' IS DISTINCT FROM classified ->> 'taxBehaviour'
      OR (p_data ->> 'taxMinor') IS DISTINCT FROM (classified ->> 'taxMinor')
      OR p_data ->> 'cadence' IS DISTINCT FROM classified ->> 'cadence'
      OR p_data ->> 'agreementRef' IS DISTINCT FROM classified -> 'agreement' ->> 'versionRef'
      OR (p_data -> 'confirmations') IS DISTINCT FROM expected_confirmations
      OR (p_data -> 'conditions') IS DISTINCT FROM (classified -> 'conditions')
      OR ((p_data ->> 'recurringConsent')::boolean IS DISTINCT FROM true AND (classified ->> 'recurring')::boolean)
      OR ((p_data ->> 'recurringConsent')::boolean AND NOT (classified ->> 'recurring')::boolean)
    THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    result := jsonb_build_object(
      'status', 'success',
      'existing', true,
      'offerRef', classified ->> 'offerRef',
      'acceptedAt', classified ->> 'acceptedAt'
    );
    INSERT INTO admin_private.customer_commercial_command_receipts(request_id, customer_id, fingerprint, response)
    VALUES (p_request, customer, fingerprint, result);
    RETURN result;
  END IF;

  IF (p_data ->> 'offerVersion')::integer IS DISTINCT FROM sub.record_version
    OR (p_data ->> 'priceMinor')::integer IS DISTINCT FROM sub.amount_minor
    OR p_data ->> 'taxBehaviour' IS DISTINCT FROM sub.tax_behaviour
    OR p_data ->> 'cadence' IS DISTINCT FROM sub.cadence_snapshot
    OR p_data ->> 'agreementRef' IS DISTINCT FROM classified -> 'agreement' ->> 'versionRef'
    OR (
      sub.tax_amount_minor IS NULL AND jsonb_typeof(p_data -> 'taxMinor') <> 'null'
    )
    OR (
      sub.tax_amount_minor IS NOT NULL
      AND (p_data ->> 'taxMinor')::integer IS DISTINCT FROM sub.tax_amount_minor
    )
  THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF locked_plan.id IS NULL
    OR locked_plan.status IS DISTINCT FROM 'APPROVED'
    OR locked_plan.product_code IS DISTINCT FROM classified ->> 'productCode'
    OR locked_plan.effective_from > pg_catalog.now()
    OR (locked_plan.effective_to IS NOT NULL AND locked_plan.effective_to <= pg_catalog.now())
    OR locked_plan.amount_minor IS DISTINCT FROM sub.amount_minor
    OR locked_plan.tax_behaviour IS DISTINCT FROM sub.tax_behaviour
    OR locked_plan.billing_cadence IS DISTINCT FROM sub.cadence_snapshot
    OR locked_plan.terms_ref IS DISTINCT FROM sub.terms_ref
    OR locked_plan.currency IS DISTINCT FROM sub.currency
  THEN
    result := jsonb_build_object(
      'status', CASE
        WHEN locked_plan.status = 'RETIRED' THEN 'superseded'
        WHEN locked_plan.effective_to IS NOT NULL AND locked_plan.effective_to <= pg_catalog.now() THEN 'expired'
        ELSE 'changed'
      END,
      'offerRef', sub.public_ref
    );
    INSERT INTO admin_private.customer_commercial_command_receipts(request_id, customer_id, fingerprint, response)
    VALUES (p_request, customer, fingerprint, result);
    RETURN result;
  END IF;

  SELECT * INTO locked_conditions
  FROM public.commercial_plan_conditions
  WHERE id = (classified ->> 'conditionsId')::uuid
    AND plan_version_id = locked_plan.id
    AND status = 'APPROVED'
  FOR UPDATE;
  IF NOT FOUND THEN
    result := jsonb_build_object('status', 'conditions_pending', 'offerRef', sub.public_ref);
    INSERT INTO admin_private.customer_commercial_command_receipts(request_id, customer_id, fingerprint, response)
    VALUES (p_request, customer, fingerprint, result);
    RETURN result;
  END IF;

  submitted_conditions := p_data -> 'conditions';
  IF jsonb_typeof(submitted_conditions) <> 'object'
    OR (
      SELECT count(*) FROM jsonb_object_keys(submitted_conditions)
    ) <> 11
    OR NOT (
      submitted_conditions ? 'tier' AND submitted_conditions ? 'includedMinutes'
      AND submitted_conditions ? 'minutesRollover' AND submitted_conditions ? 'baseAmountMinor'
      AND submitted_conditions ? 'guardIncluded' AND submitted_conditions ? 'guardUnitMinor'
      AND submitted_conditions ? 'guardQuantity' AND submitted_conditions ? 'overagePermitted'
      AND submitted_conditions ? 'overageRateMinor' AND submitted_conditions ? 'overageOptIn'
      AND submitted_conditions ? 'overageCapMinor'
    )
    OR jsonb_typeof(submitted_conditions -> 'overageOptIn') <> 'boolean'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF (submitted_conditions - 'overageOptIn' - 'overageCapMinor') IS DISTINCT FROM (classified -> 'conditions') THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  overage_opt_in := (submitted_conditions ->> 'overageOptIn')::boolean;
  IF overage_opt_in THEN
    IF (classified -> 'conditions' ->> 'overagePermitted')::boolean IS DISTINCT FROM true
      OR jsonb_typeof(submitted_conditions -> 'overageCapMinor') <> 'number'
      OR (submitted_conditions ->> 'overageCapMinor') !~ '^[0-9]+$'
      OR (submitted_conditions ->> 'overageCapMinor')::integer < 1
      OR (submitted_conditions ->> 'overageCapMinor')::integer > 100000000
    THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    overage_cap := (submitted_conditions ->> 'overageCapMinor')::integer;
  ELSE
    IF jsonb_typeof(submitted_conditions -> 'overageCapMinor') <> 'null' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    overage_cap := NULL;
  END IF;

  IF sub.cadence_snapshot IN ('MONTH', 'YEAR') AND (p_data ->> 'recurringConsent')::boolean IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF sub.cadence_snapshot = 'ONCE' AND (p_data ->> 'recurringConsent')::boolean THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT coalesce(jsonb_object_agg(item ->> 'key', true), '{}'::jsonb)
  INTO expected_confirmations
  FROM jsonb_array_elements(coalesce(classified -> 'agreement' -> 'confirmations', '[]'::jsonb)) AS item;
  submitted_confirmations := p_data -> 'confirmations';
  IF submitted_confirmations IS DISTINCT FROM expected_confirmations THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each(submitted_confirmations) AS entered
    WHERE jsonb_typeof(entered.value) <> 'boolean' OR (entered.value)::text <> 'true'
  ) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  PERFORM 1
  FROM public.commercial_agreement_versions
  WHERE id = (classified ->> 'agreementId')::uuid
    AND status = 'APPROVED'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'terms_pending', 'offerRef', sub.public_ref);
  END IF;

  UPDATE public.commercial_subscriptions
  SET state = 'ACCEPTED'
  WHERE id = sub.id
    AND state = 'OFFERED'
    AND record_version = sub.record_version
    AND customer_id = customer;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  INSERT INTO public.commercial_offer_acceptances(
    request_id, subscription_id, customer_id, business_id, product_code, plan_version_id,
    agreement_version_id, agreement_version_ref, agreement_content_hash, agreement_title,
    agreement_body, cancellation_text, terms_snapshot, amount_minor, currency, tax_behaviour,
    tax_amount_minor, cadence, subscription_record_version, recurring_consent_at,
    plan_tier, included_minutes, minutes_rollover, base_amount_minor,
    guard_included, guard_unit_amount_minor, guard_quantity,
    overage_permitted, overage_rate_minor, overage_opt_in, overage_cap_minor, overage_consent_at,
    conditions_id, conditions_record_version, confirmations,
    email_snapshot, actor_customer_id, auth_user_id
  ) VALUES (
    p_request, sub.id, customer, sub.business_id, classified ->> 'productCode', (classified ->> 'planVersionId')::uuid,
    (classified ->> 'agreementId')::uuid, classified -> 'agreement' ->> 'versionRef', classified ->> 'agreementHash',
    classified -> 'agreement' ->> 'title', classified -> 'agreement' ->> 'body', classified -> 'agreement' ->> 'cancellation',
    jsonb_build_object(
      'offerRef', sub.public_ref,
      'offerVersion', sub.record_version,
      'product', classified ->> 'product',
      'businessName', classified ->> 'businessName',
      'locations', classified -> 'locations',
      'services', classified -> 'services',
      'priceMinor', sub.amount_minor,
      'currency', sub.currency,
      'taxBehaviour', sub.tax_behaviour,
      'taxMinor', to_jsonb(sub.tax_amount_minor),
      'totalMinor', classified -> 'totalMinor',
      'cadence', sub.cadence_snapshot,
      'agreementRef', classified -> 'agreement' ->> 'versionRef',
      'agreementHash', classified ->> 'agreementHash',
      'confirmations', classified -> 'agreement' -> 'confirmations',
      'conditions', classified -> 'conditions' || jsonb_build_object(
        'overageOptIn', overage_opt_in,
        'overageCapMinor', to_jsonb(overage_cap)
      )
    ),
    sub.amount_minor, sub.currency, sub.tax_behaviour, sub.tax_amount_minor, sub.cadence_snapshot,
    sub.record_version,
    CASE WHEN sub.cadence_snapshot = 'ONCE' THEN NULL ELSE pg_catalog.now() END,
    locked_conditions.tier_label,
    locked_conditions.included_minutes,
    locked_conditions.minutes_rollover,
    locked_conditions.base_amount_minor,
    coalesce((classified -> 'conditions' ->> 'guardIncluded')::boolean, false),
    locked_conditions.guard_unit_amount_minor,
    coalesce((classified -> 'conditions' ->> 'guardQuantity')::integer, 0),
    locked_conditions.overage_rate_minor IS NOT NULL,
    locked_conditions.overage_rate_minor,
    overage_opt_in,
    overage_cap,
    CASE WHEN overage_opt_in THEN pg_catalog.now() ELSE NULL END,
    locked_conditions.id,
    locked_conditions.record_version,
    submitted_confirmations, email, customer, actor
  )
  RETURNING id, accepted_at INTO acceptance_id, accepted_stamp;

  INSERT INTO public.commercial_subscription_events(
    subscription_id, actor_id, request_id, from_state, to_state, reason
  ) VALUES (
    sub.id, actor, p_request, 'OFFERED', 'ACCEPTED', 'Customer accepted the commercial offer.'
  );

  result := jsonb_build_object(
    'status', 'success',
    'existing', false,
    'offerRef', sub.public_ref,
    'acceptedAt', accepted_stamp
  );
  INSERT INTO admin_private.customer_commercial_command_receipts(request_id, customer_id, fingerprint, response)
  VALUES (p_request, customer, fingerprint, result);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_agreement_confirmations_ok_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_agreement_hash_v1(text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_plan_conditions_hash_v1(text, integer, boolean, integer, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_commercial_plan_conditions_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_commercial_agreement_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_commercial_offer_acceptance_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_offer_services_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_offer_locations_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_offer_classify_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_offer_customer_view_v1(jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_commercial_offer_v1(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_commercial_offer_v1(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.customer_portal_commercial_offer_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_commercial_offer_command_v1(text, uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.customer_portal_commercial_offer_v1(text, text) IS
  'Session-scoped commercial offer read. The selector is a commercial public reference. It does not accept an offer, collect money, grant an entitlement, or activate a service.';

COMMENT ON FUNCTION public.customer_portal_commercial_offer_command_v1(text, uuid, text, jsonb) IS
  'Session-scoped acceptance of one OFFERED commercial subscription. It records immutable evidence and does not collect money, grant an entitlement, or activate a service.';

CREATE OR REPLACE FUNCTION admin_private.customer_portal_onboarding_status_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess jsonb;
  customer uuid;
  req record;
  membership text;
  email_verified boolean;
  location_count integer;
  mark_ready boolean;
  subscription_state text;
  payment_recorded boolean;
  provision_state text;
  provision_ready boolean;
  projected jsonb;
  business_name text;
  location_names jsonb;
  offer_ref text;
  offer_state text;
  items jsonb := '[]'::jsonb;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  IF customer IS NULL THEN
    RETURN NULL;
  END IF;

  FOR req IN
    SELECT id, product_code, state, business_id, commercial_subscription_id, created_at, updated_at
    FROM public.onboarding_requests
    WHERE customer_id = customer
      AND product_code IN ('TELLOYA', 'COMPLETE')
    ORDER BY created_at ASC, id ASC
  LOOP
    membership := NULL;
    location_count := 0;
    mark_ready := false;
    subscription_state := NULL;
    payment_recorded := false;
    provision_state := NULL;
    provision_ready := false;
    business_name := NULL;
    location_names := NULL;
    offer_ref := NULL;
    offer_state := NULL;

    IF req.business_id IS NOT NULL THEN
      SELECT status INTO membership
      FROM public.business_memberships
      WHERE customer_id = customer
        AND business_id = req.business_id;
    END IF;

    email_verified := admin_private.contact_verified_v1(customer, 'email');

    IF membership = 'verified' THEN
      SELECT count(*)::integer INTO location_count
      FROM admin_private.onboarding_request_locations
      WHERE onboarding_request_id = req.id;

      mark_ready := EXISTS (
        SELECT 1
        FROM admin_private.onboarding_request_events AS ready
        WHERE ready.onboarding_request_id = req.id
          AND ready.operation = 'mark_ready'
          AND NOT EXISTS (
            SELECT 1
            FROM admin_private.onboarding_request_events AS later
            WHERE later.onboarding_request_id = req.id
              AND later.id > ready.id
              AND later.operation IN ('match_customer', 'match_business', 'select_locations', 'decline')
          )
      );

      IF req.commercial_subscription_id IS NOT NULL THEN
        SELECT state INTO subscription_state
        FROM public.commercial_subscriptions
        WHERE id = req.commercial_subscription_id
          AND customer_id = customer
          AND business_id = req.business_id;
        IF subscription_state IS NOT NULL THEN
          payment_recorded := EXISTS (
            SELECT 1
            FROM public.commercial_payment_evidence AS evidence
            WHERE evidence.subscription_id = req.commercial_subscription_id
          );
        END IF;
      END IF;

      -- A provision counts only for this request's own commercial subscription
      -- and the locations selected on this request. Another subscription's
      -- provision, or a provision with no linked subscription, is ignored.
      -- Ready for use needs an ELIGIBLE Telloya entitlement and genuine LIVE
      -- evidence at every selected location. service_provisions_live_closed
      -- still rejects LIVE rows.
      IF subscription_state IS NOT NULL THEN
        WITH selected AS (
          SELECT location_id
          FROM admin_private.onboarding_request_locations
          WHERE onboarding_request_id = req.id
        ),
        matched AS (
          SELECT
            selected.location_id,
            provision.state,
            provision.updated_at,
            (
              entitlement.state = 'ELIGIBLE'
              AND provision.state = 'LIVE'
              AND provision.live_at IS NOT NULL
              AND provision.profile_ready_at IS NOT NULL
              AND provision.agent_configured_at IS NOT NULL
              AND provision.number_allocated_at IS NOT NULL
              AND provision.forwarding_instructed_at IS NOT NULL
              AND provision.customer_confirmed_at IS NOT NULL
              AND provision.provider_binding_ref IS NOT NULL
              AND btrim(provision.provider_binding_ref) <> ''
              AND provision.provider_test_outcome = 'PASSED'
              AND provision.provider_test_call_ref IS NOT NULL
              AND btrim(provision.provider_test_call_ref) <> ''
              AND provision.agent_test_passed_at IS NOT NULL
            ) AS location_ready
          FROM selected
          JOIN public.product_entitlements AS entitlement
            ON entitlement.location_id = selected.location_id
           AND entitlement.business_id = req.business_id
           AND entitlement.commercial_subscription_id = req.commercial_subscription_id
           AND entitlement.component_code = 'TELLOYA'
           AND entitlement.state IN ('PENDING', 'ELIGIBLE')
          JOIN public.service_provisions AS provision
            ON provision.entitlement_id = entitlement.id
           AND provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
          JOIN public.commercial_subscriptions AS subscription
            ON subscription.id = req.commercial_subscription_id
           AND subscription.id = entitlement.commercial_subscription_id
           AND subscription.customer_id = customer
           AND subscription.business_id = req.business_id
        )
        SELECT
          CASE
            WHEN (SELECT count(*) FROM selected) = 0 THEN NULL
            WHEN (SELECT count(*) FROM matched) = 0 THEN NULL
            WHEN (SELECT count(*) FROM matched) < (SELECT count(*) FROM selected) THEN 'NOT_STARTED'
            ELSE (
              SELECT matched.state
              FROM matched
              ORDER BY
                CASE
                  WHEN matched.state = 'LIVE' THEN 0
                  WHEN matched.state = 'ENDED' THEN 2
                  ELSE 1
                END,
                matched.updated_at DESC
              LIMIT 1
            )
          END,
          (
            (SELECT count(*) FROM selected) > 0
            AND (SELECT count(*) FROM matched WHERE matched.location_ready) = (SELECT count(*) FROM selected)
          )
        INTO provision_state, provision_ready;
      END IF;

      SELECT display_name INTO business_name
      FROM public.businesses
      WHERE id = req.business_id;

      SELECT coalesce(jsonb_agg(picked.location_name ORDER BY picked.location_name, picked.id), '[]'::jsonb)
      INTO location_names
      FROM (
        SELECT location.id, location.location_name
        FROM admin_private.onboarding_request_locations AS selected
        JOIN public.locations AS location
          ON location.id = selected.location_id
         AND location.business_id = req.business_id
        WHERE selected.onboarding_request_id = req.id
          AND location.location_name IS NOT NULL
          AND btrim(location.location_name) <> ''
      ) AS picked;
    END IF;

    projected := admin_private.customer_portal_onboarding_projection_v1(
      req.state,
      membership,
      email_verified,
      location_count,
      mark_ready,
      subscription_state,
      payment_recorded,
      provision_state,
      coalesce(provision_ready, false)
    );

    IF membership = 'verified' AND req.commercial_subscription_id IS NOT NULL AND subscription_state = 'OFFERED' THEN
      SELECT subscription.public_ref INTO offer_ref
      FROM public.commercial_subscriptions AS subscription
      JOIN public.plan_versions AS plan ON plan.id = subscription.plan_version_id
      JOIN public.commercial_agreement_versions AS agreement
        ON agreement.product_code = plan.product_code
       AND agreement.version_ref = plan.terms_ref
       AND agreement.status = 'APPROVED'
      JOIN public.commercial_plan_conditions AS conditions
        ON conditions.plan_version_id = plan.id
       AND conditions.status = 'APPROVED'
      WHERE subscription.id = req.commercial_subscription_id
        AND subscription.customer_id = customer
        AND subscription.business_id = req.business_id
        AND subscription.state = 'OFFERED'
        AND subscription.grant_kind = 'BILLABLE'
        AND plan.status = 'APPROVED'
        AND plan.product_code = req.product_code
        AND plan.amount_minor IS NOT DISTINCT FROM subscription.amount_minor
        AND plan.tax_behaviour IS NOT DISTINCT FROM subscription.tax_behaviour
        AND plan.billing_cadence = subscription.cadence_snapshot
        AND plan.terms_ref = subscription.terms_ref
        AND plan.currency = subscription.currency
        AND plan.effective_from <= pg_catalog.now()
        AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
        AND conditions.base_amount_minor + coalesce((
          SELECT sum(item.quantity) * conditions.guard_unit_amount_minor
          FROM public.commercial_subscription_items AS item
          WHERE item.subscription_id = subscription.id
            AND item.component_code = 'GUARD'
        ), 0) = subscription.amount_minor
        AND (
          conditions.guard_unit_amount_minor IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.commercial_subscription_items AS item
            WHERE item.subscription_id = subscription.id
              AND item.component_code = 'GUARD'
          )
        );
      IF offer_ref IS NOT NULL THEN
        offer_state := 'eligible';
        projected := jsonb_set(projected, '{customerActionRequired}', 'true'::jsonb);
        projected := jsonb_set(projected, '{waitingFor}', '"you"'::jsonb);
        projected := jsonb_set(projected, '{nextStep}', '"Review the offer. Accepting it is a separate step. It does not take a payment or start the service."'::jsonb);
      END IF;
    ELSIF membership = 'verified' AND subscription_state = 'ACCEPTED' AND projected ->> 'statusLabel' = 'Acceptance recorded' THEN
      SELECT subscription.public_ref INTO offer_ref
      FROM public.commercial_subscriptions AS subscription
      WHERE subscription.id = req.commercial_subscription_id
        AND subscription.customer_id = customer
        AND subscription.business_id = req.business_id
        AND EXISTS (
          SELECT 1 FROM public.commercial_offer_acceptances AS acceptance
          WHERE acceptance.subscription_id = subscription.id
            AND acceptance.customer_id = customer
        );
      IF offer_ref IS NOT NULL THEN
        offer_state := 'accepted';
        projected := jsonb_set(projected, '{statusLabel}', '"Offer accepted"'::jsonb);
        projected := jsonb_set(projected, '{nextStep}', '"Your offer is accepted. Payment and service setup follow separately. Nothing has been paid and the service has not started."'::jsonb);
        projected := jsonb_set(projected, '{completed}', (
          SELECT coalesce(jsonb_agg(to_jsonb(CASE WHEN item = 'Acceptance recorded' THEN 'Offer accepted' ELSE item END) ORDER BY ord), '[]'::jsonb)
          FROM jsonb_array_elements_text(projected -> 'completed') WITH ORDINALITY AS done(item, ord)
        ));
      END IF;
    END IF;


    items := items || jsonb_build_array(jsonb_build_object(
      'product', CASE req.product_code WHEN 'TELLOYA' THEN 'Telloya' ELSE 'Complete' END,
      'stage', projected ->> 'stage',
      'statusLabel', projected ->> 'statusLabel',
      'waitingFor', projected ->> 'waitingFor',
      'customerActionRequired', projected -> 'customerActionRequired',
      'businessName', CASE WHEN coalesce((projected ->> 'revealBusiness')::boolean, false) THEN business_name ELSE NULL END,
      'locations', CASE WHEN coalesce((projected ->> 'revealBusiness')::boolean, false) THEN coalesce(location_names, '[]'::jsonb) ELSE NULL END,
      'completed', projected -> 'completed',
      'nextStep', projected ->> 'nextStep',
      'receivedAt', req.created_at,
      'updatedAt', req.updated_at,
      'offerRef', offer_ref,
      'offerState', offer_state
    ));
  END LOOP;

  RETURN jsonb_build_object('requests', items);
END;
$$;


COMMIT;
