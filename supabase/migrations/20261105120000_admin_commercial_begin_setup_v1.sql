-- 03A-03-03-02-01 Audited Admin Begin Setup.
-- Forward-only. Not applied to DEV. Do not apply 20261105120000 to DEV.
-- Do not apply 20261105120000 to Production.
-- appliedToDev stays false until a human applies this file.
--
-- One Admin command moves a verified paid Telloya or Complete subscription
-- from operational not_started to setup_started. It creates PENDING TELLOYA
-- entitlements and PROFILE_REQUIRED provisions for the selected locations,
-- and moves the onboarding request to PROVISIONING only from OFFERED,
-- INVITED, or AWAITING_PAYMENT. Those are the open states after an offer
-- exists. RECEIVED, IN_REVIEW, and MAILBOX_REQUIRED are before an offer.
-- READY, CLOSED, and DECLINED are not moved. A request already PROVISIONING
-- is not started again.
--
-- The command does not confirm business preferences. Phase
-- 03A-03-03-02-02 — Confirm Business Preferences will store the customer's
-- confirmed hours, callback instructions, service behaviour, and
-- language or voice preferences, with an auditable source and confirmation
-- timestamp. Those details must not be invented from selected locations,
-- the accepted payment, or contact records.
--
-- This file does not call a telephone provider, buy or allocate
-- a number, configure an AI agent, enable forwarding, answer calls, enable
-- Guard monitoring, change a price, enable overage, send mail, or move a
-- provision to live. service_provisions_live_closed stays in force.
-- No Guard entitlement, allocation, or coverage row is written.

BEGIN;

