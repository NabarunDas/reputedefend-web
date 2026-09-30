BEGIN;

-- Step 13: catalogue, immutable quotes, quote acceptance and service orders.
-- SOURCE IMPLEMENTATION ONLY. Do not apply from application code.

ALTER TABLE public.customer_actions DROP CONSTRAINT IF EXISTS customer_actions_kind_check;
ALTER TABLE public.customer_actions
  ADD CONSTRAINT customer_actions_kind_check
  CHECK (kind IN ('AGREEMENT_ACCEPTANCE','AUTHORIZATION_REVOCATION','CASE_ACCESS','COMMUNICATION_ACCESS','QUOTE_ACCEPTANCE'));

CREATE TABLE public.price_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  service_code text NOT NULL CHECK (service_code IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD')),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_model text NOT NULL CHECK (payment_model IN ('UPFRONT','SUCCESS_FEE','RECURRING_MONTHLY')),
  billing_cadence text NOT NULL CHECK (billing_cadence IN ('ONCE','ON_SUCCESS','MONTHLY')),
  billing_unit text NOT NULL CHECK (billing_unit IN ('SERVICE','LOCATION_MONTH')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  status text NOT NULL CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  tax_behaviour text NOT NULL DEFAULT 'UNCONFIRMED' CHECK (tax_behaviour IN ('UNCONFIRMED','INCLUSIVE','EXCLUSIVE','NOT_APPLICABLE')),
  tax_jurisdiction text CHECK (tax_jurisdiction IS NULL OR tax_jurisdiction ~ '^[A-Z]{2}$'),
  tax_rate_bps integer CHECK (tax_rate_bps IS NULL OR (tax_rate_bps >= 0 AND tax_rate_bps <= 10000)),
  tax_code text CHECK (tax_code IS NULL OR char_length(btrim(tax_code)) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  retired_at timestamptz,
  retired_by uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  seed_key text UNIQUE,
  CONSTRAINT price_versions_effective_window CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT price_versions_status_actor CHECK (
    (status = 'DRAFT' AND approved_at IS NULL AND approved_by IS NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (status = 'APPROVED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (status = 'RETIRED' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND retired_at IS NOT NULL AND retired_by IS NOT NULL)
  ),
  CONSTRAINT price_versions_service_model CHECK (
    (service_code IN ('GUIDED_RELAUNCH','GUIDED_REVIEW') AND payment_model = 'UPFRONT' AND billing_cadence = 'ONCE' AND billing_unit = 'SERVICE')
    OR (service_code IN ('MANAGED_RELAUNCH','MANAGED_REVIEW') AND payment_model = 'SUCCESS_FEE' AND billing_cadence = 'ON_SUCCESS' AND billing_unit = 'SERVICE')
    OR (service_code = 'RELAUNCH_GUARD' AND payment_model = 'RECURRING_MONTHLY' AND billing_cadence = 'MONTHLY' AND billing_unit = 'LOCATION_MONTH')
  ),
  CONSTRAINT price_versions_tax_rate CHECK (
    (tax_behaviour IN ('UNCONFIRMED','NOT_APPLICABLE') AND tax_rate_bps IS NULL)
    OR (tax_behaviour IN ('INCLUSIVE','EXCLUSIVE') AND tax_rate_bps IS NOT NULL)
  )
);

CREATE TABLE public.quote_discount_snapshots (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  qualified_at timestamptz NOT NULL DEFAULT now(),
  coverage_basis text NOT NULL CHECK (coverage_basis IN ('PAID','INCLUDED_ONLY','NONE')),
  coverage_status text NOT NULL CHECK (coverage_status IN ('ACTIVE','INACTIVE','PAUSED','EXPIRED','UNKNOWN')),
  coverage_type text NOT NULL CHECK (coverage_type IN ('PAID_GUARD','INCLUDED_GUARD','NONE')),
  future_coverage_id uuid,
  paid_vs_included text NOT NULL CHECK (paid_vs_included IN ('PAID','INCLUDED_ONLY','UNPROVEN')),
  issue_observed_at timestamptz,
  issue_predates_paid_coverage boolean NOT NULL DEFAULT true,
  service_code text NOT NULL CHECK (service_code IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD')),
  price_version_id uuid REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  policy_id text NOT NULL CHECK (policy_id IN ('PAID_GUARD_MANAGED_20','NONE')),
  discount_bps integer NOT NULL CHECK (discount_bps >= 0 AND discount_bps <= 10000),
  qualification_result text NOT NULL CHECK (qualification_result IN ('QUALIFIED','NOT_QUALIFIED')),
  reason_code text NOT NULL CHECK (char_length(btrim(reason_code)) BETWEEN 3 AND 80),
  standard_amount_minor integer NOT NULL CHECK (standard_amount_minor >= 0),
  discount_amount_minor integer NOT NULL CHECK (discount_amount_minor >= 0),
  discounted_subtotal_minor integer NOT NULL CHECK (discounted_subtotal_minor >= 0),
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  evidence_notes text CHECK (evidence_notes IS NULL OR char_length(evidence_notes) <= 2000),
  source text NOT NULL CHECK (source IN ('ADMIN_RECORDED','FAIL_CLOSED_EVALUATION')),
  valid_until timestamptz,
  CONSTRAINT quote_discount_snapshots_identity CHECK (
    standard_amount_minor = discount_amount_minor + discounted_subtotal_minor
  ),
  CONSTRAINT quote_discount_snapshots_qualified CHECK (
    (qualification_result = 'NOT_QUALIFIED' AND discount_bps = 0 AND discount_amount_minor = 0 AND policy_id = 'NONE')
    OR (
      qualification_result = 'QUALIFIED'
      AND policy_id = 'PAID_GUARD_MANAGED_20'
      AND discount_bps = 2000
      AND coverage_basis = 'PAID'
      AND coverage_status = 'ACTIVE'
      AND coverage_type = 'PAID_GUARD'
      AND paid_vs_included = 'PAID'
      AND issue_predates_paid_coverage = false
      AND service_code IN ('MANAGED_RELAUNCH','MANAGED_REVIEW')
      AND location_id IS NOT NULL
    )
  )
);

CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  public_ref text NOT NULL UNIQUE CHECK (public_ref ~ '^QT-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  monitoring_request_id uuid REFERENCES public.monitoring_requests(id) ON DELETE RESTRICT,
  current_version_id uuid,
  status text NOT NULL CHECK (status IN ('DRAFT','OFFERED','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED','CANCELLED')),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotes_parent_scope CHECK (
    (case_id IS NOT NULL AND monitoring_request_id IS NULL)
    OR (case_id IS NULL AND location_id IS NOT NULL)
  )
);

CREATE TABLE public.quote_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL CHECK (status IN ('DRAFT','OFFERED','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED','CANCELLED')),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  monitoring_request_id uuid REFERENCES public.monitoring_requests(id) ON DELETE RESTRICT,
  service_code text NOT NULL CHECK (service_code IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD')),
  price_version_id uuid NOT NULL REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  service_name text NOT NULL,
  payment_model text NOT NULL CHECK (payment_model IN ('UPFRONT','SUCCESS_FEE','RECURRING_MONTHLY')),
  scope_text text NOT NULL CHECK (char_length(btrim(scope_text)) BETWEEN 10 AND 5000),
  exclusions_text text NOT NULL CHECK (char_length(btrim(exclusions_text)) BETWEEN 10 AND 5000),
  success_definition text NOT NULL CHECK (char_length(btrim(success_definition)) BETWEEN 10 AND 5000),
  standard_amount_minor integer NOT NULL CHECK (standard_amount_minor >= 0),
  discount_policy_id text NOT NULL CHECK (discount_policy_id IN ('PAID_GUARD_MANAGED_20','NONE')),
  discount_bps integer NOT NULL CHECK (discount_bps >= 0 AND discount_bps <= 10000),
  discount_amount_minor integer NOT NULL CHECK (discount_amount_minor >= 0),
  quoted_subtotal_minor integer NOT NULL CHECK (quoted_subtotal_minor >= 0),
  tax_behaviour text NOT NULL CHECK (tax_behaviour IN ('UNCONFIRMED','INCLUSIVE','EXCLUSIVE','NOT_APPLICABLE')),
  tax_jurisdiction text CHECK (tax_jurisdiction IS NULL OR tax_jurisdiction ~ '^[A-Z]{2}$'),
  tax_rate_bps integer CHECK (tax_rate_bps IS NULL OR (tax_rate_bps >= 0 AND tax_rate_bps <= 10000)),
  tax_code text CHECK (tax_code IS NULL OR char_length(btrim(tax_code)) BETWEEN 1 AND 40),
  tax_amount_minor integer NOT NULL CHECK (tax_amount_minor >= 0),
  total_amount_minor integer NOT NULL CHECK (total_amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  discount_snapshot_id uuid NOT NULL REFERENCES public.quote_discount_snapshots(id) ON DELETE RESTRICT,
  valid_until timestamptz NOT NULL,
  payment_timing_text text NOT NULL CHECK (char_length(btrim(payment_timing_text)) BETWEEN 20 AND 2000),
  terms_reference text NOT NULL CHECK (char_length(btrim(terms_reference)) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  offered_at timestamptz,
  offered_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  CONSTRAINT quote_versions_unique_number UNIQUE (quote_id, version_number),
  CONSTRAINT quote_versions_identity CHECK (
    standard_amount_minor = discount_amount_minor + quoted_subtotal_minor
  ),
  CONSTRAINT quote_versions_discount_policy CHECK (
    (discount_policy_id = 'NONE' AND discount_bps = 0 AND discount_amount_minor = 0)
    OR (discount_policy_id = 'PAID_GUARD_MANAGED_20' AND discount_bps = 2000 AND service_code IN ('MANAGED_RELAUNCH','MANAGED_REVIEW'))
  ),
  CONSTRAINT quote_versions_tax_rate CHECK (
    (tax_behaviour IN ('UNCONFIRMED','NOT_APPLICABLE') AND tax_rate_bps IS NULL)
    OR (tax_behaviour IN ('INCLUSIVE','EXCLUSIVE') AND tax_rate_bps IS NOT NULL)
  )
);

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_current_version_fk FOREIGN KEY (current_version_id) REFERENCES public.quote_versions(id) ON DELETE RESTRICT;

CREATE TABLE public.quote_acceptances (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  quote_version_id uuid NOT NULL UNIQUE REFERENCES public.quote_versions(id) ON DELETE RESTRICT,
  customer_action_id uuid NOT NULL REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  accepted_by_auth_user_id uuid NOT NULL,
  accepted_email_snapshot text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'CUSTOMER_OTP' CHECK (source = 'CUSTOMER_OTP'),
  total_amount_minor integer NOT NULL CHECK (total_amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  tax_behaviour text NOT NULL CHECK (tax_behaviour IN ('INCLUSIVE','EXCLUSIVE','NOT_APPLICABLE')),
  tax_amount_minor integer NOT NULL CHECK (tax_amount_minor >= 0)
);

CREATE TABLE public.service_orders (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  public_ref text NOT NULL UNIQUE CHECK (public_ref ~ '^SO-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  quote_version_id uuid NOT NULL UNIQUE REFERENCES public.quote_versions(id) ON DELETE RESTRICT,
  quote_acceptance_id uuid NOT NULL UNIQUE REFERENCES public.quote_acceptances(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  monitoring_request_id uuid REFERENCES public.monitoring_requests(id) ON DELETE RESTRICT,
  service_code text NOT NULL CHECK (service_code IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payment_model text NOT NULL CHECK (payment_model IN ('UPFRONT','SUCCESS_FEE','RECURRING_MONTHLY')),
  tax_behaviour text NOT NULL CHECK (tax_behaviour IN ('INCLUSIVE','EXCLUSIVE','NOT_APPLICABLE')),
  tax_rate_bps integer CHECK (tax_rate_bps IS NULL OR (tax_rate_bps >= 0 AND tax_rate_bps <= 10000)),
  tax_amount_minor integer NOT NULL CHECK (tax_amount_minor >= 0),
  tax_code text,
  tax_jurisdiction text,
  state text NOT NULL CHECK (state IN ('ACCEPTED_AWAITING_PAYMENT','ACCEPTED_SUCCESS_FEE','ACCEPTED_RECURRING')),
  accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  CONSTRAINT service_orders_state_model CHECK (
    (payment_model = 'UPFRONT' AND state = 'ACCEPTED_AWAITING_PAYMENT')
    OR (payment_model = 'SUCCESS_FEE' AND state = 'ACCEPTED_SUCCESS_FEE')
    OR (payment_model = 'RECURRING_MONTHLY' AND state = 'ACCEPTED_RECURRING')
  )
);

CREATE TABLE public.quote_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  quote_version_id uuid REFERENCES public.quote_versions(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('ADMIN','CUSTOMER','SYSTEM')),
  actor_id uuid,
  event text NOT NULL CHECK (event IN (
    'QUOTE_DRAFTED','QUOTE_VERSION_CREATED','QUOTE_OFFERED','QUOTE_SUPERSEDED','QUOTE_CANCELLED',
    'QUOTE_ACCEPTED','QUOTE_DECLINED','QUOTE_EXPIRED','TAX_SET','QUALIFICATION_RECORDED','ACTION_ISSUED'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.price_version_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  price_version_id uuid NOT NULL REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  actor_id uuid,
  event text NOT NULL CHECK (event IN ('PRICE_DRAFTED','PRICE_APPROVED','PRICE_RETIRED','PRICE_SCHEDULED_END')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.catalogue_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_private.quote_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_actions
  ADD COLUMN quote_version_id uuid REFERENCES public.quote_versions(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_actions
  ADD CONSTRAINT customer_actions_quote_acceptance_scope_check
  CHECK (
    (kind = 'QUOTE_ACCEPTANCE' AND quote_version_id IS NOT NULL AND agreement_version_id IS NULL AND authorization_id IS NULL AND evidence_request_id IS NULL AND link_key_version IS NULL)
    OR (kind <> 'QUOTE_ACCEPTANCE' AND quote_version_id IS NULL)
  );

DROP INDEX IF EXISTS public.customer_actions_one_open_kind_idx;
CREATE UNIQUE INDEX customer_actions_one_open_kind_idx
  ON public.customer_actions (case_id, kind, coalesce(agreement_version_id, authorization_id, evidence_request_id, quote_version_id))
  WHERE status = 'OPEN' AND case_id IS NOT NULL;
CREATE UNIQUE INDEX customer_actions_one_open_quote_acceptance_idx
  ON public.customer_actions (quote_version_id)
  WHERE status = 'OPEN' AND kind = 'QUOTE_ACCEPTANCE';

CREATE INDEX price_versions_service_status_idx ON public.price_versions (service_code, status, effective_from);
CREATE INDEX quotes_customer_idx ON public.quotes (customer_id, created_at DESC);
CREATE INDEX quotes_status_idx ON public.quotes (status, created_at DESC);
CREATE INDEX quote_versions_quote_idx ON public.quote_versions (quote_id, version_number);
CREATE INDEX service_orders_customer_idx ON public.service_orders (customer_id, created_at DESC);
CREATE INDEX customer_actions_quote_version_idx ON public.customer_actions (quote_version_id);

ALTER TABLE public.price_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_discount_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_version_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.catalogue_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.quote_command_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.price_versions, public.quote_discount_snapshots, public.quotes, public.quote_versions,
  public.quote_acceptances, public.service_orders, public.quote_events, public.price_version_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON admin_private.catalogue_command_receipts, admin_private.quote_command_receipts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.money_discount_minor_v1(p_standard integer, p_bps integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_standard IS NULL OR p_bps IS NULL OR p_standard < 0 OR p_bps < 0 THEN NULL
    WHEN p_bps = 0 THEN 0
    ELSE round((p_standard::numeric * p_bps::numeric) / 10000.0)::integer
  END;
$$;

CREATE FUNCTION admin_private.money_tax_minor_v1(p_subtotal integer, p_behaviour text, p_rate_bps integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_subtotal IS NULL OR p_behaviour IS NULL THEN NULL
    WHEN p_behaviour IN ('UNCONFIRMED','NOT_APPLICABLE') THEN 0
    WHEN p_behaviour = 'EXCLUSIVE' AND p_rate_bps IS NOT NULL AND p_rate_bps >= 0
      THEN round((p_subtotal::numeric * p_rate_bps::numeric) / 10000.0)::integer
    WHEN p_behaviour = 'INCLUSIVE' AND p_rate_bps IS NOT NULL AND p_rate_bps >= 0
      THEN round((p_subtotal::numeric * p_rate_bps::numeric) / (10000.0 + p_rate_bps::numeric))::integer
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.money_total_minor_v1(p_subtotal integer, p_behaviour text, p_tax integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_behaviour = 'EXCLUSIVE' THEN p_subtotal + p_tax
    WHEN p_behaviour IN ('INCLUSIVE','NOT_APPLICABLE','UNCONFIRMED') THEN p_subtotal
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.commerce_public_ref_v1(p_prefix text)
RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  yy text; bytes bytea; token text; candidate text; i integer; attempts integer := 0;
BEGIN
  IF p_prefix NOT IN ('QT','SO') THEN RAISE EXCEPTION 'unsupported commerce prefix'; END IF;
  yy := to_char(timezone('utc', now()), 'YY');
  LOOP
    attempts := attempts + 1;
    IF attempts > 20 THEN RAISE EXCEPTION 'could not generate a unique commercial reference'; END IF;
    bytes := extensions.gen_random_bytes(6);
    token := '';
    FOR i IN 0..5 LOOP
      token := token || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    END LOOP;
    candidate := p_prefix || '-' || yy || '-' || token;
    IF p_prefix = 'QT' AND NOT EXISTS (SELECT 1 FROM public.quotes WHERE public_ref = candidate) THEN RETURN candidate; END IF;
    IF p_prefix = 'SO' AND NOT EXISTS (SELECT 1 FROM public.service_orders WHERE public_ref = candidate) THEN RETURN candidate; END IF;
  END LOOP;
END; $$;

CREATE FUNCTION admin_private.payment_timing_text_v1(p_model text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_model
    WHEN 'UPFRONT' THEN 'The quoted amount is payable later through the payment workflow. Accepting this quote does not charge a card and is not payment authorisation.'
    WHEN 'SUCCESS_FEE' THEN 'No service fee is charged today. The quoted success fee becomes collectible only after the defined successful outcome and the later payment/consent workflow. Accepting this quote is not payment authorisation for future card charging.'
    WHEN 'RECURRING_MONTHLY' THEN 'Accepting this quote does not start monitoring and does not take payment. Recurring collection is a later step.'
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.success_definition_v1(p_service text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_service
    WHEN 'MANAGED_RELAUNCH' THEN 'Success relates to the agreed successful restoration outcome. Google makes the final platform decision. Accepting this quote is not evidence that restoration has occurred and does not create a collectible fee today.'
    WHEN 'MANAGED_REVIEW' THEN 'Success relates to the agreed successful removal outcome. Google makes the final platform decision. Accepting this quote is not evidence that removal has occurred and does not create a collectible fee today.'
    WHEN 'GUIDED_RELAUNCH' THEN 'This is an upfront guided recovery service. Payment collection is a later step and is not taken by accepting this quote.'
    WHEN 'GUIDED_REVIEW' THEN 'This is an upfront guided review service. Payment collection is a later step and is not taken by accepting this quote.'
    WHEN 'RELAUNCH_GUARD' THEN 'This is a recurring monthly monitoring subscription quote. Accepting this quote does not start monitoring and does not take payment.'
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.quote_service_compatible_v1(
  p_case public.cases, p_service text, p_monitoring public.monitoring_requests, p_location uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF p_service IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH') THEN
    IF p_case.id IS NULL OR p_case.case_type <> 'PROFILE_RECOVERY' THEN RETURN false; END IF;
    IF p_case.service_track = 'GUIDED' AND p_service <> 'GUIDED_RELAUNCH' THEN RETURN false; END IF;
    IF p_case.service_track = 'MANAGED' AND p_service <> 'MANAGED_RELAUNCH' THEN RETURN false; END IF;
    RETURN true;
  END IF;
  IF p_service IN ('GUIDED_REVIEW','MANAGED_REVIEW') THEN
    IF p_case.id IS NULL OR p_case.case_type <> 'REVIEW_PROTECTION' THEN RETURN false; END IF;
    IF p_case.service_track = 'GUIDED' AND p_service <> 'GUIDED_REVIEW' THEN RETURN false; END IF;
    IF p_case.service_track = 'MANAGED' AND p_service <> 'MANAGED_REVIEW' THEN RETURN false; END IF;
    RETURN true;
  END IF;
  IF p_service = 'RELAUNCH_GUARD' THEN
    IF p_case.id IS NOT NULL THEN RETURN false; END IF;
    IF p_location IS NULL THEN RETURN false; END IF;
    IF p_monitoring.id IS NOT NULL AND (p_monitoring.location_id IS DISTINCT FROM p_location) THEN RETURN false; END IF;
    RETURN true;
  END IF;
  RETURN false;
END; $$;

CREATE FUNCTION admin_private.price_version_current_v1(p_service text, p_at timestamptz)
RETURNS public.price_versions LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE row public.price_versions;
BEGIN
  SELECT * INTO row FROM public.price_versions
  WHERE service_code = p_service AND status = 'APPROVED'
    AND effective_from <= p_at AND (effective_to IS NULL OR effective_to > p_at)
  ORDER BY effective_from DESC, approved_at DESC
  LIMIT 2;
  IF FOUND THEN
    SELECT * INTO row FROM public.price_versions
    WHERE service_code = p_service AND status = 'APPROVED'
      AND effective_from <= p_at AND (effective_to IS NULL OR effective_to > p_at)
    ORDER BY effective_from DESC, approved_at DESC
    LIMIT 1;
    IF (SELECT count(*) FROM public.price_versions
        WHERE service_code = p_service AND status = 'APPROVED'
          AND effective_from <= p_at AND (effective_to IS NULL OR effective_to > p_at)) <> 1
    THEN RETURN NULL; END IF;
    RETURN row;
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.prevent_price_overlap_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND EXISTS (
    SELECT 1 FROM public.price_versions p
    WHERE p.id IS DISTINCT FROM NEW.id
      AND p.service_code = NEW.service_code
      AND p.status = 'APPROVED'
      AND tstzrange(p.effective_from, p.effective_to, '[)') && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN RAISE EXCEPTION 'Overlapping approved price versions are not allowed'; END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.protect_price_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status = 'APPROVED' THEN
    IF NEW.service_code IS DISTINCT FROM OLD.service_code
      OR NEW.display_name IS DISTINCT FROM OLD.display_name
      OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.payment_model IS DISTINCT FROM OLD.payment_model
      OR NEW.billing_cadence IS DISTINCT FROM OLD.billing_cadence
      OR NEW.billing_unit IS DISTINCT FROM OLD.billing_unit
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
      OR NEW.tax_jurisdiction IS DISTINCT FROM OLD.tax_jurisdiction
      OR NEW.tax_rate_bps IS DISTINCT FROM OLD.tax_rate_bps
      OR NEW.tax_code IS DISTINCT FROM OLD.tax_code
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.seed_key IS DISTINCT FROM OLD.seed_key
    THEN RAISE EXCEPTION 'Approved price financial fields are immutable'; END IF;
    IF NEW.status = 'RETIRED' THEN
      NEW.record_version := OLD.record_version + 1;
      RETURN NEW;
    END IF;
    IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
      AND NEW.status = 'APPROVED'
      AND NEW.effective_to IS NOT NULL
      AND (OLD.effective_to IS NULL OR NEW.effective_to < OLD.effective_to)
      AND NEW.effective_to > OLD.effective_from
      AND current_setting('admin_private.price_rollover', true) = OLD.id::text
    THEN
      NEW.record_version := OLD.record_version + 1;
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
      RAISE EXCEPTION 'Approved price versions can only be retired through the controlled command';
    END IF;
  ELSIF OLD.status = 'RETIRED' THEN
    RAISE EXCEPTION 'Retired price versions are immutable';
  ELSIF OLD.status = 'DRAFT' AND NEW.status = 'APPROVED' THEN
    NEW.record_version := OLD.record_version + 1;
    RETURN NEW;
  ELSIF OLD.status = 'DRAFT' THEN
    NEW.record_version := OLD.record_version + 1;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.reject_discount_snapshot_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Discount qualification snapshots are immutable';
END; $$;

CREATE FUNCTION admin_private.protect_quote_version_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    IF NEW.standard_amount_minor IS DISTINCT FROM OLD.standard_amount_minor
      OR NEW.discount_amount_minor IS DISTINCT FROM OLD.discount_amount_minor
      OR NEW.quoted_subtotal_minor IS DISTINCT FROM OLD.quoted_subtotal_minor
      OR NEW.tax_amount_minor IS DISTINCT FROM OLD.tax_amount_minor
      OR NEW.total_amount_minor IS DISTINCT FROM OLD.total_amount_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
      OR NEW.tax_rate_bps IS DISTINCT FROM OLD.tax_rate_bps
      OR NEW.tax_code IS DISTINCT FROM OLD.tax_code
      OR NEW.tax_jurisdiction IS DISTINCT FROM OLD.tax_jurisdiction
      OR NEW.discount_bps IS DISTINCT FROM OLD.discount_bps
      OR NEW.discount_policy_id IS DISTINCT FROM OLD.discount_policy_id
      OR NEW.discount_snapshot_id IS DISTINCT FROM OLD.discount_snapshot_id
      OR NEW.price_version_id IS DISTINCT FROM OLD.price_version_id
      OR NEW.service_code IS DISTINCT FROM OLD.service_code
      OR NEW.service_name IS DISTINCT FROM OLD.service_name
      OR NEW.payment_model IS DISTINCT FROM OLD.payment_model
      OR NEW.scope_text IS DISTINCT FROM OLD.scope_text
      OR NEW.exclusions_text IS DISTINCT FROM OLD.exclusions_text
      OR NEW.success_definition IS DISTINCT FROM OLD.success_definition
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.monitoring_request_id IS DISTINCT FROM OLD.monitoring_request_id
      OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
      OR NEW.payment_timing_text IS DISTINCT FROM OLD.payment_timing_text
      OR NEW.terms_reference IS DISTINCT FROM OLD.terms_reference
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN RAISE EXCEPTION 'Offered or accepted quote versions are immutable'; END IF;
    IF OLD.status IN ('ACCEPTED') AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Accepted quote versions cannot change status';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.reject_quote_acceptance_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Quote acceptances are immutable';
END; $$;

CREATE FUNCTION admin_private.protect_service_order_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.quote_id IS DISTINCT FROM OLD.quote_id
    OR NEW.quote_version_id IS DISTINCT FROM OLD.quote_version_id
    OR NEW.quote_acceptance_id IS DISTINCT FROM OLD.quote_acceptance_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.monitoring_request_id IS DISTINCT FROM OLD.monitoring_request_id
    OR NEW.service_code IS DISTINCT FROM OLD.service_code
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.payment_model IS DISTINCT FROM OLD.payment_model
    OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
    OR NEW.tax_rate_bps IS DISTINCT FROM OLD.tax_rate_bps
    OR NEW.tax_amount_minor IS DISTINCT FROM OLD.tax_amount_minor
    OR NEW.tax_code IS DISTINCT FROM OLD.tax_code
    OR NEW.tax_jurisdiction IS DISTINCT FROM OLD.tax_jurisdiction
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
  THEN RAISE EXCEPTION 'Service order commercial snapshots are immutable'; END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.reject_quote_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Quote events are append-only'; END; $$;

CREATE FUNCTION admin_private.validate_quote_version_totals_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE discount integer; tax integer; total integer;
BEGIN
  discount := admin_private.money_discount_minor_v1(NEW.standard_amount_minor, NEW.discount_bps);
  IF NEW.discount_amount_minor IS DISTINCT FROM discount THEN
    RAISE EXCEPTION 'Quote discount does not match integer pence arithmetic';
  END IF;
  IF NEW.quoted_subtotal_minor IS DISTINCT FROM (NEW.standard_amount_minor - discount) THEN
    RAISE EXCEPTION 'Quote subtotal does not match integer pence arithmetic';
  END IF;
  tax := admin_private.money_tax_minor_v1(NEW.quoted_subtotal_minor, NEW.tax_behaviour, NEW.tax_rate_bps);
  IF NEW.tax_amount_minor IS DISTINCT FROM tax THEN
    RAISE EXCEPTION 'Quote tax does not match integer pence arithmetic';
  END IF;
  total := admin_private.money_total_minor_v1(NEW.quoted_subtotal_minor, NEW.tax_behaviour, tax);
  IF NEW.total_amount_minor IS DISTINCT FROM total THEN
    RAISE EXCEPTION 'Quote total does not match integer pence arithmetic';
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.validate_discount_snapshot_totals_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.discount_amount_minor IS DISTINCT FROM admin_private.money_discount_minor_v1(NEW.standard_amount_minor, NEW.discount_bps) THEN
    RAISE EXCEPTION 'Discount snapshot does not match integer pence arithmetic';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER price_versions_overlap BEFORE INSERT OR UPDATE ON public.price_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.prevent_price_overlap_v1();
CREATE TRIGGER price_versions_protect BEFORE UPDATE ON public.price_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_price_version_v1();
CREATE TRIGGER quote_discount_snapshots_immutable BEFORE UPDATE OR DELETE ON public.quote_discount_snapshots
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_discount_snapshot_mutation_v1();
CREATE TRIGGER quote_discount_snapshots_totals BEFORE INSERT ON public.quote_discount_snapshots
FOR EACH ROW EXECUTE FUNCTION admin_private.validate_discount_snapshot_totals_v1();
CREATE TRIGGER quote_versions_protect BEFORE UPDATE ON public.quote_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_quote_version_v1();
CREATE TRIGGER quote_versions_totals BEFORE INSERT OR UPDATE ON public.quote_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.validate_quote_version_totals_v1();
CREATE TRIGGER quote_acceptances_immutable BEFORE UPDATE OR DELETE ON public.quote_acceptances
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_quote_acceptance_mutation_v1();
CREATE TRIGGER service_orders_protect BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_service_order_v1();
CREATE TRIGGER quote_events_immutable BEFORE UPDATE OR DELETE ON public.quote_events
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_quote_event_change_v1();
CREATE TRIGGER price_version_events_immutable BEFORE UPDATE OR DELETE ON public.price_version_events
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_quote_event_change_v1();

CREATE OR REPLACE FUNCTION admin_private.protect_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
    OR NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
    OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
    OR NEW.quote_version_id IS DISTINCT FROM OLD.quote_version_id
    OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.secret_hash IS DISTINCT FROM OLD.secret_hash
    OR NEW.expected_email_snapshot IS DISTINCT FROM OLD.expected_email_snapshot
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Customer action scope fields are immutable'; END IF;
  IF OLD.status = 'OPEN' THEN
    IF NEW.status NOT IN ('OPEN','COMPLETED','DECLINED','REVOKED') THEN
      RAISE EXCEPTION 'Invalid customer action status transition';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Customer action status is terminal';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.validate_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.agreement_versions; auth public.authorization_records; c public.customers; cs public.cases;
  req public.evidence_requests; qv public.quote_versions;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO c FROM public.customers WHERE id = NEW.customer_id;
    IF c.id IS NULL OR lower(NEW.expected_email_snapshot) IS DISTINCT FROM lower(c.email) THEN
      RAISE EXCEPTION 'Customer action email snapshot does not match the current customer email';
    END IF;
  END IF;
  IF NEW.kind = 'AGREEMENT_ACCEPTANCE' THEN
    IF NEW.agreement_version_id IS NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Agreement acceptance actions require an agreement version and no authorisation';
    END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = NEW.agreement_version_id;
    IF v.id IS NULL
      OR v.case_id IS DISTINCT FROM NEW.case_id
      OR v.customer_id IS DISTINCT FROM NEW.customer_id
      OR v.business_id IS DISTINCT FROM NEW.business_id
      OR v.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced agreement'; END IF;
  ELSIF NEW.kind = 'AUTHORIZATION_REVOCATION' THEN
    IF NEW.authorization_id IS NULL OR NEW.agreement_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'Authorisation revocation actions require an authorisation and no agreement version';
    END IF;
    SELECT * INTO auth FROM public.authorization_records WHERE id = NEW.authorization_id;
    IF auth.id IS NULL
      OR auth.case_id IS DISTINCT FROM NEW.case_id
      OR auth.customer_id IS DISTINCT FROM NEW.customer_id
      OR auth.business_id IS DISTINCT FROM NEW.business_id
      OR auth.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced authorisation'; END IF;
  ELSIF NEW.kind IN ('CASE_ACCESS','COMMUNICATION_ACCESS') THEN
    IF NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL OR NEW.case_id IS NULL THEN
      RAISE EXCEPTION 'Case access actions require a case and no agreement or authorisation';
    END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NEW.case_id;
    IF cs.id IS NULL
      OR cs.customer_id IS DISTINCT FROM NEW.customer_id
      OR cs.business_id IS DISTINCT FROM NEW.business_id
      OR cs.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced case'; END IF;
    IF TG_OP = 'INSERT' AND cs.status IN ('CLOSED','CANCELLED') THEN
      RAISE EXCEPTION 'Case access cannot be created for a closed case';
    END IF;
    IF NEW.kind = 'CASE_ACCESS' AND NEW.evidence_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'Case access actions cannot pin an evidence request';
    END IF;
    IF NEW.kind = 'COMMUNICATION_ACCESS' THEN
      IF NEW.evidence_request_id IS NULL OR NEW.link_key_version IS NULL OR NEW.link_key_version < 1 THEN
        RAISE EXCEPTION 'Communication access actions require an evidence request and link key version';
      END IF;
      SELECT * INTO req FROM public.evidence_requests WHERE id = NEW.evidence_request_id;
      IF req.id IS NULL
        OR req.case_id IS DISTINCT FROM NEW.case_id
        OR req.case_id IS DISTINCT FROM cs.id
        OR (TG_OP = 'INSERT' AND req.status <> 'OPEN')
      THEN RAISE EXCEPTION 'Communication access does not match the referenced evidence request'; END IF;
    END IF;
  ELSIF NEW.kind = 'QUOTE_ACCEPTANCE' THEN
    IF NEW.quote_version_id IS NULL OR NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Quote acceptance actions require a quote version and no agreement or authorisation';
    END IF;
    SELECT * INTO qv FROM public.quote_versions WHERE id = NEW.quote_version_id;
    IF qv.id IS NULL
      OR qv.customer_id IS DISTINCT FROM NEW.customer_id
      OR qv.business_id IS DISTINCT FROM NEW.business_id
      OR qv.location_id IS DISTINCT FROM NEW.location_id
      OR qv.case_id IS DISTINCT FROM NEW.case_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced quote version'; END IF;
    IF TG_OP = 'INSERT' AND qv.status <> 'OFFERED' THEN
      RAISE EXCEPTION 'Quote acceptance can only be pinned to an offered quote version';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid customer action kind';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_action_eligible_v1(p_action public.customer_actions) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE c public.customers; b public.businesses; loc public.locations; cs public.cases;
  qv public.quote_versions; q public.quotes;
BEGIN
  IF p_action.id IS NULL OR p_action.status <> 'OPEN' OR p_action.expires_at <= now() THEN RETURN false; END IF;
  IF lower(p_action.expected_email_snapshot) = 'admin@profilerelaunch.com' THEN RETURN false; END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_action.customer_id;
  IF c.id IS NULL OR lower(c.email) IS DISTINCT FROM lower(p_action.expected_email_snapshot) THEN RETURN false; END IF;
  IF NOT admin_private.contact_verified_v1(c.id, 'email') THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'verified'
  ) THEN RETURN false; END IF;
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
    IF qv.customer_id IS DISTINCT FROM p_action.customer_id
      OR qv.business_id IS DISTINCT FROM p_action.business_id
      OR qv.location_id IS DISTINCT FROM p_action.location_id
      OR qv.case_id IS DISTINCT FROM p_action.case_id
    THEN RETURN false; END IF;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.catalogue_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.catalogue_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.catalogue_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict'); END IF;
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.quote_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.quote_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.quote_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict'); END IF;
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.fail_closed_discount_v1(
  p_actor uuid, p_service text, p_price public.price_versions, p_location uuid, p_reason text
) RETURNS public.quote_discount_snapshots LANGUAGE plpgsql SET search_path='' AS $$
DECLARE snap public.quote_discount_snapshots;
BEGIN
  INSERT INTO public.quote_discount_snapshots(
    location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, issue_predates_paid_coverage,
    service_code, price_version_id, policy_id, discount_bps, qualification_result, reason_code,
    standard_amount_minor, discount_amount_minor, discounted_subtotal_minor, recorded_by, source, evidence_notes
  ) VALUES (
    p_location, 'NONE', 'UNKNOWN', 'NONE', 'UNPROVEN', true,
    p_service, p_price.id, 'NONE', 0, 'NOT_QUALIFIED', p_reason,
    p_price.amount_minor, 0, p_price.amount_minor, p_actor, 'FAIL_CLOSED_EVALUATION',
    'No authoritative paid Guard coverage record exists. Step 15 coverage IDs are not inferred from monitoring requests or included periods.'
  ) RETURNING * INTO snap;
  RETURN snap;
END; $$;

CREATE FUNCTION admin_private.qualified_discount_snapshot_v1(
  p_snap public.quote_discount_snapshots, p_service text, p_price_id uuid, p_location uuid
) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF p_snap.id IS NULL OR p_snap.qualification_result <> 'QUALIFIED' THEN RETURN false; END IF;
  IF p_snap.service_code IS DISTINCT FROM p_service
    OR p_snap.price_version_id IS DISTINCT FROM p_price_id
    OR p_snap.location_id IS DISTINCT FROM p_location
  THEN RETURN false; END IF;
  IF p_snap.valid_until IS NOT NULL AND p_snap.valid_until <= now() THEN RETURN false; END IF;
  IF p_snap.policy_id <> 'PAID_GUARD_MANAGED_20' OR p_snap.discount_bps <> 2000 THEN RETURN false; END IF;
  IF p_snap.coverage_basis <> 'PAID' OR p_snap.coverage_status <> 'ACTIVE'
    OR p_snap.coverage_type <> 'PAID_GUARD' OR p_snap.paid_vs_included <> 'PAID'
    OR p_snap.issue_predates_paid_coverage IS DISTINCT FROM false
  THEN RETURN false; END IF;
  IF p_snap.discount_amount_minor IS DISTINCT FROM admin_private.money_discount_minor_v1(p_snap.standard_amount_minor, p_snap.discount_bps)
    OR p_snap.standard_amount_minor IS DISTINCT FROM (p_snap.discount_amount_minor + p_snap.discounted_subtotal_minor)
  THEN RETURN false; END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.quote_version_offerable_v1(p_version public.quote_versions)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF p_version.id IS NULL OR p_version.valid_until IS NULL OR p_version.valid_until <= now() THEN RETURN false; END IF;
  IF p_version.tax_behaviour IS NULL OR p_version.tax_behaviour = 'UNCONFIRMED' THEN RETURN false; END IF;
  IF p_version.discount_amount_minor IS DISTINCT FROM admin_private.money_discount_minor_v1(p_version.standard_amount_minor, p_version.discount_bps)
    OR p_version.quoted_subtotal_minor IS DISTINCT FROM (p_version.standard_amount_minor - p_version.discount_amount_minor)
    OR p_version.tax_amount_minor IS DISTINCT FROM admin_private.money_tax_minor_v1(p_version.quoted_subtotal_minor, p_version.tax_behaviour, p_version.tax_rate_bps)
    OR p_version.total_amount_minor IS DISTINCT FROM admin_private.money_total_minor_v1(p_version.quoted_subtotal_minor, p_version.tax_behaviour, p_version.tax_amount_minor)
  THEN RETURN false; END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.quote_json_v1(p_quote public.quotes, p_version public.quote_versions)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE snap public.quote_discount_snapshots; action public.customer_actions; acc public.quote_acceptances;
  ord public.service_orders; c public.customers; b public.businesses; loc public.locations; cs public.cases;
BEGIN
  SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = p_version.discount_snapshot_id;
  SELECT * INTO action FROM public.customer_actions
    WHERE quote_version_id = p_version.id AND kind = 'QUOTE_ACCEPTANCE'
    ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO acc FROM public.quote_acceptances WHERE quote_version_id = p_version.id;
  SELECT * INTO ord FROM public.service_orders WHERE quote_version_id = p_version.id;
  SELECT * INTO c FROM public.customers WHERE id = p_quote.customer_id;
  SELECT * INTO b FROM public.businesses WHERE id = p_quote.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = p_quote.location_id;
  SELECT * INTO cs FROM public.cases WHERE id = p_quote.case_id;
  RETURN jsonb_build_object(
    'id', p_quote.id,
    'publicRef', p_quote.public_ref,
    'status', p_quote.status,
    'version', p_quote.record_version,
    'customerId', p_quote.customer_id,
    'customerName', c.full_name,
    'businessId', p_quote.business_id,
    'businessName', b.display_name,
    'locationId', p_quote.location_id,
    'locationName', loc.location_name,
    'caseId', p_quote.case_id,
    'caseReference', cs.public_ref,
    'monitoringRequestId', p_quote.monitoring_request_id,
    'currentVersionId', p_quote.current_version_id,
    'createdAt', p_quote.created_at,
    'currentVersion', jsonb_build_object(
      'id', p_version.id,
      'versionNumber', p_version.version_number,
      'status', p_version.status,
      'serviceCode', p_version.service_code,
      'serviceName', p_version.service_name,
      'priceVersionId', p_version.price_version_id,
      'paymentModel', p_version.payment_model,
      'scope', p_version.scope_text,
      'exclusions', p_version.exclusions_text,
      'successDefinition', p_version.success_definition,
      'standardAmountMinor', p_version.standard_amount_minor,
      'discountPolicyId', p_version.discount_policy_id,
      'discountBps', p_version.discount_bps,
      'discountAmountMinor', p_version.discount_amount_minor,
      'quotedSubtotalMinor', p_version.quoted_subtotal_minor,
      'taxBehaviour', p_version.tax_behaviour,
      'taxJurisdiction', p_version.tax_jurisdiction,
      'taxRateBps', p_version.tax_rate_bps,
      'taxCode', p_version.tax_code,
      'taxAmountMinor', p_version.tax_amount_minor,
      'totalAmountMinor', p_version.total_amount_minor,
      'currency', p_version.currency,
      'validUntil', p_version.valid_until,
      'paymentTiming', p_version.payment_timing_text,
      'termsReference', p_version.terms_reference,
      'offeredAt', p_version.offered_at,
      'discountSnapshot', CASE WHEN snap.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', snap.id, 'result', snap.qualification_result, 'reasonCode', snap.reason_code,
        'policyId', snap.policy_id, 'coverageBasis', snap.coverage_basis, 'coverageStatus', snap.coverage_status,
        'paidVsIncluded', snap.paid_vs_included, 'issuePredatesPaidCoverage', snap.issue_predates_paid_coverage,
        'futureCoverageId', snap.future_coverage_id, 'source', snap.source
      ) END
    ),
    'action', CASE WHEN action.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', action.id, 'status', action.status, 'expiresAt', action.expires_at, 'kind', action.kind
    ) END,
    'acceptedAt', acc.accepted_at,
    'orderId', ord.id,
    'orderRef', ord.public_ref
  );
END; $$;

CREATE FUNCTION public.admin_catalogue_list_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'serviceCode', p.service_code, 'displayName', p.display_name, 'amountMinor', p.amount_minor,
    'currency', p.currency, 'paymentModel', p.payment_model, 'billingCadence', p.billing_cadence,
    'billingUnit', p.billing_unit, 'effectiveFrom', p.effective_from, 'effectiveTo', p.effective_to,
    'status', p.status, 'taxBehaviour', p.tax_behaviour, 'taxJurisdiction', p.tax_jurisdiction,
    'taxRateBps', p.tax_rate_bps, 'taxCode', p.tax_code, 'createdAt', p.created_at, 'approvedAt', p.approved_at,
    'retiredAt', p.retired_at, 'version', p.record_version, 'seedKey', p.seed_key
  ) ORDER BY p.service_code, p.effective_from DESC, p.created_at DESC), '[]')
  INTO items FROM public.price_versions p;
  RETURN jsonb_build_object('prices', items);
END; $$;

CREATE FUNCTION public.admin_quote_list_v1(p_token text, p_status text DEFAULT NULL, p_q text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb; q text;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('DRAFT','OFFERED','ACCEPTED','DECLINED','EXPIRED','SUPERSEDED','CANCELLED') THEN
    RAISE EXCEPTION 'Invalid quote filter';
  END IF;
  q := nullif(btrim(coalesce(p_q, '')), '');
  IF q IS NOT NULL AND char_length(q) > 80 THEN RAISE EXCEPTION 'Invalid quote filter'; END IF;
  SELECT coalesce(jsonb_agg(admin_private.quote_json_v1(row.quote, row.version) ORDER BY row.quote.created_at DESC), '[]')
  INTO items
  FROM (
    SELECT qu AS quote, qv AS version
    FROM public.quotes qu
    JOIN public.quote_versions qv ON qv.id = qu.current_version_id
    WHERE (p_status IS NULL OR qu.status = p_status)
      AND (q IS NULL OR qu.public_ref ILIKE ('%' || q || '%') OR qv.service_name ILIKE ('%' || q || '%'))
    ORDER BY qu.created_at DESC
    LIMIT 100
  ) row;
  RETURN jsonb_build_object('quotes', items);
END; $$;

CREATE FUNCTION public.admin_quote_detail_v1(p_token text, p_quote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE qu public.quotes; qv public.quote_versions; versions jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO qu FROM public.quotes WHERE id = p_quote;
  IF qu.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = qu.current_version_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'versionNumber', v.version_number, 'status', v.status, 'totalAmountMinor', v.total_amount_minor,
    'createdAt', v.created_at, 'offeredAt', v.offered_at
  ) ORDER BY v.version_number), '[]') INTO versions FROM public.quote_versions v WHERE v.quote_id = qu.id;
  RETURN admin_private.quote_json_v1(qu, qv) || jsonb_build_object('versions', versions);
END; $$;

CREATE FUNCTION public.admin_order_list_v1(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'publicRef', o.public_ref, 'quoteId', o.quote_id, 'quoteVersionId', o.quote_version_id,
    'customerId', o.customer_id, 'businessId', o.business_id, 'locationId', o.location_id, 'caseId', o.case_id,
    'monitoringRequestId', o.monitoring_request_id, 'serviceCode', o.service_code, 'amountMinor', o.amount_minor,
    'currency', o.currency, 'paymentModel', o.payment_model, 'taxBehaviour', o.tax_behaviour,
    'taxAmountMinor', o.tax_amount_minor, 'state', o.state, 'acceptedAt', o.accepted_at,
    'quoteRef', q.public_ref, 'customerName', c.full_name, 'businessName', b.display_name,
    'caseReference', cs.public_ref
  ) ORDER BY o.created_at DESC), '[]')
  INTO items
  FROM public.service_orders o
  JOIN public.quotes q ON q.id = o.quote_id
  JOIN public.customers c ON c.id = o.customer_id
  JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.cases cs ON cs.id = o.case_id;
  RETURN jsonb_build_object('orders', items);
END; $$;

CREATE FUNCTION public.admin_order_detail_v1(p_token text, p_order uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE list jsonb; item jsonb;
BEGIN
  list := public.admin_order_list_v1(p_token);
  IF list IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO item FROM jsonb_array_elements(list->'orders') value WHERE value->>'id' = p_order::text;
  IF item IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  RETURN item;
END; $$;

CREATE FUNCTION public.admin_catalogue_command_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb; row public.price_versions;
  pred public.price_versions; service text; name text; amount integer; from_at timestamptz; to_at timestamptz;
  overlap_n integer;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN ('create_price_version','approve_price_version','retire_price_version')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 8192
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.catalogue_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached || jsonb_build_object('replay', true); END IF;
  IF p_operation = 'create_price_version' THEN
    service := data->>'serviceCode';
    name := btrim(coalesce(data->>'displayName', ''));
    BEGIN amount := (data->>'amountMinor')::integer; from_at := (data->>'effectiveFrom')::timestamptz;
      to_at := NULLIF(data->>'effectiveTo','')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF service IS NULL OR service NOT IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD')
      OR char_length(name) NOT BETWEEN 1 AND 120 OR amount IS NULL OR amount < 0 OR from_at IS NULL
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    INSERT INTO public.price_versions(
      service_code, display_name, amount_minor, currency, payment_model, billing_cadence, billing_unit,
      effective_from, effective_to, status, tax_behaviour, tax_jurisdiction, tax_rate_bps, tax_code, created_by, notes
    ) VALUES (
      service, name, amount, coalesce(data->>'currency','GBP'),
      CASE service WHEN 'RELAUNCH_GUARD' THEN 'RECURRING_MONTHLY' WHEN 'MANAGED_RELAUNCH' THEN 'SUCCESS_FEE' WHEN 'MANAGED_REVIEW' THEN 'SUCCESS_FEE' ELSE 'UPFRONT' END,
      CASE service WHEN 'RELAUNCH_GUARD' THEN 'MONTHLY' WHEN 'MANAGED_RELAUNCH' THEN 'ON_SUCCESS' WHEN 'MANAGED_REVIEW' THEN 'ON_SUCCESS' ELSE 'ONCE' END,
      CASE service WHEN 'RELAUNCH_GUARD' THEN 'LOCATION_MONTH' ELSE 'SERVICE' END,
      from_at, to_at, 'DRAFT', coalesce(data->>'taxBehaviour','UNCONFIRMED'),
      NULLIF(data->>'taxJurisdiction',''), NULLIF(data->>'taxRateBps','')::integer, NULLIF(data->>'taxCode',''),
      actor, NULLIF(data->>'notes','')
    ) RETURNING * INTO row;
    INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
    VALUES (row.id, actor, 'PRICE_DRAFTED', jsonb_build_object('serviceCode', row.service_code, 'amountMinor', row.amount_minor));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', row.id, p_request, 'price_version',
      'Draft price version created', jsonb_build_object('operation', p_operation, 'serviceCode', row.service_code));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version);
  ELSIF p_operation = 'approve_price_version' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    SELECT * INTO row FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid FOR UPDATE;
    IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF p_version IS DISTINCT FROM row.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF row.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT count(*) INTO overlap_n
    FROM public.price_versions p
    WHERE p.id IS DISTINCT FROM row.id
      AND p.service_code = row.service_code
      AND p.status = 'APPROVED'
      AND tstzrange(p.effective_from, p.effective_to, '[)') && tstzrange(row.effective_from, row.effective_to, '[)');
    IF overlap_n > 1 THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF overlap_n = 1 THEN
      SELECT * INTO pred
      FROM public.price_versions p
      WHERE p.id IS DISTINCT FROM row.id
        AND p.service_code = row.service_code
        AND p.status = 'APPROVED'
        AND tstzrange(p.effective_from, p.effective_to, '[)') && tstzrange(row.effective_from, row.effective_to, '[)')
      FOR UPDATE;
      IF pred.id IS NULL
        OR pred.effective_from >= row.effective_from
        OR (pred.effective_to IS NOT NULL AND pred.effective_to <= row.effective_from)
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      PERFORM set_config('admin_private.price_rollover', pred.id::text, true);
      UPDATE public.price_versions SET effective_to = row.effective_from WHERE id = pred.id;
      INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
      VALUES (pred.id, actor, 'PRICE_SCHEDULED_END', jsonb_build_object('successorId', row.id, 'effectiveTo', row.effective_from));
    END IF;
    UPDATE public.price_versions SET status = 'APPROVED', approved_at = now(), approved_by = actor
      WHERE id = row.id RETURNING * INTO row;
    INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
    VALUES (row.id, actor, 'PRICE_APPROVED', jsonb_build_object('serviceCode', row.service_code, 'amountMinor', row.amount_minor));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', row.id, p_request, 'price_version',
      'Price version approved', jsonb_build_object('operation', p_operation, 'serviceCode', row.service_code, 'rolledOverFrom', pred.id));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version);
  ELSE
    SELECT * INTO row FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid FOR UPDATE;
    IF row.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF p_version IS DISTINCT FROM row.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF row.status <> 'APPROVED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.price_versions
      SET status = 'RETIRED', retired_at = now(), retired_by = actor, effective_to = coalesce(effective_to, now())
      WHERE id = row.id RETURNING * INTO row;
    INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
    VALUES (row.id, actor, 'PRICE_RETIRED', jsonb_build_object('serviceCode', row.service_code));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', row.id, p_request, 'price_version',
      'Price version retired', jsonb_build_object('operation', p_operation, 'serviceCode', row.service_code));
    result := jsonb_build_object('status', 'success', 'id', row.id, 'version', row.record_version);
  END IF;
  INSERT INTO admin_private.catalogue_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION admin_private.revoke_quote_actions_v1(p_version uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions;
BEGIN
  FOR a IN
    SELECT * FROM public.customer_actions
    WHERE quote_version_id = p_version AND kind = 'QUOTE_ACCEPTANCE' AND status = 'OPEN'
    FOR UPDATE
  LOOP
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'SYSTEM', NULL, 'ACTION_REVOKED', jsonb_build_object('reason', left(p_reason, 200), 'kind', a.kind));
    DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
    DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
  END LOOP;
END; $$;

CREATE FUNCTION admin_private.prepare_quote_acceptance_action_v1(p_version uuid)
RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions;
BEGIN
  SELECT * INTO a FROM public.customer_actions
    WHERE quote_version_id = p_version AND kind = 'QUOTE_ACCEPTANCE' AND status = 'OPEN'
    FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'clear'; END IF;
  IF a.expires_at > now() THEN RETURN 'exists'; END IF;
  UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (
    a.id, a.case_id, 'SYSTEM', NULL, 'ACTION_REVOKED',
    jsonb_build_object('reason', 'The previous quote-acceptance capability expired.', 'source', 'ACTION_EXPIRED', 'kind', a.kind)
  );
  DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
  DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
  RETURN 'expired';
END; $$;

CREATE FUNCTION admin_private.build_quote_version_v1(
  p_quote public.quotes, p_actor uuid, p_service text, p_price public.price_versions, p_snap public.quote_discount_snapshots,
  p_scope text, p_exclusions text, p_success text, p_valid timestamptz, p_tax_behaviour text, p_tax_jurisdiction text,
  p_tax_rate integer, p_tax_code text
) RETURNS public.quote_versions LANGUAGE plpgsql SET search_path='' AS $$
DECLARE version_no integer; discount integer; subtotal integer; tax integer; total integer; policy text; qv public.quote_versions;
BEGIN
  SELECT coalesce(max(version_number), 0) + 1 INTO version_no FROM public.quote_versions WHERE quote_id = p_quote.id;
  IF p_snap.qualification_result = 'QUALIFIED' THEN
    policy := 'PAID_GUARD_MANAGED_20';
    discount := p_snap.discount_amount_minor;
  ELSE
    policy := 'NONE';
    discount := 0;
  END IF;
  subtotal := p_price.amount_minor - discount;
  tax := admin_private.money_tax_minor_v1(subtotal, p_tax_behaviour, p_tax_rate);
  total := admin_private.money_total_minor_v1(subtotal, p_tax_behaviour, tax);
  INSERT INTO public.quote_versions(
    quote_id, version_number, status, customer_id, business_id, location_id, case_id, monitoring_request_id,
    service_code, price_version_id, service_name, payment_model, scope_text, exclusions_text, success_definition,
    standard_amount_minor, discount_policy_id, discount_bps, discount_amount_minor, quoted_subtotal_minor,
    tax_behaviour, tax_jurisdiction, tax_rate_bps, tax_code, tax_amount_minor, total_amount_minor, currency,
    discount_snapshot_id, valid_until, payment_timing_text, terms_reference, created_by
  ) VALUES (
    p_quote.id, version_no, 'DRAFT', p_quote.customer_id, p_quote.business_id, p_quote.location_id, p_quote.case_id,
    p_quote.monitoring_request_id, p_service, p_price.id, p_price.display_name, p_price.payment_model, p_scope, p_exclusions,
    p_success, p_price.amount_minor, policy, CASE WHEN policy = 'NONE' THEN 0 ELSE 2000 END, discount, subtotal,
    p_tax_behaviour, p_tax_jurisdiction, p_tax_rate, p_tax_code, tax, total, p_price.currency, p_snap.id, p_valid,
    admin_private.payment_timing_text_v1(p_price.payment_model),
    'Service terms as published at quote time. This quote does not replace those terms and is not payment authorisation.',
    p_actor
  ) RETURNING * INTO qv;
  RETURN qv;
END; $$;

CREATE FUNCTION public.admin_quote_command_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb;
  qu public.quotes; qv public.quote_versions; price public.price_versions; snap public.quote_discount_snapshots;
  cs public.cases; mon public.monitoring_requests; c public.customers;
  service text; scope text; exclusions text; success text; valid_until timestamptz; expires timestamptz;
  secret text; action public.customer_actions; apply_discount boolean; v_tax_behaviour text; v_tax_rate integer;
  prep text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN (
      'create_draft','create_version','set_draft_tax','offer','supersede','cancel',
      'record_qualification','create_quote_acceptance_action','revoke_action'
    ) OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.quote_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;

  IF p_operation = 'record_qualification' THEN
    service := data->>'serviceCode';
    SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid;
    IF price.id IS NULL OR service IS NULL OR service NOT IN ('GUIDED_RELAUNCH','MANAGED_RELAUNCH','GUIDED_REVIEW','MANAGED_REVIEW','RELAUNCH_GUARD') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF coalesce(data->>'qualificationResult','') = 'QUALIFIED' THEN
      IF coalesce(data->>'coverageBasis','') <> 'PAID' OR coalesce(data->>'coverageStatus','') <> 'ACTIVE'
        OR coalesce(data->>'coverageType','') <> 'PAID_GUARD' OR coalesce(data->>'paidVsIncluded','') <> 'PAID'
        OR coalesce(data->>'issuePredatesPaidCoverage','') <> 'false'
        OR service NOT IN ('MANAGED_RELAUNCH','MANAGED_REVIEW')
        OR NULLIF(data->>'locationId','')::uuid IS NULL
      THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      INSERT INTO public.quote_discount_snapshots(
        location_id, coverage_basis, coverage_status, coverage_type, future_coverage_id, paid_vs_included,
        issue_observed_at, issue_predates_paid_coverage, service_code, price_version_id, policy_id, discount_bps,
        qualification_result, reason_code, standard_amount_minor, discount_amount_minor, discounted_subtotal_minor,
        recorded_by, source, evidence_notes, valid_until
      ) VALUES (
        (data->>'locationId')::uuid, 'PAID', 'ACTIVE', 'PAID_GUARD', NULLIF(data->>'futureCoverageId','')::uuid, 'PAID',
        NULLIF(data->>'issueObservedAt','')::timestamptz, false, service, price.id, 'PAID_GUARD_MANAGED_20', 2000,
        'QUALIFIED', 'QUALIFIED', price.amount_minor,
        admin_private.money_discount_minor_v1(price.amount_minor, 2000),
        price.amount_minor - admin_private.money_discount_minor_v1(price.amount_minor, 2000),
        actor, 'ADMIN_RECORDED', NULLIF(left(btrim(coalesce(data->>'evidenceNotes','')), 2000), ''),
        NULLIF(data->>'validUntil','')::timestamptz
      ) RETURNING * INTO snap;
    ELSE
      INSERT INTO public.quote_discount_snapshots(
        location_id, coverage_basis, coverage_status, coverage_type, paid_vs_included, issue_observed_at,
        issue_predates_paid_coverage, service_code, price_version_id, policy_id, discount_bps, qualification_result,
        reason_code, standard_amount_minor, discount_amount_minor, discounted_subtotal_minor, recorded_by, source, evidence_notes
      ) VALUES (
        NULLIF(data->>'locationId','')::uuid, coalesce(NULLIF(data->>'coverageBasis',''),'NONE'),
        coalesce(NULLIF(data->>'coverageStatus',''),'UNKNOWN'), coalesce(NULLIF(data->>'coverageType',''),'NONE'),
        coalesce(NULLIF(data->>'paidVsIncluded',''),'UNPROVEN'), NULLIF(data->>'issueObservedAt','')::timestamptz,
        coalesce((data->>'issuePredatesPaidCoverage')::boolean, true), service, price.id, 'NONE', 0, 'NOT_QUALIFIED',
        coalesce(NULLIF(data->>'reasonCode',''),'NO_AUTHORITATIVE_COVERAGE'), price.amount_minor, 0, price.amount_minor,
        actor, 'ADMIN_RECORDED', NULLIF(left(btrim(coalesce(data->>'evidenceNotes','')), 2000), '')
      ) RETURNING * INTO snap;
    END IF;
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', snap.id, p_request, 'discount_snapshot',
      'Guard discount qualification recorded', jsonb_build_object('result', snap.qualification_result, 'reasonCode', snap.reason_code));
    result := jsonb_build_object('status', 'success', 'id', snap.id, 'result', snap.qualification_result, 'reasonCode', snap.reason_code);
    INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  IF p_operation = 'create_draft' THEN
    service := data->>'serviceCode';
    scope := btrim(coalesce(data->>'scope', ''));
    exclusions := btrim(coalesce(data->>'exclusions', ''));
    BEGIN valid_until := (data->>'validUntil')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF service IS NULL OR char_length(scope) NOT BETWEEN 10 AND 5000 OR char_length(exclusions) NOT BETWEEN 10 AND 5000
      OR valid_until IS NULL OR valid_until <= now() THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO c FROM public.customers WHERE id = NULLIF(data->>'customerId','')::uuid;
    IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NULLIF(data->>'caseId','')::uuid;
    SELECT * INTO mon FROM public.monitoring_requests WHERE id = NULLIF(data->>'monitoringRequestId','')::uuid;
    IF NOT admin_private.quote_service_compatible_v1(cs, service, mon, NULLIF(data->>'locationId','')::uuid) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF cs.id IS NOT NULL AND (cs.customer_id IS DISTINCT FROM c.id OR cs.business_id IS DISTINCT FROM NULLIF(data->>'businessId','')::uuid) THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(data->>'priceVersionId','')::uuid;
    IF price.id IS NULL OR price.service_code <> service OR price.status <> 'APPROVED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    apply_discount := coalesce((data->>'applyDiscount')::boolean, false);
    IF apply_discount THEN
      SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = NULLIF(data->>'qualificationId','')::uuid;
      IF NOT admin_private.qualified_discount_snapshot_v1(
        snap, service, price.id, coalesce(cs.location_id, NULLIF(data->>'locationId','')::uuid)
      ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    ELSE
      IF NULLIF(data->>'qualificationId','') IS NOT NULL THEN
        SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = NULLIF(data->>'qualificationId','')::uuid;
        IF snap.id IS NULL OR snap.qualification_result <> 'NOT_QUALIFIED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      ELSE
        snap := admin_private.fail_closed_discount_v1(actor, service, price, coalesce(cs.location_id, NULLIF(data->>'locationId','')::uuid), 'NO_AUTHORITATIVE_COVERAGE');
      END IF;
    END IF;
    success := nullif(btrim(coalesce(data->>'successDefinition', '')), '');
    IF success IS NULL THEN success := admin_private.success_definition_v1(service); END IF;
    v_tax_behaviour := coalesce(NULLIF(data->>'taxBehaviour',''), price.tax_behaviour);
    v_tax_rate := coalesce(NULLIF(data->>'taxRateBps','')::integer, price.tax_rate_bps);
    INSERT INTO public.quotes(public_ref, customer_id, business_id, location_id, case_id, monitoring_request_id, status, created_by)
    VALUES (
      admin_private.commerce_public_ref_v1('QT'), c.id, coalesce(cs.business_id, NULLIF(data->>'businessId','')::uuid),
      coalesce(cs.location_id, NULLIF(data->>'locationId','')::uuid), cs.id, mon.id, 'DRAFT', actor
    ) RETURNING * INTO qu;
    qv := admin_private.build_quote_version_v1(
      qu, actor, service, price, snap, scope, exclusions, success, valid_until, v_tax_behaviour,
      coalesce(NULLIF(data->>'taxJurisdiction',''), price.tax_jurisdiction), v_tax_rate, coalesce(NULLIF(data->>'taxCode',''), price.tax_code)
    );
    UPDATE public.quotes SET current_version_id = qv.id, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_DRAFTED', jsonb_build_object('serviceCode', service, 'totalAmountMinor', qv.total_amount_minor));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote draft created', jsonb_build_object('operation', p_operation, 'quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version, 'publicRef', qu.public_ref);
    INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  SELECT * INTO qu FROM public.quotes WHERE id = NULLIF(data->>'quoteId','')::uuid FOR UPDATE;
  IF qu.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_operation NOT IN ('create_quote_acceptance_action','revoke_action') AND p_version IS DISTINCT FROM qu.record_version THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = qu.current_version_id FOR UPDATE;

  IF p_operation = 'create_version' THEN
    IF qu.status = 'ACCEPTED' OR qv.status = 'ACCEPTED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    service := coalesce(data->>'serviceCode', qv.service_code);
    scope := btrim(coalesce(NULLIF(data->>'scope',''), qv.scope_text));
    exclusions := btrim(coalesce(NULLIF(data->>'exclusions',''), qv.exclusions_text));
    BEGIN valid_until := coalesce(NULLIF(data->>'validUntil','')::timestamptz, qv.valid_until); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF valid_until IS NULL OR valid_until <= now() THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO price FROM public.price_versions WHERE id = coalesce(NULLIF(data->>'priceVersionId','')::uuid, qv.price_version_id);
    SELECT * INTO cs FROM public.cases WHERE id = qu.case_id;
    SELECT * INTO mon FROM public.monitoring_requests WHERE id = qu.monitoring_request_id;
    IF NOT admin_private.quote_service_compatible_v1(cs, service, mon, qu.location_id) OR price.service_code <> service OR price.status <> 'APPROVED' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    apply_discount := coalesce((data->>'applyDiscount')::boolean, false);
    IF apply_discount THEN
      SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = NULLIF(data->>'qualificationId','')::uuid;
      IF NOT admin_private.qualified_discount_snapshot_v1(snap, service, price.id, qu.location_id) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
    ELSE
      snap := admin_private.fail_closed_discount_v1(actor, service, price, qu.location_id, 'NO_AUTHORITATIVE_COVERAGE');
    END IF;
    qv := admin_private.build_quote_version_v1(
      qu, actor, service, price, snap, scope, exclusions,
      coalesce(nullif(btrim(coalesce(data->>'successDefinition','')), ''), admin_private.success_definition_v1(service)),
      valid_until, coalesce(NULLIF(data->>'taxBehaviour',''), price.tax_behaviour),
      coalesce(NULLIF(data->>'taxJurisdiction',''), price.tax_jurisdiction),
      coalesce(NULLIF(data->>'taxRateBps','')::integer, price.tax_rate_bps),
      coalesce(NULLIF(data->>'taxCode',''), price.tax_code)
    );
    UPDATE public.quotes SET record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_VERSION_CREATED', jsonb_build_object('versionNumber', qv.version_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote version created', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version);
  ELSIF p_operation = 'set_draft_tax' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = coalesce(NULLIF(data->>'quoteVersionId','')::uuid, qu.current_version_id) FOR UPDATE;
    IF qv.quote_id IS DISTINCT FROM qu.id OR qv.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    v_tax_behaviour := data->>'taxBehaviour';
    v_tax_rate := NULLIF(data->>'taxRateBps','')::integer;
    IF v_tax_behaviour IS NULL OR v_tax_behaviour NOT IN ('UNCONFIRMED','INCLUSIVE','EXCLUSIVE','NOT_APPLICABLE') THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF v_tax_behaviour IN ('UNCONFIRMED','NOT_APPLICABLE') THEN v_tax_rate := NULL; END IF;
    IF v_tax_behaviour IN ('INCLUSIVE','EXCLUSIVE') AND v_tax_rate IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.quote_versions SET
      tax_behaviour = v_tax_behaviour,
      tax_jurisdiction = NULLIF(data->>'taxJurisdiction',''),
      tax_rate_bps = v_tax_rate,
      tax_code = NULLIF(data->>'taxCode',''),
      tax_amount_minor = admin_private.money_tax_minor_v1(quote_versions.quoted_subtotal_minor, v_tax_behaviour, v_tax_rate),
      total_amount_minor = admin_private.money_total_minor_v1(
        quote_versions.quoted_subtotal_minor, v_tax_behaviour,
        admin_private.money_tax_minor_v1(quote_versions.quoted_subtotal_minor, v_tax_behaviour, v_tax_rate)
      )
    WHERE id = qv.id RETURNING * INTO qv;
    UPDATE public.quotes SET record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'TAX_SET', jsonb_build_object('taxBehaviour', v_tax_behaviour));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Draft quote tax set', jsonb_build_object('taxBehaviour', v_tax_behaviour));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version);
  ELSIF p_operation = 'offer' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = coalesce(NULLIF(data->>'quoteVersionId','')::uuid, qu.current_version_id) FOR UPDATE;
    IF qv.quote_id IS DISTINCT FROM qu.id OR qv.status <> 'DRAFT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT admin_private.quote_version_offerable_v1(qv) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF qu.current_version_id IS DISTINCT FROM qv.id THEN
      UPDATE public.quote_versions SET status = 'SUPERSEDED' WHERE id = qu.current_version_id AND status = 'OFFERED';
      PERFORM admin_private.revoke_quote_actions_v1(qu.current_version_id, 'A replacement quote version was offered.');
    END IF;
    UPDATE public.quote_versions SET status = 'OFFERED', offered_at = now(), offered_by = actor WHERE id = qv.id RETURNING * INTO qv;
    UPDATE public.quotes SET status = 'OFFERED', current_version_id = qv.id, record_version = record_version + 1, updated_at = now()
      WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_OFFERED', jsonb_build_object('versionNumber', qv.version_number));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote offered', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'quoteVersionId', qv.id, 'version', qu.record_version);
  ELSIF p_operation = 'supersede' THEN
    IF qv.status <> 'OFFERED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.quote_versions SET status = 'SUPERSEDED' WHERE id = qv.id;
    PERFORM admin_private.revoke_quote_actions_v1(qv.id, 'This quote version was superseded.');
    UPDATE public.quotes SET status = 'SUPERSEDED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_SUPERSEDED', jsonb_build_object('quoteVersionId', qv.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote superseded', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'version', qu.record_version);
  ELSIF p_operation = 'cancel' THEN
    IF qu.status NOT IN ('DRAFT','OFFERED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.quote_versions SET status = 'CANCELLED' WHERE id = qv.id AND status IN ('DRAFT','OFFERED');
    PERFORM admin_private.revoke_quote_actions_v1(qv.id, 'This quote was cancelled.');
    UPDATE public.quotes SET status = 'CANCELLED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id RETURNING * INTO qu;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'QUOTE_CANCELLED', jsonb_build_object('quoteVersionId', qv.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote cancelled', jsonb_build_object('quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', qu.id, 'version', qu.record_version);
  ELSIF p_operation = 'create_quote_acceptance_action' THEN
    IF qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF qv.valid_until <= now() OR qv.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO c FROM public.customers WHERE id = qu.customer_id;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' OR expires IS NULL
      OR expires <= now() + interval '15 minutes' OR expires > now() + interval '7 days'
      OR expires > qv.valid_until
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.contact_verified_v1(qu.customer_id, 'email') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = qu.customer_id AND m.business_id = qu.business_id AND m.status = 'verified'
    ) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    prep := admin_private.prepare_quote_acceptance_action_v1(qv.id);
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN
      INSERT INTO public.customer_actions(
        customer_id, business_id, location_id, case_id, quote_version_id, kind, secret_hash, expected_email_snapshot, expires_at, created_by
      ) VALUES (
        qu.customer_id, qu.business_id, qu.location_id, qu.case_id, qv.id, 'QUOTE_ACCEPTANCE', secret, c.email, expires, actor
      ) RETURNING * INTO action;
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'denied');
    END;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', 'QUOTE_ACCEPTANCE', 'quoteVersionId', qv.id));
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'ADMIN', actor, 'ACTION_ISSUED', jsonb_build_object('actionId', action.id));
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote acceptance action created', jsonb_build_object('actionId', action.id, 'quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'id', action.id, 'expiresAt', action.expires_at, 'quoteVersionId', qv.id);
  ELSE
    SELECT * INTO action FROM public.customer_actions WHERE id = NULLIF(data->>'actionId','')::uuid FOR UPDATE;
    IF action.id IS NULL OR action.kind <> 'QUOTE_ACCEPTANCE' OR action.status <> 'OPEN' THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    IF char_length(btrim(coalesce(data->>'reason',''))) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = action.id RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_REVOKED', jsonb_build_object('reason', left(data->>'reason', 200)));
    DELETE FROM admin_private.customer_action_challenges WHERE action_id = action.id;
    DELETE FROM admin_private.customer_action_sessions WHERE action_id = action.id;
    PERFORM admin_private.write_record_audit_v1(actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Quote acceptance action revoked', jsonb_build_object('actionId', action.id));
    result := jsonb_build_object('status', 'success', 'id', action.id, 'actionStatus', action.status);
  END IF;
  INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION admin_private.accept_quote_version_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE qv public.quote_versions; qu public.quotes; acc public.quote_acceptances; ord public.service_orders;
  state text; monitoring_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_action.quote_version_id::text, 1));
  SELECT * INTO acc FROM public.quote_acceptances WHERE quote_version_id = p_action.quote_version_id;
  SELECT * INTO ord FROM public.service_orders WHERE quote_version_id = p_action.quote_version_id;
  IF acc.id IS NOT NULL AND ord.id IS NOT NULL THEN
    IF p_action.status = 'OPEN' THEN
      UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'actionStatus', 'COMPLETED', 'acceptanceId', acc.id, 'orderId', ord.id, 'orderRef', ord.public_ref);
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id FOR UPDATE;
  SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
  IF qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' OR qv.valid_until <= now() THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF qv.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  INSERT INTO public.quote_acceptances(
    quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
    total_amount_minor, currency, tax_behaviour, tax_amount_minor
  ) VALUES (
    qu.id, qv.id, p_action.id, p_actor, p_action.expected_email_snapshot,
    qv.total_amount_minor, qv.currency, qv.tax_behaviour, qv.tax_amount_minor
  ) RETURNING * INTO acc;
  UPDATE public.quote_versions SET status = 'ACCEPTED' WHERE id = qv.id;
  UPDATE public.quotes SET status = 'ACCEPTED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id;
  state := CASE qv.payment_model
    WHEN 'UPFRONT' THEN 'ACCEPTED_AWAITING_PAYMENT'
    WHEN 'SUCCESS_FEE' THEN 'ACCEPTED_SUCCESS_FEE'
    ELSE 'ACCEPTED_RECURRING'
  END;
  INSERT INTO public.service_orders(
    public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
    monitoring_request_id, service_code, amount_minor, currency, payment_model, tax_behaviour, tax_rate_bps,
    tax_amount_minor, tax_code, tax_jurisdiction, state, accepted_at
  ) VALUES (
    admin_private.commerce_public_ref_v1('SO'), qu.id, qv.id, acc.id, qv.customer_id, qv.business_id, qv.location_id, qv.case_id,
    qv.monitoring_request_id, qv.service_code, qv.total_amount_minor, qv.currency, qv.payment_model, qv.tax_behaviour,
    qv.tax_rate_bps, qv.tax_amount_minor, qv.tax_code, qv.tax_jurisdiction, state, acc.accepted_at
  ) RETURNING * INTO ord;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id;
  INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
  VALUES (qu.id, qv.id, 'CUSTOMER', p_actor, 'QUOTE_ACCEPTED', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id));
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (p_action.id, p_action.case_id, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
    'Customer accepted a quote', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id, 'quoteVersionId', qv.id));
  IF qv.monitoring_request_id IS NOT NULL THEN
    SELECT status INTO monitoring_status FROM public.monitoring_requests WHERE id = qv.monitoring_request_id;
    IF monitoring_status IS DISTINCT FROM monitoring_status THEN NULL; END IF;
  END IF;
  RETURN jsonb_build_object(
    'status', 'success', 'actionStatus', 'COMPLETED', 'acceptanceId', acc.id, 'orderId', ord.id, 'orderRef', ord.public_ref,
    'orderState', ord.state, 'paymentCreated', false, 'invoiceCreated', false, 'monitoringActivated', false
  );
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_session_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; cs public.cases; b public.businesses; loc public.locations;
  qv public.quote_versions; snap public.quote_discount_snapshots;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.id IS NULL OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  IF a.agreement_version_id IS NOT NULL THEN SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id; END IF;
  IF a.authorization_id IS NOT NULL THEN SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id; END IF;
  IF a.quote_version_id IS NOT NULL THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id;
    SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = qv.discount_snapshot_id;
  END IF;
  RETURN jsonb_build_object(
    'actionId', a.id,
    'kind', a.kind,
    'status', a.status,
    'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
    'caseReference', cs.public_ref,
    'businessName', b.display_name,
    'locationName', loc.location_name,
    'agreement', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v.id, 'kind', v.agreement_kind, 'title', v.title, 'body', v.body_text, 'scope', v.scope_text, 'versionNumber', v.version_number
    ) END,
    'authorization', CASE WHEN auth.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', auth.id, 'kind', auth.authorization_kind, 'status', auth.status
    ) END,
    'quote', CASE WHEN qv.id IS NULL THEN NULL ELSE jsonb_build_object(
      'versionId', qv.id, 'versionNumber', qv.version_number, 'serviceCode', qv.service_code, 'serviceName', qv.service_name,
      'paymentModel', qv.payment_model, 'scope', qv.scope_text, 'exclusions', qv.exclusions_text,
      'successDefinition', qv.success_definition, 'standardAmountMinor', qv.standard_amount_minor,
      'discountPolicyId', qv.discount_policy_id, 'discountBps', qv.discount_bps, 'discountAmountMinor', qv.discount_amount_minor,
      'discountReason', snap.reason_code, 'quotedSubtotalMinor', qv.quoted_subtotal_minor, 'taxBehaviour', qv.tax_behaviour,
      'taxRateBps', qv.tax_rate_bps, 'taxAmountMinor', qv.tax_amount_minor, 'taxCode', qv.tax_code,
      'taxJurisdiction', qv.tax_jurisdiction, 'totalAmountMinor', qv.total_amount_minor, 'currency', qv.currency,
      'validUntil', qv.valid_until, 'paymentTiming', qv.payment_timing_text, 'termsReference', qv.terms_reference
    ) END
  );
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_command_v1(p_token_hash text, p_request uuid, p_operation text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; fp text; cached jsonb; result jsonb; data jsonb;
  qv public.quote_versions; qu public.quotes;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('accept','decline','revoke')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object' OR octet_length(p_data::text) > 4096
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(sess.action_id, p_operation, data)::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_operation IN ('accept','decline') AND a.kind = 'QUOTE_ACCEPTANCE' THEN
    IF p_operation = 'accept' THEN
      IF data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
      IF a.status = 'COMPLETED' OR EXISTS (SELECT 1 FROM public.quote_acceptances WHERE quote_version_id = a.quote_version_id) THEN
        result := admin_private.accept_quote_version_v1(a, sess.auth_user_id, p_request);
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
        RETURN result;
      END IF;
      IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
      result := admin_private.accept_quote_version_v1(a, sess.auth_user_id, p_request);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id FOR UPDATE;
    SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
    UPDATE public.quote_versions SET status = 'DECLINED' WHERE id = qv.id;
    UPDATE public.quotes SET status = 'DECLINED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id;
    UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
    VALUES (qu.id, qv.id, 'CUSTOMER', sess.auth_user_id, 'QUOTE_DECLINED', jsonb_build_object('actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_DECLINED', jsonb_build_object('kind', 'QUOTE_ACCEPTANCE'));
    PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
      'Customer declined a quote', jsonb_build_object('actionId', a.id, 'quoteVersionId', qv.id));
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF p_operation IN ('accept','decline') THEN
    IF a.kind <> 'AGREEMENT_ACCEPTANCE' OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id;
    IF v.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF p_operation = 'decline' THEN
      UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
      INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
      VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_DECLINED', jsonb_build_object('kind', v.agreement_kind));
      PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer declined an agreement action',
        jsonb_build_object('operation', p_operation, 'actionId', a.id, 'agreementVersionId', v.id));
      result := jsonb_build_object('status', 'success', 'actionStatus', a.status);
      INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
      RETURN result;
    END IF;
    IF data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF EXISTS (
      SELECT 1 FROM public.authorization_records r
      WHERE r.case_id = a.case_id AND r.authorization_kind = v.agreement_kind AND r.status = 'ACTIVE'
    ) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    INSERT INTO public.authorization_records(
      agreement_version_id, case_id, customer_id, business_id, location_id, authorization_kind, status,
      accepted_by_auth_user_id, accepted_email_snapshot, accepted_at, source
    ) VALUES (
      v.id, a.case_id, a.customer_id, a.business_id, a.location_id, v.agreement_kind, 'ACTIVE',
      sess.auth_user_id, a.expected_email_snapshot, now(), 'CUSTOMER_OTP'
    ) RETURNING * INTO auth;
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
    INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
    VALUES (auth.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'AUTHORIZATION_ACCEPTED', jsonb_build_object('source', 'CUSTOMER_OTP', 'actionId', a.id));
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
    PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer accepted an agreement',
      jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id, 'kind', v.agreement_kind));
    result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationId', auth.id, 'authorizationStatus', auth.status);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
    RETURN result;
  END IF;
  IF a.kind <> 'AUTHORIZATION_REVOCATION' OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF data->'confirmed' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id FOR UPDATE;
  IF auth.id IS NULL OR auth.status <> 'ACTIVE' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  UPDATE public.authorization_records
    SET status = 'REVOKED', revoked_at = now(), revoked_by = sess.auth_user_id,
        revocation_reason = 'Customer revoked this authorisation through a verified action.'
    WHERE id = auth.id RETURNING * INTO auth;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = a.id RETURNING * INTO a;
  INSERT INTO public.authorization_events(authorization_id, case_id, actor_type, actor_id, event, details)
  VALUES (auth.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'AUTHORIZATION_REVOKED', jsonb_build_object('source', 'CUSTOMER_OTP', 'actionId', a.id));
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'CUSTOMER', sess.auth_user_id, 'ACTION_COMPLETED', jsonb_build_object('authorizationId', auth.id));
  PERFORM admin_private.write_record_audit_v1(sess.auth_user_id, 'AUTHORIZATION_CHANGED', 'success', a.case_id, p_request, 'case', 'Customer revoked an authorisation',
    jsonb_build_object('operation', p_operation, 'actionId', a.id, 'authorizationId', auth.id));
  result := jsonb_build_object('status', 'success', 'actionStatus', a.status, 'authorizationStatus', auth.status);
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
  RETURN result;
