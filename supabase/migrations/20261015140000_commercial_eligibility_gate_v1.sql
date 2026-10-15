-- COM-14A international B2B tax and payment eligibility gate.
-- Additive and source-only. Do not apply this file to DEV or Production.
-- It does not move AWS ApprovedMigrationHead, enable Stripe live mode,
-- the Customer Portal, Guard, or mail, and it does not mark PS-2026-10-14.2 operative.
-- Every seeded country is PENDING_REVIEW. Absence of a row is also pending.
-- Non-VAT-registration is not worldwide zero-rated VAT. UNCONFIRMED tax stays blocked.

BEGIN;

CREATE TABLE public.business_establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$' AND country_code NOT IN ('UK', 'EU', 'XX')),
  subdivision_code text CHECK (subdivision_code IS NULL OR subdivision_code ~ '^[A-Z0-9]{1,6}$'),
  legal_name text NOT NULL CHECK (char_length(btrim(legal_name)) BETWEEN 2 AND 200),
  registration_id text,
  tax_id text,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'COMPANIES_HOUSE', 'VAT_ID', 'TAX_ID', 'REGISTRY_EXTRACT', 'ACCOUNTANT_CONFIRMED', 'OTHER'
  )),
  evidence_reference text NOT NULL CHECK (char_length(btrim(evidence_reference)) BETWEEN 20 AND 500),
  verification_status text NOT NULL CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  verified_by uuid,
  verified_at timestamptz,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL UNIQUE,
  superseded_at timestamptz,
  payload_fingerprint text NOT NULL,
  CONSTRAINT business_establishments_verified_actor CHECK (
    verification_status <> 'VERIFIED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CONSTRAINT business_establishments_subdivision CHECK (
    verification_status <> 'VERIFIED' OR country_code NOT IN ('US', 'CA') OR subdivision_code IS NOT NULL
  )
);

CREATE UNIQUE INDEX business_establishments_current_verified_uidx
  ON public.business_establishments (business_id)
  WHERE superseded_at IS NULL AND verification_status = 'VERIFIED';

CREATE TABLE public.commercial_eligibility_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$' AND country_code NOT IN ('UK', 'EU', 'XX')),
  subdivision_code text CHECK (subdivision_code IS NULL OR subdivision_code ~ '^[A-Z0-9]{1,6}$'),
  service_class text NOT NULL CHECK (service_class IN ('GUIDED', 'MANAGED', 'GUARD')),
  payment_flow text NOT NULL CHECK (payment_flow IN (
    'CHECKOUT_UPFRONT', 'HOSTED_INVOICE_SUCCESS_FEE', 'GUARD_RECURRING'
  )),
  b2b_requirement text NOT NULL CHECK (b2b_requirement = 'B2B_VERIFIED'),
  tax_determination text CHECK (tax_determination IS NULL OR tax_determination IN (
    'UK_DOMESTIC_NOT_VAT_REGISTERED',
    'OUTSIDE_UK_PLACE_OF_SUPPLY',
    'VERIFIED_OVERSEAS_REVERSE_CHARGE',
    'TAXABLE_AFTER_REGISTRATION',
    'OTHER_ACCOUNTANT_APPROVED'
  )),
  destination_requirements text NOT NULL CHECK (char_length(btrim(destination_requirements)) BETWEEN 20 AND 1000),
  seller_registration_status text NOT NULL CHECK (seller_registration_status IN (
    'NOT_VAT_REGISTERED', 'REGISTERED', 'UNKNOWN'
  )),
  stripe_flow_ready boolean NOT NULL DEFAULT false,
  presentment_mode text NOT NULL CHECK (presentment_mode IN ('GBP_ONLY', 'LOCAL_AFTER_ELIGIBILITY')),
  presentment_currency text CHECK (presentment_currency IS NULL OR presentment_currency ~ '^[A-Z]{3}$'),
  status text NOT NULL CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'BLOCKED')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  review_due_at timestamptz NOT NULL,
  approved_by uuid,
  evidence_reference text NOT NULL CHECK (char_length(btrim(evidence_reference)) BETWEEN 20 AND 500),
  decision_version integer NOT NULL CHECK (decision_version > 0),
  payload_fingerprint text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_eligibility_approved_shape CHECK (
    status <> 'APPROVED' OR (
      approved_by IS NOT NULL
      AND tax_determination IS NOT NULL
      AND seller_registration_status <> 'UNKNOWN'
      AND stripe_flow_ready
      AND (country_code NOT IN ('US', 'CA') OR subdivision_code IS NOT NULL)
      AND (
        (tax_determination = 'UK_DOMESTIC_NOT_VAT_REGISTERED' AND country_code = 'GB')
        OR (tax_determination <> 'UK_DOMESTIC_NOT_VAT_REGISTERED' AND country_code <> 'GB')
        OR tax_determination = 'OTHER_ACCOUNTANT_APPROVED'
        OR tax_determination = 'TAXABLE_AFTER_REGISTRATION'
      )
      AND (
        (presentment_mode = 'GBP_ONLY' AND (presentment_currency IS NULL OR presentment_currency = 'GBP'))
        OR (
          presentment_mode = 'LOCAL_AFTER_ELIGIBILITY'
          AND presentment_currency IN ('USD', 'EUR', 'AUD', 'NZD', 'SGD', 'AED', 'INR', 'CAD')
        )
      )
    )
  )
);

CREATE UNIQUE INDEX commercial_eligibility_decisions_version_uidx
  ON public.commercial_eligibility_decisions (
    country_code, coalesce(subdivision_code, ''), service_class, payment_flow, decision_version
  );

CREATE TABLE public.commercial_eligibility_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES public.commercial_eligibility_decisions(id) ON DELETE RESTRICT,
  establishment_id uuid REFERENCES public.business_establishments(id) ON DELETE RESTRICT,
  event text NOT NULL,
  actor_id uuid,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION admin_private.protect_commercial_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'commercial eligibility records are immutable' USING ERRCODE = '23514';
END; $$;

CREATE TRIGGER business_establishments_immutable
BEFORE UPDATE OR DELETE ON public.business_establishments
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_commercial_eligibility_v1();

CREATE TRIGGER commercial_eligibility_decisions_immutable
BEFORE UPDATE OR DELETE ON public.commercial_eligibility_decisions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_commercial_eligibility_v1();

CREATE TRIGGER commercial_eligibility_events_immutable
BEFORE UPDATE OR DELETE ON public.commercial_eligibility_events
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_commercial_eligibility_v1();

ALTER TABLE public.business_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_eligibility_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_eligibility_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_establishments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_eligibility_decisions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.commercial_eligibility_events FROM PUBLIC, anon, authenticated, service_role;

-- Review backlog only. These rows are not approvals and do not authorise a sale.
INSERT INTO public.commercial_eligibility_decisions(
  request_id, country_code, service_class, payment_flow, b2b_requirement,
  destination_requirements, seller_registration_status, stripe_flow_ready, presentment_mode,
  status, effective_from, review_due_at, evidence_reference, decision_version, payload_fingerprint
)
SELECT gen_random_uuid(), c.country_code, f.service_class, f.payment_flow, 'B2B_VERIFIED',
  'Pending accountant review. No approval is recorded for this country, service and payment flow.',
  'UNKNOWN', false, 'GBP_ONLY', 'PENDING_REVIEW',
  timestamptz '2026-10-15 00:00:00+00', timestamptz '2027-10-15 00:00:00+00',
  'COM-14A review backlog. No tax approval has been recorded for this country, service and payment flow.',
  1, 'seed-pending'
