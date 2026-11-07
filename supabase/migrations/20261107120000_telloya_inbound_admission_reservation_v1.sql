-- Source only. Do not apply 20261107120000 to hosted DEV.
-- Do not apply 20261107120000 to Production.
-- Do not replay 20261107110000. Do not apply 20261107110000 to Production.
-- Atomic inbound reservation for an allocated number. The accepted commercial
-- offer supplies the allowance and overage terms. This file does not enable
-- Retell, forwarding, a provider webhook, or a Stripe charge. It does not
-- open service_provisions.state = LIVE. It does not store a transcript,
-- recording, token, or raw provider body.
-- service_role has no USAGE on admin_private. The callable path is the public
-- SECURITY DEFINER function below.

BEGIN;

CREATE TABLE admin_private.commercial_usage_admission_receipts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  environment text NOT NULL CHECK (environment IN ('dev', 'production')),
  provider_call_ref text NOT NULL CHECK (provider_call_ref ~ '^[A-Za-z0-9_-]{1,128}$'),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('admitted', 'excluded')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_admission_receipts_identity UNIQUE (environment, provider_call_ref)
);

CREATE TABLE admin_private.commercial_usage_admission_conflicts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES admin_private.commercial_usage_admission_receipts (id) ON DELETE RESTRICT,
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_usage_admission_conflicts_once UNIQUE (receipt_id, body_sha256)
);

CREATE TRIGGER commercial_usage_admission_receipts_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_admission_receipts
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE TRIGGER commercial_usage_admission_conflicts_immutable
  BEFORE UPDATE OR DELETE ON admin_private.commercial_usage_admission_conflicts
  FOR EACH ROW EXECUTE FUNCTION admin_private.commercial_usage_reject_mutation_v1();

