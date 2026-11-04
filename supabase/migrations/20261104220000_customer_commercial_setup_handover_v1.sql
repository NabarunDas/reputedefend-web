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
  live_ready boolean := false;
  verified boolean := false;
  financial text;
  operational text;
  preferences_complete boolean;
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

  SELECT id, acceptance_id, customer_id, business_id, amount_minor
  INTO preparation_id, preparation_acceptance, preparation_customer, preparation_business, preparation_amount
  FROM public.commercial_checkout_preparations
  WHERE subscription_id = sub.id;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE amount_minor = acceptance.amount_minor AND currency = 'GBP')::integer,
         min(created_at) FILTER (WHERE amount_minor = acceptance.amount_minor AND currency = 'GBP')
  INTO evidence_count, matching_count, confirmed_at
  FROM public.commercial_payment_evidence
  WHERE subscription_id = sub.id;

  verified := sub.state = 'ACTIVE'
    AND evidence_count = 1
    AND matching_count = 1
    AND preparation_id IS NOT NULL
    AND preparation_acceptance = acceptance.id
    AND preparation_customer = sub.customer_id
    AND preparation_business = sub.business_id
    AND preparation_amount = acceptance.amount_minor;
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

  IF acceptance.guard_quantity > 0 THEN
    SELECT COALESCE(jsonb_agg(picked.location ORDER BY picked.location_id), '[]'::jsonb)
    INTO guard_locations
    FROM (
      SELECT location.id AS location_id,
             jsonb_build_object(
               'locationId', location.id,
               'locationName', COALESCE(NULLIF(pg_catalog.btrim(location.location_name), ''), 'Selected location')
             ) AS location
      FROM (
        SELECT DISTINCT location_row.id, location_row.location_name
        FROM public.onboarding_requests request
        JOIN admin_private.onboarding_request_locations selected
          ON selected.onboarding_request_id = request.id
        JOIN public.locations location_row
          ON location_row.id = selected.location_id
         AND location_row.business_id = sub.business_id
        WHERE request.commercial_subscription_id = sub.id
          AND request.customer_id = sub.customer_id
          AND request.business_id = sub.business_id
        ORDER BY location_row.id
        LIMIT acceptance.guard_quantity
      ) location
    ) picked;
  END IF;

  SELECT count(*)::integer,
         COALESCE(array_agg(provision.state), ARRAY[]::text[]),
         COALESCE(bool_and(provision.state <> 'NOT_STARTED' AND provision.agent_configured_at IS NOT NULL), false),
         COALESCE(bool_and(
           provision.state <> 'NOT_STARTED'
           AND provision.number_allocated_at IS NOT NULL
           AND provision.forwarding_instructed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(
           provision.state <> 'NOT_STARTED'
           AND provision.provider_test_outcome = 'PASSED'
           AND provision.agent_test_passed_at IS NOT NULL
         ), false),
         COALESCE(bool_and(provision.state = 'LIVE' AND provision.live_at IS NOT NULL), false)
  INTO provision_count, provision_states, agent_ready, number_ready, test_ready, live_ready
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

  preferences_complete := jsonb_array_length(telloya_locations) > 0;
  IF financial = 'verified' AND operational = 'not_started' THEN
    display := 'Payment received — setup pending';
    message := 'Your subscription payment has been confirmed. We''re preparing your service and will guide you through the remaining setup steps.';
    next_action := 'Begin setup';
  ELSIF financial = 'verified' AND operational = 'setup_started' THEN
    display := 'Setup in progress';
    message := NULL;
    next_action := CASE
      WHEN NOT preferences_complete THEN 'Confirm business preferences'
      WHEN NOT agent_ready THEN 'Confirm AI configuration'
      WHEN NOT number_ready THEN 'Record provider and number allocation'
      WHEN NOT test_ready THEN 'Record successful test call'
      ELSE 'Request customer forwarding confirmation'
    END;
  ELSIF financial = 'verified' AND operational = 'awaiting_verification' THEN
    display := 'Awaiting final verification';
    message := NULL;
    next_action := 'Approve activation';
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
      'locations', guard_locations
    ),
    'financialStatus', financial,
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
  'Read-only setup handover for the signed-in customer. Payment is confirmed only from matching payment evidence. Setup pending is not setup in progress, and Guard monitoring is not started.';

REVOKE ALL ON FUNCTION public.customer_portal_setup_handover_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_setup_handover_v1(text) TO service_role;

COMMIT;
