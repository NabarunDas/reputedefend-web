-- Stripe payments v1 (Step 14). Additive only.
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / STRIPE DISABLED.
-- Do not apply from this PR. Do not create Stripe objects. Do not enable live mode.

BEGIN;

ALTER TABLE admin_private.job_outbox DROP CONSTRAINT job_outbox_topic_check;
ALTER TABLE admin_private.job_outbox ADD CONSTRAINT job_outbox_topic_check
  CHECK (topic IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT'));
ALTER TABLE admin_private.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE admin_private.jobs ADD CONSTRAINT jobs_type_check
  CHECK (job_type IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT'));

CREATE OR REPLACE FUNCTION admin_private.enqueue_outbox_v1(
  p_event_key text, p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_available_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE created admin_private.job_outbox;
BEGIN
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 8 AND 200
    OR p_topic IS NULL OR p_topic NOT IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid outbox event'; END IF;
  INSERT INTO admin_private.job_outbox(event_key, topic, aggregate_type, aggregate_id, payload, available_at)
  VALUES (btrim(p_event_key), p_topic, nullif(btrim(coalesce(p_aggregate_type, '')), ''), p_aggregate_id, p_payload, coalesce(p_available_at, now()))
  RETURNING * INTO created;
  RETURN created.id;
END; $$;

CREATE TABLE public.stripe_customer_maps (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE RESTRICT,
  stripe_customer_id text NOT NULL UNIQUE CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  livemode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_customer_maps_test_only CHECK (livemode = false)
);

CREATE TABLE public.payment_consents (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  quote_version_id uuid NOT NULL REFERENCES public.quote_versions(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  payment_model text NOT NULL CHECK (payment_model = 'SUCCESS_FEE'),
  success_definition text NOT NULL CHECK (char_length(success_definition) BETWEEN 10 AND 5000),
  consent_text text NOT NULL CHECK (char_length(consent_text) BETWEEN 40 AND 5000),
  consent_version text NOT NULL CHECK (consent_version = 'SUCCESS_FEE_CONSENT_V1'),
  intended_usage text NOT NULL DEFAULT 'OFF_SESSION' CHECK (intended_usage = 'OFF_SESSION'),
  consented_at timestamptz NOT NULL DEFAULT now(),
  auth_user_id uuid NOT NULL,
  expected_email_snapshot text NOT NULL,
  customer_action_id uuid NOT NULL REFERENCES public.customer_actions(id) ON DELETE RESTRICT
);

CREATE TABLE public.saved_payment_methods (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  consent_id uuid NOT NULL REFERENCES public.payment_consents(id) ON DELETE RESTRICT,
  stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_payment_method_id text NOT NULL UNIQUE CHECK (stripe_payment_method_id ~ '^pm_[A-Za-z0-9]+$'),
  brand text,
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  exp_month integer CHECK (exp_month IS NULL OR (exp_month BETWEEN 1 AND 12)),
  exp_year integer CHECK (exp_year IS NULL OR exp_year >= 2026),
  fingerprint text,
  status text NOT NULL CHECK (status IN ('PENDING','USABLE','UNUSABLE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
CREATE UNIQUE INDEX saved_payment_methods_one_usable_order_idx
  ON public.saved_payment_methods (service_order_id) WHERE status = 'USABLE';

CREATE TABLE public.success_fee_approvals (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  service_order_id uuid NOT NULL UNIQUE REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE RESTRICT,
  quote_version_id uuid NOT NULL REFERENCES public.quote_versions(id) ON DELETE RESTRICT,
  outcome text NOT NULL,
  success_definition text NOT NULL,
  evidence_note text NOT NULL CHECK (char_length(evidence_note) BETWEEN 10 AND 2000),
  approval_reason text NOT NULL CHECK (char_length(approval_reason) BETWEEN 10 AND 2000),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  discount_amount_minor integer NOT NULL CHECK (discount_amount_minor >= 0),
  tax_behaviour text NOT NULL,
  tax_amount_minor integer NOT NULL CHECK (tax_amount_minor >= 0),
  payment_method_ready boolean NOT NULL,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_obligations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  quote_version_id uuid NOT NULL REFERENCES public.quote_versions(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('UPFRONT','SUCCESS_FEE')),
  state text NOT NULL CHECK (state IN ('DUE','COLLECTING','AUTHENTICATION_REQUIRED','FAILED','PAID','VOID')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  tax_behaviour text NOT NULL CHECK (tax_behaviour IN ('INCLUSIVE','EXCLUSIVE','NOT_APPLICABLE')),
  tax_amount_minor integer NOT NULL CHECK (tax_amount_minor >= 0),
  success_fee_approval_id uuid REFERENCES public.success_fee_approvals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  CONSTRAINT payment_obligations_kind_model CHECK (
    (kind = 'UPFRONT' AND success_fee_approval_id IS NULL)
    OR (kind = 'SUCCESS_FEE' AND success_fee_approval_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX payment_obligations_one_active_kind_idx
  ON public.payment_obligations (service_order_id, kind) WHERE state <> 'VOID';

CREATE TABLE public.provider_operations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN (
    'CREATE_CUSTOMER','CREATE_CHECKOUT_SESSION','CREATE_SETUP_SESSION','CREATE_PAYMENT_INTENT','CREATE_RECOVERY_SESSION','CREATE_INVOICE'
  )),
  purpose text NOT NULL CHECK (purpose IN ('UPFRONT','SETUP','OFF_SESSION','RECOVERY','INVOICE','CUSTOMER')),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  obligation_id uuid REFERENCES public.payment_obligations(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  livemode boolean NOT NULL DEFAULT false CHECK (livemode = false),
  status text NOT NULL CHECK (status IN ('PENDING','SUBMITTED','SUCCEEDED','FAILED','CANCELLED')),
  provider_object_id text,
  provider_object_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  CONSTRAINT provider_operations_object_once CHECK (
    provider_object_id IS NULL OR provider_object_type IS NOT NULL
  )
);

CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.payment_obligations(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  provider_operation_id uuid NOT NULL UNIQUE REFERENCES public.provider_operations(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  purpose text NOT NULL CHECK (purpose IN ('CHECKOUT','OFF_SESSION','RECOVERY','INVOICE')),
  status text NOT NULL CHECK (status IN ('CREATED','SUBMITTED','REQUIRES_ACTION','SUCCEEDED','FAILED','CANCELLED')),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  failure_category text,
  failure_code text,
  requires_action boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempted_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  UNIQUE (obligation_id, attempt_number)
);

CREATE TABLE public.payment_invoices (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.payment_obligations(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  tax_behaviour text NOT NULL,
  tax_amount_minor integer NOT NULL CHECK (tax_amount_minor >= 0),
  status text NOT NULL CHECK (status IN ('ISSUED','VOID','PAID')),
  provider_invoice_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  obligation_id uuid NOT NULL UNIQUE REFERENCES public.payment_obligations(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  payment_attempt_id uuid NOT NULL UNIQUE REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  tax_behaviour text NOT NULL,
  tax_amount_minor integer NOT NULL CHECK (tax_amount_minor >= 0),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  provider_receipt_url text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  service_order_id uuid REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  obligation_id uuid REFERENCES public.payment_obligations(id) ON DELETE RESTRICT,
  event text NOT NULL CHECK (event IN (
    'OBLIGATION_CREATED','COLLECTION_INITIATED','PROVIDER_PAYMENT_SUCCEEDED','PROVIDER_PAYMENT_FAILED',
    'AUTHENTICATION_REQUIRED','INVOICE_ISSUED','RECEIPT_RECORDED','OBLIGATION_VOIDED','SETUP_RECORDED','CONSENT_RECORDED'
  )),
  amount_minor integer,
  currency text,
  provider_reference text,
  actor_type text NOT NULL CHECK (actor_type IN ('ADMIN','CUSTOMER','PROVIDER','SYSTEM')),
  actor_id uuid,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.stripe_event_receipts (
  provider_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  provider_object_id text,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.payment_command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_actions
  ADD COLUMN service_order_id uuid REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  ADD COLUMN payment_obligation_id uuid REFERENCES public.payment_obligations(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_actions DROP CONSTRAINT customer_actions_kind_check;
ALTER TABLE public.customer_actions ADD CONSTRAINT customer_actions_kind_check CHECK (kind IN (
  'AGREEMENT_ACCEPTANCE','AUTHORIZATION_REVOCATION','CASE_ACCESS','COMMUNICATION_ACCESS','QUOTE_ACCEPTANCE',
  'GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY'
));

ALTER TABLE public.customer_actions DROP CONSTRAINT customer_actions_quote_acceptance_scope_check;
ALTER TABLE public.customer_actions ADD CONSTRAINT customer_actions_quote_acceptance_scope_check CHECK (
  (kind = 'QUOTE_ACCEPTANCE' AND quote_version_id IS NOT NULL AND service_order_id IS NULL AND payment_obligation_id IS NULL
    AND agreement_version_id IS NULL AND authorization_id IS NULL AND evidence_request_id IS NULL AND link_key_version IS NULL)
  OR (kind <> 'QUOTE_ACCEPTANCE')
);
ALTER TABLE public.customer_actions ADD CONSTRAINT customer_actions_payment_scope_check CHECK (
  (kind = 'GUIDED_PAYMENT' AND service_order_id IS NOT NULL AND payment_obligation_id IS NOT NULL AND quote_version_id IS NULL
    AND agreement_version_id IS NULL AND authorization_id IS NULL AND evidence_request_id IS NULL AND link_key_version IS NULL)
  OR (kind = 'MANAGED_PAYMENT_SETUP' AND service_order_id IS NOT NULL AND payment_obligation_id IS NULL AND quote_version_id IS NULL
    AND agreement_version_id IS NULL AND authorization_id IS NULL AND evidence_request_id IS NULL AND link_key_version IS NULL)
  OR (kind = 'PAYMENT_RECOVERY' AND service_order_id IS NOT NULL AND payment_obligation_id IS NOT NULL AND quote_version_id IS NULL
    AND agreement_version_id IS NULL AND authorization_id IS NULL AND evidence_request_id IS NULL AND link_key_version IS NULL)
  OR (kind NOT IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY'))
);

DROP INDEX IF EXISTS public.customer_actions_one_open_kind_idx;
CREATE UNIQUE INDEX customer_actions_one_open_kind_idx
  ON public.customer_actions (case_id, kind, coalesce(agreement_version_id, authorization_id, evidence_request_id, quote_version_id, service_order_id, payment_obligation_id))
  WHERE status = 'OPEN' AND case_id IS NOT NULL;
CREATE UNIQUE INDEX customer_actions_one_open_payment_order_idx
  ON public.customer_actions (service_order_id, kind)
  WHERE status = 'OPEN' AND kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY');

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_check;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_check CHECK (action IN (
  'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
  'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
  'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED','PAYMENT_CHANGED'
));

CREATE FUNCTION admin_private.reject_payment_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Payment financial records are immutable';
END; $$;

CREATE FUNCTION admin_private.protect_payment_obligation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
    OR NEW.quote_id IS DISTINCT FROM OLD.quote_id
    OR NEW.quote_version_id IS DISTINCT FROM OLD.quote_version_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.tax_behaviour IS DISTINCT FROM OLD.tax_behaviour
    OR NEW.tax_amount_minor IS DISTINCT FROM OLD.tax_amount_minor
    OR NEW.success_fee_approval_id IS DISTINCT FROM OLD.success_fee_approval_id
  THEN RAISE EXCEPTION 'Payment obligation commercial snapshot is immutable'; END IF;
  IF OLD.state = 'PAID' AND NEW.state IS DISTINCT FROM 'PAID' THEN
    RAISE EXCEPTION 'Paid obligations cannot regress';
  END IF;
  IF OLD.state = 'VOID' AND NEW.state IS DISTINCT FROM 'VOID' THEN
    RAISE EXCEPTION 'Void obligations cannot change';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

CREATE FUNCTION admin_private.protect_payment_attempt_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.obligation_id IS DISTINCT FROM OLD.obligation_id
    OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
    OR NEW.provider_operation_id IS DISTINCT FROM OLD.provider_operation_id
    OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
    OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
  THEN RAISE EXCEPTION 'Payment attempt snapshot is immutable'; END IF;
  IF OLD.stripe_payment_intent_id IS NOT NULL AND NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id THEN
    RAISE EXCEPTION 'PaymentIntent id is set-once';
  END IF;
  IF OLD.stripe_checkout_session_id IS NOT NULL AND NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id THEN
    RAISE EXCEPTION 'Checkout session id is set-once';
  END IF;
  IF OLD.status = 'SUCCEEDED' AND NEW.status IS DISTINCT FROM 'SUCCEEDED' THEN
    RAISE EXCEPTION 'Successful payment attempts cannot regress';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER payment_consents_immutable BEFORE UPDATE OR DELETE ON public.payment_consents
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_mutation_v1();
CREATE TRIGGER stripe_customer_maps_immutable BEFORE UPDATE OR DELETE ON public.stripe_customer_maps
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_mutation_v1();
CREATE TRIGGER success_fee_approvals_immutable BEFORE UPDATE OR DELETE ON public.success_fee_approvals
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_mutation_v1();
CREATE TRIGGER payment_receipts_immutable BEFORE UPDATE OR DELETE ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_mutation_v1();
CREATE TRIGGER payment_ledger_immutable BEFORE UPDATE OR DELETE ON public.payment_ledger
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_mutation_v1();
CREATE TRIGGER payment_invoices_protect BEFORE UPDATE OR DELETE ON public.payment_invoices
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_payment_mutation_v1();
CREATE TRIGGER payment_obligations_protect BEFORE UPDATE ON public.payment_obligations
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_payment_obligation_v1();
CREATE TRIGGER payment_attempts_protect BEFORE UPDATE ON public.payment_attempts
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_payment_attempt_v1();

ALTER TABLE public.stripe_customer_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.success_fee_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.stripe_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.payment_command_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_customer_maps, public.payment_consents, public.saved_payment_methods, public.success_fee_approvals,
  public.payment_obligations, public.provider_operations, public.payment_attempts, public.payment_invoices,
  public.payment_receipts, public.payment_ledger
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON admin_private.stripe_event_receipts, admin_private.payment_command_receipts
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.success_fee_consent_text_v1() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT 'No service fee is charged today. The agreed success fee may be charged later only after the defined successful outcome has occurred and ProfileRelaunch has approved billing. The amount is the immutable accepted quote amount. The payment method may be used off-session for that specific agreed success fee. The issuing bank may later require additional authentication.';
$$;

CREATE FUNCTION admin_private.payment_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r admin_private.payment_command_receipts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  SELECT * INTO r FROM admin_private.payment_command_receipts WHERE request_id = p_request;
  IF r.request_id IS NOT NULL THEN
    IF r.actor_id = p_actor AND r.fingerprint = p_fingerprint THEN RETURN r.response;
    ELSE RETURN jsonb_build_object('status', 'conflict'); END IF;
  END IF;
  RETURN NULL;
END; $$;

CREATE FUNCTION admin_private.write_payment_ledger_v1(
  p_customer uuid, p_order uuid, p_obligation uuid, p_event text, p_amount integer, p_currency text,
  p_ref text, p_actor_type text, p_actor uuid, p_source text
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO public.payment_ledger(
    customer_id, service_order_id, obligation_id, event, amount_minor, currency, provider_reference, actor_type, actor_id, source
  ) VALUES (p_customer, p_order, p_obligation, p_event, p_amount, p_currency, p_ref, p_actor_type, p_actor, p_source);
END; $$;

CREATE FUNCTION admin_private.create_upfront_obligation_v1(p_order public.service_orders) RETURNS public.payment_obligations
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ob public.payment_obligations;
BEGIN
  IF p_order.payment_model <> 'UPFRONT' THEN RETURN NULL; END IF;
  SELECT * INTO ob FROM public.payment_obligations
    WHERE service_order_id = p_order.id AND kind = 'UPFRONT' AND state <> 'VOID';
  IF ob.id IS NOT NULL THEN RETURN ob; END IF;
  INSERT INTO public.payment_obligations(
    service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state,
    amount_minor, currency, tax_behaviour, tax_amount_minor
  ) VALUES (
    p_order.id, p_order.quote_id, p_order.quote_version_id, p_order.customer_id, p_order.case_id, 'UPFRONT', 'DUE',
    p_order.amount_minor, p_order.currency, p_order.tax_behaviour, p_order.tax_amount_minor
  ) RETURNING * INTO ob;
  PERFORM admin_private.write_payment_ledger_v1(
    p_order.customer_id, p_order.id, ob.id, 'OBLIGATION_CREATED', ob.amount_minor, ob.currency, NULL, 'SYSTEM', NULL, 'QUOTE_ACCEPTANCE'
  );
  RETURN ob;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.accept_quote_version_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE qv public.quote_versions; qu public.quotes; acc public.quote_acceptances; ord public.service_orders;
  state text; monitoring_status text; ob public.payment_obligations;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_action.quote_version_id::text, 1));
  SELECT * INTO acc FROM public.quote_acceptances WHERE quote_version_id = p_action.quote_version_id;
  SELECT * INTO ord FROM public.service_orders WHERE quote_version_id = p_action.quote_version_id;
  IF acc.id IS NOT NULL AND ord.id IS NOT NULL THEN
    IF p_action.status = 'OPEN' THEN
      UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id;
    END IF;
    RETURN jsonb_build_object('status', 'success', 'actionStatus', 'COMPLETED', 'acceptanceId', acc.id, 'orderId', ord.id, 'orderRef', ord.public_ref);
  END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id FOR UPDATE;
  SELECT * INTO qu FROM public.quotes WHERE id = qv.quote_id FOR UPDATE;
  IF qv.status <> 'OFFERED' OR qu.status <> 'OFFERED' OR qv.valid_until <= now() THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  IF qv.tax_behaviour = 'UNCONFIRMED' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
  INSERT INTO public.quote_acceptances(
    quote_id, quote_version_id, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot,
    total_amount_minor, currency, tax_behaviour, tax_amount_minor
  ) VALUES (
    qu.id, qv.id, p_action.id, p_actor, p_action.expected_email_snapshot,
    qv.total_amount_minor, qv.currency, qv.tax_behaviour, qv.tax_amount_minor
  ) RETURNING * INTO acc;
  UPDATE public.quote_versions SET status = 'ACCEPTED' WHERE id = qv.id;
  UPDATE public.quotes SET status = 'ACCEPTED', record_version = record_version + 1, updated_at = now() WHERE id = qu.id;
  state := CASE qv.payment_model
    WHEN 'UPFRONT' THEN 'ACCEPTED_AWAITING_PAYMENT'
    WHEN 'SUCCESS_FEE' THEN 'ACCEPTED_SUCCESS_FEE'
    ELSE 'ACCEPTED_RECURRING'
  END;
  INSERT INTO public.service_orders(
    public_ref, quote_id, quote_version_id, quote_acceptance_id, customer_id, business_id, location_id, case_id,
    monitoring_request_id, service_code, amount_minor, currency, payment_model, tax_behaviour, tax_rate_bps,
    tax_amount_minor, tax_code, tax_jurisdiction, state, accepted_at
  ) VALUES (
    admin_private.commerce_public_ref_v1('SO'), qu.id, qv.id, acc.id, qv.customer_id, qv.business_id, qv.location_id, qv.case_id,
    qv.monitoring_request_id, qv.service_code, qv.total_amount_minor, qv.currency, qv.payment_model, qv.tax_behaviour,
    qv.tax_rate_bps, qv.tax_amount_minor, qv.tax_code, qv.tax_jurisdiction, state, acc.accepted_at
  ) RETURNING * INTO ord;
  IF ord.payment_model = 'UPFRONT' THEN
    ob := admin_private.create_upfront_obligation_v1(ord);
  END IF;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id;
  INSERT INTO public.quote_events(quote_id, quote_version_id, actor_type, actor_id, event, details)
  VALUES (qu.id, qv.id, 'CUSTOMER', p_actor, 'QUOTE_ACCEPTED', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id));
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (p_action.id, p_action.case_id, 'CUSTOMER', p_actor, 'ACTION_COMPLETED', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'COMMERCE_CHANGED', 'success', qu.id, p_request, 'quote',
    'Customer accepted a quote', jsonb_build_object('orderId', ord.id, 'acceptanceId', acc.id, 'quoteVersionId', qv.id));
  IF qv.monitoring_request_id IS NOT NULL THEN
    SELECT status INTO monitoring_status FROM public.monitoring_requests WHERE id = qv.monitoring_request_id;
    IF monitoring_status IS DISTINCT FROM monitoring_status THEN NULL; END IF;
  END IF;
  RETURN jsonb_build_object(
    'status', 'success', 'actionStatus', 'COMPLETED', 'acceptanceId', acc.id, 'orderId', ord.id, 'orderRef', ord.public_ref,
    'orderState', ord.state, 'paymentCreated', false, 'invoiceCreated', false, 'monitoringActivated', false,
    'obligationId', ob.id
  );
END; $$;

CREATE FUNCTION admin_private.guided_payment_ready_v1(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_orders o
    JOIN public.payment_obligations ob ON ob.service_order_id = o.id AND ob.kind = 'UPFRONT' AND ob.state = 'PAID'
    WHERE o.case_id = p_case AND o.payment_model = 'UPFRONT'
  );
$$;

CREATE FUNCTION admin_private.managed_setup_ready_v1(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.service_orders o
    JOIN public.payment_consents c ON c.service_order_id = o.id
    JOIN public.saved_payment_methods pm ON pm.service_order_id = o.id AND pm.consent_id = c.id AND pm.status = 'USABLE'
    WHERE o.case_id = p_case AND o.payment_model = 'SUCCESS_FEE'
  ) AND coalesce((admin_private.case_authorization_readiness_v1(p_case)->>'authorizationReady')::boolean, false);
$$;

CREATE FUNCTION admin_private.published_pack_ready_v1(p_case uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.case_prepared_packs p
    WHERE p.case_id = p_case AND p.published_at IS NOT NULL AND p.unpublished_at IS NULL
      AND admin_private.pack_publishable_v1(p.id)
  );
$$;

CREATE FUNCTION admin_private.case_stage_ready_v1(p_case public.cases, p_target text) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
  IF p_target = 'PREPARATION' THEN
    IF p_case.service_track = 'GUIDED' THEN RETURN admin_private.guided_payment_ready_v1(p_case.id); END IF;
    IF p_case.service_track = 'MANAGED' THEN RETURN admin_private.managed_setup_ready_v1(p_case.id); END IF;
    RETURN false;
  END IF;
  IF p_target = 'READY_TO_SUBMIT' THEN
    IF p_case.service_track = 'GUIDED' THEN
      RETURN admin_private.guided_payment_ready_v1(p_case.id) AND admin_private.published_pack_ready_v1(p_case.id);
    END IF;
    IF p_case.service_track = 'MANAGED' THEN
      RETURN admin_private.managed_setup_ready_v1(p_case.id) AND admin_private.published_pack_ready_v1(p_case.id);
    END IF;
    RETURN false;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_case_command_v1(p_token text,p_request uuid,p_case uuid,p_version integer,p_operation text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;c public.cases;t public.case_tasks; r admin_private.case_command_receipts; fp text; result jsonb; note text; vis text:='INTERNAL'; target text; outcome_value text; due timestamptz; now_time timestamptz:=now(); event_details jsonb:='{}';
BEGIN
 s:=public.admin_session_v1(p_token); IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
 IF p_request IS NULL OR p_case IS NULL OR p_version IS NULL OR p_operation IS NULL OR p_operation NOT IN ('plan','transition','note','task','resolve_task','submission','resolve_submission','close','reopen') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR octet_length(p_data::text)>16000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 note:=p_data->>'note'; IF note IS NULL OR length(btrim(note))<10 OR length(note)>1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
 fp:=md5(jsonb_build_array(p_case,p_version,p_operation,p_data)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 SELECT * INTO r FROM admin_private.case_command_receipts WHERE request_id=p_request;
 IF r.request_id IS NOT NULL THEN
  IF r.actor_id=(s->>'userId')::uuid AND r.fingerprint=fp THEN RETURN r.response; ELSE RETURN jsonb_build_object('status','conflict'); END IF;
 END IF;
 SELECT * INTO c FROM public.cases WHERE id=p_case FOR UPDATE;
 IF c.id IS NULL OR c.workflow_version<>p_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
 IF c.status IN ('CLOSED','CANCELLED') AND p_operation<>'reopen' THEN RETURN jsonb_build_object('status','denied'); END IF;
 IF p_operation='plan' THEN
  IF p_data - ARRAY['note','track','priority','assigned','nextAction','due','firstResponseDue'] <> '{}'::jsonb OR p_data->>'track' IS NULL OR p_data->>'track' NOT IN ('UNDECIDED','GUIDED','MANAGED') OR p_data->>'priority' IS NULL OR p_data->>'priority' NOT IN ('NORMAL','HIGH','URGENT') OR jsonb_typeof(p_data->'assigned') IS DISTINCT FROM 'boolean' OR p_data->>'nextAction' IS NULL OR length(p_data->>'nextAction')>1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF c.service_track<>p_data->>'track' AND (c.work_stage NOT IN ('INITIAL_REVIEW','EVIDENCE_COLLECTION','ASSESSMENT_READY','SERVICE_SELECTION') OR EXISTS(SELECT 1 FROM public.case_submissions WHERE case_id=c.id)) THEN RETURN jsonb_build_object('status','denied'); END IF;
  due:=NULLIF(p_data->>'due','')::timestamptz;
  IF c.work_stage IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION','WAITING_GOOGLE') AND (due IS NULL OR length(btrim(p_data->>'nextAction'))<3) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  UPDATE public.cases SET service_track=p_data->>'track',priority=p_data->>'priority',priority_reason=note,assigned=(p_data->>'assigned')::boolean,next_action=p_data->>'nextAction',next_action_at=due,first_response_due_at=NULLIF(p_data->>'firstResponseDue','')::timestamptz WHERE id=c.id;
 ELSIF p_operation='transition' THEN
  target:=p_data->>'target';due:=NULLIF(p_data->>'due','')::timestamptz;
  IF p_data - ARRAY['note','target','nextAction','due'] <> '{}'::jsonb OR NOT EXISTS(SELECT 1 FROM admin_private.case_transitions WHERE from_stage=c.work_stage AND to_stage=target) THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF (target='PAYMENT_REQUIRED' AND c.service_track<>'GUIDED') OR (target='AUTHORIZATION_REQUIRED' AND c.service_track<>'MANAGED') THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF target IN ('PREPARATION','READY_TO_SUBMIT') AND NOT admin_private.case_stage_ready_v1(c, target) THEN RETURN jsonb_build_object('status','prerequisite'); END IF;
  IF target IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION','WAITING_GOOGLE') AND (due IS NULL OR coalesce(length(btrim(p_data->>'nextAction')),0)<3) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF coalesce(length(p_data->>'nextAction'),0)>1000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  UPDATE public.cases SET work_stage=target,status=CASE WHEN target IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION') THEN 'AWAITING_CUSTOMER' ELSE 'UNDER_REVIEW' END,next_action=coalesce(p_data->>'nextAction',''),next_action_at=due WHERE id=c.id;
  IF target IN ('EVIDENCE_COLLECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','OWNER_ACTION','WAITING_GOOGLE') THEN
   INSERT INTO public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy) VALUES(c.id,left(p_data->>'nextAction',200),CASE WHEN target='WAITING_GOOGLE' THEN 'ADMIN' ELSE 'CUSTOMER' END,'FOLLOW_UP',due,'Internal follow-up; not a Google deadline','UTC','MANUAL_QUEUE');
  END IF;
  event_details:=jsonb_build_object('from',c.work_stage,'to',target);
 ELSIF p_operation='note' THEN
  IF p_data - ARRAY['note','visibility'] <> '{}'::jsonb OR p_data->>'visibility' IS NULL OR p_data->>'visibility' NOT IN ('INTERNAL','CUSTOMER') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  vis:=p_data->>'visibility';
  UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id;
 ELSIF p_operation IN ('task','reopen') THEN
  IF p_data - ARRAY['note','title','owner','kind','due','source','timezone'] <> '{}'::jsonb OR coalesce(length(btrim(p_data->>'title')),0) NOT BETWEEN 3 AND 200 OR p_data->>'owner' IS NULL OR p_data->>'owner' NOT IN ('ADMIN','CUSTOMER') OR p_data->>'kind' IS NULL OR p_data->>'kind' NOT IN ('FOLLOW_UP','EVIDENCE','CALL','COMPLAINT','CANCELLATION','OTHER') OR coalesce(length(btrim(p_data->>'source')),0) NOT BETWEEN 3 AND 500 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_data->>'timezone') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  due:=(p_data->>'due')::timestamptz;IF due IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_operation='reopen' AND c.status NOT IN ('CLOSED','CANCELLED') THEN RETURN jsonb_build_object('status','denied'); END IF;
  INSERT INTO public.case_tasks(case_id,title,owner,kind,due_at,deadline_source,deadline_timezone,reminder_policy) VALUES(c.id,p_data->>'title',p_data->>'owner',p_data->>'kind',due,p_data->>'source',p_data->>'timezone','MANUAL_QUEUE');
  IF p_operation='reopen' THEN
   UPDATE public.cases SET status='UNDER_REVIEW',work_stage='FURTHER_REVIEW',outcome=NULL,closed_at=NULL,closure_summary='',assigned=true,next_action=p_data->>'title',next_action_at=due WHERE id=c.id;
   event_details:=jsonb_build_object('previousOutcome',c.outcome,'previousSummary',c.closure_summary);
  ELSE UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id; END IF;
 ELSIF p_operation='resolve_task' THEN
  IF p_data - ARRAY['note','taskId','status'] <> '{}'::jsonb OR p_data->>'status' IS NULL OR p_data->>'status' NOT IN ('DONE','CANCELLED') THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO t FROM public.case_tasks WHERE id=(p_data->>'taskId')::uuid AND case_id=c.id AND status='OPEN';
  IF t.id IS NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
  UPDATE public.case_tasks SET status=p_data->>'status',resolution=note,resolved_at=now_time WHERE id=t.id;
  UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id;event_details:=jsonb_build_object('taskId',t.id,'status',p_data->>'status');
 ELSIF p_operation='submission' THEN
  IF p_data - ARRAY['note','submittedAt','reference','channel','evidence','confirmed'] <> '{}'::jsonb OR p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb OR c.service_track='UNDECIDED' OR c.work_stage NOT IN ('SERVICE_SELECTION','PAYMENT_REQUIRED','AUTHORIZATION_REQUIRED','READY_TO_SUBMIT','FURTHER_REVIEW') OR coalesce(length(btrim(p_data->>'reference')),0) NOT BETWEEN 1 AND 200 OR coalesce(length(btrim(p_data->>'channel')),0) NOT BETWEEN 3 AND 200 OR coalesce(length(btrim(p_data->>'evidence')),0) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  due:=(p_data->>'submittedAt')::timestamptz;
  IF due IS NULL OR due>now_time OR due<c.created_at THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF EXISTS(SELECT 1 FROM public.case_submissions a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.case_submission_results b WHERE b.submission_id=a.id)) THEN RETURN jsonb_build_object('status','open_work'); END IF;
  INSERT INTO public.case_submissions(case_id,actor,track,submitted_at,google_reference,channel,evidence,recorded_by) VALUES(c.id,CASE WHEN c.service_track='GUIDED' THEN 'CUSTOMER' ELSE 'ADMIN' END,c.service_track,due,p_data->>'reference',p_data->>'channel',p_data->>'evidence',(s->>'userId')::uuid);
  UPDATE public.cases SET work_stage='SUBMITTED',status='UNDER_REVIEW' WHERE id=c.id;
  event_details:=jsonb_build_object('actor',CASE WHEN c.service_track='GUIDED' THEN 'CUSTOMER' ELSE 'ADMIN' END,'recordedOnly',true);
 ELSIF p_operation='resolve_submission' THEN
  IF p_data - ARRAY['note','submissionId','result'] <> '{}'::jsonb OR p_data->>'result' IS NULL OR p_data->>'result' NOT IN ('DECIDED','WITHDRAWN') OR NOT EXISTS(SELECT 1 FROM public.case_submissions WHERE id=(p_data->>'submissionId')::uuid AND case_id=c.id) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  INSERT INTO public.case_submission_results(submission_id,result,note,recorded_by) VALUES((p_data->>'submissionId')::uuid,p_data->>'result',note,(s->>'userId')::uuid);
  UPDATE public.cases SET workflow_version=workflow_version WHERE id=c.id;
 ELSIF p_operation='close' THEN
  outcome_value:=p_data->>'outcome';
  IF p_data - ARRAY['note','outcome','summary'] <> '{}'::jsonb OR coalesce(length(btrim(p_data->>'summary')),0) NOT BETWEEN 10 AND 2000 OR outcome_value IS NULL OR NOT ((c.case_type='PROFILE_RECOVERY' AND outcome_value IN ('RESTORED','PARTIALLY_RESTORED','NOT_RESTORED','WITHDRAWN')) OR (c.case_type='REVIEW_PROTECTION' AND outcome_value IN ('REMOVED','NOT_REMOVED','RESPONSE_RECOMMENDED','WITHDRAWN'))) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF outcome_value<>'WITHDRAWN' AND c.work_stage<>'OUTCOME_REVIEW' THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF EXISTS(SELECT 1 FROM public.case_tasks WHERE case_id=c.id AND status='OPEN') OR EXISTS(SELECT 1 FROM public.case_submissions a WHERE a.case_id=c.id AND NOT EXISTS(SELECT 1 FROM public.case_submission_results b WHERE b.submission_id=a.id)) THEN RETURN jsonb_build_object('status','open_work'); END IF;
  UPDATE public.cases SET status=CASE WHEN outcome_value='WITHDRAWN' THEN 'CANCELLED' ELSE 'CLOSED' END,work_stage='FINISHED',outcome=outcome_value,closure_summary=p_data->>'summary',closed_at=now_time,next_action='',next_action_at=NULL WHERE id=c.id;
  event_details:=jsonb_build_object('outcome',outcome_value,'summary',p_data->>'summary');
 END IF;
 INSERT INTO public.case_work_events(case_id,actor_id,event,note,visibility,details) VALUES(c.id,(s->>'userId')::uuid,p_operation,note,vis,event_details);
 PERFORM admin_private.write_record_audit_v1((s->>'userId')::uuid,'CASE_CHANGED','success',c.id,p_request,'case',note,jsonb_build_object('operation',p_operation,'previousVersion',p_version));
 result:=jsonb_build_object('status','success','id',c.id);
 INSERT INTO admin_private.case_command_receipts VALUES(p_request,(s->>'userId')::uuid,fp,result,now_time);
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR unique_violation THEN RETURN jsonb_build_object('status','invalid');
END; $$;

CREATE OR REPLACE FUNCTION admin_private.protect_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.case_id IS DISTINCT FROM OLD.case_id
    OR NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
    OR NEW.authorization_id IS DISTINCT FROM OLD.authorization_id
    OR NEW.evidence_request_id IS DISTINCT FROM OLD.evidence_request_id
    OR NEW.quote_version_id IS DISTINCT FROM OLD.quote_version_id
    OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
    OR NEW.payment_obligation_id IS DISTINCT FROM OLD.payment_obligation_id
    OR NEW.link_key_version IS DISTINCT FROM OLD.link_key_version
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.secret_hash IS DISTINCT FROM OLD.secret_hash
    OR NEW.expected_email_snapshot IS DISTINCT FROM OLD.expected_email_snapshot
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Customer action scope fields are immutable'; END IF;
  IF OLD.status = 'OPEN' THEN
    IF NEW.status NOT IN ('OPEN','COMPLETED','DECLINED','REVOKED') THEN
      RAISE EXCEPTION 'Invalid customer action status transition';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Customer action status is terminal';
  END IF;
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.validate_customer_action_scope_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v public.agreement_versions; auth public.authorization_records; c public.customers; cs public.cases;
  req public.evidence_requests; qv public.quote_versions; ord public.service_orders; ob public.payment_obligations;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO c FROM public.customers WHERE id = NEW.customer_id;
    IF c.id IS NULL OR lower(NEW.expected_email_snapshot) IS DISTINCT FROM lower(c.email) THEN
      RAISE EXCEPTION 'Customer action email snapshot does not match the current customer email';
    END IF;
  END IF;
  IF NEW.kind = 'AGREEMENT_ACCEPTANCE' THEN
    IF NEW.agreement_version_id IS NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Agreement acceptance actions require an agreement version and no authorisation';
    END IF;
    SELECT * INTO v FROM public.agreement_versions WHERE id = NEW.agreement_version_id;
    IF v.id IS NULL OR v.case_id IS DISTINCT FROM NEW.case_id OR v.customer_id IS DISTINCT FROM NEW.customer_id
      OR v.business_id IS DISTINCT FROM NEW.business_id OR v.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced agreement'; END IF;
  ELSIF NEW.kind = 'AUTHORIZATION_REVOCATION' THEN
    IF NEW.authorization_id IS NULL OR NEW.agreement_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'Authorisation revocation actions require an authorisation and no agreement version';
    END IF;
    SELECT * INTO auth FROM public.authorization_records WHERE id = NEW.authorization_id;
    IF auth.id IS NULL OR auth.case_id IS DISTINCT FROM NEW.case_id OR auth.customer_id IS DISTINCT FROM NEW.customer_id
      OR auth.business_id IS DISTINCT FROM NEW.business_id OR auth.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced authorisation'; END IF;
  ELSIF NEW.kind IN ('CASE_ACCESS','COMMUNICATION_ACCESS') THEN
    IF NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL OR NEW.case_id IS NULL THEN
      RAISE EXCEPTION 'Case access actions require a case and no agreement or authorisation';
    END IF;
    SELECT * INTO cs FROM public.cases WHERE id = NEW.case_id;
    IF cs.id IS NULL OR cs.customer_id IS DISTINCT FROM NEW.customer_id OR cs.business_id IS DISTINCT FROM NEW.business_id
      OR cs.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced case'; END IF;
    IF TG_OP = 'INSERT' AND cs.status IN ('CLOSED','CANCELLED') THEN
      RAISE EXCEPTION 'Case access cannot be created for a closed case';
    END IF;
    IF NEW.kind = 'CASE_ACCESS' AND NEW.evidence_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'Case access actions cannot pin an evidence request';
    END IF;
    IF NEW.kind = 'COMMUNICATION_ACCESS' THEN
      IF NEW.evidence_request_id IS NULL OR NEW.link_key_version IS NULL OR NEW.link_key_version < 1 THEN
        RAISE EXCEPTION 'Communication access actions require an evidence request and link key version';
      END IF;
      SELECT * INTO req FROM public.evidence_requests WHERE id = NEW.evidence_request_id;
      IF req.id IS NULL OR req.case_id IS DISTINCT FROM NEW.case_id OR (TG_OP = 'INSERT' AND req.status <> 'OPEN')
      THEN RAISE EXCEPTION 'Communication access does not match the referenced evidence request'; END IF;
    END IF;
  ELSIF NEW.kind = 'QUOTE_ACCEPTANCE' THEN
    IF NEW.quote_version_id IS NULL OR NEW.agreement_version_id IS NOT NULL OR NEW.authorization_id IS NOT NULL THEN
      RAISE EXCEPTION 'Quote acceptance actions require a quote version and no agreement or authorisation';
    END IF;
    SELECT * INTO qv FROM public.quote_versions WHERE id = NEW.quote_version_id;
    IF qv.id IS NULL OR qv.customer_id IS DISTINCT FROM NEW.customer_id OR qv.business_id IS DISTINCT FROM NEW.business_id
      OR qv.location_id IS DISTINCT FROM NEW.location_id OR qv.case_id IS DISTINCT FROM NEW.case_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced quote version'; END IF;
    IF TG_OP = 'INSERT' AND qv.status <> 'OFFERED' THEN
      RAISE EXCEPTION 'Quote acceptance can only be pinned to an offered quote version';
    END IF;
  ELSIF NEW.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = NEW.service_order_id;
    IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM NEW.customer_id OR ord.business_id IS DISTINCT FROM NEW.business_id
      OR ord.location_id IS DISTINCT FROM NEW.location_id OR ord.case_id IS DISTINCT FROM NEW.case_id
    THEN RAISE EXCEPTION 'Customer action does not match the referenced service order'; END IF;
    IF NEW.kind = 'GUIDED_PAYMENT' THEN
      IF ord.payment_model <> 'UPFRONT' THEN RAISE EXCEPTION 'Guided payment actions require an upfront order'; END IF;
      SELECT * INTO ob FROM public.payment_obligations WHERE id = NEW.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.kind <> 'UPFRONT'
      THEN RAISE EXCEPTION 'Guided payment actions require the order upfront obligation'; END IF;
    ELSIF NEW.kind = 'MANAGED_PAYMENT_SETUP' THEN
      IF ord.payment_model <> 'SUCCESS_FEE' THEN RAISE EXCEPTION 'Managed setup actions require a success-fee order'; END IF;
    ELSIF NEW.kind = 'PAYMENT_RECOVERY' THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = NEW.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id
      THEN RAISE EXCEPTION 'Recovery actions require the same obligation'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid customer action kind';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_action_eligible_v1(p_action public.customer_actions) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE c public.customers; b public.businesses; loc public.locations; cs public.cases;
  qv public.quote_versions; q public.quotes; ord public.service_orders; ob public.payment_obligations;
BEGIN
  IF p_action.id IS NULL OR p_action.status <> 'OPEN' OR p_action.expires_at <= now() THEN RETURN false; END IF;
  IF lower(p_action.expected_email_snapshot) = 'admin@profilerelaunch.com' THEN RETURN false; END IF;
  SELECT * INTO c FROM public.customers WHERE id = p_action.customer_id;
  IF c.id IS NULL OR lower(c.email) IS DISTINCT FROM lower(p_action.expected_email_snapshot) THEN RETURN false; END IF;
  IF NOT admin_private.contact_verified_v1(c.id, 'email') THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_memberships m
    WHERE m.customer_id = p_action.customer_id AND m.business_id = p_action.business_id AND m.status = 'verified'
  ) THEN RETURN false; END IF;
  SELECT * INTO b FROM public.businesses WHERE id = p_action.business_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF p_action.location_id IS NOT NULL THEN
    SELECT * INTO loc FROM public.locations WHERE id = p_action.location_id;
    IF loc.id IS NULL OR loc.business_id <> p_action.business_id THEN RETURN false; END IF;
  END IF;
  IF p_action.case_id IS NOT NULL THEN
    SELECT * INTO cs FROM public.cases WHERE id = p_action.case_id;
    IF cs.id IS NULL OR cs.customer_id <> p_action.customer_id OR cs.business_id <> p_action.business_id THEN RETURN false; END IF;
    IF p_action.location_id IS NOT NULL AND cs.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF cs.status IN ('CLOSED','CANCELLED') THEN RETURN false; END IF;
  END IF;
  IF p_action.kind = 'AGREEMENT_ACCEPTANCE' AND EXISTS (
    SELECT 1 FROM public.agreement_versions v
    WHERE v.id = p_action.agreement_version_id AND v.agreement_kind = 'CASE_MANAGEMENT_PERMISSION'
  ) AND (cs.id IS NULL OR cs.service_track IS DISTINCT FROM 'MANAGED') THEN
    RETURN false;
  END IF;
  IF p_action.kind = 'QUOTE_ACCEPTANCE' THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = p_action.quote_version_id;
    SELECT * INTO q FROM public.quotes WHERE id = qv.quote_id;
    IF qv.id IS NULL OR q.id IS NULL OR qv.status <> 'OFFERED' OR q.status <> 'OFFERED' THEN RETURN false; END IF;
    IF qv.valid_until <= now() THEN RETURN false; END IF;
    IF qv.customer_id IS DISTINCT FROM p_action.customer_id OR qv.business_id IS DISTINCT FROM p_action.business_id
      OR qv.location_id IS DISTINCT FROM p_action.location_id OR qv.case_id IS DISTINCT FROM p_action.case_id
    THEN RETURN false; END IF;
  END IF;
  IF p_action.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM p_action.customer_id THEN RETURN false; END IF;
    IF p_action.payment_obligation_id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = p_action.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state = 'VOID' THEN RETURN false; END IF;
    END IF;
  END IF;
  RETURN true;
END; $$;

CREATE FUNCTION admin_private.prepare_payment_action_v1(p_order uuid, p_kind text)
RETURNS text LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a public.customer_actions;
BEGIN
  SELECT * INTO a FROM public.customer_actions
    WHERE service_order_id = p_order AND kind = p_kind AND status = 'OPEN' FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'clear'; END IF;
  IF a.expires_at > now() THEN RETURN 'exists'; END IF;
  UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = a.id;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, a.case_id, 'ADMIN', a.created_by, 'ACTION_REVOKED',
    jsonb_build_object('reason', 'The previous payment capability expired.', 'source', 'ACTION_EXPIRED', 'kind', a.kind));
  DELETE FROM admin_private.customer_action_challenges WHERE action_id = a.id;
  DELETE FROM admin_private.customer_action_sessions WHERE action_id = a.id;
  RETURN 'expired';
END; $$;

CREATE FUNCTION admin_private.qualifying_success_outcome_v1(p_case public.cases) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT (p_case.case_type = 'PROFILE_RECOVERY' AND p_case.outcome = 'RESTORED')
      OR (p_case.case_type = 'REVIEW_PROTECTION' AND p_case.outcome = 'REMOVED');
$$;


CREATE FUNCTION public.admin_payment_command_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; data jsonb; fp text; cached jsonb; result jsonb;
  ord public.service_orders; ob public.payment_obligations; qv public.quote_versions; cs public.cases;
  action public.customer_actions; prep text; expires timestamptz; secret text;
  approval public.success_fee_approvals; pm public.saved_payment_methods;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR p_operation NOT IN (
      'issue_guided_payment_action','issue_managed_setup_action','issue_recovery_action',
      'approve_success_fee','revoke_action','ensure_customer_map'
    ) OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 16384
  THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  data := coalesce(p_payload, '{}'::jsonb);
  fp := md5(jsonb_build_array(p_operation, data, p_version)::text);
  cached := admin_private.payment_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;

  IF p_operation = 'ensure_customer_map' THEN
    INSERT INTO public.stripe_customer_maps(customer_id, stripe_customer_id, livemode)
    VALUES ((data->>'customerId')::uuid, data->>'stripeCustomerId', false)
    ON CONFLICT (customer_id) DO NOTHING;
    SELECT jsonb_build_object('status','success','id', id, 'stripeCustomerId', stripe_customer_id)
      INTO result FROM public.stripe_customer_maps WHERE customer_id = (data->>'customerId')::uuid;
    INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
    RETURN result;
  END IF;

  SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(data->>'serviceOrderId','')::uuid FOR UPDATE;
  IF ord.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_version IS DISTINCT FROM ord.record_version THEN RETURN jsonb_build_object('status', 'conflict'); END IF;

  IF p_operation = 'issue_guided_payment_action' THEN
    IF ord.payment_model <> 'UPFRONT' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO ob FROM public.payment_obligations WHERE service_order_id = ord.id AND kind = 'UPFRONT' AND state <> 'VOID';
    IF ob.id IS NULL OR ob.state = 'PAID' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'GUIDED_PAYMENT');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id,
      'GUIDED_PAYMENT', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_managed_setup_action' THEN
    IF ord.payment_model <> 'SUCCESS_FEE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'MANAGED_PAYMENT_SETUP');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id,
      'MANAGED_PAYMENT_SETUP', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_CREATED', jsonb_build_object('kind', action.kind));
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'issue_recovery_action' THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = NULLIF(data->>'obligationId','')::uuid FOR UPDATE;
    IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state <> 'AUTHENTICATION_REQUIRED' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    BEGIN expires := (data->>'expiresAt')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'invalid'); END;
    IF expires IS NULL OR expires <= now() OR expires > now() + interval '7 days' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    secret := data->>'secretHash';
    IF secret IS NULL OR secret !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    prep := admin_private.prepare_payment_action_v1(ord.id, 'PAYMENT_RECOVERY');
    IF prep = 'exists' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    INSERT INTO public.customer_actions(
      customer_id, business_id, location_id, case_id, service_order_id, payment_obligation_id,
      kind, secret_hash, expected_email_snapshot, expires_at, created_by
    ) VALUES (
      ord.customer_id, ord.business_id, ord.location_id, ord.case_id, ord.id, ob.id,
      'PAYMENT_RECOVERY', secret, (SELECT email FROM public.customers WHERE id = ord.customer_id), expires, actor
    ) RETURNING * INTO action;
    result := jsonb_build_object('status','success','id', action.id, 'expiresAt', action.expires_at);
  ELSIF p_operation = 'approve_success_fee' THEN
    IF (s->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN RETURN jsonb_build_object('status', 'reauth_required'); END IF;
    IF ord.payment_model <> 'SUCCESS_FEE' THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    SELECT * INTO cs FROM public.cases WHERE id = ord.case_id FOR UPDATE;
    SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
    IF NOT admin_private.qualifying_success_outcome_v1(cs) THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    IF char_length(btrim(coalesce(data->>'evidenceNote',''))) NOT BETWEEN 10 AND 2000
      OR char_length(btrim(coalesce(data->>'approvalReason',''))) NOT BETWEEN 10 AND 2000
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    SELECT * INTO approval FROM public.success_fee_approvals WHERE service_order_id = ord.id;
    IF approval.id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE success_fee_approval_id = approval.id;
      result := jsonb_build_object('status','success','id', approval.id, 'obligationId', ob.id, 'replay', true);
      INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
      RETURN result;
    END IF;
    SELECT * INTO pm FROM public.saved_payment_methods WHERE service_order_id = ord.id AND status = 'USABLE';
    INSERT INTO public.success_fee_approvals(
      service_order_id, case_id, quote_version_id, outcome, success_definition, evidence_note, approval_reason,
      amount_minor, currency, discount_amount_minor, tax_behaviour, tax_amount_minor, payment_method_ready, approved_by
    ) VALUES (
      ord.id, cs.id, qv.id, cs.outcome, qv.success_definition, btrim(data->>'evidenceNote'), btrim(data->>'approvalReason'),
      ord.amount_minor, ord.currency, qv.discount_amount_minor, ord.tax_behaviour, ord.tax_amount_minor, pm.id IS NOT NULL, actor
    ) RETURNING * INTO approval;
    INSERT INTO public.payment_obligations(
      service_order_id, quote_id, quote_version_id, customer_id, case_id, kind, state,
      amount_minor, currency, tax_behaviour, tax_amount_minor, success_fee_approval_id
    ) VALUES (
      ord.id, ord.quote_id, ord.quote_version_id, ord.customer_id, ord.case_id, 'SUCCESS_FEE', 'DUE',
      ord.amount_minor, ord.currency, ord.tax_behaviour, ord.tax_amount_minor, approval.id
    ) RETURNING * INTO ob;
    PERFORM admin_private.write_payment_ledger_v1(
      ord.customer_id, ord.id, ob.id, 'OBLIGATION_CREATED', ob.amount_minor, ob.currency, NULL, 'ADMIN', actor, 'SUCCESS_FEE_APPROVAL'
    );
    IF pm.id IS NOT NULL THEN
      PERFORM admin_private.enqueue_outbox_v1(
        'collect-payment:' || ob.id::text, 'COLLECT_PAYMENT', 'payment_obligation', ob.id,
        jsonb_build_object('obligationId', ob.id, 'serviceOrderId', ord.id), now()
      );
    END IF;
    PERFORM admin_private.write_record_audit_v1(actor, 'PAYMENT_CHANGED', 'success', ord.id, p_request, 'payment_obligation',
      'Success fee approved', jsonb_build_object('obligationId', ob.id, 'outcome', cs.outcome));
    result := jsonb_build_object('status','success','id', approval.id, 'obligationId', ob.id);
  ELSIF p_operation = 'revoke_action' THEN
    SELECT * INTO action FROM public.customer_actions WHERE id = NULLIF(data->>'actionId','')::uuid FOR UPDATE;
    IF action.id IS NULL OR action.service_order_id IS DISTINCT FROM ord.id OR action.status <> 'OPEN' THEN
      RETURN jsonb_build_object('status', 'denied');
    END IF;
    IF char_length(btrim(coalesce(data->>'reason',''))) NOT BETWEEN 10 AND 2000 THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now() WHERE id = action.id RETURNING * INTO action;
    INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
    VALUES (action.id, action.case_id, 'ADMIN', actor, 'ACTION_REVOKED', jsonb_build_object('reason', data->>'reason'));
    result := jsonb_build_object('status','success','id', action.id);
  ELSE
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  INSERT INTO admin_private.payment_command_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.admin_payment_list_v1(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rows jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'orderId', o.id, 'orderRef', o.public_ref, 'customerId', o.customer_id, 'caseId', o.case_id,
    'serviceCode', o.service_code, 'amountMinor', o.amount_minor, 'currency', o.currency,
    'paymentModel', o.payment_model, 'orderState', o.state, 'version', o.record_version,
    'obligationId', ob.id, 'obligationKind', ob.kind, 'obligationState', ob.state,
    'setupReady', EXISTS (SELECT 1 FROM public.saved_payment_methods pm WHERE pm.service_order_id = o.id AND pm.status = 'USABLE'),
    'consentId', c.id, 'approvalId', a.id, 'receiptId', r.id
  ) ORDER BY o.created_at DESC), '[]') INTO rows
  FROM public.service_orders o
  LEFT JOIN public.payment_obligations ob ON ob.service_order_id = o.id AND ob.state <> 'VOID'
  LEFT JOIN public.payment_consents c ON c.service_order_id = o.id
  LEFT JOIN public.success_fee_approvals a ON a.service_order_id = o.id
  LEFT JOIN public.payment_receipts r ON r.service_order_id = o.id;
  RETURN jsonb_build_object('orders', rows);
END; $$;

CREATE FUNCTION public.admin_payment_prepare_operation_v1(
  p_token text, p_request uuid, p_kind text, p_purpose text, p_order uuid, p_obligation uuid, p_idempotency uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; op public.provider_operations; att public.payment_attempts; ob public.payment_obligations; n integer;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  IF p_request IS NULL OR p_idempotency IS NULL OR p_kind IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
  SELECT p_idempotency, p_kind, p_purpose, o.customer_id, o.id, p_obligation, 'PENDING'
  FROM public.service_orders o WHERE o.id = p_order
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO op FROM public.provider_operations WHERE idempotency_key = p_idempotency;
  IF p_obligation IS NOT NULL AND p_kind IN ('CREATE_CHECKOUT_SESSION','CREATE_PAYMENT_INTENT','CREATE_RECOVERY_SESSION') THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = p_obligation;
    SELECT coalesce(max(attempt_number),0) + 1 INTO n FROM public.payment_attempts WHERE obligation_id = p_obligation;
    INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
    SELECT p_obligation, p_order, op.id, n,
      CASE p_kind WHEN 'CREATE_CHECKOUT_SESSION' THEN 'CHECKOUT' WHEN 'CREATE_RECOVERY_SESSION' THEN 'RECOVERY' ELSE 'OFF_SESSION' END,
      'CREATED', ob.amount_minor, ob.currency
    ON CONFLICT (provider_operation_id) DO NOTHING;
    SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id;
    UPDATE public.payment_obligations SET state = CASE WHEN state = 'PAID' THEN state ELSE 'COLLECTING' END WHERE id = p_obligation AND state <> 'PAID';
    PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, p_order, p_obligation, 'COLLECTION_INITIATED', ob.amount_minor, ob.currency, NULL, 'SYSTEM', NULL, p_kind);
  END IF;
  RETURN jsonb_build_object('status','success','id', op.id, 'idempotencyKey', op.idempotency_key, 'attemptId', att.id, 'amountMinor', att.amount_minor);
END; $$;

CREATE FUNCTION public.admin_payment_record_provider_v1(
  p_token text, p_operation uuid, p_object_id text, p_object_type text, p_status text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; op public.provider_operations;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status', 'unauthorized'); END IF;
  UPDATE public.provider_operations
    SET provider_object_id = coalesce(provider_object_id, p_object_id),
        provider_object_type = coalesce(provider_object_type, p_object_type),
        status = coalesce(p_status, status),
        submitted_at = coalesce(submitted_at, now())
    WHERE id = p_operation RETURNING * INTO op;
  IF op.id IS NULL THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF p_object_type = 'checkout.session' THEN
    UPDATE public.payment_attempts SET stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_object_id), status = 'SUBMITTED', attempted_at = now()
      WHERE provider_operation_id = op.id;
  ELSIF p_object_type = 'payment_intent' THEN
    UPDATE public.payment_attempts SET stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_object_id), status = 'SUBMITTED', attempted_at = now()
      WHERE provider_operation_id = op.id;
  END IF;
  RETURN jsonb_build_object('status','success','id', op.id);
END; $$;

CREATE FUNCTION public.admin_payment_apply_event_v1(p_token text, p_event_id text, p_type text, p_object_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; receipt admin_private.stripe_event_receipts; att public.payment_attempts; ob public.payment_obligations;
  pm public.saved_payment_methods; consent public.payment_consents; map public.stripe_customer_maps;
BEGIN
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN
    -- Webhook path uses service-role RPC without admin session via dedicated receiver below.
    NULL;
  END IF;
  RETURN public.payment_apply_provider_event_v1(p_event_id, p_type, p_object_id, p_payload);
END; $$;

CREATE FUNCTION public.payment_receive_stripe_event_v1(p_event_id text, p_type text, p_object_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec admin_private.stripe_event_receipts;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) < 8 OR p_type IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  INSERT INTO admin_private.stripe_event_receipts(provider_event_id, event_type, provider_object_id)
  VALUES (p_event_id, left(p_type, 80), p_object_id)
  ON CONFLICT (provider_event_id) DO NOTHING;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id;
  IF rec.processed THEN RETURN jsonb_build_object('status','success','duplicate', true); END IF;
  PERFORM admin_private.enqueue_outbox_v1(
    'process-stripe-event:' || rec.provider_event_id, 'PROCESS_STRIPE_EVENT', 'stripe_event', NULL,
    jsonb_build_object('eventId', rec.provider_event_id, 'eventType', rec.event_type, 'objectId', rec.provider_object_id), now()
  );
  RETURN jsonb_build_object('status','success','duplicate', false, 'eventId', rec.provider_event_id);
END; $$;

CREATE FUNCTION public.payment_apply_provider_event_v1(p_event_id text, p_type text, p_object_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec admin_private.stripe_event_receipts; att public.payment_attempts; ob public.payment_obligations;
  op public.provider_operations; consent public.payment_consents; ord public.service_orders;
  brand text; last4 text; exp_m integer; exp_y integer; fingerprint text; cus text; pmid text;
BEGIN
  IF p_event_id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id FOR UPDATE;
  IF rec.provider_event_id IS NULL THEN
    INSERT INTO admin_private.stripe_event_receipts(provider_event_id, event_type, provider_object_id)
    VALUES (p_event_id, left(coalesce(p_type,''), 80), p_object_id)
    RETURNING * INTO rec;
  END IF;
  IF rec.processed THEN RETURN jsonb_build_object('status','success','duplicate', true); END IF;

  SELECT * INTO att FROM public.payment_attempts
    WHERE stripe_checkout_session_id = p_object_id OR stripe_payment_intent_id = p_object_id
    ORDER BY created_at DESC LIMIT 1;
  IF att.id IS NOT NULL THEN
    SELECT * INTO ob FROM public.payment_obligations WHERE id = att.obligation_id FOR UPDATE;
    SELECT * INTO op FROM public.provider_operations WHERE id = att.provider_operation_id;
  ELSE
    SELECT * INTO op FROM public.provider_operations WHERE provider_object_id = p_object_id;
    IF op.obligation_id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = op.obligation_id FOR UPDATE;
      SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id;
    END IF;
  END IF;

  IF p_type IN ('checkout.session.completed','payment_intent.succeeded','invoice.paid') THEN
    IF ob.id IS NOT NULL AND ob.state <> 'PAID' THEN
      UPDATE public.payment_attempts SET status = 'SUCCEEDED', succeeded_at = now(), requires_action = false
        WHERE id = att.id AND status <> 'SUCCEEDED';
      UPDATE public.payment_obligations SET state = 'PAID' WHERE id = ob.id;
      INSERT INTO public.payment_receipts(
        obligation_id, service_order_id, customer_id, payment_attempt_id, amount_minor, currency,
        tax_behaviour, tax_amount_minor, stripe_payment_intent_id, stripe_charge_id, provider_receipt_url
      ) VALUES (
        ob.id, ob.service_order_id, ob.customer_id, att.id, ob.amount_minor, ob.currency,
        ob.tax_behaviour, ob.tax_amount_minor, att.stripe_payment_intent_id,
        NULLIF(p_payload->>'chargeId',''), NULLIF(p_payload->>'receiptUrl','')
      ) ON CONFLICT (obligation_id) DO NOTHING;
      PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'PROVIDER_PAYMENT_SUCCEEDED', ob.amount_minor, ob.currency, p_object_id, 'PROVIDER', NULL, p_type);
      PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'RECEIPT_RECORDED', ob.amount_minor, ob.currency, p_object_id, 'SYSTEM', NULL, p_type);
    END IF;
  ELSIF p_type IN ('setup_intent.succeeded','checkout.session.completed_setup') THEN
    cus := NULLIF(p_payload->>'stripeCustomerId','');
    pmid := NULLIF(p_payload->>'paymentMethodId','');
    IF cus IS NOT NULL AND pmid IS NOT NULL THEN
      SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = coalesce(op.service_order_id, (p_payload->>'serviceOrderId')::uuid);
      IF consent.id IS NOT NULL THEN
        INSERT INTO public.saved_payment_methods(
          customer_id, service_order_id, consent_id, stripe_customer_id, stripe_payment_method_id,
          brand, last4, exp_month, exp_year, fingerprint, status, verified_at
        ) VALUES (
          consent.customer_id, consent.service_order_id, consent.id, cus, pmid,
          NULLIF(p_payload->>'brand',''), NULLIF(p_payload->>'last4',''),
          NULLIF(p_payload->>'expMonth','')::integer, NULLIF(p_payload->>'expYear','')::integer,
          NULLIF(p_payload->>'fingerprint',''), 'USABLE', now()
        ) ON CONFLICT (stripe_payment_method_id) DO UPDATE SET status = 'USABLE', verified_at = now();
        PERFORM admin_private.write_payment_ledger_v1(consent.customer_id, consent.service_order_id, NULL, 'SETUP_RECORDED', NULL, NULL, pmid, 'PROVIDER', NULL, p_type);
      END IF;
    END IF;
  ELSIF p_type IN ('payment_intent.requires_action','payment_intent.requires_confirmation') THEN
    IF ob.id IS NOT NULL AND ob.state <> 'PAID' THEN
      UPDATE public.payment_attempts SET status = 'REQUIRES_ACTION', requires_action = true WHERE id = att.id AND status <> 'SUCCEEDED';
      UPDATE public.payment_obligations SET state = 'AUTHENTICATION_REQUIRED' WHERE id = ob.id AND state <> 'PAID';
      PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'AUTHENTICATION_REQUIRED', ob.amount_minor, ob.currency, p_object_id, 'PROVIDER', NULL, p_type);
    END IF;
  ELSIF p_type IN ('payment_intent.payment_failed','checkout.session.expired','checkout.session.async_payment_failed') THEN
    IF ob.id IS NOT NULL AND ob.state <> 'PAID' THEN
      UPDATE public.payment_attempts SET status = 'FAILED', failed_at = now(),
        failure_category = coalesce(NULLIF(p_payload->>'failureCategory',''),'DECLINED'),
        failure_code = left(coalesce(p_payload->>'failureCode',''), 80)
        WHERE id = att.id AND status <> 'SUCCEEDED';
      UPDATE public.payment_obligations SET state = 'FAILED' WHERE id = ob.id AND state <> 'PAID';
      PERFORM admin_private.write_payment_ledger_v1(ob.customer_id, ob.service_order_id, ob.id, 'PROVIDER_PAYMENT_FAILED', ob.amount_minor, ob.currency, p_object_id, 'PROVIDER', NULL, p_type);
    END IF;
  END IF;

  UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
  RETURN jsonb_build_object('status','success','duplicate', false);
END; $$;

CREATE FUNCTION public.customer_payment_command_v1(p_token_hash text, p_request uuid, p_operation text, p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions; a public.customer_actions; fp text; cached jsonb; result jsonb;
  ord public.service_orders; qv public.quote_versions; consent public.payment_consents; ob public.payment_obligations;
  op public.provider_operations; att public.payment_attempts; n integer; prior public.payment_attempts;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN ('confirm_consent','start_checkout')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  fp := md5(jsonb_build_array(sess.action_id, p_operation, p_data)::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id FOR UPDATE;
  IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM a.customer_id THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;

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
        sess.auth_user_id, a.expected_email_snapshot, a.id
      ) RETURNING * INTO consent;
      PERFORM admin_private.write_payment_ledger_v1(ord.customer_id, ord.id, NULL, 'CONSENT_RECORDED', ord.amount_minor, ord.currency, NULL, 'CUSTOMER', sess.auth_user_id, 'MANAGED_SETUP');
    END IF;
    result := jsonb_build_object('status','success','consentId', consent.id, 'consentVersion', consent.consent_version);
  ELSE
    IF a.kind = 'MANAGED_PAYMENT_SETUP' THEN
      SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = ord.id AND customer_action_id = a.id;
      IF consent.id IS NULL THEN RETURN jsonb_build_object('status', 'denied'); END IF;
    ELSIF a.kind IN ('GUIDED_PAYMENT','PAYMENT_RECOVERY') THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id FOR UPDATE;
      IF ob.id IS NULL OR ob.state IN ('PAID','VOID') THEN RETURN jsonb_build_object('status', 'denied'); END IF;
      IF a.kind = 'PAYMENT_RECOVERY' THEN
        FOR prior IN SELECT * FROM public.payment_attempts WHERE obligation_id = ob.id AND status IN ('CREATED','SUBMITTED','REQUIRES_ACTION')
        LOOP
          UPDATE public.payment_attempts SET status = 'CANCELLED', failed_at = now() WHERE id = prior.id AND status <> 'SUCCEEDED';
          UPDATE public.provider_operations SET status = 'CANCELLED' WHERE id = prior.provider_operation_id AND status <> 'SUCCEEDED';
        END LOOP;
      END IF;
    ELSE
      RETURN jsonb_build_object('status', 'unavailable');
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
      'customerId', ord.customer_id, 'orderRef', ord.public_ref
    );
  END IF;
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_session_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; cs public.cases; b public.businesses; loc public.locations;
  qv public.quote_versions; snap public.quote_discount_snapshots; ord public.service_orders;
  ob public.payment_obligations; consent public.payment_consents;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.id IS NULL OR NOT admin_private.customer_action_eligible_v1(a) THEN RETURN NULL; END IF;
  SELECT * INTO cs FROM public.cases WHERE id = a.case_id;
  SELECT * INTO b FROM public.businesses WHERE id = a.business_id;
  SELECT * INTO loc FROM public.locations WHERE id = a.location_id;
  IF a.agreement_version_id IS NOT NULL THEN SELECT * INTO v FROM public.agreement_versions WHERE id = a.agreement_version_id; END IF;
  IF a.authorization_id IS NOT NULL THEN SELECT * INTO auth FROM public.authorization_records WHERE id = a.authorization_id; END IF;
  IF a.quote_version_id IS NOT NULL THEN
    SELECT * INTO qv FROM public.quote_versions WHERE id = a.quote_version_id;
    SELECT * INTO snap FROM public.quote_discount_snapshots WHERE id = qv.discount_snapshot_id;
  END IF;
  IF a.service_order_id IS NOT NULL THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = a.service_order_id;
    SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
    SELECT * INTO ob FROM public.payment_obligations WHERE id = a.payment_obligation_id;
    SELECT * INTO consent FROM public.payment_consents WHERE service_order_id = ord.id;
  END IF;
  RETURN jsonb_build_object(
    'actionId', a.id, 'kind', a.kind, 'status', a.status,
    'maskedEmail', admin_private.mask_email_v1(a.expected_email_snapshot),
    'caseReference', cs.public_ref, 'businessName', b.display_name, 'locationName', loc.location_name,
    'agreement', CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v.id, 'kind', v.agreement_kind, 'title', v.title, 'body', v.body_text, 'scope', v.scope_text, 'versionNumber', v.version_number
    ) END,
    'authorization', CASE WHEN auth.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', auth.id, 'kind', auth.authorization_kind, 'status', auth.status
    ) END,
    'quote', CASE WHEN qv.id IS NULL OR a.quote_version_id IS NULL THEN NULL ELSE jsonb_build_object(
      'versionId', qv.id, 'versionNumber', qv.version_number, 'serviceCode', qv.service_code, 'serviceName', qv.service_name,
      'paymentModel', qv.payment_model, 'scope', qv.scope_text, 'exclusions', qv.exclusions_text,
      'successDefinition', qv.success_definition, 'standardAmountMinor', qv.standard_amount_minor,
      'discountPolicyId', qv.discount_policy_id, 'discountBps', qv.discount_bps, 'discountAmountMinor', qv.discount_amount_minor,
      'discountReason', snap.reason_code, 'quotedSubtotalMinor', qv.quoted_subtotal_minor, 'taxBehaviour', qv.tax_behaviour,
      'taxRateBps', qv.tax_rate_bps, 'taxAmountMinor', qv.tax_amount_minor, 'taxCode', qv.tax_code,
      'taxJurisdiction', qv.tax_jurisdiction, 'totalAmountMinor', qv.total_amount_minor, 'currency', qv.currency,
      'validUntil', qv.valid_until, 'paymentTiming', qv.payment_timing_text, 'termsReference', qv.terms_reference
    ) END,
    'payment', CASE WHEN ord.id IS NULL THEN NULL ELSE jsonb_build_object(
      'orderId', ord.id, 'orderRef', ord.public_ref, 'serviceCode', ord.service_code, 'amountMinor', ord.amount_minor,
      'currency', ord.currency, 'taxBehaviour', ord.tax_behaviour, 'taxAmountMinor', ord.tax_amount_minor,
      'paymentModel', ord.payment_model, 'successDefinition', qv.success_definition,
      'obligationId', ob.id, 'obligationState', ob.state, 'consentId', consent.id,
      'consentText', admin_private.success_fee_consent_text_v1(), 'consentVersion', 'SUCCESS_FEE_CONSENT_V1'
    ) END
  );
END; $$;

CREATE FUNCTION public.payment_ensure_customer_map_v1(p_customer uuid, p_stripe_customer_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE map public.stripe_customer_maps;
BEGIN
  IF p_customer IS NULL OR p_stripe_customer_id IS NULL OR p_stripe_customer_id !~ '^cus_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  INSERT INTO public.stripe_customer_maps(customer_id, stripe_customer_id, livemode)
  VALUES (p_customer, p_stripe_customer_id, false)
  ON CONFLICT (customer_id) DO NOTHING;
  SELECT * INTO map FROM public.stripe_customer_maps WHERE customer_id = p_customer;
  RETURN jsonb_build_object('status','success','stripeCustomerId', map.stripe_customer_id);
END; $$;

CREATE FUNCTION public.payment_record_provider_refs_v1(p_operation uuid, p_object_id text, p_object_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op public.provider_operations;
BEGIN
  IF p_operation IS NULL OR p_object_id IS NULL OR length(p_object_id) < 3 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  UPDATE public.provider_operations
    SET provider_object_id = coalesce(provider_object_id, p_object_id),
        provider_object_type = coalesce(provider_object_type, p_object_type),
        status = CASE WHEN status = 'PENDING' THEN 'SUBMITTED' ELSE status END,
        submitted_at = coalesce(submitted_at, now())
    WHERE id = p_operation RETURNING * INTO op;
  IF op.id IS NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF p_object_type = 'checkout.session' THEN
    UPDATE public.payment_attempts SET stripe_checkout_session_id = coalesce(stripe_checkout_session_id, p_object_id), status = 'SUBMITTED', attempted_at = now()
      WHERE provider_operation_id = op.id;
  ELSIF p_object_type = 'payment_intent' THEN
    UPDATE public.payment_attempts SET stripe_payment_intent_id = coalesce(stripe_payment_intent_id, p_object_id), status = 'SUBMITTED', attempted_at = now()
      WHERE provider_operation_id = op.id;
  END IF;
  RETURN jsonb_build_object('status','success','id', op.id);
END; $$;

CREATE FUNCTION public.payment_collect_prepare_v1(p_obligation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ob public.payment_obligations; pm public.saved_payment_methods; op public.provider_operations; att public.payment_attempts; n integer;
BEGIN
  SELECT * INTO ob FROM public.payment_obligations WHERE id = p_obligation FOR UPDATE;
  IF ob.id IS NULL OR ob.state IN ('PAID','VOID') THEN RETURN jsonb_build_object('status','denied'); END IF;
  IF EXISTS (SELECT 1 FROM public.payment_receipts WHERE obligation_id = ob.id) THEN
    RETURN jsonb_build_object('status','denied','reason','already_paid');
  END IF;
  SELECT * INTO pm FROM public.saved_payment_methods WHERE service_order_id = ob.service_order_id AND status = 'USABLE';
  IF pm.id IS NULL THEN RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO op FROM public.provider_operations
    WHERE obligation_id = ob.id AND kind = 'CREATE_PAYMENT_INTENT' AND status IN ('PENDING','SUBMITTED')
    ORDER BY created_at ASC LIMIT 1;
  IF op.id IS NULL THEN
    INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, service_order_id, obligation_id, status)
    VALUES (extensions.gen_random_uuid(), 'CREATE_PAYMENT_INTENT', 'OFF_SESSION', ob.customer_id, ob.service_order_id, ob.id, 'PENDING')
    RETURNING * INTO op;
  END IF;
  SELECT * INTO att FROM public.payment_attempts WHERE provider_operation_id = op.id;
  IF att.id IS NULL THEN
    SELECT coalesce(max(attempt_number),0)+1 INTO n FROM public.payment_attempts WHERE obligation_id = ob.id;
    INSERT INTO public.payment_attempts(obligation_id, service_order_id, provider_operation_id, attempt_number, purpose, status, amount_minor, currency)
    VALUES (ob.id, ob.service_order_id, op.id, n, 'OFF_SESSION', 'CREATED', ob.amount_minor, ob.currency)
    RETURNING * INTO att;
  END IF;
  UPDATE public.payment_obligations SET state = 'COLLECTING' WHERE id = ob.id AND state <> 'PAID';
  RETURN jsonb_build_object(
    'status','success','idempotencyKey', op.idempotency_key, 'providerOperationId', op.id, 'attemptId', att.id,
    'amountMinor', ob.amount_minor, 'currency', ob.currency, 'stripeCustomerId', pm.stripe_customer_id,
    'paymentMethodId', pm.stripe_payment_method_id, 'serviceOrderId', ob.service_order_id, 'obligationId', ob.id,
    'customerId', ob.customer_id
  );
END; $$;

CREATE FUNCTION public.admin_audit_list_v1(p_token text, p_before bigint DEFAULT NULL, p_action text DEFAULT NULL, p_outcome text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF public.admin_session_v1(p_token) IS NULL THEN RETURN NULL; END IF;
  IF (p_before IS NOT NULL AND p_before < 1)
    OR (p_action IS NOT NULL AND p_action NOT IN (
      'SIGNED_IN','SIGNED_OUT','SIGNED_OUT_ALL','SESSION_REVOKED','RECORD_CREATED','RECORD_UPDATED','CONTACT_VERIFIED',
      'MEMBERSHIP_CHANGED','ENQUIRY_CREATED','ENQUIRY_TRIAGED','ENQUIRY_CONVERTED','CASE_CHANGED','EVIDENCE_CHANGED',
      'AUTHORIZATION_CHANGED','OPERATIONS_CHANGED','COMMUNICATION_CHANGED','CONVERSATION_CHANGED','COMMERCE_CHANGED','PAYMENT_CHANGED'
    ))
    OR (p_outcome IS NOT NULL AND p_outcome NOT IN ('success','denied','conflict','reauth_required'))
    THEN RAISE EXCEPTION 'Invalid activity filter'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id::text, 'createdAt', e.created_at, 'action', e.action, 'outcome', e.outcome, 'targetId', e.target_id, 'requestId', e.request_id, 'entity', e.entity, 'reason', e.reason, 'details', e.details) ORDER BY e.id DESC), '[]')
  INTO result
  FROM (SELECT * FROM public.admin_audit_events WHERE (p_before IS NULL OR id < p_before) AND (p_action IS NULL OR action = p_action) AND (p_outcome IS NULL OR outcome = p_outcome) ORDER BY id DESC LIMIT 51) e;
  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_payment_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_payment_list_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_payment_prepare_operation_v1(text, uuid, text, text, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_payment_record_provider_v1(text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_payment_apply_event_v1(text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_receive_stripe_event_v1(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_apply_provider_event_v1(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_payment_command_v1(text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_ensure_customer_map_v1(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_record_provider_refs_v1(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_collect_prepare_v1(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_case_command_v1(text, uuid, uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_audit_list_v1(text, bigint, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_payment_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payment_list_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payment_prepare_operation_v1(text, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payment_record_provider_v1(text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_payment_apply_event_v1(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_receive_stripe_event_v1(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_apply_provider_event_v1(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_payment_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_ensure_customer_map_v1(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_record_provider_refs_v1(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.payment_collect_prepare_v1(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION admin_private.success_fee_consent_text_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.payment_receipt_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.write_payment_ledger_v1(uuid, uuid, uuid, text, integer, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.create_upfront_obligation_v1(public.service_orders) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.guided_payment_ready_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.managed_setup_ready_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.published_pack_ready_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.case_stage_ready_v1(public.cases, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.prepare_payment_action_v1(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.qualifying_success_outcome_v1(public.cases) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.reject_payment_mutation_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_payment_obligation_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION admin_private.protect_payment_attempt_v1() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
