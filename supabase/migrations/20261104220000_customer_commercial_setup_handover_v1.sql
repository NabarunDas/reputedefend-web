BEGIN;

-- CUSTOMER-PLATFORM-03A-03-03-01. Repository only. This file is not the DEV
-- ledger head. The verified DEV ledger contains 103 entries and ends at
-- canonical 20261104190000. Do not apply 20261104220000 to DEV. Do not apply 20261104220000 to Production.
-- Do not replay 20261104190000.
--
-- Read-only handover for a paid Telloya or Complete subscription. It derives
-- the setup queue from the subscription, acceptance, checkout preparation,
-- payment evidence, membership, selected locations, and any Telloya provision
-- that already exists. It creates no customer, subscription, entitlement,
-- provision, allocation, coverage, invitation, or payment row. It does not
-- purchase a number, call a provider, send mail, or move a provision to LIVE.
-- containsDataChange is false. safeToReplay is false.

CREATE FUNCTION admin_private.commercial_setup_handover_v1(p_subscription uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  sub public.commercial_subscriptions;
  acceptance public.commercial_offer_acceptances;
  preparation_id uuid;
  preparation_acceptance uuid;
  preparation_customer uuid;
  preparation_business uuid;
  preparation_amount integer;
  preparation_currency char(3);
  preparation_cadence text;
  membership text;
  business_name text;
  customer_name text;
  evidence_count integer := 0;
  matching_count integer := 0;
  confirmed_at timestamptz;
  telloya_locations jsonb := '[]'::jsonb;
  guard_locations jsonb := '[]'::jsonb;
  provision_count integer := 0;
  provision_states text[] := ARRAY[]::text[];
  agent_ready boolean := false;
  number_ready boolean := false;
  test_ready boolean := false;
  confirmation_ready boolean := false;
  locations_covered boolean := false;
  live_ready boolean := false;
  verified boolean := false;
  financial text;
  operational text;
  preferences_complete boolean;
  guard_assignment text;
  display text;
  message text;
  next_action text;
BEGIN
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_subscription;
  IF sub.id IS NULL OR sub.grant_kind <> 'BILLABLE' OR sub.plan_family <> 'VOICE' THEN
    RETURN NULL;
  END IF;
  IF sub.state IN ('DRAFT', 'OFFERED', 'CANCELED', 'ENDED') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO acceptance FROM public.commercial_offer_acceptances WHERE subscription_id = sub.id;
  IF acceptance.id IS NULL
    OR acceptance.customer_id IS DISTINCT FROM sub.customer_id
    OR acceptance.business_id IS DISTINCT FROM sub.business_id
    OR acceptance.plan_version_id IS DISTINCT FROM sub.plan_version_id
    OR acceptance.product_code NOT IN ('TELLOYA', 'COMPLETE')
    OR acceptance.currency <> 'GBP'
    OR acceptance.cadence <> 'MONTH'
  THEN
    RETURN NULL;
  END IF;

  SELECT status INTO membership
  FROM public.business_memberships
  WHERE customer_id = sub.customer_id AND business_id = sub.business_id;
  IF membership IS DISTINCT FROM 'verified' THEN
    RETURN NULL;
  END IF;

  SELECT display_name INTO business_name FROM public.businesses WHERE id = sub.business_id;
  SELECT full_name INTO customer_name FROM public.customers WHERE id = sub.customer_id;

  SELECT id, acceptance_id, customer_id, business_id, amount_minor, currency, cadence
  INTO preparation_id, preparation_acceptance, preparation_customer, preparation_business,
       preparation_amount, preparation_currency, preparation_cadence
  FROM public.commercial_checkout_preparations
  WHERE subscription_id = sub.id;

  -- One evidence row must be the subscription's recorded period. A stale,
  -- renewal, or otherwise unrelated row is not proof of that period.
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE amount_minor = acceptance.amount_minor
             AND currency = 'GBP'
             AND sub.current_period_start IS NOT NULL
             AND sub.current_period_end IS NOT NULL
             AND period_start = sub.current_period_start
             AND period_end = sub.current_period_end
         )::integer,
         min(created_at) FILTER (
           WHERE amount_minor = acceptance.amount_minor
             AND currency = 'GBP'
             AND sub.current_period_start IS NOT NULL
             AND sub.current_period_end IS NOT NULL
             AND period_start = sub.current_period_start
             AND period_end = sub.current_period_end
         )
  INTO evidence_count, matching_count, confirmed_at
  FROM public.commercial_payment_evidence
  WHERE subscription_id = sub.id;

  verified := sub.state = 'ACTIVE'
    AND sub.amount_minor = acceptance.amount_minor
    AND sub.currency = 'GBP'
    AND sub.current_period_start IS NOT NULL
    AND sub.current_period_end IS NOT NULL
    AND sub.current_period_end > sub.current_period_start
    AND evidence_count = 1
    AND matching_count = 1
    AND preparation_id IS NOT NULL
    AND preparation_acceptance = acceptance.id
    AND preparation_customer = sub.customer_id
    AND preparation_business = sub.business_id
    AND preparation_amount = acceptance.amount_minor
    AND preparation_currency = 'GBP'
    AND preparation_cadence = 'MONTH';
  IF sub.state = 'PAYMENT_PENDING' THEN
    financial := 'awaiting_payment';
  ELSIF verified THEN
    financial := 'verified';
  ELSE
    financial := 'unverified';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'locationId', chosen.id,
    'locationName', COALESCE(NULLIF(pg_catalog.btrim(chosen.location_name), ''), 'Selected location')
  ) ORDER BY chosen.id), '[]'::jsonb)
  INTO telloya_locations
  FROM (
    SELECT DISTINCT location.id, location.location_name
    FROM public.onboarding_requests request
    JOIN admin_private.onboarding_request_locations selected
      ON selected.onboarding_request_id = request.id
    JOIN public.locations location
      ON location.id = selected.location_id
     AND location.business_id = sub.business_id
    WHERE request.commercial_subscription_id = sub.id
      AND request.customer_id = sub.customer_id
      AND request.business_id = sub.business_id
  ) chosen;

  -- Selected onboarding locations are not Guard assignments. Name a Guard
  -- location only from an open bundle allocation for this subscription.
  IF acceptance.guard_quantity > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'locationId', location.id,
      'locationName', COALESCE(NULLIF(pg_catalog.btrim(location.location_name), ''), 'Selected location')
    ) ORDER BY location.id), '[]'::jsonb)
    INTO guard_locations
    FROM public.bundle_guard_allocations allocation
    JOIN public.locations location
      ON location.id = allocation.location_id
     AND location.business_id = allocation.business_id
    WHERE allocation.subscription_id = sub.id
      AND allocation.customer_id = sub.customer_id
      AND allocation.business_id = sub.business_id
      AND allocation.component_code = 'GUARD'
      AND allocation.state IN ('RESERVED', 'PREVIEW');
  END IF;
  guard_assignment := CASE
    WHEN acceptance.guard_quantity = 0 THEN 'not_applicable'
    WHEN jsonb_array_length(guard_locations) = 0 THEN 'pending_confirmation'
    ELSE 'recorded'
  END;

  SELECT count(*)::integer,
         COALESCE(array_agg(provision.state), ARRAY[]::text[]),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.agent_configured_at IS NOT NULL
         ), false),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.provider_binding_ref IS NOT NULL
           AND pg_catalog.btrim(provision.provider_binding_ref) <> ''
           AND provision.number_allocated_at IS NOT NULL
           AND provision.forwarding_instructed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.provider_test_call_ref IS NOT NULL
           AND pg_catalog.btrim(provision.provider_test_call_ref) <> ''
           AND provision.provider_test_outcome = 'PASSED'
           AND provision.agent_test_passed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(
           provision.business_id = entitlement.business_id
           AND provision.location_id = entitlement.location_id
           AND entitlement.business_id = sub.business_id
           AND entitlement.commercial_subscription_id = sub.id
           AND provision.customer_confirmed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(provision.state = 'LIVE' AND provision.live_at IS NOT NULL), false)
  INTO provision_count, provision_states, agent_ready, number_ready, test_ready, confirmation_ready, live_ready
  FROM public.product_entitlements entitlement
  JOIN public.service_provisions provision ON provision.entitlement_id = entitlement.id
  WHERE entitlement.commercial_subscription_id = sub.id
    AND entitlement.business_id = sub.business_id
    AND entitlement.component_code = 'TELLOYA'
    AND entitlement.state IN ('PENDING', 'ELIGIBLE');

  IF provision_count = 0 OR provision_states <@ ARRAY['NOT_STARTED']::text[] THEN
    operational := 'not_started';
  ELSIF provision_states <@ ARRAY['LIVE']::text[] AND live_ready THEN
    operational := 'active';
  ELSIF provision_states <@ ARRAY['READY_FOR_PROVIDER_VERIFICATION']::text[] THEN
    operational := 'awaiting_verification';
  ELSE
    operational := 'setup_started';
  END IF;

  SELECT provision_count > 0 AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(telloya_locations) AS selected(location)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.product_entitlements entitlement
      JOIN public.service_provisions provision ON provision.entitlement_id = entitlement.id
      WHERE entitlement.commercial_subscription_id = sub.id
        AND entitlement.business_id = sub.business_id
        AND entitlement.component_code = 'TELLOYA'
        AND entitlement.state IN ('PENDING', 'ELIGIBLE')
        AND entitlement.location_id = (selected.location ->> 'locationId')::uuid
        AND provision.business_id = entitlement.business_id
        AND provision.location_id = entitlement.location_id
    )
  ) INTO locations_covered;

  -- The schema has no authoritative business or voice-service preference
  -- confirmation. Selected locations do not complete this step, and payment
  -- does not record one. A later command has to store that evidence.
  -- A READY provision state does not fill any missing check below.
  preferences_complete := false;
  IF financial = 'verified' AND operational = 'not_started' THEN
    display := 'Payment received — setup pending';
    message := 'Your subscription payment has been confirmed. We''re preparing your service and will guide you through the remaining setup steps.';
    next_action := 'Begin setup';
  ELSIF financial = 'verified' AND operational IN ('setup_started', 'awaiting_verification') THEN
    display := CASE
      WHEN operational = 'awaiting_verification' THEN 'Awaiting final verification'
      ELSE 'Setup in progress'
    END;
    message := NULL;
    next_action := CASE
      WHEN NOT preferences_complete THEN 'Confirm business preferences'
      WHEN NOT locations_covered THEN 'Begin setup'
      WHEN NOT agent_ready THEN 'Confirm AI configuration'
      WHEN NOT number_ready THEN 'Record provider and number allocation'
      WHEN NOT test_ready THEN 'Record successful test call'
      WHEN NOT confirmation_ready THEN 'Request customer forwarding confirmation'
      WHEN operational = 'awaiting_verification' THEN 'Approve activation'
      ELSE 'Confirm business preferences'
    END;
  ELSIF financial = 'verified' AND operational = 'active' THEN
    display := 'Service active';
    message := NULL;
    next_action := NULL;
  ELSE
    display := 'Payment pending';
    message := NULL;
    next_action := NULL;
    confirmed_at := NULL;
  END IF;

  RETURN jsonb_build_object(
    'reference', sub.public_ref,
    'customerName', customer_name,
    'businessId', sub.business_id,
    'businessName', business_name,
    'product', CASE acceptance.product_code WHEN 'COMPLETE' THEN 'Complete' ELSE 'Telloya' END,
    'plan', acceptance.plan_tier,
    'monthlyPriceMinor', acceptance.amount_minor,
    'currency', 'GBP',
    'locations', telloya_locations,
    'guardLocationCount', acceptance.guard_quantity,
    'guard', jsonb_build_object(
      'included', acceptance.guard_quantity > 0,
      'status', CASE WHEN acceptance.guard_quantity > 0 THEN 'pending_setup' ELSE 'not_subscribed' END,
      'quantity', acceptance.guard_quantity,
      'monitoringActive', false,
      'assignment', guard_assignment,
      'locations', guard_locations
    ),
    'financialStatus', financial,
    'paymentScope', CASE WHEN financial = 'verified' THEN 'initial_settlement' ELSE NULL END,
    'periodStart', CASE WHEN financial = 'verified' THEN sub.current_period_start ELSE NULL END,
    'periodEnd', CASE WHEN financial = 'verified' THEN sub.current_period_end ELSE NULL END,
    'operationalStatus', operational,
    'customerDisplay', display,
    'message', message,
    'paymentConfirmedAt', CASE WHEN financial = 'verified' THEN confirmed_at ELSE NULL END,
    'nextAction', next_action,
    'checklist', jsonb_build_array(
      jsonb_build_object('key', 'payment', 'label', 'Payment confirmed', 'state', CASE WHEN financial = 'verified' THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'preferences', 'label', 'Business and service preferences', 'state', CASE WHEN preferences_complete THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'agent', 'label', 'AI receptionist configuration', 'state', CASE WHEN agent_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'number', 'label', 'Telephone number and forwarding', 'state', CASE WHEN number_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'test', 'label', 'Test call and verification', 'state', CASE WHEN test_ready THEN 'complete' ELSE 'planned' END),
      jsonb_build_object('key', 'activation', 'label', 'Service activation', 'state', CASE WHEN live_ready THEN 'complete' ELSE 'planned' END)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_setup_handover_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_commercial_setup_queue_v1(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  items jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(built.item ORDER BY built.item ->> 'paymentConfirmedAt', built.item ->> 'reference'), '[]'::jsonb)
  INTO items
  FROM (
    SELECT admin_private.commercial_setup_handover_v1(subscription.id) AS item
    FROM public.commercial_subscriptions subscription
    WHERE subscription.state = 'ACTIVE'
      AND subscription.grant_kind = 'BILLABLE'
  ) built
  WHERE built.item IS NOT NULL
    AND built.item ->> 'financialStatus' = 'verified'
    AND built.item ->> 'operationalStatus' IS DISTINCT FROM 'active';
  RETURN jsonb_build_object('items', items);
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_setup_queue_v1(text) IS
  'Read-only Admin queue of paid Telloya and Complete subscriptions whose service setup is not active. A payment-pending subscription is omitted. It does not provision a service.';

REVOKE ALL ON FUNCTION public.admin_commercial_setup_queue_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_setup_queue_v1(text) TO service_role;

CREATE FUNCTION public.customer_portal_setup_handover_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess jsonb;
  customer uuid;
  subscriptions jsonb;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  SELECT COALESCE(jsonb_agg(
    (built.item - 'customerName' - 'businessId' - 'plan' - 'monthlyPriceMinor' - 'currency' - 'guardLocationCount' - 'nextAction')
    ORDER BY built.item ->> 'reference'
  ), '[]'::jsonb)
  INTO subscriptions
  FROM (
    SELECT admin_private.commercial_setup_handover_v1(subscription.id) AS item
    FROM public.commercial_subscriptions subscription
    WHERE subscription.customer_id = customer
      AND subscription.grant_kind = 'BILLABLE'
      AND subscription.state IN ('ACCEPTED', 'PAYMENT_PENDING', 'ACTIVE')
  ) built
  WHERE built.item IS NOT NULL;
  RETURN jsonb_build_object('subscriptions', subscriptions);
END;
$$;

COMMENT ON FUNCTION public.customer_portal_setup_handover_v1(text) IS
  'Read-only setup handover for the signed-in customer. Verified payment is the initial settlement for the subscription''s recorded period. Setup pending is not setup in progress. Guard locations come only from an open allocation, and monitoring is not started.';

REVOKE ALL ON FUNCTION public.customer_portal_setup_handover_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_setup_handover_v1(text) TO service_role;

-- Replace the applied products projection. The previous body named the first
-- selected locations as Guard locations. This body keeps that function's
-- signature, session check, and grants, and names a Guard location only from
-- an open allocation. A paid package with no allocation stays pending without
-- a fabricated location. Existing coverage with its own locations is left as
-- the private read returned it.

CREATE OR REPLACE FUNCTION public.customer_portal_products_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base jsonb;
  sess jsonb;
  customer uuid;
  paid record;
  businesses jsonb;
  rebuilt jsonb;
  entry jsonb;
  found boolean;
  telloya_pending jsonb;
  guard_pending jsonb;
  telloya_locations jsonb;
  guard_locations jsonb;
BEGIN
  base := admin_private.customer_portal_products_v1(p_token_hash);
  IF base IS NOT NULL
    AND coalesce(base #>> '{reads,telloya}', '') = 'ok'
  THEN
    sess := admin_private.customer_portal_session_v1(p_token_hash);
  END IF;
  IF sess IS NOT NULL THEN
    customer := (sess ->> 'customerId')::uuid;
    businesses := coalesce(base -> 'businesses', '[]'::jsonb);
    FOR paid IN
      SELECT
        business.id AS business_id,
        business.display_name AS business_name,
        preparation.guard_quantity AS guard_quantity,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'locationName', COALESCE(NULLIF(btrim(location.location_name), ''), 'Selected location'),
            'status', 'pending',
            'nextStep', 'Payment received. Your AI receptionist setup has not started.'
          ) ORDER BY location.id)
          FROM public.onboarding_requests request
          JOIN admin_private.onboarding_request_locations selected
            ON selected.onboarding_request_id = request.id
          JOIN public.locations location ON location.id = selected.location_id
          WHERE request.commercial_subscription_id = subscription.id
            AND request.business_id = business.id
            AND request.customer_id = customer
        ), '[]'::jsonb) AS telloya_locations,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'locationName', COALESCE(NULLIF(btrim(location.location_name), ''), 'Selected location'),
            'status', 'pending',
            'monitoringRecorded', false,
            'allocation', CASE allocation.state WHEN 'PREVIEW' THEN 'preview' WHEN 'RESERVED' THEN 'reserved' ELSE NULL END,
            'nextStep', 'Included in your package. Monitoring setup is pending.'
          ) ORDER BY location.id)
          FROM public.bundle_guard_allocations allocation
          JOIN public.locations location
            ON location.id = allocation.location_id
           AND location.business_id = allocation.business_id
          WHERE allocation.subscription_id = subscription.id
            AND allocation.customer_id = customer
            AND allocation.business_id = business.id
            AND allocation.component_code = 'GUARD'
            AND allocation.state IN ('RESERVED', 'PREVIEW')
        ), '[]'::jsonb) AS guard_locations
      FROM public.commercial_subscriptions subscription
      JOIN public.commercial_checkout_preparations preparation
        ON preparation.subscription_id = subscription.id
      JOIN public.businesses business ON business.id = subscription.business_id
      JOIN public.business_memberships membership
        ON membership.business_id = subscription.business_id
       AND membership.customer_id = customer
       AND membership.status = 'verified'
      JOIN public.commercial_subscription_items item
        ON item.subscription_id = subscription.id
       AND item.component_code = 'TELLOYA'
      WHERE subscription.state = 'ACTIVE'
        AND subscription.grant_kind = 'BILLABLE'
        AND subscription.customer_id = customer
        AND EXISTS (
          SELECT 1 FROM public.commercial_payment_evidence evidence
          WHERE evidence.subscription_id = subscription.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.product_entitlements entitlement
          WHERE entitlement.commercial_subscription_id = subscription.id
            AND entitlement.state IN ('PENDING', 'ELIGIBLE')
        )
      ORDER BY business.id
    LOOP
      telloya_locations := paid.telloya_locations;
      IF jsonb_array_length(telloya_locations) = 0 THEN
        telloya_locations := jsonb_build_array(jsonb_build_object(
          'locationName', 'Selected location',
          'status', 'pending',
          'nextStep', 'Payment received. Your AI receptionist setup has not started.'
        ));
      END IF;
      telloya_pending := jsonb_build_object('status', 'pending', 'locations', telloya_locations);
      guard_locations := paid.guard_locations;
      guard_pending := CASE
        WHEN paid.guard_quantity > 0 THEN jsonb_build_object(
          'status', 'pending',
          'includedQuantity', paid.guard_quantity,
          'assignment', CASE
            WHEN jsonb_array_length(guard_locations) = 0 THEN 'pending_confirmation'
            ELSE 'recorded'
          END,
          'locations', guard_locations
        )
        ELSE NULL
      END;
      found := false;
      rebuilt := '[]'::jsonb;
      FOR entry IN SELECT value FROM jsonb_array_elements(businesses) AS listed(value)
      LOOP
        IF entry ->> 'businessId' = paid.business_id::text THEN
          found := true;
          IF coalesce(entry #>> '{telloya,status}', '') IN ('not_subscribed', 'pending')
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(coalesce(entry #> '{telloya,locations}', '[]'::jsonb)) AS loc(value)
              WHERE loc.value ->> 'status' IN ('active', 'ready_for_provider')
            )
          THEN
            entry := jsonb_set(entry, '{telloya}', telloya_pending, true);
          END IF;
          IF guard_pending IS NOT NULL
            AND coalesce(entry #>> '{guard,status}', '') IN ('not_subscribed', 'pending')
            AND jsonb_array_length(coalesce(entry #> '{guard,locations}', '[]'::jsonb)) = 0
          THEN
            entry := jsonb_set(entry, '{guard}', guard_pending, true);
          END IF;
        END IF;
        rebuilt := rebuilt || jsonb_build_array(entry);
      END LOOP;
      IF NOT found THEN
        rebuilt := rebuilt || jsonb_build_array(jsonb_build_object(
          'businessId', paid.business_id,
          'businessName', paid.business_name,
          'telloya', telloya_pending,
          'guard', COALESCE(guard_pending, jsonb_build_object('status', 'not_subscribed', 'locations', '[]'::jsonb))
        ));
      END IF;
      businesses := rebuilt;
    END LOOP;
    base := jsonb_set(base, '{businesses}', businesses, true);
  END IF;
  IF base IS NOT NULL AND jsonb_typeof(base -> 'businesses') = 'array' THEN
    SELECT COALESCE(jsonb_agg(listed.entry - 'businessId' ORDER BY listed.ordinality), '[]'::jsonb)
    INTO businesses
    FROM jsonb_array_elements(base -> 'businesses') WITH ORDINALITY AS listed(entry, ordinality);
    base := jsonb_set(base, '{businesses}', businesses, true);
  END IF;
  RETURN base;
END;
$$;

COMMENT ON FUNCTION public.customer_portal_products_v1(text) IS
  'Read-only Customer Portal products projection. Accepts only a portal session token hash. A paid commercial subscription stays pending until its own setup exists. Guard locations come only from an open allocation. Monitoring is not started from a package quantity.';

REVOKE ALL ON FUNCTION public.customer_portal_products_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_products_v1(text) TO service_role;

COMMIT;