END; $$;

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED'
));
CREATE OR REPLACE FUNCTION public.admin_audit_list_v1(p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN (
      'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
      'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
      'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED'
    ))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

INSERT INTO public.price_versions(
  service_code, display_name, amount_minor, currency, payment_model, billing_cadence, billing_unit,
  effective_from, status, tax_behaviour, created_by, approved_at, approved_by, seed_key, notes
) VALUES
  ('GUIDED_RELAUNCH','Guided Relaunch',9900,'GBP','UPFRONT','ONCE','SERVICE','2026-01-01 00:00:00+00','APPROVED','UNCONFIRMED','00000000-0000-4000-8000-000000000013', now(), '00000000-0000-4000-8000-000000000013', 'SEED_GUIDED_RELAUNCH', 'Seeded from published lib/pricing.ts. Tax remains UNCONFIRMED until Finance configuration.'),
  ('MANAGED_RELAUNCH','Managed Relaunch',29900,'GBP','SUCCESS_FEE','ON_SUCCESS','SERVICE','2026-01-01 00:00:00+00','APPROVED','UNCONFIRMED','00000000-0000-4000-8000-000000000013', now(), '00000000-0000-4000-8000-000000000013', 'SEED_MANAGED_RELAUNCH', 'Seeded from published lib/pricing.ts. Tax remains UNCONFIRMED until Finance configuration.'),
  ('GUIDED_REVIEW','Guided Review',5900,'GBP','UPFRONT','ONCE','SERVICE','2026-01-01 00:00:00+00','APPROVED','UNCONFIRMED','00000000-0000-4000-8000-000000000013', now(), '00000000-0000-4000-8000-000000000013', 'SEED_GUIDED_REVIEW', 'Seeded from published lib/pricing.ts. Tax remains UNCONFIRMED until Finance configuration.'),
  ('MANAGED_REVIEW','Managed Review',14900,'GBP','SUCCESS_FEE','ON_SUCCESS','SERVICE','2026-01-01 00:00:00+00','APPROVED','UNCONFIRMED','00000000-0000-4000-8000-000000000013', now(), '00000000-0000-4000-8000-000000000013', 'SEED_MANAGED_REVIEW', 'Seeded from published lib/pricing.ts. Tax remains UNCONFIRMED until Finance configuration.'),
  ('RELAUNCH_GUARD','Relaunch Guard',999,'GBP','RECURRING_MONTHLY','MONTHLY','LOCATION_MONTH','2026-01-01 00:00:00+00','APPROVED','UNCONFIRMED','00000000-0000-4000-8000-000000000013', now(), '00000000-0000-4000-8000-000000000013', 'SEED_RELAUNCH_GUARD', 'Seeded from published lib/pricing.ts. Tax remains UNCONFIRMED until Finance configuration.');

