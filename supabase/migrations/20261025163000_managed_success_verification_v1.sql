-- Managed success verification.
-- A success fee is earned only when the contracted profile or the exact
-- contracted review is absent on two trustworthy checks at least 48 hours
-- apart, with no return or ambiguity between that pair.
-- The target is frozen from the quote acceptance, not from a later edit of the
-- case or location. A blank listing freezes the case reference. A changed
-- address after acceptance is refused until the customer accepts again.
-- An open or upheld dispute blocks a new invoice, an existing invoice action,
-- and the hosted payment link. The local invoice becomes void only after the
-- provider confirms that void. A paid invoice is not voided and is not refunded here.
-- A check time is the recording clock, or the accepted evidence upload time
-- when a reviewed historic exception is explicit. Extra checks stay in the
-- history and do not block the qualifying pair. A check is corrected by an
-- invalidation row, never by editing or deleting it.
-- Approval pins the pair. A new hosted invoice is refused without that pair,
-- and while a success-fee dispute is open or upheld.
-- A saved card is not required and nothing here charges one.
-- Progress, invoice and completion emails reuse the existing outbound queue.
-- Recording a submission does not submit anything to Google. Queued is not delivered.
-- Do not apply this file to DEV or Production from the change that adds it.

BEGIN;

CREATE TABLE public.success_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  target_ref text NOT NULL CHECK (
    (target_ref ~ '^https://' AND char_length(target_ref) BETWEEN 12 AND 500)
    OR target_ref ~ '^case:(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
  ),
  restriction_ref text NOT NULL CHECK (char_length(restriction_ref) BETWEEN 8 AND 500),
  success_definition text NOT NULL CHECK (char_length(btrim(success_definition)) BETWEEN 10 AND 5000),
  evidence_version_id uuid NOT NULL REFERENCES public.case_document_versions(id) ON DELETE RESTRICT,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.success_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.success_baselines FROM PUBLIC, anon, authenticated;

CREATE TABLE public.success_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE,
  baseline_id uuid NOT NULL REFERENCES public.success_baselines(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  evidence_version_id uuid NOT NULL UNIQUE REFERENCES public.case_document_versions(id) ON DELETE RESTRICT,
  success_definition text NOT NULL CHECK (char_length(btrim(success_definition)) BETWEEN 10 AND 5000),
  observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finding text NOT NULL CHECK (finding IN ('ABSENT', 'PRESENT', 'RECURRENCE', 'AMBIGUOUS', 'UNRELATED')),
  review_visibility text NOT NULL CHECK (review_visibility IN ('VISIBLE', 'NOT_SHOWN', 'NOT_APPLICABLE')),
  source_access text NOT NULL CHECK (source_access IN ('ACCESSIBLE', 'INACCESSIBLE')),
  historic_exception boolean NOT NULL DEFAULT false,
  historic_reason text,
  observer_ref text NOT NULL CHECK (char_length(btrim(observer_ref)) BETWEEN 8 AND 200),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 10 AND 2000),
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (finding <> 'ABSENT' OR source_access = 'ACCESSIBLE'),
  CHECK (
    (historic_exception AND historic_reason IS NOT NULL AND char_length(btrim(historic_reason)) BETWEEN 20 AND 2000)
    OR (NOT historic_exception AND historic_reason IS NULL)
  ),
  CHECK (observed_at <= approved_at + interval '5 minutes')
);

CREATE INDEX success_observations_baseline_idx
  ON public.success_observations (baseline_id, recorded_at, id);

ALTER TABLE public.success_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.success_observations FROM PUBLIC, anon, authenticated;

CREATE TABLE public.success_observation_invalidations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid NOT NULL UNIQUE REFERENCES public.success_observations(id) ON DELETE RESTRICT,
  request_id uuid UNIQUE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 20 AND 2000),
  invalidated_by uuid NOT NULL,
  invalidated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.success_observation_invalidations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.success_observation_invalidations FROM PUBLIC, anon, authenticated;