CREATE FUNCTION admin_private.commercial_usage_reserve_inbound_v1(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_environment text;
  v_call_ref text;
  v_scope text;
  v_number text;
  v_now timestamptz;
  v_hash text;
  v_supplied_subscription uuid;
  v_supplied_business uuid;
  v_supplied_location uuid;
  v_owner admin_private.commercial_provider_number_owners%ROWTYPE;
  v_subscription public.commercial_subscriptions%ROWTYPE;
  v_provision_state text;
  v_terms jsonb;
  v_included integer;
  v_overage boolean;
  v_rate integer;
  v_cap integer;
  v_plan uuid;
  v_consent timestamptz;
  v_confirmed integer;
  v_open integer;
  v_committed integer;
  v_included_seconds integer;
  v_overage_seconds integer;
  v_minutes integer;
  v_raw integer;
  v_reason text;
  v_receipt admin_private.commercial_usage_admission_receipts%ROWTYPE;
BEGIN
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) <> 'object' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  BEGIN
    v_environment := p_event->>'environment';
    v_call_ref := p_event->>'providerCallRef';
    v_scope := p_event->>'callScope';
    v_number := p_event->>'toNumber';
    v_hash := p_event->>'bodySha256';
    IF NULLIF(p_event->>'now', '') IS NOT NULL THEN
      v_now := (p_event->>'now')::timestamptz;
    END IF;
    IF NULLIF(p_event->>'subscriptionId', '') IS NOT NULL THEN
      v_supplied_subscription := (p_event->>'subscriptionId')::uuid;
    END IF;
    IF NULLIF(p_event->>'businessId', '') IS NOT NULL THEN
      v_supplied_business := (p_event->>'businessId')::uuid;
    END IF;
    IF NULLIF(p_event->>'locationId', '') IS NOT NULL THEN
      v_supplied_location := (p_event->>'locationId')::uuid;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN
      RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END;

  IF v_environment NOT IN ('dev', 'production')
    OR v_scope NOT IN ('customer_phone', 'admin_web_qa')
    OR v_call_ref IS NULL
    OR v_call_ref !~ '^[A-Za-z0-9_-]{1,128}$'
    OR v_hash IS NULL
    OR v_hash !~ '^[0-9a-f]{64}$'
    OR v_now IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  IF v_scope = 'admin_web_qa' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('commercial-usage:' || v_environment || ':' || v_call_ref)::bigint);
    SELECT * INTO v_receipt
    FROM admin_private.commercial_usage_admission_receipts
    WHERE environment = v_environment AND provider_call_ref = v_call_ref;
    IF FOUND THEN
      IF v_receipt.body_sha256 = v_hash THEN
        RETURN pg_catalog.jsonb_build_object('status', 'replay', 'decision', v_receipt.decision, 'billable', false);
      END IF;
      INSERT INTO admin_private.commercial_usage_admission_conflicts(receipt_id, body_sha256)
      VALUES (v_receipt.id, v_hash)
      ON CONFLICT (receipt_id, body_sha256) DO NOTHING;
      RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'billable', false);
    END IF;
    INSERT INTO admin_private.commercial_usage_admission_receipts(
      environment, provider_call_ref, body_sha256, decision
    ) VALUES (v_environment, v_call_ref, v_hash, 'excluded');
    RETURN pg_catalog.jsonb_build_object('status', 'excluded', 'reason', 'internal_admin_web_call', 'billable', false);
  END IF;

  IF v_number IS NULL OR v_number !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'rejected', 'reason', 'rejected_payload', 'billable', false);
  END IF;

  SELECT * INTO v_owner
  FROM admin_private.commercial_provider_number_owners
  WHERE provider = 'telloya_voice'
    AND e164 = v_number
    AND environment = v_environment;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'unknown_number', 'billable', false);
  END IF;

  IF (v_supplied_subscription IS NOT NULL AND v_supplied_subscription IS DISTINCT FROM v_owner.subscription_id)
    OR (v_supplied_business IS NOT NULL AND v_supplied_business IS DISTINCT FROM v_owner.business_id)
    OR (v_supplied_location IS NOT NULL AND v_supplied_location IS DISTINCT FROM v_owner.location_id)
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'cross_tenant', 'billable', false);
  END IF;

  SELECT * INTO v_subscription
  FROM public.commercial_subscriptions
  WHERE id = v_owner.subscription_id
    AND business_id = v_owner.business_id
    AND customer_id = v_owner.customer_id;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_absent', 'billable', false);
  END IF;

  IF v_subscription.state IN ('DRAFT', 'OFFERED', 'ACCEPTED', 'PAYMENT_PENDING', 'PAST_DUE') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_unpaid', 'billable', false);
  END IF;
  IF v_subscription.state NOT IN ('ACTIVE', 'CANCEL_AT_PERIOD_END') THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'subscription_inactive', 'billable', false);
  END IF;

  SELECT provision.state INTO v_provision_state
  FROM public.service_provisions AS provision
  JOIN public.product_entitlements AS entitlement
    ON entitlement.id = provision.entitlement_id
  WHERE provision.business_id = v_owner.business_id
    AND provision.location_id = v_owner.location_id
    AND entitlement.commercial_subscription_id = v_owner.subscription_id
    AND entitlement.component_code = 'TELLOYA'
    AND entitlement.business_id = v_owner.business_id
    AND entitlement.location_id = v_owner.location_id
    AND entitlement.state = 'ELIGIBLE'
  ORDER BY CASE WHEN provision.state = 'LIVE' THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_provision_state IS DISTINCT FROM 'LIVE' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'provision_inactive', 'billable', false);
  END IF;

  IF v_subscription.current_period_start IS NULL
    OR v_subscription.current_period_end IS NULL
    OR v_subscription.current_period_end <= v_subscription.current_period_start
    OR v_now < v_subscription.current_period_start
    OR v_now >= v_subscription.current_period_end
  THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'invalid_billing_period', 'billable', false);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'commercial-usage-period:' || v_subscription.id::text || ':' || v_subscription.current_period_start::text,
    0
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('commercial-usage:' || v_environment || ':' || v_call_ref)::bigint);

  SELECT * INTO v_receipt
  FROM admin_private.commercial_usage_admission_receipts
  WHERE environment = v_environment AND provider_call_ref = v_call_ref;
  IF FOUND THEN
    IF v_receipt.body_sha256 = v_hash THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'replay',
        'decision', v_receipt.decision,
        'billable', v_receipt.decision = 'admitted'
      );
    END IF;
    INSERT INTO admin_private.commercial_usage_admission_conflicts(receipt_id, body_sha256)
    VALUES (v_receipt.id, v_hash)
    ON CONFLICT (receipt_id, body_sha256) DO NOTHING;
    RETURN pg_catalog.jsonb_build_object('status', 'conflict', 'billable', false);
  END IF;

  v_terms := admin_private.commercial_usage_load_acceptance_v1(v_subscription.id, v_owner.business_id, p_event);
  IF v_terms->>'status' IS DISTINCT FROM 'ok' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'denied',
      'reason', coalesce(v_terms->>'reason', 'acceptance_absent'),
      'billable', false
    );
  END IF;

  v_included := (v_terms->>'includedMinutes')::integer;
  v_overage := (v_terms->>'overageOptIn')::boolean;
  v_rate := (v_terms->>'overageRateMinor')::integer;
  v_cap := (v_terms->>'overageCapMinor')::integer;
  v_plan := (v_terms->>'planVersionId')::uuid;
  IF NULLIF(v_terms->>'overageConsentAt', '') IS NOT NULL THEN
    v_consent := (v_terms->>'overageConsentAt')::timestamptz;
  END IF;
  IF v_included IS NULL OR v_plan IS NULL OR coalesce((v_terms->>'minutesRollover')::boolean, false) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'acceptance_inconsistent', 'billable', false);
  END IF;

  v_confirmed := admin_private.commercial_usage_customer_seconds_v1(
    v_subscription.id, v_subscription.current_period_start, v_subscription.current_period_end
  );
  v_open := admin_private.commercial_usage_open_reservation_seconds_v1(
    v_subscription.id, v_subscription.current_period_start, v_subscription.current_period_end
  );
  v_committed := v_confirmed + v_open;
  v_included_seconds := v_included * 60;
  v_reason := NULL;
  IF v_committed + 60 <= v_included_seconds THEN
    v_reason := 'allow_included';
  ELSIF NOT v_overage THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'allowance_exhausted', 'billable', false);
  ELSIF v_rate IS DISTINCT FROM 25 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'overage_rate_not_accepted', 'billable', false);
  ELSIF v_cap IS NULL OR v_cap < 1 OR v_consent IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'spending_cap_missing', 'billable', false);
  ELSE
    v_overage_seconds := v_committed + 60 - v_included_seconds;
    v_minutes := (v_overage_seconds + 59) / 60;
    v_raw := v_minutes * 25;
    IF v_raw > v_cap THEN
      RETURN pg_catalog.jsonb_build_object('status', 'denied', 'reason', 'spending_cap_exhausted', 'billable', false);
    END IF;
    v_reason := 'allow_overage';
  END IF;

  INSERT INTO admin_private.commercial_usage_reservations(
    environment, provider_call_ref, subscription_id, location_id, business_id,
    period_start, period_end, reserved_seconds, state, plan_version_id,
    included_minutes_snapshot, minutes_rollover_snapshot, overage_opt_in_snapshot,
    overage_rate_minor_snapshot, overage_cap_minor_snapshot, overage_consent_at
  ) VALUES (
    v_environment, v_call_ref, v_subscription.id, v_owner.location_id, v_owner.business_id,
    v_subscription.current_period_start, v_subscription.current_period_end,
    60, 'open', v_plan, v_included, false, v_overage, v_rate, v_cap, v_consent
  );
  INSERT INTO admin_private.commercial_usage_admission_receipts(
    environment, provider_call_ref, body_sha256, decision
  ) VALUES (v_environment, v_call_ref, v_hash, 'admitted');

  RETURN pg_catalog.jsonb_build_object(
    'status', 'admitted',
    'reason', v_reason,
    'reserveSeconds', 60,
    'billable', true
  );
END;
$fn$;

CREATE FUNCTION public.commercial_usage_reserve_inbound_v1(jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT admin_private.commercial_usage_reserve_inbound_v1($1);
$fn$;

ALTER TABLE admin_private.commercial_usage_admission_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.commercial_usage_admission_conflicts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  admin_private.commercial_usage_admission_receipts,
  admin_private.commercial_usage_admission_conflicts
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  admin_private.commercial_usage_reserve_inbound_v1(jsonb),
  public.commercial_usage_reserve_inbound_v1(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.commercial_usage_reserve_inbound_v1(jsonb) TO service_role;

COMMENT ON FUNCTION public.commercial_usage_reserve_inbound_v1(jsonb) IS
  'Server role only. Reserves one customer minute from the accepted commercial offer when the allocated number, subscription, provision, and remaining allowance agree. A second delivery of the same body is a replay. A different body for the same call is a conflict. Admin web QA stores no customer reservation. Missing authority denies the reservation.';

COMMIT;
