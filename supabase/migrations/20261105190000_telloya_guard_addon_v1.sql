-- Telloya optional Relaunch Guard on an approved Telloya plan.
-- Additive repository source only. Not applied to hosted DEV or Production.
-- Do not apply 20261105190000 to DEV. Do not apply 20261105190000 to Production.
-- Do not replay 20261105120000. Do not apply 20261105120000 to Production.
-- Do not apply 20261105130000, 20261105144256, or 20261105180000.
-- No plan, agreement, price, subscription, acceptance, or Stripe object is inserted.
-- Enquiry guardInterested and guardLocationCount stay interest. They do not authorise a charge.
-- A purchased Guard location is not monitoring and does not activate Guard.

BEGIN;

CREATE TABLE admin_private.commercial_offer_guard_locations (
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (subscription_id, location_id)
);

COMMENT ON TABLE admin_private.commercial_offer_guard_locations IS
  'Locations an administrator confirmed for optional Relaunch Guard on one Telloya offer. The count is this set, not the Telloya location count and not the enquiry interest count. A row does not start monitoring.';

ALTER TABLE admin_private.commercial_offer_guard_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE admin_private.commercial_offer_guard_locations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.guard_commercial_offer_guard_locations_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  parent public.commercial_subscriptions;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'confirmed Guard locations are immutable';
  END IF;
  SELECT * INTO parent FROM public.commercial_subscriptions WHERE id = NEW.subscription_id;
  IF parent.id IS NULL OR parent.state IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Guard locations can be confirmed only while the offer is a draft';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.locations location
    WHERE location.id = NEW.location_id
      AND location.business_id = parent.business_id
  ) THEN
    RAISE EXCEPTION 'Guard location must belong to the subscription business';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER commercial_offer_guard_locations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON admin_private.commercial_offer_guard_locations
  FOR EACH ROW EXECUTE FUNCTION admin_private.guard_commercial_offer_guard_locations_v1();