CREATE TABLE public.success_fee_collection_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE,
  resolve_request_id uuid UNIQUE,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('OPEN', 'UPHELD', 'NOT_UPHELD')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 20 AND 2000),
  resolution text,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz,
  CHECK (
    (status = 'OPEN' AND resolution IS NULL AND resolved_by IS NULL AND resolved_at IS NULL AND resolve_request_id IS NULL)
    OR (
      status IN ('UPHELD', 'NOT_UPHELD')
      AND resolution IS NOT NULL
      AND char_length(btrim(resolution)) BETWEEN 20 AND 2000
      AND resolved_by IS NOT NULL
      AND resolved_at IS NOT NULL
      AND resolve_request_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX success_fee_collection_pauses_one_open
  ON public.success_fee_collection_pauses (service_order_id)
  WHERE status = 'OPEN';

ALTER TABLE public.success_fee_collection_pauses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.success_fee_collection_pauses FROM PUBLIC, anon, authenticated;

-- Provider reconciliation for an invoice that already exists when a dispute opens.
-- VOID_REQUIRED and VOID_UNCONFIRMED leave the invoice issued. VOID_CONFIRMED is
-- written only after the provider status is void. ALREADY_PAID never voids or refunds.
CREATE TABLE public.success_fee_invoice_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pause_id uuid NOT NULL REFERENCES public.success_fee_collection_pauses(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.payment_invoices(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  provider_invoice_id text,
  state text NOT NULL CHECK (state IN ('VOID_REQUIRED', 'VOID_CONFIRMED', 'ALREADY_PAID', 'VOID_UNCONFIRMED')),
  provider_status text,
  detail text CHECK (detail IS NULL OR char_length(btrim(detail)) BETWEEN 20 AND 2000),
  reconcile_request_id uuid UNIQUE,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pause_id, invoice_id)
);

ALTER TABLE public.success_fee_invoice_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.success_fee_invoice_holds FROM PUBLIC, anon, authenticated;

-- The accepted address is copied by the database at acceptance and cannot be edited.
ALTER TABLE public.quote_acceptances
  ADD COLUMN accepted_target_ref text,
  ADD CONSTRAINT quote_acceptances_accepted_target_ref_check CHECK (
    accepted_target_ref IS NULL
    OR (accepted_target_ref ~ '^https://' AND char_length(accepted_target_ref) BETWEEN 12 AND 500)
    OR accepted_target_ref ~ '^case:(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
  );

CREATE FUNCTION admin_private.quote_acceptances_bind_target_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  qv public.quote_versions;
  cs public.cases;
  live text;
BEGIN
  SELECT * INTO qv FROM public.quote_versions WHERE id = NEW.quote_version_id;
  IF qv.id IS NULL OR qv.case_id IS NULL THEN
    NEW.accepted_target_ref := NULL;
    RETURN NEW;
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = qv.case_id;
  IF cs.id IS NULL THEN
    RAISE EXCEPTION 'acceptance_target:case' USING ERRCODE = 'P0001';
  END IF;
  IF cs.case_type = 'REVIEW_PROTECTION' THEN
    live := btrim(coalesce(cs.review_url, ''));
  ELSE
    live := btrim(coalesce((SELECT business_profile_url FROM public.locations WHERE id = cs.location_id), ''));
  END IF;
  IF live ~ '^https://' AND char_length(live) BETWEEN 12 AND 500 THEN
    NEW.accepted_target_ref := live;
  ELSIF live = '' THEN
    IF cs.public_ref !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
      RAISE EXCEPTION 'acceptance_target:ref' USING ERRCODE = 'P0001';
    END IF;
    NEW.accepted_target_ref := 'case:' || cs.public_ref;
  ELSE
    RAISE EXCEPTION 'acceptance_target:target' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_acceptances_bind_target
  BEFORE INSERT ON public.quote_acceptances
  FOR EACH ROW EXECUTE FUNCTION admin_private.quote_acceptances_bind_target_v1();

REVOKE ALL ON FUNCTION admin_private.quote_acceptances_bind_target_v1() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.success_fee_approvals
  ADD COLUMN first_observation_id uuid REFERENCES public.success_observations(id),
  ADD COLUMN second_observation_id uuid REFERENCES public.success_observations(id),
  ADD CONSTRAINT success_fee_approvals_pair_distinct CHECK (
    first_observation_id IS NULL
    OR second_observation_id IS NULL
    OR first_observation_id <> second_observation_id
  );

CREATE FUNCTION admin_private.success_baselines_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'success baselines are immutable';
END;
$$;

CREATE TRIGGER success_baselines_immutable
  BEFORE UPDATE OR DELETE ON public.success_baselines
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_baselines_immutable_v1();

CREATE FUNCTION admin_private.accepted_success_target_v1(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  ord public.service_orders;
  cs public.cases;
  accepted text;
  live text;
BEGIN
  SELECT * INTO ord FROM public.service_orders WHERE id = p_order_id;
  IF ord.id IS NULL THEN
    RAISE EXCEPTION 'success_baseline:order' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = ord.case_id;
  IF cs.id IS NULL THEN
    RAISE EXCEPTION 'success_baseline:order' USING ERRCODE = 'P0001';
  END IF;
  SELECT accepted_target_ref INTO accepted
  FROM public.quote_acceptances
  WHERE id = ord.quote_acceptance_id;
  IF accepted IS NULL OR btrim(accepted) = '' THEN
    RAISE EXCEPTION 'success_baseline:acceptance_target' USING ERRCODE = 'P0001';
  END IF;
  IF cs.case_type = 'REVIEW_PROTECTION' THEN
    live := btrim(coalesce(cs.review_url, ''));
  ELSE
    live := btrim(coalesce((SELECT business_profile_url FROM public.locations WHERE id = cs.location_id), ''));
  END IF;
  IF accepted ~ '^https://' THEN
    IF live ~ '^https://' AND live IS DISTINCT FROM accepted THEN
      RAISE EXCEPTION 'success_baseline:target_changed' USING ERRCODE = 'P0001';
    END IF;
  ELSIF accepted ~ '^case:(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    IF live ~ '^https://' THEN
      RAISE EXCEPTION 'success_baseline:target_changed' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'success_baseline:acceptance_target' USING ERRCODE = 'P0001';
  END IF;
  RETURN accepted;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.accepted_success_target_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.success_baselines_bind_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  ord public.service_orders;
  cs public.cases;
  qv public.quote_versions;
  source text;
  restriction text;
BEGIN
  SELECT * INTO ord FROM public.service_orders WHERE id = NEW.service_order_id;
  IF ord.id IS NULL
    OR ord.case_id IS DISTINCT FROM NEW.case_id
    OR ord.customer_id IS DISTINCT FROM NEW.customer_id
    OR ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE'
    OR ord.currency IS DISTINCT FROM 'GBP'
    OR ord.service_code NOT IN ('MANAGED_RELAUNCH', 'MANAGED_REVIEW')
  THEN
    RAISE EXCEPTION 'success_baseline:order' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = ord.case_id;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF cs.id IS NULL OR qv.id IS NULL OR cs.customer_id IS DISTINCT FROM ord.customer_id THEN
    RAISE EXCEPTION 'success_baseline:order' USING ERRCODE = 'P0001';
  END IF;
  IF ord.service_code = 'MANAGED_RELAUNCH' AND cs.case_type IS DISTINCT FROM 'PROFILE_RECOVERY' THEN
    RAISE EXCEPTION 'success_baseline:order' USING ERRCODE = 'P0001';
  END IF;
  IF ord.service_code = 'MANAGED_REVIEW' AND cs.case_type IS DISTINCT FROM 'REVIEW_PROTECTION' THEN
    RAISE EXCEPTION 'success_baseline:order' USING ERRCODE = 'P0001';
  END IF;
  source := admin_private.accepted_success_target_v1(ord.id);
  IF btrim(NEW.target_ref) IS DISTINCT FROM source THEN
    RAISE EXCEPTION 'success_baseline:mismatch' USING ERRCODE = 'P0001';
  END IF;
  restriction := left(btrim(coalesce(cs.issue_description, '')), 500);
  IF char_length(restriction) < 8 THEN
    RAISE EXCEPTION 'success_baseline:restriction' USING ERRCODE = 'P0001';
  END IF;
  IF btrim(NEW.restriction_ref) IS DISTINCT FROM restriction THEN
    RAISE EXCEPTION 'success_baseline:mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF btrim(NEW.success_definition) IS DISTINCT FROM btrim(qv.success_definition) THEN
    RAISE EXCEPTION 'success_baseline:mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF NOT admin_private.accepted_outcome_evidence_v1(cs.id, NEW.evidence_version_id) THEN
    RAISE EXCEPTION 'success_baseline:evidence' USING ERRCODE = 'P0001';
  END IF;
  NEW.target_ref := source;
  NEW.restriction_ref := restriction;
  NEW.success_definition := qv.success_definition;
  RETURN NEW;
END;
$$;

CREATE TRIGGER success_baselines_bind
  BEFORE INSERT ON public.success_baselines
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_baselines_bind_v1();

CREATE FUNCTION admin_private.success_observations_bind_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  baseline public.success_baselines;
  cs public.cases;
  evidence_at timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'success observations are immutable';
  END IF;
  NEW.recorded_at := clock_timestamp();
  NEW.approved_at := NEW.recorded_at;
  SELECT * INTO baseline FROM public.success_baselines WHERE id = NEW.baseline_id;
  IF baseline.id IS NULL
    OR baseline.case_id IS DISTINCT FROM NEW.case_id
    OR baseline.customer_id IS DISTINCT FROM NEW.customer_id
    OR baseline.service_order_id IS DISTINCT FROM NEW.service_order_id
  THEN
    RAISE EXCEPTION 'success_observation:baseline' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.success_definition IS NOT NULL AND btrim(NEW.success_definition) IS DISTINCT FROM btrim(baseline.success_definition) THEN
    RAISE EXCEPTION 'success_observation:baseline' USING ERRCODE = 'P0001';
  END IF;
  NEW.success_definition := baseline.success_definition;
  IF NEW.evidence_version_id = baseline.evidence_version_id THEN
    RAISE EXCEPTION 'success_observation:baseline_evidence' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = baseline.case_id;
  IF cs.case_type = 'PROFILE_RECOVERY' THEN
    IF NEW.review_visibility IS DISTINCT FROM 'NOT_APPLICABLE' THEN
      RAISE EXCEPTION 'success_observation:visibility' USING ERRCODE = 'P0001';
    END IF;
  ELSIF cs.case_type = 'REVIEW_PROTECTION' THEN
    IF NEW.review_visibility NOT IN ('VISIBLE', 'NOT_SHOWN') THEN
      RAISE EXCEPTION 'success_observation:visibility' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.finding = 'ABSENT' AND NEW.review_visibility IS DISTINCT FROM 'NOT_SHOWN' THEN
      RAISE EXCEPTION 'success_observation:visibility' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.finding IN ('PRESENT', 'RECURRENCE') AND NEW.review_visibility IS DISTINCT FROM 'VISIBLE' THEN
      RAISE EXCEPTION 'success_observation:visibility' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'success_observation:baseline' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.finding = 'ABSENT' AND NEW.source_access IS DISTINCT FROM 'ACCESSIBLE' THEN
    RAISE EXCEPTION 'success_observation:source' USING ERRCODE = 'P0001';
  END IF;
  IF NOT admin_private.accepted_outcome_evidence_v1(baseline.case_id, NEW.evidence_version_id) THEN
    RAISE EXCEPTION 'success_observation:evidence' USING ERRCODE = 'P0001';
  END IF;
  SELECT created_at INTO evidence_at FROM public.case_document_versions WHERE id = NEW.evidence_version_id;
  IF NEW.historic_exception THEN
    IF NEW.historic_reason IS NULL OR char_length(btrim(NEW.historic_reason)) NOT BETWEEN 20 AND 2000 THEN
      RAISE EXCEPTION 'success_observation:historic' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.observed_at < evidence_at - interval '2 hours' OR NEW.observed_at > evidence_at + interval '15 minutes' THEN
      RAISE EXCEPTION 'success_observation:timestamp' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NEW.historic_reason IS NOT NULL THEN
      RAISE EXCEPTION 'success_observation:historic' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.observed_at < NEW.recorded_at - interval '2 hours' OR NEW.observed_at > NEW.recorded_at + interval '5 minutes' THEN
      RAISE EXCEPTION 'success_observation:timestamp' USING ERRCODE = 'P0001';
    END IF;
    IF evidence_at < NEW.recorded_at - interval '2 hours' OR evidence_at > NEW.recorded_at + interval '15 minutes' THEN
      RAISE EXCEPTION 'success_observation:timestamp' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER success_observations_bind
  BEFORE INSERT OR UPDATE OR DELETE ON public.success_observations
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_observations_bind_v1();

CREATE FUNCTION admin_private.success_observation_invalidations_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'success observation invalidations are immutable';
END;
$$;

CREATE TRIGGER success_observation_invalidations_immutable
  BEFORE UPDATE OR DELETE ON public.success_observation_invalidations
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_observation_invalidations_immutable_v1();

CREATE FUNCTION admin_private.success_fee_collection_pauses_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'success fee pauses are not deleted';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'OPEN' THEN
      RAISE EXCEPTION 'success_fee_pause:open_first' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM 'OPEN' OR NEW.status NOT IN ('UPHELD', 'NOT_UPHELD') THEN
    RAISE EXCEPTION 'success_fee_pause:status' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
  THEN
    RAISE EXCEPTION 'success_fee_pause:identity' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER success_fee_collection_pauses_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.success_fee_collection_pauses
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_fee_collection_pauses_guard_v1();

CREATE FUNCTION admin_private.observation_qualifying_at_v1(p_obs public.success_observations)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  evidence_at timestamptz;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.success_observation_invalidations WHERE observation_id = p_obs.id
  ) THEN
    RETURN NULL;
  END IF;
  IF NOT admin_private.accepted_outcome_evidence_v1(p_obs.case_id, p_obs.evidence_version_id) THEN
    RETURN NULL;
  END IF;
  SELECT created_at INTO evidence_at FROM public.case_document_versions WHERE id = p_obs.evidence_version_id;
  IF evidence_at IS NULL THEN RETURN NULL; END IF;
  IF p_obs.historic_exception THEN
    IF p_obs.observed_at < evidence_at - interval '2 hours' OR p_obs.observed_at > evidence_at + interval '15 minutes' THEN
      RETURN NULL;
    END IF;
    RETURN evidence_at;
  END IF;
  IF evidence_at < p_obs.recorded_at - interval '2 hours' OR evidence_at > p_obs.recorded_at + interval '15 minutes' THEN
    RETURN NULL;
  END IF;
  IF p_obs.observed_at < p_obs.recorded_at - interval '2 hours' OR p_obs.observed_at > p_obs.recorded_at + interval '5 minutes' THEN
    RETURN NULL;
  END IF;
  RETURN p_obs.recorded_at;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.observation_qualifying_at_v1(public.success_observations) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.success_verification_pair_v1(p_case uuid, p_order uuid)
RETURNS TABLE(ready boolean, first_id uuid, second_id uuid)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  ord public.service_orders;
  cs public.cases;
  qv public.quote_versions;
  baseline public.success_baselines;
  visibility text;
  first_row record;
  second_row record;
  spoiled boolean;
BEGIN
  ready := false;
  first_id := NULL;
  second_id := NULL;
  SELECT * INTO ord FROM public.service_orders WHERE id = p_order;
  IF ord.id IS NULL OR ord.case_id IS DISTINCT FROM p_case THEN RETURN NEXT; RETURN; END IF;
  IF ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE' OR ord.currency IS DISTINCT FROM 'GBP' THEN RETURN NEXT; RETURN; END IF;
  IF ord.service_code NOT IN ('MANAGED_RELAUNCH', 'MANAGED_REVIEW') THEN RETURN NEXT; RETURN; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = ord.case_id;
  IF cs.id IS NULL OR cs.customer_id IS DISTINCT FROM ord.customer_id THEN RETURN NEXT; RETURN; END IF;
  IF ord.service_code = 'MANAGED_RELAUNCH' AND cs.case_type IS DISTINCT FROM 'PROFILE_RECOVERY' THEN RETURN NEXT; RETURN; END IF;
  IF ord.service_code = 'MANAGED_REVIEW' AND cs.case_type IS DISTINCT FROM 'REVIEW_PROTECTION' THEN RETURN NEXT; RETURN; END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF qv.id IS NULL THEN RETURN NEXT; RETURN; END IF;
  IF qv.currency IS DISTINCT FROM 'GBP'
    OR ord.amount_minor IS DISTINCT FROM qv.total_amount_minor
    OR ord.tax_behaviour IS DISTINCT FROM qv.tax_behaviour
    OR ord.tax_amount_minor IS DISTINCT FROM qv.tax_amount_minor
  THEN RETURN NEXT; RETURN; END IF;
  SELECT * INTO baseline FROM public.success_baselines WHERE service_order_id = ord.id;
  IF baseline.id IS NULL
    OR baseline.case_id IS DISTINCT FROM cs.id
    OR baseline.customer_id IS DISTINCT FROM ord.customer_id
    OR baseline.success_definition IS DISTINCT FROM qv.success_definition
  THEN RETURN NEXT; RETURN; END IF;
  -- The frozen baseline is the contracted target. A later edit to the live
  -- profile or review address does not retarget these checks.
  visibility := CASE WHEN cs.case_type = 'REVIEW_PROTECTION' THEN 'NOT_SHOWN' ELSE 'NOT_APPLICABLE' END;
  IF EXISTS (
    SELECT 1
    FROM public.success_observations obs
    WHERE obs.baseline_id = baseline.id
      AND NOT EXISTS (
        SELECT 1 FROM public.success_observation_invalidations inv WHERE inv.observation_id = obs.id
      )
      AND admin_private.observation_qualifying_at_v1(obs) IS NULL
  ) THEN
    RETURN NEXT;
    RETURN;
  END IF;
  FOR first_row IN
    SELECT obs.id, admin_private.observation_qualifying_at_v1(obs) AS qualified_at
    FROM public.success_observations obs
    WHERE obs.baseline_id = baseline.id
      AND obs.case_id = cs.id
      AND obs.customer_id = ord.customer_id
      AND obs.service_order_id = ord.id
      AND obs.finding = 'ABSENT'
      AND obs.source_access = 'ACCESSIBLE'
      AND obs.review_visibility = visibility
      AND obs.success_definition = qv.success_definition
      AND NOT EXISTS (
        SELECT 1 FROM public.success_observation_invalidations inv WHERE inv.observation_id = obs.id
      )
    ORDER BY 2, obs.id
  LOOP
    SELECT obs.id, admin_private.observation_qualifying_at_v1(obs) AS qualified_at
      INTO second_row
    FROM public.success_observations obs
    WHERE obs.baseline_id = baseline.id
      AND obs.case_id = cs.id
      AND obs.customer_id = ord.customer_id
      AND obs.service_order_id = ord.id
      AND obs.finding = 'ABSENT'
      AND obs.source_access = 'ACCESSIBLE'
      AND obs.review_visibility = visibility
      AND obs.success_definition = qv.success_definition
      AND obs.id <> first_row.id
      AND NOT EXISTS (
        SELECT 1 FROM public.success_observation_invalidations inv WHERE inv.observation_id = obs.id
      )
      AND admin_private.observation_qualifying_at_v1(obs) >= first_row.qualified_at + interval '48 hours'
    ORDER BY 2, obs.id
    LIMIT 1;
    IF NOT FOUND OR second_row.id IS NULL THEN
      second_row := NULL;
      CONTINUE;
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.success_observations spoil
      WHERE spoil.baseline_id = baseline.id
        AND spoil.case_id = cs.id
        AND spoil.customer_id = ord.customer_id
        AND spoil.service_order_id = ord.id
        AND spoil.finding IN ('PRESENT', 'RECURRENCE', 'AMBIGUOUS', 'UNRELATED')
        AND NOT EXISTS (
          SELECT 1 FROM public.success_observation_invalidations inv WHERE inv.observation_id = spoil.id
        )
        AND admin_private.observation_qualifying_at_v1(spoil) > first_row.qualified_at
        AND admin_private.observation_qualifying_at_v1(spoil) <= second_row.qualified_at
    ) INTO spoiled;
    IF NOT spoiled THEN
      ready := true;
      first_id := first_row.id;
      second_id := second_row.id;
      RETURN NEXT;
      RETURN;
    END IF;
    second_row := NULL;
  END LOOP;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION admin_private.success_verification_pair_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.success_verification_ready_v1(p_case uuid, p_order uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pair.ready FROM admin_private.success_verification_pair_v1(p_case, p_order) AS pair;
$$;

REVOKE ALL ON FUNCTION admin_private.success_verification_ready_v1(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.success_fee_verification_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  pair record;
BEGIN
  SELECT ready, first_id, second_id INTO pair
  FROM admin_private.success_verification_pair_v1(NEW.case_id, NEW.service_order_id);
  IF pair.ready IS NOT TRUE OR pair.first_id IS NULL OR pair.second_id IS NULL THEN
    RAISE EXCEPTION 'success_verification:incomplete' USING ERRCODE = 'P0001';
  END IF;
  NEW.first_observation_id := pair.first_id;
  NEW.second_observation_id := pair.second_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER success_fee_approvals_verification
  BEFORE INSERT ON public.success_fee_approvals
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_fee_verification_guard_v1();

CREATE FUNCTION admin_private.success_fee_invoice_action_guard_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.kind IN ('INVOICE_PAYMENT', 'PAYMENT_RECOVERY') AND EXISTS (
    SELECT 1
    FROM public.payment_obligations ob
    JOIN public.success_fee_collection_pauses pause ON pause.service_order_id = ob.service_order_id
    WHERE ob.id = NEW.payment_obligation_id
      AND ob.kind = 'SUCCESS_FEE'
      AND pause.status IN ('OPEN', 'UPHELD')
  ) THEN
    RAISE EXCEPTION 'collection_paused:open' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER success_fee_invoice_action_guard
  BEFORE INSERT ON public.customer_actions
  FOR EACH ROW EXECUTE FUNCTION admin_private.success_fee_invoice_action_guard_v1();

CREATE OR REPLACE FUNCTION public.admin_payment_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  BEGIN
    RETURN admin_private.admin_payment_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'commercial_eligibility:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', split_part(SQLERRM, ':', 2),
        'message', admin_private.commercial_eligibility_message_v1()
      );
    END IF;
    IF SQLERRM LIKE 'gross_price:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', split_part(SQLERRM, ':', 2),
        'message', 'The quoted total is the final customer price. Tax cannot be added on top.'
      );
    END IF;
    IF SQLERRM LIKE 'success_verification:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', 'success_verification',
        'message', 'The success fee stays pending until two trustworthy checks of the contracted profile or review are at least 48 hours apart, and the original issue is not known to have returned between them.'
      );
    END IF;
    IF SQLERRM LIKE 'collection_paused:%' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', 'collection_paused',
        'message', 'Collection of this success fee is paused while the outcome is disputed. No new invoice or payment action was created, and no card was charged.'
      );
    END IF;
    RAISE;
  END;
