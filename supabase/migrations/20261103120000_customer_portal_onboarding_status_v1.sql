BEGIN;

-- CUSTOMER-PLATFORM-03A-01. Repository source only. This file is not applied
-- to DEV. Do not apply it to DEV. Do not apply it to Production. Do not replay it.
--
-- Read-only Customer Portal view of onboarding requests already stored for the
-- signed-in customer. It creates no customer, subscription, entitlement,
-- provision, allocation, invitation, or payment rows. It does not accept an
-- offer, collect money, or activate a service. containsDataChange is false.
-- safeToReplay is false.
--
-- The only argument is the portal session token hash. The customer id comes
-- from that session. A pending membership withholds the business and its
-- locations. A revoked membership withholds those protected records. A stage
-- is chosen from recorded request, membership, subscription, and provision
-- facts. A portal session, an email delivery, or a timestamp does not move it.

CREATE FUNCTION admin_private.customer_portal_onboarding_projection_v1(
  p_request_state text,
  p_membership text,
  p_email_verified boolean,
  p_location_count integer,
  p_mark_ready boolean,
  p_subscription_state text,
  p_payment_recorded boolean,
  p_provision_state text,
  p_provision_ready boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  stage text;
  label text;
  waiting text := 'us';
  action_needed boolean := false;
  next_step text;
  completed jsonb := jsonb_build_array('Request received');
  reveal boolean := false;
BEGIN
  IF p_request_state IN ('DECLINED', 'CLOSED') THEN
    RETURN jsonb_build_object(
      'stage', CASE WHEN p_request_state = 'DECLINED' THEN 'declined' ELSE 'closed' END,
      'statusLabel', 'Request closed',
      'waitingFor', 'us',
      'customerActionRequired', false,
      'nextStep', 'This request is closed.',
      'completed', completed,
      'revealBusiness', p_membership = 'verified'
    );
  END IF;

  IF p_membership = 'revoked' THEN
    IF p_request_state IS DISTINCT FROM 'RECEIVED' THEN
      completed := completed || jsonb_build_array('Under review');
    END IF;
    RETURN jsonb_build_object(
      'stage', 'under_review',
      'statusLabel', 'Request in progress',
      'waitingFor', 'us',
      'customerActionRequired', false,
      'nextStep', 'We are reviewing this request.',
      'completed', completed,
      'revealBusiness', false
    );
  END IF;

  IF p_membership = 'pending' THEN
    IF p_request_state IS DISTINCT FROM 'RECEIVED' THEN
      completed := completed || jsonb_build_array('Under review');
    END IF;
    RETURN jsonb_build_object(
      'stage', 'verification',
      'statusLabel', 'Awaiting verification',
      'waitingFor', 'us',
      'customerActionRequired', false,
      'nextStep', 'We are checking that you can act for this business.',
      'completed', completed,
      'revealBusiness', false
    );
  END IF;

  reveal := p_membership = 'verified';
  IF p_request_state IS DISTINCT FROM 'RECEIVED' THEN
    completed := completed || jsonb_build_array('Under review');
  END IF;
  IF p_email_verified THEN
    completed := completed || jsonb_build_array('Email checked');
  END IF;
  IF reveal THEN
    completed := completed || jsonb_build_array('Business authority checked');
    IF coalesce(p_location_count, 0) > 0 THEN
      completed := completed || jsonb_build_array('Locations selected');
    END IF;
  END IF;

  IF p_provision_ready THEN
    stage := 'ready';
    label := 'Ready for use';
    next_step := 'The service is ready to use.';
    completed := completed || jsonb_build_array('Service setup recorded', 'Ready for use');
  ELSIF p_request_state IN ('PROVISIONING', 'READY')
    OR (p_provision_state IS NOT NULL AND p_provision_state <> 'ENDED')
    OR p_subscription_state IN ('ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCEL_AT_PERIOD_END')
  THEN
    stage := 'service_setup';
    label := 'Service setup';
    completed := completed || jsonb_build_array('Service setup recorded');
    IF p_provision_state = 'AWAITING_CONFIRMATION' THEN
      waiting := 'you';
      action_needed := true;
      next_step := 'We need you to confirm this setup.';
    ELSE
      next_step := 'We are setting up the service.';
    END IF;
  ELSIF p_request_state = 'AWAITING_PAYMENT' OR p_subscription_state = 'PAYMENT_PENDING' THEN
    stage := 'awaiting_customer';
    completed := completed || jsonb_build_array('Offer recorded');
    IF p_payment_recorded THEN
      label := 'Payment recorded';
      completed := completed || jsonb_build_array('Payment recorded');
      next_step := 'A payment has been recorded. We are checking it.';
    ELSE
      label := 'Awaiting your payment';
      waiting := 'you';
      action_needed := true;
      next_step := 'A payment step has been recorded. There is no payment button on this page.';
    END IF;
  ELSIF p_subscription_state = 'ACCEPTED' THEN
    stage := 'awaiting_customer';
    label := 'Acceptance recorded';
    next_step := 'Your acceptance is recorded. We will confirm the next step.';
    completed := completed || jsonb_build_array('Offer recorded', 'Acceptance recorded');
  ELSIF p_subscription_state = 'OFFERED' THEN
    stage := 'offer_preparation';
    label := 'Offer prepared';
    next_step := 'An offer has been prepared. There is nothing to accept or pay on this page.';
    completed := completed || jsonb_build_array('Offer recorded');
  ELSIF p_request_state = 'OFFERED' THEN
    stage := 'offer_preparation';
    label := 'Offer being prepared';
    next_step := 'We are preparing the offer. There is nothing to accept or pay yet.';
    completed := completed || jsonb_build_array('Offer recorded');
  ELSIF reveal AND p_email_verified AND p_mark_ready AND coalesce(p_location_count, 0) > 0 AND p_request_state = 'IN_REVIEW' THEN
    stage := 'offer_preparation';
    label := 'Offer being prepared';
    next_step := 'We are preparing the offer. There is nothing to accept or pay yet.';
  ELSIF p_request_state = 'MAILBOX_REQUIRED' AND NOT p_email_verified THEN
    stage := 'verification';
    label := 'Awaiting verification';
    waiting := 'you';
    action_needed := true;
    next_step := 'Confirm the email address on this request. Signing in does not complete that check.';
  ELSIF p_request_state = 'RECEIVED' THEN
    stage := 'received';
    label := 'Request received';
    next_step := 'We have received this request and will review it.';
  ELSE
    stage := 'under_review';
    label := 'Request in progress';
    next_step := 'We are reviewing this request.';
  END IF;

  RETURN jsonb_build_object(
    'stage', stage,
    'statusLabel', label,
    'waitingFor', waiting,
    'customerActionRequired', action_needed,
    'nextStep', next_step,
    'completed', completed,
    'revealBusiness', reveal
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_onboarding_projection_v1(
  text, text, boolean, integer, boolean, text, boolean, text, boolean
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.customer_portal_onboarding_status_v1(p_token_hash text)
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
      'updatedAt', req.updated_at
    ));
  END LOOP;

  RETURN jsonb_build_object('requests', items);
END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_onboarding_status_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.customer_portal_onboarding_status_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT admin_private.customer_portal_onboarding_status_v1(p_token_hash);
$$;

COMMENT ON FUNCTION public.customer_portal_onboarding_status_v1(text) IS
  'Read-only Customer Portal onboarding progress. Accepts only a portal session token hash. Does not accept an offer, collect money, grant an entitlement, or activate a service.';

REVOKE ALL ON FUNCTION public.customer_portal_onboarding_status_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_onboarding_status_v1(text) TO service_role;

COMMIT;