CREATE TABLE admin_private.commercial_setup_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  onboarding_request_id uuid NOT NULL REFERENCES public.onboarding_requests (id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  operation text NOT NULL CHECK (operation = 'begin_setup'),
  from_operational text NOT NULL CHECK (from_operational = 'not_started'),
  to_operational text NOT NULL CHECK (to_operational = 'setup_started'),
  entitlement_count integer NOT NULL CHECK (entitlement_count > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE admin_private.commercial_setup_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE admin_private.commercial_setup_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE admin_private.commercial_setup_events_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_setup_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON admin_private.commercial_setup_events
  FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_commercial_append_only_v1();

ALTER TABLE admin_private.onboarding_request_events
  DROP CONSTRAINT onboarding_request_events_operation_check;

ALTER TABLE admin_private.onboarding_request_events
  ADD CONSTRAINT onboarding_request_events_operation_check CHECK (operation IN (
    'classify', 'review', 'match_customer', 'match_business', 'select_locations',
    'mark_ready', 'decline', 'prepare_offer',
    'issue_invitation', 'resend_invitation', 'revoke_invitation',
    'begin_setup'
  ));

CREATE FUNCTION public.admin_commercial_begin_setup_v1(
  p_token text,
  p_request uuid,
  p_subscription uuid,
  p_version integer,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s jsonb;
  actor uuid;
  fingerprint text;
  receipt admin_private.commercial_command_receipts;
  sub public.commercial_subscriptions;
  req public.onboarding_requests;
  acceptance public.commercial_offer_acceptances;
  previous text;
  membership text;
  preparation_id uuid;
  preparation_acceptance uuid;
  preparation_customer uuid;
  preparation_business uuid;
  preparation_amount integer;
  preparation_currency char(3);
  preparation_cadence text;
  evidence_count integer := 0;
  matching_count integer := 0;
  telloya_quantity integer;
  plan_limit integer;
  raw_locations integer := 0;
  owned_locations integer := 0;
  chosen_location uuid;
  new_entitlement uuid;
  entitlement_count integer := 0;
  started_at timestamptz;
  handover jsonb;
  outcome jsonb := NULL;
  note text;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthorized');
  END IF;
  actor := (s ->> 'userId')::uuid;
  IF p_request IS NULL OR p_subscription IS NULL OR p_version IS NULL OR p_version < 1
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR octet_length(p_payload::text) > 8000
    OR jsonb_typeof(p_payload -> 'customerId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'customerId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'businessId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'businessId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingRequestId') IS DISTINCT FROM 'string'
    OR (p_payload ->> 'onboardingRequestId') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload -> 'onboardingVersion') IS DISTINCT FROM 'number'
    OR (p_payload ->> 'onboardingVersion') !~ '^[1-9][0-9]*$'
    OR jsonb_typeof(p_payload -> 'reason') IS DISTINCT FROM 'string'
    OR char_length(btrim(p_payload ->> 'reason')) NOT BETWEEN 10 AND 1000
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  note := btrim(p_payload ->> 'reason');
  fingerprint := md5(jsonb_build_object(
    'operation', 'begin_setup',
    'subscription', p_subscription,
    'version', p_version,
    'payload', p_payload
  )::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO receipt FROM admin_private.commercial_command_receipts WHERE request_id = p_request;
  IF receipt.request_id IS NOT NULL THEN
    IF receipt.fingerprint = fingerprint THEN
      RETURN receipt.response;
    END IF;
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF (s ->> 'createdAt')::timestamptz < pg_catalog.now() - interval '30 minutes' THEN
    RETURN jsonb_build_object('status', 'reauth_required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('begin-setup:' || p_subscription::text, 0));
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF sub.id IS NULL OR sub.grant_kind IS DISTINCT FROM 'BILLABLE' OR sub.plan_family IS DISTINCT FROM 'VOICE' THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'subscription');
  ELSIF sub.customer_id IS DISTINCT FROM (p_payload ->> 'customerId')::uuid
    OR sub.business_id IS DISTINCT FROM (p_payload ->> 'businessId')::uuid
  THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'customer');
  ELSIF sub.record_version IS DISTINCT FROM p_version THEN
    outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO req
    FROM public.onboarding_requests
    WHERE id = (p_payload ->> 'onboardingRequestId')::uuid
    FOR UPDATE;
    IF req.id IS NULL
      OR req.commercial_subscription_id IS DISTINCT FROM sub.id
      OR req.customer_id IS DISTINCT FROM sub.customer_id
      OR req.business_id IS DISTINCT FROM sub.business_id
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'customer');
    ELSIF req.state IN ('CLOSED', 'DECLINED') THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'closed');
    ELSIF req.record_version IS DISTINCT FROM (p_payload ->> 'onboardingVersion')::integer THEN
      outcome := jsonb_build_object('status', 'conflict', 'reason', 'version');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT status INTO membership
    FROM public.business_memberships
    WHERE customer_id = sub.customer_id AND business_id = sub.business_id;
    IF membership IS DISTINCT FROM 'verified' THEN
      outcome := jsonb_build_object(
        'status', 'denied',
        'reason', CASE WHEN membership = 'revoked' THEN 'revoked' ELSE 'membership' END
      );
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT * INTO acceptance FROM public.commercial_offer_acceptances WHERE subscription_id = sub.id;
    IF acceptance.id IS NULL
      OR acceptance.customer_id IS DISTINCT FROM sub.customer_id
      OR acceptance.business_id IS DISTINCT FROM sub.business_id
      OR acceptance.plan_version_id IS DISTINCT FROM sub.plan_version_id
      OR acceptance.product_code NOT IN ('TELLOYA', 'COMPLETE')
      OR acceptance.currency <> 'GBP'
      OR acceptance.cadence <> 'MONTH'
      OR acceptance.amount_minor IS DISTINCT FROM sub.amount_minor
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'acceptance');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    SELECT id, acceptance_id, customer_id, business_id, amount_minor, currency, cadence
    INTO preparation_id, preparation_acceptance, preparation_customer, preparation_business,
         preparation_amount, preparation_currency, preparation_cadence
    FROM public.commercial_checkout_preparations
    WHERE subscription_id = sub.id;
    SELECT count(*)::integer,
           count(*) FILTER (
             WHERE amount_minor = acceptance.amount_minor
               AND currency = 'GBP'
               AND period_start = sub.current_period_start
               AND period_end = sub.current_period_end
           )::integer
    INTO evidence_count, matching_count
    FROM public.commercial_payment_evidence
    WHERE subscription_id = sub.id;
    IF sub.state IN ('CANCELED', 'ENDED') OR sub.canceled_at IS NOT NULL THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'inactive');
    ELSIF sub.current_period_end IS NOT NULL AND sub.current_period_end <= pg_catalog.now() THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'expired');
    ELSIF sub.state IS DISTINCT FROM 'ACTIVE'
      OR sub.amount_minor IS DISTINCT FROM acceptance.amount_minor
      OR sub.currency IS DISTINCT FROM 'GBP'
      OR sub.current_period_start IS NULL
      OR sub.current_period_end IS NULL
      OR sub.current_period_end <= sub.current_period_start
      OR evidence_count IS DISTINCT FROM 1
      OR matching_count IS DISTINCT FROM 1
      OR preparation_id IS NULL
      OR preparation_acceptance IS DISTINCT FROM acceptance.id
      OR preparation_customer IS DISTINCT FROM sub.customer_id
      OR preparation_business IS DISTINCT FROM sub.business_id
      OR preparation_amount IS DISTINCT FROM acceptance.amount_minor
      OR preparation_currency IS DISTINCT FROM 'GBP'
      OR preparation_cadence IS DISTINCT FROM 'MONTH'
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'payment');
    END IF;
  END IF;

  IF outcome IS NULL THEN
    PERFORM 1
    FROM public.commercial_subscription_items item
    WHERE item.subscription_id = sub.id
    ORDER BY item.component_code
    FOR UPDATE;
    SELECT item.quantity INTO telloya_quantity
    FROM public.commercial_subscription_items item
    WHERE item.subscription_id = sub.id AND item.component_code = 'TELLOYA';
    SELECT component.quantity_limit INTO plan_limit
    FROM public.plan_components component
    WHERE component.plan_version_id = sub.plan_version_id
      AND component.component_code = 'TELLOYA';
    SELECT count(*)::integer INTO raw_locations
    FROM admin_private.onboarding_request_locations selected
    WHERE selected.onboarding_request_id = req.id;
    SELECT count(*)::integer INTO owned_locations
    FROM admin_private.onboarding_request_locations selected
    JOIN public.locations location
      ON location.id = selected.location_id
     AND location.business_id = sub.business_id
    WHERE selected.onboarding_request_id = req.id;
    IF raw_locations IS DISTINCT FROM owned_locations THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'location');
    ELSIF telloya_quantity IS NULL
      OR plan_limit IS NULL
      OR owned_locations IS DISTINCT FROM telloya_quantity
      OR telloya_quantity IS DISTINCT FROM plan_limit
      OR owned_locations < 1
    THEN
      outcome := jsonb_build_object('status', 'denied', 'reason', 'quantities');
    END IF;
  END IF;

  IF outcome IS NULL AND (
    EXISTS (
      SELECT 1
      FROM public.product_entitlements entitlement
      JOIN admin_private.onboarding_request_locations selected
        ON selected.location_id = entitlement.location_id
       AND selected.onboarding_request_id = req.id
      WHERE entitlement.business_id = sub.business_id
        AND entitlement.component_code = 'TELLOYA'
    )
    OR EXISTS (
      SELECT 1
      FROM public.service_provisions provision
      JOIN admin_private.onboarding_request_locations selected
        ON selected.location_id = provision.location_id
       AND selected.onboarding_request_id = req.id
    )
  ) THEN
    outcome := jsonb_build_object('status', 'conflict', 'reason', 'provision');
  END IF;

  IF outcome IS NULL AND req.state NOT IN ('OFFERED', 'INVITED', 'AWAITING_PAYMENT') THEN
    outcome := jsonb_build_object('status', 'denied', 'reason', 'lifecycle');
  END IF;

  IF outcome IS NULL THEN
    PERFORM 1
    FROM public.locations location
    JOIN admin_private.onboarding_request_locations selected
      ON selected.location_id = location.id
     AND selected.onboarding_request_id = req.id
    WHERE location.business_id = sub.business_id
    ORDER BY location.id
    FOR UPDATE OF location;

    FOR chosen_location IN
      SELECT location.id
      FROM admin_private.onboarding_request_locations selected
      JOIN public.locations location
        ON location.id = selected.location_id
       AND location.business_id = sub.business_id
      WHERE selected.onboarding_request_id = req.id
      ORDER BY location.id
    LOOP
      INSERT INTO public.product_entitlements(
        business_id, location_id, component_code, source_kind, commercial_subscription_id, state
      ) VALUES (
        sub.business_id, chosen_location, 'TELLOYA', 'COMMERCIAL_SUBSCRIPTION', sub.id, 'PENDING'
      ) RETURNING id INTO new_entitlement;
      INSERT INTO public.service_provisions(
        entitlement_id, business_id, location_id, state
      ) VALUES (
        new_entitlement, sub.business_id, chosen_location, 'PROFILE_REQUIRED'
      );
      INSERT INTO public.entitlement_events(
        entitlement_id, actor_id, request_id, from_state, to_state, reason
      ) VALUES (
        new_entitlement, actor, p_request, NULL, 'PENDING', 'Begin setup'
      );
      entitlement_count := entitlement_count + 1;
    END LOOP;

    IF entitlement_count IS DISTINCT FROM telloya_quantity THEN
      RAISE EXCEPTION 'begin setup location count drifted';
    END IF;

    previous := req.state;
    UPDATE public.onboarding_requests
    SET state = 'PROVISIONING'
    WHERE id = req.id
    RETURNING * INTO req;
    PERFORM admin_private.onboarding_event_v1(
      req.id, actor, p_request, 'begin_setup', previous, 'PROVISIONING', note,
      jsonb_build_object('subscriptionId', sub.id, 'entitlementCount', entitlement_count)
    );
    INSERT INTO public.commercial_subscription_events(
      subscription_id, actor_id, request_id, from_state, to_state, reason
    ) VALUES (
      sub.id, actor, p_request, 'ACTIVE', 'ACTIVE', 'Begin setup'
    );
    INSERT INTO admin_private.commercial_setup_events(
      subscription_id, onboarding_request_id, actor_id, request_id, operation,
      from_operational, to_operational, entitlement_count
    ) VALUES (
      sub.id, req.id, actor, p_request, 'begin_setup',
      'not_started', 'setup_started', entitlement_count
    ) RETURNING created_at INTO started_at;

    handover := admin_private.commercial_setup_handover_v1(sub.id);
    IF handover IS NULL
      OR handover ->> 'operationalStatus' IS DISTINCT FROM 'setup_started'
      OR handover ->> 'customerDisplay' IS DISTINCT FROM 'Setup in progress'
      OR handover ->> 'nextAction' IS DISTINCT FROM 'Confirm business preferences'
      OR handover ->> 'financialStatus' IS DISTINCT FROM 'verified'
    THEN
      RAISE EXCEPTION 'begin setup did not leave setup in progress';
    END IF;
    outcome := jsonb_build_object(
      'status', 'success',
      'reference', handover -> 'reference',
      'operationalStatus', handover -> 'operationalStatus',
      'customerDisplay', handover -> 'customerDisplay',
      'nextAction', handover -> 'nextAction',
      'onboardingState', req.state,
      'provisionState', 'PROFILE_REQUIRED',
      'entitlementCount', entitlement_count,
      'startedAt', started_at
    );
  END IF;

  INSERT INTO admin_private.commercial_command_receipts(request_id, actor_id, fingerprint, response)
  VALUES (p_request, actor, fingerprint, outcome);
  RETURN outcome;
