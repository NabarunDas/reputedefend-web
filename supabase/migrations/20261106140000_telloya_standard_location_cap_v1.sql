-- Telloya standard location cap.
-- Forward-only. Not applied to DEV. Do not apply 20261106140000 to DEV.
-- Do not apply 20261106140000 to Production.
-- appliedToDev stays false until a human applies this file and records it.
-- The DEV ledger head remains 20261106003939.
-- PR #435's 20261106120000_admin_commercial_verify_agent_test_call_v1.sql
-- is a separate migration. This file does not replace its functions.
--
-- Replaces prevent_plan_overlap_v1 in full. The financial immutability
-- check, the Telloya and Complete component counts, the terms check, the
-- overlap lock and the overlap rejection stay. The added check is that an
-- approved BASIC, GROWTH or PRO plan has TELLOYA quantity_limit 1.
-- CUSTOM is not limited to one location. The quotation's quantity_limit is
-- the approved location count, and the offer command still requires the
-- onboarding locations to match it.
-- This file does not delete commercial_provider_number_owners rows, does
-- not buy or release a telephone number, and does not enable forwarding.

BEGIN;

CREATE OR REPLACE FUNCTION admin_private.prevent_plan_overlap_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  product text;
  component_count integer;
  telloya_count integer;
  guard_count integer;
  telloya_limit integer;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status IN ('APPROVED', 'RETIRED')
    AND (
      NEW.product_code IS DISTINCT FROM OLD.product_code
      OR NEW.version_number IS DISTINCT FROM OLD.version_number
      OR NEW.tier_code IS DISTINCT FROM OLD.tier_code
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
    IF NEW.tier_code IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.commercial_plan_conditions conditions
      WHERE conditions.plan_version_id = NEW.id
        AND conditions.tier_code IS DISTINCT FROM NEW.tier_code
    ) THEN
      RAISE EXCEPTION 'plan tier does not match commercial conditions';
    END IF;
  END IF;

  IF NEW.status = 'APPROVED' THEN
    SELECT component.quantity_limit INTO telloya_limit
    FROM public.plan_components component
    WHERE component.plan_version_id = NEW.id
      AND component.component_code = 'TELLOYA';
    -- Basic, Growth and Pro include exactly one Telloya operating location.
    -- Custom keeps the quantity on the approved quotation. Missing, zero,
    -- two and any other quantity fail this check. A missing component is
    -- also rejected above. This does not release a receptionist number.
    IF NEW.product_code = 'TELLOYA'
      AND NEW.tier_code IN ('BASIC', 'GROWTH', 'PRO')
      AND telloya_limit IS DISTINCT FROM 1
    THEN
      RAISE EXCEPTION 'standard Telloya plan includes exactly one location';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'telloya-plan:' || NEW.product_code || ':' || coalesce(NEW.tier_code, '')
        || CASE
          WHEN NEW.tier_code IS NULL THEN ''
          ELSE ':' || coalesce(telloya_limit::text, '')
        END,
      0
    ));
    IF EXISTS (
      SELECT 1
      FROM public.plan_versions existing
      WHERE existing.id IS DISTINCT FROM NEW.id
        AND existing.product_code = NEW.product_code
        AND existing.status = 'APPROVED'
        AND tstzrange(existing.effective_from, existing.effective_to, '[)')
          && tstzrange(NEW.effective_from, NEW.effective_to, '[)')
        AND (
          (NEW.tier_code IS NULL AND existing.tier_code IS NULL)
          OR (
            NEW.tier_code IS NOT NULL
            AND existing.tier_code = NEW.tier_code
            AND (
              SELECT component.quantity_limit
              FROM public.plan_components component
              WHERE component.plan_version_id = existing.id
                AND component.component_code = 'TELLOYA'
            ) IS NOT DISTINCT FROM telloya_limit
          )
        )
    ) THEN
      RAISE EXCEPTION 'overlapping approved plan versions are not allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


COMMENT ON FUNCTION admin_private.prevent_plan_overlap_v1() IS
  'Keeps approved plan financial fields immutable, requires one Telloya location component, requires Basic, Growth and Pro to include exactly one location, and rejects overlapping approved versions. Custom quantity stays the quoted cap. Does not release a receptionist number.';

COMMIT;
