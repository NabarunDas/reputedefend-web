-- CUSTOMER-PLATFORM-02B commercial foundation.
-- Structure only. No seeds, no backfill, and no UPDATE of customers, cases,
-- Guard, Stripe, sessions, or contact verifications.
--
-- Ledger check on 1 November 2026: this environment has no Supabase access
-- token and no database URL, so it cannot open profilerelaunch-dev.
-- `supabase projects list` returns AccessTokenRequiredError. The committed
-- manifest still records 91 applied DEV migrations ending at 20261031160000.
-- This version is the next repository file. appliedToDev stays false.
-- Do not apply it to DEV or Production from this change.
--
-- Fail closed until later reviewed phases:
--   Paid evidence and billable ACTIVE wait for a writer that can bind one
--   invoice to this subscription, customer, period, and amount.
--   Open Telloya entitlements and open Guard allocations cannot exceed the
--   purchased item quantity. quantity_limit_snapshot stays the plan maximum.
--   Accepted subscription items, and components of approved or retired plans,
--   cannot be inserted, updated, or deleted.
--   Telloya LIVE is rejected. One non-ended provision occupies a location.
--   A coverage-derived Guard entitlement cannot be stored.
--   An approved plan with a null amount is a pilot contract. It can admit a
--   time-limited non-billable pilot and cannot be offered as billable.
--
-- Dependency order:
--   1. public.locations (id, business_id) unique index, so composite foreign
--      keys can prove a location belongs to the named business.
--   2. product_catalogue, plan_versions, plan_components.
--   3. commercial_subscriptions, commercial_subscription_items,
--      commercial_payment_evidence.
--   4. product_entitlements, service_provisions, bundle_guard_allocations.
--   5. onboarding_requests, admin_private.onboarding_invitations.
--   6. append-only events and admin_private.commercial_command_receipts.
--
-- Rollback while every new table is still empty, and before any later
-- migration references these objects:
--   Drop the new triggers, then admin_private.commercial_command_receipts,
--   admin_private.onboarding_invitations, the three event tables,
--   service_provisions, product_entitlements, bundle_guard_allocations,
--   commercial_payment_evidence, commercial_subscription_items,
--   commercial_subscriptions, onboarding_requests, plan_components,
--   plan_versions, and product_catalogue.
--   Drop the admin_private functions created in this file.
--   Drop index public.locations_id_business_uidx only after those foreign
--   keys are gone.
-- Do not use this rollback once a row has been accepted. Do not replay this
-- file. It is not a Production migration.

BEGIN;

CREATE UNIQUE INDEX locations_id_business_uidx
  ON public.locations (id, business_id);

CREATE TABLE public.product_catalogue (
  code text PRIMARY KEY CHECK (code IN ('TELLOYA', 'COMPLETE')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('STANDALONE', 'BUNDLE')),
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'RETIRED')),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_catalogue_kind_code CHECK (
    (code = 'TELLOYA' AND kind = 'STANDALONE')
    OR (code = 'COMPLETE' AND kind = 'BUNDLE')
  )
);

CREATE TABLE public.plan_versions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  product_code text NOT NULL REFERENCES public.product_catalogue (code) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'RETIRED')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  billing_cadence text NOT NULL CHECK (billing_cadence IN ('MONTH', 'YEAR', 'ONCE')),
  currency char(3) NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
  amount_minor integer CHECK (amount_minor IS NULL OR amount_minor > 0),
  tax_behaviour text CHECK (tax_behaviour IS NULL OR tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE')),
  terms_ref text CHECK (terms_ref IS NULL OR char_length(btrim(terms_ref)) BETWEEN 1 AND 200),
  approved_by uuid,
  approved_at timestamptz,
  retired_by uuid,
  retired_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_versions_product_version_unique UNIQUE (product_code, version_number),
  CONSTRAINT plan_versions_effective_window CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT plan_versions_tax_amount_shape CHECK (
    tax_behaviour IS NULL OR tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE')
  ),
  CONSTRAINT plan_versions_priced_shape CHECK (
    (amount_minor IS NULL AND tax_behaviour IS NULL)
    OR (amount_minor IS NOT NULL AND tax_behaviour IS NOT NULL)
  ),
  CONSTRAINT plan_versions_status_actor CHECK (
    (status = 'DRAFT' AND approved_at IS NULL AND approved_by IS NULL AND retired_at IS NULL AND retired_by IS NULL)
    OR (
      status = 'APPROVED'
      AND approved_at IS NOT NULL
      AND approved_by IS NOT NULL
      AND retired_at IS NULL
      AND retired_by IS NULL
      AND terms_ref IS NOT NULL
      AND char_length(btrim(terms_ref)) > 0
    )
    OR (
      status = 'RETIRED'
      AND approved_at IS NOT NULL
      AND approved_by IS NOT NULL
      AND retired_at IS NOT NULL
      AND retired_by IS NOT NULL
      AND terms_ref IS NOT NULL
      AND char_length(btrim(terms_ref)) > 0
    )
  )
);

CREATE TABLE public.plan_components (
  plan_version_id uuid NOT NULL REFERENCES public.plan_versions (id) ON DELETE RESTRICT,
  component_code text NOT NULL CHECK (component_code IN ('TELLOYA', 'GUARD')),
  quantity_limit integer NOT NULL CHECK (quantity_limit > 0),
  scope text NOT NULL CHECK (scope = 'LOCATION'),
  PRIMARY KEY (plan_version_id, component_code)
);