END; $$;

CREATE OR REPLACE FUNCTION public.payment_prepare_invoice_v1(p_token text, p_obligation uuid, p_livemode boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s jsonb; ob public.payment_obligations; ord public.service_orders; op public.provider_operations;
  att public.payment_attempts; inv public.payment_invoices; n integer; declared text;
BEGIN
  declared := CASE WHEN p_livemode IS NULL THEN NULL WHEN p_livemode THEN 'true' ELSE 'false' END;
  IF NOT admin_private.payment_external_lane_allowed_v1(declared) THEN
    RETURN jsonb_build_object('status','denied','reason','lane_mismatch');
  END IF;
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  SELECT * INTO ob FROM public.payment_obligations WHERE id = p_obligation FOR UPDATE;
  IF ob.id IS NULL OR ob.state IN ('PAID','VOID') THEN RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = ob.service_order_id FOR UPDATE;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF ob.tax_behaviour NOT IN ('INCLUSIVE','NOT_APPLICABLE') THEN
    RETURN jsonb_build_object('status','denied','reason','tax_not_issuable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_receipts WHERE obligation_id = ob.id) THEN
    RETURN jsonb_build_object('status','denied','reason','already_paid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_invoices WHERE obligation_id = ob.id AND status = 'PAID') THEN
    RETURN jsonb_build_object('status','denied','reason','already_paid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(ob.id::text, 16));
  IF EXISTS (
    SELECT 1 FROM public.payment_attempts
    WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
      AND purpose IN ('CHECKOUT','OFF_SESSION','RECOVERY')
  ) OR EXISTS (
    SELECT 1 FROM public.provider_operations
    WHERE obligation_id = ob.id AND status IN ('PENDING','SUBMITTED')
      AND kind IN ('CREATE_CHECKOUT_SESSION','CREATE_PAYMENT_INTENT','CREATE_RECOVERY_SESSION')
  ) THEN
    RETURN jsonb_build_object('status','denied','reason','active_collection');
  END IF;
  SELECT * INTO inv FROM public.payment_invoices
    WHERE obligation_id = ob.id AND status IN ('DRAFT','ISSUED') ORDER BY created_at ASC LIMIT 1;
  IF ob.kind = 'SUCCESS_FEE' AND EXISTS (
    SELECT 1 FROM public.success_fee_collection_pauses pause
    WHERE pause.service_order_id = ord.id AND pause.status IN ('OPEN', 'UPHELD')
  ) THEN
    RETURN jsonb_build_object('status','denied','reason','collection_paused');
  END IF;
  IF inv.id IS NOT NULL THEN
    SELECT * INTO op FROM public.provider_operations WHERE id = inv.provider_operation_id;
    SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = inv.provider_operation_id;
    RETURN jsonb_build_object(
      'status','success','replay', inv.status = 'ISSUED', 'providerOperationId', op.id,
      'idempotencyKey', op.idempotency_key, 'attemptId', att.id, 'invoiceId', inv.id,
      'amountMinor', inv.amount_minor, 'currency', inv.currency, 'taxBehaviour', inv.tax_behaviour,
      'hostedInvoiceUrl', inv.hosted_invoice_url, 'providerInvoiceId', inv.provider_invoice_id,
      'customerId', inv.customer_id, 'serviceOrderId', inv.service_order_id, 'obligationId', inv.obligation_id,
      'orderRef', ord.public_ref
    );
  END IF;
  IF ob.kind = 'SUCCESS_FEE' AND NOT admin_private.success_verification_ready_v1(ord.case_id, ord.id) THEN
    RETURN jsonb_build_object('status','denied','reason','success_verification');
  END IF;
  INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
  VALUES (extensions.gen_random_uuid(), 'CREATE_INVOICE', 'INVOICE', ob.customer_id, ob.service_order_id, ob.id, 'PENDING')
  RETURNING * INTO op;
  SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = ob.id;
  INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
  VALUES (ob.id, ob.service_order_id, op.id, n, 'INVOICE', 'CREATED', ob.amount_minor, ob.currency)
  RETURNING * INTO att;
  INSERT INTO public.payment_invoices(
    obligation_id, service_order_id, customer_id, provider_operation_id, amount_minor, currency,
    tax_behaviour, tax_amount_minor, status
  ) VALUES (
    ob.id, ob.service_order_id, ob.customer_id, op.id, ob.amount_minor, ob.currency,
    ob.tax_behaviour, ob.tax_amount_minor, 'DRAFT'
  ) RETURNING * INTO inv;
  RETURN jsonb_build_object(
    'status','success','replay', false, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
    'attemptId', att.id, 'invoiceId', inv.id, 'amountMinor', inv.amount_minor, 'currency', inv.currency,
    'taxBehaviour', inv.tax_behaviour, 'customerId', inv.customer_id, 'serviceOrderId', inv.service_order_id,
    'obligationId', inv.obligation_id, 'orderRef', ord.public_ref
  );
END; $$;

CREATE FUNCTION public.admin_success_verification_v1(p_token text, p_orders uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  ready uuid[];
  baselines jsonb;
  checks jsonb;
  pauses jsonb;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_orders IS NULL OR cardinality(p_orders) > 50 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT coalesce(array_agg(ord.id), '{}') INTO ready
  FROM public.service_orders ord
  WHERE ord.id = ANY (p_orders)
    AND admin_private.success_verification_ready_v1(ord.case_id, ord.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'orderId', b.service_order_id,
    'baselineId', b.id,
    'targetRef', b.target_ref,
    'restrictionRef', b.restriction_ref
  )), '[]'::jsonb) INTO baselines
  FROM public.success_baselines b
  WHERE b.service_order_id = ANY (p_orders);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', obs.id,
    'orderId', obs.service_order_id,
    'finding', obs.finding,
    'qualifying', admin_private.observation_qualifying_at_v1(obs) IS NOT NULL,
    'invalidated', EXISTS (
      SELECT 1 FROM public.success_observation_invalidations inv WHERE inv.observation_id = obs.id
    )
  ) ORDER BY obs.recorded_at, obs.id), '[]'::jsonb) INTO checks
  FROM public.success_observations obs
  WHERE obs.service_order_id = ANY (p_orders);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'orderId', pause.service_order_id,
    'status', pause.status
  ) ORDER BY pause.opened_at DESC), '[]'::jsonb) INTO pauses
  FROM public.success_fee_collection_pauses pause
  WHERE pause.service_order_id = ANY (p_orders);
  RETURN jsonb_build_object(
    'status', 'success',
    'ready', to_jsonb(ready),
    'baselines', baselines,
    'checks', checks,
    'pauses', pauses
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_success_verification_v1(text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_success_verification_v1(text, uuid[]) TO service_role;

CREATE FUNCTION public.admin_record_success_baseline_v1(p_token text, p_request uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  ord public.service_orders;
  cs public.cases;
  qv public.quote_versions;
  existing public.success_baselines;
  source text;
  restriction text;
  evidence uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO existing FROM public.success_baselines WHERE request_id = p_request;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true, 'targetRef', existing.target_ref);
  END IF;
  BEGIN
    SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(p_payload->>'serviceOrderId', '')::uuid FOR UPDATE;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF ord.id IS NULL OR ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  SELECT * INTO cs FROM public.cases WHERE id = ord.case_id;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  IF cs.id IS NULL OR qv.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  BEGIN
    source := admin_private.accepted_success_target_v1(ord.id);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', split_part(SQLERRM, ':', 2));
  END;
  IF coalesce(btrim(p_payload->>'targetRef'), '') <> '' AND btrim(p_payload->>'targetRef') IS DISTINCT FROM source THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'baseline_mismatch');
  END IF;
  restriction := left(btrim(coalesce(cs.issue_description, '')), 500);
  BEGIN
    evidence := NULLIF(p_payload->>'evidenceVersionId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF evidence IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO existing FROM public.success_baselines WHERE service_order_id = ord.id;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'baseline_recorded', 'id', existing.id, 'targetRef', existing.target_ref);
  END IF;
  BEGIN
    INSERT INTO public.success_baselines(
      request_id, case_id, customer_id, service_order_id, target_ref, restriction_ref, success_definition,
      evidence_version_id, recorded_by
    ) VALUES (
      p_request, cs.id, ord.customer_id, ord.id, source, restriction, qv.success_definition, evidence, actor
    ) RETURNING * INTO existing;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', split_part(SQLERRM, ':', 2));
    WHEN unique_violation THEN
      SELECT * INTO existing FROM public.success_baselines WHERE request_id = p_request OR service_order_id = ord.id;
      IF existing.request_id = p_request THEN
        RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true, 'targetRef', existing.target_ref);
      END IF;
      RETURN jsonb_build_object('status', 'denied', 'reason', 'baseline_recorded');
  END;
  RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false, 'targetRef', existing.target_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_success_baseline_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_success_baseline_v1(text, uuid, jsonb) TO service_role;

CREATE FUNCTION public.admin_record_success_observation_v1(p_token text, p_request uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  ord public.service_orders;
  baseline public.success_baselines;
  existing public.success_observations;
  evidence uuid;
  observed timestamptz;
  supplied timestamptz;
  evidence_at timestamptz;
  finding text;
  visibility text;
  source_access text;
  historic boolean;
  historic_reason text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO existing FROM public.success_observations WHERE request_id = p_request;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true);
  END IF;
  BEGIN
    SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(p_payload->>'serviceOrderId', '')::uuid FOR UPDATE;
    evidence := NULLIF(p_payload->>'evidenceVersionId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF ord.id IS NULL OR ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE' OR evidence IS NULL THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  SELECT * INTO baseline FROM public.success_baselines WHERE service_order_id = ord.id;
  IF baseline.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'baseline_missing');
  END IF;
  IF coalesce(btrim(p_payload->>'targetRef'), '') <> '' AND btrim(p_payload->>'targetRef') IS DISTINCT FROM baseline.target_ref THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'baseline_mismatch');
  END IF;
  IF coalesce(btrim(p_payload->>'restrictionRef'), '') <> '' AND btrim(p_payload->>'restrictionRef') IS DISTINCT FROM baseline.restriction_ref THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'baseline_mismatch');
  END IF;
  finding := p_payload->>'finding';
  visibility := p_payload->>'reviewVisibility';
  source_access := p_payload->>'sourceAccess';
  IF finding NOT IN ('ABSENT', 'PRESENT', 'RECURRENCE', 'AMBIGUOUS', 'UNRELATED')
    OR visibility NOT IN ('VISIBLE', 'NOT_SHOWN', 'NOT_APPLICABLE')
    OR source_access NOT IN ('ACCESSIBLE', 'INACCESSIBLE')
    OR char_length(btrim(coalesce(p_payload->>'observerRef', ''))) NOT BETWEEN 8 AND 200
    OR char_length(btrim(coalesce(p_payload->>'note', ''))) NOT BETWEEN 10 AND 2000
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  BEGIN
    historic := coalesce((p_payload->>'historicException')::boolean, false);
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  historic_reason := NULLIF(btrim(coalesce(p_payload->>'historicReason', '')), '');
  IF historic AND (historic_reason IS NULL OR char_length(historic_reason) NOT BETWEEN 20 AND 2000) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF NOT historic AND historic_reason IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT created_at INTO evidence_at FROM public.case_document_versions WHERE id = evidence;
  IF evidence_at IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  BEGIN
    supplied := NULLIF(p_payload->>'observedAt', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF historic THEN
    observed := coalesce(supplied, evidence_at);
    IF observed < evidence_at - interval '2 hours' OR observed > evidence_at + interval '15 minutes' THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'timestamp');
    END IF;
  ELSE
    observed := coalesce(supplied, clock_timestamp());
    IF observed < clock_timestamp() - interval '2 hours' OR observed > clock_timestamp() + interval '5 minutes' THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'timestamp');
    END IF;
  END IF;
  BEGIN
    INSERT INTO public.success_observations(
      request_id, baseline_id, case_id, customer_id, service_order_id, evidence_version_id, success_definition,
      observed_at, finding, review_visibility, source_access, historic_exception, historic_reason,
      observer_ref, note, approved_by, approved_at
    ) VALUES (
      p_request, baseline.id, baseline.case_id, baseline.customer_id, baseline.service_order_id, evidence, baseline.success_definition,
      observed, finding, visibility, source_access, historic, historic_reason,
      btrim(p_payload->>'observerRef'), btrim(p_payload->>'note'), actor, clock_timestamp()
    ) RETURNING * INTO existing;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', split_part(SQLERRM, ':', 2));
    WHEN unique_violation THEN
      SELECT * INTO existing FROM public.success_observations WHERE request_id = p_request;
      IF existing.id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true);
      END IF;
      RETURN jsonb_build_object('status', 'denied', 'reason', 'duplicate_evidence');
  END;
  RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_success_observation_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_success_observation_v1(text, uuid, jsonb) TO service_role;