CREATE FUNCTION admin_private.commercial_billable_amount_v1(p_subscription uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  sub public.commercial_subscriptions;
  plan public.plan_versions;
  conditions public.commercial_plan_conditions;
  guard_rows integer := 0;
  guard_qty integer := 0;
  snapshots_match boolean := false;
  guard_component integer := 0;
  location_count integer := 0;
BEGIN
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_subscription;
  IF sub.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO plan FROM public.plan_versions WHERE id = sub.plan_version_id;
  IF plan.id IS NULL OR plan.amount_minor IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT count(*)::integer,
         coalesce(sum(item.quantity), 0)::integer,
         coalesce(bool_and(item.quantity = item.quantity_limit_snapshot), false)
  INTO guard_rows, guard_qty, snapshots_match
  FROM public.commercial_subscription_items item
  WHERE item.subscription_id = sub.id
    AND item.component_code = 'GUARD';
  SELECT count(*)::integer INTO guard_component
  FROM public.plan_components component
  WHERE component.plan_version_id = plan.id
    AND component.component_code = 'GUARD';
  IF plan.product_code = 'TELLOYA' AND guard_rows > 0 AND guard_component = 0 THEN
    SELECT * INTO conditions
    FROM public.commercial_plan_conditions
    WHERE plan_version_id = plan.id
      AND status = 'APPROVED';
    SELECT count(*)::integer INTO location_count
    FROM admin_private.commercial_offer_guard_locations chosen
    WHERE chosen.subscription_id = sub.id;
    IF conditions.id IS NULL
      OR conditions.base_amount_minor IS DISTINCT FROM plan.amount_minor
      OR conditions.guard_unit_amount_minor IS DISTINCT FROM 999
      OR guard_rows IS DISTINCT FROM 1
      OR snapshots_match IS DISTINCT FROM true
      OR guard_qty < 1
      OR location_count IS DISTINCT FROM guard_qty
      OR plan.currency IS DISTINCT FROM 'GBP'
      OR plan.billing_cadence IS DISTINCT FROM 'MONTH'
    THEN
      RETURN NULL;
    END IF;
    RETURN plan.amount_minor + 999 * guard_qty;
  END IF;
  RETURN plan.amount_minor;
END;
$$;

COMMENT ON FUNCTION admin_private.commercial_billable_amount_v1(uuid) IS
  'Billable amount for one commercial subscription. Telloya alone and Complete stay on the approved plan amount. Telloya plus confirmed Guard locations is the plan amount plus 999 minor units for each confirmed location.';

REVOKE ALL ON FUNCTION admin_private.guard_commercial_offer_guard_locations_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_billable_amount_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION admin_private.guard_commercial_subscription_v1()
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
      NEW.tax_behaviour IS DISTINCT FROM plan.tax_behaviour
      OR NEW.amount_minor IS DISTINCT FROM admin_private.commercial_billable_amount_v1(NEW.id)
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

  IF NEW.grant_kind = 'BILLABLE' AND NEW.state = 'ACTIVE' AND (TG_OP = 'INSERT' OR OLD.state IS DISTINCT FROM 'ACTIVE') THEN
    IF coalesce(current_setting('admin_private.commercial_settlement_lease', true), '') = ''
      OR coalesce(current_setting('admin_private.commercial_settlement_event', true), '') = ''
      OR NEW.current_period_start IS NULL
      OR NEW.current_period_end IS NULL
      OR NEW.current_period_end <= NEW.current_period_start
      OR NEW.stripe_customer_id IS NULL
      OR NEW.stripe_subscription_id IS NULL
      OR NEW.cancel_at_period_end
      OR NOT EXISTS (
        SELECT 1
        FROM public.commercial_payment_evidence evidence
        WHERE evidence.subscription_id = NEW.id
          AND evidence.provider_event_id = current_setting('admin_private.commercial_settlement_event', true)
          AND evidence.amount_minor = NEW.amount_minor
          AND evidence.currency = NEW.currency
          AND evidence.period_start = NEW.current_period_start
          AND evidence.period_end = NEW.current_period_end
      )
      OR NOT EXISTS (
        SELECT 1
        FROM admin_private.jobs job
        JOIN admin_private.job_outbox outbox ON outbox.id = job.outbox_id
        WHERE job.status = 'RUNNING'
          AND job.lease_owner = 'dev-payment-events'
          AND job.lease_token::text = current_setting('admin_private.commercial_settlement_lease', true)
          AND job.lease_expires_at >= pg_catalog.now()
          AND outbox.topic = 'PROCESS_STRIPE_EVENT'
          AND outbox.payload->>'eventId' = current_setting('admin_private.commercial_settlement_event', true)
          AND outbox.payload->>'eventType' = 'invoice.paid'
          AND outbox.payload->>'livemode' = 'false'
      )
    THEN
      RAISE EXCEPTION 'billable subscription cannot become active until trusted payment evidence exists';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.guard_commercial_subscription_item_v1()
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
    IF NEW.component_code = 'GUARD'
      AND NEW.quantity >= 1
      AND NEW.quantity_limit_snapshot = NEW.quantity
      AND EXISTS (
        SELECT 1
        FROM public.plan_versions plan
        JOIN public.product_catalogue catalogue ON catalogue.code = plan.product_code
        WHERE plan.id = parent.plan_version_id
          AND catalogue.code = 'TELLOYA'
          AND catalogue.kind = 'STANDALONE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.plan_components component
        WHERE component.plan_version_id = parent.plan_version_id
          AND component.component_code = 'GUARD'
      )
    THEN
      RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION admin_private.commercial_offer_classify_v1(p_customer uuid, p_subscription uuid)
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
  ELSIF sub.state IN ('ACCEPTED', 'PAYMENT_PENDING') THEN
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
    OR (
      plan.amount_minor IS DISTINCT FROM sub.amount_minor
      AND sub.amount_minor IS DISTINCT FROM admin_private.commercial_billable_amount_v1(sub.id)
    )
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
        'subscriptionState', sub.state,
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
    'guardLocations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'locationId', location.id,
        'locationName', coalesce(nullif(pg_catalog.btrim(location.location_name), ''), 'Selected location')
      ) ORDER BY location.location_name, location.id)
      FROM admin_private.commercial_offer_guard_locations chosen
      JOIN public.locations location ON location.id = chosen.location_id
      WHERE chosen.subscription_id = sub.id
    ), '[]'::jsonb),
    'planVersionId', sub.plan_version_id,
    'subscriptionId', sub.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_private.commercial_offer_customer_view_v1(p_classified jsonb)
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
      'guardLocations', coalesce(p_classified -> 'guardLocations', '[]'::jsonb),
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
      'payment', jsonb_build_object(
        'state', CASE
          WHEN p_classified ->> 'cadence' IS DISTINCT FROM 'MONTH'
            OR p_classified ->> 'taxBehaviour' IS DISTINCT FROM 'NOT_APPLICABLE' THEN 'unsupported'
          WHEN p_classified ->> 'subscriptionState' = 'PAYMENT_PENDING' THEN 'started'
          ELSE 'preparing'
        END,
        'cadence', p_classified ->> 'cadence',
        'totalMinor', p_classified -> 'totalMinor',
        'guardChargeMinor', CASE
          WHEN coalesce((p_classified -> 'conditions' ->> 'guardIncluded')::boolean, false) THEN
            to_jsonb(
              coalesce((p_classified -> 'conditions' ->> 'guardUnitMinor')::integer, 0)
              * coalesce((p_classified -> 'conditions' ->> 'guardQuantity')::integer, 0)
            )
          ELSE 'null'::jsonb
        END
      ),
      'nextStep', CASE
        WHEN p_classified ->> 'cadence' IS DISTINCT FROM 'MONTH'
          OR p_classified ->> 'taxBehaviour' IS DISTINCT FROM 'NOT_APPLICABLE' THEN
          'This offer is accepted. This billing arrangement is not ready for secure payment. Nothing has been paid and the service has not started.'
        WHEN p_classified ->> 'subscriptionState' = 'PAYMENT_PENDING' THEN
          'This offer is accepted. Payment has not been completed. Returning from a payment page does not record a payment. Nothing has been paid and the service has not started.'
        ELSE
          'This offer is accepted. Payment has not been completed. Payment setup is being prepared. Nothing has been paid and the service has not started.'
      END
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