CREATE TABLE public.commercial_subscriptions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  public_ref text NOT NULL UNIQUE CHECK (public_ref ~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  plan_family text NOT NULL CHECK (plan_family = 'VOICE'),
  plan_version_id uuid NOT NULL REFERENCES public.plan_versions (id) ON DELETE RESTRICT,
  grant_kind text NOT NULL CHECK (grant_kind IN ('BILLABLE', 'NON_BILLABLE_PILOT')),
  state text NOT NULL CHECK (state IN (
    'DRAFT', 'OFFERED', 'ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE', 'PAST_DUE',
    'PAUSED', 'CANCEL_AT_PERIOD_END', 'CANCELED', 'ENDED'
  )),
  amount_minor integer,
  currency char(3) NOT NULL CHECK (currency = 'GBP'),
  tax_behaviour text CHECK (tax_behaviour IS NULL OR tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE')),
  tax_amount_minor integer,
  cadence_snapshot text NOT NULL CHECK (cadence_snapshot IN ('MONTH', 'YEAR', 'ONCE')),
  terms_ref text NOT NULL CHECK (char_length(btrim(terms_ref)) BETWEEN 1 AND 200),
  stripe_customer_id text CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text CHECK (stripe_subscription_id IS NULL OR stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  pilot_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  ended_at timestamptz,
  succeeds_subscription_id uuid REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_subscriptions_not_self CHECK (succeeds_subscription_id IS NULL OR succeeds_subscription_id <> id),
  CONSTRAINT commercial_subscriptions_grant_shape CHECK (
    (
      grant_kind = 'NON_BILLABLE_PILOT'
      AND amount_minor IS NULL
      AND pilot_ends_at IS NOT NULL
      AND tax_amount_minor IS NULL
    )
    OR (
      grant_kind = 'BILLABLE'
      AND amount_minor IS NOT NULL
      AND amount_minor > 0
      AND pilot_ends_at IS NULL
    )
  ),
  CONSTRAINT commercial_subscriptions_tax_shape CHECK (
    (tax_behaviour IS NULL AND tax_amount_minor IS NULL)
    OR (tax_behaviour = 'NOT_APPLICABLE' AND tax_amount_minor IS NULL)
    OR (tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE') AND tax_amount_minor IS NOT NULL AND tax_amount_minor >= 0)
  ),
  CONSTRAINT commercial_subscriptions_period_order CHECK (
    current_period_end IS NULL
    OR current_period_start IS NULL
    OR current_period_end > current_period_start
  ),
  CONSTRAINT commercial_subscriptions_cancel_facts CHECK (
    (state <> 'CANCELED' OR canceled_at IS NOT NULL)
    AND (state <> 'ENDED' OR ended_at IS NOT NULL)
    AND (state <> 'CANCEL_AT_PERIOD_END' OR cancel_at_period_end)
  )
);

CREATE UNIQUE INDEX commercial_subscriptions_one_occupying_business_idx
  ON public.commercial_subscriptions (business_id)
  WHERE state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END');

CREATE UNIQUE INDEX commercial_subscriptions_one_incoming_business_idx
  ON public.commercial_subscriptions (business_id)
  WHERE state IN ('OFFERED', 'ACCEPTED', 'PAYMENT_PENDING');

CREATE UNIQUE INDEX commercial_subscriptions_stripe_subscription_idx
  ON public.commercial_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE public.commercial_subscription_items (
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  component_code text NOT NULL CHECK (component_code IN ('TELLOYA', 'GUARD')),
  quantity integer NOT NULL CHECK (quantity >= 1),
  quantity_limit_snapshot integer NOT NULL CHECK (quantity_limit_snapshot > 0),
  stripe_subscription_item_id text CHECK (
    stripe_subscription_item_id IS NULL OR stripe_subscription_item_id ~ '^si_[A-Za-z0-9]+$'
  ),
  PRIMARY KEY (subscription_id, component_code),
  CONSTRAINT commercial_subscription_items_quantity_cap CHECK (quantity <= quantity_limit_snapshot)
);

CREATE UNIQUE INDEX commercial_subscription_items_stripe_item_idx
  ON public.commercial_subscription_items (stripe_subscription_item_id)
  WHERE stripe_subscription_item_id IS NOT NULL;

CREATE TABLE public.commercial_payment_evidence (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency = 'GBP'),
  provider_event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_payment_evidence_period CHECK (period_end > period_start),
  CONSTRAINT commercial_payment_evidence_event_unique UNIQUE (provider_event_id),
  CONSTRAINT commercial_payment_evidence_period_unique UNIQUE (subscription_id, period_end)
);

CREATE TABLE public.product_entitlements (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  component_code text NOT NULL CHECK (component_code IN ('TELLOYA', 'GUARD')),
  -- A coverage-derived source is intentionally not a value here. A later
  -- migration may add it only together with a guard_coverages foreign key for
  -- the same business and location. This phase cannot claim that eligibility.
  source_kind text NOT NULL CHECK (source_kind IN ('COMMERCIAL_SUBSCRIPTION', 'NON_BILLABLE_PILOT')),
  commercial_subscription_id uuid REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  guard_coverage_id uuid,
  state text NOT NULL CHECK (state IN ('PENDING', 'ELIGIBLE', 'REVOKED', 'EXPIRED')),
  eligible_from timestamptz,
  eligible_to timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_entitlements_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT,
  CONSTRAINT product_entitlements_coverage_absent CHECK (guard_coverage_id IS NULL),
  CONSTRAINT product_entitlements_source_shape CHECK (
    source_kind IN ('COMMERCIAL_SUBSCRIPTION', 'NON_BILLABLE_PILOT')
    AND commercial_subscription_id IS NOT NULL
    AND guard_coverage_id IS NULL
  ),
  CONSTRAINT product_entitlements_revocation CHECK (
    (state = 'REVOKED' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL AND char_length(btrim(revocation_reason)) BETWEEN 10 AND 2000)
    OR (state <> 'REVOKED' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  ),
  CONSTRAINT product_entitlements_window CHECK (eligible_to IS NULL OR eligible_from IS NULL OR eligible_to >= eligible_from)
);

CREATE UNIQUE INDEX product_entitlements_one_open_location_idx
  ON public.product_entitlements (business_id, location_id, component_code)
  WHERE state IN ('PENDING', 'ELIGIBLE');

CREATE TABLE public.service_provisions (
  entitlement_id uuid PRIMARY KEY REFERENCES public.product_entitlements (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN (
    'NOT_STARTED', 'PROFILE_REQUIRED', 'AGENT_REQUIRED', 'NUMBER_REQUIRED',
    'FORWARDING_REQUIRED', 'TEST_REQUIRED', 'AWAITING_CONFIRMATION',
    'READY_FOR_PROVIDER_VERIFICATION', 'LIVE', 'SUSPENDED', 'ENDED'
  )),
  profile_ready_at timestamptz,
  agent_configured_at timestamptz,
  number_allocated_at timestamptz,
  provider_binding_ref text,
  forwarding_instructed_at timestamptz,
  provider_test_call_ref text,
  provider_test_outcome text CHECK (provider_test_outcome IS NULL OR provider_test_outcome IN ('PASSED', 'FAILED')),
  agent_test_passed_at timestamptz,
  customer_confirmed_at timestamptz,
  live_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_provisions_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT,
  -- Provider fields stay available for a later verified command. No row in
  -- this phase may be LIVE, including a row that already carries those fields.
  CONSTRAINT service_provisions_live_closed CHECK (state <> 'LIVE'),
  CONSTRAINT service_provisions_suspension CHECK (
    (state = 'SUSPENDED' AND suspended_at IS NOT NULL AND suspension_reason IS NOT NULL AND char_length(btrim(suspension_reason)) BETWEEN 10 AND 2000)
    OR (state <> 'SUSPENDED' AND suspended_at IS NULL AND suspension_reason IS NULL)
  )
);

CREATE UNIQUE INDEX service_provisions_binding_idx
  ON public.service_provisions (provider_binding_ref)
  WHERE provider_binding_ref IS NOT NULL;

CREATE UNIQUE INDEX service_provisions_test_call_idx
  ON public.service_provisions (provider_test_call_ref)
  WHERE provider_test_call_ref IS NOT NULL;

CREATE UNIQUE INDEX service_provisions_one_non_ended_location_idx
  ON public.service_provisions (location_id)
  WHERE state <> 'ENDED';

CREATE TABLE public.bundle_guard_allocations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  component_code text NOT NULL DEFAULT 'GUARD' CHECK (component_code = 'GUARD'),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  location_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('RESERVED', 'PREVIEW', 'LAPSED', 'ENDED')),
  paid_through_at timestamptz,
  scheduled_cutover_at timestamptz,
  provider_operation_id uuid,
  effective_from timestamptz,
  effective_to timestamptz,
  standalone_guard_subscription_id uuid REFERENCES public.guard_subscriptions (id) ON DELETE RESTRICT,
  guard_coverage_id uuid,
  request_id uuid,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bundle_guard_allocations_item_fk
    FOREIGN KEY (subscription_id, component_code)
    REFERENCES public.commercial_subscription_items (subscription_id, component_code) ON DELETE RESTRICT,
  CONSTRAINT bundle_guard_allocations_location_business_fk
    FOREIGN KEY (location_id, business_id) REFERENCES public.locations (id, business_id) ON DELETE RESTRICT,
  CONSTRAINT bundle_guard_allocations_subscription_location_unique UNIQUE (subscription_id, location_id),
  CONSTRAINT bundle_guard_allocations_phase_isolation CHECK (
    guard_coverage_id IS NULL
    AND provider_operation_id IS NULL
    AND scheduled_cutover_at IS NULL
    AND paid_through_at IS NULL
  ),
  CONSTRAINT bundle_guard_allocations_preview_shape CHECK (
    (state = 'RESERVED' AND standalone_guard_subscription_id IS NULL)
    OR (state = 'PREVIEW' AND standalone_guard_subscription_id IS NOT NULL)
    OR state IN ('LAPSED', 'ENDED')
  ),
  CONSTRAINT bundle_guard_allocations_window CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
  )
);