END;
$$;

COMMENT ON FUNCTION public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb) IS
  'Audited Admin begin-setup for one verified paid Telloya or Complete subscription. Creates PENDING TELLOYA entitlements and PROFILE_REQUIRED provisions. Does not confirm preferences, call a provider, allocate a number, enable Guard, change billing, send mail, or move a service to live.';

REVOKE ALL ON FUNCTION public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_begin_setup_v1(text, uuid, uuid, integer, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_commercial_setup_queue_v1(p_token text)
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
  SELECT COALESCE(jsonb_agg(
    built.item || jsonb_build_object(
      'subscriptionId', built.subscription_id,
      'subscriptionVersion', built.subscription_version,
      'customerId', built.customer_id,
      'onboardingRequestId', built.request_id,
      'onboardingVersion', built.request_version,
      'setupStartedAt', built.started_at
    )
    ORDER BY built.item ->> 'paymentConfirmedAt', built.item ->> 'reference'
  ), '[]'::jsonb)
  INTO items
  FROM (
    SELECT
      subscription.id AS subscription_id,
      subscription.record_version AS subscription_version,
      subscription.customer_id AS customer_id,
      request.id AS request_id,
      request.record_version AS request_version,
      (
        SELECT event.created_at
        FROM admin_private.commercial_setup_events event
        WHERE event.subscription_id = subscription.id
          AND event.operation = 'begin_setup'
        ORDER BY event.id
        LIMIT 1
      ) AS started_at,
      admin_private.commercial_setup_handover_v1(subscription.id) AS item
    FROM public.commercial_subscriptions subscription
    LEFT JOIN public.onboarding_requests request
      ON request.commercial_subscription_id = subscription.id
     AND request.state NOT IN ('CLOSED', 'DECLINED')
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
  'Read-only Admin queue of paid Telloya and Complete subscriptions that are not operationally active. Adds the subscription and onboarding versions the begin-setup command expects, and the begin-setup timestamp when that command has run. It does not itself provision a service.';

REVOKE ALL ON FUNCTION public.admin_commercial_setup_queue_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_commercial_setup_queue_v1(text) TO service_role;

COMMIT;