CREATE FUNCTION public.admin_invalidate_success_observation_v1(p_token text, p_request uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  obs public.success_observations;
  existing public.success_observation_invalidations;
  observation_id uuid;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF char_length(btrim(coalesce(p_payload->>'reason', ''))) NOT BETWEEN 20 AND 2000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO existing FROM public.success_observation_invalidations WHERE request_id = p_request;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true);
  END IF;
  BEGIN
    observation_id := NULLIF(p_payload->>'observationId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  SELECT * INTO obs FROM public.success_observations WHERE id = observation_id;
  IF obs.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  SELECT * INTO existing FROM public.success_observation_invalidations WHERE observation_id = obs.id;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'already_invalidated');
  END IF;
  INSERT INTO public.success_observation_invalidations(observation_id, request_id, reason, invalidated_by)
  VALUES (obs.id, p_request, btrim(p_payload->>'reason'), actor)
  RETURNING * INTO existing;
  RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_invalidate_success_observation_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_invalidate_success_observation_v1(text, uuid, jsonb) TO service_role;

CREATE FUNCTION admin_private.success_fee_dispute_view_v1(p_pause public.success_fee_collection_pauses)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  inv public.payment_invoices;
  hold public.success_fee_invoice_holds;
  hold_code text;
BEGIN
  SELECT * INTO hold FROM public.success_fee_invoice_holds WHERE pause_id = p_pause.id;
  SELECT invoice.* INTO inv
  FROM public.payment_invoices invoice
  JOIN public.payment_obligations ob ON ob.id = invoice.obligation_id
  WHERE ob.service_order_id = p_pause.service_order_id
    AND ob.customer_id = p_pause.customer_id
    AND ob.kind = 'SUCCESS_FEE'
    AND invoice.status <> 'DRAFT'
  ORDER BY invoice.created_at DESC
  LIMIT 1;
  hold_code := CASE hold.state
    WHEN 'VOID_REQUIRED' THEN 'void_required'
    WHEN 'VOID_CONFIRMED' THEN 'void_confirmed'
    WHEN 'ALREADY_PAID' THEN 'already_paid'
    WHEN 'VOID_UNCONFIRMED' THEN 'void_unconfirmed'
    ELSE 'none'
  END;
  RETURN jsonb_build_object(
    'invoiceId', inv.id,
    'invoiceStatus', inv.status,
    'providerInvoiceId', inv.provider_invoice_id,
    'hold', hold_code
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.success_fee_dispute_view_v1(public.success_fee_collection_pauses) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_success_fee_dispute_v1(p_token text, p_request uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  ord public.service_orders;
  existing public.success_fee_collection_pauses;
  inv public.payment_invoices;
  action text;
  outcome text;
  paid boolean;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  action := p_payload->>'action';
  IF action NOT IN ('open', 'resolve') THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO existing FROM public.success_fee_collection_pauses
  WHERE request_id = p_request OR resolve_request_id = p_request;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true, 'pauseStatus', existing.status)
      || admin_private.success_fee_dispute_view_v1(existing);
  END IF;
  BEGIN
    SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(p_payload->>'serviceOrderId', '')::uuid FOR UPDATE;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF ord.id IS NULL OR ord.payment_model IS DISTINCT FROM 'SUCCESS_FEE' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF action = 'open' THEN
    IF char_length(btrim(coalesce(p_payload->>'reason', ''))) NOT BETWEEN 20 AND 2000 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.success_fee_collection_pauses
      WHERE service_order_id = ord.id AND status IN ('OPEN', 'UPHELD')
    ) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'collection_paused');
    END IF;
    INSERT INTO public.success_fee_collection_pauses(
      request_id, service_order_id, case_id, customer_id, status, reason, opened_by
    ) VALUES (
      p_request, ord.id, ord.case_id, ord.customer_id, 'OPEN', btrim(p_payload->>'reason'), actor
    ) RETURNING * INTO existing;
    SELECT invoice.* INTO inv
    FROM public.payment_invoices invoice
    JOIN public.payment_obligations ob ON ob.id = invoice.obligation_id
    WHERE ob.service_order_id = ord.id
      AND ob.customer_id = ord.customer_id
      AND ob.kind = 'SUCCESS_FEE'
      AND invoice.status IN ('ISSUED', 'PAID')
    ORDER BY invoice.created_at DESC
    LIMIT 1
    FOR UPDATE OF invoice;
    IF inv.id IS NOT NULL THEN
      paid := inv.status = 'PAID' OR EXISTS (
        SELECT 1 FROM public.payment_receipts receipt WHERE receipt.obligation_id = inv.obligation_id
      );
      IF paid THEN
        INSERT INTO public.success_fee_invoice_holds(
          pause_id, invoice_id, service_order_id, customer_id, provider_invoice_id, state, provider_status, detail, recorded_by
        ) VALUES (
          existing.id, inv.id, ord.id, ord.customer_id, inv.provider_invoice_id, 'ALREADY_PAID', 'paid',
          'The invoice was already paid when the dispute opened. It was not voided and no refund was created.',
          actor
        );
      ELSIF inv.provider_invoice_id IS NULL THEN
        INSERT INTO public.success_fee_invoice_holds(
          pause_id, invoice_id, service_order_id, customer_id, provider_invoice_id, state, detail, recorded_by
        ) VALUES (
          existing.id, inv.id, ord.id, ord.customer_id, NULL, 'VOID_UNCONFIRMED',
          'The issued invoice has no provider id, so the provider void cannot be confirmed.',
          actor
        );
      ELSE
        INSERT INTO public.success_fee_invoice_holds(
          pause_id, invoice_id, service_order_id, customer_id, provider_invoice_id, state, recorded_by
        ) VALUES (
          existing.id, inv.id, ord.id, ord.customer_id, inv.provider_invoice_id, 'VOID_REQUIRED', actor
        );
      END IF;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false, 'pauseStatus', existing.status)
      || admin_private.success_fee_dispute_view_v1(existing);
  END IF;
  outcome := p_payload->>'outcome';
  IF outcome NOT IN ('UPHELD', 'NOT_UPHELD')
    OR char_length(btrim(coalesce(p_payload->>'resolution', ''))) NOT BETWEEN 20 AND 2000
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO existing FROM public.success_fee_collection_pauses
  WHERE service_order_id = ord.id AND status = 'OPEN'
  FOR UPDATE;
  IF existing.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  UPDATE public.success_fee_collection_pauses
  SET status = outcome,
      resolution = btrim(p_payload->>'resolution'),
      resolved_by = actor,
      resolved_at = now(),
      resolve_request_id = p_request
  WHERE id = existing.id
  RETURNING * INTO existing;
  RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false, 'pauseStatus', existing.status)
    || admin_private.success_fee_dispute_view_v1(existing);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_success_fee_dispute_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_success_fee_dispute_v1(text, uuid, jsonb) TO service_role;