CREATE UNIQUE INDEX bundle_guard_allocations_one_open_location_idx
  ON public.bundle_guard_allocations (location_id)
  WHERE state IN ('RESERVED', 'PREVIEW');

CREATE UNIQUE INDEX bundle_guard_allocations_request_idx
  ON public.bundle_guard_allocations (request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE public.onboarding_requests (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  enquiry_id uuid REFERENCES public.enquiries (id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid REFERENCES public.businesses (id) ON DELETE RESTRICT,
  email_snapshot text NOT NULL CHECK (
    email_snapshot = lower(email_snapshot)
    AND email_snapshot ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  product_code text NOT NULL REFERENCES public.product_catalogue (code) ON DELETE RESTRICT,
  plan_family text NOT NULL CHECK (plan_family = 'VOICE'),
  state text NOT NULL CHECK (state IN (
    'RECEIVED', 'IN_REVIEW', 'MAILBOX_REQUIRED', 'OFFERED', 'INVITED',
    'AWAITING_PAYMENT', 'PROVISIONING', 'READY', 'CLOSED', 'DECLINED'
  )),
  decline_reason text,
  commercial_subscription_id uuid REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_requests_decline_reason CHECK (
    (state = 'DECLINED' AND decline_reason IS NOT NULL AND char_length(btrim(decline_reason)) BETWEEN 10 AND 2000)
    OR (state <> 'DECLINED' AND decline_reason IS NULL)
  )
);

CREATE UNIQUE INDEX onboarding_requests_one_open_enquiry_idx
  ON public.onboarding_requests (enquiry_id)
  WHERE enquiry_id IS NOT NULL AND state NOT IN ('CLOSED', 'DECLINED');

CREATE UNIQUE INDEX onboarding_requests_one_open_business_family_idx
  ON public.onboarding_requests (business_id, plan_family)
  WHERE business_id IS NOT NULL AND state NOT IN ('CLOSED', 'DECLINED');

CREATE TABLE admin_private.onboarding_invitations (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests (id) ON DELETE RESTRICT,
  email_snapshot text NOT NULL,
  expires_at timestamptz NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  consumed_at timestamptz,
  send_count integer NOT NULL DEFAULT 0 CHECK (send_count = 0),
  mailbox_proved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_invitations_unused CHECK (consumed_at IS NULL AND mailbox_proved_at IS NULL),
  CONSTRAINT onboarding_invitations_expiry CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX onboarding_invitations_one_unconsumed_idx
  ON admin_private.onboarding_invitations (onboarding_request_id)
  WHERE consumed_at IS NULL;

CREATE TABLE public.commercial_subscription_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  actor_id uuid,
  request_id uuid,
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX commercial_subscription_events_request_idx
  ON public.commercial_subscription_events (subscription_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE public.entitlement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements (id) ON DELETE RESTRICT,
  actor_id uuid,
  request_id uuid,
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX entitlement_events_request_idx
  ON public.entitlement_events (entitlement_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE public.bundle_guard_allocation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  allocation_id uuid NOT NULL REFERENCES public.bundle_guard_allocations (id) ON DELETE RESTRICT,
  actor_id uuid,
  request_id uuid,
  from_state text,
  to_state text NOT NULL,
  reason text NOT NULL DEFAULT '',
  standalone_guard_subscription_id uuid,
  provider_operation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bundle_guard_allocation_events_no_provider CHECK (provider_operation_id IS NULL)
);

CREATE UNIQUE INDEX bundle_guard_allocation_events_request_idx
  ON public.bundle_guard_allocation_events (allocation_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE TABLE admin_private.commercial_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (char_length(fingerprint) BETWEEN 1 AND 200),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION admin_private.touch_commercial_row_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.reject_commercial_append_only_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'commercial audit rows are append-only';
END;
$$;

CREATE FUNCTION admin_private.prevent_plan_overlap_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  product text;
  component_count integer;
  telloya_count integer;
  guard_count integer;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('APPROVED', 'RETIRED')
    AND (
      NEW.product_code IS DISTINCT FROM OLD.product_code
      OR NEW.version_number IS DISTINCT FROM OLD.version_number
      OR NEW.billing_cadence IS DISTINCT FROM OLD.billing_cadence
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
      OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
      OR NEW.terms_ref IS DISTINCT FROM OLD.terms_ref
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    )
  THEN
    RAISE EXCEPTION 'approved plan financial fields are immutable';
  END IF;

  IF NEW.status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'APPROVED') THEN
    SELECT c.kind INTO product
    FROM public.product_catalogue c
    WHERE c.code = NEW.product_code;
    SELECT count(*) INTO component_count
    FROM public.plan_components component
    WHERE component.plan_version_id = NEW.id;
    SELECT count(*) INTO telloya_count
    FROM public.plan_components component
    WHERE component.plan_version_id = NEW.id AND component.component_code = 'TELLOYA';
    SELECT count(*) INTO guard_count
    FROM public.plan_components component
    WHERE component.plan_version_id = NEW.id AND component.component_code = 'GUARD';
    IF product = 'STANDALONE' AND (component_count <> 1 OR telloya_count <> 1) THEN
      RAISE EXCEPTION 'approved Telloya plan requires one Telloya location component';
    END IF;
    IF product = 'BUNDLE' AND (telloya_count <> 1 OR guard_count <> 1 OR component_count <> 2) THEN
      RAISE EXCEPTION 'approved Complete plan requires Telloya and Guard location components';
    END IF;
    IF NEW.terms_ref IS NULL OR char_length(btrim(NEW.terms_ref)) = 0 THEN
      RAISE EXCEPTION 'approved plan requires terms';
    END IF;
  END IF;

  IF NEW.status = 'APPROVED' AND EXISTS (
    SELECT 1
    FROM public.plan_versions existing
    WHERE existing.id IS DISTINCT FROM NEW.id
      AND existing.product_code = NEW.product_code
      AND existing.status = 'APPROVED'
      AND tstzrange(existing.effective_from, existing.effective_to, '[)')
        && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
  ) THEN
    RAISE EXCEPTION 'overlapping approved plan versions are not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.protect_plan_component_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  plan_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO plan_status FROM public.plan_versions WHERE id = OLD.plan_version_id;
    IF plan_status IN ('APPROVED', 'RETIRED') THEN
      RAISE EXCEPTION 'approved or retired plan components cannot be changed';
    END IF;
    RETURN OLD;
  END IF;
  SELECT status INTO plan_status FROM public.plan_versions WHERE id = NEW.plan_version_id;
  IF plan_status IN ('APPROVED', 'RETIRED') THEN
    RAISE EXCEPTION 'approved or retired plan components cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.guard_commercial_subscription_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  plan public.plan_versions;
  occupying uuid;
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
    IF OLD.state <> 'DRAFT' AND (
      NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
      OR NEW.tax_amount_minor IS DISTINCT FROM OLD.tax_amount_minor
      OR NEW.cadence_snapshot IS DISTINCT FROM OLD.cadence_snapshot
      OR NEW.terms_ref IS DISTINCT FROM OLD.terms_ref
      OR NEW.grant_kind IS DISTINCT FROM OLD.grant_kind
      OR NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id
      OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.plan_family IS DISTINCT FROM OLD.plan_family
      OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
    ) THEN
      RAISE EXCEPTION 'accepted commercial snapshots are immutable';
    END IF;
    IF OLD.current_period_end IS NOT NULL AND (
      NEW.current_period_end IS NULL OR NEW.current_period_end < OLD.current_period_end
    ) THEN
      RAISE EXCEPTION 'evidenced commercial period cannot be shortened';
    END IF;
  END IF;

  SELECT * INTO plan FROM public.plan_versions WHERE id = NEW.plan_version_id;
  IF NEW.state <> 'DRAFT' AND (
    TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND (OLD.state = 'DRAFT' OR NEW.plan_version_id IS DISTINCT FROM OLD.plan_version_id))
  ) THEN
    IF plan.status <> 'APPROVED' OR plan.terms_ref IS NULL OR char_length(btrim(plan.terms_ref)) = 0 THEN
      RAISE EXCEPTION 'unapproved plan cannot be offered';
    END IF;
    IF NEW.currency IS DISTINCT FROM plan.currency
      OR NEW.cadence_snapshot IS DISTINCT FROM plan.billing_cadence
      OR NEW.terms_ref IS DISTINCT FROM plan.terms_ref
    THEN
      RAISE EXCEPTION 'commercial snapshot must match the approved plan';
    END IF;
    IF NEW.grant_kind = 'BILLABLE' AND (plan.amount_minor IS NULL OR plan.tax_behaviour IS NULL) THEN
      RAISE EXCEPTION 'unpriced plan cannot be offered as billable';
    END IF;
    IF NEW.grant_kind = 'BILLABLE' AND (
      NEW.amount_minor IS DISTINCT FROM plan.amount_minor
      OR NEW.tax_behaviour IS DISTINCT FROM plan.tax_behaviour
    ) THEN
      RAISE EXCEPTION 'billable snapshot must match the approved plan';
    END IF;
    IF NEW.grant_kind = 'NON_BILLABLE_PILOT' AND (
      NEW.amount_minor IS NOT NULL
      OR NEW.tax_behaviour IS NOT NULL
      OR NEW.tax_amount_minor IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'non-billable pilot cannot carry a price';
    END IF;
  END IF;

  IF NEW.grant_kind = 'NON_BILLABLE_PILOT'
    AND NEW.state NOT IN ('DRAFT', 'CANCELED', 'ENDED')
    AND (NEW.pilot_ends_at IS NULL OR NEW.pilot_ends_at <= pg_catalog.now())
  THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'non-billable pilot requires a future end';
    ELSIF OLD.state IS DISTINCT FROM NEW.state OR OLD.pilot_ends_at IS DISTINCT FROM NEW.pilot_ends_at THEN
      RAISE EXCEPTION 'non-billable pilot requires a future end';
    END IF;
  END IF;

  IF NEW.state <> 'DRAFT' AND NOT EXISTS (
    SELECT 1
    FROM public.business_memberships membership
    WHERE membership.customer_id = NEW.customer_id
      AND membership.business_id = NEW.business_id
      AND membership.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'billing customer needs a verified membership before the subscription leaves draft';
  END IF;

  SELECT id INTO occupying
  FROM public.commercial_subscriptions existing
  WHERE existing.business_id = NEW.business_id
    AND existing.id IS DISTINCT FROM NEW.id
    AND existing.state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
  FOR UPDATE;

  IF NEW.state IN ('OFFERED', 'ACCEPTED', 'PAYMENT_PENDING') THEN
    IF occupying IS NOT NULL AND NEW.succeeds_subscription_id IS DISTINCT FROM occupying THEN
      RAISE EXCEPTION 'incoming subscription must succeed the occupying subscription';
    END IF;
    IF occupying IS NULL AND NEW.succeeds_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'succeeds_subscription_id requires an occupying subscription';
    END IF;
  END IF;

  IF NEW.succeeds_subscription_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.commercial_subscriptions predecessor
    WHERE predecessor.id = NEW.succeeds_subscription_id
      AND predecessor.business_id = NEW.business_id
      AND predecessor.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'replacement must stay on the same business';
  END IF;

  IF NEW.stripe_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.stripe_customer_maps mapped
    WHERE mapped.customer_id = NEW.customer_id
      AND mapped.stripe_customer_id = NEW.stripe_customer_id
  ) THEN
    RAISE EXCEPTION 'commercial stripe customer must match stripe_customer_maps';
  END IF;

  IF NEW.stripe_subscription_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.guard_subscriptions guard_row
    WHERE guard_row.stripe_subscription_id = NEW.stripe_subscription_id
  ) THEN
    RAISE EXCEPTION 'commercial stripe subscription must not reuse a Guard subscription';
  END IF;

  IF NEW.grant_kind = 'BILLABLE' AND NEW.state = 'ACTIVE' THEN
    RAISE EXCEPTION 'billable subscription cannot become active until trusted payment evidence exists';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.guard_commercial_subscription_item_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent public.commercial_subscriptions;
  plan_limit integer;
  open_entitlements integer;
  open_allocations integer;
  row_subscription uuid;
  row_component text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_subscription := OLD.subscription_id;
    row_component := OLD.component_code;
  ELSE
    row_subscription := NEW.subscription_id;
    row_component := NEW.component_code;
  END IF;

  SELECT * INTO parent
  FROM public.commercial_subscriptions
  WHERE id = row_subscription
  FOR UPDATE;

  IF TG_OP = 'DELETE' THEN
    IF parent.id IS NULL OR parent.state IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'accepted commercial subscription items cannot be removed';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.product_entitlements entitlement
      WHERE entitlement.commercial_subscription_id = row_subscription
        AND entitlement.component_code = row_component
        AND entitlement.state IN ('PENDING', 'ELIGIBLE')
    ) OR (
      row_component = 'GUARD' AND EXISTS (
        SELECT 1
        FROM public.bundle_guard_allocations allocation
        WHERE allocation.subscription_id = row_subscription
          AND allocation.state IN ('RESERVED', 'PREVIEW')
      )
    ) THEN
      RAISE EXCEPTION 'subscription item cannot be removed while locations are open';
    END IF;
    RETURN OLD;
  END IF;

  IF parent.state IS DISTINCT FROM 'DRAFT' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'accepted commercial subscription items cannot be added';
  END IF;
  IF parent.state IS DISTINCT FROM 'DRAFT' AND TG_OP = 'UPDATE' AND (
    NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.quantity_limit_snapshot IS DISTINCT FROM OLD.quantity_limit_snapshot
    OR NEW.component_code IS DISTINCT FROM OLD.component_code
    OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
    OR NEW.stripe_subscription_item_id IS DISTINCT FROM OLD.stripe_subscription_item_id
  ) THEN
    RAISE EXCEPTION 'accepted commercial snapshots are immutable';
  END IF;

  SELECT component.quantity_limit INTO plan_limit
  FROM public.plan_components component
  WHERE component.plan_version_id = parent.plan_version_id
    AND component.component_code = NEW.component_code;
  IF plan_limit IS NULL THEN
    RAISE EXCEPTION 'subscription item must exist on the pinned plan';
  END IF;
  IF NEW.quantity_limit_snapshot IS DISTINCT FROM plan_limit THEN
    RAISE EXCEPTION 'quantity limit snapshot must match the pinned plan';
  END IF;
  IF NEW.component_code = 'GUARD' AND NOT EXISTS (
    SELECT 1 FROM public.plan_versions plan
    JOIN public.product_catalogue catalogue ON catalogue.code = plan.product_code
    WHERE plan.id = parent.plan_version_id AND catalogue.code = 'COMPLETE'
  ) THEN
    RAISE EXCEPTION 'Guard item belongs on a Complete plan';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    SELECT count(*) INTO open_entitlements
    FROM public.product_entitlements entitlement
    WHERE entitlement.commercial_subscription_id = NEW.subscription_id
      AND entitlement.component_code = NEW.component_code
      AND entitlement.state IN ('PENDING', 'ELIGIBLE');
    SELECT count(*) INTO open_allocations
    FROM public.bundle_guard_allocations allocation
    WHERE allocation.subscription_id = NEW.subscription_id
      AND allocation.component_code = NEW.component_code
      AND allocation.state IN ('RESERVED', 'PREVIEW');
    IF open_entitlements > NEW.quantity OR open_allocations > NEW.quantity THEN
      RAISE EXCEPTION 'purchased quantity cannot drop below open locations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.guard_commercial_payment_evidence_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent public.commercial_subscriptions;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'payment evidence is immutable';
  END IF;
  SELECT * INTO parent FROM public.commercial_subscriptions WHERE id = NEW.subscription_id;
  IF parent.grant_kind IS DISTINCT FROM 'BILLABLE' THEN
    RAISE EXCEPTION 'pilot subscription cannot store payment evidence';
  END IF;
  IF NEW.amount_minor IS DISTINCT FROM parent.amount_minor OR NEW.currency IS DISTINCT FROM parent.currency THEN
    RAISE EXCEPTION 'payment evidence must match the commercial snapshot';
  END IF;
  -- admin_private.stripe_event_receipts records provider_event_id, event_type,
  -- provider_object_id, and processed. It does not identify the commercial
  -- subscription, Stripe customer, business, or paid period. Any processed
  -- invoice can therefore be unrelated. Creation stays disabled until a later
  -- reviewed writer proves invoice, subscription, customer, period, and amount.
  RAISE EXCEPTION 'paid commercial evidence is disabled until a trusted invoice binding exists';
END;
$$;

CREATE FUNCTION admin_private.guard_product_entitlement_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent public.commercial_subscriptions;
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
    IF NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.component_code IS DISTINCT FROM OLD.component_code
      OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
      OR NEW.commercial_subscription_id IS DISTINCT FROM OLD.commercial_subscription_id
    THEN
      RAISE EXCEPTION 'entitlement identity is immutable';
    END IF;
  END IF;
  IF NEW.commercial_subscription_id IS NOT NULL THEN
    SELECT * INTO parent FROM public.commercial_subscriptions WHERE id = NEW.commercial_subscription_id;
    IF parent.business_id IS DISTINCT FROM NEW.business_id OR parent.customer_id IS NULL THEN
      RAISE EXCEPTION 'entitlement business must match the commercial subscription';
    END IF;
    IF NEW.source_kind = 'NON_BILLABLE_PILOT' AND parent.grant_kind IS DISTINCT FROM 'NON_BILLABLE_PILOT' THEN
      RAISE EXCEPTION 'pilot entitlement requires a pilot subscription';
    END IF;
    IF NEW.source_kind = 'COMMERCIAL_SUBSCRIPTION' AND parent.grant_kind IS DISTINCT FROM 'BILLABLE' THEN
      RAISE EXCEPTION 'commercial entitlement requires a billable subscription';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.guard_service_provision_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  entitlement public.product_entitlements;
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF NEW.state = 'LIVE' THEN
    RAISE EXCEPTION 'Telloya LIVE requires a future provider-verified command';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
    IF NEW.entitlement_id IS DISTINCT FROM OLD.entitlement_id
      OR NEW.business_id IS DISTINCT FROM OLD.business_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
    THEN
      RAISE EXCEPTION 'provision identity is immutable';
    END IF;
  END IF;
  SELECT * INTO entitlement FROM public.product_entitlements WHERE id = NEW.entitlement_id;
  IF entitlement.component_code IS DISTINCT FROM 'TELLOYA'
    OR entitlement.business_id IS DISTINCT FROM NEW.business_id
    OR entitlement.location_id IS DISTINCT FROM NEW.location_id
  THEN
    RAISE EXCEPTION 'provision must match its Telloya entitlement location';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.guard_bundle_allocation_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent public.commercial_subscriptions;
  guard_location uuid;
  guard_business uuid;
  guard_state text;
BEGIN
  NEW.updated_at := pg_catalog.now();
  IF TG_OP = 'UPDATE' THEN
    NEW.record_version := OLD.record_version + 1;
  END IF;
  SELECT * INTO parent FROM public.commercial_subscriptions WHERE id = NEW.subscription_id;
  IF parent.customer_id IS DISTINCT FROM NEW.customer_id OR parent.business_id IS DISTINCT FROM NEW.business_id THEN
    RAISE EXCEPTION 'allocation must match the commercial subscription';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_versions plan
    JOIN public.product_catalogue catalogue ON catalogue.code = plan.product_code
    WHERE plan.id = parent.plan_version_id AND catalogue.code = 'COMPLETE'
  ) THEN
    RAISE EXCEPTION 'Guard allocation requires a Complete subscription';
  END IF;
  IF NEW.state = 'RESERVED' AND EXISTS (
    SELECT 1 FROM public.guard_subscriptions guard_row
    WHERE guard_row.location_id = NEW.location_id
      AND guard_row.lifecycle_state NOT IN ('CANCELED', 'ENDED')
  ) THEN
    RAISE EXCEPTION 'reserved allocation requires no open Guard subscription';
  END IF;
  IF NEW.standalone_guard_subscription_id IS NOT NULL THEN
    SELECT location_id, business_id, lifecycle_state
      INTO guard_location, guard_business, guard_state
    FROM public.guard_subscriptions
    WHERE id = NEW.standalone_guard_subscription_id;
    IF guard_location IS DISTINCT FROM NEW.location_id
      OR guard_business IS DISTINCT FROM NEW.business_id
      OR guard_state IN ('CANCELED', 'ENDED')
    THEN
      RAISE EXCEPTION 'preview must name the open Guard subscription for this location';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION admin_private.enforce_purchased_location_quantity_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  subscription uuid;
  component text;
  purchased integer;
  open_count integer;
BEGIN
  IF TG_TABLE_NAME = 'bundle_guard_allocations' THEN
    subscription := NEW.subscription_id;
    component := 'GUARD';
  ELSE
    subscription := NEW.commercial_subscription_id;
    component := NEW.component_code;
  END IF;
  IF subscription IS NULL THEN
    RAISE EXCEPTION 'open locations exceed the purchased quantity';
  END IF;

  PERFORM 1
  FROM public.commercial_subscriptions parent
  WHERE parent.id = subscription
  FOR UPDATE;
  SELECT item.quantity INTO purchased
  FROM public.commercial_subscription_items item
  WHERE item.subscription_id = subscription
    AND item.component_code = component
  FOR UPDATE;

  IF TG_TABLE_NAME = 'bundle_guard_allocations' THEN
    SELECT count(*) INTO open_count
    FROM public.bundle_guard_allocations allocation
    WHERE allocation.subscription_id = subscription
      AND allocation.state IN ('RESERVED', 'PREVIEW');
  ELSE
    SELECT count(*) INTO open_count
    FROM public.product_entitlements entitlement
    WHERE entitlement.commercial_subscription_id = subscription
      AND entitlement.component_code = component
      AND entitlement.state IN ('PENDING', 'ELIGIBLE');
  END IF;
  IF purchased IS NULL OR open_count > purchased THEN
    RAISE EXCEPTION 'open locations exceed the purchased quantity';
  END IF;
  RETURN NULL;
END;
$$;

CREATE FUNCTION admin_private.guard_onboarding_invitation_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  request_email text;
  request_customer uuid;
BEGIN
  SELECT email_snapshot, customer_id
    INTO request_email, request_customer
  FROM public.onboarding_requests
  WHERE id = NEW.onboarding_request_id;
  IF request_email IS DISTINCT FROM NEW.email_snapshot OR request_customer IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'invitation must match the onboarding request';
  END IF;
  IF request_customer IS NULL THEN
    RAISE EXCEPTION 'unmatched address cannot be invited';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_catalogue_touch
  BEFORE UPDATE ON public.product_catalogue
  FOR EACH ROW EXECUTE FUNCTION admin_private.touch_commercial_row_v1();

CREATE TRIGGER plan_versions_guard
  BEFORE INSERT OR UPDATE ON public.plan_versions
  FOR EACH ROW EXECUTE FUNCTION admin_private.prevent_plan_overlap_v1();

CREATE TRIGGER plan_versions_touch
  BEFORE UPDATE ON public.plan_versions
  FOR EACH ROW EXECUTE FUNCTION admin_private.touch_commercial_row_v1();

CREATE TRIGGER plan_components_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.plan_components
  FOR EACH ROW EXECUTE FUNCTION admin_private.protect_plan_component_v1();

CREATE TRIGGER commercial_subscriptions_guard
  BEFORE INSERT OR UPDATE ON public.commercial_subscriptions
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_commercial_subscription_v1();

CREATE TRIGGER commercial_subscription_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_subscription_items
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_commercial_subscription_item_v1();

CREATE TRIGGER commercial_payment_evidence_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_payment_evidence
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_commercial_payment_evidence_v1();

CREATE TRIGGER product_entitlements_guard
  BEFORE INSERT OR UPDATE ON public.product_entitlements
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_product_entitlement_v1();

CREATE TRIGGER service_provisions_guard
  BEFORE INSERT OR UPDATE ON public.service_provisions
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_service_provision_v1();

CREATE TRIGGER bundle_guard_allocations_guard
  BEFORE INSERT OR UPDATE ON public.bundle_guard_allocations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_bundle_allocation_v1();

CREATE CONSTRAINT TRIGGER bundle_guard_allocations_quantity
  AFTER INSERT OR UPDATE ON public.bundle_guard_allocations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION admin_private.enforce_purchased_location_quantity_v1();

CREATE CONSTRAINT TRIGGER product_entitlements_quantity
  AFTER INSERT OR UPDATE ON public.product_entitlements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION admin_private.enforce_purchased_location_quantity_v1();

CREATE TRIGGER onboarding_requests_touch
  BEFORE UPDATE ON public.onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION admin_private.touch_commercial_row_v1();

CREATE TRIGGER onboarding_invitations_guard
  BEFORE INSERT OR UPDATE ON admin_private.onboarding_invitations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_onboarding_invitation_v1();

CREATE TRIGGER commercial_subscription_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.commercial_subscription_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TRIGGER entitlement_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.entitlement_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TRIGGER bundle_guard_allocation_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.bundle_guard_allocation_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TRIGGER commercial_command_receipts_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_command_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

CREATE TRIGGER commercial_payment_evidence_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON public.commercial_payment_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

ALTER TABLE public.product_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_payment_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_guard_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.onboarding_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_guard_allocation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_command_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.product_catalogue,
  public.plan_versions,
  public.plan_components,
  public.commercial_subscriptions,
  public.commercial_subscription_items,
  public.commercial_payment_evidence,
  public.product_entitlements,
  public.service_provisions,
  public.bundle_guard_allocations,
  public.onboarding_requests,
  admin_private.onboarding_invitations,
  public.commercial_subscription_events,
  public.entitlement_events,
  public.bundle_guard_allocation_events,
  admin_private.commercial_command_receipts
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON SEQUENCE
  public.commercial_subscription_events_id_seq,
  public.entitlement_events_id_seq,
  public.bundle_guard_allocation_events_id_seq
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  admin_private.touch_commercial_row_v1(),
  admin_private.reject_commercial_append_only_v1(),
  admin_private.prevent_plan_overlap_v1(),
  admin_private.protect_plan_component_v1(),
  admin_private.guard_commercial_subscription_v1(),
  admin_private.guard_commercial_subscription_item_v1(),
  admin_private.guard_commercial_payment_evidence_v1(),
  admin_private.guard_product_entitlement_v1(),
  admin_private.guard_service_provision_v1(),
  admin_private.guard_bundle_allocation_v1(),
  admin_private.enforce_purchased_location_quantity_v1(),
  admin_private.guard_onboarding_invitation_v1()
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.product_catalogue IS
  'Sellable Telloya and Complete products. Not a Recovery or Guard catalogue.';
COMMENT ON TABLE public.plan_versions IS
  'Approved commercial terms. A null amount is a pilot contract and cannot be offered as billable.';
COMMENT ON TABLE public.plan_components IS
  'Location caps for Telloya and Guard. No numeric cap is seeded.';
COMMENT ON TABLE public.commercial_subscriptions IS
  'Voice commercial term for one business. Not Guard billing and not a Recovery obligation.';
COMMENT ON TABLE public.commercial_subscription_items IS
  'Purchased location quantity for one component. The snapshot is the plan maximum.';
COMMENT ON TABLE public.commercial_payment_evidence IS
  'Empty until a trusted invoice binding exists. This phase rejects every insert.';
COMMENT ON TABLE public.product_entitlements IS
  'Who may use a component at one location. Not Guard coverage and not a payment.';
COMMENT ON TABLE public.service_provisions IS
  'Per-location Telloya setup. LIVE is rejected until a provider-verified command exists.';
COMMENT ON TABLE public.bundle_guard_allocations IS
  'Complete seat reservation or preview. It cannot fund, cancel, or cover Guard.';
COMMENT ON TABLE public.onboarding_requests IS
  'Admin-matched Voice onboarding. It does not verify a mailbox or open a session.';
COMMENT ON TABLE admin_private.onboarding_invitations IS
  'SHA-256 invitation hash only. The raw invitation secret is not stored.';
COMMENT ON TABLE public.commercial_subscription_events IS
  'Append-only commercial subscription audit.';
COMMENT ON TABLE public.entitlement_events IS
  'Append-only entitlement audit.';
COMMENT ON TABLE public.bundle_guard_allocation_events IS
  'Append-only allocation audit. Provider operation ids stay null.';
COMMENT ON TABLE admin_private.commercial_command_receipts IS
  'Idempotency store for a future commercial command. This phase has no command.';

COMMIT;
