-- Managed success verification.
-- A success fee is earned only when the contracted profile or the exact
-- contracted review is absent on two trustworthy checks at least 48 hours
-- apart, with no return or ambiguity between that pair.
-- The target is frozen from the case. An operator cannot type a different one.
-- A check time is the recording clock, or the accepted evidence upload time
-- when a reviewed historic exception is explicit. Extra checks stay in the
-- history and do not block the qualifying pair. A check is corrected by an
-- invalidation row, never by editing or deleting it.
-- Approval pins the pair. A new hosted invoice is refused without that pair,
-- and while a success-fee dispute is open or upheld.
-- A saved card is not required and nothing here charges one.
-- Do not apply this file to DEV or Production from the change that adds it.

BEGIN;

CREATE TABLE public.success_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  target_ref text NOT NULL CHECK (target_ref ~ '^https://' AND char_length(target_ref) BETWEEN 12 AND 500),
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
  IF cs.case_type = 'REVIEW_PROTECTION' THEN
    source := btrim(coalesce(cs.review_url, ''));
  ELSE
    source := btrim(coalesce((SELECT business_profile_url FROM public.locations WHERE id = cs.location_id), ''));
  END IF;
  IF source !~ '^https://' OR char_length(source) NOT BETWEEN 12 AND 500 THEN
    RAISE EXCEPTION 'success_baseline:target' USING ERRCODE = 'P0001';
  END IF;
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
  IF NEW.kind = 'INVOICE_PAYMENT' AND EXISTS (
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
  IF ob.kind = 'SUCCESS_FEE' AND EXISTS (
    SELECT 1 FROM public.success_fee_collection_pauses pause
    WHERE pause.service_order_id = ord.id AND pause.status IN ('OPEN', 'UPHELD')
  ) THEN
    RETURN jsonb_build_object('status','denied','reason','collection_paused');
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
  IF cs.case_type = 'REVIEW_PROTECTION' THEN
    source := btrim(coalesce(cs.review_url, ''));
  ELSE
    source := btrim(coalesce((SELECT business_profile_url FROM public.locations WHERE id = cs.location_id), ''));
  END IF;
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
  action text;
  outcome text;
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
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', true, 'pauseStatus', existing.status);
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
    RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false, 'pauseStatus', existing.status);
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
  RETURN jsonb_build_object('status', 'success', 'id', existing.id, 'replay', false, 'pauseStatus', existing.status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_success_fee_dispute_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_success_fee_dispute_v1(text, uuid, jsonb) TO service_role;

COMMIT;
