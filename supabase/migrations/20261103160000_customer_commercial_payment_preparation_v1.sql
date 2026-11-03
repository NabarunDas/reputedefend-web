-- Commercial subscription payment preparation.
-- Repository source only. Not applied to DEV. Not applied to Production.
-- Do not apply 20261103160000 to DEV. Do not apply 20261103160000 to Production.
-- Do not replay this file. It does not collect a payment, create payment evidence,
-- grant an entitlement, activate a service, or send mail.
-- A checkout session is not payment evidence. ACCEPTED becomes PAYMENT_PENDING
-- only together with one reserved price operation and one reserved checkout operation.
-- ACTIVE, renewal, PAST_DUE, PAUSED, cancellation, refunds, and metered overage stay out.

BEGIN;

ALTER TABLE public.provider_operations
  ADD COLUMN commercial_subscription_id uuid
  REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT;

ALTER TABLE public.provider_operations DROP CONSTRAINT provider_operations_purpose_check;
ALTER TABLE public.provider_operations ADD CONSTRAINT provider_operations_purpose_check CHECK (purpose IN (
  'UPFRONT','SETUP','OFF_SESSION','RECOVERY','INVOICE','CUSTOMER',
  'GUARD_SUBSCRIPTION','GUARD_PRICE','GUARD_REFUND','GUARD_RECOVERY',
  'COMMERCIAL_PRICE','COMMERCIAL_CHECKOUT'
));

ALTER TABLE public.provider_operations DROP CONSTRAINT provider_operations_customer_scope;
ALTER TABLE public.provider_operations ADD CONSTRAINT provider_operations_customer_scope CHECK (
  (
    kind = 'CREATE_RECURRING_PRICE' AND purpose = 'GUARD_PRICE'
    AND customer_id IS NULL AND commercial_subscription_id IS NULL
    AND service_order_id IS NULL AND obligation_id IS NULL AND guard_subscription_id IS NULL
  )
  OR (
    kind = 'CREATE_RECURRING_PRICE' AND purpose = 'COMMERCIAL_PRICE'
    AND customer_id IS NOT NULL AND commercial_subscription_id IS NOT NULL
    AND service_order_id IS NULL AND obligation_id IS NULL AND guard_subscription_id IS NULL
  )
  OR (
    kind = 'CREATE_SUBSCRIPTION_CHECKOUT' AND purpose = 'COMMERCIAL_CHECKOUT'
    AND customer_id IS NOT NULL AND commercial_subscription_id IS NOT NULL
    AND service_order_id IS NULL AND obligation_id IS NULL AND guard_subscription_id IS NULL
  )
  OR (
    kind IS DISTINCT FROM 'CREATE_RECURRING_PRICE'
    AND NOT (kind = 'CREATE_SUBSCRIPTION_CHECKOUT' AND purpose = 'COMMERCIAL_CHECKOUT')
    AND customer_id IS NOT NULL
    AND commercial_subscription_id IS NULL
  )
);

ALTER TABLE public.provider_operations ADD CONSTRAINT provider_operations_commercial_purpose CHECK (
  (
    purpose = 'COMMERCIAL_PRICE'
    AND kind = 'CREATE_RECURRING_PRICE'
    AND commercial_subscription_id IS NOT NULL
  )
  OR (
    purpose = 'COMMERCIAL_CHECKOUT'
    AND kind = 'CREATE_SUBSCRIPTION_CHECKOUT'
    AND commercial_subscription_id IS NOT NULL
  )
  OR (
    purpose NOT IN ('COMMERCIAL_PRICE', 'COMMERCIAL_CHECKOUT')
    AND commercial_subscription_id IS NULL
  )
);

CREATE UNIQUE INDEX provider_operations_one_commercial_price_idx
  ON public.provider_operations (commercial_subscription_id)
  WHERE purpose = 'COMMERCIAL_PRICE' AND status IN ('PENDING', 'SUBMITTED', 'SUCCEEDED');

CREATE UNIQUE INDEX provider_operations_one_commercial_checkout_idx
  ON public.provider_operations (commercial_subscription_id)
  WHERE purpose = 'COMMERCIAL_CHECKOUT' AND status IN ('PENDING', 'SUBMITTED', 'SUCCEEDED');