INSERT INTO public.price_version_events(price_version_id, actor_id, event, details)
SELECT id, created_by, 'PRICE_APPROVED', jsonb_build_object('seed', true, 'amountMinor', amount_minor, 'serviceCode', service_code)
FROM public.price_versions WHERE seed_key IS NOT NULL;

REVOKE ALL ON FUNCTION admin_private.money_discount_minor_v1(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.money_tax_minor_v1(integer, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.money_total_minor_v1(integer, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commerce_public_ref_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.payment_timing_text_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.success_definition_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.quote_service_compatible_v1(public.cases, text, public.monitoring_requests, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.price_version_current_v1(text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.prevent_price_overlap_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_price_version_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.reject_discount_snapshot_mutation_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_quote_version_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.reject_quote_acceptance_mutation_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_service_order_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.reject_quote_event_change_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.validate_quote_version_totals_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.validate_discount_snapshot_totals_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_customer_action_scope_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.validate_customer_action_scope_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_action_eligible_v1(public.customer_actions) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.catalogue_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.quote_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.fail_closed_discount_v1(uuid, text, public.price_versions, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.qualified_discount_snapshot_v1(public.quote_discount_snapshots, text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.quote_version_offerable_v1(public.quote_versions) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.quote_json_v1(public.quotes, public.quote_versions) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.revoke_quote_actions_v1(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.prepare_quote_acceptance_action_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.build_quote_version_v1(public.quotes, uuid, text, public.price_versions, public.quote_discount_snapshots, text, text, text, timestamptz, text, text, integer, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.accept_quote_version_v1(public.customer_actions, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_catalogue_list_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_quote_list_v1(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_quote_detail_v1(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_order_list_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_order_detail_v1(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_catalogue_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_quote_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_session_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_catalogue_list_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_quote_list_v1(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_quote_detail_v1(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_order_list_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_order_detail_v1(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_catalogue_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_quote_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) TO service_role;

COMMIT;