CREATE OR REPLACE FUNCTION public.customer_portal_commercial_offer_command_v1(
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
    OR (
      locked_plan.amount_minor IS DISTINCT FROM sub.amount_minor
      AND sub.amount_minor IS DISTINCT FROM admin_private.commercial_billable_amount_v1(sub.id)
    )
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
      'guardLocations', coalesce(classified -> 'guardLocations', '[]'::jsonb),
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

CREATE OR REPLACE FUNCTION public.commercial_payment_settle_initial_invoice_v1(
  p_job uuid,
  p_lease uuid,
  p_facts jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  outbox admin_private.job_outbox;
  rec admin_private.stripe_event_receipts;
  job admin_private.jobs;
  prep public.commercial_checkout_preparations;
  sub public.commercial_subscriptions;
  acc public.commercial_offer_acceptances;
  plan public.plan_versions;
  event_id text;
  invoice_id text;
  session_id text;
  stripe_customer text;
  stripe_subscription text;
  stripe_price text;
  amount_paid integer;
  amount_due integer;
  quantity integer;
  line_count integer;
  discount_minor integer;
  tax_minor integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  matches integer;
BEGIN
  IF p_job IS NULL OR p_lease IS NULL OR p_facts IS NULL OR jsonb_typeof(p_facts) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid', 'retryable', false);
  END IF;
  -- A verified flag is not read. Settlement compares these structured facts with durable rows.
  IF p_facts ? 'verified' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid', 'retryable', false);
  END IF;
  event_id := p_facts->>'eventId';
  invoice_id := p_facts->>'invoiceId';
  IF event_id IS NULL OR event_id !~ '^evt_[A-Za-z0-9_]{4,160}$' OR invoice_id IS NULL OR invoice_id !~ '^in_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'invalid', 'retryable', false);
  END IF;

  SELECT * INTO outbox FROM admin_private.job_outbox WHERE event_key = 'process-stripe-event:' || event_id FOR UPDATE;
  IF outbox.id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'missing', 'retryable', false);
  END IF;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = event_id FOR UPDATE;
  SELECT * INTO job FROM admin_private.jobs WHERE id = p_job FOR UPDATE;
  IF job.id IS NULL OR job.outbox_id IS DISTINCT FROM outbox.id THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'lease', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_payment_evidence evidence
    WHERE evidence.provider_event_id = event_id
  ) AND rec.processed IS TRUE AND job.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('status', 'already_processed', 'reason', 'event', 'retryable', false);
  END IF;
  IF job.status IS DISTINCT FROM 'RUNNING'
    OR job.lease_token IS DISTINCT FROM p_lease
    OR job.lease_owner IS DISTINCT FROM 'dev-payment-events'
    OR job.lease_expires_at IS NULL
    OR job.lease_expires_at < pg_catalog.now()
    OR job.job_type IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR job.idempotency_key IS DISTINCT FROM 'process-stripe-event:' || event_id
  THEN
    RETURN jsonb_build_object('status', 'denied', 'reason', 'lease', 'retryable', false);
  END IF;
  IF outbox.topic IS DISTINCT FROM 'PROCESS_STRIPE_EVENT'
    OR outbox.payload->>'eventId' IS DISTINCT FROM event_id
    OR outbox.payload->>'eventType' IS DISTINCT FROM 'invoice.paid'
    OR outbox.payload->>'livemode' IS DISTINCT FROM 'false'
    OR outbox.payload->>'objectId' IS DISTINCT FROM invoice_id
    OR rec.provider_event_id IS NULL
    OR rec.event_type IS DISTINCT FROM 'invoice.paid'
    OR rec.livemode IS DISTINCT FROM false
    OR rec.provider_object_id IS DISTINCT FROM invoice_id
    OR rec.processed IS TRUE
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'receipt', 'retryable', false);
  END IF;
  IF EXISTS (SELECT 1 FROM public.guard_subscription_invoices guard_invoice WHERE guard_invoice.stripe_invoice_id = invoice_id) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'guard_event', 'retryable', false);
  END IF;

  IF p_facts->>'checkoutSessionId' IS NULL OR (p_facts->>'checkoutSessionId') !~ '^cs_[A-Za-z0-9][A-Za-z0-9_]{7,248}$'
    OR p_facts->>'stripeCustomerId' IS NULL OR (p_facts->>'stripeCustomerId') !~ '^cus_[A-Za-z0-9]+$'
    OR p_facts->>'stripeSubscriptionId' IS NULL OR (p_facts->>'stripeSubscriptionId') !~ '^sub_[A-Za-z0-9]+$'
    OR p_facts->>'checkoutSubscriptionId' IS NULL OR (p_facts->>'checkoutSubscriptionId') !~ '^sub_[A-Za-z0-9]+$'
    OR p_facts->>'stripePriceId' IS NULL OR (p_facts->>'stripePriceId') !~ '^price_[A-Za-z0-9]+$'
    OR p_facts->>'currency' IS NULL
    OR p_facts->>'invoiceStatus' IS NULL OR p_facts->>'billingReason' IS NULL
    OR p_facts->>'subscriptionStatus' IS NULL
    OR jsonb_typeof(p_facts->'livemode') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'automaticTax') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'trial') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'refunded') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'disputed') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'cancelAtPeriodEnd') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'schedulePresent') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'subscriptionLivemode') IS DISTINCT FROM 'boolean'
    OR coalesce(p_facts->>'amountPaidMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'amountDueMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'quantity', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'lineCount', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'discountMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'taxMinor', '') !~ '^[0-9]+$'
    OR coalesce(p_facts->>'subscriptionQuantity', '') !~ '^[0-9]+$'
    OR p_facts->>'periodStart' IS NULL OR p_facts->>'periodEnd' IS NULL
    OR p_facts->>'subscriptionCustomerId' IS NULL
    OR p_facts->>'subscriptionPriceId' IS NULL
    OR p_facts->>'subscriptionPeriodStart' IS NULL
    OR p_facts->>'subscriptionPeriodEnd' IS NULL
    OR p_facts->>'checkoutMode' IS NULL
    OR p_facts->>'checkoutStatus' IS NULL
    OR p_facts->>'checkoutPaymentStatus' IS NULL
    OR p_facts->>'checkoutCustomerId' IS NULL
    OR p_facts->>'commercialCustomerId' IS NULL
    OR p_facts->>'commercialSubscriptionId' IS NULL
    OR p_facts->>'acceptanceId' IS NULL
    OR p_facts->>'checkoutOperationId' IS NULL
    OR p_facts->>'checkoutMetadataCustomerId' IS NULL
    OR p_facts->>'checkoutMetadataSubscriptionId' IS NULL
    OR p_facts->>'checkoutMetadataAcceptanceId' IS NULL
    OR p_facts->>'checkoutMetadataOperationId' IS NULL
    OR p_facts->>'subscriptionMetadataCustomerId' IS NULL
    OR p_facts->>'subscriptionMetadataSubscriptionId' IS NULL
    OR p_facts->>'subscriptionMetadataAcceptanceId' IS NULL
    OR p_facts->>'subscriptionMetadataOperationId' IS NULL
    OR jsonb_typeof(p_facts->'checkoutLivemode') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_facts->'conflictingMetadata') IS DISTINCT FROM 'boolean'
  THEN
    RETURN jsonb_build_object('status', 'pending', 'reason', 'provider_incomplete', 'retryable', true);
  END IF;
  IF lower(p_facts->>'currency') IS DISTINCT FROM 'gbp' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'currency', 'retryable', false);
  END IF;
  IF p_facts->>'checkoutSubscriptionId' IS DISTINCT FROM p_facts->>'stripeSubscriptionId' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;

  BEGIN
    v_period_start := (p_facts->>'periodStart')::timestamptz;
    v_period_end := (p_facts->>'periodEnd')::timestamptz;
    IF (p_facts->>'subscriptionPeriodStart')::timestamptz IS DISTINCT FROM v_period_start
      OR (p_facts->>'subscriptionPeriodEnd')::timestamptz IS DISTINCT FROM v_period_end
    THEN
      RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
    END IF;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
  END;
  IF v_period_end <= v_period_start THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
  END IF;

  amount_paid := (p_facts->>'amountPaidMinor')::integer;
  amount_due := (p_facts->>'amountDueMinor')::integer;
  quantity := (p_facts->>'quantity')::integer;
  line_count := (p_facts->>'lineCount')::integer;
  discount_minor := (p_facts->>'discountMinor')::integer;
  tax_minor := (p_facts->>'taxMinor')::integer;
  session_id := p_facts->>'checkoutSessionId';
  stripe_customer := p_facts->>'stripeCustomerId';
  stripe_subscription := p_facts->>'stripeSubscriptionId';
  stripe_price := p_facts->>'stripePriceId';

  IF (p_facts->>'livemode')::boolean OR (p_facts->>'subscriptionLivemode')::boolean OR (p_facts->>'checkoutLivemode')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'livemode', 'retryable', false);
  END IF;
  IF (p_facts->>'conflictingMetadata')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'conflicting_metadata', 'retryable', false);
  END IF;
  IF p_facts->>'checkoutMode' IS DISTINCT FROM 'subscription'
    OR p_facts->>'checkoutStatus' IS DISTINCT FROM 'complete'
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'session', 'retryable', false);
  END IF;
  IF p_facts->>'checkoutPaymentStatus' IS DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'payment_failed', 'retryable', false);
  END IF;
  IF p_facts->>'checkoutCustomerId' IS DISTINCT FROM stripe_customer THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF p_facts->>'invoiceStatus' IS DISTINCT FROM 'paid' THEN
    IF p_facts->>'invoiceStatus' = 'open' THEN
      RETURN jsonb_build_object('status', 'pending', 'reason', 'invoice_unpaid', 'retryable', true);
    END IF;
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'payment_failed', 'retryable', false);
  END IF;
  IF (p_facts->>'refunded')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'refund', 'retryable', false);
  END IF;
  IF (p_facts->>'disputed')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'dispute', 'retryable', false);
  END IF;
  IF (p_facts->>'trial')::boolean OR p_facts->>'subscriptionStatus' = 'trialing' THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'trial', 'retryable', false);
  END IF;
  IF (p_facts->>'automaticTax')::boolean OR tax_minor <> 0 OR discount_minor <> 0 THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'tax', 'retryable', false);
  END IF;
  IF quantity <> 1 OR (p_facts->>'subscriptionQuantity')::integer <> 1 OR line_count <> 1 THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'quantity', 'retryable', false);
  END IF;
  IF p_facts->>'billingReason' IS DISTINCT FROM 'subscription_create' THEN
    RETURN jsonb_build_object('status', 'unsupported', 'reason', 'billing_reason', 'retryable', false);
  END IF;
  IF (p_facts->>'cancelAtPeriodEnd')::boolean OR (p_facts->>'schedulePresent')::boolean THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription_change', 'retryable', false);
  END IF;
  IF p_facts->>'subscriptionStatus' IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;
  IF p_facts->>'subscriptionCustomerId' IS DISTINCT FROM stripe_customer THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF p_facts->>'subscriptionPriceId' IS DISTINCT FROM stripe_price
    OR amount_paid <> amount_due OR amount_paid <= 0
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'amount', 'retryable', false);
  END IF;

  SELECT count(*)::int INTO matches
  FROM public.commercial_checkout_preparations preparation
  WHERE preparation.stripe_price_id = stripe_price
    AND preparation.livemode = false
    AND preparation.checkout_session_id = session_id;
  IF matches = 0 THEN
    RETURN jsonb_build_object('status', 'unmatched', 'reason', 'preparation', 'retryable', false);
  END IF;
  IF matches > 1 THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'ambiguous_price', 'retryable', false);
  END IF;
  SELECT preparation.* INTO prep
  FROM public.commercial_checkout_preparations preparation
  WHERE preparation.stripe_price_id = stripe_price
    AND preparation.livemode = false
    AND preparation.checkout_session_id = session_id
  FOR UPDATE OF preparation;
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_customer_maps map
    WHERE map.customer_id = prep.customer_id
      AND map.stripe_customer_id = stripe_customer
      AND map.livemode = false
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF p_facts->>'commercialCustomerId' IS DISTINCT FROM prep.customer_id::text
    OR p_facts->>'checkoutMetadataCustomerId' IS DISTINCT FROM prep.customer_id::text
    OR p_facts->>'subscriptionMetadataCustomerId' IS DISTINCT FROM prep.customer_id::text
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_customer', 'retryable', false);
  END IF;
  IF p_facts->>'commercialSubscriptionId' IS DISTINCT FROM prep.subscription_id::text
    OR p_facts->>'checkoutMetadataSubscriptionId' IS DISTINCT FROM prep.subscription_id::text
    OR p_facts->>'subscriptionMetadataSubscriptionId' IS DISTINCT FROM prep.subscription_id::text
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_subscription', 'retryable', false);
  END IF;
  IF p_facts->>'acceptanceId' IS DISTINCT FROM prep.acceptance_id::text
    OR p_facts->>'checkoutMetadataAcceptanceId' IS DISTINCT FROM prep.acceptance_id::text
    OR p_facts->>'subscriptionMetadataAcceptanceId' IS DISTINCT FROM prep.acceptance_id::text
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_acceptance', 'retryable', false);
  END IF;
  IF p_facts->>'checkoutOperationId' IS DISTINCT FROM prep.checkout_operation_id::text
    OR p_facts->>'checkoutMetadataOperationId' IS DISTINCT FROM prep.checkout_operation_id::text
    OR p_facts->>'subscriptionMetadataOperationId' IS DISTINCT FROM prep.checkout_operation_id::text
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_operation', 'retryable', false);
  END IF;
  IF p_facts ? 'invoiceMetadataCustomerId'
    OR p_facts ? 'invoiceMetadataSubscriptionId'
    OR p_facts ? 'invoiceMetadataAcceptanceId'
    OR p_facts ? 'invoiceMetadataOperationId'
  THEN
    IF coalesce(p_facts->>'invoiceMetadataCustomerId', '') = ''
      OR coalesce(p_facts->>'invoiceMetadataSubscriptionId', '') = ''
      OR coalesce(p_facts->>'invoiceMetadataAcceptanceId', '') = ''
      OR coalesce(p_facts->>'invoiceMetadataOperationId', '') = ''
    THEN
      RETURN jsonb_build_object('status', 'pending', 'reason', 'provider_incomplete', 'retryable', true);
    END IF;
    IF p_facts->>'invoiceMetadataCustomerId' IS DISTINCT FROM prep.customer_id::text THEN
      RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_customer', 'retryable', false);
    END IF;
    IF p_facts->>'invoiceMetadataSubscriptionId' IS DISTINCT FROM prep.subscription_id::text THEN
      RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_subscription', 'retryable', false);
    END IF;
    IF p_facts->>'invoiceMetadataAcceptanceId' IS DISTINCT FROM prep.acceptance_id::text THEN
      RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_acceptance', 'retryable', false);
    END IF;
    IF p_facts->>'invoiceMetadataOperationId' IS DISTINCT FROM prep.checkout_operation_id::text THEN
      RETURN jsonb_build_object('status', 'mismatch', 'reason', 'metadata_operation', 'retryable', false);
    END IF;
  END IF;
  PERFORM 1
  FROM public.commercial_subscriptions locked
  WHERE locked.business_id = prep.business_id
  ORDER BY locked.id
  FOR UPDATE;
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = prep.subscription_id;
  SELECT * INTO acc FROM public.commercial_offer_acceptances WHERE id = prep.acceptance_id FOR UPDATE;
  SELECT * INTO plan FROM public.plan_versions WHERE id = sub.plan_version_id;

  IF sub.id IS NULL OR acc.id IS NULL OR plan.id IS NULL
    OR acc.subscription_id IS DISTINCT FROM sub.id
    OR acc.customer_id IS DISTINCT FROM prep.customer_id
    OR acc.business_id IS DISTINCT FROM prep.business_id
    OR sub.customer_id IS DISTINCT FROM prep.customer_id
    OR sub.business_id IS DISTINCT FROM prep.business_id
    OR acc.plan_version_id IS DISTINCT FROM sub.plan_version_id
    OR acc.amount_minor IS DISTINCT FROM prep.amount_minor
    OR acc.amount_minor IS DISTINCT FROM sub.amount_minor
    OR acc.currency IS DISTINCT FROM 'GBP'
    OR sub.currency IS DISTINCT FROM 'GBP'
    OR acc.cadence IS DISTINCT FROM 'MONTH'
    OR sub.cadence_snapshot IS DISTINCT FROM 'MONTH'
    OR acc.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
    OR sub.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
    OR sub.grant_kind IS DISTINCT FROM 'BILLABLE'
    OR plan.status IS DISTINCT FROM 'APPROVED'
    OR plan.currency IS DISTINCT FROM 'GBP'
    OR plan.billing_cadence IS DISTINCT FROM 'MONTH'
    OR (
      plan.amount_minor IS DISTINCT FROM acc.amount_minor
      AND acc.amount_minor IS DISTINCT FROM admin_private.commercial_billable_amount_v1(sub.id)
    )
    OR plan.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
    OR plan.product_code IS DISTINCT FROM acc.product_code
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'snapshot', 'retryable', false);
  END IF;
  IF acc.guard_quantity IS DISTINCT FROM coalesce((
    SELECT sum(item.quantity)::integer
    FROM public.commercial_subscription_items item
    WHERE item.subscription_id = sub.id
      AND item.component_code = 'GUARD'
  ), 0) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'guard_quantity', 'retryable', false);
  END IF;
  IF acc.product_code = 'TELLOYA' AND acc.guard_quantity <> 0
    AND acc.amount_minor IS DISTINCT FROM admin_private.commercial_billable_amount_v1(sub.id)
  THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'guard_quantity', 'retryable', false);
  END IF;
  IF acc.product_code = 'COMPLETE' AND acc.guard_quantity < 0 THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'guard_quantity', 'retryable', false);
  END IF;
  IF amount_paid IS DISTINCT FROM acc.amount_minor THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'amount', 'retryable', false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships membership
    WHERE membership.customer_id = sub.customer_id
      AND membership.business_id = sub.business_id
      AND membership.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'membership', 'retryable', false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.stripe_customer_maps map
    WHERE map.customer_id = sub.customer_id
      AND map.stripe_customer_id = stripe_customer
      AND map.livemode = false
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF sub.stripe_customer_id IS NOT NULL AND sub.stripe_customer_id IS DISTINCT FROM stripe_customer THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'customer', 'retryable', false);
  END IF;
  IF sub.stripe_subscription_id IS NOT NULL AND sub.stripe_subscription_id IS DISTINCT FROM stripe_subscription THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_subscriptions other_sub
    WHERE other_sub.stripe_subscription_id = stripe_subscription AND other_sub.id <> sub.id
  ) OR EXISTS (
    SELECT 1 FROM public.guard_subscriptions guard_row
    WHERE guard_row.stripe_subscription_id = stripe_subscription
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription', 'retryable', false);
  END IF;
  IF sub.state = 'ACTIVE' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'prior_settlement', 'retryable', false);
  END IF;
  IF sub.state IN ('CANCELED', 'ENDED', 'PAST_DUE', 'PAUSED', 'CANCEL_AT_PERIOD_END') OR sub.cancel_at_period_end THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'cancellation', 'retryable', false);
  END IF;
  IF sub.state IS DISTINCT FROM 'PAYMENT_PENDING' THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'subscription_state', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_subscriptions occupying
    WHERE occupying.business_id = sub.business_id
      AND occupying.id <> sub.id
      AND occupying.state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'occupying', 'retryable', false);
  END IF;
  IF sub.succeeds_subscription_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'replacement', 'retryable', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commercial_payment_evidence evidence
    WHERE evidence.subscription_id = sub.id
      AND evidence.period_start < v_period_end
      AND v_period_start < evidence.period_end
  ) THEN
    RETURN jsonb_build_object('status', 'mismatch', 'reason', 'period', 'retryable', false);
  END IF;

  PERFORM set_config('admin_private.commercial_settlement_lease', p_lease::text, true);
  PERFORM set_config('admin_private.commercial_settlement_event', event_id, true);
  PERFORM set_config('admin_private.commercial_settlement_invoice', invoice_id, true);

  INSERT INTO public.commercial_payment_evidence(
    subscription_id, period_start, period_end, amount_minor, currency, provider_event_id
  ) VALUES (
    sub.id, v_period_start, v_period_end, acc.amount_minor, 'GBP', event_id
  );
  UPDATE public.commercial_subscriptions
    SET state = 'ACTIVE',
        stripe_customer_id = stripe_customer,
        stripe_subscription_id = stripe_subscription,
        current_period_start = v_period_start,
        current_period_end = v_period_end
    WHERE id = sub.id AND state = 'PAYMENT_PENDING';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial settlement did not activate the locked subscription';
  END IF;
  INSERT INTO public.commercial_subscription_events(subscription_id, request_id, from_state, to_state, reason)
  VALUES (sub.id, p_job, 'PAYMENT_PENDING', 'ACTIVE', 'verified_initial_invoice');
  UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = event_id AND processed IS FALSE;
  UPDATE admin_private.jobs
    SET status = 'SUCCEEDED', completed_at = pg_catalog.now(), lease_expires_at = NULL,
        lease_owner = NULL, lease_token = NULL, last_error = NULL,
        updated_at = pg_catalog.now(), record_version = job.record_version + 1
    WHERE id = job.id AND status = 'RUNNING' AND lease_token = p_lease;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial settlement lost the job lease';
  END IF;
  PERFORM admin_private.finish_job_attempt_v1(job.id, p_lease, 'SUCCEEDED', NULL);
  RETURN jsonb_build_object('status', 'settled', 'reason', 'paid_invoice', 'retryable', false, 'state', 'ACTIVE');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_commercial_command_v1(
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
  plan_count integer;
  chosen_conditions public.commercial_plan_conditions;
  composed_amount integer;
  guard_ids uuid[] := ARRAY[]::uuid[];
  addon_count integer := 0;
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
      SELECT count(*) INTO plan_count FROM public.plan_versions
      WHERE product_code = req.product_code AND status = 'APPROVED'
        AND amount_minor IS NOT NULL AND tax_behaviour = 'NOT_APPLICABLE'
        AND terms_ref IS NOT NULL AND effective_from <= pg_catalog.now()
        AND (effective_to IS NULL OR effective_to > pg_catalog.now());
      IF plan_count = 0 THEN
        RETURN jsonb_build_object('status', 'terms_unconfigured', 'id', enquiry.id, 'requestId', req.id);
      END IF;
      IF plan_count IS DISTINCT FROM 1 OR EXISTS (
        SELECT 1 FROM public.plan_versions tiered
        WHERE tiered.product_code = req.product_code AND tiered.status = 'APPROVED'
          AND tiered.tier_code IS NOT NULL
          AND tiered.amount_minor IS NOT NULL AND tiered.tax_behaviour = 'NOT_APPLICABLE'
          AND tiered.terms_ref IS NOT NULL AND tiered.effective_from <= pg_catalog.now()
          AND (tiered.effective_to IS NULL OR tiered.effective_to > pg_catalog.now())
      ) THEN
        RETURN jsonb_build_object('status', 'tier_required', 'id', enquiry.id, 'requestId', req.id);
      END IF;
      SELECT * INTO plan FROM public.plan_versions
      WHERE product_code = req.product_code AND status = 'APPROVED'
        AND tier_code IS NULL
        AND amount_minor IS NOT NULL AND tax_behaviour = 'NOT_APPLICABLE'
        AND terms_ref IS NOT NULL AND effective_from <= pg_catalog.now()
        AND (effective_to IS NULL OR effective_to > pg_catalog.now());
      IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'terms_unconfigured', 'id', enquiry.id, 'requestId', req.id);
      END IF;
    END IF;
    SELECT * INTO chosen_conditions FROM public.commercial_plan_conditions
    WHERE plan_version_id = plan.id AND status = 'APPROVED';
    IF plan.tier_code IS NOT NULL AND chosen_conditions.id IS NOT NULL
      AND chosen_conditions.tier_code IS DISTINCT FROM plan.tier_code THEN
      RETURN jsonb_build_object('status', 'tier_mismatch', 'id', enquiry.id, 'requestId', req.id);
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
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'locations', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF chosen_conditions.id IS NULL OR chosen_conditions.status IS DISTINCT FROM 'APPROVED' THEN
      RETURN jsonb_build_object(
        'status', 'terms_unconfigured',
        'reason', CASE WHEN plan.tier_code = 'CUSTOM' THEN 'quotation' ELSE 'conditions' END,
        'id', enquiry.id, 'requestId', req.id
      );
    END IF;
    IF plan.tier_code IS NOT NULL AND chosen_conditions.tier_code IS DISTINCT FROM plan.tier_code THEN
      RETURN jsonb_build_object('status', 'tier_mismatch', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF plan.currency IS DISTINCT FROM 'GBP'
      OR plan.billing_cadence IS DISTINCT FROM 'MONTH'
      OR plan.amount_minor IS NULL
      OR plan.amount_minor <= 0
      OR (
        req.product_code = 'TELLOYA'
        AND (
          chosen_conditions.base_amount_minor IS DISTINCT FROM plan.amount_minor
          OR (
            chosen_conditions.guard_unit_amount_minor IS NOT NULL
            AND chosen_conditions.guard_unit_amount_minor IS DISTINCT FROM 999
          )
        )
      )
      OR (
        req.product_code = 'COMPLETE'
        AND (
          chosen_conditions.guard_unit_amount_minor IS NULL
          OR chosen_conditions.base_amount_minor
            + chosen_conditions.guard_unit_amount_minor * guard_limit
            IS DISTINCT FROM plan.amount_minor
        )
      )
    THEN
      RETURN jsonb_build_object(
        'status', 'terms_unconfigured',
        'reason', CASE WHEN plan.tier_code = 'CUSTOM' AND plan.amount_minor IS NULL THEN 'quotation' ELSE 'price' END,
        'id', enquiry.id, 'requestId', req.id
      );
    END IF;
    IF plan.terms_ref IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.commercial_agreement_versions agreement
      WHERE agreement.product_code = plan.product_code
        AND agreement.version_ref = plan.terms_ref
        AND agreement.status = 'APPROVED'
    ) THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'agreement', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    addon_count := 0;
    guard_ids := ARRAY[]::uuid[];
    IF p_payload ? 'guardLocationIds' AND jsonb_typeof(p_payload->'guardLocationIds') = 'array' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(p_payload->'guardLocationIds') AS listed(value)
        WHERE listed.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) THEN
        RETURN jsonb_build_object('status', 'invalid');
      END IF;
      SELECT coalesce(array_agg(DISTINCT listed.value::uuid), ARRAY[]::uuid[])
      INTO guard_ids
      FROM jsonb_array_elements_text(p_payload->'guardLocationIds') AS listed(value);
      addon_count := coalesce(cardinality(guard_ids), 0);
    ELSIF p_payload ? 'guardLocationIds' AND p_payload->'guardLocationIds' IS DISTINCT FROM 'null'::jsonb THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF addon_count > 999 THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF addon_count > 0 AND EXISTS (
      SELECT 1
      FROM unnest(guard_ids) AS picked(location_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.locations location
        WHERE location.id = picked.location_id
          AND location.business_id = req.business_id
      )
    ) THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'guard', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF req.product_code = 'COMPLETE' AND addon_count > 0 THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'guard', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    IF req.product_code = 'TELLOYA' AND addon_count > 0
      AND chosen_conditions.guard_unit_amount_minor IS DISTINCT FROM 999
    THEN
      RETURN jsonb_build_object('status', 'terms_unconfigured', 'reason', 'price', 'id', enquiry.id, 'requestId', req.id);
    END IF;
    composed_amount := plan.amount_minor;
    IF req.product_code = 'TELLOYA' AND addon_count > 0 THEN
      composed_amount := plan.amount_minor + 999 * addon_count;
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
          composed_amount, plan.currency, plan.tax_behaviour, NULL, plan.billing_cadence, plan.terms_ref,
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
    IF req.product_code = 'TELLOYA' AND addon_count > 0 THEN
      INSERT INTO public.commercial_subscription_items(
        subscription_id, component_code, quantity, quantity_limit_snapshot
      ) VALUES (opened_subscription, 'GUARD', addon_count, addon_count);
      INSERT INTO admin_private.commercial_offer_guard_locations(subscription_id, location_id)
      SELECT opened_subscription, picked.location_id
      FROM unnest(guard_ids) AS picked(location_id);
    END IF;
    UPDATE public.commercial_subscriptions SET state = 'OFFERED' WHERE id = opened_subscription;
    UPDATE public.onboarding_requests
    SET commercial_subscription_id = opened_subscription, state = 'OFFERED'
    WHERE id = req.id
    RETURNING * INTO req;
    INSERT INTO public.commercial_subscription_events(subscription_id, actor_id, request_id, from_state, to_state, reason)
    VALUES (opened_subscription, actor, p_request, 'DRAFT', 'OFFERED', note);
    PERFORM admin_private.onboarding_event_v1(req.id, actor, p_request, 'prepare_offer', previous, 'OFFERED', note,
      jsonb_build_object('planVersionId', plan.id, 'tierCode', plan.tier_code, 'amountMinor', composed_amount, 'guardLocationCount', addon_count, 'taxBehaviour', plan.tax_behaviour, 'invitationSent', false, 'paymentRecorded', false));
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