CREATE FUNCTION public.admin_record_success_fee_invoice_hold_v1(p_token text, p_request uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  hold public.success_fee_invoice_holds;
  inv public.payment_invoices;
  requested text;
  reported_status text;
  note text;
  paid boolean;
  hold_code text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  requested := p_payload->>'state';
  reported_status := NULLIF(btrim(coalesce(p_payload->>'providerStatus', '')), '');
  note := NULLIF(btrim(coalesce(p_payload->>'detail', '')), '');
  IF requested NOT IN ('VOID_CONFIRMED', 'ALREADY_PAID', 'VOID_UNCONFIRMED') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF note IS NOT NULL AND char_length(note) NOT BETWEEN 20 AND 2000 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  BEGIN
    SELECT * INTO hold FROM public.success_fee_invoice_holds
    WHERE pause_id = NULLIF(p_payload->>'pauseId', '')::uuid
      AND invoice_id = NULLIF(p_payload->>'invoiceId', '')::uuid
    FOR UPDATE;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF hold.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF hold.reconcile_request_id = p_request AND (
    hold.state IN ('VOID_CONFIRMED', 'ALREADY_PAID')
    OR (hold.state = 'VOID_UNCONFIRMED' AND requested = 'VOID_UNCONFIRMED')
  ) THEN
    hold_code := CASE hold.state
      WHEN 'VOID_CONFIRMED' THEN 'void_confirmed'
      WHEN 'ALREADY_PAID' THEN 'already_paid'
      ELSE 'void_unconfirmed'
    END;
    RETURN jsonb_build_object('status', 'success', 'replay', true, 'hold', hold_code, 'invoiceStatus', (
      SELECT status FROM public.payment_invoices WHERE id = hold.invoice_id
    ));
  END IF;
  IF hold.state IN ('VOID_CONFIRMED', 'ALREADY_PAID') AND hold.reconcile_request_id IS DISTINCT FROM p_request THEN
    hold_code := CASE hold.state WHEN 'VOID_CONFIRMED' THEN 'void_confirmed' ELSE 'already_paid' END;
    RETURN jsonb_build_object('status', 'success', 'replay', true, 'hold', hold_code, 'invoiceStatus', (
      SELECT status FROM public.payment_invoices WHERE id = hold.invoice_id
    ));
  END IF;
  SELECT * INTO inv FROM public.payment_invoices WHERE id = hold.invoice_id FOR UPDATE;
  IF inv.id IS NULL OR inv.customer_id IS DISTINCT FROM hold.customer_id THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  paid := inv.status = 'PAID' OR EXISTS (
    SELECT 1 FROM public.payment_receipts receipt WHERE receipt.obligation_id = inv.obligation_id
  );
  IF paid OR requested = 'ALREADY_PAID' THEN
    UPDATE public.success_fee_invoice_holds
    SET state = 'ALREADY_PAID',
        provider_status = coalesce(reported_status, 'paid'),
        detail = coalesce(note, 'The provider reported the invoice paid. It was not voided and no refund was created.'),
        reconcile_request_id = p_request,
        updated_at = now()
    WHERE id = hold.id;
    RETURN jsonb_build_object('status', 'success', 'replay', false, 'hold', 'already_paid', 'invoiceStatus', inv.status);
  END IF;
  IF requested = 'VOID_CONFIRMED' AND reported_status = 'void' AND inv.status = 'VOID' THEN
    UPDATE public.payment_attempts
    SET status = 'CANCELLED', failed_at = now(), failure_category = 'PROVIDER', failure_code = 'invoice_void_confirmed'
    WHERE provider_operation_id = inv.provider_operation_id
      AND status IN ('CREATED', 'SUBMITTED', 'REQUIRES_ACTION');
    UPDATE public.success_fee_invoice_holds
    SET state = 'VOID_CONFIRMED', provider_status = 'void', detail = note,
        reconcile_request_id = p_request, updated_at = now()
    WHERE id = hold.id;
    RETURN jsonb_build_object('status', 'success', 'replay', false, 'hold', 'void_confirmed', 'invoiceStatus', 'VOID');
  END IF;
  IF requested = 'VOID_CONFIRMED' AND reported_status = 'void' AND inv.status = 'ISSUED' THEN
    UPDATE public.payment_invoices SET status = 'VOID' WHERE id = inv.id AND status = 'ISSUED';
    UPDATE public.payment_attempts
    SET status = 'CANCELLED', failed_at = now(), failure_category = 'PROVIDER', failure_code = 'invoice_void_confirmed'
    WHERE provider_operation_id = inv.provider_operation_id
      AND status IN ('CREATED', 'SUBMITTED', 'REQUIRES_ACTION');
    UPDATE public.success_fee_invoice_holds
    SET state = 'VOID_CONFIRMED', provider_status = 'void', detail = note,
        reconcile_request_id = p_request, updated_at = now()
    WHERE id = hold.id;
    RETURN jsonb_build_object('status', 'success', 'replay', false, 'hold', 'void_confirmed', 'invoiceStatus', 'VOID');
  END IF;
  UPDATE public.success_fee_invoice_holds
  SET state = 'VOID_UNCONFIRMED',
      provider_status = reported_status,
      detail = coalesce(note, 'The provider did not confirm a void. The invoice was left issued.'),
      reconcile_request_id = p_request,
      updated_at = now()
  WHERE id = hold.id;
  RETURN jsonb_build_object('status', 'success', 'replay', false, 'hold', 'void_unconfirmed', 'invoiceStatus', inv.status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_success_fee_invoice_hold_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_success_fee_invoice_hold_v1(text, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION admin_private.customer_action_eligible_v1(p_action public.customer_actions)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  c public.customers; b public.businesses; loc public.locations; cs public.cases;
  qv public.quote_versions; q public.quotes; ord public.service_orders; ob public.payment_obligations;
  cov public.guard_coverages; off public.guard_included_offers; sub public.guard_subscriptions;
  offer public.guard_price_change_offers; cont public.guard_continuations;
BEGIN
  IF p_action.id IS NULL OR p_action.status <> 'OPEN' THEN RETURN false; END IF;
  IF p_action.expires_at IS NOT NULL AND p_action.expires_at <= now() THEN RETURN false; END IF;
  IF p_action.revoked_at IS NOT NULL THEN RETURN false; END IF;
  IF lower(p_action.expected_email_snapshot) = 'admin@profilerelaunch.com' THEN RETURN false; END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_action.customer_id;
  IF c.id IS NULL OR lower(c.email) IS DISTINCT FROM lower(p_action.expected_email_snapshot) THEN RETURN false; END IF;
  IF NOT admin_private.contact_verified_v1(c.id, 'email') THEN RETURN false; END IF;
  IF p_action.kind = 'COMMUNICATION_ACCESS' THEN
    IF EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'revoked'
    ) THEN RETURN false; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'verified'
    ) THEN RETURN false; END IF;
  END IF;
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
    IF qv.customer_id IS DISTINCT FROM p_action.customer_id OR qv.business_id IS DISTINCT FROM p_action.business_id
      OR qv.location_id IS DISTINCT FROM p_action.location_id OR qv.case_id IS DISTINCT FROM p_action.case_id
    THEN RETURN false; END IF;
  END IF;
  IF p_action.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM p_action.customer_id THEN RETURN false; END IF;
    IF p_action.payment_obligation_id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = p_action.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state = 'VOID' THEN RETURN false; END IF;
    END IF;
    IF p_action.kind = 'INVOICE_PAYMENT' THEN
      IF p_action.payment_invoice_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.payment_invoices i
        WHERE i.id = p_action.payment_invoice_id AND i.obligation_id = p_action.payment_obligation_id
          AND i.status IN ('ISSUED','PAID')
      ) THEN RETURN false; END IF;
    END IF;
    IF p_action.kind IN ('INVOICE_PAYMENT', 'PAYMENT_RECOVERY') AND EXISTS (
      SELECT 1
      FROM public.payment_obligations paused_ob
      JOIN public.success_fee_collection_pauses pause ON pause.service_order_id = paused_ob.service_order_id
      WHERE paused_ob.id = p_action.payment_obligation_id
        AND paused_ob.kind = 'SUCCESS_FEE'
        AND pause.status IN ('OPEN', 'UPHELD')
    ) THEN RETURN false; END IF;
  END IF;
  IF p_action.kind = 'GUARD_PERMISSION' THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id;
    IF cov.id IS NULL OR cov.state IN ('ENDED') THEN RETURN false; END IF;
    IF cov.customer_id IS DISTINCT FROM p_action.customer_id OR cov.business_id IS DISTINCT FROM p_action.business_id
      OR cov.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF NOT admin_private.guard_location_authorized_v1(cov.customer_id, cov.business_id, cov.location_id) THEN
      RETURN false;
    END IF;
    IF cov.coverage_basis = 'INCLUDED' THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = p_action.guard_included_offer_id;
      IF off.id IS NULL OR off.status NOT IN ('ELIGIBLE','OFFERED') OR off.coverage_id IS DISTINCT FROM cov.id THEN
        RETURN false;
      END IF;
      IF NOT admin_private.included_guard_eligible_v1(
        cov.customer_id, cov.business_id, cov.location_id, cov.source_recovery_case_id, cov.source_managed_order_id
      ) THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_SUBSCRIPTION_START' THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.state <> 'ACCEPTED_RECURRING' THEN RETURN false; END IF;
    IF NOT admin_private.guard_location_authorized_v1(p_action.customer_id, p_action.business_id, p_action.location_id) THEN
      RETURN false;
    END IF;
    IF p_action.guard_coverage_id IS NOT NULL THEN
      SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id;
      IF cov.id IS NULL OR cov.state = 'ENDED' OR cov.coverage_basis <> 'DIRECT_GUARD' THEN RETURN false; END IF;
    END IF;
    IF p_action.guard_continuation_id IS NOT NULL THEN
      SELECT * INTO cont FROM public.guard_continuations WHERE id = p_action.guard_continuation_id;
      IF cont.id IS NULL OR cont.status NOT IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED') THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_PRICE_CHANGE_ACCEPTANCE' THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = p_action.guard_subscription_id;
    SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = p_action.guard_price_change_offer_id;
    IF sub.id IS NULL OR offer.id IS NULL OR offer.status <> 'OFFERED' THEN RETURN false; END IF;
    IF sub.customer_id IS DISTINCT FROM p_action.customer_id OR sub.location_id IS DISTINCT FROM p_action.location_id THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION admin_private.customer_action_eligible_v1(public.customer_actions) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_portal_invoice_target_v1(
  p_token_hash text, p_reference text, p_selector text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $invoice$
DECLARE
  v_customer uuid;
  v_auth uuid;
  v_email text;
  v_case uuid;
  a public.customer_actions;
  inv public.payment_invoices;
  matches integer;
BEGIN
  SELECT customer_id, auth_user_id, email INTO v_customer, v_auth, v_email
  FROM admin_private.customer_portal_actor_v1(p_token_hash);
  IF v_customer IS NULL OR v_auth IS NULL OR v_email IS NULL THEN RETURN NULL; END IF;
  IF p_reference IS NULL OR p_selector IS NULL
    OR p_reference !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$'
    OR p_selector !~ '^ca-[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  v_case := admin_private.customer_portal_owned_case_v1(v_customer, p_reference);
  IF v_case IS NULL THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT count(*) INTO matches
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF matches <> 1 THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  SELECT * INTO a
  FROM public.customer_actions action
  WHERE action.case_id = v_case AND action.customer_id = v_customer
    AND admin_private.customer_portal_action_selector_v1(action.id) = p_selector;
  IF a.id IS NULL OR a.kind <> 'INVOICE_PAYMENT'
    OR lower(a.expected_email_snapshot) IS DISTINCT FROM lower(v_email)
  THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payment_obligations ob
    JOIN public.success_fee_collection_pauses pause ON pause.service_order_id = ob.service_order_id
    WHERE ob.id = a.payment_obligation_id
      AND ob.customer_id = v_customer
      AND ob.kind = 'SUCCESS_FEE'
      AND pause.status IN ('OPEN', 'UPHELD')
  ) THEN
    RETURN jsonb_build_object('status', 'collection_paused');
  END IF;
  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT * INTO inv FROM public.payment_invoices
  WHERE id = a.payment_invoice_id AND customer_id = v_customer AND obligation_id = a.payment_obligation_id;
  IF inv.id IS NULL OR inv.status <> 'ISSUED' THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF inv.hosted_invoice_url IS NULL OR btrim(inv.hosted_invoice_url) = '' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  RETURN jsonb_build_object('status', 'redirect', 'hostedInvoiceUrl', inv.hosted_invoice_url);