FROM (VALUES
  ('AT'),('BE'),('BG'),('HR'),('CY'),('CZ'),('DK'),('EE'),('FI'),('FR'),('DE'),('GR'),('HU'),('IE'),
  ('IT'),('LV'),('LT'),('LU'),('MT'),('NL'),('PL'),('PT'),('RO'),('SK'),('SI'),('ES'),('SE'),
  ('GB'),('US'),('CA'),('AU'),('NZ'),('SG'),('AE'),('IN')
) AS c(country_code)
CROSS JOIN (VALUES
  ('GUIDED', 'CHECKOUT_UPFRONT'),
  ('MANAGED', 'HOSTED_INVOICE_SUCCESS_FEE'),
  ('GUARD', 'GUARD_RECURRING')
) AS f(service_class, payment_flow);

INSERT INTO public.commercial_eligibility_events(decision_id, event, details)
SELECT id, 'SEEDED_PENDING', jsonb_build_object('countryCode', country_code, 'serviceClass', service_class, 'paymentFlow', payment_flow)
FROM public.commercial_eligibility_decisions
WHERE payload_fingerprint = 'seed-pending';

ALTER TABLE public.quote_versions
  ADD COLUMN eligibility_snapshot jsonb,
  ADD CONSTRAINT quote_versions_eligibility_snapshot_object CHECK (
    eligibility_snapshot IS NULL OR jsonb_typeof(eligibility_snapshot) = 'object'
  );

ALTER TABLE public.paid_service_acceptances
  ADD COLUMN eligibility_snapshot jsonb,
  ADD CONSTRAINT paid_service_acceptances_eligibility_snapshot_object CHECK (
    eligibility_snapshot IS NULL OR jsonb_typeof(eligibility_snapshot) = 'object'
  );

CREATE FUNCTION admin_private.commercial_eligibility_message_v1() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT 'You can still send an enquiry. We need to confirm that this business, service and payment route are eligible before we can take this order.'::text;
$$;