CREATE OR REPLACE FUNCTION public.admin_commercial_onboarding_v1(p_token text, p_enquiry uuid)
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
  requested_tier text;
  guard_interest boolean;
  guard_interest_count integer;
  approved_plans jsonb := '[]'::jsonb;
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
    IF plan_count >= 1 AND NOT EXISTS (
      SELECT 1
      FROM public.plan_components component
      JOIN public.plan_versions plan ON plan.id = component.plan_version_id
      WHERE plan.product_code = req.product_code
        AND plan.status = 'APPROVED'
        AND plan.amount_minor IS NOT NULL
        AND plan.tax_behaviour = 'NOT_APPLICABLE'
        AND plan.terms_ref IS NOT NULL
        AND plan.effective_from <= pg_catalog.now()
        AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
        AND component.component_code = 'TELLOYA'
        AND component.quantity_limit = location_count
    ) THEN
      outstanding := outstanding || jsonb_build_array('The selected locations do not match the approved Telloya quantity. Guard is not given that same quantity. No price is offered.');
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
  requested_tier := lower(btrim(coalesce(enquiry.payload->>'planTier', '')));
  IF requested_tier NOT IN ('basic', 'growth', 'pro', 'custom') THEN
    requested_tier := NULL;
  END IF;
  guard_interest := NULL;
  guard_interest_count := NULL;
  IF jsonb_typeof(enquiry.payload->'guardInterested') = 'boolean' THEN
    guard_interest := (enquiry.payload->>'guardInterested')::boolean;
  END IF;
  IF jsonb_typeof(enquiry.payload->'guardLocationCount') = 'number'
    AND (enquiry.payload->>'guardLocationCount') ~ '^[0-9]+$' THEN
    guard_interest_count := (enquiry.payload->>'guardLocationCount')::integer;
  END IF;
  SELECT coalesce(jsonb_agg((to_jsonb(listed) - 'sort_tier') ORDER BY listed.sort_tier, listed."versionNumber"), '[]'::jsonb)
  INTO approved_plans
  FROM (
    SELECT candidate.*, (candidate."unavailableReason" IS NULL) AS offerable
    FROM (
    SELECT
      plan.id,
      plan.version_number AS "versionNumber",
      plan.tier_code AS "tierCode",
      CASE plan.tier_code
        WHEN 'BASIC' THEN 'Basic'
        WHEN 'GROWTH' THEN 'Growth'
        WHEN 'PRO' THEN 'Pro'
        WHEN 'CUSTOM' THEN 'Custom'
        ELSE NULL
      END AS "tierLabel",
      plan.amount_minor AS "amountMinor",
      plan.currency,
      plan.billing_cadence AS cadence,
      plan.terms_ref AS "termsRef",
      conditions.included_minutes AS "includedMinutes",
      conditions.base_amount_minor AS "baseAmountMinor",
      conditions.guard_unit_amount_minor AS "guardUnitMinor",
      conditions.overage_rate_minor AS "overageRateMinor",
      conditions.status AS "conditionsStatus",
      telloya.quantity_limit AS "telloyaQuantity",
      guard.quantity_limit AS "guardQuantity",
      location_count AS "selectedLocations",
      CASE
        WHEN plan.product_code = 'TELLOYA'
          AND guard.quantity_limit IS NULL
          AND conditions.guard_unit_amount_minor = 999
          AND conditions.base_amount_minor = plan.amount_minor
        THEN 999
        ELSE NULL
      END AS "guardAddonUnitMinor",
      CASE
        WHEN plan.tier_code = 'CUSTOM' AND (
          conditions.id IS NULL
          OR plan.amount_minor IS NULL
          OR conditions.base_amount_minor IS NULL
          OR conditions.status IS DISTINCT FROM 'APPROVED'
        ) THEN 'quotation'
        WHEN conditions.id IS NULL OR conditions.status IS DISTINCT FROM 'APPROVED' THEN 'conditions'
        WHEN plan.tier_code IS NOT NULL AND conditions.tier_code IS DISTINCT FROM plan.tier_code THEN 'tier'
        WHEN (plan.product_code = 'TELLOYA' AND (telloya.quantity_limit IS NULL OR guard.quantity_limit IS NOT NULL))
          OR (plan.product_code = 'COMPLETE' AND (telloya.quantity_limit IS NULL OR guard.quantity_limit IS NULL))
        THEN 'tier'
        WHEN plan.amount_minor IS NULL
          OR plan.amount_minor <= 0
          OR plan.currency IS DISTINCT FROM 'GBP'
          OR plan.billing_cadence IS DISTINCT FROM 'MONTH'
          OR plan.tax_behaviour IS DISTINCT FROM 'NOT_APPLICABLE'
          OR (
            plan.product_code = 'TELLOYA' AND (
              conditions.base_amount_minor IS DISTINCT FROM plan.amount_minor
              OR (
                conditions.guard_unit_amount_minor IS NOT NULL
                AND conditions.guard_unit_amount_minor IS DISTINCT FROM 999
              )
            )
          )
          OR (
            plan.product_code = 'COMPLETE' AND (
              conditions.guard_unit_amount_minor IS NULL
              OR conditions.base_amount_minor + conditions.guard_unit_amount_minor * guard.quantity_limit
                IS DISTINCT FROM plan.amount_minor
            )
          )
        THEN 'price'
        WHEN plan.terms_ref IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.commercial_agreement_versions agreement
          WHERE agreement.product_code = plan.product_code
            AND agreement.version_ref = plan.terms_ref
            AND agreement.status = 'APPROVED'
        ) THEN 'agreement'
        WHEN location_count = 0 OR telloya.quantity_limit IS DISTINCT FROM location_count THEN 'locations'
        ELSE NULL
      END AS "unavailableReason",
      coalesce(
        CASE plan.tier_code
          WHEN 'BASIC' THEN conditions.included_minutes = 120 AND conditions.base_amount_minor = 4900 AND plan.amount_minor = 4900
          WHEN 'GROWTH' THEN conditions.included_minutes = 300 AND conditions.base_amount_minor = 7900 AND plan.amount_minor = 7900
          WHEN 'PRO' THEN conditions.included_minutes = 500 AND conditions.base_amount_minor = 12000 AND plan.amount_minor = 12000
          WHEN 'CUSTOM' THEN conditions.included_minutes IS NULL AND plan.amount_minor = conditions.base_amount_minor
          ELSE false
        END
        AND plan.billing_cadence = 'MONTH'
        AND plan.currency = 'GBP'
        AND (conditions.guard_unit_amount_minor IS NULL OR conditions.guard_unit_amount_minor = 999)
        AND (conditions.overage_rate_minor IS NULL OR conditions.overage_rate_minor = 25)
        AND conditions.status = 'APPROVED',
        false
      ) AS "matchesApprovedSchedule",
      CASE plan.tier_code WHEN 'BASIC' THEN 1 WHEN 'GROWTH' THEN 2 WHEN 'PRO' THEN 3 WHEN 'CUSTOM' THEN 4 ELSE 5 END AS sort_tier
    FROM public.plan_versions plan
    LEFT JOIN public.commercial_plan_conditions conditions
      ON conditions.plan_version_id = plan.id AND conditions.status = 'APPROVED'
    LEFT JOIN public.plan_components telloya
      ON telloya.plan_version_id = plan.id AND telloya.component_code = 'TELLOYA'
    LEFT JOIN public.plan_components guard
      ON guard.plan_version_id = plan.id AND guard.component_code = 'GUARD'
    WHERE req.product_code IS NOT NULL
      AND plan.product_code = req.product_code
      AND plan.status = 'APPROVED'
      AND plan.effective_from <= pg_catalog.now()
      AND (plan.effective_to IS NULL OR plan.effective_to > pg_catalog.now())
  ) AS candidate
  ) AS listed;
  RETURN jsonb_build_object(
    'supported', true,
    'productHint', hint,
    'requestedTier', requested_tier,
    'requestedGuardInterest', guard_interest,
    'requestedGuardLocationCount', guard_interest_count,
    'approvedPlans', approved_plans,
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

COMMIT;