END;
$invoice$;

REVOKE ALL ON FUNCTION public.customer_portal_invoice_target_v1(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_invoice_target_v1(text, text, text) TO service_role;

ALTER TABLE public.communications DROP CONSTRAINT communications_template_check;
ALTER TABLE public.communications ADD CONSTRAINT communications_template_check CHECK (
  (lifecycle IS NULL AND template_key IS NULL AND template_version IS NULL)
  OR (lifecycle IS NOT NULL AND template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION'
  ) AND template_version >= 1)
);
ALTER TABLE admin_private.communication_templates DROP CONSTRAINT communication_templates_key_check;
ALTER TABLE admin_private.communication_templates ADD CONSTRAINT communication_templates_key_check
  CHECK (template_key IN (
    'EVIDENCE_REQUEST', 'CASE_UPDATE', 'CONVERSATION_REPLY', 'GUARD_ALERT', 'QUOTE_OFFER',
    'GUIDED_PAYMENT_REQUEST', 'PAYMENT_CONFIRMATION', 'GUIDED_PACK_READY', 'GUIDED_COMPLETION',
    'MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION'
  ));

INSERT INTO admin_private.communication_templates (
  template_key, version, name, subject_template, body_text_template, status, reason
) VALUES
  ('MANAGED_PROGRESS', 1, 'Managed progress', 'Managed case update', 'The live progress email is composed by the server.', 'DRAFT', 'Catalogue row for the server-composed Managed progress email.'),
  ('MANAGED_RESULT', 1, 'Managed result', 'Managed case result', 'The live result email is composed by the server.', 'DRAFT', 'Catalogue row for the server-composed Managed result email.'),
  ('MANAGED_INVOICE', 1, 'Managed invoice', 'Managed success-fee invoice', 'The live invoice email is composed by the server.', 'DRAFT', 'Catalogue row for the server-composed Managed invoice email.'),
  ('MANAGED_COMPLETION', 1, 'Managed completion', 'Managed case complete', 'The live completion email is composed by the server.', 'DRAFT', 'Catalogue row for the server-composed Managed completion email.');
UPDATE admin_private.communication_templates
SET status = 'APPROVED', approval_source = 'MIGRATED_EXISTING',
    reason = 'Server-composed snapshot. The approved row documents the key and is not the live email.',
    record_version = record_version + 1
WHERE template_key IN ('MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION')
  AND version = 1 AND status = 'DRAFT';

CREATE OR REPLACE FUNCTION admin_private.refuse_closed_case_customer_send_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  case_status text;
  case_track text;
  case_outcome text;