CREATE TABLE public.commercial_checkout_preparations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL UNIQUE REFERENCES public.commercial_subscriptions (id) ON DELETE RESTRICT,
  acceptance_id uuid NOT NULL UNIQUE REFERENCES public.commercial_offer_acceptances (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency = 'GBP'),
  cadence text NOT NULL CHECK (cadence = 'MONTH'),
  tax_behaviour text NOT NULL CHECK (tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE')),
  tax_amount_minor integer,
  guard_quantity integer NOT NULL CHECK (guard_quantity >= 0),
  guard_charge_minor integer NOT NULL CHECK (guard_charge_minor >= 0),
  overage_opt_in boolean NOT NULL,
  overage_cap_minor integer,
  price_operation_id uuid NOT NULL UNIQUE REFERENCES public.provider_operations (id) ON DELETE RESTRICT,
  checkout_operation_id uuid NOT NULL UNIQUE REFERENCES public.provider_operations (id) ON DELETE RESTRICT,
  stripe_product_id text CHECK (stripe_product_id IS NULL OR stripe_product_id ~ '^prod_[A-Za-z0-9]+$'),
  stripe_price_id text CHECK (stripe_price_id IS NULL OR stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  checkout_session_id text CHECK (checkout_session_id IS NULL OR checkout_session_id ~ '^cs_[A-Za-z0-9]+$'),
  livemode boolean NOT NULL DEFAULT admin_private.payment_expected_livemode_v1(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT commercial_checkout_preparations_tax_shape CHECK (
    (tax_behaviour = 'NOT_APPLICABLE' AND tax_amount_minor IS NULL)
    OR (tax_behaviour IN ('INCLUSIVE', 'EXCLUSIVE') AND tax_amount_minor IS NOT NULL AND tax_amount_minor >= 0)
  ),
  CONSTRAINT commercial_checkout_preparations_guard_shape CHECK (
    (guard_quantity = 0 AND guard_charge_minor = 0)
    OR (guard_quantity > 0 AND guard_charge_minor > 0)
  ),
  CONSTRAINT commercial_checkout_preparations_overage_shape CHECK (
    (overage_opt_in = false AND overage_cap_minor IS NULL)
    OR (overage_opt_in = true AND overage_cap_minor IS NOT NULL AND overage_cap_minor > 0)
  ),
  CONSTRAINT commercial_checkout_preparations_price_pair CHECK (
    (stripe_product_id IS NULL AND stripe_price_id IS NULL)
    OR (stripe_product_id IS NOT NULL AND stripe_price_id IS NOT NULL)
  ),
  CONSTRAINT commercial_checkout_preparations_distinct_ops CHECK (price_operation_id <> checkout_operation_id)
);

ALTER TABLE public.commercial_checkout_preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_checkout_preparations FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER commercial_checkout_preparations_livemode_lane
  BEFORE INSERT OR UPDATE OF livemode ON public.commercial_checkout_preparations
  FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_livemode_mismatch_v1();

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
    OR plan.amount_minor IS DISTINCT FROM sub.amount_minor
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
          WHEN p_classified ->> 'cadence' IS DISTINCT FROM 'MONTH' THEN 'unsupported'
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
        WHEN p_classified ->> 'cadence' IS DISTINCT FROM 'MONTH' THEN
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

CREATE OR REPLACE FUNCTION admin_private.provider_operation_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  ord public.service_orders;
  sub public.guard_subscriptions;
  place uuid;
  service text;
  elig jsonb;
BEGIN
  -- An accepted commercial subscription is not a Recovery order and not a Guard subscription.
  -- The Guard eligibility gate must not run for that reserved checkout.
  IF NEW.purpose = 'COMMERCIAL_CHECKOUT'
    AND NEW.kind = 'CREATE_SUBSCRIPTION_CHECKOUT'
    AND NEW.commercial_subscription_id IS NOT NULL
    AND NEW.service_order_id IS NULL
    AND NEW.guard_subscription_id IS NULL
    AND NEW.obligation_id IS NULL
  THEN
    RETURN NEW;
  END IF;
  IF NEW.kind NOT IN (
    'CREATE_CHECKOUT_SESSION', 'CREATE_INVOICE', 'CREATE_SUBSCRIPTION_CHECKOUT',
    'CREATE_RECOVERY_SESSION', 'CREATE_SETUP_SESSION', 'CREATE_RECOVERY_CHECKOUT'
  ) THEN
    RETURN NEW;
  END IF;
  IF NEW.service_order_id IS NOT NULL THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = NEW.service_order_id;
  END IF;
  IF ord.id IS NULL AND NEW.guard_subscription_id IS NOT NULL THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NEW.guard_subscription_id;
    IF sub.id IS NOT NULL THEN
      SELECT * INTO ord FROM public.service_orders WHERE id = sub.service_order_id;
    END IF;
  END IF;
  IF ord.id IS NULL THEN
    RAISE EXCEPTION 'commercial_eligibility:pending_review' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.kind IN ('CREATE_SUBSCRIPTION_CHECKOUT', 'CREATE_RECOVERY_CHECKOUT') THEN
    service := 'RELAUNCH_GUARD';
  ELSE
    service := ord.service_code;
  END IF;
  place := ord.location_id;
  IF place IS NULL AND sub.id IS NOT NULL THEN
    place := sub.location_id;
  END IF;
  elig := admin_private.evaluate_commercial_eligibility_v1(
    ord.business_id, service, ord.tax_behaviour, ord.currency, ord.amount_minor, place, false
  );
  IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'commercial_eligibility:%', coalesce(elig->>'reason', 'awaiting_confirmation') USING ERRCODE = 'P0001';
  END IF;
  PERFORM admin_private.commercial_tax_log_v1(
    'PAYMENT_ATTEMPT', ord.business_id, place, elig->'snapshot'->>'countryCode', service,
    elig->'snapshot'->>'serviceClass', elig->'snapshot'->>'paymentFlow', ord.tax_behaviour,
    elig->'snapshot'->>'taxDetermination', elig->'snapshot'->>'sellerRegistrationStatus',
    ord.amount_minor, nullif(elig->'snapshot'->>'turnoverMinorAfter', '')::integer,
    nullif(elig->'snapshot'->>'alert', ''), NEW.id, jsonb_build_object('providerKind', NEW.kind)
  );
  RETURN NEW;
END; $$;


CREATE FUNCTION admin_private.commercial_payment_remember_v1(
  p_request uuid,
  p_customer uuid,
  p_fingerprint text,
  p_response jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO admin_private.customer_commercial_command_receipts(request_id, customer_id, fingerprint, response)
  VALUES (p_request, p_customer, p_fingerprint, p_response);
  RETURN p_response;
END;
$$;

CREATE FUNCTION admin_private.commercial_payment_preparation_response_v1(
  p_preparation uuid,
  p_existing boolean
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prep public.commercial_checkout_preparations;
  price_op public.provider_operations;
  checkout_op public.provider_operations;
  stripe_customer text;
  product_name text;
BEGIN
  SELECT * INTO prep FROM public.commercial_checkout_preparations WHERE id = p_preparation;
  IF prep.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO price_op FROM public.provider_operations WHERE id = prep.price_operation_id;
  SELECT * INTO checkout_op FROM public.provider_operations WHERE id = prep.checkout_operation_id;
  SELECT mapped.stripe_customer_id INTO stripe_customer
  FROM public.stripe_customer_maps AS mapped
  WHERE mapped.customer_id = prep.customer_id;
  SELECT CASE acceptance.product_code WHEN 'TELLOYA' THEN 'Telloya' ELSE 'Complete' END
  INTO product_name
  FROM public.commercial_offer_acceptances AS acceptance
  WHERE acceptance.id = prep.acceptance_id;
  RETURN jsonb_build_object(
    'status', 'success',
    'existing', p_existing,
    'state', 'PAYMENT_PENDING',
    'providerOperationId', checkout_op.id,
    'priceOperationId', price_op.id,
    'idempotencyKey', checkout_op.idempotency_key,
    'priceIdempotencyKey', price_op.idempotency_key,
    'stripeCustomerId', to_jsonb(stripe_customer),
    'stripePriceId', to_jsonb(prep.stripe_price_id),
    'stripeProductId', to_jsonb(prep.stripe_product_id),
    'checkoutSessionId', to_jsonb(prep.checkout_session_id),
    'amountMinor', prep.amount_minor,
    'currency', prep.currency,
    'cadence', prep.cadence,
    'customerId', prep.customer_id,
    'commercialSubscriptionId', prep.subscription_id,
    'acceptanceId', prep.acceptance_id,
    'taxBehaviour', prep.tax_behaviour,
    'guardQuantity', prep.guard_quantity,
    'guardChargeMinor', prep.guard_charge_minor,
    'overageOptIn', prep.overage_opt_in,
    'overageCapMinor', to_jsonb(prep.overage_cap_minor),
    'productName', product_name,
    'providerOperationStatus', checkout_op.status
  );
END;
$$;

CREATE FUNCTION public.customer_portal_commercial_payment_prepare_v1(
  p_token_hash text,
  p_request uuid,
  p_selector text,
  p_livemode boolean DEFAULT NULL
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
  sub public.commercial_subscriptions;
  acceptance public.commercial_offer_acceptances;
  prior admin_private.customer_commercial_command_receipts;
  fingerprint text;
  prep public.commercial_checkout_preparations;
  price_op uuid;
  checkout_op uuid;
  guard_charge integer;
  item_guard integer;
  occupying uuid;
  result jsonb;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL OR (sess ->> 'customerId') IS NULL OR (sess ->> 'authUserId') IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  actor := (sess ->> 'authUserId')::uuid;
  IF p_request IS NULL OR p_selector IS NULL OR p_selector !~ '^VC-[0-9]{2}-[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fingerprint := p_selector || '|' || coalesce(p_livemode::text, 'unset');
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
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM customer THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('commercial-payment:' || sub.id::text, 1));
  SELECT * INTO sub FROM public.commercial_subscriptions WHERE id = sub.id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_memberships AS membership
    WHERE membership.customer_id = customer
      AND membership.business_id = sub.business_id
      AND membership.status = 'verified'
  ) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF sub.state NOT IN ('ACCEPTED', 'PAYMENT_PENDING') OR sub.grant_kind IS DISTINCT FROM 'BILLABLE' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  SELECT * INTO acceptance
  FROM public.commercial_offer_acceptances
  WHERE subscription_id = sub.id
    AND customer_id = customer
    AND business_id = sub.business_id;
  IF acceptance.id IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF acceptance.plan_version_id IS DISTINCT FROM sub.plan_version_id
    OR acceptance.amount_minor IS DISTINCT FROM sub.amount_minor
    OR acceptance.currency IS DISTINCT FROM sub.currency
    OR acceptance.tax_behaviour IS DISTINCT FROM sub.tax_behaviour
    OR acceptance.tax_amount_minor IS DISTINCT FROM sub.tax_amount_minor
    OR acceptance.cadence IS DISTINCT FROM sub.cadence_snapshot
    OR acceptance.agreement_version_ref IS DISTINCT FROM sub.terms_ref
  THEN
    RETURN admin_private.commercial_payment_remember_v1(
      p_request, customer, fingerprint, jsonb_build_object('status', 'conflict')
    );
  END IF;
  IF acceptance.cadence = 'MONTH' AND acceptance.recurring_consent_at IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT coalesce(sum(item.quantity), 0) INTO item_guard
  FROM public.commercial_subscription_items AS item
  WHERE item.subscription_id = sub.id
    AND item.component_code = 'GUARD';
  IF item_guard IS DISTINCT FROM acceptance.guard_quantity THEN
    RETURN admin_private.commercial_payment_remember_v1(
      p_request, customer, fingerprint, jsonb_build_object('status', 'conflict')
    );
  END IF;
  guard_charge := CASE
    WHEN acceptance.guard_included THEN acceptance.guard_unit_amount_minor * acceptance.guard_quantity
    ELSE 0
  END;
  IF acceptance.base_amount_minor + guard_charge IS DISTINCT FROM acceptance.amount_minor THEN
    RETURN admin_private.commercial_payment_remember_v1(
      p_request, customer, fingerprint, jsonb_build_object('status', 'conflict')
    );
  END IF;

  IF acceptance.cadence IS DISTINCT FROM 'MONTH' OR acceptance.currency IS DISTINCT FROM 'GBP' THEN
    RETURN admin_private.commercial_payment_remember_v1(
      p_request, customer, fingerprint,
      jsonb_build_object('status', 'unsupported', 'cadence', acceptance.cadence, 'currency', acceptance.currency)
    );
  END IF;

  IF p_livemode IS NOT NULL AND NOT admin_private.payment_livemode_accepted_v1(p_livemode) THEN
    RETURN jsonb_build_object('status', 'lane_mismatch');
  END IF;

  IF sub.stripe_subscription_id IS NOT NULL THEN
    RETURN admin_private.commercial_payment_remember_v1(
      p_request, customer, fingerprint, jsonb_build_object('status', 'conflict', 'reason', 'existing_subscription')
    );
  END IF;
  SELECT existing.id INTO occupying
  FROM public.commercial_subscriptions AS existing
  WHERE existing.business_id = sub.business_id
    AND existing.id IS DISTINCT FROM sub.id
    AND existing.state IN ('ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCEL_AT_PERIOD_END');
  IF occupying IS NOT NULL THEN
    RETURN admin_private.commercial_payment_remember_v1(
      p_request, customer, fingerprint, jsonb_build_object('status', 'conflict', 'reason', 'existing_subscription')
    );
  END IF;

  SELECT * INTO prep FROM public.commercial_checkout_preparations WHERE subscription_id = sub.id;
  IF prep.id IS NOT NULL THEN
    result := admin_private.commercial_payment_preparation_response_v1(prep.id, true);
    RETURN admin_private.commercial_payment_remember_v1(p_request, customer, fingerprint, result);
  END IF;
  IF sub.state IS DISTINCT FROM 'ACCEPTED' THEN
    RETURN admin_private.commercial_payment_remember_v1(
      p_request, customer, fingerprint, jsonb_build_object('status', 'conflict')
    );
  END IF;

  INSERT INTO public.provider_operations(
    idempotency_key, kind, purpose, customer_id, commercial_subscription_id, status
  ) VALUES (
    extensions.gen_random_uuid(), 'CREATE_RECURRING_PRICE', 'COMMERCIAL_PRICE', customer, sub.id, 'PENDING'
  ) RETURNING id INTO price_op;
  INSERT INTO public.provider_operations(
    idempotency_key, kind, purpose, customer_id, commercial_subscription_id, status
  ) VALUES (
    extensions.gen_random_uuid(), 'CREATE_SUBSCRIPTION_CHECKOUT', 'COMMERCIAL_CHECKOUT', customer, sub.id, 'PENDING'
  ) RETURNING id INTO checkout_op;
  INSERT INTO public.commercial_checkout_preparations(
    subscription_id, acceptance_id, customer_id, business_id, amount_minor, currency, cadence,
    tax_behaviour, tax_amount_minor, guard_quantity, guard_charge_minor, overage_opt_in, overage_cap_minor,
    price_operation_id, checkout_operation_id
  ) VALUES (
    sub.id, acceptance.id, customer, sub.business_id, acceptance.amount_minor, 'GBP', 'MONTH',
    acceptance.tax_behaviour, acceptance.tax_amount_minor, acceptance.guard_quantity, guard_charge,
    acceptance.overage_opt_in, acceptance.overage_cap_minor, price_op, checkout_op
  ) RETURNING * INTO prep;

  UPDATE public.commercial_subscriptions
  SET state = 'PAYMENT_PENDING'
  WHERE id = sub.id
    AND state = 'ACCEPTED'
    AND customer_id = customer
    AND stripe_subscription_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial payment preparation did not reserve the subscription';
  END IF;
  INSERT INTO public.commercial_subscription_events(
    subscription_id, actor_id, request_id, from_state, to_state, reason
  ) VALUES (
    sub.id, actor, p_request, 'ACCEPTED', 'PAYMENT_PENDING',
    'Customer payment preparation reserved. No payment has been collected.'
  );

  result := admin_private.commercial_payment_preparation_response_v1(prep.id, false);
  IF result ->> 'status' IS DISTINCT FROM 'success'
    OR (result ->> 'amountMinor')::integer IS DISTINCT FROM acceptance.amount_minor
    OR coalesce((result ->> 'overageOptIn')::boolean, false) IS DISTINCT FROM acceptance.overage_opt_in
  THEN
    RAISE EXCEPTION 'commercial payment preparation response did not match the acceptance';
  END IF;
  RETURN admin_private.commercial_payment_remember_v1(p_request, customer, fingerprint, result);
END;
$$;

CREATE FUNCTION public.commercial_payment_record_price_v1(
  p_operation uuid,
  p_price_id text,
  p_product_id text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.provider_operations;
  prep public.commercial_checkout_preparations;
  recorded jsonb;
  sub_state text;
  stripe_sub text;
BEGIN
  IF p_operation IS NULL
    OR p_price_id IS NULL OR p_price_id !~ '^price_[A-Za-z0-9]+$'
    OR p_product_id IS NULL OR p_product_id !~ '^prod_[A-Za-z0-9]+$'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO prep
  FROM public.commercial_checkout_preparations
  WHERE price_operation_id = p_operation
  FOR UPDATE;
  IF prep.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO op
  FROM public.provider_operations
  WHERE id = p_operation
    AND kind = 'CREATE_RECURRING_PRICE'
    AND purpose = 'COMMERCIAL_PRICE'
    AND commercial_subscription_id = prep.subscription_id
  FOR UPDATE;
  IF op.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF prep.stripe_price_id IS NOT NULL AND (
    prep.stripe_price_id IS DISTINCT FROM p_price_id OR prep.stripe_product_id IS DISTINCT FROM p_product_id
  ) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  recorded := public.payment_record_provider_refs_v1(p_operation, p_price_id, 'price', 'SUCCEEDED');
  IF recorded ->> 'status' IS DISTINCT FROM 'success' THEN
    RETURN recorded;
  END IF;
  UPDATE public.commercial_checkout_preparations
  SET stripe_price_id = coalesce(stripe_price_id, p_price_id),
      stripe_product_id = coalesce(stripe_product_id, p_product_id)
  WHERE id = prep.id
    AND (stripe_price_id IS NULL OR stripe_price_id = p_price_id)
    AND (stripe_product_id IS NULL OR stripe_product_id = p_product_id);
  SELECT state, stripe_subscription_id INTO sub_state, stripe_sub
  FROM public.commercial_subscriptions
  WHERE id = prep.subscription_id;
  IF sub_state IS DISTINCT FROM 'PAYMENT_PENDING' OR stripe_sub IS NOT NULL THEN
    RAISE EXCEPTION 'recording a commercial price must not activate the subscription';
  END IF;
  RETURN jsonb_build_object('status', 'success', 'activated', false);
END;
$$;

CREATE FUNCTION public.commercial_payment_record_checkout_v1(
  p_operation uuid,
  p_session_id text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  op public.provider_operations;
  prep public.commercial_checkout_preparations;
  recorded jsonb;
  sub_state text;
  stripe_sub text;
  evidence integer;
BEGIN
  IF p_operation IS NULL OR p_session_id IS NULL OR p_session_id !~ '^cs_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  SELECT * INTO prep
  FROM public.commercial_checkout_preparations
  WHERE checkout_operation_id = p_operation
  FOR UPDATE;
  IF prep.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  SELECT * INTO op
  FROM public.provider_operations
  WHERE id = p_operation
    AND kind = 'CREATE_SUBSCRIPTION_CHECKOUT'
    AND purpose = 'COMMERCIAL_CHECKOUT'
    AND commercial_subscription_id = prep.subscription_id
  FOR UPDATE;
  IF op.id IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF op.status = 'SUCCEEDED' OR prep.checkout_session_id IS NOT NULL AND prep.checkout_session_id = p_session_id AND op.status = 'SUBMITTED' THEN
    SELECT state, stripe_subscription_id INTO sub_state, stripe_sub
    FROM public.commercial_subscriptions WHERE id = prep.subscription_id;
    IF sub_state IS DISTINCT FROM 'PAYMENT_PENDING' OR stripe_sub IS NOT NULL THEN
      RAISE EXCEPTION 'a commercial checkout session is not payment evidence';
    END IF;
    RETURN jsonb_build_object('status', 'success', 'activated', false, 'providerOperationStatus', op.status);
  END IF;
  IF prep.checkout_session_id IS NOT NULL AND prep.checkout_session_id IS DISTINCT FROM p_session_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF op.status NOT IN ('PENDING', 'SUBMITTED') THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  recorded := public.payment_record_provider_refs_v1(p_operation, p_session_id, 'checkout.session', 'SUBMITTED');
  IF recorded ->> 'status' IS DISTINCT FROM 'success' THEN
    RETURN recorded;
  END IF;
  UPDATE public.commercial_checkout_preparations
  SET checkout_session_id = coalesce(checkout_session_id, p_session_id)
  WHERE id = prep.id
    AND (checkout_session_id IS NULL OR checkout_session_id = p_session_id);
  UPDATE public.provider_operations
  SET status = 'SUBMITTED'
  WHERE id = op.id
    AND status IS DISTINCT FROM 'SUCCEEDED'
    AND purpose = 'COMMERCIAL_CHECKOUT';
  SELECT state, stripe_subscription_id INTO sub_state, stripe_sub
  FROM public.commercial_subscriptions
  WHERE id = prep.subscription_id;
  SELECT count(*) INTO evidence
  FROM public.commercial_payment_evidence
  WHERE subscription_id = prep.subscription_id;
  IF sub_state IS DISTINCT FROM 'PAYMENT_PENDING' OR stripe_sub IS NOT NULL OR evidence <> 0 THEN
    RAISE EXCEPTION 'a commercial checkout session is not payment evidence';
  END IF;
  RETURN jsonb_build_object('status', 'success', 'activated', false, 'providerOperationStatus', 'SUBMITTED');
END;
$$;

CREATE FUNCTION public.customer_portal_commercial_payment_notice_v1(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sess jsonb;
  customer uuid;
BEGIN
  sess := admin_private.customer_portal_session_v1(p_token_hash);
  IF sess IS NULL OR (sess ->> 'customerId') IS NULL THEN
    RETURN NULL;
  END IF;
  customer := (sess ->> 'customerId')::uuid;
  RETURN coalesce((
    SELECT jsonb_agg(item.payload ORDER BY item.offer_ref)
    FROM (
      SELECT
        sub.public_ref AS offer_ref,
        jsonb_build_object(
          'offerRef', sub.public_ref,
          'product', CASE acceptance.product_code WHEN 'TELLOYA' THEN 'Telloya' ELSE 'Complete' END,
          'totalMinor', CASE
            WHEN acceptance.tax_behaviour = 'EXCLUSIVE' THEN acceptance.amount_minor + acceptance.tax_amount_minor
            ELSE acceptance.amount_minor
          END,
          'cadence', acceptance.cadence,
          'guardChargeMinor', CASE
            WHEN acceptance.guard_included THEN to_jsonb(acceptance.guard_unit_amount_minor * acceptance.guard_quantity)
            ELSE 'null'::jsonb
          END,
          'state', CASE
            WHEN acceptance.cadence IS DISTINCT FROM 'MONTH' THEN 'unsupported'
            WHEN sub.state = 'PAYMENT_PENDING' THEN 'started'
            ELSE 'preparing'
          END
        ) AS payload
      FROM public.commercial_subscriptions AS sub
      JOIN public.commercial_offer_acceptances AS acceptance
        ON acceptance.subscription_id = sub.id
       AND acceptance.customer_id = sub.customer_id
       AND acceptance.business_id = sub.business_id
      JOIN public.business_memberships AS membership
        ON membership.customer_id = customer
       AND membership.business_id = sub.business_id
       AND membership.status = 'verified'
      WHERE sub.customer_id = customer
        AND sub.state IN ('ACCEPTED', 'PAYMENT_PENDING')
    ) AS item
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION admin_private.commercial_payment_remember_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_payment_preparation_response_v1(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.customer_portal_commercial_payment_prepare_v1(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_commercial_payment_prepare_v1(text, uuid, text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.commercial_payment_record_price_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_payment_record_price_v1(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.commercial_payment_record_checkout_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commercial_payment_record_checkout_v1(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.customer_portal_commercial_payment_notice_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_portal_commercial_payment_notice_v1(text) TO service_role;

COMMENT ON FUNCTION public.customer_portal_commercial_payment_prepare_v1(text, uuid, text, boolean) IS
  'Reserves one commercial price operation and one checkout operation for an accepted monthly offer. It does not collect money, store payment evidence, grant an entitlement, or activate a service.';

COMMENT ON FUNCTION public.commercial_payment_record_checkout_v1(uuid, text) IS
  'Stores a checkout session id on the reserved commercial operation. The session is not payment evidence and cannot make the subscription ACTIVE.';

COMMIT;
