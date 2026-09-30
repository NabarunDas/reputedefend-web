-- Guard subscriptions and billing v1 (Step 16). Additive only.
-- SOURCE IMPLEMENTED / MIGRATION NOT APPLIED / STRIPE & GUARD LIVE DISABLED.
-- Do not apply from this PR. Do not create Stripe objects. Do not move money.
-- Do not enable GUARD_SUBSCRIPTIONS_ENABLED, GUARD_REFUNDS_ENABLED, or GUARD_ACTIVATION_ENABLED.
-- Do not modify already-applied migrations. Do not change Cron.

BEGIN;

-- ---------------------------------------------------------------------------
-- Job / provider / ledger extensions
-- ---------------------------------------------------------------------------

ALTER TABLE admin_private.job_outbox DROP CONSTRAINT job_outbox_topic_check;
ALTER TABLE admin_private.job_outbox ADD CONSTRAINT job_outbox_topic_check
  CHECK (topic IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING'));
ALTER TABLE admin_private.jobs DROP CONSTRAINT jobs_type_check;
ALTER TABLE admin_private.jobs ADD CONSTRAINT jobs_type_check
  CHECK (job_type IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING'));

CREATE OR REPLACE FUNCTION admin_private.enqueue_outbox_v1(
  p_event_key text, p_topic text, p_aggregate_type text, p_aggregate_id uuid, p_payload jsonb, p_available_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE created admin_private.job_outbox;
BEGIN
  IF p_event_key IS NULL OR length(btrim(p_event_key)) NOT BETWEEN 8 AND 200
    OR p_topic IS NULL OR p_topic NOT IN ('SYSTEM_HEALTH_PROBE','SEND_EMAIL','IMPORT_INBOUND_EMAIL','IMPORT_INBOUND_ATTACHMENT','COLLECT_PAYMENT','PROCESS_STRIPE_EVENT','RECONCILE_GUARD_BILLING')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid outbox event'; END IF;
  INSERT INTO admin_private.job_outbox(event_key, topic, aggregate_type, aggregate_id, payload, available_at)
  VALUES (btrim(p_event_key), p_topic, nullif(btrim(coalesce(p_aggregate_type, '')), ''), p_aggregate_id, p_payload, coalesce(p_available_at, now()))
  RETURNING * INTO created;
  RETURN created.id;
END; $$;

ALTER TABLE public.provider_operations DROP CONSTRAINT provider_operations_kind_check;
ALTER TABLE public.provider_operations ADD CONSTRAINT provider_operations_kind_check CHECK (kind IN (
  'CREATE_CUSTOMER','CREATE_CHECKOUT_SESSION','CREATE_SETUP_SESSION','CREATE_PAYMENT_INTENT','CREATE_RECOVERY_SESSION','CREATE_INVOICE','CANCEL_PAYMENT_INTENT',
  'CREATE_RECURRING_PRICE','CREATE_SUBSCRIPTION_CHECKOUT','CREATE_RECOVERY_CHECKOUT','CANCEL_SUBSCRIPTION_PERIOD_END','UNDO_SUBSCRIPTION_CANCELLATION',
  'CANCEL_SUBSCRIPTION_IMMEDIATE','CREATE_SUBSCRIPTION_SCHEDULE','UPDATE_SUBSCRIPTION_SCHEDULE','CREATE_REFUND'
));
ALTER TABLE public.provider_operations DROP CONSTRAINT provider_operations_purpose_check;
ALTER TABLE public.provider_operations ADD CONSTRAINT provider_operations_purpose_check CHECK (purpose IN (
  'UPFRONT','SETUP','OFF_SESSION','RECOVERY','INVOICE','CUSTOMER','GUARD_SUBSCRIPTION','GUARD_PRICE','GUARD_REFUND','GUARD_RECOVERY'
));
ALTER TABLE public.provider_operations ADD COLUMN IF NOT EXISTS guard_subscription_id uuid;

ALTER TABLE public.payment_ledger DROP CONSTRAINT payment_ledger_event_check;
ALTER TABLE public.payment_ledger ADD CONSTRAINT payment_ledger_event_check CHECK (event IN (
  'OBLIGATION_CREATED','COLLECTION_INITIATED','PROVIDER_PAYMENT_SUCCEEDED','PROVIDER_PAYMENT_FAILED',
  'AUTHENTICATION_REQUIRED','INVOICE_ISSUED','RECEIPT_RECORDED','OBLIGATION_VOIDED','SETUP_RECORDED','CONSENT_RECORDED',
  'GUARD_INVOICE_PAID','GUARD_RENEWAL_PAID','GUARD_RENEWAL_FAILED','GUARD_REFUND_SUBMITTED','GUARD_REFUND_SUCCEEDED',
  'GUARD_REFUND_FAILED','GUARD_CREDIT_APPROVED','GUARD_DISPUTE_OPENED','GUARD_DISPUTE_CLOSED','GUARD_CANCELLATION','GUARD_PRICE_CHANGE'
));

CREATE OR REPLACE FUNCTION admin_private.provider_operation_expected_object_type_v1(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_kind
    WHEN 'CREATE_CHECKOUT_SESSION' THEN 'checkout.session'
    WHEN 'CREATE_SETUP_SESSION' THEN 'checkout.session'
    WHEN 'CREATE_RECOVERY_SESSION' THEN 'checkout.session'
    WHEN 'CREATE_RECOVERY_CHECKOUT' THEN 'checkout.session'
    WHEN 'CREATE_SUBSCRIPTION_CHECKOUT' THEN 'checkout.session'
    WHEN 'CREATE_PAYMENT_INTENT' THEN 'payment_intent'
    WHEN 'CREATE_INVOICE' THEN 'invoice'
    WHEN 'CANCEL_PAYMENT_INTENT' THEN 'payment_intent'
    WHEN 'CREATE_CUSTOMER' THEN 'customer'
    WHEN 'CREATE_RECURRING_PRICE' THEN 'price'
    WHEN 'CANCEL_SUBSCRIPTION_PERIOD_END' THEN 'subscription'
    WHEN 'UNDO_SUBSCRIPTION_CANCELLATION' THEN 'subscription'
    WHEN 'CANCEL_SUBSCRIPTION_IMMEDIATE' THEN 'subscription'
    WHEN 'CREATE_SUBSCRIPTION_SCHEDULE' THEN 'subscription_schedule'
    WHEN 'UPDATE_SUBSCRIPTION_SCHEDULE' THEN 'subscription_schedule'
    WHEN 'CREATE_REFUND' THEN 'refund'
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- Coverage continuation origin (additive). Historical INCLUDED rows stay as written.
-- ---------------------------------------------------------------------------

ALTER TABLE public.guard_coverages
  ADD COLUMN source_included_coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT;
ALTER TABLE public.guard_coverages DROP CONSTRAINT guard_coverages_coverage_origin_check;
ALTER TABLE public.guard_coverages ADD CONSTRAINT guard_coverages_coverage_origin_check
  CHECK (coverage_origin IN ('DIRECT_GUARD','INCLUDED_RECOVERY','INCLUDED_CONTINUATION'));
ALTER TABLE public.guard_coverages DROP CONSTRAINT guard_coverages_basis_origin;
ALTER TABLE public.guard_coverages ADD CONSTRAINT guard_coverages_basis_origin CHECK (
  (coverage_basis = 'DIRECT_GUARD' AND coverage_origin = 'DIRECT_GUARD' AND service_order_id IS NOT NULL
    AND source_recovery_case_id IS NULL AND source_managed_order_id IS NULL AND source_included_coverage_id IS NULL)
  OR (coverage_basis = 'DIRECT_GUARD' AND coverage_origin = 'INCLUDED_CONTINUATION' AND service_order_id IS NOT NULL
    AND source_included_coverage_id IS NOT NULL AND source_recovery_case_id IS NULL AND source_managed_order_id IS NULL)
  OR (coverage_basis = 'INCLUDED' AND coverage_origin = 'INCLUDED_RECOVERY' AND service_order_id IS NULL
    AND source_recovery_case_id IS NOT NULL AND source_managed_order_id IS NOT NULL AND source_included_coverage_id IS NULL)
);

ALTER TABLE public.guard_coverage_events DROP CONSTRAINT guard_coverage_events_event_check;
ALTER TABLE public.guard_coverage_events ADD CONSTRAINT guard_coverage_events_event_check CHECK (event IN (
  'COVERAGE_CREATED','STATE_CHANGED','PERMISSION_RECORDED','PERMISSION_REVOKED',
  'BASELINE_RECORDED','ROTA_ASSIGNED','ACTIVATED','EXCEPTION_OPENED','EXCEPTION_ACKNOWLEDGED',
  'EXCEPTION_RESOLVED','BILLING_CHANGED','INCLUDED_ENDED','CONTINUATION_HANDED_OFF','PAUSED_FOR_ENTITLEMENT',
  'ENDED_FOR_CANCELLATION'
));

CREATE OR REPLACE FUNCTION admin_private.guard_state_transition_allowed_v1(p_old text, p_new text)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  pre text[] := ARRAY[
    'REQUESTED','AWAITING_AUTHORIZATION','VERIFYING_ACCESS','BASELINE_REQUIRED',
    'AWAITING_PAYMENT','READY_TO_ACTIVATE'
  ];
BEGIN
  IF p_old IS NOT DISTINCT FROM p_new THEN RETURN true; END IF;
  IF p_old = 'ENDED' THEN RETURN false; END IF;
  IF p_old = ANY(pre) AND p_new = ANY(pre) THEN RETURN true; END IF;
  IF p_old = ANY(pre) AND p_new = 'PAUSED' THEN RETURN true; END IF;
  IF p_new = 'ACTIVE' AND p_old = ANY(pre) THEN
    RETURN current_setting('admin_private.guard_activating', true) = '1';
  END IF;
  IF p_old = 'ACTIVE' AND p_new IN ('PAUSED','ENDING') THEN RETURN true; END IF;
  IF p_old = 'PAUSED' AND p_new IN ('ACTIVE','ENDING') THEN RETURN true; END IF;
  IF p_old = 'ENDING' AND p_new = 'ENDED' THEN RETURN true; END IF;
  RETURN false;
END; $$;

-- ---------------------------------------------------------------------------
-- New tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.guard_provider_price_maps (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  price_version_id uuid NOT NULL UNIQUE REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  service_code text NOT NULL CHECK (service_code = 'RELAUNCH_GUARD'),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  interval text NOT NULL CHECK (interval = 'month'),
  quantity integer NOT NULL CHECK (quantity = 1),
  livemode boolean NOT NULL DEFAULT false CHECK (livemode = false),
  stripe_product_id text NOT NULL CHECK (stripe_product_id ~ '^prod_[A-Za-z0-9]+$'),
  stripe_price_id text NOT NULL UNIQUE CHECK (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  provider_operation_id uuid NOT NULL UNIQUE REFERENCES public.provider_operations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE public.guard_continuations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  included_coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  paid_coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED','HANDED_OFF','FAILED','CANCELLED','EXPIRED')),
  scheduled_start_at timestamptz,
  handed_off_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guard_continuations_one_open_included_idx
  ON public.guard_continuations (included_coverage_id)
  WHERE status IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED');
CREATE UNIQUE INDEX guard_continuations_one_open_order_idx
  ON public.guard_continuations (service_order_id)
  WHERE status IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED','HANDED_OFF');

CREATE TABLE public.guard_subscriptions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  continuation_id uuid REFERENCES public.guard_continuations(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  price_version_id uuid NOT NULL REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  provider_price_map_id uuid REFERENCES public.guard_provider_price_maps(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity = 1),
  tax_behaviour text NOT NULL,
  tax_amount_minor integer NOT NULL DEFAULT 0 CHECK (tax_amount_minor >= 0),
  stripe_customer_id text CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_price_id text CHECK (stripe_price_id IS NULL OR stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  stripe_subscription_id text UNIQUE CHECK (stripe_subscription_id IS NULL OR stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_subscription_item_id text CHECK (stripe_subscription_item_id IS NULL OR stripe_subscription_item_id ~ '^si_[A-Za-z0-9]+$'),
  stripe_schedule_id text CHECK (stripe_schedule_id IS NULL OR stripe_schedule_id ~ '^sub_sched_[A-Za-z0-9]+$'),
  provider_status text NOT NULL DEFAULT 'none' CHECK (provider_status IN (
    'none','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'
  )),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN (
    'PENDING_CUSTOMER','PENDING_PROVIDER','INCOMPLETE','ACTIVE','PAST_DUE','CANCEL_AT_PERIOD_END','CANCELED','UNPAID','ENDED'
  )),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  cancellation_intent text CHECK (cancellation_intent IS NULL OR cancellation_intent IN ('CANCEL_AT_PERIOD_END','REQUEST_IMMEDIATE_CANCELLATION')),
  latest_paid_invoice_id text,
  latest_invoice_failure text NOT NULL DEFAULT '',
  livemode boolean NOT NULL DEFAULT false CHECK (livemode = false),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guard_subscriptions_scope CHECK (
    (coverage_id IS NOT NULL AND continuation_id IS NULL)
    OR (coverage_id IS NULL AND continuation_id IS NOT NULL)
    OR (coverage_id IS NOT NULL AND continuation_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX guard_subscriptions_one_open_location_idx
  ON public.guard_subscriptions (location_id)
  WHERE lifecycle_state NOT IN ('CANCELED','ENDED');
CREATE UNIQUE INDEX guard_subscriptions_one_open_coverage_idx
  ON public.guard_subscriptions (coverage_id)
  WHERE coverage_id IS NOT NULL AND lifecycle_state NOT IN ('CANCELED','ENDED');
CREATE UNIQUE INDEX guard_subscriptions_one_open_continuation_idx
  ON public.guard_subscriptions (continuation_id)
  WHERE continuation_id IS NOT NULL AND lifecycle_state NOT IN ('CANCELED','ENDED');
CREATE UNIQUE INDEX guard_subscriptions_one_open_order_idx
  ON public.guard_subscriptions (service_order_id)
  WHERE lifecycle_state NOT IN ('CANCELED','ENDED');

CREATE TABLE public.guard_subscription_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('ADMIN','CUSTOMER','SYSTEM','PROVIDER')),
  actor_id uuid,
  event text NOT NULL CHECK (event IN (
    'SUBSCRIPTION_REQUESTED','RECURRING_CONSENT_ACCEPTED','CHECKOUT_CREATED','SUBSCRIPTION_CORRELATED',
    'FIRST_INVOICE_PAID','RENEWAL_PAID','RENEWAL_FAILED','AUTHENTICATION_REQUIRED','CANCELLATION_REQUESTED',
    'CANCELLATION_SCHEDULED','CANCELLATION_REVERSED','SUBSCRIPTION_ENDED','PRICE_CHANGE_OFFERED',
    'PRICE_CHANGE_ACCEPTED','PRICE_CHANGE_DECLINED','PRICE_CHANGE_SCHEDULED','PRICE_CHANGE_APPLIED',
    'REFUND_REQUESTED','REFUND_SUBMITTED','REFUND_SUCCEEDED','REFUND_FAILED','DISPUTE_OPENED',
    'DISPUTE_UPDATED','DISPUTE_CLOSED','RECONCILIATION_MISMATCH','CONTINUATION_SCHEDULED','CONTINUATION_HANDED_OFF'
  )),
  previous_state text,
  new_state text,
  reason text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guard_subscription_events_subscription_idx ON public.guard_subscription_events (subscription_id, id DESC);

CREATE TABLE public.guard_recurring_consents (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE RESTRICT,
  coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  continuation_id uuid REFERENCES public.guard_continuations(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  price_version_id uuid NOT NULL REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  frequency text NOT NULL CHECK (frequency = 'MONTHLY'),
  tax_behaviour text NOT NULL,
  consent_version text NOT NULL CHECK (consent_version = 'GUARD_RECURRING_CONSENT_V1'),
  consent_text text NOT NULL CHECK (char_length(consent_text) BETWEEN 40 AND 5000),
  cancellation_terms_version text NOT NULL CHECK (cancellation_terms_version = 'GUARD_CANCELLATION_TERMS_V1'),
  cancellation_terms_text text NOT NULL CHECK (char_length(cancellation_terms_text) BETWEEN 20 AND 2000),
  customer_action_id uuid NOT NULL REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  accepted_by_auth_user_id uuid NOT NULL,
  accepted_email_snapshot text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX guard_recurring_consents_one_subscription_idx
  ON public.guard_recurring_consents (subscription_id);

CREATE TABLE public.guard_subscription_invoices (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  stripe_invoice_id text NOT NULL UNIQUE CHECK (stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  amount_paid_minor integer NOT NULL CHECK (amount_paid_minor >= 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  period_start timestamptz,
  period_end timestamptz,
  kind text NOT NULL CHECK (kind IN ('INITIAL','RENEWAL')),
  status text NOT NULL CHECK (status IN ('PAID','FAILED','ACTION_REQUIRED','FINALIZATION_FAILED')),
  livemode boolean NOT NULL DEFAULT false CHECK (livemode = false),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.guard_price_change_offers (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  old_price_version_id uuid NOT NULL REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  old_amount_minor integer NOT NULL CHECK (old_amount_minor > 0),
  new_price_version_id uuid NOT NULL REFERENCES public.price_versions(id) ON DELETE RESTRICT,
  new_amount_minor integer NOT NULL CHECK (new_amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  effective_renewal_at timestamptz,
  notice_version text NOT NULL CHECK (notice_version = 'GUARD_PRICE_CHANGE_NOTICE_V1'),
  notice_text text NOT NULL CHECK (char_length(notice_text) BETWEEN 20 AND 2000),
  status text NOT NULL CHECK (status IN ('OFFERED','ACCEPTED','DECLINED','EXPIRED','SCHEDULED','APPLIED','CANCELLED')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  scheduled_at timestamptz,
  applied_at timestamptz,
  customer_action_id uuid REFERENCES public.customer_actions(id) ON DELETE RESTRICT,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);
CREATE UNIQUE INDEX guard_price_change_one_open_subscription_idx
  ON public.guard_price_change_offers (subscription_id)
  WHERE status IN ('OFFERED','ACCEPTED','SCHEDULED');

CREATE TABLE public.guard_billing_adjustments (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.guard_subscription_invoices(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('REFUND','SERVICE_CREDIT')),
  status text NOT NULL CHECK (status IN ('REQUESTED','APPROVED','SUBMITTED','SUCCEEDED','FAILED','REJECTED','CANCELLED','PENDING_APPLICATION')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  period_start timestamptz,
  period_end timestamptz,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 2000),
  approved_amount_minor integer CHECK (approved_amount_minor IS NULL OR approved_amount_minor > 0),
  approved_by uuid,
  approved_at timestamptz,
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE public.guard_refunds (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  adjustment_id uuid NOT NULL UNIQUE REFERENCES public.guard_billing_adjustments(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.guard_subscription_invoices(id) ON DELETE RESTRICT,
  provider_operation_id uuid UNIQUE REFERENCES public.provider_operations(id) ON DELETE RESTRICT,
  stripe_refund_id text UNIQUE CHECK (stripe_refund_id IS NULL OR stripe_refund_id ~ '^re_[A-Za-z0-9]+$'),
  stripe_payment_intent_id text,
  stripe_charge_id text,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  status text NOT NULL CHECK (status IN ('REQUESTED','APPROVED','SUBMITTED','PENDING','SUCCEEDED','FAILED','CANCELED')),
  failure_code text NOT NULL DEFAULT '',
  failure_reason text NOT NULL DEFAULT '',
  livemode boolean NOT NULL DEFAULT false CHECK (livemode = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz
);

CREATE TABLE public.guard_disputes (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.guard_subscription_invoices(id) ON DELETE RESTRICT,
  stripe_dispute_id text NOT NULL UNIQUE CHECK (stripe_dispute_id ~ '^dp_[A-Za-z0-9]+$'),
  stripe_charge_id text,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'GBP'),
  provider_status text NOT NULL,
  outcome text NOT NULL DEFAULT '',
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  finance_work_status text NOT NULL DEFAULT 'OPEN' CHECK (finance_work_status IN ('OPEN','ACKNOWLEDGED','CLOSED')),
  livemode boolean NOT NULL DEFAULT false CHECK (livemode = false),
  record_version integer NOT NULL DEFAULT 1 CHECK (record_version >= 1)
);

CREATE TABLE public.guard_reminder_policies (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  version_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('DISABLED','ENABLED')),
  offsets_days integer[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guard_reminder_policies_offsets CHECK (
    status = 'DISABLED' OR cardinality(offsets_days) >= 1
  )
);

CREATE TABLE public.guard_reminder_records (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  coverage_id uuid NOT NULL REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES public.guard_reminder_policies(id) ON DELETE RESTRICT,
  offset_days integer NOT NULL CHECK (offset_days > 0),
  due_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('DUE','SHOWN','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coverage_id, policy_id, offset_days)
);

CREATE TABLE public.guard_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  service_date date NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('STARTED','COMPLETED','FAILED')),
  mismatch_count integer NOT NULL DEFAULT 0 CHECK (mismatch_count >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.guard_reconciliation_issues (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.guard_reconciliation_runs(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  coverage_id uuid REFERENCES public.guard_coverages(id) ON DELETE RESTRICT,
  code text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_private.guard_subscription_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.guard_reminder_policies(version_key, status, offsets_days)
VALUES ('GUARD_INCLUDED_REMINDER_UNCONFIGURED_V1', 'DISABLED', '{}');

ALTER TABLE public.customer_actions
  ADD COLUMN guard_subscription_id uuid REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT,
  ADD COLUMN guard_price_change_offer_id uuid REFERENCES public.guard_price_change_offers(id) ON DELETE RESTRICT,
  ADD COLUMN guard_continuation_id uuid REFERENCES public.guard_continuations(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_actions DROP CONSTRAINT customer_actions_kind_check;
ALTER TABLE public.customer_actions ADD CONSTRAINT customer_actions_kind_check CHECK (kind IN (
  'AGREEMENT_ACCEPTANCE','AUTHORIZATION_REVOCATION','CASE_ACCESS','COMMUNICATION_ACCESS','QUOTE_ACCEPTANCE',
  'GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT','GUARD_PERMISSION',
  'GUARD_SUBSCRIPTION_START','GUARD_PRICE_CHANGE_ACCEPTANCE'
));

ALTER TABLE public.customer_actions DROP CONSTRAINT customer_actions_guard_scope_check;
ALTER TABLE public.customer_actions ADD CONSTRAINT customer_actions_guard_scope_check CHECK (
  (kind = 'GUARD_PERMISSION' AND guard_coverage_id IS NOT NULL AND location_id IS NOT NULL AND case_id IS NULL
    AND service_order_id IS NULL AND payment_obligation_id IS NULL AND payment_invoice_id IS NULL
    AND quote_version_id IS NULL AND agreement_version_id IS NULL AND authorization_id IS NULL
    AND evidence_request_id IS NULL AND link_key_version IS NULL
    AND guard_subscription_id IS NULL AND guard_price_change_offer_id IS NULL AND guard_continuation_id IS NULL)
  OR (kind = 'GUARD_SUBSCRIPTION_START' AND location_id IS NOT NULL AND service_order_id IS NOT NULL
    AND case_id IS NULL AND payment_obligation_id IS NULL AND payment_invoice_id IS NULL
    AND quote_version_id IS NULL AND agreement_version_id IS NULL AND authorization_id IS NULL
    AND evidence_request_id IS NULL AND link_key_version IS NULL AND guard_price_change_offer_id IS NULL
    AND (guard_coverage_id IS NOT NULL OR guard_continuation_id IS NOT NULL))
  OR (kind = 'GUARD_PRICE_CHANGE_ACCEPTANCE' AND guard_subscription_id IS NOT NULL
    AND guard_price_change_offer_id IS NOT NULL AND location_id IS NOT NULL AND case_id IS NULL
    AND payment_obligation_id IS NULL AND payment_invoice_id IS NULL AND quote_version_id IS NULL
    AND agreement_version_id IS NULL AND authorization_id IS NULL AND evidence_request_id IS NULL
    AND link_key_version IS NULL AND guard_included_offer_id IS NULL)
  OR (kind NOT IN ('GUARD_PERMISSION','GUARD_SUBSCRIPTION_START','GUARD_PRICE_CHANGE_ACCEPTANCE')
    AND guard_coverage_id IS NULL AND guard_included_offer_id IS NULL
    AND guard_subscription_id IS NULL AND guard_price_change_offer_id IS NULL AND guard_continuation_id IS NULL)
);

CREATE UNIQUE INDEX customer_actions_one_open_guard_subscription_idx
  ON public.customer_actions (coalesce(guard_subscription_id, guard_coverage_id, guard_continuation_id))
  WHERE status = 'OPEN' AND kind = 'GUARD_SUBSCRIPTION_START';
CREATE UNIQUE INDEX customer_actions_one_open_guard_price_change_idx
  ON public.customer_actions (guard_price_change_offer_id)
  WHERE status = 'OPEN' AND kind = 'GUARD_PRICE_CHANGE_ACCEPTANCE';

ALTER TABLE public.provider_operations
  ADD CONSTRAINT provider_operations_guard_subscription_fk
  FOREIGN KEY (guard_subscription_id) REFERENCES public.guard_subscriptions(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.guard_provider_price_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_continuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_recurring_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_price_change_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_billing_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_reminder_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_reminder_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guard_reconciliation_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_private.guard_subscription_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guard_provider_price_maps, public.guard_continuations, public.guard_subscriptions,
  public.guard_subscription_events, public.guard_recurring_consents, public.guard_subscription_invoices,
  public.guard_price_change_offers, public.guard_billing_adjustments, public.guard_refunds, public.guard_disputes,
  public.guard_reminder_policies, public.guard_reminder_records, public.guard_reconciliation_runs,
  public.guard_reconciliation_issues, admin_private.guard_subscription_receipts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.guard_subscription_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.guard_reconciliation_issues_id_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION admin_private.protect_guard_reminder_policy_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.status = 'ENABLED' THEN
    IF NEW.offsets_days IS NULL OR cardinality(NEW.offsets_days) < 1 THEN
      RAISE EXCEPTION 'Enabled reminder policy requires configured offsets';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.offsets_days) AS offset_day WHERE offset_day IS NULL OR offset_day < 1 OR offset_day > 30) THEN
      RAISE EXCEPTION 'Reminder offsets must be between 1 and 30 days';
    END IF;
    IF (SELECT count(*) FROM unnest(NEW.offsets_days)) IS DISTINCT FROM (SELECT count(DISTINCT offset_day) FROM unnest(NEW.offsets_days) AS offset_day) THEN
      RAISE EXCEPTION 'Reminder offsets must be unique';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_reminder_policies_protect BEFORE INSERT OR UPDATE ON public.guard_reminder_policies
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_guard_reminder_policy_v1();

CREATE FUNCTION admin_private.reject_guard_subscription_event_change_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Guard subscription events are append-only'; END; $$;
CREATE TRIGGER guard_subscription_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.guard_subscription_events
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_guard_subscription_event_change_v1();

CREATE FUNCTION admin_private.reject_guard_consent_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Guard recurring consents are immutable'; END; $$;
CREATE TRIGGER guard_recurring_consents_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.guard_recurring_consents
FOR EACH STATEMENT EXECUTE FUNCTION admin_private.reject_guard_consent_mutation_v1();

CREATE FUNCTION admin_private.reject_guard_price_map_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Guard provider price maps are immutable'; END; $$;
CREATE TRIGGER guard_provider_price_maps_immutable BEFORE UPDATE OR DELETE ON public.guard_provider_price_maps
FOR EACH ROW EXECUTE FUNCTION admin_private.reject_guard_price_map_mutation_v1();

CREATE FUNCTION admin_private.protect_guard_subscription_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Guard subscriptions cannot be deleted'; END IF;
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.business_id IS DISTINCT FROM OLD.business_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.service_order_id IS DISTINCT FROM OLD.service_order_id
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
  THEN RAISE EXCEPTION 'Guard subscription commercial identity is immutable'; END IF;
  IF OLD.stripe_subscription_id IS NOT NULL AND NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'Stripe subscription identity is immutable';
  END IF;
  IF OLD.lifecycle_state IN ('CANCELED','ENDED') AND NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN
    RAISE EXCEPTION 'Canceled Guard subscriptions cannot be reactivated locally';
  END IF;
  NEW.updated_at := now();
  NEW.record_version := OLD.record_version + 1;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_subscriptions_protect BEFORE UPDATE OR DELETE ON public.guard_subscriptions
FOR EACH ROW EXECUTE FUNCTION admin_private.protect_guard_subscription_v1();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin_private.guard_recurring_consent_text_v1() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT 'I authorise monthly billing for Relaunch Guard for this exact location at the accepted monthly amount until cancelled under the agreed cancellation terms. This consent covers only this location and this accepted price. Opening a link or verifying a one-time code is not acceptance.';
$$;

CREATE FUNCTION admin_private.guard_cancellation_terms_text_v1() RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT 'Normal cancellation takes effect at the end of the already-paid period. Immediate cancellation is exceptional and does not promise a refund before finance review and provider confirmation.';
$$;

CREATE FUNCTION admin_private.guard_price_change_notice_text_v1(p_old integer, p_new integer) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT 'Your current accepted monthly Guard price stays in force until you positively accept this replacement. No response is not acceptance. If accepted, the new price applies at the next renewal without a mid-cycle increase or proration.';
$$;

CREATE FUNCTION admin_private.guard_subscription_append_v1(
  p_subscription uuid, p_actor_type text, p_actor uuid, p_event text,
  p_previous text, p_new text, p_reason text, p_details jsonb
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO public.guard_subscription_events(subscription_id, actor_type, actor_id, event, previous_state, new_state, reason, details)
  VALUES (p_subscription, p_actor_type, p_actor, p_event, p_previous, p_new, coalesce(p_reason, ''), coalesce(p_details, '{}'::jsonb));
END; $$;

CREATE FUNCTION admin_private.guard_subscription_receipt_v1(p_actor uuid, p_request uuid, p_fingerprint text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row admin_private.guard_subscription_receipts;
BEGIN
  SELECT * INTO row FROM admin_private.guard_subscription_receipts WHERE request_id = p_request;
  IF row.request_id IS NULL THEN RETURN NULL; END IF;
  IF row.actor_id IS DISTINCT FROM p_actor OR row.fingerprint IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'Guard subscription command receipt conflict';
  END IF;
  RETURN row.response;
END; $$;

CREATE FUNCTION admin_private.guard_non_billing_ready_v1(p_coverage uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE ready jsonb; blockers text[];
BEGIN
  ready := admin_private.guard_coverage_readiness_v1(p_coverage);
  blockers := ARRAY(SELECT jsonb_array_elements_text(coalesce(ready->'blockerCodes', '[]'::jsonb)));
  RETURN ready->>'status' IS DISTINCT FROM 'missing'
    AND NOT ('MAPPING_NOT_READY' = ANY (blockers))
    AND NOT ('MEMBERSHIP_UNVERIFIED' = ANY (blockers))
    AND NOT ('PERMISSION_INACTIVE' = ANY (blockers))
    AND NOT ('ACCESS_NOT_VERIFIED' = ANY (blockers))
    AND NOT ('CONTACT_NOT_CURRENT' = ANY (blockers))
    AND NOT ('BASELINE_NOT_VERIFIED' = ANY (blockers))
    AND NOT ('ROTA_NOT_ASSIGNED' = ANY (blockers))
    AND NOT ('COMMERCIAL_ORDER_MISSING' = ANY (blockers));
END; $$;

CREATE FUNCTION admin_private.guard_resume_ready_v1(p_coverage uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE ready jsonb; blockers text[];
BEGIN
  ready := admin_private.guard_coverage_readiness_v1(p_coverage);
  blockers := ARRAY(SELECT jsonb_array_elements_text(coalesce(ready->'blockerCodes', '[]'::jsonb)));
  RETURN NOT ('MAPPING_NOT_READY' = ANY (blockers))
    AND NOT ('MEMBERSHIP_UNVERIFIED' = ANY (blockers))
    AND NOT ('PERMISSION_INACTIVE' = ANY (blockers))
    AND NOT ('ACCESS_NOT_VERIFIED' = ANY (blockers))
    AND NOT ('CONTACT_NOT_CURRENT' = ANY (blockers))
    AND NOT ('BASELINE_NOT_VERIFIED' = ANY (blockers))
    AND NOT ('ROTA_NOT_ASSIGNED' = ANY (blockers))
    AND NOT ('COMMERCIAL_ORDER_MISSING' = ANY (blockers))
    AND (ready->>'billingReady')::boolean IS TRUE;
END; $$;

CREATE FUNCTION admin_private.guard_paid_through_v1(p_coverage uuid) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT paid_through_at FROM public.guard_billing WHERE coverage_id = p_coverage;
$$;

CREATE FUNCTION admin_private.guard_set_entitlement_checked_v1(
  p_coverage uuid, p_state text, p_paid_through timestamptz, p_source text
) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bill public.guard_billing;
BEGIN
  SELECT * INTO bill FROM public.guard_billing WHERE coverage_id = p_coverage FOR UPDATE;
  IF bill.id IS NULL THEN RAISE EXCEPTION 'Guard billing row missing'; END IF;
  IF p_state = 'CURRENT' AND (p_source IS DISTINCT FROM 'PROVIDER' OR p_paid_through IS NULL OR p_paid_through <= now()) THEN
    RAISE EXCEPTION 'CURRENT Guard billing requires a still-valid provider entitlement';
  END IF;
  IF p_state = 'CURRENT' AND bill.paid_through_at IS NOT NULL AND p_paid_through IS NOT NULL AND p_paid_through < bill.paid_through_at THEN
    p_paid_through := bill.paid_through_at;
  END IF;
  UPDATE public.guard_billing
    SET billing_state = p_state, entitlement_source = p_source, paid_through_at = p_paid_through, record_version = record_version + 1, updated_at = now()
    WHERE coverage_id = p_coverage;
END; $$;

CREATE FUNCTION admin_private.guard_transition_coverage_v1(
  p_coverage uuid, p_new text, p_actor_type text, p_actor uuid, p_event text, p_reason text
) RETURNS public.guard_coverages LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cov public.guard_coverages; previous text;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = p_coverage FOR UPDATE;
  IF cov.id IS NULL THEN RAISE EXCEPTION 'Guard coverage missing'; END IF;
  IF cov.state IS NOT DISTINCT FROM p_new THEN RETURN cov; END IF;
  IF NOT admin_private.guard_state_transition_allowed_v1(cov.state, p_new) THEN
    RAISE EXCEPTION 'Guard coverage transition denied';
  END IF;
  previous := cov.state;
  UPDATE public.guard_coverages SET
    state = p_new,
    paused_at = CASE WHEN p_new = 'PAUSED' THEN coalesce(paused_at, now()) ELSE paused_at END,
    ending_at = CASE WHEN p_new = 'ENDING' THEN coalesce(ending_at, now()) ELSE ending_at END,
    ended_at = CASE WHEN p_new = 'ENDED' THEN coalesce(ended_at, now()) ELSE ended_at END
    WHERE id = cov.id RETURNING * INTO cov;
  PERFORM admin_private.guard_append_event_v1(cov.id, p_actor_type, p_actor, p_event, previous, p_new, p_reason, '{}'::jsonb);
  RETURN cov;
END; $$;

CREATE FUNCTION admin_private.guard_refundable_minor_v1(p_invoice uuid) RETURNS integer
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE inv public.guard_subscription_invoices; refunded integer;
BEGIN
  SELECT * INTO inv FROM public.guard_subscription_invoices WHERE id = p_invoice;
  IF inv.id IS NULL OR inv.status <> 'PAID' THEN RETURN 0; END IF;
  SELECT coalesce(sum(r.amount_minor), 0) INTO refunded
    FROM public.guard_refunds r
    WHERE r.invoice_id = inv.id AND r.status IN ('SUBMITTED','PENDING','SUCCEEDED');
  RETURN greatest(inv.amount_paid_minor - refunded, 0);
END; $$;

CREATE FUNCTION admin_private.guard_unresolved_dispute_v1(p_subscription uuid, p_invoice uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guard_disputes d
    WHERE d.subscription_id = p_subscription
      AND (p_invoice IS NULL OR d.invoice_id IS NOT DISTINCT FROM p_invoice)
      AND d.resolved_at IS NULL
  );
$$;

CREATE FUNCTION admin_private.guard_overlapping_credit_v1(p_subscription uuid, p_start timestamptz, p_end timestamptz) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guard_billing_adjustments a
    WHERE a.subscription_id = p_subscription
      AND a.kind = 'SERVICE_CREDIT'
      AND a.status IN ('APPROVED','PENDING_APPLICATION','SUCCEEDED')
      AND a.period_start IS NOT DISTINCT FROM p_start
      AND a.period_end IS NOT DISTINCT FROM p_end
  );
$$;

-- ---------------------------------------------------------------------------
-- Customer-action validation extensions
-- ---------------------------------------------------------------------------

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
    OR NEW.payment_invoice_id IS DISTINCT FROM OLD.payment_invoice_id
    OR NEW.guard_coverage_id IS DISTINCT FROM OLD.guard_coverage_id
    OR NEW.guard_included_offer_id IS DISTINCT FROM OLD.guard_included_offer_id
    OR NEW.guard_subscription_id IS DISTINCT FROM OLD.guard_subscription_id
    OR NEW.guard_price_change_offer_id IS DISTINCT FROM OLD.guard_price_change_offer_id
    OR NEW.guard_continuation_id IS DISTINCT FROM OLD.guard_continuation_id
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
DECLARE
  v public.agreement_versions; auth public.authorization_records; c public.customers; cs public.cases;
  req public.evidence_requests; qv public.quote_versions; ord public.service_orders; ob public.payment_obligations;
  cov public.guard_coverages; off public.guard_included_offers;
  sub public.guard_subscriptions; offer public.guard_price_change_offers; cont public.guard_continuations;
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
  ELSIF NEW.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT') THEN
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
    ELSIF NEW.kind = 'INVOICE_PAYMENT' THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = NEW.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.customer_id IS DISTINCT FROM NEW.customer_id
      THEN RAISE EXCEPTION 'Invoice payment actions require the same obligation'; END IF;
      IF NEW.payment_invoice_id IS NULL THEN RAISE EXCEPTION 'Invoice payment actions require an invoice'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.payment_invoices i
        WHERE i.id = NEW.payment_invoice_id AND i.obligation_id = ob.id AND i.service_order_id = ord.id
          AND i.customer_id = NEW.customer_id
      ) THEN RAISE EXCEPTION 'Invoice payment actions must pin the obligation invoice'; END IF;
    END IF;
  ELSIF NEW.kind = 'GUARD_PERMISSION' THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = NEW.guard_coverage_id;
    IF cov.id IS NULL OR cov.customer_id IS DISTINCT FROM NEW.customer_id OR cov.business_id IS DISTINCT FROM NEW.business_id
      OR cov.location_id IS DISTINCT FROM NEW.location_id OR cov.state IN ('ENDED')
    THEN RAISE EXCEPTION 'Customer action does not match the referenced Guard coverage'; END IF;
    IF NEW.guard_included_offer_id IS NOT NULL THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = NEW.guard_included_offer_id;
      IF off.id IS NULL OR off.coverage_id IS DISTINCT FROM cov.id OR off.customer_id IS DISTINCT FROM NEW.customer_id
        OR off.location_id IS DISTINCT FROM NEW.location_id
      THEN RAISE EXCEPTION 'Customer action does not match the referenced included Guard offer'; END IF;
    ELSIF cov.coverage_basis = 'INCLUDED' THEN
      RAISE EXCEPTION 'Included Guard permission actions require the included offer';
    END IF;
  ELSIF NEW.kind = 'GUARD_SUBSCRIPTION_START' THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = NEW.service_order_id;
    IF ord.id IS NULL OR ord.service_code <> 'RELAUNCH_GUARD' OR ord.payment_model <> 'RECURRING_MONTHLY'
      OR ord.state <> 'ACCEPTED_RECURRING' OR ord.customer_id IS DISTINCT FROM NEW.customer_id
      OR ord.business_id IS DISTINCT FROM NEW.business_id OR ord.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Guard subscription start requires the accepted Guard order for this location'; END IF;
    IF NEW.guard_coverage_id IS NOT NULL THEN
      SELECT * INTO cov FROM public.guard_coverages WHERE id = NEW.guard_coverage_id;
      IF cov.id IS NULL OR cov.customer_id IS DISTINCT FROM NEW.customer_id OR cov.location_id IS DISTINCT FROM NEW.location_id
        OR cov.coverage_basis <> 'DIRECT_GUARD' OR cov.service_order_id IS DISTINCT FROM ord.id
      THEN RAISE EXCEPTION 'Guard subscription start does not match the Direct coverage'; END IF;
    END IF;
    IF NEW.guard_continuation_id IS NOT NULL THEN
      SELECT * INTO cont FROM public.guard_continuations WHERE id = NEW.guard_continuation_id;
      IF cont.id IS NULL OR cont.customer_id IS DISTINCT FROM NEW.customer_id OR cont.location_id IS DISTINCT FROM NEW.location_id
        OR cont.service_order_id IS DISTINCT FROM ord.id
      THEN RAISE EXCEPTION 'Guard subscription start does not match the continuation'; END IF;
    END IF;
  ELSIF NEW.kind = 'GUARD_PRICE_CHANGE_ACCEPTANCE' THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NEW.guard_subscription_id;
    SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = NEW.guard_price_change_offer_id;
    IF sub.id IS NULL OR offer.id IS NULL OR offer.subscription_id IS DISTINCT FROM sub.id
      OR sub.customer_id IS DISTINCT FROM NEW.customer_id OR sub.location_id IS DISTINCT FROM NEW.location_id
    THEN RAISE EXCEPTION 'Price-change acceptance does not match the subscription'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION admin_private.customer_action_eligible_v1(p_action public.customer_actions)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  c public.customers; b public.businesses; loc public.locations; cs public.cases;
  qv public.quote_versions; q public.quotes; ord public.service_orders; ob public.payment_obligations;
  cov public.guard_coverages; off public.guard_included_offers; sub public.guard_subscriptions;
  offer public.guard_price_change_offers; cont public.guard_continuations;
BEGIN
  IF p_action.id IS NULL OR p_action.status <> 'OPEN' THEN RETURN false; END IF;
  IF p_action.expires_at IS NOT NULL AND p_action.expires_at <= now() THEN RETURN false; END IF;
  IF p_action.revoked_at IS NOT NULL THEN RETURN false; END IF;
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
  IF p_action.kind IN ('GUIDED_PAYMENT','MANAGED_PAYMENT_SETUP','PAYMENT_RECOVERY','INVOICE_PAYMENT') THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.customer_id IS DISTINCT FROM p_action.customer_id THEN RETURN false; END IF;
    IF p_action.payment_obligation_id IS NOT NULL THEN
      SELECT * INTO ob FROM public.payment_obligations WHERE id = p_action.payment_obligation_id;
      IF ob.id IS NULL OR ob.service_order_id IS DISTINCT FROM ord.id OR ob.state = 'VOID' THEN RETURN false; END IF;
    END IF;
    IF p_action.kind = 'INVOICE_PAYMENT' THEN
      IF p_action.payment_invoice_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.payment_invoices i
        WHERE i.id = p_action.payment_invoice_id AND i.obligation_id = p_action.payment_obligation_id
          AND i.status IN ('ISSUED','PAID')
      ) THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_PERMISSION' THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id;
    IF cov.id IS NULL OR cov.state IN ('ENDED') THEN RETURN false; END IF;
    IF cov.customer_id IS DISTINCT FROM p_action.customer_id OR cov.business_id IS DISTINCT FROM p_action.business_id
      OR cov.location_id IS DISTINCT FROM p_action.location_id THEN RETURN false; END IF;
    IF NOT admin_private.guard_location_authorized_v1(cov.customer_id, cov.business_id, cov.location_id) THEN
      RETURN false;
    END IF;
    IF cov.coverage_basis = 'INCLUDED' THEN
      SELECT * INTO off FROM public.guard_included_offers WHERE id = p_action.guard_included_offer_id;
      IF off.id IS NULL OR off.status NOT IN ('ELIGIBLE','OFFERED') OR off.coverage_id IS DISTINCT FROM cov.id THEN
        RETURN false;
      END IF;
      IF NOT admin_private.included_guard_eligible_v1(
        cov.customer_id, cov.business_id, cov.location_id, cov.source_recovery_case_id, cov.source_managed_order_id
      ) THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_SUBSCRIPTION_START' THEN
    SELECT * INTO ord FROM public.service_orders WHERE id = p_action.service_order_id;
    IF ord.id IS NULL OR ord.state <> 'ACCEPTED_RECURRING' THEN RETURN false; END IF;
    IF NOT admin_private.guard_location_authorized_v1(p_action.customer_id, p_action.business_id, p_action.location_id) THEN
      RETURN false;
    END IF;
    IF p_action.guard_coverage_id IS NOT NULL THEN
      SELECT * INTO cov FROM public.guard_coverages WHERE id = p_action.guard_coverage_id;
      IF cov.id IS NULL OR cov.state = 'ENDED' OR cov.coverage_basis <> 'DIRECT_GUARD' THEN RETURN false; END IF;
    END IF;
    IF p_action.guard_continuation_id IS NOT NULL THEN
      SELECT * INTO cont FROM public.guard_continuations WHERE id = p_action.guard_continuation_id;
      IF cont.id IS NULL OR cont.status NOT IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED') THEN RETURN false; END IF;
    END IF;
  END IF;
  IF p_action.kind = 'GUARD_PRICE_CHANGE_ACCEPTANCE' THEN
    SELECT * INTO sub FROM public.guard_subscriptions WHERE id = p_action.guard_subscription_id;
    SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = p_action.guard_price_change_offer_id;
    IF sub.id IS NULL OR offer.id IS NULL OR offer.status <> 'OFFERED' THEN RETURN false; END IF;
    IF sub.customer_id IS DISTINCT FROM p_action.customer_id OR sub.location_id IS DISTINCT FROM p_action.location_id THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END; $$;

-- ---------------------------------------------------------------------------
-- Admin command internals
-- ---------------------------------------------------------------------------

CREATE FUNCTION admin_private.guard_create_subscription_row_v1(
  p_customer uuid, p_business uuid, p_location uuid, p_coverage uuid, p_continuation uuid,
  p_order uuid, p_actor uuid
) RETURNS public.guard_subscriptions LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  ord public.service_orders; qv public.quote_versions; sub public.guard_subscriptions; map public.guard_provider_price_maps;
BEGIN
  SELECT * INTO ord FROM public.service_orders WHERE id = p_order;
  IF ord.id IS NULL OR ord.service_code <> 'RELAUNCH_GUARD' OR ord.state <> 'ACCEPTED_RECURRING'
    OR ord.customer_id IS DISTINCT FROM p_customer OR ord.business_id IS DISTINCT FROM p_business
    OR ord.location_id IS DISTINCT FROM p_location
  THEN RAISE EXCEPTION 'Guard subscription requires the accepted location order'; END IF;
  SELECT * INTO qv FROM public.quote_versions WHERE id = ord.quote_version_id;
  SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = qv.price_version_id;
  INSERT INTO public.guard_subscriptions(
    customer_id, business_id, location_id, coverage_id, continuation_id, service_order_id, price_version_id,
    provider_price_map_id, amount_minor, currency, tax_behaviour, tax_amount_minor, stripe_price_id, lifecycle_state
  ) VALUES (
    p_customer, p_business, p_location, p_coverage, p_continuation, p_order, qv.price_version_id,
    map.id, ord.amount_minor, 'GBP', ord.tax_behaviour, coalesce(ord.tax_amount_minor, 0), map.stripe_price_id, 'PENDING_CUSTOMER'
  ) RETURNING * INTO sub;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'SUBSCRIPTION_REQUESTED', NULL, sub.lifecycle_state,
    'Subscription start requested', jsonb_build_object('serviceOrderId', p_order, 'coverageId', p_coverage, 'continuationId', p_continuation));
  RETURN sub;
END; $$;

CREATE FUNCTION admin_private.guard_issue_subscription_start_v1(p_actor uuid, p_request uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; ord public.service_orders; sub public.guard_subscriptions;
  cont public.guard_continuations; a public.customer_actions; expires timestamptz; hash text;
BEGIN
  expires := NULLIF(p_payload->>'expiresAt','')::timestamptz;
  hash := NULLIF(p_payload->>'secretHash','');
  IF expires IS NULL OR expires <= now() OR hash IS NULL OR hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF NULLIF(p_payload->>'coverageId','') IS NOT NULL THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = (p_payload->>'coverageId')::uuid FOR UPDATE;
    IF cov.id IS NULL OR cov.coverage_basis <> 'DIRECT_GUARD' OR cov.state = 'ENDED' THEN
      RETURN jsonb_build_object('status','denied');
    END IF;
    SELECT * INTO ord FROM public.service_orders WHERE id = cov.service_order_id;
    SELECT * INTO sub FROM public.guard_subscriptions
      WHERE coverage_id = cov.id AND lifecycle_state NOT IN ('CANCELED','ENDED') FOR UPDATE;
    IF sub.id IS NULL THEN
      sub := admin_private.guard_create_subscription_row_v1(cov.customer_id, cov.business_id, cov.location_id, cov.id, NULL, ord.id, p_actor);
    END IF;
  ELSIF NULLIF(p_payload->>'continuationId','') IS NOT NULL THEN
    SELECT * INTO cont FROM public.guard_continuations WHERE id = (p_payload->>'continuationId')::uuid FOR UPDATE;
    IF cont.id IS NULL OR cont.status NOT IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED') THEN
      RETURN jsonb_build_object('status','denied');
    END IF;
    SELECT * INTO ord FROM public.service_orders WHERE id = cont.service_order_id;
    SELECT * INTO sub FROM public.guard_subscriptions
      WHERE continuation_id = cont.id AND lifecycle_state NOT IN ('CANCELED','ENDED') FOR UPDATE;
    IF sub.id IS NULL THEN
      sub := admin_private.guard_create_subscription_row_v1(cont.customer_id, cont.business_id, cont.location_id, NULL, cont.id, ord.id, p_actor);
    END IF;
  ELSE
    RETURN jsonb_build_object('status','invalid');
  END IF;
  UPDATE public.customer_actions SET status = 'REVOKED', revoked_at = now()
    WHERE kind = 'GUARD_SUBSCRIPTION_START' AND status = 'OPEN'
      AND (
        guard_subscription_id = sub.id
        OR (sub.coverage_id IS NOT NULL AND guard_coverage_id = sub.coverage_id)
        OR (sub.continuation_id IS NOT NULL AND guard_continuation_id = sub.continuation_id)
      );
  INSERT INTO public.customer_actions(
    kind, status, customer_id, business_id, location_id, service_order_id, guard_coverage_id,
    guard_continuation_id, guard_subscription_id, secret_hash, expected_email_snapshot, expires_at, created_by
  ) SELECT
    'GUARD_SUBSCRIPTION_START', 'OPEN', sub.customer_id, sub.business_id, sub.location_id, sub.service_order_id,
    sub.coverage_id, sub.continuation_id, sub.id, hash, c.email, expires, p_actor
    FROM public.customers c WHERE c.id = sub.customer_id
  RETURNING * INTO a;
  INSERT INTO public.customer_action_events(action_id, case_id, actor_type, actor_id, event, details)
  VALUES (a.id, NULL, 'ADMIN', p_actor, 'ACTION_CREATED', jsonb_build_object('kind','GUARD_SUBSCRIPTION_START','subscriptionId', sub.id));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', sub.id, p_request, 'guard_subscription',
    'Issued Guard subscription-start action', jsonb_build_object('actionId', a.id));
  RETURN jsonb_build_object('status','success','id', a.id, 'subscriptionId', sub.id, 'expiresAt', a.expires_at, 'version', sub.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_create_continuation_v1(p_actor uuid, p_request uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cov public.guard_coverages; ord public.service_orders; cont public.guard_continuations;
BEGIN
  SELECT * INTO cov FROM public.guard_coverages WHERE id = NULLIF(p_payload->>'coverageId','')::uuid FOR UPDATE;
  SELECT * INTO ord FROM public.service_orders WHERE id = NULLIF(p_payload->>'serviceOrderId','')::uuid;
  IF cov.id IS NULL OR cov.coverage_basis <> 'INCLUDED' OR cov.state IN ('ENDING','ENDED') THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF ord.id IS NULL OR ord.service_code <> 'RELAUNCH_GUARD' OR ord.state <> 'ACCEPTED_RECURRING'
    OR ord.customer_id IS DISTINCT FROM cov.customer_id OR ord.location_id IS DISTINCT FROM cov.location_id
  THEN RETURN jsonb_build_object('status','denied'); END IF;
  SELECT * INTO cont FROM public.guard_continuations
    WHERE included_coverage_id = cov.id AND status IN ('PENDING_CONSENT','PENDING_CHECKOUT','SCHEDULED') FOR UPDATE;
  IF cont.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', cont.id, 'version', cont.record_version, 'replay', true);
  END IF;
  INSERT INTO public.guard_continuations(
    customer_id, business_id, location_id, included_coverage_id, service_order_id, status, scheduled_start_at
  ) VALUES (
    cov.customer_id, cov.business_id, cov.location_id, cov.id, ord.id, 'PENDING_CONSENT', cov.included_end_at
  ) RETURNING * INTO cont;
  PERFORM admin_private.guard_append_event_v1(cov.id, 'ADMIN', p_actor, 'STATE_CHANGED', cov.state, cov.state,
    'Included-to-paid continuation recorded', jsonb_build_object('continuationId', cont.id, 'serviceOrderId', ord.id));
  PERFORM admin_private.write_record_audit_v1(p_actor, 'GUARD_CHANGED', 'success', cont.id, p_request, 'guard_continuation',
    'Recorded included-to-paid continuation', jsonb_build_object('coverageId', cov.id));
  RETURN jsonb_build_object('status','success','id', cont.id, 'version', cont.record_version);
END; $$;

CREATE FUNCTION admin_private.guard_issue_price_change_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  sub public.guard_subscriptions; price public.price_versions; offer public.guard_price_change_offers;
  a public.customer_actions; expires timestamptz; hash text;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(p_payload->>'priceVersionId','')::uuid;
  expires := NULLIF(p_payload->>'expiresAt','')::timestamptz;
  hash := NULLIF(p_payload->>'secretHash','');
  IF sub.id IS NULL OR price.id IS NULL OR price.service_code <> 'RELAUNCH_GUARD' OR price.status <> 'APPROVED'
    OR expires IS NULL OR hash IS NULL OR hash !~ '^[a-f0-9]{64}$'
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_payload->>'version' IS NOT NULL AND (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.guard_price_change_offers o
    WHERE o.subscription_id = sub.id AND o.status IN ('OFFERED','ACCEPTED','SCHEDULED')
  ) THEN RETURN jsonb_build_object('status','denied','reason','offer_open'); END IF;
  INSERT INTO public.guard_price_change_offers(
    subscription_id, location_id, old_price_version_id, old_amount_minor, new_price_version_id, new_amount_minor,
    currency, effective_renewal_at, notice_version, notice_text, status
  ) VALUES (
    sub.id, sub.location_id, sub.price_version_id, sub.amount_minor, price.id, price.amount_minor,
    'GBP', sub.current_period_end, 'GUARD_PRICE_CHANGE_NOTICE_V1',
    admin_private.guard_price_change_notice_text_v1(sub.amount_minor, price.amount_minor), 'OFFERED'
  ) RETURNING * INTO offer;
  INSERT INTO public.customer_actions(
    kind, status, customer_id, business_id, location_id, guard_subscription_id, guard_price_change_offer_id,
    secret_hash, expected_email_snapshot, expires_at, created_by
  ) SELECT
    'GUARD_PRICE_CHANGE_ACCEPTANCE', 'OPEN', sub.customer_id, sub.business_id, sub.location_id, sub.id, offer.id,
    hash, c.email, expires, p_actor
    FROM public.customers c WHERE c.id = sub.customer_id
  RETURNING * INTO a;
  UPDATE public.guard_price_change_offers SET customer_action_id = a.id WHERE id = offer.id;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'PRICE_CHANGE_OFFERED', sub.lifecycle_state, sub.lifecycle_state,
    'Price-change offer issued', jsonb_build_object('offerId', offer.id, 'newPriceVersionId', price.id));
  RETURN jsonb_build_object('status','success','id', a.id, 'offerId', offer.id, 'expiresAt', a.expires_at);
END; $$;

CREATE FUNCTION admin_private.guard_schedule_cancellation_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sub public.guard_subscriptions; op public.provider_operations;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  IF sub.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF sub.lifecycle_state IN ('CANCELED','ENDED') THEN RETURN jsonb_build_object('status','denied','reason','already_ended'); END IF;
  IF sub.stripe_subscription_id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','no_provider'); END IF;
  UPDATE public.guard_subscriptions SET
    cancellation_intent = 'CANCEL_AT_PERIOD_END', cancel_at_period_end = true,
    cancel_at = coalesce(current_period_end, cancel_at)
    WHERE id = sub.id RETURNING * INTO sub;
  INSERT INTO public.provider_operations(
    idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
  ) VALUES (
    p_request, 'CANCEL_SUBSCRIPTION_PERIOD_END', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
  ) RETURNING * INTO op;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'CANCELLATION_REQUESTED', NULL, sub.lifecycle_state,
    coalesce(p_payload->>'reason','Period-end cancellation requested'), jsonb_build_object('providerOperationId', op.id));
  PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'GUARD_CANCELLATION', NULL, 'GBP',
    sub.stripe_subscription_id, 'ADMIN', p_actor, 'CANCEL_AT_PERIOD_END');
  RETURN jsonb_build_object(
    'status','success','id', sub.id, 'version', sub.record_version, 'providerOperationId', op.id,
    'idempotencyKey', op.idempotency_key, 'stripeSubscriptionId', sub.stripe_subscription_id
  );
END; $$;

CREATE FUNCTION admin_private.guard_undo_cancellation_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE sub public.guard_subscriptions; op public.provider_operations;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  IF sub.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF sub.lifecycle_state IN ('CANCELED','ENDED') THEN RETURN jsonb_build_object('status','denied','reason','already_ended'); END IF;
  IF sub.cancel_at_period_end IS NOT TRUE THEN RETURN jsonb_build_object('status','denied','reason','not_scheduled'); END IF;
  UPDATE public.guard_subscriptions SET
    cancellation_intent = NULL, cancel_at_period_end = false, cancel_at = NULL,
    lifecycle_state = CASE WHEN lifecycle_state = 'CANCEL_AT_PERIOD_END' THEN 'ACTIVE' ELSE lifecycle_state END
    WHERE id = sub.id RETURNING * INTO sub;
  INSERT INTO public.provider_operations(
    idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
  ) VALUES (
    p_request, 'UNDO_SUBSCRIPTION_CANCELLATION', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
  ) RETURNING * INTO op;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'CANCELLATION_REVERSED', 'CANCEL_AT_PERIOD_END', sub.lifecycle_state,
    'Scheduled cancellation reversed', jsonb_build_object('providerOperationId', op.id));
  RETURN jsonb_build_object(
    'status','success','id', sub.id, 'version', sub.record_version, 'providerOperationId', op.id,
    'idempotencyKey', op.idempotency_key, 'stripeSubscriptionId', sub.stripe_subscription_id
  );
END; $$;

CREATE FUNCTION admin_private.guard_request_immediate_cancellation_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  sub public.guard_subscriptions; inv public.guard_subscription_invoices; adj public.guard_billing_adjustments;
  refundable integer;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  IF sub.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (p_payload->>'version')::integer IS DISTINCT FROM sub.record_version THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF length(btrim(coalesce(p_payload->>'reason',''))) < 10 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO inv FROM public.guard_subscription_invoices
    WHERE subscription_id = sub.id AND status = 'PAID' ORDER BY created_at DESC LIMIT 1;
  refundable := CASE WHEN inv.id IS NULL THEN 0 ELSE admin_private.guard_refundable_minor_v1(inv.id) END;
  UPDATE public.guard_subscriptions SET cancellation_intent = 'REQUEST_IMMEDIATE_CANCELLATION' WHERE id = sub.id RETURNING * INTO sub;
  INSERT INTO public.guard_billing_adjustments(
    subscription_id, location_id, invoice_id, kind, status, amount_minor, currency, period_start, period_end, reason, created_by
  ) VALUES (
    sub.id, sub.location_id, inv.id, 'REFUND', 'REQUESTED', greatest(refundable, 1), 'GBP',
    sub.current_period_start, sub.current_period_end, btrim(p_payload->>'reason'), p_actor
  ) RETURNING * INTO adj;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'CANCELLATION_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Immediate cancellation review requested', jsonb_build_object('adjustmentId', adj.id, 'refundableMinor', refundable));
  RETURN jsonb_build_object(
    'status','success','id', sub.id, 'adjustmentId', adj.id, 'refundableMinor', refundable,
    'latestInvoiceId', inv.id, 'version', sub.record_version
  );
END; $$;

CREATE FUNCTION admin_private.guard_approve_refund_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  adj public.guard_billing_adjustments; sub public.guard_subscriptions; inv public.guard_subscription_invoices;
  refund public.guard_refunds; op public.provider_operations; amount integer; refundable integer;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO adj FROM public.guard_billing_adjustments WHERE id = NULLIF(p_payload->>'adjustmentId','')::uuid FOR UPDATE;
  IF adj.id IS NULL OR adj.kind <> 'REFUND' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = adj.subscription_id FOR UPDATE;
  SELECT * INTO inv FROM public.guard_subscription_invoices WHERE id = adj.invoice_id FOR UPDATE;
  amount := NULLIF(p_payload->>'amountMinor','')::integer;
  IF amount IS NULL OR amount <= 0 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  refundable := admin_private.guard_refundable_minor_v1(inv.id);
  IF amount > refundable THEN RETURN jsonb_build_object('status','denied','reason','exceeds_refundable'); END IF;
  IF admin_private.guard_unresolved_dispute_v1(sub.id, inv.id) THEN
    RETURN jsonb_build_object('status','denied','reason','unresolved_dispute');
  END IF;
  IF admin_private.guard_overlapping_credit_v1(sub.id, adj.period_start, adj.period_end) THEN
    RETURN jsonb_build_object('status','denied','reason','overlapping_credit');
  END IF;
  SELECT * INTO refund FROM public.guard_refunds WHERE adjustment_id = adj.id FOR UPDATE;
  IF refund.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', refund.id, 'providerOperationId', refund.provider_operation_id, 'replay', true);
  END IF;
  INSERT INTO public.provider_operations(
    idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
  ) VALUES (
    p_request, 'CREATE_REFUND', 'GUARD_REFUND', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
  ) RETURNING * INTO op;
  UPDATE public.guard_billing_adjustments SET
    status = 'APPROVED', approved_amount_minor = amount, approved_by = p_actor, approved_at = now()
    WHERE id = adj.id RETURNING * INTO adj;
  INSERT INTO public.guard_refunds(
    adjustment_id, subscription_id, invoice_id, provider_operation_id, stripe_payment_intent_id, stripe_charge_id,
    amount_minor, currency, status
  ) VALUES (
    adj.id, sub.id, inv.id, op.id, inv.stripe_payment_intent_id, inv.stripe_charge_id, amount, 'GBP', 'APPROVED'
  ) RETURNING * INTO refund;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'ADMIN', p_actor, 'REFUND_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Bounded refund approved', jsonb_build_object('refundId', refund.id, 'amountMinor', amount));
  RETURN jsonb_build_object(
    'status','success','id', refund.id, 'providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
    'amountMinor', amount, 'paymentIntentId', inv.stripe_payment_intent_id, 'chargeId', inv.stripe_charge_id
  );
END; $$;

CREATE FUNCTION admin_private.guard_approve_credit_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE adj public.guard_billing_adjustments; sub public.guard_subscriptions; amount integer;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = NULLIF(p_payload->>'subscriptionId','')::uuid FOR UPDATE;
  amount := NULLIF(p_payload->>'amountMinor','')::integer;
  IF sub.id IS NULL OR amount IS NULL OR amount <= 0 OR length(btrim(coalesce(p_payload->>'reason',''))) < 10 THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.guard_billing_adjustments a
    WHERE a.subscription_id = sub.id AND a.kind = 'REFUND' AND a.status IN ('APPROVED','SUBMITTED','SUCCEEDED')
      AND a.period_start IS NOT DISTINCT FROM sub.current_period_start
      AND a.period_end IS NOT DISTINCT FROM sub.current_period_end
  ) THEN RETURN jsonb_build_object('status','denied','reason','overlapping_refund'); END IF;
  INSERT INTO public.guard_billing_adjustments(
    subscription_id, location_id, kind, status, amount_minor, currency, period_start, period_end, reason,
    approved_amount_minor, approved_by, approved_at, created_by
  ) VALUES (
    sub.id, sub.location_id, 'SERVICE_CREDIT', 'PENDING_APPLICATION', amount, 'GBP',
    sub.current_period_start, sub.current_period_end, btrim(p_payload->>'reason'),
    amount, p_actor, now(), p_actor
  ) RETURNING * INTO adj;
  PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'GUARD_CREDIT_APPROVED', amount, 'GBP',
    adj.id::text, 'ADMIN', p_actor, 'SERVICE_CREDIT');
  RETURN jsonb_build_object('status','success','id', adj.id, 'statusName', adj.status);
END; $$;

CREATE FUNCTION admin_private.guard_map_provider_price_v1(p_actor uuid, p_request uuid, p_payload jsonb, p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  price public.price_versions; map public.guard_provider_price_maps; op public.provider_operations;
BEGIN
  IF (p_session->>'createdAt')::timestamptz < now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('status','reauth_required');
  END IF;
  SELECT * INTO price FROM public.price_versions WHERE id = NULLIF(p_payload->>'priceVersionId','')::uuid FOR UPDATE;
  IF price.id IS NULL OR price.service_code <> 'RELAUNCH_GUARD' OR price.status <> 'APPROVED'
    OR price.payment_model <> 'RECURRING_MONTHLY' OR price.billing_cadence <> 'MONTHLY'
  THEN RETURN jsonb_build_object('status','denied','reason','wrong_price'); END IF;
  SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = price.id;
  IF map.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', map.id, 'providerOperationId', map.provider_operation_id, 'replay', true);
  END IF;
  INSERT INTO public.provider_operations(
    idempotency_key, kind, purpose, customer_id, status
  ) SELECT p_request, 'CREATE_RECURRING_PRICE', 'GUARD_PRICE', c.id, 'PENDING'
    FROM public.customers c LIMIT 1
  RETURNING * INTO op;
  IF op.id IS NULL THEN
    INSERT INTO public.provider_operations(idempotency_key, kind, purpose, customer_id, status)
    VALUES (p_request, 'CREATE_RECURRING_PRICE', 'GUARD_PRICE', '22222222-2222-4222-8222-222222222222', 'PENDING')
    RETURNING * INTO op;
  END IF;
  RETURN jsonb_build_object(
    'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
    'amountMinor', price.amount_minor, 'currency', 'GBP', 'priceVersionId', price.id
  );
END; $$;

CREATE FUNCTION public.guard_record_provider_price_map_v1(
  p_operation uuid, p_price_version uuid, p_product_id text, p_price_id text, p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  op public.provider_operations; price public.price_versions; map public.guard_provider_price_maps;
BEGIN
  SELECT * INTO op FROM public.provider_operations WHERE id = p_operation AND kind = 'CREATE_RECURRING_PRICE' FOR UPDATE;
  SELECT * INTO price FROM public.price_versions WHERE id = p_price_version;
  IF op.id IS NULL OR price.id IS NULL OR p_product_id IS NULL OR p_price_id IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  IF p_product_id !~ '^prod_[A-Za-z0-9]+$' OR p_price_id !~ '^price_[A-Za-z0-9]+$' THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = price.id;
  IF map.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', map.id, 'replay', true);
  END IF;
  UPDATE public.provider_operations SET
    provider_object_id = p_price_id, provider_object_type = 'price', status = 'SUCCEEDED', submitted_at = coalesce(submitted_at, now())
    WHERE id = op.id;
  INSERT INTO public.guard_provider_price_maps(
    price_version_id, service_code, amount_minor, currency, interval, quantity, stripe_product_id, stripe_price_id,
    provider_operation_id, created_by
  ) VALUES (
    price.id, 'RELAUNCH_GUARD', price.amount_minor, 'GBP', 'month', 1, p_product_id, p_price_id, op.id, coalesce(p_actor, op.customer_id)
  ) RETURNING * INTO map;
  RETURN jsonb_build_object('status','success','id', map.id, 'stripePriceId', map.stripe_price_id);
END; $$;

ALTER FUNCTION public.admin_guard_command_v1(text, uuid, text, jsonb, integer) RENAME TO admin_guard_command_core_v1;
ALTER FUNCTION public.admin_guard_command_core_v1(text, uuid, text, jsonb, integer) SET SCHEMA admin_private;
REVOKE ALL ON FUNCTION admin_private.admin_guard_command_core_v1(text, uuid, text, jsonb, integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_guard_command_v1(p_token text, p_request uuid, p_operation text, p_payload jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s jsonb; actor uuid; fp text; cached jsonb; result jsonb; payload jsonb;
  existing text[] := ARRAY[
    'identify_location','remove_location','mark_mapping_ready','create_direct_coverage','create_included_offer',
    'issue_permission_action','record_baseline','assign_rota','activate','record_activation_exception',
    'acknowledge_exception','revoke_permission'
  ];
  billing text[] := ARRAY[
    'issue_subscription_start_action','create_included_continuation','issue_price_change_action',
    'schedule_period_end_cancellation','undo_scheduled_cancellation','request_immediate_cancellation',
    'approve_refund','approve_service_credit','map_provider_price'
  ];
BEGIN
  IF p_operation IS NULL OR p_operation = ANY (existing) THEN
    RETURN admin_private.admin_guard_command_core_v1(p_token, p_request, p_operation, p_payload, p_version);
  END IF;
  s := public.admin_session_v1(p_token);
  IF s IS NULL THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  actor := (s->>'userId')::uuid;
  IF p_request IS NULL OR p_operation IS NULL OR NOT (p_operation = ANY (billing))
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
  THEN RETURN jsonb_build_object('status','invalid'); END IF;
  payload := p_payload;
  IF p_version IS NOT NULL THEN payload := payload || jsonb_build_object('version', p_version); END IF;
  fp := md5(jsonb_build_array(p_operation, payload - 'secretHash', p_version)::text);
  cached := admin_private.guard_subscription_receipt_v1(actor, p_request, fp);
  IF cached IS NOT NULL THEN
    IF cached->>'status' = 'success' THEN RETURN cached || jsonb_build_object('replay', true); END IF;
    RETURN cached;
  END IF;
  result := CASE p_operation
    WHEN 'issue_subscription_start_action' THEN admin_private.guard_issue_subscription_start_v1(actor, p_request, payload)
    WHEN 'create_included_continuation' THEN admin_private.guard_create_continuation_v1(actor, p_request, payload)
    WHEN 'issue_price_change_action' THEN admin_private.guard_issue_price_change_v1(actor, p_request, payload, s)
    WHEN 'schedule_period_end_cancellation' THEN admin_private.guard_schedule_cancellation_v1(actor, p_request, payload, s)
    WHEN 'undo_scheduled_cancellation' THEN admin_private.guard_undo_cancellation_v1(actor, p_request, payload, s)
    WHEN 'request_immediate_cancellation' THEN admin_private.guard_request_immediate_cancellation_v1(actor, p_request, payload, s)
    WHEN 'approve_refund' THEN admin_private.guard_approve_refund_v1(actor, p_request, payload, s)
    WHEN 'approve_service_credit' THEN admin_private.guard_approve_credit_v1(actor, p_request, payload, s)
    WHEN 'map_provider_price' THEN admin_private.guard_map_provider_price_v1(actor, p_request, payload, s)
  END;
  IF result IS NULL THEN result := jsonb_build_object('status','invalid'); END IF;
  INSERT INTO admin_private.guard_subscription_receipts VALUES (p_request, actor, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION admin_private.accept_guard_recurring_consent_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  sub public.guard_subscriptions; ord public.service_orders; consent public.guard_recurring_consents;
  a public.customer_actions;
BEGIN
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = p_action.guard_subscription_id FOR UPDATE;
  SELECT * INTO consent FROM public.guard_recurring_consents WHERE subscription_id = sub.id;
  IF consent.id IS NOT NULL THEN
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = coalesce(completed_at, now())
      WHERE id = p_action.id AND status = 'OPEN' RETURNING * INTO a;
    RETURN jsonb_build_object('status','success','consentId', consent.id, 'replay', true);
  END IF;
  SELECT * INTO ord FROM public.service_orders WHERE id = sub.service_order_id;
  INSERT INTO public.guard_recurring_consents(
    customer_id, business_id, location_id, service_order_id, coverage_id, continuation_id, subscription_id,
    price_version_id, amount_minor, currency, frequency, tax_behaviour, consent_version, consent_text,
    cancellation_terms_version, cancellation_terms_text, customer_action_id, accepted_by_auth_user_id, accepted_email_snapshot
  ) VALUES (
    sub.customer_id, sub.business_id, sub.location_id, sub.service_order_id, sub.coverage_id, sub.continuation_id, sub.id,
    sub.price_version_id, sub.amount_minor, 'GBP', 'MONTHLY', sub.tax_behaviour, 'GUARD_RECURRING_CONSENT_V1',
    admin_private.guard_recurring_consent_text_v1(), 'GUARD_CANCELLATION_TERMS_V1',
    admin_private.guard_cancellation_terms_text_v1(), p_action.id, p_actor, p_action.expected_email_snapshot
  ) RETURNING * INTO consent;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id RETURNING * INTO a;
  UPDATE public.guard_continuations SET status = 'PENDING_CHECKOUT' WHERE id = sub.continuation_id AND status = 'PENDING_CONSENT';
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'RECURRING_CONSENT_ACCEPTED', sub.lifecycle_state, sub.lifecycle_state,
    'Recurring consent accepted', jsonb_build_object('consentId', consent.id));
  PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'CONSENT_RECORDED', sub.amount_minor, 'GBP',
    consent.id::text, 'CUSTOMER', p_actor, 'GUARD_RECURRING_CONSENT_V1');
  RETURN jsonb_build_object('status','success','consentId', consent.id, 'subscriptionId', sub.id);
END; $$;

CREATE FUNCTION admin_private.accept_guard_price_change_v1(
  p_action public.customer_actions, p_actor uuid, p_request uuid, p_accepted boolean
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  offer public.guard_price_change_offers; sub public.guard_subscriptions; map public.guard_provider_price_maps;
  a public.customer_actions;
BEGIN
  SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = p_action.guard_price_change_offer_id FOR UPDATE;
  SELECT * INTO sub FROM public.guard_subscriptions WHERE id = offer.subscription_id FOR UPDATE;
  IF NOT p_accepted THEN
    UPDATE public.guard_price_change_offers SET status = 'DECLINED', declined_at = now() WHERE id = offer.id AND status = 'OFFERED';
    UPDATE public.customer_actions SET status = 'DECLINED', completed_at = now() WHERE id = p_action.id RETURNING * INTO a;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'PRICE_CHANGE_DECLINED', sub.lifecycle_state, sub.lifecycle_state,
      'Price-change offer declined', jsonb_build_object('offerId', offer.id));
    RETURN jsonb_build_object('status','success','actionStatus', a.status, 'offerStatus', 'DECLINED');
  END IF;
  IF offer.status IN ('ACCEPTED','SCHEDULED','APPLIED') THEN
    UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = coalesce(completed_at, now())
      WHERE id = p_action.id AND status = 'OPEN';
    RETURN jsonb_build_object('status','success','offerId', offer.id, 'replay', true);
  END IF;
  SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = offer.new_price_version_id;
  UPDATE public.guard_price_change_offers SET status = 'ACCEPTED', accepted_at = now() WHERE id = offer.id RETURNING * INTO offer;
  UPDATE public.customer_actions SET status = 'COMPLETED', completed_at = now() WHERE id = p_action.id RETURNING * INTO a;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', p_actor, 'PRICE_CHANGE_ACCEPTED', sub.lifecycle_state, sub.lifecycle_state,
    'Price-change accepted for next renewal', jsonb_build_object('offerId', offer.id, 'newAmountMinor', offer.new_amount_minor));
  PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'GUARD_PRICE_CHANGE', offer.new_amount_minor, 'GBP',
    offer.id::text, 'CUSTOMER', p_actor, 'PRICE_CHANGE_ACCEPTED');
  RETURN jsonb_build_object(
    'status','success','offerId', offer.id, 'subscriptionItemId', sub.stripe_subscription_item_id,
    'newStripePriceId', map.stripe_price_id, 'oldStripePriceId', sub.stripe_price_id,
    'cancelAtPeriodEnd', sub.cancel_at_period_end, 'scheduleId', sub.stripe_schedule_id
  );
END; $$;

ALTER FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) RENAME TO customer_action_command_core_v1;
ALTER FUNCTION public.customer_action_command_core_v1(text, uuid, text, jsonb) SET SCHEMA admin_private;
REVOKE ALL ON FUNCTION admin_private.customer_action_command_core_v1(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.customer_action_command_v1(p_token_hash text, p_request uuid, p_operation text, p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions; a public.customer_actions; fp text; cached jsonb; result jsonb; data jsonb;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN admin_private.customer_action_command_core_v1(p_token_hash, p_request, p_operation, p_data); END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id;
  IF a.kind NOT IN ('GUARD_SUBSCRIPTION_START','GUARD_PRICE_CHANGE_ACCEPTANCE') THEN
    RETURN admin_private.customer_action_command_core_v1(p_token_hash, p_request, p_operation, p_data);
  END IF;
  IF p_operation IS NULL OR p_operation NOT IN ('accept','decline')
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status', 'unavailable'); END IF;
  data := coalesce(p_data, '{}'::jsonb);
  fp := md5(jsonb_build_array(sess.action_id, p_operation, data)::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.kind = 'GUARD_SUBSCRIPTION_START' THEN
    IF p_operation <> 'accept' OR data->'accepted' IS DISTINCT FROM 'true'::jsonb
      OR data->>'consentVersion' IS DISTINCT FROM 'GUARD_RECURRING_CONSENT_V1'
    THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
    IF NOT admin_private.customer_action_eligible_v1(a) AND a.status <> 'COMPLETED' THEN
      RETURN jsonb_build_object('status', 'unavailable');
    END IF;
    result := admin_private.accept_guard_recurring_consent_v1(a, sess.auth_user_id, p_request);
  ELSE
    IF p_operation = 'accept' AND (data->'accepted' IS DISTINCT FROM 'true'::jsonb) THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    result := admin_private.accept_guard_price_change_v1(a, sess.auth_user_id, p_request, p_operation = 'accept');
  END IF;
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, result, now());
  RETURN result;
END; $$;

CREATE FUNCTION public.customer_guard_subscription_command_v1(
  p_token_hash text, p_request uuid, p_operation text, p_data jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  sess admin_private.customer_action_sessions; a public.customer_actions; sub public.guard_subscriptions;
  consent public.guard_recurring_consents; map public.guard_provider_price_maps; op public.provider_operations;
  fp text; cached jsonb; cus public.stripe_customer_maps; ready boolean;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_request IS NULL
    OR p_operation IS NULL OR p_operation NOT IN (
      'start_checkout','start_recovery','request_period_end_cancellation','undo_period_end_cancellation','request_immediate_cancellation'
    )
    OR p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
  THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT * INTO sess FROM admin_private.customer_action_sessions WHERE token_hash = p_token_hash AND expires_at > now();
  IF sess.token_hash IS NULL THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  fp := md5(jsonb_build_array(sess.action_id, p_operation, coalesce(p_data, '{}'::jsonb))::text);
  cached := admin_private.customer_action_receipt_v1(sess.auth_user_id, p_request, fp);
  IF cached IS NOT NULL THEN RETURN cached; END IF;
  SELECT * INTO a FROM public.customer_actions WHERE id = sess.action_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  SELECT * INTO sub FROM public.guard_subscriptions
    WHERE id = coalesce(a.guard_subscription_id, NULLIF(p_data->>'subscriptionId','')::uuid) FOR UPDATE;
  IF sub.id IS NULL OR sub.customer_id IS DISTINCT FROM a.customer_id OR sub.location_id IS DISTINCT FROM a.location_id THEN
    RETURN jsonb_build_object('status','denied');
  END IF;
  IF p_operation = 'start_checkout' THEN
    SELECT * INTO consent FROM public.guard_recurring_consents WHERE subscription_id = sub.id;
    IF consent.id IS NULL THEN RETURN jsonb_build_object('status','denied','reason','consent_required'); END IF;
    IF sub.coverage_id IS NOT NULL AND NOT admin_private.guard_non_billing_ready_v1(sub.coverage_id) THEN
      RETURN jsonb_build_object('status','denied','reason','not_ready');
    END IF;
    SELECT * INTO map FROM public.guard_provider_price_maps WHERE price_version_id = sub.price_version_id;
    IF map.id IS NULL OR map.amount_minor IS DISTINCT FROM sub.amount_minor THEN
      RETURN jsonb_build_object('status','denied','reason','wrong_price');
    END IF;
    SELECT * INTO cus FROM public.stripe_customer_maps WHERE customer_id = sub.customer_id;
    SELECT * INTO op FROM public.provider_operations
      WHERE guard_subscription_id = sub.id AND kind = 'CREATE_SUBSCRIPTION_CHECKOUT' AND status IN ('PENDING','SUBMITTED','SUCCEEDED')
      ORDER BY created_at ASC LIMIT 1;
    IF op.id IS NULL THEN
      INSERT INTO public.provider_operations(
        idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
      ) VALUES (
        coalesce(NULLIF(p_data->>'idempotencyKey','')::uuid, p_request), 'CREATE_SUBSCRIPTION_CHECKOUT',
        'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
      ) RETURNING * INTO op;
    END IF;
    UPDATE public.guard_subscriptions SET lifecycle_state = 'PENDING_PROVIDER' WHERE id = sub.id AND lifecycle_state = 'PENDING_CUSTOMER';
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', sess.auth_user_id, 'CHECKOUT_CREATED', 'PENDING_CUSTOMER', 'PENDING_PROVIDER',
      'Subscription Checkout prepared', jsonb_build_object('providerOperationId', op.id));
    cached := jsonb_build_object(
      'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeCustomerId', cus.stripe_customer_id, 'stripePriceId', map.stripe_price_id, 'amountMinor', sub.amount_minor,
      'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardCoverageId', sub.coverage_id,
      'guardSubscriptionId', sub.id, 'priceVersionId', sub.price_version_id, 'continuationId', sub.continuation_id,
      'mode', 'subscription'
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'start_recovery' THEN
    INSERT INTO public.provider_operations(
      idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
    ) VALUES (
      p_request, 'CREATE_RECOVERY_CHECKOUT', 'GUARD_RECOVERY', sub.customer_id, sub.service_order_id, sub.id, 'PENDING'
    ) RETURNING * INTO op;
    SELECT * INTO cus FROM public.stripe_customer_maps WHERE customer_id = sub.customer_id;
    cached := jsonb_build_object(
      'status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key,
      'stripeCustomerId', cus.stripe_customer_id, 'stripeSubscriptionId', sub.stripe_subscription_id,
      'customerId', sub.customer_id, 'serviceOrderId', sub.service_order_id, 'guardSubscriptionId', sub.id, 'mode', 'setup'
    );
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'request_period_end_cancellation' THEN
    IF sub.lifecycle_state IN ('CANCELED','ENDED') THEN RETURN jsonb_build_object('status','denied'); END IF;
    UPDATE public.guard_subscriptions SET cancellation_intent = 'CANCEL_AT_PERIOD_END', cancel_at_period_end = true
      WHERE id = sub.id RETURNING * INTO sub;
    INSERT INTO public.provider_operations(
      idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
    ) VALUES (p_request, 'CANCEL_SUBSCRIPTION_PERIOD_END', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id, 'PENDING')
    RETURNING * INTO op;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', sess.auth_user_id, 'CANCELLATION_REQUESTED', NULL, sub.lifecycle_state,
      'Customer requested period-end cancellation', jsonb_build_object('providerOperationId', op.id));
    cached := jsonb_build_object('status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key, 'stripeSubscriptionId', sub.stripe_subscription_id);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, cached, now());
    RETURN cached;
  END IF;
  IF p_operation = 'undo_period_end_cancellation' THEN
    IF sub.lifecycle_state IN ('CANCELED','ENDED') THEN RETURN jsonb_build_object('status','denied','reason','already_ended'); END IF;
    UPDATE public.guard_subscriptions SET cancellation_intent = NULL, cancel_at_period_end = false,
      lifecycle_state = CASE WHEN lifecycle_state = 'CANCEL_AT_PERIOD_END' THEN 'ACTIVE' ELSE lifecycle_state END
      WHERE id = sub.id RETURNING * INTO sub;
    INSERT INTO public.provider_operations(
      idempotency_key, kind, purpose, customer_id, service_order_id, guard_subscription_id, status
    ) VALUES (p_request, 'UNDO_SUBSCRIPTION_CANCELLATION', 'GUARD_SUBSCRIPTION', sub.customer_id, sub.service_order_id, sub.id, 'PENDING')
    RETURNING * INTO op;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', sess.auth_user_id, 'CANCELLATION_REVERSED', NULL, sub.lifecycle_state,
      'Customer reversed scheduled cancellation', jsonb_build_object('providerOperationId', op.id));
    cached := jsonb_build_object('status','success','providerOperationId', op.id, 'idempotencyKey', op.idempotency_key, 'stripeSubscriptionId', sub.stripe_subscription_id);
    INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, cached, now());
    RETURN cached;
  END IF;
  UPDATE public.guard_subscriptions SET cancellation_intent = 'REQUEST_IMMEDIATE_CANCELLATION' WHERE id = sub.id;
  PERFORM admin_private.guard_subscription_append_v1(sub.id, 'CUSTOMER', sess.auth_user_id, 'CANCELLATION_REQUESTED', sub.lifecycle_state, sub.lifecycle_state,
    'Customer requested immediate cancellation review', '{}'::jsonb);
  cached := jsonb_build_object('status','success','reviewRequired', true);
  INSERT INTO admin_private.customer_action_command_receipts VALUES (p_request, sess.auth_user_id, fp, cached, now());
  RETURN cached;
END; $$;

CREATE FUNCTION admin_private.guard_handoff_continuation_v1(p_subscription public.guard_subscriptions, p_paid_through timestamptz)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  cont public.guard_continuations; included public.guard_coverages; paid public.guard_coverages;
  perm public.guard_permissions; base public.guard_baselines; rota public.guard_rota_assignments;
  acc public.location_manager_access;
BEGIN
  IF p_subscription.continuation_id IS NULL THEN RETURN p_subscription.coverage_id; END IF;
  SELECT * INTO cont FROM public.guard_continuations WHERE id = p_subscription.continuation_id FOR UPDATE;
  IF cont.paid_coverage_id IS NOT NULL THEN RETURN cont.paid_coverage_id; END IF;
  SELECT * INTO included FROM public.guard_coverages WHERE id = cont.included_coverage_id FOR UPDATE;
  IF included.activated_at IS NULL THEN
    PERFORM admin_private.guard_begin_activation_v1();
    UPDATE public.guard_coverages SET
      activated_at = now(),
      included_start_at = now(),
      included_end_at = now() + interval '30 days',
      state = 'ACTIVE'
      WHERE id = included.id RETURNING * INTO included;
    PERFORM admin_private.guard_append_event_v1(included.id, 'SYSTEM', NULL, 'INCLUDED_ENDED', included.state, 'ACTIVE',
      'Included coverage closed for paid continuation handoff', jsonb_build_object('continuationId', cont.id));
  END IF;
  IF included.state IN ('ACTIVE','PAUSED') THEN
    included := admin_private.guard_transition_coverage_v1(included.id, 'ENDING', 'SYSTEM', NULL, 'INCLUDED_ENDED', 'Included period handed off to paid continuation');
  END IF;
  IF included.state = 'ENDING' THEN
    included := admin_private.guard_transition_coverage_v1(included.id, 'ENDED', 'SYSTEM', NULL, 'INCLUDED_ENDED', 'Included coverage ended after paid continuation invoice');
  END IF;
  UPDATE public.guard_billing SET updated_at = now()
    WHERE coverage_id = included.id AND entitlement_source = 'INCLUDED';
  INSERT INTO public.guard_coverages(
    customer_id, business_id, location_id, monitoring_request_id, onboarding_location_id, service_order_id,
    coverage_basis, coverage_origin, source_included_coverage_id, state, permission_id, baseline_id, rota_id, access_id
  ) VALUES (
    cont.customer_id, cont.business_id, cont.location_id, included.monitoring_request_id, included.onboarding_location_id,
    cont.service_order_id, 'DIRECT_GUARD', 'INCLUDED_CONTINUATION', included.id, 'REQUESTED',
    included.permission_id, included.baseline_id, included.rota_id, included.access_id
  ) RETURNING * INTO paid;
  INSERT INTO public.guard_billing(coverage_id, billing_state, entitlement_source, paid_through_at)
  VALUES (paid.id, 'PENDING', 'NONE', NULL);
  PERFORM admin_private.guard_set_entitlement_checked_v1(paid.id, 'CURRENT', p_paid_through, 'PROVIDER');
  PERFORM admin_private.guard_append_event_v1(paid.id, 'SYSTEM', NULL, 'CONTINUATION_HANDED_OFF', NULL, paid.state,
    'Paid continuation coverage created from included Guard', jsonb_build_object('includedCoverageId', included.id, 'subscriptionId', p_subscription.id));
  UPDATE public.guard_continuations SET status = 'HANDED_OFF', paid_coverage_id = paid.id, handed_off_at = now() WHERE id = cont.id;
  UPDATE public.guard_subscriptions SET coverage_id = paid.id WHERE id = p_subscription.id;
  PERFORM admin_private.guard_sync_coverage_state_v1(paid.id, 'SYSTEM', NULL);
  RETURN paid.id;
END; $$;

CREATE FUNCTION admin_private.guard_apply_invoice_paid_v1(p_sub public.guard_subscriptions, p_payload jsonb, p_object_id text)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  inv public.guard_subscription_invoices; period_end timestamptz; amount integer; kind text; coverage uuid;
  previous public.guard_billing; first_paid boolean;
BEGIN
  IF coalesce(p_payload->>'livemode','false') = 'true' THEN
    RETURN jsonb_build_object('status','denied','reason','livemode');
  END IF;
  IF NULLIF(p_payload->>'stripeCustomerId','') IS DISTINCT FROM p_sub.stripe_customer_id
    AND NULLIF(p_payload->>'stripeCustomerId','') IS NOT NULL
    AND p_sub.stripe_customer_id IS NOT NULL
  THEN RETURN jsonb_build_object('status','denied','reason','customer_mismatch'); END IF;
  IF NULLIF(p_payload->>'subscriptionId','') IS DISTINCT FROM p_sub.stripe_subscription_id
    AND p_sub.stripe_subscription_id IS NOT NULL
  THEN RETURN jsonb_build_object('status','denied','reason','subscription_mismatch'); END IF;
  IF NULLIF(p_payload->>'priceId','') IS NOT NULL AND NULLIF(p_payload->>'priceId','') IS DISTINCT FROM p_sub.stripe_price_id THEN
    RETURN jsonb_build_object('status','denied','reason','price_mismatch');
  END IF;
  IF coalesce(NULLIF(p_payload->>'quantity','')::integer, 1) <> 1 THEN
    RETURN jsonb_build_object('status','denied','reason','quantity');
  END IF;
  amount := coalesce(NULLIF(p_payload->>'amountPaidMinor','')::integer, NULLIF(p_payload->>'amountMinor','')::integer);
  IF amount IS NULL OR amount <> p_sub.amount_minor OR lower(coalesce(p_payload->>'currency','gbp')) <> 'gbp' THEN
    RETURN jsonb_build_object('status','denied','reason','amount');
  END IF;
  period_end := coalesce(NULLIF(p_payload->>'periodEnd','')::timestamptz, p_sub.current_period_end);
  IF period_end IS NULL OR period_end <= now() THEN
    RETURN jsonb_build_object('status','denied','reason','period');
  END IF;
  SELECT * INTO inv FROM public.guard_subscription_invoices WHERE stripe_invoice_id = p_object_id;
  IF inv.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','id', inv.id, 'duplicate', true, 'coverageId', p_sub.coverage_id);
  END IF;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.guard_subscription_invoices i WHERE i.subscription_id = p_sub.id AND i.status = 'PAID'
  ) INTO first_paid;
  kind := CASE WHEN first_paid THEN 'INITIAL' ELSE 'RENEWAL' END;
  INSERT INTO public.guard_subscription_invoices(
    subscription_id, coverage_id, stripe_invoice_id, stripe_payment_intent_id, stripe_charge_id,
    amount_paid_minor, currency, period_start, period_end, kind, status
  ) VALUES (
    p_sub.id, p_sub.coverage_id, p_object_id, NULLIF(p_payload->>'paymentIntentId',''), NULLIF(p_payload->>'chargeId',''),
    amount, 'GBP', NULLIF(p_payload->>'periodStart','')::timestamptz, period_end, kind, 'PAID'
  ) RETURNING * INTO inv;
  UPDATE public.guard_subscriptions SET
    lifecycle_state = CASE WHEN cancel_at_period_end THEN 'CANCEL_AT_PERIOD_END' ELSE 'ACTIVE' END,
    provider_status = coalesce(NULLIF(p_payload->>'providerStatus',''), 'active'),
    stripe_subscription_id = coalesce(stripe_subscription_id, NULLIF(p_payload->>'subscriptionId','')),
    stripe_subscription_item_id = coalesce(stripe_subscription_item_id, NULLIF(p_payload->>'subscriptionItemId','')),
    stripe_customer_id = coalesce(stripe_customer_id, NULLIF(p_payload->>'stripeCustomerId','')),
    current_period_start = coalesce(NULLIF(p_payload->>'periodStart','')::timestamptz, current_period_start),
    current_period_end = CASE
      WHEN current_period_end IS NULL OR period_end >= current_period_end THEN period_end
      ELSE current_period_end
    END,
    latest_paid_invoice_id = p_object_id,
    latest_invoice_failure = ''
    WHERE id = p_sub.id RETURNING * INTO p_sub;
  IF p_sub.continuation_id IS NOT NULL AND kind = 'INITIAL' THEN
    coverage := admin_private.guard_handoff_continuation_v1(p_sub, p_sub.current_period_end);
    UPDATE public.guard_subscription_invoices SET coverage_id = coverage WHERE id = inv.id;
  ELSE
    coverage := p_sub.coverage_id;
    SELECT * INTO previous FROM public.guard_billing WHERE coverage_id = coverage FOR UPDATE;
    PERFORM admin_private.guard_set_entitlement_checked_v1(coverage, 'CURRENT', p_sub.current_period_end, 'PROVIDER');
    IF previous.billing_state IS DISTINCT FROM 'CURRENT' THEN
      PERFORM admin_private.guard_append_event_v1(coverage, 'SYSTEM', NULL, 'BILLING_CHANGED', NULL, NULL,
        'Provider invoice paid', jsonb_build_object('invoiceId', p_object_id, 'paidThrough', p_sub.current_period_end));
    END IF;
  END IF;
  PERFORM admin_private.guard_subscription_append_v1(
    p_sub.id, 'PROVIDER', NULL, CASE WHEN kind = 'INITIAL' THEN 'FIRST_INVOICE_PAID' ELSE 'RENEWAL_PAID' END,
    NULL, p_sub.lifecycle_state, 'Confirmed recurring invoice payment',
    jsonb_build_object('invoiceId', p_object_id, 'paidThrough', p_sub.current_period_end)
  );
  PERFORM admin_private.write_payment_ledger_v1(
    p_sub.customer_id, p_sub.service_order_id, NULL,
    CASE WHEN kind = 'INITIAL' THEN 'GUARD_INVOICE_PAID' ELSE 'GUARD_RENEWAL_PAID' END,
    amount, 'GBP', p_object_id, 'PROVIDER', NULL, 'invoice.paid'
  );
  RETURN jsonb_build_object('status','success','id', inv.id, 'coverageId', coverage, 'kind', kind);
END; $$;

CREATE FUNCTION public.guard_apply_subscription_event_v1(
  p_event_id text, p_type text, p_object_id text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  rec admin_private.stripe_event_receipts; sub public.guard_subscriptions; inv public.guard_subscription_invoices;
  refund public.guard_refunds; dispute public.guard_disputes; payload jsonb; meta_sub uuid;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) < 3 OR p_type IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  payload := coalesce(p_payload, '{}'::jsonb);
  INSERT INTO admin_private.stripe_event_receipts(provider_event_id, event_type, provider_object_id, livemode)
  VALUES (p_event_id, p_type, p_object_id, coalesce((payload->>'livemode')::boolean, false))
  ON CONFLICT (provider_event_id) DO NOTHING;
  SELECT * INTO rec FROM admin_private.stripe_event_receipts WHERE provider_event_id = p_event_id FOR UPDATE;
  IF rec.processed THEN RETURN jsonb_build_object('status','success','duplicate', true); END IF;
  IF rec.livemode OR coalesce((payload->>'livemode')::boolean, false) THEN
    UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
    RETURN jsonb_build_object('status','success','ignored', true, 'reason', 'livemode');
  END IF;
  meta_sub := NULLIF(payload->>'guardSubscriptionId','')::uuid;
  SELECT * INTO sub FROM public.guard_subscriptions
    WHERE id = meta_sub OR stripe_subscription_id = NULLIF(payload->>'subscriptionId','')
       OR stripe_subscription_id = p_object_id
    LIMIT 1
    FOR UPDATE;
  IF sub.id IS NULL AND p_type LIKE 'checkout.session.%' THEN
    SELECT s.* INTO sub FROM public.guard_subscriptions s
      JOIN public.provider_operations o ON o.guard_subscription_id = s.id
      WHERE o.provider_object_id = p_object_id
    LIMIT 1;
  END IF;
  IF sub.id IS NULL THEN
    UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
    RETURN jsonb_build_object('status','success','ignored', true, 'reason', 'unrelated');
  END IF;
  IF p_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded') THEN
    UPDATE public.guard_subscriptions SET
      stripe_subscription_id = coalesce(stripe_subscription_id, NULLIF(payload->>'subscriptionId','')),
      stripe_customer_id = coalesce(stripe_customer_id, NULLIF(payload->>'stripeCustomerId','')),
      lifecycle_state = CASE WHEN lifecycle_state IN ('PENDING_CUSTOMER','PENDING_PROVIDER') THEN 'INCOMPLETE' ELSE lifecycle_state END,
      provider_status = coalesce(NULLIF(payload->>'providerStatus',''), provider_status)
      WHERE id = sub.id;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL, 'SUBSCRIPTION_CORRELATED', sub.lifecycle_state, 'INCOMPLETE',
      'Checkout correlated; entitlement waits for invoice.paid', jsonb_build_object('checkoutId', p_object_id));
  ELSIF p_type IN ('customer.subscription.created','customer.subscription.updated') THEN
    IF coalesce(NULLIF(payload->>'quantity','')::integer, 1) <> 1 THEN
      PERFORM admin_private.guard_subscription_append_v1(sub.id, 'SYSTEM', NULL, 'RECONCILIATION_MISMATCH', sub.lifecycle_state, sub.lifecycle_state,
        'Provider quantity is not 1', jsonb_build_object('quantity', payload->>'quantity'));
    END IF;
    UPDATE public.guard_subscriptions SET
      stripe_subscription_id = coalesce(stripe_subscription_id, p_object_id),
      stripe_subscription_item_id = coalesce(NULLIF(payload->>'subscriptionItemId',''), stripe_subscription_item_id),
      stripe_schedule_id = coalesce(NULLIF(payload->>'scheduleId',''), stripe_schedule_id),
      provider_status = coalesce(NULLIF(payload->>'providerStatus',''), provider_status),
      cancel_at_period_end = coalesce((payload->>'cancelAtPeriodEnd')::boolean, cancel_at_period_end),
      current_period_start = coalesce(NULLIF(payload->>'periodStart','')::timestamptz, current_period_start),
      current_period_end = coalesce(NULLIF(payload->>'periodEnd','')::timestamptz, current_period_end),
      lifecycle_state = CASE
        WHEN lifecycle_state IN ('CANCELED','ENDED') THEN lifecycle_state
        WHEN coalesce((payload->>'cancelAtPeriodEnd')::boolean, false) THEN 'CANCEL_AT_PERIOD_END'
        WHEN NULLIF(payload->>'providerStatus','') IN ('past_due','unpaid') THEN 'PAST_DUE'
        WHEN NULLIF(payload->>'providerStatus','') = 'canceled' THEN 'CANCELED'
        WHEN NULLIF(payload->>'providerStatus','') IN ('incomplete','incomplete_expired','trialing') THEN 'INCOMPLETE'
        ELSE lifecycle_state
      END
      WHERE id = sub.id;
    IF NULLIF(payload->>'providerStatus','') = 'trialing' THEN
      PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL, 'CONTINUATION_SCHEDULED', sub.lifecycle_state, 'INCOMPLETE',
        'Trialing is not paid entitlement', '{}'::jsonb);
    END IF;
  ELSIF p_type = 'customer.subscription.deleted' THEN
    UPDATE public.guard_subscriptions SET
      provider_status = 'canceled', lifecycle_state = 'CANCELED', canceled_at = coalesce(canceled_at, now()),
      cancel_at_period_end = false
      WHERE id = sub.id AND lifecycle_state NOT IN ('ENDED');
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL, 'SUBSCRIPTION_ENDED', sub.lifecycle_state, 'CANCELED',
      'Provider subscription deleted', jsonb_build_object('subscriptionId', p_object_id));
  ELSIF p_type = 'invoice.paid' THEN
    payload := admin_private.guard_apply_invoice_paid_v1(sub, payload, p_object_id);
    IF payload->>'status' = 'success' THEN
      UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
    END IF;
    RETURN payload;
  ELSIF p_type IN ('invoice.payment_failed','invoice.payment_action_required','invoice.finalization_failed') THEN
    INSERT INTO public.guard_subscription_invoices(
      subscription_id, coverage_id, stripe_invoice_id, amount_paid_minor, currency, kind, status
    ) VALUES (
      sub.id, sub.coverage_id, coalesce(NULLIF(p_object_id,''), 'inunk' || regexp_replace(p_event_id, '[^A-Za-z0-9]', '', 'g')), 0, 'GBP', 'RENEWAL',
      CASE p_type WHEN 'invoice.payment_action_required' THEN 'ACTION_REQUIRED' WHEN 'invoice.finalization_failed' THEN 'FINALIZATION_FAILED' ELSE 'FAILED' END
    ) ON CONFLICT (stripe_invoice_id) DO NOTHING;
    UPDATE public.guard_subscriptions SET
      lifecycle_state = CASE WHEN lifecycle_state IN ('CANCELED','ENDED') THEN lifecycle_state ELSE 'PAST_DUE' END,
      latest_invoice_failure = left(coalesce(payload->>'failureCode', p_type), 80)
      WHERE id = sub.id;
    IF sub.coverage_id IS NOT NULL THEN
      UPDATE public.guard_billing SET billing_state = CASE WHEN billing_state = 'CURRENT' THEN 'PAST_DUE' ELSE billing_state END,
        record_version = record_version + 1, updated_at = now()
        WHERE coverage_id = sub.coverage_id AND entitlement_source = 'PROVIDER';
    END IF;
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL,
      CASE WHEN p_type = 'invoice.payment_action_required' THEN 'AUTHENTICATION_REQUIRED' ELSE 'RENEWAL_FAILED' END,
      sub.lifecycle_state, 'PAST_DUE', 'Renewal failed or requires authentication; paid-through is unchanged',
      jsonb_build_object('invoiceId', p_object_id));
    PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL, 'GUARD_RENEWAL_FAILED',
      sub.amount_minor, 'GBP', p_object_id, 'PROVIDER', NULL, p_type);
  ELSIF p_type IN ('charge.refunded','refund.updated','refund.failed','refund.created') THEN
    SELECT * INTO refund FROM public.guard_refunds
      WHERE stripe_refund_id = p_object_id OR provider_operation_id = NULLIF(payload->>'providerOperationId','')::uuid
      FOR UPDATE;
    IF refund.id IS NOT NULL THEN
      UPDATE public.guard_refunds SET
        stripe_refund_id = coalesce(stripe_refund_id, p_object_id),
        status = CASE
          WHEN p_type = 'refund.failed' THEN 'FAILED'
          WHEN NULLIF(payload->>'refundStatus','') IN ('succeeded','canceled') THEN upper(payload->>'refundStatus')
          WHEN NULLIF(payload->>'refundStatus','') = 'pending' THEN 'PENDING'
          WHEN p_type = 'charge.refunded' THEN 'SUCCEEDED'
          ELSE status
        END,
        succeeded_at = CASE WHEN p_type = 'charge.refunded' OR payload->>'refundStatus' = 'succeeded' THEN coalesce(succeeded_at, now()) ELSE succeeded_at END,
        failed_at = CASE WHEN p_type = 'refund.failed' THEN now() ELSE failed_at END,
        failure_code = coalesce(NULLIF(payload->>'failureCode',''), failure_code)
        WHERE id = refund.id RETURNING * INTO refund;
      UPDATE public.guard_billing_adjustments SET status = refund.status WHERE id = refund.adjustment_id;
      PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL,
        CASE WHEN refund.status = 'FAILED' THEN 'REFUND_FAILED' WHEN refund.status = 'SUCCEEDED' THEN 'REFUND_SUCCEEDED' ELSE 'REFUND_SUBMITTED' END,
        NULL, sub.lifecycle_state, 'Provider refund update', jsonb_build_object('refundId', refund.id, 'status', refund.status));
      PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL,
        CASE WHEN refund.status = 'FAILED' THEN 'GUARD_REFUND_FAILED' WHEN refund.status = 'SUCCEEDED' THEN 'GUARD_REFUND_SUCCEEDED' ELSE 'GUARD_REFUND_SUBMITTED' END,
        refund.amount_minor, 'GBP', p_object_id, 'PROVIDER', NULL, p_type);
    END IF;
  ELSIF p_type LIKE 'charge.dispute.%' THEN
    INSERT INTO public.guard_disputes(
      subscription_id, location_id, invoice_id, stripe_dispute_id, stripe_charge_id, amount_minor, currency, provider_status
    ) VALUES (
      sub.id, sub.location_id,
      (SELECT id FROM public.guard_subscription_invoices WHERE subscription_id = sub.id AND stripe_charge_id = NULLIF(payload->>'chargeId','') LIMIT 1),
      p_object_id, NULLIF(payload->>'chargeId',''),
      coalesce(NULLIF(payload->>'amountMinor','')::integer, sub.amount_minor), 'GBP',
      coalesce(NULLIF(payload->>'disputeStatus',''), 'needs_response')
    ) ON CONFLICT (stripe_dispute_id) DO UPDATE SET
      provider_status = excluded.provider_status,
      resolved_at = CASE WHEN p_type IN ('charge.dispute.closed','charge.dispute.funds_reinstated') THEN coalesce(public.guard_disputes.resolved_at, now()) ELSE public.guard_disputes.resolved_at END,
      finance_work_status = CASE WHEN p_type IN ('charge.dispute.closed','charge.dispute.funds_reinstated') THEN 'CLOSED' ELSE public.guard_disputes.finance_work_status END,
      outcome = coalesce(NULLIF(payload->>'outcome',''), public.guard_disputes.outcome);
    PERFORM admin_private.guard_subscription_append_v1(sub.id, 'PROVIDER', NULL,
      CASE WHEN p_type = 'charge.dispute.closed' THEN 'DISPUTE_CLOSED' WHEN p_type = 'charge.dispute.created' THEN 'DISPUTE_OPENED' ELSE 'DISPUTE_UPDATED' END,
      NULL, sub.lifecycle_state, 'Provider dispute update', jsonb_build_object('disputeId', p_object_id));
    PERFORM admin_private.write_payment_ledger_v1(sub.customer_id, sub.service_order_id, NULL,
      CASE WHEN p_type = 'charge.dispute.closed' THEN 'GUARD_DISPUTE_CLOSED' ELSE 'GUARD_DISPUTE_OPENED' END,
      coalesce(NULLIF(payload->>'amountMinor','')::integer, sub.amount_minor), 'GBP', p_object_id, 'PROVIDER', NULL, p_type);
  END IF;
  UPDATE admin_private.stripe_event_receipts SET processed = true WHERE provider_event_id = p_event_id;
  RETURN jsonb_build_object('status','success','duplicate', false, 'subscriptionId', sub.id);
END; $$;

CREATE FUNCTION public.guard_record_provider_refs_v1(p_operation uuid, p_object_id text, p_object_type text, p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RETURN public.payment_record_provider_refs_v1(p_operation, p_object_id, p_object_type, p_status);
END; $$;

CREATE FUNCTION public.guard_record_refund_v1(p_operation uuid, p_refund_id text, p_status text, p_failure text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op public.provider_operations; refund public.guard_refunds;
BEGIN
  SELECT * INTO op FROM public.provider_operations WHERE id = p_operation AND kind = 'CREATE_REFUND' FOR UPDATE;
  IF op.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM public.payment_record_provider_refs_v1(p_operation, p_refund_id, 'refund',
    CASE WHEN p_status IN ('succeeded','failed','canceled') THEN upper(p_status) ELSE 'SUBMITTED' END);
  UPDATE public.guard_refunds SET
    stripe_refund_id = coalesce(stripe_refund_id, p_refund_id),
    status = CASE p_status
      WHEN 'succeeded' THEN 'SUCCEEDED'
      WHEN 'failed' THEN 'FAILED'
      WHEN 'canceled' THEN 'CANCELED'
      WHEN 'pending' THEN 'PENDING'
      ELSE 'SUBMITTED'
    END,
    submitted_at = coalesce(submitted_at, now()),
    succeeded_at = CASE WHEN p_status = 'succeeded' THEN coalesce(succeeded_at, now()) ELSE succeeded_at END,
    failed_at = CASE WHEN p_status = 'failed' THEN now() ELSE failed_at END,
    failure_code = coalesce(p_failure, failure_code)
    WHERE provider_operation_id = op.id RETURNING * INTO refund;
  UPDATE public.guard_billing_adjustments SET status = refund.status WHERE id = refund.adjustment_id;
  RETURN jsonb_build_object('status','success','id', refund.id, 'refundStatus', refund.status);
END; $$;

CREATE FUNCTION public.guard_enqueue_daily_reconcile_v1() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  service date; run public.guard_reconciliation_runs; outbox uuid;
BEGIN
  service := (timezone('Europe/London', now()))::date;
  SELECT * INTO run FROM public.guard_reconciliation_runs WHERE service_date = service;
  IF run.id IS NOT NULL THEN
    RETURN jsonb_build_object('status','success','runId', run.id, 'serviceDate', service, 'duplicate', true);
  END IF;
  INSERT INTO public.guard_reconciliation_runs(service_date, status) VALUES (service, 'STARTED') RETURNING * INTO run;
  outbox := admin_private.enqueue_outbox_v1(
    'reconcile-guard-billing:' || service::text, 'RECONCILE_GUARD_BILLING', 'guard_reconciliation', run.id,
    jsonb_build_object('runId', run.id, 'serviceDate', service), now()
  );
  RETURN jsonb_build_object('status','success','runId', run.id, 'serviceDate', service, 'outboxId', outbox, 'duplicate', false);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO run FROM public.guard_reconciliation_runs WHERE service_date = service;
  RETURN jsonb_build_object('status','success','runId', run.id, 'serviceDate', service, 'duplicate', true);
END; $$;

CREATE FUNCTION public.guard_reconcile_billing_v1(p_run uuid, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  run public.guard_reconciliation_runs; sub public.guard_subscriptions; cov public.guard_coverages;
  bill public.guard_billing; offer public.guard_price_change_offers; policy public.guard_reminder_policies;
  mismatches integer := 0; payload jsonb; paid_through timestamptz;
BEGIN
  payload := coalesce(p_payload, '{}'::jsonb);
  SELECT * INTO run FROM public.guard_reconciliation_runs WHERE id = p_run FOR UPDATE;
  IF run.id IS NULL THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  FOR sub IN SELECT * FROM public.guard_subscriptions WHERE lifecycle_state NOT IN ('ENDED') FOR UPDATE
  LOOP
    IF sub.stripe_subscription_id IS NULL AND sub.lifecycle_state IN ('ACTIVE','PAST_DUE','CANCEL_AT_PERIOD_END','INCOMPLETE') THEN
      INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
      VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_SUBSCRIPTION_MISSING', jsonb_build_object('lifecycle', sub.lifecycle_state));
      mismatches := mismatches + 1;
      PERFORM admin_private.guard_subscription_append_v1(sub.id, 'SYSTEM', NULL, 'RECONCILIATION_MISMATCH', sub.lifecycle_state, sub.lifecycle_state,
        'Local subscription is missing a provider subscription', '{}'::jsonb);
    END IF;
    IF NULLIF(payload->>'stripePriceId','') IS NOT NULL AND payload->>'stripePriceId' IS DISTINCT FROM sub.stripe_price_id
      AND (payload->>'guardSubscriptionId')::uuid IS NOT DISTINCT FROM sub.id
    THEN
      INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
      VALUES (run.id, sub.id, sub.coverage_id, 'PROVIDER_PRICE_MISMATCH', jsonb_build_object('expected', sub.stripe_price_id, 'actual', payload->>'stripePriceId'));
      mismatches := mismatches + 1;
    END IF;
    IF coalesce(NULLIF(payload->>'quantity','')::integer, 1) <> 1 AND (payload->>'guardSubscriptionId')::uuid IS NOT DISTINCT FROM sub.id THEN
      INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
      VALUES (run.id, sub.id, sub.coverage_id, 'QUANTITY_NOT_ONE', jsonb_build_object('quantity', payload->>'quantity'));
      mismatches := mismatches + 1;
    END IF;
    IF NULLIF(payload->>'livemode','') = 'true' THEN
      INSERT INTO public.guard_reconciliation_issues(run_id, subscription_id, coverage_id, code, details)
      VALUES (run.id, sub.id, sub.coverage_id, 'UNEXPECTED_LIVE_MODE', '{}'::jsonb);
      mismatches := mismatches + 1;
    END IF;
    IF sub.coverage_id IS NOT NULL THEN
      SELECT * INTO bill FROM public.guard_billing WHERE coverage_id = sub.coverage_id FOR UPDATE;
      SELECT * INTO cov FROM public.guard_coverages WHERE id = sub.coverage_id FOR UPDATE;
      paid_through := bill.paid_through_at;
      IF bill.entitlement_source = 'PROVIDER' AND paid_through IS NOT NULL AND paid_through <= now()
        AND bill.billing_state IN ('CURRENT','PAST_DUE')
      THEN
        UPDATE public.guard_billing SET billing_state = 'PAUSED', record_version = record_version + 1, updated_at = now()
          WHERE coverage_id = cov.id;
        IF cov.state = 'ACTIVE' THEN
          PERFORM admin_private.guard_transition_coverage_v1(cov.id, 'PAUSED', 'SYSTEM', NULL, 'PAUSED_FOR_ENTITLEMENT',
            'Paid-through entitlement expired without a confirmed renewal');
        END IF;
      END IF;
      IF sub.lifecycle_state = 'CANCELED' AND (bill.paid_through_at IS NULL OR bill.paid_through_at <= now())
        AND cov.state IN ('ACTIVE','PAUSED','ENDING')
      THEN
        IF cov.state IN ('ACTIVE','PAUSED') THEN
          cov := admin_private.guard_transition_coverage_v1(cov.id, 'ENDING', 'SYSTEM', NULL, 'ENDED_FOR_CANCELLATION', 'Provider subscription canceled at period end');
        END IF;
        IF cov.state = 'ENDING' THEN
          PERFORM admin_private.guard_transition_coverage_v1(cov.id, 'ENDED', 'SYSTEM', NULL, 'ENDED_FOR_CANCELLATION', 'Coverage ended after cancellation');
        END IF;
        UPDATE public.guard_billing SET billing_state = 'ENDED', record_version = record_version + 1, updated_at = now()
          WHERE coverage_id = cov.id;
        UPDATE public.guard_subscriptions SET lifecycle_state = 'ENDED' WHERE id = sub.id AND lifecycle_state = 'CANCELED';
      END IF;
    END IF;
  END LOOP;

  FOR cov IN SELECT * FROM public.guard_coverages WHERE coverage_basis = 'INCLUDED' AND state IN ('ACTIVE','PAUSED','ENDING') AND included_end_at IS NOT NULL AND included_end_at <= now() FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.guard_continuations c
      WHERE c.included_coverage_id = cov.id AND c.status = 'HANDED_OFF'
    ) THEN
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.guard_continuations c
      JOIN public.guard_subscription_invoices i ON i.subscription_id IN (
        SELECT s.id FROM public.guard_subscriptions s WHERE s.continuation_id = c.id AND s.lifecycle_state NOT IN ('CANCELED','ENDED')
      ) AND i.status = 'PAID'
      WHERE c.included_coverage_id = cov.id
    ) THEN
      CONTINUE;
    END IF;
    IF cov.state IN ('ACTIVE','PAUSED') THEN
      cov := admin_private.guard_transition_coverage_v1(cov.id, 'ENDING', 'SYSTEM', NULL, 'INCLUDED_ENDED', 'Included period expired without paid continuation');
    END IF;
    IF cov.state = 'ENDING' THEN
      cov := admin_private.guard_transition_coverage_v1(cov.id, 'ENDED', 'SYSTEM', NULL, 'INCLUDED_ENDED', 'Included period expired without paid continuation');
    END IF;
    UPDATE public.guard_billing SET updated_at = now()
      WHERE coverage_id = cov.id AND entitlement_source = 'INCLUDED';
  END LOOP;

  SELECT * INTO policy FROM public.guard_reminder_policies WHERE status = 'ENABLED' ORDER BY created_at DESC LIMIT 1;
  IF policy.id IS NOT NULL THEN
    INSERT INTO public.guard_reminder_records(coverage_id, policy_id, offset_days, due_at, status)
    SELECT g.id, policy.id, off, g.included_end_at - (off || ' days')::interval, 'DUE'
    FROM public.guard_coverages g
    CROSS JOIN unnest(policy.offsets_days) AS off
    WHERE g.coverage_basis = 'INCLUDED' AND g.state = 'ACTIVE' AND g.included_end_at IS NOT NULL
      AND g.included_end_at - (off || ' days')::interval <= now()
    ON CONFLICT (coverage_id, policy_id, offset_days) DO NOTHING;
  END IF;

  UPDATE public.guard_reconciliation_runs
    SET status = 'COMPLETED', completed_at = now(), mismatch_count = mismatches
    WHERE id = run.id;
  RETURN jsonb_build_object('status','success','runId', run.id, 'mismatchCount', mismatches, 'serviceDate', run.service_date);
END; $$;

ALTER FUNCTION public.admin_guard_list_v1(text) RENAME TO admin_guard_list_core_v1;
ALTER FUNCTION public.admin_guard_list_core_v1(text) SET SCHEMA admin_private;
REVOKE ALL ON FUNCTION admin_private.admin_guard_list_core_v1(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_guard_list_v1(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; core jsonb;
BEGIN
  core := admin_private.admin_guard_list_core_v1(p_token);
  IF core IS NULL THEN RETURN NULL; END IF;
  SELECT core || jsonb_build_object(
    'subscriptions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'locationId', s.location_id, 'coverageId', s.coverage_id, 'continuationId', s.continuation_id,
        'customerId', s.customer_id, 'businessId', s.business_id, 'serviceOrderId', s.service_order_id,
        'locationName', loc.location_name, 'customerName', c.full_name, 'businessName', b.display_name,
        'lifecycleState', s.lifecycle_state, 'providerStatus', s.provider_status, 'amountMinor', s.amount_minor,
        'currency', s.currency, 'stripePriceId', s.stripe_price_id, 'stripeSubscriptionId', s.stripe_subscription_id,
        'paidThroughAt', bill.paid_through_at, 'billingState', bill.billing_state, 'coverageState', g.state,
        'currentPeriodEnd', s.current_period_end, 'cancelAtPeriodEnd', s.cancel_at_period_end,
        'latestPaidInvoiceId', s.latest_paid_invoice_id, 'latestInvoiceFailure', s.latest_invoice_failure,
        'priceChangeStatus', offer.status, 'disputeStatus', d.provider_status, 'refundStatus', r.status,
        'reconciliationOpen', EXISTS (
          SELECT 1 FROM public.guard_reconciliation_issues i
          JOIN public.guard_reconciliation_runs run ON run.id = i.run_id
          WHERE i.subscription_id = s.id AND run.service_date = (timezone('Europe/London', now()))::date
        ),
        'version', s.record_version
      ) ORDER BY s.created_at DESC)
      FROM public.guard_subscriptions s
      JOIN public.customers c ON c.id = s.customer_id
      JOIN public.businesses b ON b.id = s.business_id
      JOIN public.locations loc ON loc.id = s.location_id
      LEFT JOIN public.guard_coverages g ON g.id = s.coverage_id
      LEFT JOIN public.guard_billing bill ON bill.coverage_id = s.coverage_id
      LEFT JOIN public.guard_price_change_offers offer ON offer.subscription_id = s.id AND offer.status IN ('OFFERED','ACCEPTED','SCHEDULED')
      LEFT JOIN LATERAL (
        SELECT provider_status FROM public.guard_disputes x WHERE x.subscription_id = s.id ORDER BY opened_at DESC LIMIT 1
      ) d ON true
      LEFT JOIN LATERAL (
        SELECT status FROM public.guard_refunds y WHERE y.subscription_id = s.id ORDER BY created_at DESC LIMIT 1
      ) r ON true
    ), '[]'::jsonb),
    'continuations', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'includedCoverageId', n.included_coverage_id, 'serviceOrderId', n.service_order_id,
        'status', n.status, 'locationId', n.location_id, 'scheduledStartAt', n.scheduled_start_at, 'version', n.record_version
      ) ORDER BY n.created_at DESC)
      FROM public.guard_continuations n
    ), '[]'::jsonb),
    'reminders', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', rem.id, 'coverageId', rem.coverage_id, 'offsetDays', rem.offset_days, 'dueAt', rem.due_at, 'status', rem.status
      ) ORDER BY rem.due_at)
      FROM public.guard_reminder_records rem WHERE rem.status = 'DUE'
    ), '[]'::jsonb),
    'adjustments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', adj.id, 'subscriptionId', adj.subscription_id, 'kind', adj.kind, 'status', adj.status,
        'amountMinor', adj.amount_minor, 'approvedAmountMinor', adj.approved_amount_minor
      ) ORDER BY adj.created_at DESC)
      FROM public.guard_billing_adjustments adj
      WHERE adj.status IN ('REQUESTED','APPROVED','SUBMITTED','FAILED','PENDING_APPLICATION')
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_action_session_v1(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sess admin_private.customer_action_sessions; a public.customer_actions; v public.agreement_versions;
  auth public.authorization_records; cs public.cases; b public.businesses; loc public.locations;
  qv public.quote_versions; snap public.quote_discount_snapshots; ord public.service_orders;
  ob public.payment_obligations; consent public.payment_consents; inv public.payment_invoices;
  cov public.guard_coverages; off public.guard_included_offers; sub public.guard_subscriptions;
  gconsent public.guard_recurring_consents; offer public.guard_price_change_offers;
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
    SELECT * INTO inv FROM public.payment_invoices WHERE id = a.payment_invoice_id;
  END IF;
  IF a.guard_coverage_id IS NOT NULL THEN
    SELECT * INTO cov FROM public.guard_coverages WHERE id = a.guard_coverage_id;
    SELECT * INTO off FROM public.guard_included_offers WHERE id = a.guard_included_offer_id;
  END IF;
  IF a.guard_subscription_id IS NOT NULL THEN SELECT * INTO sub FROM public.guard_subscriptions WHERE id = a.guard_subscription_id; END IF;
  IF sub.id IS NULL AND a.kind = 'GUARD_SUBSCRIPTION_START' THEN
    SELECT * INTO sub FROM public.guard_subscriptions
      WHERE (coverage_id IS NOT DISTINCT FROM a.guard_coverage_id OR continuation_id IS NOT DISTINCT FROM a.guard_continuation_id)
        AND lifecycle_state NOT IN ('CANCELED','ENDED')
      LIMIT 1;
  END IF;
  IF sub.id IS NOT NULL THEN SELECT * INTO gconsent FROM public.guard_recurring_consents WHERE subscription_id = sub.id; END IF;
  IF a.guard_price_change_offer_id IS NOT NULL THEN SELECT * INTO offer FROM public.guard_price_change_offers WHERE id = a.guard_price_change_offer_id; END IF;
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
      'consentText', admin_private.success_fee_consent_text_v1(), 'consentVersion', 'SUCCESS_FEE_CONSENT_V1',
      'invoiceId', inv.id, 'invoiceStatus', inv.status, 'hostedInvoiceUrl', inv.hosted_invoice_url
    ) END,
    'guard', CASE WHEN cov.id IS NULL THEN NULL ELSE jsonb_build_object(
      'coverageId', cov.id, 'coverageBasis', cov.coverage_basis, 'permissionVersion', 'GUARD_PERMISSION_V1',
      'permissionText', admin_private.guard_permission_text_v1(cov.coverage_basis),
      'includedDays', CASE WHEN cov.coverage_basis = 'INCLUDED' THEN 30 ELSE NULL END,
      'includedOfferId', off.id, 'includedOfferStatus', off.status,
      'includedEndAt', cov.included_end_at
    ) END,
    'subscription', CASE WHEN sub.id IS NULL THEN NULL ELSE jsonb_build_object(
      'subscriptionId', sub.id, 'amountMinor', sub.amount_minor, 'currency', sub.currency, 'frequency', 'MONTHLY',
      'taxBehaviour', sub.tax_behaviour, 'consentVersion', 'GUARD_RECURRING_CONSENT_V1',
      'consentText', admin_private.guard_recurring_consent_text_v1(),
      'cancellationTermsVersion', 'GUARD_CANCELLATION_TERMS_V1',
      'cancellationTermsText', admin_private.guard_cancellation_terms_text_v1(),
      'consentId', gconsent.id, 'locationName', loc.location_name, 'lifecycleState', sub.lifecycle_state,
      'paidThroughAt', (SELECT paid_through_at FROM public.guard_billing WHERE coverage_id = sub.coverage_id),
      'cancelAtPeriodEnd', sub.cancel_at_period_end, 'includedEndAt', cov.included_end_at
    ) END,
    'priceChange', CASE WHEN offer.id IS NULL THEN NULL ELSE jsonb_build_object(
      'offerId', offer.id, 'oldAmountMinor', offer.old_amount_minor, 'newAmountMinor', offer.new_amount_minor,
      'currency', offer.currency, 'effectiveRenewalAt', offer.effective_renewal_at,
      'noticeVersion', offer.notice_version, 'noticeText', offer.notice_text, 'status', offer.status
    ) END
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_guard_command_v1(text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_guard_list_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_action_session_v1(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_guard_subscription_command_v1(text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_apply_subscription_event_v1(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_record_provider_refs_v1(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_record_provider_price_map_v1(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_record_refund_v1(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_enqueue_daily_reconcile_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_reconcile_billing_v1(uuid, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_guard_command_v1(text, uuid, text, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_guard_list_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_command_v1(text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_action_session_v1(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.customer_guard_subscription_command_v1(text, uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_apply_subscription_event_v1(text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_record_provider_refs_v1(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_record_provider_price_map_v1(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_record_refund_v1(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_enqueue_daily_reconcile_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_reconcile_billing_v1(uuid, jsonb) TO service_role;

COMMIT;