BEGIN
  IF NEW.lifecycle IS DISTINCT FROM 'QUEUED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.lifecycle = 'QUEUED' THEN RETURN NEW; END IF;
  SELECT status, service_track, outcome INTO case_status, case_track, case_outcome
  FROM public.cases WHERE id = NEW.case_id;
  IF case_status = 'CANCELLED' THEN
    IF case_track = 'MANAGED' AND case_outcome = 'WITHDRAWN' AND NEW.template_key = 'MANAGED_COMPLETION' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'closed_case_send_refused' USING ERRCODE = 'P0001';
  END IF;
  IF case_status = 'CLOSED' THEN
    IF case_track = 'GUIDED'
      AND case_outcome IS NULL
      AND NEW.template_key IN ('GUIDED_PACK_READY', 'GUIDED_COMPLETION')
    THEN
      RETURN NEW;
    END IF;
    IF case_track = 'MANAGED' AND NEW.template_key IN ('MANAGED_INVOICE', 'MANAGED_COMPLETION') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'closed_case_send_refused' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE public.managed_customer_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('SUBMISSION', 'RESULT', 'INVOICE', 'COMPLETION')),
  submission_id uuid REFERENCES public.case_submissions(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.payment_invoices(id) ON DELETE RESTRICT,
  communication_id uuid NOT NULL UNIQUE REFERENCES public.communications(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'SUBMISSION' AND submission_id IS NOT NULL AND invoice_id IS NULL)
    OR (kind = 'RESULT' AND submission_id IS NOT NULL AND invoice_id IS NULL)
    OR (kind = 'INVOICE' AND invoice_id IS NOT NULL AND submission_id IS NULL)
    OR (kind = 'COMPLETION' AND submission_id IS NULL AND invoice_id IS NULL)
  )
);
CREATE UNIQUE INDEX managed_customer_notices_submission_idx
  ON public.managed_customer_notices (submission_id) WHERE kind = 'SUBMISSION';
CREATE UNIQUE INDEX managed_customer_notices_result_idx
  ON public.managed_customer_notices (submission_id) WHERE kind = 'RESULT';
CREATE UNIQUE INDEX managed_customer_notices_invoice_idx
  ON public.managed_customer_notices (invoice_id) WHERE kind = 'INVOICE';
CREATE UNIQUE INDEX managed_customer_notices_completion_idx
  ON public.managed_customer_notices (case_id) WHERE kind = 'COMPLETION';
ALTER TABLE public.managed_customer_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.managed_customer_notices FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.managed_notice_target_v1(p_case uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  c public.cases;
  cust public.customers;
  ord public.service_orders;
  sub public.case_submissions;
  result_row public.case_submission_results;
  inv public.payment_invoices;
  chosen_service text;
  chosen_label text;
  notice_kind text;
  variant text;
  amount integer;
  receipt_amount integer;
BEGIN
  IF p_kind NOT IN ('submission', 'result', 'invoice', 'completion') THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.cases WHERE id = p_case;
  IF c.id IS NULL OR c.service_track IS DISTINCT FROM 'MANAGED' THEN RETURN NULL; END IF;
  IF c.case_type = 'PROFILE_RECOVERY' THEN
    chosen_service := 'MANAGED_RELAUNCH';
    chosen_label := 'Managed Profile Recovery';
  ELSIF c.case_type = 'REVIEW_PROTECTION' THEN
    chosen_service := 'MANAGED_REVIEW';
    chosen_label := 'Managed Review Protection';
  ELSE
    RETURN NULL;
  END IF;
  IF c.public_ref !~ '^(PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN RETURN NULL; END IF;
  SELECT * INTO cust FROM public.customers WHERE id = c.customer_id;
  IF cust.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE admin_private.normalize_email_v1(u.email) = admin_private.normalize_email_v1(cust.email)
      AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO ord FROM public.service_orders candidate
  WHERE candidate.case_id = c.id
    AND candidate.service_code = chosen_service
    AND candidate.payment_model = 'SUCCESS_FEE'
  ORDER BY candidate.created_at, candidate.id
  LIMIT 1;
  IF NOT FOUND THEN
    ord := NULL;
  END IF;

  IF p_kind = 'submission' THEN
    IF ord.id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO sub FROM public.case_submissions s
    WHERE s.case_id = c.id AND s.track = 'MANAGED'
      AND NOT EXISTS (
        SELECT 1 FROM public.managed_customer_notices n
        WHERE n.kind = 'SUBMISSION' AND n.submission_id = s.id
      )
    ORDER BY s.created_at, s.id
    LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    variant := CASE
      WHEN sub.id = (
        SELECT earliest.id FROM public.case_submissions earliest
        WHERE earliest.case_id = c.id ORDER BY earliest.created_at, earliest.id LIMIT 1
      ) THEN 'submitted' ELSE 'follow_up'
    END;
    RETURN jsonb_build_object(
      'variant', variant, 'submissionId', sub.id, 'invoiceId', NULL,
      'amountMinor', ord.amount_minor, 'serviceCode', chosen_service,
      'serviceName', chosen_label, 'caseRef', c.public_ref, 'kind', 'SUBMISSION'
    );
  END IF;

  IF p_kind = 'result' THEN
    IF ord.id IS NULL THEN RETURN NULL; END IF;
    SELECT r.* INTO result_row
    FROM public.case_submission_results r
    JOIN public.case_submissions s ON s.id = r.submission_id
    WHERE s.case_id = c.id
      AND NOT EXISTS (
        SELECT 1 FROM public.managed_customer_notices n
        WHERE n.kind = 'RESULT' AND n.submission_id = s.id
      )
    ORDER BY r.created_at, s.id
    LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    variant := CASE result_row.result WHEN 'DECIDED' THEN 'google_reply' WHEN 'WITHDRAWN' THEN 'unsuccessful_reply' ELSE NULL END;
    IF variant IS NULL THEN RETURN NULL; END IF;
    RETURN jsonb_build_object(
      'variant', variant, 'submissionId', result_row.submission_id, 'invoiceId', NULL,
      'amountMinor', ord.amount_minor, 'serviceCode', chosen_service,
      'serviceName', chosen_label, 'caseRef', c.public_ref, 'kind', 'RESULT'
    );
  END IF;

  IF p_kind = 'invoice' THEN
    IF ord.id IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO inv FROM public.payment_invoices candidate
    WHERE candidate.service_order_id = ord.id
      AND candidate.status IN ('ISSUED', 'PAID')
      AND candidate.amount_minor = ord.amount_minor
      AND NOT EXISTS (
        SELECT 1 FROM public.managed_customer_notices n
        WHERE n.kind = 'INVOICE' AND n.invoice_id = candidate.id
      )
    ORDER BY candidate.created_at, candidate.id
    LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object(
      'variant', 'invoice', 'submissionId', NULL, 'invoiceId', inv.id,
      'amountMinor', inv.amount_minor, 'serviceCode', chosen_service,
      'serviceName', chosen_label, 'caseRef', c.public_ref, 'kind', 'INVOICE'
    );
  END IF;

  notice_kind := 'COMPLETION';
  IF EXISTS (
    SELECT 1 FROM public.managed_customer_notices n
    WHERE n.case_id = c.id AND n.kind = notice_kind
  ) THEN
    RETURN NULL;
  END IF;
  IF c.status = 'CANCELLED' AND c.outcome = 'WITHDRAWN' THEN
    IF ord.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.payment_receipts receipt
      JOIN public.payment_obligations obligation ON obligation.id = receipt.obligation_id
      WHERE obligation.service_order_id = ord.id AND obligation.kind = 'SUCCESS_FEE'
    ) THEN
      RETURN NULL;
    END IF;
    RETURN jsonb_build_object(
      'variant', 'withdrawn', 'submissionId', NULL, 'invoiceId', NULL,
      'amountMinor', NULL, 'serviceCode', chosen_service,
      'serviceName', chosen_label, 'caseRef', c.public_ref, 'kind', 'COMPLETION'
    );
  END IF;
  IF c.status IS DISTINCT FROM 'CLOSED' OR ord.id IS NULL THEN RETURN NULL; END IF;
  SELECT receipt.amount_minor INTO receipt_amount
  FROM public.payment_receipts receipt
  JOIN public.payment_obligations obligation ON obligation.id = receipt.obligation_id
  WHERE obligation.service_order_id = ord.id AND obligation.kind = 'SUCCESS_FEE'
  LIMIT 1;
  IF c.outcome IN ('RESTORED', 'REMOVED') THEN
    IF receipt_amount IS NULL OR receipt_amount IS DISTINCT FROM ord.amount_minor THEN RETURN NULL; END IF;
    variant := 'complete_paid';
    amount := ord.amount_minor;
  ELSIF c.outcome IN ('NOT_RESTORED', 'PARTIALLY_RESTORED', 'NOT_REMOVED', 'RESPONSE_RECOMMENDED') THEN
    IF receipt_amount IS NOT NULL THEN RETURN NULL; END IF;
    variant := 'complete_no_fee';
    amount := NULL;
  ELSE
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'variant', variant, 'submissionId', NULL, 'invoiceId', NULL,
    'amountMinor', amount, 'serviceCode', chosen_service,
    'serviceName', chosen_label, 'caseRef', c.public_ref, 'kind', 'COMPLETION'
  );
