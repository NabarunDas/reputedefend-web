BEGIN;

-- CUSTOMER-PLATFORM-02D. Repository source only. This file is not applied to
-- DEV. Do not apply it to Production. Do not replay it.
--
-- Read-only projection of commercial entitlements and location provisioning
-- for the Customer Portal My Products page. It creates no customer,
-- subscription, payment, entitlement, allocation, or provision rows.
-- It does not grant or activate a service. containsDataChange is false.
-- safeToReplay is false.
--
-- Businesses and locations are assembled by business_id and location_id.
-- Those ids are used only while building the JSON and are not returned.
-- Display names are labels. An accepted or payment-pending Telloya
-- subscription with no entitlement row is pending. An offered quote, a
-- draft, and an enquiry are not a purchase and are not projected.

CREATE FUNCTION admin_private.customer_portal_products_rank_v1(p_status text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_status
    WHEN 'unavailable' THEN 0
    WHEN 'suspended' THEN 1
    WHEN 'expired' THEN 2
    WHEN 'cancelled' THEN 3
    WHEN 'pending' THEN 4
    WHEN 'setup' THEN 5
    WHEN 'ready_for_provider' THEN 6
    WHEN 'pilot' THEN 7
    WHEN 'active' THEN 8
    ELSE 4
  END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_products_rank_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Location status only. Provider references and payment rows stay in the caller
-- and are not returned. A pilot is never reported as active.
CREATE FUNCTION admin_private.customer_portal_telloya_location_status_v1(
  p_plan_status text,
  p_subscription_state text,
  p_grant_kind text,
  p_pilot_ends_at timestamptz,
  p_period_end timestamptz,
  p_has_period_evidence boolean,
  p_entitlement_state text,
  p_eligible_to timestamptz,
  p_provision_state text,
  p_profile_ready_at timestamptz,
  p_agent_configured_at timestamptz,
  p_number_allocated_at timestamptz,
  p_forwarding_instructed_at timestamptz,
  p_customer_confirmed_at timestamptz,
  p_has_binding boolean,
  p_test_passed boolean,
  p_agent_test_passed_at timestamptz,
  p_live_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  term_open boolean := false;
  setup_ready boolean := false;
  provider_ready boolean := false;
BEGIN
  IF p_entitlement_state = 'REVOKED' OR p_subscription_state = 'CANCELED' THEN
    RETURN 'cancelled';
  END IF;

  IF p_grant_kind = 'NON_BILLABLE_PILOT' AND (p_pilot_ends_at IS NULL OR p_pilot_ends_at <= pg_catalog.now()) THEN
    RETURN 'expired';
  END IF;
  IF p_entitlement_state = 'EXPIRED'
    OR (p_eligible_to IS NOT NULL AND p_eligible_to <= pg_catalog.now())
    OR p_subscription_state = 'ENDED'
    OR (
      p_grant_kind = 'BILLABLE'
      AND p_subscription_state IN ('ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END', 'PAUSED')
      AND (p_period_end IS NULL OR p_period_end <= pg_catalog.now())
    )
  THEN
    RETURN 'expired';
  END IF;

  IF p_provision_state = 'SUSPENDED' OR p_subscription_state = 'PAUSED' THEN
    RETURN 'suspended';
  END IF;

  term_open := p_plan_status = 'APPROVED'
    AND p_subscription_state IN ('ACTIVE', 'PAST_DUE', 'CANCEL_AT_PERIOD_END')
    AND p_entitlement_state = 'ELIGIBLE'
    AND (p_eligible_to IS NULL OR p_eligible_to > pg_catalog.now())
    AND (
      (
        p_grant_kind = 'BILLABLE'
        AND p_period_end IS NOT NULL
        AND p_period_end > pg_catalog.now()
        AND p_has_period_evidence
      )
      OR (
        p_grant_kind = 'NON_BILLABLE_PILOT'
        AND p_pilot_ends_at IS NOT NULL
        AND p_pilot_ends_at > pg_catalog.now()
      )
    );

  IF NOT term_open THEN
    RETURN 'pending';
  END IF;

  setup_ready := p_profile_ready_at IS NOT NULL
    AND p_agent_configured_at IS NOT NULL
    AND p_number_allocated_at IS NOT NULL
    AND p_forwarding_instructed_at IS NOT NULL
    AND p_customer_confirmed_at IS NOT NULL;
  provider_ready := p_has_binding
    AND p_test_passed
    AND p_agent_test_passed_at IS NOT NULL;

  IF p_provision_state = 'LIVE' THEN
    IF p_live_at IS NULL OR NOT setup_ready OR NOT provider_ready THEN
      RETURN 'unavailable';
    END IF;
    IF p_grant_kind = 'NON_BILLABLE_PILOT' THEN
      RETURN 'pilot';
    END IF;
    RETURN 'active';
  END IF;

  IF p_provision_state = 'ENDED' THEN
    RETURN 'expired';
  END IF;

  IF p_provision_state = 'READY_FOR_PROVIDER_VERIFICATION' OR (setup_ready AND NOT provider_ready) THEN
    RETURN 'ready_for_provider';
  END IF;

  RETURN 'setup';
END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_telloya_location_status_v1(
  text, text, text, timestamptz, timestamptz, boolean, text, timestamptz, text,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, boolean, boolean, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.customer_portal_products_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess jsonb;
  customer uuid;
  telloya_rows jsonb := '[]'::jsonb;
  guard_rows jsonb := '[]'::jsonb;
  telloya_read text := 'ok';
  guard_read text := 'ok';
  businesses jsonb;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;

  BEGIN
    SELECT COALESCE(jsonb_agg(row_value ORDER BY row_value ->> 'businessName', row_value ->> 'businessId'), '[]'::jsonb)
      INTO telloya_rows
    FROM (
      SELECT jsonb_build_object(
        'businessId', grouped.business_id::text,
        'businessName', grouped.business_name,
        'telloya', jsonb_build_object(
          'status', (array_agg(grouped.location_status ORDER BY admin_private.customer_portal_products_rank_v1(grouped.location_status), grouped.location_id))[1],
          'locations', jsonb_agg(
            jsonb_build_object(
              'locationName', grouped.location_name,
              'status', grouped.location_status,
              'nextStep', step.next_step
            )
            ORDER BY grouped.location_name, grouped.location_id
          )
        )
      ) AS row_value
      FROM (
        SELECT DISTINCT ON (entitlement.business_id, entitlement.location_id)
          entitlement.business_id,
          business.display_name AS business_name,
          entitlement.location_id,
          COALESCE(NULLIF(btrim(location.location_name), ''), 'This location') AS location_name,
          admin_private.customer_portal_telloya_location_status_v1(
            plan.status,
            subscription.state,
            subscription.grant_kind,
            subscription.pilot_ends_at,
            subscription.current_period_end,
            EXISTS (
              SELECT 1
              FROM public.commercial_payment_evidence evidence
              WHERE evidence.subscription_id = subscription.id
                AND subscription.current_period_end IS NOT NULL
                AND evidence.period_end = subscription.current_period_end
                AND evidence.period_end > pg_catalog.now()
            ),
            entitlement.state,
            entitlement.eligible_to,
            provision.state,
            provision.profile_ready_at,
            provision.agent_configured_at,
            provision.number_allocated_at,
            provision.forwarding_instructed_at,
            provision.customer_confirmed_at,
            provision.provider_binding_ref IS NOT NULL AND btrim(provision.provider_binding_ref) <> '',
            provision.provider_test_outcome = 'PASSED'
              AND provision.provider_test_call_ref IS NOT NULL
              AND btrim(provision.provider_test_call_ref) <> '',
            provision.agent_test_passed_at,
            provision.live_at
          ) AS location_status,
          CASE
            WHEN subscription.state = 'PAST_DUE'
              AND admin_private.customer_portal_telloya_location_status_v1(
                plan.status, subscription.state, subscription.grant_kind, subscription.pilot_ends_at,
                subscription.current_period_end,
                EXISTS (
                  SELECT 1 FROM public.commercial_payment_evidence evidence
                  WHERE evidence.subscription_id = subscription.id
                    AND subscription.current_period_end IS NOT NULL
                    AND evidence.period_end = subscription.current_period_end
                    AND evidence.period_end > pg_catalog.now()
                ),
                entitlement.state, entitlement.eligible_to, provision.state,
                provision.profile_ready_at, provision.agent_configured_at, provision.number_allocated_at,
                provision.forwarding_instructed_at, provision.customer_confirmed_at,
                provision.provider_binding_ref IS NOT NULL AND btrim(provision.provider_binding_ref) <> '',
                provision.provider_test_outcome = 'PASSED'
                  AND provision.provider_test_call_ref IS NOT NULL
                  AND btrim(provision.provider_test_call_ref) <> '',
                provision.agent_test_passed_at, provision.live_at
              ) = 'active'
              THEN 'The current period continues. Renewal did not complete.'
            ELSE NULL
          END AS renewal_step
        FROM public.product_entitlements entitlement
        JOIN public.business_memberships membership
          ON membership.business_id = entitlement.business_id
         AND membership.customer_id = customer
         AND membership.status = 'verified'
        JOIN public.businesses business ON business.id = entitlement.business_id
        JOIN public.locations location
          ON location.id = entitlement.location_id
         AND location.business_id = entitlement.business_id
        JOIN public.commercial_subscriptions subscription
          ON subscription.id = entitlement.commercial_subscription_id
         AND subscription.business_id = entitlement.business_id
        JOIN public.plan_versions plan ON plan.id = subscription.plan_version_id
        LEFT JOIN public.service_provisions provision ON provision.entitlement_id = entitlement.id
        WHERE entitlement.component_code = 'TELLOYA'
        ORDER BY entitlement.business_id, entitlement.location_id,
          CASE entitlement.state WHEN 'ELIGIBLE' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'EXPIRED' THEN 2 ELSE 3 END,
          entitlement.created_at DESC
      ) grouped
      CROSS JOIN LATERAL (
        SELECT CASE grouped.location_status
          WHEN 'setup' THEN 'Setup is still in progress at ' || grouped.location_name || '.'
          WHEN 'ready_for_provider' THEN 'This location is waiting for provider verification.'
          WHEN 'pilot' THEN 'This pilot is open until its approved end.'
          WHEN 'expired' THEN 'This period has ended.'
          WHEN 'pending' THEN 'Telloya is not active yet.'
          WHEN 'suspended' THEN 'Telloya is suspended at this location.'
          WHEN 'cancelled' THEN 'Telloya is cancelled at this location.'
          WHEN 'unavailable' THEN 'Status temporarily unavailable.'
          WHEN 'active' THEN grouped.renewal_step
          ELSE NULL
        END AS next_step
      ) step
      GROUP BY grouped.business_id, grouped.business_name
      UNION ALL
      SELECT jsonb_build_object(
        'businessId', subscription.business_id::text,
        'businessName', business.display_name,
        'telloya', jsonb_build_object('status', 'pending', 'locations', '[]'::jsonb)
      )
      FROM public.commercial_subscriptions subscription
      JOIN public.businesses business ON business.id = subscription.business_id
      JOIN public.business_memberships membership
        ON membership.business_id = subscription.business_id
       AND membership.customer_id = customer
       AND membership.status = 'verified'
      JOIN public.commercial_subscription_items item
        ON item.subscription_id = subscription.id
       AND item.component_code = 'TELLOYA'
      JOIN public.plan_versions plan ON plan.id = subscription.plan_version_id
      WHERE subscription.state IN ('ACCEPTED', 'PAYMENT_PENDING')
        AND plan.status = 'APPROVED'
        AND NOT EXISTS (
          SELECT 1
          FROM public.product_entitlements entitlement
          WHERE entitlement.business_id = subscription.business_id
            AND entitlement.component_code = 'TELLOYA'
        )
    ) built;
  EXCEPTION WHEN OTHERS THEN
    telloya_rows := '[]'::jsonb;
    telloya_read := 'unavailable';
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(row_value ORDER BY row_value ->> 'businessName', row_value ->> 'businessId'), '[]'::jsonb)
      INTO guard_rows
    FROM (
      SELECT jsonb_build_object(
        'businessId', grouped.business_id::text,
        'businessName', grouped.business_name,
        'guard', jsonb_build_object(
          'status', (array_agg(grouped.location_status ORDER BY admin_private.customer_portal_products_rank_v1(grouped.location_status), grouped.location_id))[1],
          'locations', jsonb_agg(
            jsonb_build_object(
              'locationName', grouped.location_name,
              'status', grouped.location_status,
              'monitoringRecorded', grouped.monitoring_recorded,
              'allocation', grouped.allocation_kind,
              'nextStep', grouped.next_step
            )
            ORDER BY grouped.location_name, grouped.location_id
          )
        )
      ) AS row_value
      FROM (
        SELECT DISTINCT ON (visible.business_id, visible.location_id)
          visible.business_id,
          business.display_name AS business_name,
          visible.location_id,
          COALESCE(NULLIF(btrim(location.location_name), ''), 'This location') AS location_name,
          COALESCE(
            coverage.state = 'ACTIVE'
            AND (
              (billing.billing_state = 'CURRENT' AND billing.paid_through_at > pg_catalog.now())
              OR billing.billing_state = 'NOT_REQUIRED'
            ),
            false
          ) AS monitoring_recorded,
          CASE
            WHEN coverage.state = 'ACTIVE'
              AND (
                (billing.billing_state = 'CURRENT' AND billing.paid_through_at > pg_catalog.now())
                OR billing.billing_state = 'NOT_REQUIRED'
              )
              THEN 'active'
            WHEN allocation.state IN ('PREVIEW', 'RESERVED') OR coverage.id IS NOT NULL THEN 'pending'
            ELSE 'not_subscribed'
          END AS location_status,
          CASE allocation.state
            WHEN 'PREVIEW' THEN 'preview'
            WHEN 'RESERVED' THEN 'reserved'
            ELSE NULL
          END AS allocation_kind,
          CASE
            WHEN coverage.state = 'ACTIVE'
              AND (
                (billing.billing_state = 'CURRENT' AND billing.paid_through_at > pg_catalog.now())
                OR billing.billing_state = 'NOT_REQUIRED'
              )
              THEN NULL
            WHEN allocation.state IN ('PREVIEW', 'RESERVED') THEN 'Guard monitoring is not active from this bundle.'
            ELSE NULL
          END AS next_step
        FROM (
          SELECT coverage_row.business_id, coverage_row.location_id
          FROM public.guard_coverages coverage_row
          JOIN public.business_memberships membership
            ON membership.business_id = coverage_row.business_id
           AND membership.customer_id = customer
           AND membership.status = 'verified'
          WHERE coverage_row.state <> 'ENDED'
          UNION
          SELECT allocation_row.business_id, allocation_row.location_id
          FROM public.bundle_guard_allocations allocation_row
          JOIN public.business_memberships membership
            ON membership.business_id = allocation_row.business_id
           AND membership.customer_id = customer
           AND membership.status = 'verified'
          WHERE allocation_row.state IN ('RESERVED', 'PREVIEW')
        ) visible
        JOIN public.businesses business ON business.id = visible.business_id
        JOIN public.locations location
          ON location.id = visible.location_id
         AND location.business_id = visible.business_id
        LEFT JOIN public.guard_coverages coverage
          ON coverage.location_id = visible.location_id
         AND coverage.business_id = visible.business_id
         AND coverage.state <> 'ENDED'
        LEFT JOIN public.guard_billing billing ON billing.coverage_id = coverage.id
        LEFT JOIN public.bundle_guard_allocations allocation
          ON allocation.location_id = visible.location_id
         AND allocation.business_id = visible.business_id
         AND allocation.state IN ('RESERVED', 'PREVIEW')
        ORDER BY visible.business_id, visible.location_id
      ) grouped
      GROUP BY grouped.business_id, grouped.business_name
    ) built;
  EXCEPTION WHEN OTHERS THEN
    guard_rows := '[]'::jsonb;
    guard_read := 'unavailable';
  END;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'businessName', names.business_name,
      'telloya', CASE
        WHEN telloya_read = 'unavailable' THEN jsonb_build_object('status', 'unavailable', 'locations', '[]'::jsonb)
        ELSE COALESCE(telloya_match.telloya, jsonb_build_object('status', 'not_subscribed', 'locations', '[]'::jsonb))
      END,
      'guard', CASE
        WHEN guard_read = 'unavailable' THEN jsonb_build_object('status', 'unavailable', 'locations', '[]'::jsonb)
        ELSE COALESCE(guard_match.guard, jsonb_build_object('status', 'not_subscribed', 'locations', '[]'::jsonb))
      END
    )
    ORDER BY names.business_name, names.business_id
  ), '[]'::jsonb)
  INTO businesses
  FROM (
    SELECT DISTINCT ON (business_id) business_id, business_name
    FROM (
      SELECT value ->> 'businessId' AS business_id, value ->> 'businessName' AS business_name
      FROM jsonb_array_elements(CASE WHEN telloya_read = 'ok' THEN telloya_rows ELSE '[]'::jsonb END) value
      UNION ALL
      SELECT value ->> 'businessId', value ->> 'businessName'
      FROM jsonb_array_elements(CASE WHEN guard_read = 'ok' THEN guard_rows ELSE '[]'::jsonb END) value
    ) found
    WHERE business_id IS NOT NULL
    ORDER BY business_id
  ) names
  LEFT JOIN LATERAL (
    SELECT value -> 'telloya' AS telloya
    FROM jsonb_array_elements(telloya_rows) value
    WHERE telloya_read = 'ok' AND value ->> 'businessId' = names.business_id
    LIMIT 1
  ) telloya_match ON true
  LEFT JOIN LATERAL (
    SELECT value -> 'guard' AS guard
    FROM jsonb_array_elements(guard_rows) value
    WHERE guard_read = 'ok' AND value ->> 'businessId' = names.business_id
    LIMIT 1
  ) guard_match ON true;

  RETURN jsonb_build_object(
    'businesses', businesses,
    'reads', jsonb_build_object('telloya', telloya_read, 'guard', guard_read)
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_private.customer_portal_products_v1(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.customer_portal_products_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT admin_private.customer_portal_products_v1(p_token_hash);
$$;

COMMENT ON FUNCTION public.customer_portal_products_v1(text) IS
  'Read-only Customer Portal products projection. Accepts only a portal session token hash. Does not grant, activate, or bill a service.';

REVOKE ALL ON FUNCTION public.customer_portal_products_v1(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_products_v1(text) TO service_role;

COMMIT;