CREATE FUNCTION admin_private.commercial_service_class_v1(p_code text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_code
    WHEN 'GUIDED_RELAUNCH' THEN 'GUIDED'
    WHEN 'GUIDED_REVIEW' THEN 'GUIDED'
    WHEN 'MANAGED_RELAUNCH' THEN 'MANAGED'
    WHEN 'MANAGED_REVIEW' THEN 'MANAGED'
    WHEN 'RELAUNCH_GUARD' THEN 'GUARD'
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.commercial_payment_flow_v1(p_code text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE admin_private.commercial_service_class_v1(p_code)
    WHEN 'GUIDED' THEN 'CHECKOUT_UPFRONT'
    WHEN 'MANAGED' THEN 'HOSTED_INVOICE_SUCCESS_FEE'
    WHEN 'GUARD' THEN 'GUARD_RECURRING'
    ELSE NULL
  END;
$$;

CREATE FUNCTION admin_private.commercial_tax_matches_v1(
  p_country text, p_determination text, p_tax text
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN p_tax IS NULL OR p_tax = 'UNCONFIRMED' THEN false
    WHEN p_determination = 'UK_DOMESTIC_NOT_VAT_REGISTERED' THEN p_country = 'GB' AND p_tax = 'NOT_APPLICABLE'
    WHEN p_determination = 'OUTSIDE_UK_PLACE_OF_SUPPLY' THEN p_country <> 'GB' AND p_tax = 'NOT_APPLICABLE'
    WHEN p_determination = 'VERIFIED_OVERSEAS_REVERSE_CHARGE' THEN p_country <> 'GB' AND p_tax = 'NOT_APPLICABLE'
    WHEN p_determination = 'TAXABLE_AFTER_REGISTRATION' THEN p_tax IN ('INCLUSIVE', 'EXCLUSIVE')
    WHEN p_determination = 'OTHER_ACCOUNTANT_APPROVED' THEN p_tax IN ('INCLUSIVE', 'EXCLUSIVE', 'NOT_APPLICABLE')
    ELSE false
  END;
$$;

CREATE FUNCTION admin_private.evaluate_commercial_eligibility_v1(
  p_business uuid,
  p_service text,
  p_tax text,
  p_currency text DEFAULT 'GBP',
  p_amount integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  est public.business_establishments;
  est_count integer;
  class text;
  flow text;
  decision public.commercial_eligibility_decisions;
  reason text;
  presentment_amount integer;
BEGIN
  class := admin_private.commercial_service_class_v1(p_service);
  flow := admin_private.commercial_payment_flow_v1(p_service);
  IF class IS NULL OR flow IS NULL THEN
    reason := 'unknown_service';
  ELSIF p_currency IS DISTINCT FROM 'GBP' THEN
    reason := 'currency_not_contract';
  ELSIF p_tax = 'UNCONFIRMED' THEN
    reason := 'tax_unconfirmed';
  ELSE
    SELECT count(*) INTO est_count FROM public.business_establishments
      WHERE business_id = p_business AND superseded_at IS NULL AND verification_status = 'VERIFIED';
    IF est_count > 1 THEN
      reason := 'conflicting_establishment';
    ELSIF est_count = 0 THEN
      reason := 'establishment_unverified';
    ELSE
      SELECT * INTO est FROM public.business_establishments
        WHERE business_id = p_business AND superseded_at IS NULL AND verification_status = 'VERIFIED';
      IF est.country_code IN ('US', 'CA') AND est.subdivision_code IS NULL THEN
        reason := 'subdivision_required';
      ELSE
        SELECT * INTO decision FROM public.commercial_eligibility_decisions
          WHERE country_code = est.country_code
            AND subdivision_code IS NOT DISTINCT FROM est.subdivision_code
            AND service_class = class
            AND payment_flow = flow
            AND effective_from <= now()
          ORDER BY decision_version DESC
          LIMIT 1;
        IF decision.id IS NULL THEN
          reason := 'pending_review';
        ELSIF decision.status = 'BLOCKED' THEN
          reason := 'blocked';
        ELSIF decision.effective_until IS NOT NULL AND decision.effective_until <= now() THEN
          reason := 'expired';
        ELSIF decision.status = 'PENDING_REVIEW' THEN
          reason := 'pending_review';
        ELSIF decision.review_due_at <= now() THEN
          reason := 'review_due';
        ELSIF decision.status IS DISTINCT FROM 'APPROVED' OR NOT decision.stripe_flow_ready THEN
          reason := 'stripe_not_ready';
        ELSIF NOT admin_private.commercial_tax_matches_v1(est.country_code, decision.tax_determination, p_tax) THEN
          reason := 'tax_determination_mismatch';
        ELSE
          presentment_amount := CASE
            WHEN decision.presentment_mode = 'GBP_ONLY' THEN p_amount
            ELSE NULL
          END;
          RETURN jsonb_build_object(
            'ok', true,
            'reason', 'approved',
            'snapshot', jsonb_build_object(
              'decisionId', decision.id,
              'countryCode', decision.country_code,
              'subdivisionCode', decision.subdivision_code,
              'serviceClass', decision.service_class,
              'paymentFlow', decision.payment_flow,
              'taxDetermination', decision.tax_determination,
              'sellerRegistrationStatus', decision.seller_registration_status,
              'contractCurrency', 'GBP',
              'contractAmountMinor', p_amount,
              'presentmentMode', decision.presentment_mode,
              'presentmentCurrency', coalesce(decision.presentment_currency, 'GBP'),
              'presentmentAmountMinor', presentment_amount,
              'fxRate', NULL,
              'decisionVersion', decision.decision_version,
              'effectiveFrom', decision.effective_from,
              'effectiveUntil', decision.effective_until,
              'reviewDueAt', decision.review_due_at
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'ok', false,
    'reason', reason,
    'message', admin_private.commercial_eligibility_message_v1()
  );
END; $$;

CREATE FUNCTION admin_private.quote_offer_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  elig jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status = 'OFFERED'
    AND admin_private.commercial_service_class_v1(NEW.service_code) IS NOT NULL
  THEN
    elig := admin_private.evaluate_commercial_eligibility_v1(
      NEW.business_id, NEW.service_code, NEW.tax_behaviour, NEW.currency, NEW.total_amount_minor
    );
    IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'commercial_eligibility:%', coalesce(elig->>'reason', 'pending_review') USING ERRCODE = 'P0001';
    END IF;
    NEW.eligibility_snapshot := elig->'snapshot';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER quote_versions_commercial_eligibility
BEFORE UPDATE ON public.quote_versions
FOR EACH ROW EXECUTE FUNCTION admin_private.quote_offer_eligibility_v1();

CREATE FUNCTION admin_private.paid_action_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  qv public.quote_versions;
  ord public.service_orders;
  service text;
  tax text;
  currency text;
  amount integer;
  business uuid;
  elig jsonb;
BEGIN
  IF NEW.kind = 'QUOTE_ACCEPTANCE' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = NEW.quote_version_id;
    IF qv.id IS NULL THEN
      RAISE EXCEPTION 'commercial_eligibility:stale_quotation' USING ERRCODE = 'P0001';
    END IF;
    IF qv.tax_behaviour = 'UNCONFIRMED' THEN
      RETURN NEW;
    END IF;
    IF admin_private.commercial_service_class_v1(qv.service_code) IS NULL THEN
      RETURN NEW;
    END IF;
    business := qv.business_id;
    service := qv.service_code;
    tax := qv.tax_behaviour;
    currency := qv.currency;
    amount := qv.total_amount_minor;
  ELSIF NEW.kind IN ('GUIDED_PAYMENT', 'MANAGED_PAYMENT_SETUP', 'PAYMENT_RECOVERY', 'INVOICE_PAYMENT', 'GUARD_SUBSCRIPTION_START') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = NEW.service_order_id;
    IF ord.id IS NULL THEN
      RAISE EXCEPTION 'commercial_eligibility:pending_review' USING ERRCODE = 'P0001';
    END IF;
    business := ord.business_id;
    service := ord.service_code;
    tax := ord.tax_behaviour;
    currency := ord.currency;
    amount := ord.amount_minor;
  ELSE
    RETURN NEW;
  END IF;
  elig := admin_private.evaluate_commercial_eligibility_v1(business, service, tax, currency, amount);
  IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'commercial_eligibility:%', coalesce(elig->>'reason', 'pending_review') USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER customer_actions_commercial_eligibility
BEFORE INSERT ON public.customer_actions
FOR EACH ROW EXECUTE FUNCTION admin_private.paid_action_eligibility_v1();

CREATE FUNCTION admin_private.provider_operation_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  ord public.service_orders;
  sub public.guard_subscriptions;
  business uuid;
  service text;
  tax text;
  currency text;
  amount integer;
  elig jsonb;
BEGIN
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
  business := ord.business_id;
  service := CASE WHEN NEW.kind IN ('CREATE_SUBSCRIPTION_CHECKOUT', 'CREATE_RECOVERY_CHECKOUT') THEN 'RELAUNCH_GUARD' ELSE ord.service_code END;
  tax := ord.tax_behaviour;
  currency := ord.currency;
  amount := ord.amount_minor;
  elig := admin_private.evaluate_commercial_eligibility_v1(business, service, tax, currency, amount);
  IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'commercial_eligibility:%', coalesce(elig->>'reason', 'pending_review') USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER provider_operations_commercial_eligibility
BEFORE INSERT ON public.provider_operations
FOR EACH ROW EXECUTE FUNCTION admin_private.provider_operation_eligibility_v1();

CREATE FUNCTION admin_private.paid_acceptance_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  qv public.quote_versions;
  elig jsonb;
BEGIN
  SELECT * INTO qv FROM public.quote_versions WHERE id = NEW.quote_version_id;
  elig := admin_private.evaluate_commercial_eligibility_v1(
    NEW.business_id, coalesce(qv.service_code, NEW.service_code), coalesce(qv.tax_behaviour, 'UNCONFIRMED'),
    coalesce(qv.currency, NEW.currency), coalesce(qv.total_amount_minor, NEW.amount_minor)
  );
  IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'commercial_eligibility:%', coalesce(elig->>'reason', 'pending_review') USING ERRCODE = 'P0001';
  END IF;
  NEW.eligibility_snapshot := elig->'snapshot';
  RETURN NEW;
END; $$;

CREATE TRIGGER paid_service_acceptances_commercial_eligibility
BEFORE INSERT ON public.paid_service_acceptances
FOR EACH ROW EXECUTE FUNCTION admin_private.paid_acceptance_eligibility_v1();

CREATE OR REPLACE FUNCTION admin_private.paid_service_acceptance_snapshot_v1(p public.paid_service_acceptances) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object(
    'status', 'ok',
    'acceptanceId', p.id,
    'acceptedAt', p.accepted_at,
    'customerId', p.customer_id,
    'quoteVersionId', p.quote_version_id,
    'quoteAcceptanceId', p.quote_acceptance_id,
    'serviceOrderId', p.service_order_id,
    'agreementVersion', p.agreement_version,
    'agreementHash', p.agreement_hash,
    'agreementBody', p.agreement_body,
    'serviceCode', p.service_code,
    'paymentModel', p.payment_model,
    'amountMinor', p.amount_minor,
    'currency', p.currency,
    'businessPurposeText', p.business_purpose_text,
    'businessPurposeAcceptedAt', p.business_purpose_accepted_at,
    'termsAcceptedAt', p.terms_accepted_at,
    'feeBasisKind', p.fee_basis_kind,
    'feeBasisText', p.fee_basis_text,
    'feeBasisAcceptedAt', p.fee_basis_accepted_at,
    'paymentDistinction', p.payment_distinction,
    'quotationSnapshot', p.quotation_snapshot,
    'eligibilitySnapshot', p.eligibility_snapshot
  );
$$;

ALTER FUNCTION admin_private.record_paid_service_acceptance_v1(public.customer_actions, uuid, uuid, jsonb)
  RENAME TO record_paid_service_acceptance_body_v1;

CREATE FUNCTION admin_private.record_paid_service_acceptance_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid, p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  BEGIN
    RETURN admin_private.record_paid_service_acceptance_body_v1(p_action, p_actor, p_request, p_data);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'commercial_eligibility:%' THEN
      RETURN jsonb_build_object(
        'status', 'eligibility_blocked',
        'reason', split_part(SQLERRM, ':', 2),
        'message', admin_private.commercial_eligibility_message_v1()
      );
    END IF;
    RAISE;
  END;
END; $$;

REVOKE ALL ON FUNCTION admin_private.record_paid_service_acceptance_body_v1(public.customer_actions, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.record_paid_service_acceptance_v1(public.customer_actions, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_quote_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb;
BEGIN
  IF p_operation IS DISTINCT FROM 'record_qualification' THEN
    BEGIN
      RETURN admin_private.admin_quote_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM LIKE 'commercial_eligibility:%' THEN
        RETURN jsonb_build_object(
          'status', 'denied',
          'reason', split_part(SQLERRM, ':', 2),
          'message', admin_private.commercial_eligibility_message_v1()
        );
      END IF;
      RAISE;
    END;
  END IF;
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384 THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.quote_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  result := admin_private.record_guard_linked_qualification_v1(actor, p_request, data);
  IF result->>'status' = 'success' THEN
    INSERT INTO admin_private.quote_command_receipts VALUES (p_request, actor, fp, result, now());
  END IF;
  RETURN result;
END; $$;

ALTER FUNCTION public.admin_payment_command_v1(text, uuid, text, jsonb, integer)
  RENAME TO admin_payment_command_core_v1;
ALTER FUNCTION public.admin_payment_command_core_v1(text, uuid, text, jsonb, integer) SET SCHEMA admin_private;
REVOKE ALL ON FUNCTION admin_private.admin_payment_command_core_v1(text, uuid, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_payment_command_v1(
  p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
    RAISE;
  END;
END; $$;

CREATE FUNCTION admin_private.eligibility_evidence_rejected_v1(p_evidence text, p_country text, p_class text, p_flow text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT btrim(p_evidence) = p_country
    OR lower(btrim(p_evidence)) IN (
      'zero', 'not vat registered', 'not vat-registered', 'worldwide zero-rated', 'worldwide zero rated'
    )
    OR btrim(p_evidence) ~* 'worldwide zero'
    OR btrim(p_evidence) = ('Accountant approved ' || p_country || ' ' || p_class || ' ' || p_flow || '.');
$$;

CREATE FUNCTION public.admin_record_business_establishment_v1(
  p_token text, p_request uuid, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  actor uuid;
  data jsonb;
  country text;
  subdivision text;
  evidence text;
  status text;
  legal_name text;
  evidence_type text;
  fingerprint text;
  prior public.business_establishments;
  current_row public.business_establishments;
  created public.business_establishments;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL OR s->>'userId' IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 8192 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  data := p_payload - 'actorId' - 'approvedBy' - 'country' - 'currency';
  country := upper(btrim(coalesce(data->>'countryCode', '')));
  subdivision := nullif(upper(btrim(coalesce(data->>'subdivisionCode', ''))), '');
  evidence := btrim(coalesce(data->>'evidenceReference', ''));
  status := btrim(coalesce(data->>'verificationStatus', ''));
  legal_name := btrim(coalesce(data->>'legalName', ''));
  evidence_type := btrim(coalesce(data->>'evidenceType', ''));
  IF country !~ '^[A-Z]{2}$' OR country IN ('UK', 'EU', 'XX')
    OR status NOT IN ('PENDING', 'VERIFIED', 'REJECTED')
    OR evidence_type NOT IN ('COMPANIES_HOUSE', 'VAT_ID', 'TAX_ID', 'REGISTRY_EXTRACT', 'ACCOUNTANT_CONFIRMED', 'OTHER')
    OR char_length(legal_name) NOT BETWEEN 2 AND 200
    OR char_length(evidence) NOT BETWEEN 20 AND 500
    OR (data->>'businessId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (subdivision IS NOT NULL AND subdivision !~ '^[A-Z0-9]{1,6}$')
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF status = 'VERIFIED' AND country IN ('US', 'CA') AND subdivision IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'subdivision_required');
  END IF;
  IF admin_private.eligibility_evidence_rejected_v1(evidence, country, '', '') THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'evidence_rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = (data->>'businessId')::uuid) THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  fingerprint := md5(jsonb_build_array(data->>'businessId', country, subdivision, legal_name, evidence_type, evidence, status)::text);
  SELECT * INTO prior FROM public.business_establishments WHERE request_id = p_request;
  IF prior.id IS NOT NULL THEN
    IF prior.payload_fingerprint IS DISTINCT FROM fingerprint OR prior.recorded_by IS DISTINCT FROM actor THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'replay', 'id', prior.id, 'countryCode', prior.country_code);
  END IF;
  SELECT * INTO current_row FROM public.business_establishments
    WHERE business_id = (data->>'businessId')::uuid AND superseded_at IS NULL AND verification_status = 'VERIFIED';
  IF current_row.id IS NOT NULL
    AND current_row.country_code IS NOT DISTINCT FROM country
    AND current_row.subdivision_code IS NOT DISTINCT FROM subdivision
  THEN
    RETURN jsonb_build_object('status', 'success', 'id', current_row.id, 'countryCode', current_row.country_code, 'verificationStatus', current_row.verification_status);
  END IF;
  IF current_row.id IS NOT NULL
    AND coalesce(data->>'supersede', '') IS DISTINCT FROM 'true'
  THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'conflicting_establishment');
  END IF;
  IF current_row.id IS NOT NULL AND coalesce(data->>'supersede', '') = 'true' THEN
    PERFORM set_config('app.establishment_supersede', 'on', true);
    UPDATE public.business_establishments SET superseded_at = now() WHERE id = current_row.id;
    PERFORM set_config('app.establishment_supersede', 'off', true);
  END IF;
  INSERT INTO public.business_establishments(
    business_id, country_code, subdivision_code, legal_name, registration_id, tax_id,
    evidence_type, evidence_reference, verification_status, verified_by, verified_at,
    recorded_by, request_id, payload_fingerprint
  ) VALUES (
    (data->>'businessId')::uuid, country, subdivision, legal_name, nullif(btrim(coalesce(data->>'registrationId', '')), ''),
    nullif(btrim(coalesce(data->>'taxId', '')), ''), evidence_type, evidence, status,
    CASE WHEN status = 'VERIFIED' THEN actor ELSE NULL END,
    CASE WHEN status = 'VERIFIED' THEN now() ELSE NULL END,
    actor, p_request, fingerprint
  ) RETURNING * INTO created;
  INSERT INTO public.commercial_eligibility_events(establishment_id, event, actor_id, details)
  VALUES (created.id, 'ESTABLISHMENT_RECORDED', actor, jsonb_build_object(
    'countryCode', created.country_code, 'subdivisionCode', created.subdivision_code, 'status', created.verification_status
  ));
  RETURN jsonb_build_object('status', 'success', 'id', created.id, 'countryCode', created.country_code, 'verificationStatus', created.verification_status);
END; $$;

-- Supersede is the one permitted update, and only from the recording function above.
CREATE OR REPLACE FUNCTION admin_private.protect_commercial_eligibility_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME = 'business_establishments' AND TG_OP = 'UPDATE'
    AND current_setting('app.establishment_supersede', true) = 'on'
    AND NEW.superseded_at IS NOT NULL AND OLD.superseded_at IS NULL
    AND NEW.id = OLD.id AND NEW.business_id = OLD.business_id AND NEW.country_code = OLD.country_code
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'commercial eligibility records are immutable' USING ERRCODE = '23514';
END; $$;

CREATE FUNCTION public.admin_record_eligibility_decision_v1(
  p_token text, p_request uuid, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb;
  actor uuid;
  data jsonb;
  country text;
  subdivision text;
  class text;
  flow text;
  evidence text;
  status text;
  determination text;
  seller text;
  presentment text;
  presentment_currency text;
  destination text;
  fingerprint text;
  prior public.commercial_eligibility_decisions;
  version integer;
  created public.commercial_eligibility_decisions;
  review_due timestamptz;
  effective_until timestamptz;
  stripe_ready boolean;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL OR s->>'userId' IS NULL THEN RETURN jsonb_build_object('status', 'unauthorised'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 8192 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  data := p_payload - 'actorId' - 'approvedBy' - 'country' - 'currency';
  country := upper(btrim(coalesce(data->>'countryCode', '')));
  subdivision := nullif(upper(btrim(coalesce(data->>'subdivisionCode', ''))), '');
  class := btrim(coalesce(data->>'serviceClass', ''));
  flow := btrim(coalesce(data->>'paymentFlow', ''));
  evidence := btrim(coalesce(data->>'evidenceReference', ''));
  status := btrim(coalesce(data->>'status', ''));
  determination := nullif(btrim(coalesce(data->>'taxDetermination', '')), '');
  seller := btrim(coalesce(data->>'sellerRegistrationStatus', 'UNKNOWN'));
  presentment := btrim(coalesce(data->>'presentmentMode', 'GBP_ONLY'));
  presentment_currency := nullif(upper(btrim(coalesce(data->>'presentmentCurrency', ''))), '');
  destination := btrim(coalesce(data->>'destinationRequirements', ''));
  stripe_ready := data->'stripeFlowReady' = 'true'::jsonb;
  BEGIN
    review_due := coalesce((data->>'reviewDueAt')::timestamptz, now() + interval '365 days');
    effective_until := nullif(data->>'effectiveUntil', '')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'invalid');
  END;
  IF country !~ '^[A-Z]{2}$' OR country IN ('UK', 'EU', 'XX')
    OR class NOT IN ('GUIDED', 'MANAGED', 'GUARD')
    OR flow NOT IN ('CHECKOUT_UPFRONT', 'HOSTED_INVOICE_SUCCESS_FEE', 'GUARD_RECURRING')
    OR (class = 'GUIDED' AND flow IS DISTINCT FROM 'CHECKOUT_UPFRONT')
    OR (class = 'MANAGED' AND flow IS DISTINCT FROM 'HOSTED_INVOICE_SUCCESS_FEE')
    OR (class = 'GUARD' AND flow IS DISTINCT FROM 'GUARD_RECURRING')
    OR status NOT IN ('PENDING_REVIEW', 'APPROVED', 'BLOCKED')
    OR char_length(evidence) NOT BETWEEN 20 AND 500
    OR char_length(destination) NOT BETWEEN 20 AND 1000
    OR seller NOT IN ('NOT_VAT_REGISTERED', 'REGISTERED', 'UNKNOWN')
    OR presentment NOT IN ('GBP_ONLY', 'LOCAL_AFTER_ELIGIBILITY')
    OR (subdivision IS NOT NULL AND subdivision !~ '^[A-Z0-9]{1,6}$')
    OR determination IN ('WORLDWIDE_ZERO', 'ZERO_RATED', 'NOT_VAT_MEANS_ZERO')
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF admin_private.eligibility_evidence_rejected_v1(evidence, country, class, flow) THEN
    RETURN jsonb_build_object('status', 'invalid', 'reason', 'evidence_rejected');
  END IF;
  IF status = 'APPROVED' THEN
    IF determination IS NULL OR seller = 'UNKNOWN' OR NOT stripe_ready OR review_due <= now() THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF country IN ('US', 'CA') AND subdivision IS NULL THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'subdivision_required');
    END IF;
    IF determination = 'UK_DOMESTIC_NOT_VAT_REGISTERED' AND country <> 'GB' THEN
      RETURN jsonb_build_object('status', 'invalid', 'reason', 'not_vat_is_not_worldwide_zero');
    END IF;
    IF determination <> 'UK_DOMESTIC_NOT_VAT_REGISTERED'
      AND determination NOT IN (
        'OUTSIDE_UK_PLACE_OF_SUPPLY', 'VERIFIED_OVERSEAS_REVERSE_CHARGE',
        'TAXABLE_AFTER_REGISTRATION', 'OTHER_ACCOUNTANT_APPROVED'
      )
    THEN RETURN jsonb_build_object('status', 'invalid', 'reason', 'unknown_tax_determination'); END IF;
    IF presentment = 'LOCAL_AFTER_ELIGIBILITY'
      AND (presentment_currency IS NULL OR presentment_currency NOT IN ('USD', 'EUR', 'AUD', 'NZD', 'SGD', 'AED', 'INR', 'CAD'))
    THEN RETURN jsonb_build_object('status', 'invalid', 'reason', 'presentment_currency'); END IF;
  END IF;
  fingerprint := md5(jsonb_build_array(
    country, subdivision, class, flow, determination, seller, presentment, presentment_currency, status, evidence, destination, effective_until
  )::text);
  SELECT * INTO prior FROM public.commercial_eligibility_decisions WHERE request_id = p_request;
  IF prior.id IS NOT NULL THEN
    IF prior.payload_fingerprint IS DISTINCT FROM fingerprint
      OR (status IN ('APPROVED', 'BLOCKED') AND prior.approved_by IS DISTINCT FROM actor)
    THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'replay', 'id', prior.id, 'decisionStatus', prior.status, 'decisionVersion', prior.decision_version);
  END IF;
  SELECT coalesce(max(decision_version), 0) + 1 INTO version
  FROM public.commercial_eligibility_decisions
  WHERE country_code = country AND subdivision_code IS NOT DISTINCT FROM subdivision
    AND service_class = class AND payment_flow = flow;
  INSERT INTO public.commercial_eligibility_decisions(
    request_id, country_code, subdivision_code, service_class, payment_flow, b2b_requirement,
    tax_determination, destination_requirements, seller_registration_status, stripe_flow_ready,
    presentment_mode, presentment_currency, status, effective_from, effective_until, review_due_at, approved_by,
    evidence_reference, decision_version, payload_fingerprint
  ) VALUES (
    p_request, country, subdivision, class, flow, 'B2B_VERIFIED', determination, destination, seller,
    stripe_ready, presentment, presentment_currency, status, now(), effective_until, review_due,
    CASE WHEN status IN ('APPROVED', 'BLOCKED') THEN actor ELSE NULL END,
    evidence, version, fingerprint
  ) RETURNING * INTO created;
  INSERT INTO public.commercial_eligibility_events(decision_id, event, actor_id, details)
  VALUES (created.id, 'DECISION_RECORDED', actor, jsonb_build_object(
    'status', created.status, 'countryCode', created.country_code, 'serviceClass', created.service_class,
    'paymentFlow', created.payment_flow, 'decisionVersion', created.decision_version
  ));
  RETURN jsonb_build_object(
    'status', 'success', 'id', created.id, 'decisionStatus', created.status, 'decisionVersion', created.decision_version
  );
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_payment_apply_v1(
  p_action_id uuid,
  p_actor uuid,
  p_request uuid,
  p_fingerprint text,
  p_operation text,
  p_data jsonb,
  p_channel text,
  p_customer uuid,
  p_case uuid,
  p_bound_email text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $apply$
DECLARE
  a public.customer_actions;
  fp text;
  cached jsonb;
  result jsonb;
  ord public.service_orders;
  qv public.quote_versions;
  consent public.payment_consents;
  ob public.payment_obligations;
  op public.provider_operations;
  elig jsonb;
  att public.payment_attempts;
  n integer;
  prior public.payment_attempts;
BEGIN
  IF p_action_id IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_fingerprint IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('confirm_consent', 'start_checkout')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
    OR p_channel IS NULL OR p_channel NOT IN ('CUSTOMER_OTP', 'CUSTOMER_PORTAL')
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := p_fingerprint;
  SELECT * INTO a FROM public.customer_actions WHERE id = p_action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  IF p_customer IS NOT NULL AND a.customer_id IS DISTINCT FROM p_customer THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_case IS NOT NULL AND a.case_id IS DISTINCT FROM p_case THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_bound_email IS NOT NULL AND lower(a.expected_email_snapshot) IS DISTINCT FROM lower(p_bound_email) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF NOT admin_private.customer_action_eligible_v1(a) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id FOR UPDATE;
  IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM a.customer_id THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_customer IS NOT NULL AND ord.customer_id IS DISTINCT FROM p_customer THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF p_case IS NOT NULL AND ord.case_id IS DISTINCT FROM p_case THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;

  IF p_operation = 'start_checkout' THEN
    elig := admin_private.evaluate_commercial_eligibility_v1(ord.business_id, ord.service_code, ord.tax_behaviour, ord.currency, ord.amount_minor);
    IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RETURN jsonb_build_object('status', 'eligibility_blocked', 'reason', coalesce(elig->>'reason', 'pending_review'), 'message', admin_private.commercial_eligibility_message_v1());
    END IF;
  END IF;
  cached := admin_private.customer_action_receipt_v1(p_actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  IF p_operation = 'confirm_consent' THEN
    IF a.kind <> 'MANAGED_PAYMENT_SETUP' THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
    IF p_data->'accepted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = ord.id;
    IF consent.id IS NULL THEN
      INSERT INTO public.payment_consents(
        customer_id, service_order_id, quote_id, quote_version_id, case_id, amount_minor, currency, payment_model,
        success_definition, consent_text, consent_version, auth_user_id, expected_email_snapshot, customer_action_id
      ) VALUES (
        ord.customer_id, ord.id, ord.quote_id, ord.quote_version_id, ord.case_id, ord.amount_minor, ord.currency, 'SUCCESS_FEE',
        qv.success_definition, admin_private.success_fee_consent_text_v1(), 'SUCCESS_FEE_CONSENT_V1',
        p_actor, a.expected_email_snapshot, a.id
      ) RETURNING * INTO consent;
      PERFORM admin_private.write_payment_ledger_v1(ord.customer_id, ord.id, NULL, 'CONSENT_RECORDED', ord.amount_minor, ord.currency, NULL, 'CUSTOMER', p_actor, 'MANAGED_SETUP');
    END IF;
    result := jsonb_build_object('status','success','consentId', consent.id, 'consentVersion', consent.consent_version);
  ELSE
    IF a.kind = 'MANAGED_PAYMENT_SETUP' THEN
      SELECT * INTO consent FROM public.payment_consents
        WHERE service_order_id = ord.id AND customer_id = ord.customer_id
          AND quote_version_id = ord.quote_version_id AND amount_minor = ord.amount_minor
          AND success_definition = qv.success_definition;
      IF consent.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    ELSIF a.kind IN ('GUIDED_PAYMENT','PAYMENT_RECOVERY') THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id FOR UPDATE;
      IF ob.id IS NULL OR ob.state IN ('PAID','VOID') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      PERFORM pg_advisory_xact_lock(hashtextextended(ob.id::text, 14));
      IF a.kind = 'PAYMENT_RECOVERY' THEN
        SELECT * INTO prior FROM public.payment_attempts
          WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
            AND purpose IN ('CHECKOUT','OFF_SESSION')
            AND stripe_payment_intent_id IS NOT NULL
          ORDER BY created_at ASC LIMIT 1;
        IF prior.id IS NOT NULL THEN
          SELECT * INTO op FROM public.provider_operations WHERE id = prior.provider_operation_id;
          IF op.status <> 'CANCELLED' THEN
            SELECT * INTO op FROM public.provider_operations
              WHERE obligation_id = ob.id AND kind = 'CANCEL_PAYMENT_INTENT' AND status IN ('PENDING','SUBMITTED')
              ORDER BY created_at ASC LIMIT 1;
            IF op.id IS NULL THEN
              INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
              VALUES (extensions.gen_random_uuid(), 'CANCEL_PAYMENT_INTENT', 'RECOVERY', ord.customer_id, ord.id, ob.id, 'PENDING')
              RETURNING * INTO op;
            END IF;
            result := jsonb_build_object(
              'status','needs_cancel','paymentIntentId', prior.stripe_payment_intent_id,
              'attemptId', prior.id, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
              'serviceOrderId', ord.id, 'obligationId', ob.id, 'customerId', ord.customer_id
            );
            INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
            RETURN result;
          END IF;
        END IF;
      END IF;
    ELSE
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    IF ob.id IS NOT NULL THEN
      SELECT * INTO att FROM public.payment_attempts
        WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
          AND purpose = CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'CHECKOUT' END
        ORDER BY created_at ASC LIMIT 1;
      IF att.id IS NOT NULL THEN
        SELECT * INTO op FROM public.provider_operations WHERE id = att.provider_operation_id;
        IF (a.kind = 'GUIDED_PAYMENT' AND op.kind IS DISTINCT FROM 'CREATE_CHECKOUT_SESSION')
          OR (a.kind = 'PAYMENT_RECOVERY' AND op.kind IS DISTINCT FROM 'CREATE_RECOVERY_SESSION')
          OR att.purpose IN ('INVOICE','OFF_SESSION')
        THEN
          RETURN jsonb_build_object('status', 'denied');
        END IF;
        result := jsonb_build_object(
          'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
          'attemptId', att.id, 'amountMinor', coalesce(ob.amount_minor, 0), 'currency', ord.currency,
          'mode', CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'payment' ELSE 'payment' END,
          'checkoutSessionId', att.stripe_checkout_session_id, 'reused', true,
          'offSession', false, 'serviceOrderId', ord.id, 'obligationId', ob.id,
          'customerId', ord.customer_id, 'orderRef', ord.public_ref
        );
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
        RETURN result;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.payment_attempts
        WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
          AND purpose <> CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'CHECKOUT' END
      ) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
      IF admin_private.obligation_has_blocking_invoice_v1(ob.id) THEN
        RETURN jsonb_build_object('status', 'denied');
      END IF;
    ELSIF a.kind = 'MANAGED_PAYMENT_SETUP' THEN
      SELECT * INTO op FROM public.provider_operations
        WHERE service_order_id = ord.id AND kind = 'CREATE_SETUP_SESSION' AND status IN ('PENDING','SUBMITTED')
        ORDER BY created_at ASC LIMIT 1;
      IF op.id IS NOT NULL THEN
        result := jsonb_build_object(
          'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
          'attemptId', NULL, 'amountMinor', 0, 'currency', ord.currency, 'mode', 'setup',
          'checkoutSessionId', op.provider_object_id, 'reused', true,
          'offSession', true, 'serviceOrderId', ord.id, 'obligationId', NULL,
          'customerId', ord.customer_id, 'orderRef', ord.public_ref
        );
        INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
        RETURN result;
      END IF;
    END IF;
    INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
    VALUES (
      coalesce(NULLIF(p_data->>'idempotencyKey','')::uuid, extensions.gen_random_uuid()),
      CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'CREATE_SETUP_SESSION' WHEN 'PAYMENT_RECOVERY' THEN 'CREATE_RECOVERY_SESSION' ELSE 'CREATE_CHECKOUT_SESSION' END,
      CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'SETUP' WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'UPFRONT' END,
      ord.customer_id, ord.id, ob.id, 'PENDING'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
    SELECT * INTO op FROM public.provider_operations
      WHERE service_order_id = ord.id AND kind = CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'CREATE_SETUP_SESSION' WHEN 'PAYMENT_RECOVERY' THEN 'CREATE_RECOVERY_SESSION' ELSE 'CREATE_CHECKOUT_SESSION' END
        AND status IN ('PENDING','SUBMITTED')
      ORDER BY created_at DESC LIMIT 1;
    IF ob.id IS NOT NULL THEN
      SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = ob.id;
      INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
      VALUES (ob.id, ord.id, op.id, n, CASE a.kind WHEN 'PAYMENT_RECOVERY' THEN 'RECOVERY' ELSE 'CHECKOUT' END, 'CREATED', ob.amount_minor, ob.currency)
      ON CONFLICT (provider_operation_id) DO NOTHING;
      SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id;
    END IF;
    result := jsonb_build_object(
      'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'attemptId', att.id, 'amountMinor', coalesce(ob.amount_minor, 0), 'currency', ord.currency,
      'mode', CASE a.kind WHEN 'MANAGED_PAYMENT_SETUP' THEN 'setup' ELSE 'payment' END,
      'offSession', a.kind = 'MANAGED_PAYMENT_SETUP', 'serviceOrderId', ord.id, 'obligationId', ob.id,
      'customerId', ord.customer_id, 'orderRef', ord.public_ref, 'checkoutSessionId', att.stripe_checkout_session_id
    );
  END IF;
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, fp, result, now());
  RETURN result;
END;
$apply$;


CREATE OR REPLACE FUNCTION admin_private.customer_guard_subscription_apply_v1(
  p_action public.customer_actions,
  p_actor uuid,
  p_request uuid,
  p_fingerprint text,
  p_operation text,
  p_data jsonb,
  p_subscription uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path=''
AS $apply$
DECLARE
  sub public.guard_subscriptions;
  consent public.guard_recurring_consents;
  map public.guard_provider_price_maps;
  op public.provider_operations;
  cus public.stripe_customer_maps;
  cont public.guard_continuations;
  included public.guard_coverages;
  trial_end timestamptz;
  cached jsonb;
  elig jsonb;
BEGIN
  IF p_action.id IS NULL OR p_actor IS NULL OR p_request IS NULL OR p_fingerprint IS NULL
    OR p_subscription IS NULL OR p_operation IS NULL OR p_data IS NULL
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = p_subscription FOR UPDATE;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM p_action.customer_id
    OR sub.location_id IS DISTINCT FROM p_action.location_id
  THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  IF p_action.guard_subscription_id IS NOT NULL AND p_action.guard_subscription_id IS DISTINCT FROM sub.id THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF p_operation IN ('start_checkout', 'start_recovery') THEN
    elig := admin_private.evaluate_commercial_eligibility_v1(sub.business_id, 'RELAUNCH_GUARD', sub.tax_behaviour, sub.currency, sub.amount_minor);
    IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RETURN jsonb_build_object('status', 'eligibility_blocked', 'reason', coalesce(elig->>'reason', 'pending_review'), 'message', admin_private.commercial_eligibility_message_v1());
    END IF;
  END IF;
  IF p_operation = 'start_checkout' THEN
    SELECT * INTO consent FROM public.guard_recurring_consents WHERE subscription_id = sub.id;
    IF consent.id IS NULL THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'consent_required'); END IF;
    IF sub.coverage_id IS NOT NULL AND NOT admin_private.guard_non_billing_ready_v1(sub.coverage_id) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'not_ready');
    END IF;
    IF NOT admin_private.guard_tax_provider_ready_v1(sub.tax_behaviour, sub.amount_minor, sub.amount_minor) THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'tax_not_provider_ready');
    END IF;
    SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = sub.price_version_id;
    IF map.id IS NULL OR map.amount_minor IS DISTINCT FROM sub.amount_minor THEN
      RETURN jsonb_build_object('status', 'denied', 'reason', 'wrong_price');
    END IF;
    IF sub.continuation_id IS NOT NULL THEN
      SELECT * INTO cont FROM public.guard_continuations WHERE id = sub.continuation_id;
      SELECT * INTO included FROM public.guard_coverages WHERE id = cont.included_coverage_id;
      IF included.activated_at IS NULL OR included.included_start_at IS NULL OR included.included_end_at IS NULL THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'included_never_activated');
      END IF;
      IF included.included_end_at > now()
        AND included.included_end_at < now() + interval '48 hours 5 minutes'
      THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'included_trial_window_unsupported');
      END IF;
      IF included.included_end_at >= now() + interval '48 hours 5 minutes' THEN
        trial_end := included.included_end_at;
      END IF;
    END IF;
    SELECT * INTO cus FROM public.stripe_customer_maps WHERE customer_id = sub.customer_id;
    SELECT * INTO op FROM public.provider_operations
      WHERE guard_subscription_id = sub.id AND kind = 'CREATE_SUBSCRIPTION_CHECKOUT' AND status IN ('PENDING', 'SUBMITTED', 'SUCCEEDED')
      ORDER BY created_at ASC LIMIT 1;
    IF op.id IS NULL THEN
      INSERT INTO public.provider_operations(
        idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
      ) VALUES (
        coalesce(NULLIF(p_data->>'idempotencyKey', '')::uuid, p_request), 'CREATE_SUBSCRIPTION_CHECKOUT',
        'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
      ) RETURNING * INTO op;
    END IF;
    UPDATE public.guard_subscriptions SET lifecycle_state = 'PENDING_PROVIDER' WHERE id = sub.id AND lifecycle_state = 'PENDING_CUSTOMER';
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CHECKOUT_CREATED', 'PENDING_CUSTOMER', 'PENDING_PROVIDER',
      'Subscription Checkout prepared', jsonb_build_object('providerOperationId', op.id, 'trialEnd', trial_end));
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeCustomerId', cus.stripe_customer_id, 'stripePriceId', map.stripe_price_id, 'amountMinor', sub.amount_minor,
      'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardCoverageId', sub.coverage_id,
      'guardSubscriptionId', sub.id, 'priceVersionId', sub.price_version_id, 'continuationId', sub.continuation_id,
      'mode', 'subscription', 'trialEnd', trial_end, 'includedEndAt', included.included_end_at,
      'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'start_recovery' THEN
    op := admin_private.guard_reuse_provider_operation_v1(
      p_request, 'CREATE_RECOVERY_CHECKOUT', 'GUARD_RECOVERY', sub.customer_id, sub.service_order_id, sub.id
    );
    SELECT * INTO cus FROM public.stripe_customer_maps WHERE customer_id = sub.customer_id;
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeCustomerId', cus.stripe_customer_id, 'stripeSubscriptionId', sub.stripe_subscription_id,
      'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardSubscriptionId', sub.id,
      'priceVersionId', sub.price_version_id, 'mode', 'setup', 'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'request_period_end_cancellation' THEN
    IF sub.lifecycle_state IN ('CANCELED', 'ENDED') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    UPDATE public.guard_subscriptions SET
      cancellation_intent = 'CANCEL_AT_PERIOD_END', requested_cancel_at_period_end = true
      WHERE id = sub.id RETURNING * INTO sub;
    op := admin_private.guard_reuse_provider_operation_v1(
      p_request, 'CANCEL_SUBSCRIPTION_PERIOD_END', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id
    );
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CANCELLATION_REQUESTED', NULL, sub.lifecycle_state,
      'Customer requested period-end cancellation', jsonb_build_object('providerOperationId', op.id));
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeSubscriptionId', sub.stripe_subscription_id, 'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'undo_period_end_cancellation' THEN
    IF sub.lifecycle_state IN ('CANCELED', 'ENDED') THEN RETURN jsonb_build_object('status', 'denied', 'reason', 'already_ended'); END IF;
    UPDATE public.guard_subscriptions SET
      cancellation_intent = 'UNDO_PERIOD_END', requested_cancel_at_period_end = false
      WHERE id = sub.id RETURNING * INTO sub;
    op := admin_private.guard_reuse_provider_operation_v1(
      p_request, 'UNDO_SUBSCRIPTION_CANCELLATION', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id
    );
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CANCELLATION_REQUESTED', NULL, sub.lifecycle_state,
      'Customer requested undo of scheduled cancellation', jsonb_build_object('providerOperationId', op.id));
    cached := jsonb_build_object(
      'status', 'success', 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeSubscriptionId', sub.stripe_subscription_id, 'providerOperationStatus', op.status
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
    RETURN cached;
  END IF;
  IF p_operation <> 'request_immediate_cancellation' THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  UPDATE public.guard_subscriptions SET cancellation_intent = 'REQUEST_IMMEDIATE_CANCELLATION' WHERE id = sub.id;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'CANCELLATION_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Customer requested immediate cancellation review', '{}'::jsonb);
  cached := jsonb_build_object('status', 'success', 'reviewRequired', true);
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, p_actor, p_fingerprint, cached, now());
  RETURN cached;
END;
$apply$;

-- A stored checkout receipt is not a new authorisation. Replaying it after the
-- decision is pending, blocked, expired or revoked returns the customer refusal
-- instead of the previous provider operation.
ALTER FUNCTION admin_private.customer_action_receipt_v1(uuid, uuid, text)
  RENAME TO customer_action_receipt_body_v1;

CREATE FUNCTION admin_private.customer_action_receipt_v1(
  p_actor uuid, p_request uuid, p_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cached jsonb;
  ord public.service_orders;
  sub public.guard_subscriptions;
  business uuid;
  service text;
  tax text;
  currency text;
  amount integer;
  elig jsonb;
  order_id text;
  subscription_id text;
BEGIN
  cached := admin_private.customer_action_receipt_body_v1(p_actor, p_request, p_fingerprint);
  IF cached IS NULL OR cached->>'status' IS DISTINCT FROM 'success' OR cached->>'providerOperationId' IS NULL THEN
    RETURN cached;
  END IF;
  order_id := cached->>'serviceOrderId';
  subscription_id := cached->>'guardSubscriptionId';
  IF coalesce(cached->>'mode', '') = 'subscription'
    AND subscription_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = subscription_id::uuid;
    IF sub.id IS NULL THEN
      RETURN jsonb_build_object('status', 'eligibility_blocked', 'reason', 'pending_review', 'message', admin_private.commercial_eligibility_message_v1());
    END IF;
    business := sub.business_id;
    service := 'RELAUNCH_GUARD';
    tax := sub.tax_behaviour;
    currency := sub.currency;
    amount := sub.amount_minor;
  ELSIF order_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = order_id::uuid;
    IF ord.id IS NULL THEN
      RETURN jsonb_build_object('status', 'eligibility_blocked', 'reason', 'pending_review', 'message', admin_private.commercial_eligibility_message_v1());
    END IF;
    business := ord.business_id;
    service := ord.service_code;
    tax := ord.tax_behaviour;
    currency := ord.currency;
    amount := ord.amount_minor;
  ELSE
    RETURN cached;
  END IF;
  elig := admin_private.evaluate_commercial_eligibility_v1(business, service, tax, currency, amount);
  IF coalesce(elig->>'ok', 'false') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object(
      'status', 'eligibility_blocked',
      'reason', coalesce(elig->>'reason', 'pending_review'),
      'message', admin_private.commercial_eligibility_message_v1()
    );
  END IF;
  RETURN cached;
END; $$;

REVOKE ALL ON FUNCTION admin_private.protect_commercial_eligibility_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_eligibility_message_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_service_class_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_payment_flow_v1(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.commercial_tax_matches_v1(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.evaluate_commercial_eligibility_v1(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.quote_offer_eligibility_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.paid_action_eligibility_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.provider_operation_eligibility_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.paid_acceptance_eligibility_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.eligibility_evidence_rejected_v1(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_action_receipt_body_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.customer_action_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_quote_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payment_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_record_business_establishment_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_record_eligibility_decision_v1(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_quote_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_payment_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_business_establishment_v1(text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_eligibility_decision_v1(text, uuid, jsonb) TO service_role;

COMMIT;