END;
$$;
REVOKE ALL ON FUNCTION admin_private.managed_notice_target_v1(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.managed_snapshot_reason_v1(
  p_case uuid, p_template text, p_subject text, p_text text, p_html text, p_origin text
) RETURNS text
LANGUAGE plpgsql STABLE SET search_path = ''
AS $$
DECLARE
  target jsonb;
  kind text;
  page text;
  button text;
  expected text;
  amount_label text;
  amount integer;
  stripped text;
  sentence text;
BEGIN
  kind := CASE p_template
    WHEN 'MANAGED_PROGRESS' THEN 'submission'
    WHEN 'MANAGED_RESULT' THEN 'result'
    WHEN 'MANAGED_INVOICE' THEN 'invoice'
    WHEN 'MANAGED_COMPLETION' THEN 'completion'
    ELSE NULL
  END;
  IF kind IS NULL THEN RETURN 'template'; END IF;
  target := admin_private.managed_notice_target_v1(p_case, kind);
  IF target IS NULL THEN RETURN 'target'; END IF;
  page := CASE WHEN p_template = 'MANAGED_INVOICE' THEN '/payments' ELSE '' END;
  button := CASE WHEN p_template = 'MANAGED_INVOICE' THEN 'View your invoice' ELSE 'Open your case' END;
  expected := p_origin || '/portal/cases/' || (target->>'caseRef') || page;
  sentence := CASE target->>'variant'
    WHEN 'submitted' THEN 'We have submitted your case to Google through Google''s own process. This email is our note of that submission. It does not mean Google has made a decision.'
    WHEN 'follow_up' THEN 'We have sent Google a further update on your case. This email is our note of that follow-up. It does not mean Google has made a decision.'
    WHEN 'google_reply' THEN 'Google has sent a reply. A reply is not the same as the agreed successful outcome. We still check the original profile or review ourselves before any success fee is discussed.'
    WHEN 'unsuccessful_reply' THEN 'The response does not meet the agreed success criteria, so no success fee is payable for this request.'
    WHEN 'invoice' THEN 'Your success fee invoice is ready. It is payable within 14 days from the signed-in Customer Portal. We do not charge a saved card.'
    WHEN 'complete_paid' THEN 'Your case is complete. The agreed outcome was checked and the success fee has been paid.'
    WHEN 'complete_no_fee' THEN 'We have closed this case. The agreed successful outcome was not shown, so no success fee is payable.'
    WHEN 'withdrawn' THEN 'This service has been withdrawn. No success fee is payable.'
    ELSE NULL
  END;
  IF sentence IS NULL OR p_origin !~ '^https://[A-Za-z0-9.-]+$' THEN RETURN 'snapshot'; END IF;
  IF p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 8 AND 200
    OR position(target->>'caseRef' IN p_subject) = 0
    OR position(target->>'serviceName' IN coalesce(p_text, '')) = 0
    OR position(sentence IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_text, '')) = 0
    OR position(button IN coalesce(p_html, '')) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN coalesce(p_text, '')) = 0
    OR position('For your security, please never share passwords, verification codes or sign-in credentials.' IN coalesce(p_html, '')) = 0
    OR position('reply to this email' IN lower(coalesce(p_text, ''))) = 0
    OR position('reply to this email' IN lower(coalesce(p_html, ''))) = 0
    OR position('#t=' IN coalesce(p_subject, '') || coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('/action/' IN coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR position('pi_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR position('cus_' IN lower(coalesce(p_text, '') || coalesce(p_html, ''))) > 0
    OR (coalesce(p_subject, '') || coalesce(p_text, '') || coalesce(p_html, '')) ~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    OR position('SUCCESS_FEE' IN coalesce(p_text, '') || coalesce(p_html, '')) > 0
    OR (length(coalesce(p_text, '')) - length(replace(coalesce(p_text, ''), expected, ''))) IS DISTINCT FROM length(expected)
    OR (length(coalesce(p_html, '')) - length(replace(coalesce(p_html, ''), expected, ''))) IS DISTINCT FROM length(expected)
    OR position(expected || '/' IN coalesce(p_text, '')) > 0
    OR position(expected || '/' IN coalesce(p_html, '')) > 0
  THEN
    RETURN 'snapshot';
  END IF;
  IF target->>'variant' IN ('submitted', 'follow_up', 'google_reply', 'unsuccessful_reply')
    AND position('This note does not finish the case and it does not create a fee.' IN coalesce(p_text, '')) = 0
  THEN
    RETURN 'snapshot';
  END IF;
  IF target->>'variant' = 'complete_paid' AND target->>'serviceCode' = 'MANAGED_RELAUNCH'
    AND position('We checked the original profile restriction named in your agreement.' IN coalesce(p_text, '')) = 0
  THEN
    RETURN 'snapshot';
  END IF;
  IF target->>'variant' = 'complete_paid' AND target->>'serviceCode' = 'MANAGED_REVIEW'
    AND position('We checked the exact review named in your agreement.' IN coalesce(p_text, '')) = 0
  THEN
    RETURN 'snapshot';
  END IF;
  IF target->>'variant' IN ('complete_paid', 'complete_no_fee', 'withdrawn')
    AND position('Relaunch Guard is optional. This email does not enrol you or charge you.' IN coalesce(p_text, '')) = 0
  THEN
    RETURN 'snapshot';
  END IF;
  IF target->>'variant' IN ('invoice', 'complete_paid') THEN
    amount := (target->>'amountMinor')::integer;
    amount_label := '£' || (amount / 100)::text || '.' || lpad((amount % 100)::text, 2, '0') || ' GBP';
    IF position(amount_label IN coalesce(p_text, '')) = 0
      OR position('No additional taxes or mandatory fees charged by ProfileRelaunch.' IN coalesce(p_text, '')) = 0
    THEN
      RETURN 'snapshot';
    END IF;
  END IF;
  stripped := replace(replace(coalesce(p_text, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  stripped := replace(replace(coalesce(p_html, ''), expected, ''), 'https://profilerelaunch.com', '');
  IF position('https://' IN stripped) > 0 OR position('http://' IN stripped) > 0 THEN RETURN 'snapshot'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.managed_snapshot_reason_v1(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.protect_managed_email_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
DECLARE reason text; upload text; origin text;
BEGIN
  IF NEW.template_key IS NULL OR NEW.template_key NOT IN ('MANAGED_PROGRESS', 'MANAGED_RESULT', 'MANAGED_INVOICE', 'MANAGED_COMPLETION') THEN
    RETURN NEW;
  END IF;
  IF NEW.lifecycle IS DISTINCT FROM 'QUEUED' OR NEW.content_locked IS NOT TRUE OR NEW.template_version IS DISTINCT FROM 1
    OR NEW.case_id IS NULL OR NEW.reply_to_address IS NULL
  THEN
    RAISE EXCEPTION 'managed_email:invalid' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.template_key = 'MANAGED_INVOICE' THEN
    upload := substring(NEW.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}/payments');
  ELSE
    upload := substring(NEW.body_text from 'https://[A-Za-z0-9.-]+/portal/cases/(?:PR|RV)-[0-9]{2}-[A-HJ-NP-Z2-9]{6}');
  END IF;
  origin := regexp_replace(coalesce(upload, ''), '/portal/cases/.*$', '');
  reason := admin_private.managed_snapshot_reason_v1(
    NEW.case_id, NEW.template_key, NEW.subject, NEW.body_text, NEW.body_html, origin
  );
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION 'managed_email:%', reason USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION admin_private.protect_managed_email_v1()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS communications_managed_email_guard ON public.communications;
CREATE TRIGGER communications_managed_email_guard
  BEFORE INSERT ON public.communications
  FOR EACH ROW
  EXECUTE FUNCTION admin_private.protect_managed_email_v1();

CREATE FUNCTION public.admin_managed_notice_context_v1(
  p_token text, p_kind text, p_case uuid, p_order uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  s jsonb;
  target jsonb;
  notice_kind text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_case IS NULL AND p_order IS NOT NULL THEN
    SELECT case_id INTO p_case FROM public.service_orders WHERE id = p_order;
  END IF;
  IF p_kind NOT IN ('submission', 'result', 'invoice', 'completion') OR p_case IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  target := admin_private.managed_notice_target_v1(p_case, p_kind);
  notice_kind := CASE p_kind
    WHEN 'submission' THEN 'SUBMISSION'
    WHEN 'result' THEN 'RESULT'
    WHEN 'invoice' THEN 'INVOICE'
    ELSE 'COMPLETION'
  END;
  IF target IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.managed_customer_notices n
      WHERE n.case_id = p_case AND n.kind = notice_kind
    ) THEN
      RETURN jsonb_build_object('status', 'already_queued');
    END IF;
    RETURN jsonb_build_object('status', 'not_applicable');
  END IF;
  RETURN jsonb_build_object(
    'status', 'applicable',
    'variant', target->>'variant',
    'caseRef', target->>'caseRef',
    'serviceCode', target->>'serviceCode',
    'serviceName', target->>'serviceName',
    'amountMinor', target->'amountMinor',
    'currency', 'GBP'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_managed_notice_context_v1(text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_managed_notice_context_v1(text, text, uuid, uuid) TO service_role;

CREATE FUNCTION public.admin_queue_managed_notice_v1(
  p_token text, p_request uuid, p_case uuid, p_kind text, p_data jsonb, p_order uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  target jsonb;
  existing public.managed_customer_notices;
  comm uuid;
  notice_kind text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF (s->>'createdAt')::timestamptz < now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;
  IF p_case IS NULL AND p_order IS NOT NULL THEN
    SELECT case_id INTO p_case FROM public.service_orders WHERE id = p_order;
  END IF;
  IF p_request IS NULL OR p_case IS NULL OR p_kind NOT IN ('submission', 'result', 'invoice', 'completion')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO existing FROM public.managed_customer_notices WHERE request_id = p_request;
  IF existing.id IS NOT NULL THEN
    IF existing.case_id IS DISTINCT FROM p_case THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'success', 'replay', true);
  END IF;
  IF coalesce(p_data->>'fromAddress', '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    OR coalesce(p_data->>'replyTo', '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    OR coalesce(p_data->>'customerOrigin', '') !~ '^https://[A-Za-z0-9.-]+$'
    OR coalesce(p_data->>'subject', '') = ''
    OR coalesce(p_data->>'bodyText', '') = ''
    OR coalesce(p_data->>'bodyHtml', '') = ''
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  target := admin_private.managed_notice_target_v1(p_case, p_kind);
  notice_kind := CASE p_kind
    WHEN 'submission' THEN 'SUBMISSION'
    WHEN 'result' THEN 'RESULT'
    WHEN 'invoice' THEN 'INVOICE'
    ELSE 'COMPLETION'
  END;
  IF target IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.managed_customer_notices n
      WHERE n.case_id = p_case AND n.kind = notice_kind
    ) THEN
      RETURN jsonb_build_object('status', 'success', 'replay', true);
    END IF;
    RETURN jsonb_build_object('status', 'not_applicable');
  END IF;
  BEGIN
    comm := admin_private.queue_fulfilment_email_v1(
      p_case,
      CASE notice_kind
        WHEN 'SUBMISSION' THEN 'MANAGED_PROGRESS'
        WHEN 'RESULT' THEN 'MANAGED_RESULT'
        WHEN 'INVOICE' THEN 'MANAGED_INVOICE'
        ELSE 'MANAGED_COMPLETION'
      END,
      actor,
      p_data->>'subject',
      p_data->>'bodyText',
      p_data->>'bodyHtml',
      p_data->>'fromAddress',
      p_data->>'replyTo',
      p_data->>'customerOrigin'
    );
    INSERT INTO public.managed_customer_notices(
      request_id, case_id, kind, submission_id, invoice_id, communication_id
    ) VALUES (
      p_request, p_case, notice_kind,
      NULLIF(target->>'submissionId', '')::uuid,
      NULLIF(target->>'invoiceId', '')::uuid,
      comm
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('status', 'success', 'replay', true);
    WHEN SQLSTATE 'P0001' THEN
      RETURN jsonb_build_object(
        'status', 'denied',
        'reason', CASE WHEN position(':' IN SQLERRM) > 0 THEN split_part(SQLERRM, ':', 2) ELSE SQLERRM END
      );
  END;
  RETURN jsonb_build_object('status', 'success', 'replay', false);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_queue_managed_notice_v1(text, uuid, uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_queue_managed_notice_v1(text, uuid, uuid, text, jsonb, uuid) TO service_role;

COMMIT;
